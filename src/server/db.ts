import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import {
  firestoreDb,
  migrateDataToFirestore,
  loadDatabaseFromFirestore,
  inspectFirestoreDatabaseState,
  commitIncrementalChangesToFirestore
} from './firestoreMigrator.ts';
import type {
  FirestoreStateInspection,
  IncrementalChange,
  FirestoreCollectionName
} from './firestoreMigrator.ts';

export interface UserProfile {
  id: string;
  fullName: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'ADMIN' | 'TEACHER';
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  gender?: 'MALE' | 'FEMALE';
  preferredTimeZone: string;
  passwordResetToken?: string;
  passwordResetExpires?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProgressStatus = 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED' | 'NEEDS_REVISION';

export interface QuranProgress {
  completedSurahs: string[];
  currentSurah: string;
  completedPortion: string;
  currentPortion?: string;
  remainingMemorization: string;
  revisionProgress: string;
  status: ProgressStatus;
  notes?: string;
  lastUpdated: string;
}

export interface TeacherAssignmentRecord {
  teacherId: string;
  teacherName: string;
  assignedAt: string;
  unassignedAt?: string;
  reason?: string;
}

export interface Student {
  id: string;
  teacherId: string;
  fullName: string;
  country: string;
  timeZone: string;
  durationMinutes: number; // 30 - 40 minutes strictly (default 30)
  studyDaysPerWeek?: number; // 1 - 7 days per week (4 episodes per day)
  completedEpisodes?: number[]; // completed episode numbers, e.g. [1, 2, 3]
  monthlyCompletedEpisodes?: { [monthKey: string]: number[] }; // monthly completion records
  quranProgress?: QuranProgress;
  assignmentHistory?: TeacherAssignmentRecord[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Lesson {
  id: string;
  studentId: string;
  teacherId: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  localTime: string; // HH:mm format (e.g. "16:30")
  timeZone: string; // e.g. "Africa/Cairo", "Asia/Riyadh", "Asia/Dubai"
  durationMinutes: number; // 30 - 40 minutes
  isRecurring: boolean;
  specificDate?: string;
  notes?: string;
  isCompleted?: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export interface LessonException {
  id: string;
  lessonId: string;
  teacherId: string;
  occurrenceDate: string; // YYYY-MM-DD
  exceptionType: 'CANCELLED' | 'RESCHEDULED';
  modifiedTime?: string; // HH:mm if rescheduled
  notes?: string;
  isCompleted?: boolean;
  reason?: string;
  createdAt: string;
}

export interface CertificateTemplateConfig {
  id: string;
  fileName: string;
  version: number;
  isActive: boolean;
  nameX: number; // X center coordinate (default 1000 on 2000px canvas)
  nameY: number; // Y coordinate (default 720)
  nameFontSize: number; // default 60
  nameColor: string; // default "#111827"
  achievementX: number; // default 1000
  achievementY: number; // default 810
  achievementFontSize: number; // default 36
  achievementColor: string; // default "#065f46"
  prefixText: string; // default "تقديرا لتفوقها في"
  maskX: number; // 350
  maskY: number; // 640
  maskWidth: number; // 1300
  maskHeight: number; // 210
  updatedAt: string;
}

export interface GeneratedCertificate {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherGender?: 'MALE' | 'FEMALE';
  studentName: string;
  achievement: string;
  templateVersion: number;
  createdAt: string;
}

export interface AiUsageLog {
  id: string;
  teacherId: string;
  prompt: string;
  status: 'SUCCESS' | 'FAILED' | 'LIMIT_EXCEEDED';
  details?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: 'USER' | 'STUDENT' | 'LESSON' | 'TEMPLATE' | 'SETTINGS';
  targetId: string;
  details: string;
  createdAt: string;
}

export interface SystemSettings {
  academyName: string;
  allowPublicTeacherRegistration: boolean;
  maxAiImagesPerTeacherPerDay: number;
  maintenanceMode: boolean;
  defaultDisplayTimeZone: string;
}

export type PayrollStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'PAID'
  | 'REJECTED'
  | 'RETURNED_FOR_CORRECTION';

export type PaymentMethod = 'INSTAPAY' | 'WALLET';

export interface StudentPayrollBreakdown {
  studentId: string;
  studentName: string;
  completedLessons: number;
  ratePerLesson: number; // 65 EGP
  totalAmount: number; // completedLessons * 65
}

export interface PayrollRequest {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  month: string; // YYYY-MM
  monthLabel: string; // e.g. "نوفمبر 2026"
  students: StudentPayrollBreakdown[];
  totalLessons: number;
  lessonRate: number; // 65 EGP
  totalSalary: number; // totalLessons * 65
  paymentMethod: PaymentMethod;
  paymentAccount: string;
  accountHolder: string;
  status: PayrollStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  actualPaymentDate?: string;
  reviewNotes?: string;
  emailSent: boolean;
  emailError?: string;
}

export interface DatabaseSchema {
  profiles: UserProfile[];
  students: Student[];
  lessons: Lesson[];
  lessonExceptions: LessonException[];
  certificateTemplates: CertificateTemplateConfig[];
  generatedCertificates: GeneratedCertificate[];
  payrollRequests: PayrollRequest[];
  aiUsageLogs: AiUsageLog[];
  auditLogs: AuditLog[];
  settings: SystemSettings;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const BACKUP_FILE = path.join(DATA_DIR, 'database.backup.json');

function ensureDataDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getInitialDatabase(): DatabaseSchema {
  // Hash for initial accounts: password "Tarteel@2026"
  const defaultSalt = bcrypt.genSaltSync(10);
  const adminPasswordHash = bcrypt.hashSync('TarteelAdmin2026!', defaultSalt);
  const teacherPasswordHash = bcrypt.hashSync('Teacher2026!', defaultSalt);

  const initialProfiles: UserProfile[] = [
    {
      id: 'admin-tarteel-root',
      fullName: 'مدير أكاديمية ترتيل - الإدارة العامة',
      username: 'amyhoub7',
      email: 'amyhoub7@gmail.com',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      preferredTimeZone: 'Africa/Cairo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'teacher-sheikh-mohamed',
      fullName: 'الشيخ محمد عبد الرحمن',
      username: 'mohamed_tarteel',
      email: 'm.abdelrahman@tarteel-academy.org',
      passwordHash: teacherPasswordHash,
      role: 'TEACHER',
      status: 'ACTIVE',
      preferredTimeZone: 'Africa/Cairo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'teacher-sheikha-sarah',
      fullName: 'الأستاذة سارة أحمد الكردي',
      username: 'sarah_kordi',
      email: 's.kordi@example.com',
      passwordHash: teacherPasswordHash,
      role: 'TEACHER',
      status: 'PENDING',
      preferredTimeZone: 'Asia/Riyadh',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ];

  const initialTemplate: CertificateTemplateConfig = {
    id: 'tarteel-official-template-v1',
    fileName: '/tarteel-certificate-clean-template.png',
    version: 1,
    isActive: true,
    nameX: 1000,
    nameY: 746,
    nameFontSize: 72,
    nameColor: '#0a0a0a',
    achievementX: 1000,
    achievementY: 857,
    achievementFontSize: 40,
    achievementColor: '#008037',
    prefixText: 'تقديراً لتفوقها في',
    maskX: 480,
    maskY: 670,
    maskWidth: 1040,
    maskHeight: 220,
    updatedAt: new Date().toISOString(),
  };

  const initialStudents: Student[] = [
    {
      id: 'student-noura',
      teacherId: 'teacher-sheikh-mohamed',
      fullName: 'نورة خالد صالح الرشيد',
      country: 'المملكة العربية السعودية',
      timeZone: 'Asia/Riyadh',
      durationMinutes: 30,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'student-ahmed',
      teacherId: 'teacher-sheikh-mohamed',
      fullName: 'أحمد محمود العلي',
      country: 'مصر',
      timeZone: 'Africa/Cairo',
      durationMinutes: 35,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'student-omar',
      teacherId: 'teacher-sheikh-mohamed',
      fullName: 'عمر سلطان الشامسي',
      country: 'الإمارات العربية المتحدة',
      timeZone: 'Asia/Dubai',
      durationMinutes: 40,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ];

  const initialLessons: Lesson[] = [
    {
      id: 'lesson-1',
      studentId: 'student-noura',
      teacherId: 'teacher-sheikh-mohamed',
      dayOfWeek: 0, // Sunday
      localTime: '17:00', // 17:00 Riyadh (16:00 Cairo)
      timeZone: 'Asia/Riyadh',
      durationMinutes: 30,
      isRecurring: true,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'lesson-2',
      studentId: 'student-noura',
      teacherId: 'teacher-sheikh-mohamed',
      dayOfWeek: 2, // Tuesday
      localTime: '17:00', // 17:00 Riyadh
      timeZone: 'Asia/Riyadh',
      durationMinutes: 30,
      isRecurring: true,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'lesson-3',
      studentId: 'student-ahmed',
      teacherId: 'teacher-sheikh-mohamed',
      dayOfWeek: 1, // Monday
      localTime: '18:00', // 18:00 Cairo
      timeZone: 'Africa/Cairo',
      durationMinutes: 35,
      isRecurring: true,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'lesson-4',
      studentId: 'student-omar',
      teacherId: 'teacher-sheikh-mohamed',
      dayOfWeek: 3, // Wednesday
      localTime: '19:00', // 19:00 Dubai (17:00 Cairo)
      timeZone: 'Asia/Dubai',
      durationMinutes: 40,
      isRecurring: true,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ];

  const initialAuditLogs: AuditLog[] = [
    {
      id: 'log-init-1',
      actorId: 'admin-tarteel-root',
      actorName: 'مدير أكاديمية ترتيل',
      action: 'SYSTEM_INITIALIZED',
      targetType: 'SETTINGS',
      targetId: 'system',
      details: 'تم تهيئة بوابة معلمي أكاديمية ترتيل القرآن الكريم بنجاح وتفعيل القالب الرسمي للشهادات',
      createdAt: new Date().toISOString(),
    }
  ];

  return {
    profiles: initialProfiles,
    students: initialStudents,
    lessons: initialLessons,
    lessonExceptions: [],
    certificateTemplates: [initialTemplate],
    generatedCertificates: [
      {
        id: 'cert-sample-1',
        teacherId: 'teacher-sheikh-mohamed',
        teacherName: 'الشيخ محمد عبد الرحمن',
        studentName: 'نورة خالد صالح الرشيد',
        achievement: 'حفظ جزء عم',
        templateVersion: 1,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      }
    ],
    payrollRequests: [],
    aiUsageLogs: [],
    auditLogs: initialAuditLogs,
    settings: {
      academyName: 'أكاديمية ترتيل القرآن الكريم',
      allowPublicTeacherRegistration: true,
      maxAiImagesPerTeacherPerDay: 5,
      maintenanceMode: false,
      defaultDisplayTimeZone: 'Africa/Cairo',
    }
  };
}

class Database {
  private data: DatabaseSchema;
  private lastSnapshot: DatabaseSchema;
  private initPromise: Promise<void> = Promise.resolve();
  private isFirestoreConnected: boolean = false;
  private firestoreInspection: FirestoreStateInspection | null = null;
  private syncTimeout: NodeJS.Timeout | null = null;
  private isSyncBlocked: boolean = false;
  private syncBlockReason: string | null = null;

  constructor() {
    ensureDataDirectory();
    // 1. Initial synchronous load from local JSON cache for fast boot
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
        if (!Array.isArray(this.data.payrollRequests)) {
          this.data.payrollRequests = [];
        }
      } catch (err) {
        console.error('Error reading database file, loading fallback:', err);
        this.data = getInitialDatabase();
        this.saveLocal();
      }
    } else {
      this.data = getInitialDatabase();
      this.saveLocal();
    }

    this.lastSnapshot = JSON.parse(JSON.stringify(this.data));
    // 2. Asynchronously initialize and synchronize with live Firestore
    this.initPromise = this.initFirestore();
  }

  /**
   * Safely initializes and evaluates the Firestore database state on startup.
   * Prevents overwriting valid local data or replacing local data with incomplete/stale remote data.
   */
  private async initFirestore() {
    try {
      // Step A: Deep inspection of remote Firestore
      const inspection = await inspectFirestoreDatabaseState();
      this.firestoreInspection = inspection;

      switch (inspection.status) {
        case 'FULLY_INITIALIZED': {
          if (!inspection.data) {
            console.warn('[Firestore] Inspection marked FULLY_INITIALIZED but returned no data object.');
            return;
          }

          // Safety Check: Never replace a valid local database with a cloud dataset that has fewer students
          // or is missing critical profiles, unless cloud is proven newer or local is pure fallback.
          const localStudentsCount = this.data.students?.length || 0;
          const cloudStudentsCount = inspection.data.students?.length || 0;

          // If local has active students and cloud has zero students, do NOT blindly wipe local students
          if (localStudentsCount > 0 && cloudStudentsCount === 0) {
            this.isSyncBlocked = true;
            this.syncBlockReason = 'Ambiguous state: Local database contains active students while Firestore has 0 students. Halting auto-overwrite.';
            console.error(`[Firestore Safety Alert] ${this.syncBlockReason}`);
            return;
          }

          // Cloud is fully verified: safely load cloud data into memory and update local cache
          this.data = inspection.data;
          this.lastSnapshot = JSON.parse(JSON.stringify(this.data));
          this.isFirestoreConnected = true;
          this.isSyncBlocked = false;
          this.syncBlockReason = null;
          this.saveLocal();
          console.log('[Firestore] Live database successfully verified, connected, and loaded into memory.');
          break;
        }

        case 'EMPTY': {
          // Genuinely new, empty Firestore database: safe to upload current local database
          console.log('[Firestore] Server-confirmed empty Firestore database. Bootstrapping only the existing active admin profile and academy settings; test teachers, students, lessons, and logs are intentionally excluded.');
          const adminProfiles = (this.data.profiles || []).filter(
            profile => profile.id === 'admin-tarteel-root' &&
              profile.role === 'ADMIN' &&
              profile.status === 'ACTIVE'
          );
          if (adminProfiles.length !== 1) {
            this.isFirestoreConnected = false;
            this.isSyncBlocked = true;
            this.syncBlockReason = 'Firestore is empty and the expected active root admin profile is unavailable in the local seed. No data was migrated.';
            console.error('[Firestore Safety Alert] ' + this.syncBlockReason);
            return;
          }
          const bootstrapData: DatabaseSchema = {
            ...this.data,
            profiles: adminProfiles,
            students: [],
            lessons: [],
            lessonExceptions: [],
            certificateTemplates: [],
            generatedCertificates: [],
            payrollRequests: [],
            aiUsageLogs: [],
            auditLogs: []
          };
          await migrateDataToFirestore(bootstrapData);
          this.data = bootstrapData;
          this.lastSnapshot = JSON.parse(JSON.stringify(bootstrapData));
          this.isFirestoreConnected = true;
          this.isSyncBlocked = false;
          this.syncBlockReason = null;
          console.log('[Firestore] Initial database setup completed successfully.');
          break;
        }

        case 'PARTIALLY_POPULATED': {
          // Ambiguous or incomplete database state:
          // NEVER upload local database over it (risk of overwriting).
          // NEVER replace local database with it (risk of data loss).
          this.isFirestoreConnected = false;
          this.isSyncBlocked = true;
          this.syncBlockReason = inspection.errorMessage || 'Firestore database is partially populated or in an inconsistent state.';
          console.error(`[Firestore Safety Warning] ${this.syncBlockReason}. Automatic migration halted. Preserving local JSON data and cloud state.`);
          break;
        }

        case 'READ_ERROR': {
          // Connection or permission failure:
          // Fall back gracefully to local JSON cache without wiping or modifying anything.
          this.isFirestoreConnected = false;
          this.isSyncBlocked = true;
          this.syncBlockReason = `Firestore read failure: ${inspection.errorMessage}`;
          console.warn(`[Firestore Offline] Operating in offline mode using local JSON cache. (${this.syncBlockReason})`);
          break;
        }
      }
    } catch (err) {
      this.isFirestoreConnected = false;
      this.isSyncBlocked = true;
      this.syncBlockReason = `Unexpected error during Firestore init: ${err}`;
      console.warn('[Firestore] Notice during Firestore init:', err);
    }
  }

  /** Wait until the first authoritative Firestore inspection has completed. */
  public async waitForInitialization(): Promise<void> {
    await this.initPromise;
  }

  public get(): DatabaseSchema {
    return this.data;
  }

  public isConnectedToFirestore(): boolean {
    return this.isFirestoreConnected;
  }

  public getInspectionStatus(): FirestoreStateInspection | null {
    return this.firestoreInspection;
  }

  public isSyncDisabled(): { blocked: boolean; reason: string | null } {
    return {
      blocked: this.isSyncBlocked,
      reason: this.syncBlockReason
    };
  }

  private pendingChanges = new Map<string, IncrementalChange>();
  private isSyncing = false;

  private saveLocal(): void {
    // Vercel deployment files are immutable. Firestore is the production source
    // of truth; never attempt to persist mutable state into /var/task.
    if (process.env.VERCEL === '1') return;
    ensureDataDirectory();
    try {
      const serialized = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(DB_FILE, serialized, 'utf8');
      // Create a backup copy atomically
      fs.writeFileSync(BACKUP_FILE, serialized, 'utf8');
    } catch (err) {
      console.error('Failed to save local database file:', err);
    }
  }

  /**
   * Records a granular create/update operation for a specific document.
   * Multiple rapid changes to the same document are automatically coalesced.
   */
  public recordChange(collection: FirestoreCollectionName, id: string, data?: any): void {
    const key = `${collection}:${id}`;
    // If not explicitly provided, resolve from memory
    let resolvedData = data;
    if (!resolvedData && collection !== 'settings') {
      const list = (this.data as any)[collection];
      if (Array.isArray(list)) {
        resolvedData = list.find((item: any) => item.id === id);
      }
    } else if (!resolvedData && collection === 'settings') {
      resolvedData = this.data.settings;
    }

    if (resolvedData) {
      this.pendingChanges.set(key, {
        collection,
        id,
        op: 'SET',
        data: resolvedData,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Records an explicit deletion operation for a specific document.
   * Overrides any prior pending SET for this document so it won't be re-created.
   */
  public recordDeletion(collection: FirestoreCollectionName, id: string): void {
    const key = `${collection}:${id}`;
    this.pendingChanges.set(key, {
      collection,
      id,
      op: 'DELETE',
      timestamp: Date.now()
    });
  }

  private trackDatabaseDiff(): void {
    const collections: FirestoreCollectionName[] = [
      'profiles', 'students', 'lessons', 'lessonExceptions',
      'certificateTemplates', 'generatedCertificates', 'payrollRequests',
      'aiUsageLogs', 'auditLogs'
    ];
    for (const collection of collections) {
      const previous = new Map<string, any>(((this.lastSnapshot as any)[collection] || []).map((item: any) => [item.id, item]));
      const current = new Map<string, any>(((this.data as any)[collection] || []).map((item: any) => [item.id, item]));
      for (const [id, item] of current) {
        const oldItem = previous.get(id);
        if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) this.recordChange(collection, id, item);
      }
      for (const id of previous.keys()) if (!current.has(id)) this.recordDeletion(collection, id);
    }
    if (JSON.stringify(this.lastSnapshot.settings) !== JSON.stringify(this.data.settings)) {
      this.recordChange('settings', 'system', this.data.settings);
    }
    this.lastSnapshot = JSON.parse(JSON.stringify(this.data));
  }

  /** Wait for Firestore confirmation before an API response reports success. */
  public async saveAndSync(): Promise<void> {
    await this.initPromise;
    this.trackDatabaseDiff();
    if (this.pendingChanges.size === 0) return;
    this.saveLocal();
    if (this.syncTimeout) { clearTimeout(this.syncTimeout); this.syncTimeout = null; }
    if (this.isSyncBlocked) throw new Error(`Firestore sync blocked: ${this.syncBlockReason || 'unknown state'}`);
    while (this.isSyncing) await new Promise(resolve => setTimeout(resolve, 25));
    if (this.pendingChanges.size === 0) return;
    this.isSyncing = true;
    const changes = Array.from(this.pendingChanges.values());
    try {
      await commitIncrementalChangesToFirestore(changes);
      for (const change of changes) {
        const key = `${change.collection}:${change.id}`;
        const queued = this.pendingChanges.get(key);
        if (queued && queued.timestamp <= change.timestamp) this.pendingChanges.delete(key);
      }
      this.isFirestoreConnected = true;
    } catch (error) {
      console.error('[Firestore] Request-time persistence failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Saves local JSON atomically and schedules debounced incremental push to Firestore.
   * Optionally tracks a specific changed or deleted document.
   */
  public save(change?: { collection: FirestoreCollectionName; id: string; op?: 'SET' | 'DELETE'; data?: any }): void {
    this.trackDatabaseDiff();
    // 1. Immediately update local JSON file & backup
    this.saveLocal();

    // 2. Track incremental change if specified
    if (change) {
      if (change.op === 'DELETE') {
        this.recordDeletion(change.collection, change.id);
      } else {
        this.recordChange(change.collection, change.id, change.data);
      }
    }

    // 3. Debounce push to Firestore (1.5s window) to conserve free tier quotas
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    this.syncTimeout = setTimeout(() => {
      this.syncToFirestore().catch(err => {
        console.error('[Firestore] Background sync error:', err);
      });
    }, 1500);
  }

  /**
   * Commits only the pending changed documents incrementally to Firestore.
   * If there are no pending changes, skips writes completely to avoid quota burn.
   * Retains pending changes in memory upon transient failure for automatic retry.
   */
  public async syncToFirestore(): Promise<void> {
    if (this.isSyncBlocked) {
      console.warn(`[Firestore Sync Prevented] Cloud sync is blocked due to safety state: ${this.syncBlockReason}`);
      return;
    }

    if (this.pendingChanges.size === 0) {
      // Zero changed documents: skip write completely!
      return;
    }

    if (this.isSyncing) {
      // Re-schedule if a sync is already running
      if (this.syncTimeout) clearTimeout(this.syncTimeout);
      this.syncTimeout = setTimeout(() => this.syncToFirestore(), 500);
      return;
    }

    this.isSyncing = true;
    // Snapshot changes currently queued to commit
    const toCommit = Array.from(this.pendingChanges.values());

    try {
      const result = await commitIncrementalChangesToFirestore(toCommit);
      // Remove successfully committed items from pending queue
      for (const change of toCommit) {
        const key = `${change.collection}:${change.id}`;
        const currentInQueue = this.pendingChanges.get(key);
        // Only delete if it wasn't modified with a newer timestamp while we were committing
        if (currentInQueue && currentInQueue.timestamp <= change.timestamp) {
          this.pendingChanges.delete(key);
        }
      }
      this.isFirestoreConnected = true;
      console.log(`[Firestore Incremental Sync] Successfully committed ${result.written} writes and ${result.deleted} deletes.`);
    } catch (err) {
      console.error('[Firestore] Error saving incremental changes to Firestore (will retry on next interval):', err);
      // Changes stay in pendingChanges map for safe retry!
    } finally {
      this.isSyncing = false;
    }
  }

  public getPendingChangesCount(): number {
    return this.pendingChanges.size;
  }

  public async reloadFromFirestore(): Promise<void> {
    try {
      const inspection = await inspectFirestoreDatabaseState();
      if (inspection.status === 'FULLY_INITIALIZED' && inspection.data) {
        this.data = inspection.data;
        this.lastSnapshot = JSON.parse(JSON.stringify(this.data));
        this.isFirestoreConnected = true;
        this.isSyncBlocked = false;
        this.syncBlockReason = null;
        this.pendingChanges.clear();
        this.saveLocal();
        console.log('[Firestore] Database safely reloaded from verified Firestore state.');
      } else {
        console.warn(`[Firestore Reload Prevented] Remote state is not FULLY_INITIALIZED (${inspection.status}): ${inspection.errorMessage || ''}`);
      }
    } catch (err) {
      console.error('[Firestore] Error reloading from Firestore:', err);
    }
  }
}

export const db = new Database();
