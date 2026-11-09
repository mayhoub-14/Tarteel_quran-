import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDocsFromServer, collection, writeBatch, deleteDoc } from 'firebase/firestore';
import type { DatabaseSchema } from './db.ts';

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export interface MigrationReport {
  timestamp: string;
  success: boolean;
  counts: {
    profiles: number;
    students: number;
    lessons: number;
    lessonExceptions: number;
    certificateTemplates: number;
    generatedCertificates: number;
    aiUsageLogs: number;
    auditLogs: number;
    payrollRequests: number;
    settings: number;
  };
  details: string[];
}

export async function migrateDataToFirestore(sourceData?: DatabaseSchema): Promise<MigrationReport> {
  const details: string[] = [];
  const counts = {
    profiles: 0,
    students: 0,
    lessons: 0,
    lessonExceptions: 0,
    certificateTemplates: 0,
    generatedCertificates: 0,
    aiUsageLogs: 0,
    auditLogs: 0,
    payrollRequests: 0,
    settings: 0
  };

  let data = sourceData;
  if (!data) {
    const dbPath = path.resolve(process.cwd(), 'data', 'database.json');
    if (fs.existsSync(dbPath)) {
      data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
  }

  if (!data) {
    throw new Error('No source data found to migrate to Firestore.');
  }

  details.push(`Starting migration from local JSON to Firestore (Database: ${firebaseConfig.firestoreDatabaseId})...`);

  // Helper to migrate an array of entities with batching
  async function migrateCollection<T extends { id?: string }>(
    colName: string,
    items: T[] = [],
    countKey: keyof typeof counts
  ) {
    if (!items || items.length === 0) return;
    
    // Firestore batches allow max 500 operations
    const chunkSize = 400;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const batch = writeBatch(firestoreDb);

      for (const item of chunk) {
        const docId = item.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const docRef = doc(firestoreDb, colName, docId);
        // Clean undefined properties for Firestore compatibility
        const cleanItem = JSON.parse(JSON.stringify(item));
        batch.set(docRef, cleanItem, { merge: true });
      }

      await batch.commit();
      counts[countKey] += chunk.length;
    }
    details.push(`Successfully migrated ${counts[countKey]} records to collection '${colName}'.`);
  }

  // 1. Profiles
  await migrateCollection('profiles', data.profiles, 'profiles');

  // 2. Students
  await migrateCollection('students', data.students, 'students');

  // 3. Lessons
  await migrateCollection('lessons', data.lessons, 'lessons');

  // 4. Lesson Exceptions
  await migrateCollection('lessonExceptions', data.lessonExceptions, 'lessonExceptions');

  // 5. Certificate Templates
  await migrateCollection('certificateTemplates', data.certificateTemplates, 'certificateTemplates');

  // 6. Generated Certificates
  await migrateCollection('generatedCertificates', data.generatedCertificates, 'generatedCertificates');

  // 7. AI Usage Logs
  await migrateCollection('aiUsageLogs', data.aiUsageLogs, 'aiUsageLogs');

  // 8. Audit Logs
  await migrateCollection('auditLogs', data.auditLogs, 'auditLogs');

  // 9. Payroll Requests
  await migrateCollection('payrollRequests', data.payrollRequests, 'payrollRequests');

  // 10. Settings
  if (data.settings) {
    const settingsRef = doc(firestoreDb, 'settings', 'global');
    const settingsPayload = {
      ...JSON.parse(JSON.stringify(data.settings)),
      _isDatabaseInitialized: true,
      lastUpdatedAt: new Date().toISOString()
    };
    await setDoc(settingsRef, settingsPayload, { merge: true });
    counts.settings = 1;
    details.push(`Successfully migrated settings with initialization marker to 'settings/global'.`);
  }

  const report: MigrationReport = {
    timestamp: new Date().toISOString(),
    success: true,
    counts,
    details
  };

  return report;
}

export interface FirestoreStateInspection {
  status: 'EMPTY' | 'FULLY_INITIALIZED' | 'PARTIALLY_POPULATED' | 'READ_ERROR';
  errorMessage?: string;
  counts: {
    profiles: number;
    students: number;
    lessons: number;
    lessonExceptions: number;
    certificateTemplates: number;
    generatedCertificates: number;
    aiUsageLogs: number;
    auditLogs: number;
    payrollRequests: number;
    settings: number;
  };
  hasAdminProfile: boolean;
  hasInitializedMarker: boolean;
  data: DatabaseSchema | null;
  lastUpdatedAt?: string;
}

/**
 * Robustly inspects the remote Firestore database state across all collections and initialization markers.
 * Accurately distinguishes between:
 * 1. Truly empty database (0 documents across all collections).
 * 2. Fully initialized database (contains valid profiles, admin account, settings, and passes consistency checks).
 * 3. Partially populated / inconsistent database (some collections exist, missing admin or core entities).
 * 4. Read error / connection failure.
 */
export async function inspectFirestoreDatabaseState(): Promise<FirestoreStateInspection> {
  try {
    async function getCollectionDocs<T>(colName: string): Promise<T[]> {
      const snap = await getDocsFromServer(collection(firestoreDb, colName));
      return snap.docs.map(d => d.data() as T);
    }

    const [
      profiles,
      students,
      lessons,
      lessonExceptions,
      certificateTemplates,
      generatedCertificates,
      aiUsageLogs,
      auditLogs,
      payrollRequests,
      settingsSnap
    ] = await Promise.all([
      getCollectionDocs<any>('profiles'),
      getCollectionDocs<any>('students'),
      getCollectionDocs<any>('lessons'),
      getCollectionDocs<any>('lessonExceptions'),
      getCollectionDocs<any>('certificateTemplates'),
      getCollectionDocs<any>('generatedCertificates'),
      getCollectionDocs<any>('aiUsageLogs'),
      getCollectionDocs<any>('auditLogs'),
      getCollectionDocs<any>('payrollRequests'),
      getDocsFromServer(collection(firestoreDb, 'settings'))
    ]);

    const counts = {
      profiles: profiles.length,
      students: students.length,
      lessons: lessons.length,
      lessonExceptions: lessonExceptions.length,
      certificateTemplates: certificateTemplates.length,
      generatedCertificates: generatedCertificates.length,
      aiUsageLogs: aiUsageLogs.length,
      auditLogs: auditLogs.length,
      payrollRequests: payrollRequests.length,
      settings: settingsSnap.docs.length
    };

    const totalDocs = Object.values(counts).reduce((a, b) => a + b, 0);

    // Case 1: Genuinely empty Firestore database
    if (totalDocs === 0) {
      return {
        status: 'EMPTY',
        counts,
        hasAdminProfile: false,
        hasInitializedMarker: false,
        data: null
      };
    }

    const globalDoc = settingsSnap.docs.find(d => d.id === 'global')?.data();
    const hasInitializedMarker = globalDoc?._isDatabaseInitialized === true;
    const hasAdminProfile = profiles.some(p => p.role === 'ADMIN' && p.status === 'ACTIVE');

    // Case 2: Fully initialized database
    // Requires: Valid profiles array, at least one active Admin profile, and settings document
    if (profiles.length > 0 && hasAdminProfile && (hasInitializedMarker || settingsSnap.docs.length > 0)) {
      const settingsData = globalDoc || {
        academyName: 'أكاديمية ترتيل القرآن الكريم',
        allowPublicTeacherRegistration: true,
        maxAiImagesPerTeacherPerDay: 5,
        maintenanceMode: false,
        defaultDisplayTimeZone: 'Africa/Cairo'
      };

      return {
        status: 'FULLY_INITIALIZED',
        counts,
        hasAdminProfile: true,
        hasInitializedMarker: true,
        lastUpdatedAt: globalDoc?.lastUpdatedAt,
        data: {
          profiles,
          students,
          lessons,
          lessonExceptions,
          certificateTemplates,
          generatedCertificates,
          aiUsageLogs,
          auditLogs,
          payrollRequests,
          settings: settingsData as any
        }
      };
    }

    // Case 3: Partially populated or inconsistent
    // (e.g. Some collections exist, but no Admin profile found, or missing critical structures)
    return {
      status: 'PARTIALLY_POPULATED',
      counts,
      hasAdminProfile,
      hasInitializedMarker,
      data: null,
      errorMessage: `Firestore contains ${totalDocs} records across collections, but lacks an active ADMIN profile or core metadata.`
    };

  } catch (err: any) {
    console.error('[Firestore] Error inspecting database state:', err);
    return {
      status: 'READ_ERROR',
      errorMessage: err?.message || String(err),
      counts: {
        profiles: 0,
        students: 0,
        lessons: 0,
        lessonExceptions: 0,
        certificateTemplates: 0,
        generatedCertificates: 0,
        aiUsageLogs: 0,
        auditLogs: 0,
        payrollRequests: 0,
        settings: 0
      },
      hasAdminProfile: false,
      hasInitializedMarker: false,
      data: null
    };
  }
}

// Function to fetch all collections from Firestore into memory
export async function loadDatabaseFromFirestore(): Promise<DatabaseSchema | null> {
  const inspection = await inspectFirestoreDatabaseState();
  if (inspection.status === 'FULLY_INITIALIZED' && inspection.data) {
    return inspection.data;
  }
  return null;
}

/**
 * Explicitly and atomically deletes a student and all their associated lessons from Firestore.
 * Prevents zombie records from reappearing when the server restarts or reloads from Firestore.
 */
export async function deleteStudentWithLessonsFromFirestore(
  studentId: string,
  associatedLessonIds: string[] = []
): Promise<void> {
  const batch = writeBatch(firestoreDb);

  // 1. Delete student document
  const studentRef = doc(firestoreDb, 'students', studentId);
  batch.delete(studentRef);

  // 2. Delete all associated lesson documents
  for (const lessonId of associatedLessonIds) {
    if (lessonId) {
      const lessonRef = doc(firestoreDb, 'lessons', lessonId);
      batch.delete(lessonRef);
    }
  }

  await batch.commit();
}

/**
 * Explicitly and atomically deletes an array of lesson documents from Firestore.
 * Used when a student's recurring schedule is replaced/updated so old lessons don't become zombies.
 */
export async function deleteLessonsFromFirestore(lessonIds: string[]): Promise<void> {
  if (!lessonIds || lessonIds.length === 0) return;

  const chunkSize = 400;
  for (let i = 0; i < lessonIds.length; i += chunkSize) {
    const chunk = lessonIds.slice(i, i + chunkSize);
    const batch = writeBatch(firestoreDb);
    for (const lid of chunk) {
      if (lid) {
        batch.delete(doc(firestoreDb, 'lessons', lid));
      }
    }
    await batch.commit();
  }
}

export type FirestoreCollectionName =
  | 'profiles'
  | 'students'
  | 'lessons'
  | 'lessonExceptions'
  | 'certificateTemplates'
  | 'generatedCertificates'
  | 'aiUsageLogs'
  | 'auditLogs'
  | 'payrollRequests'
  | 'settings';

export interface IncrementalChange {
  collection: FirestoreCollectionName;
  id: string;
  op: 'SET' | 'DELETE';
  data?: any;
  timestamp: number;
}

/**
 * Commits an array of granular, incremental changes directly to Firestore in batches.
 * Only writes or deletes the specifically modified documents without rewriting entire collections.
 */
export async function commitIncrementalChangesToFirestore(
  changes: IncrementalChange[]
): Promise<{ written: number; deleted: number }> {
  if (!changes || changes.length === 0) {
    return { written: 0, deleted: 0 };
  }

  let writtenCount = 0;
  let deletedCount = 0;
  const chunkSize = 400; // Under Firestore's 500 max batch size

  for (let i = 0; i < changes.length; i += chunkSize) {
    const chunk = changes.slice(i, i + chunkSize);
    const batch = writeBatch(firestoreDb);

    for (const change of chunk) {
      const docRef = doc(firestoreDb, change.collection, change.id);
      if (change.op === 'DELETE') {
        batch.delete(docRef);
        deletedCount++;
      } else if (change.op === 'SET' && change.data) {
        const cleanData = JSON.parse(JSON.stringify(change.data));
        batch.set(docRef, cleanData, { merge: true });
        writtenCount++;
      }
    }

    await batch.commit();
  }

  return { written: writtenCount, deleted: deletedCount };
}
