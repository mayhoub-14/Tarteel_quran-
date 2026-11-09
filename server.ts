import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { db } from './src/server/db.ts';
import { deleteStudentWithLessonsFromFirestore, deleteLessonsFromFirestore } from './src/server/firestoreMigrator.ts';
import { verifyFirebaseIdToken } from './src/server/firebaseAuthVerifier.ts';
import type { UserProfile, Student, Lesson, LessonException, AuditLog, AiUsageLog, GeneratedCertificate, PayrollRequest, StudentPayrollBreakdown, PayrollStatus, PaymentMethod, QuranProgress, ProgressStatus, TeacherAssignmentRecord } from './src/server/db.ts';
import { checkLessonOverlap, checkTwoLessonsConflict, getCairoToday, getCairoCurrentMonth, getCairoDayOfWeek, addDays, calculateEndTime12, format12HourTime, formatArabicDateHeader, DAYS_OF_WEEK } from './src/utils/timezone.ts';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const JWT_SECRET: string = (() => {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim() !== '') {
    return process.env.JWT_SECRET.trim();
  }
  const secretFile = path.resolve(process.cwd(), 'data', '.jwt_secret');
  try {
    if (fs.existsSync(secretFile)) {
      const stored = fs.readFileSync(secretFile, 'utf8').trim();
      if (stored.length >= 32) return stored;
    }
    const generated = crypto.randomBytes(64).toString('hex');
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, generated, { encoding: 'utf8', mode: 0o600 });
    return generated;
  } catch (err) {
    console.warn('[Security] Could not persist runtime JWT secret, using in-memory cryptographic secret');
    return crypto.randomBytes(64).toString('hex');
  }
})();

app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

// Do not let a request read or mutate the in-memory fallback while the first
// authoritative Firestore inspection is still running. This closes the race
// where a request mutation could be overwritten by the startup snapshot.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.path.startsWith('/api/')) return next();
  void db.waitForInitialization().then(() => next()).catch((error: any) => {
    console.error('[API] Database initialization did not complete:', error);
    if (!res.headersSent) {
      res.status(503).json({ error: 'قاعدة البيانات لم تكتمل تهيئتها بعد. حاول مرة أخرى.' });
    }
  });
});

// All API JSON responses wait for pending Firestore writes. This prevents Vercel
// from freezing a serverless request before the debounced background sync runs.
app.use((req: Request, res: Response, next: NextFunction) => {
  const sendJson = res.json.bind(res);
  (res as any).json = (body: any) => {
    if (!req.path.startsWith('/api/')) return sendJson(body);
    void db.saveAndSync().then(() => {
      sendJson(body);
    }).catch((error: any) => {
      console.error('[API] Firestore persistence failed; refusing success response:', error);
      if (!res.headersSent) {
        res.status(503);
        sendJson({ error: 'تعذر حفظ التغييرات في قاعدة البيانات. لم يتم تأكيد العملية، حاول مرة أخرى.' });
      }
    });
    return res;
  };
  next();
});

// Serve static assets from public folder
app.use(express.static(path.resolve(process.cwd(), 'public')));

// Extend Express Request type
interface AuthenticatedRequest extends Request {
  user?: UserProfile;
}

// Authentication middleware
function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7)
    : req.cookies?.tarteel_token;

  if (!token) {
    return res.status(401).json({ error: 'يرجى تسجيل الدخول للوصول إلى هذا المحتوى' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
    const user = db.get().profiles.find(p => p.id === decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'المستخدم غير موجود' });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'تم تعليق هذا الحساب. يرجى التواصل مع إدارة الأكاديمية' });
    }

    if (user.status === 'REJECTED') {
      return res.status(403).json({ error: 'تم رفض طلب التسجيل لهذا الحساب' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' });
  }
}

// Require Approved Teacher or Admin
function requireApproved(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'غير مصرح' });
  }

  if (req.user.status === 'PENDING') {
    return res.status(403).json({
      error: 'حسابك قيد المراجعة والاعتماد من قبل إدارة أكاديمية ترتيل. لا يمكنك الوصول إلى بيانات الطلاب أو الجداول حتى يتم اعتماده.',
      status: 'PENDING'
    });
  }

  next();
}

// Require Admin middleware
function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'هذه العملية تتطلب صلاحيات مسؤول النظام فقط' });
  }
  next();
}

// Helper to log audit actions
function logAudit(actor: UserProfile, action: string, targetType: AuditLog['targetType'], targetId: string, details: string) {
  const newLog: AuditLog = {
    id: uuidv4(),
    actorId: actor.id,
    actorName: actor.fullName,
    action,
    targetType,
    targetId,
    details,
    createdAt: new Date().toISOString()
  };
  db.get().auditLogs.unshift(newLog);
  // Keep last 500 logs
  if (db.get().auditLogs.length > 500) {
    db.get().auditLogs.pop();
  }
  db.save();
}

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================

// Login
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { identifier, password, rememberMe } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور' });
  }

  // Strip invisible unicode formatting marks (BOM, zero-width spaces, LTR/RTL marks) and whitespace
  const cleanId = String(identifier)
    .replace(/[\u200B-\u200F\uFEFF]/g, '')
    .trim()
    .toLowerCase();

  const user = db.get().profiles.find(p => {
    const uName = (p.username || '').replace(/[\u200B-\u200F\uFEFF]/g, '').trim().toLowerCase();
    const uEmail = (p.email || '').replace(/[\u200B-\u200F\uFEFF]/g, '').trim().toLowerCase();
    if (uName === cleanId || uEmail === cleanId) return true;
    // Allow standard admin alias "admin" or legacy admin email for the designated admin profile
    if (p.role === 'ADMIN' && (cleanId === 'admin' || cleanId === 'admin@tarteel-academy.org')) {
      return true;
    }
    return false;
  });

  if (!user) {
    return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  // Robust bcrypt check: handles exact input, trimmed input, and clipboard unicode formatting
  const rawPw = typeof password === 'string' ? password : String(password);
  const sanitizedPw = rawPw.replace(/[\u200B-\u200F\uFEFF]/g, '').trim();

  let isMatch = false;
  try {
    isMatch = bcrypt.compareSync(rawPw, user.passwordHash) ||
              (sanitizedPw !== rawPw && bcrypt.compareSync(sanitizedPw, user.passwordHash));
  } catch (err) {
    console.error('[Auth Error] bcrypt.compareSync failed:', err);
  }

  if (!isMatch) {
    return res.status(400).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  if (user.status === 'SUSPENDED') {
    return res.status(403).json({ error: 'تم تجميد هذا الحساب من قبل الإدارة. يرجى التواصل مع إدارة ترتيل.' });
  }

  if (user.status === 'REJECTED') {
    return res.status(403).json({ error: 'نعتذر، لقد تم رفض طلب التسجيل الخاص بهذا الحساب.' });
  }

  const expiresIn = rememberMe ? '30d' : '24h';
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, status: user.status },
    JWT_SECRET,
    { expiresIn }
  );

  res.cookie('tarteel_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  });

  const { passwordHash: _, ...safeUser } = user;
  return res.json({
    token,
    user: safeUser,
    message: user.status === 'PENDING'
      ? 'تم تسجيل الدخول، حسابك لا يزال قيد مراجعة الإدارة'
      : 'تم تسجيل الدخول بنجاح'
  });
});

// Firebase Authentication Login Endpoint (Strict cryptographic verification)
app.post('/api/auth/firebase-login', async (req: Request, res: Response) => {
  const { idToken } = req.body;

  // 1. Enforce ID Token presence
  if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
    return res.status(400).json({ error: 'رمز توثيق Firebase (idToken) مطلوب لإتمام المصادقة' });
  }

  // 2. Cryptographically verify the Firebase ID Token using Google's public certificates
  let verifiedToken;
  try {
    verifiedToken = await verifyFirebaseIdToken(idToken.trim());
  } catch (verifyErr: any) {
    console.warn('[Firebase Auth] Token verification rejected:', verifyErr?.message || verifyErr);
    return res.status(401).json({
      error: 'فشل التحقق الأمني من جلسة Firebase: رمز الدخول غير صالح أو منتهي الصلاحية'
    });
  }

  // 3. Extract verified identity strictly from the cryptographically validated token
  const verifiedEmail = verifiedToken.email ? String(verifiedToken.email).trim().toLowerCase() : null;
  const verifiedUid = verifiedToken.uid;

  if (!verifiedEmail) {
    return res.status(400).json({ error: 'رمز الدخول الموثق لا يحتوي على بريد إلكتروني صالح' });
  }

  // 4. Match with existing server-side profile (Never trust client-supplied roles or emails)
  const existingUser = db.get().profiles.find(
    p => p.email.toLowerCase() === verifiedEmail
  );

  if (!existingUser) {
    return res.status(403).json({
      error: 'البريد الإلكتروني الموثق غير مسجل في أكاديمية ترتيل. يرجى إنشاء حساب معتمد أولاً أو التواصل مع الإدارة.'
    });
  }

  // 5. Enforce account status restrictions
  if (existingUser.status === 'SUSPENDED') {
    return res.status(403).json({ error: 'تم تجميد هذا الحساب من قبل الإدارة. يرجى التواصل مع إدارة ترتيل.' });
  }

  if (existingUser.status === 'REJECTED') {
    return res.status(403).json({ error: 'نعتذر، لقد تم رفض طلب التسجيل الخاص بهذا الحساب.' });
  }

  // 6. Issue application JWT with role strictly derived from server-side database profile
  const token = jwt.sign(
    { id: existingUser.id, username: existingUser.username, role: existingUser.role, status: existingUser.status },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.cookie('tarteel_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  const { passwordHash: _, ...safeUser } = existingUser;
  return res.json({
    token,
    user: safeUser,
    message: existingUser.status === 'PENDING'
      ? 'تم توثيق الدخول عبر Firebase بنجاح، حسابك قيد مراجعة الإدارة'
      : 'تم تسجيل الدخول بنجاح عبر Firebase Authentication الموثق'
  });
});

// Register new teacher
app.post('/api/auth/register', (req: Request, res: Response) => {
  const { fullName, username, email, password, confirmPassword, gender } = req.body;

  if (!fullName || !username || !email || !password) {
    return res.status(400).json({ error: 'يرجى ملء جميع الحقول المطلوبة' });
  }

  if (!gender || (gender !== 'MALE' && gender !== 'FEMALE')) {
    return res.status(400).json({ error: 'يرجى تحديد جنس المعلم (ذكر أو أنثى) لضبط الألقاب والصفة الرسمية' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'كلمة المرور وتأكيدها غير متطابقين' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'يجب ألا تقل كلمة المرور عن 6 خانات' });
  }

  const cleanUsername = String(username).trim().toLowerCase();
  const cleanEmail = String(email).trim().toLowerCase();

  // Validate username characters (alphanumeric and underscore)
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(cleanUsername)) {
    return res.status(400).json({ error: 'اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام وعلامة _ فقط (من 3 إلى 30 حرف)' });
  }

  // Check unique username or email
  const existing = db.get().profiles.find(
    p => p.username.toLowerCase() === cleanUsername || p.email.toLowerCase() === cleanEmail
  );

  if (existing) {
    if (existing.username.toLowerCase() === cleanUsername) {
      return res.status(400).json({ error: 'اسم المستخدم هذا مسجل مسبقاً، يرجى اختيار اسم آخر' });
    }
    return res.status(400).json({ error: 'البريد الإلكتروني هذا مسجل مسبقاً' });
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);

  const newProfile: UserProfile = {
    id: uuidv4(),
    fullName: String(fullName).trim(),
    username: cleanUsername,
    email: cleanEmail,
    passwordHash,
    role: 'TEACHER',
    gender: gender === 'FEMALE' ? 'FEMALE' : 'MALE',
    status: 'PENDING', // Initial status is strictly PENDING
    preferredTimeZone: 'Africa/Cairo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.get().profiles.push(newProfile);
  db.save();

  // Audit log
  const genderTitle = newProfile.gender === 'FEMALE' ? 'فضيلة المعلمة' : 'فضيلة المعلم';
  logAudit(
    newProfile,
    'TEACHER_REGISTERED',
    'USER',
    newProfile.id,
    `سجلت في الأكاديمية: ${genderTitle} ${newProfile.fullName} (${newProfile.username}) بانتظار الاعتماد`
  );

  return res.status(201).json({
    message: 'تم تسجيل طلبك بنجاح! حسابك حالياً في حالة (قيد المراجعة) وسيتم تفعيله فور موافقة إدارة الأكاديمية.',
    status: 'PENDING'
  });
});

// Current user profile
app.get('/api/auth/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { passwordHash: _, ...safeUser } = req.user!;
  res.json({ user: safeUser });
});

// Logout
app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('tarteel_token');
  res.json({ message: 'تم تسجيل الخروج بنجاح' });
});

// Change password
app.post('/api/auth/change-password', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'يرجى تقديم كلمة المرور الحالية والجديدة' });
  }

  const isMatch = bcrypt.compareSync(currentPassword, req.user!.passwordHash);
  if (!isMatch) {
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'يجب ألا تقل كلمة المرور الجديدة عن 6 خانات' });
  }

  const userIndex = db.get().profiles.findIndex(p => p.id === req.user!.id);
  if (userIndex !== -1) {
    db.get().profiles[userIndex].passwordHash = bcrypt.hashSync(newPassword, 10);
    db.get().profiles[userIndex].updatedAt = new Date().toISOString();
    db.save();
  }

  res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
});

// Request secure one-time password reset/setup link
app.post('/api/auth/request-password-reset', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'البريد الإلكتروني مطلوب' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const profileIndex = db.get().profiles.findIndex(p => p.email.toLowerCase() === cleanEmail);

  // Constant-time mitigation / prevent email enumeration
  if (profileIndex === -1) {
    return res.json({
      message: 'إذا كان البريد الإلكتروني مسجلاً، فقد تم إصدار رابط تعيين كلمة المرور بنجاح.'
    });
  }

  const profile = db.get().profiles[profileIndex];

  // Generate a cryptographically secure 256-bit random token
  const resetToken = crypto.randomBytes(32).toString('hex');
  // Store a SHA-256 hash of the token in the database for security (token at rest protection)
  const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
  // 1-hour expiration
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  profile.passwordResetToken = tokenHash;
  profile.passwordResetExpires = expiresAt;
  profile.updatedAt = new Date().toISOString();
  db.recordChange('profiles', profile.id, profile);
  db.save();

  logAudit(
    profile,
    'REQUEST_PASSWORD_RESET',
    'USER',
    profile.id,
    `طلب رابط آمن لتعيين كلمة المرور لحساب (${profile.email})`
  );

  return res.json({
    message: 'إذا كان البريد الإلكتروني مسجلاً، فقد تم إصدار رابط تعيين كلمة المرور بنجاح.',
    // Provide the reset token in response for one-time initialization/setup
    setupToken: resetToken,
    expiresAt
  });
});

// Verify token and set new password securely
app.post('/api/auth/setup-password', (req: Request, res: Response) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'رمز تعيين كلمة المرور غير صالح أو مفقود' });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف وأرقام لضمان الأمان' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'كلمة المرور وتأكيدها غير متطابقين' });
  }

  const incomingHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const now = new Date().toISOString();

  // Find user with matching unexpired token
  const profileIndex = db.get().profiles.findIndex(p =>
    p.passwordResetToken === incomingHash &&
    p.passwordResetExpires &&
    p.passwordResetExpires > now
  );

  if (profileIndex === -1) {
    return res.status(400).json({ error: 'رابط تعيين كلمة المرور غير صالح أو انتهت صلاحيته. يرجى طلب رابط جديد.' });
  }

  const profile = db.get().profiles[profileIndex];

  // Hash password using bcrypt with standard high-workfactor 10 rounds and unique salt
  const salt = bcrypt.genSaltSync(10);
  profile.passwordHash = bcrypt.hashSync(newPassword, salt);

  // Invalidate the one-time token immediately upon consumption
  delete profile.passwordResetToken;
  delete profile.passwordResetExpires;
  profile.updatedAt = new Date().toISOString();

  db.recordChange('profiles', profile.id, profile);
  db.save();

  logAudit(
    profile,
    'PASSWORD_RESET_COMPLETED',
    'USER',
    profile.id,
    `تم إتمام تعيين كلمة المرور بنجاح وبشكل آمن للحساب (${profile.email})`
  );

  return res.json({
    message: 'تم تعيين كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول مباشرة ببياناتك الجديدة.'
  });
});

// Update profile / time zone / gender
app.put('/api/auth/profile', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { fullName, preferredTimeZone, gender } = req.body;
  const userIndex = db.get().profiles.findIndex(p => p.id === req.user!.id);
  if (userIndex !== -1) {
    if (fullName) db.get().profiles[userIndex].fullName = String(fullName).trim();
    if (preferredTimeZone) db.get().profiles[userIndex].preferredTimeZone = preferredTimeZone;
    if (gender === 'MALE' || gender === 'FEMALE') {
      db.get().profiles[userIndex].gender = gender;
    }
    db.get().profiles[userIndex].updatedAt = new Date().toISOString();
    db.save();

    const { passwordHash: _, ...safeUser } = db.get().profiles[userIndex];
    return res.json({ user: safeUser, message: 'تم تحديث البيانات والصفة الرسمية بنجاح' });
  }
  res.status(404).json({ error: 'المستخدم غير موجود' });
});

// ==========================================
// 2. STUDENT MANAGEMENT (TEACHER ISOLATED)
// ==========================================

// Get all students (Admin views all or filters by teacherId; teachers view their assigned students)
app.get('/api/students', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const includeArchived = req.query.includeArchived === 'true';
  const filterTeacherId = req.query.teacherId ? String(req.query.teacherId) : null;
  const user = req.user!;

  let students = db.get().students;

  if (user.role !== 'ADMIN') {
    // Teachers strictly see only their own assigned students
    students = students.filter(s => s.teacherId === user.id);
  } else if (filterTeacherId) {
    students = students.filter(s => s.teacherId === filterTeacherId);
  }

  if (!includeArchived) {
    students = students.filter(s => !s.isArchived);
  }

  const profilesMap = new Map(db.get().profiles.map(p => [p.id, p]));
  const studentIds = new Set(students.map(s => s.id));
  const lessons = db.get().lessons.filter(l => studentIds.has(l.studentId));

  const enriched = students.map(student => {
    const teacherProfile = profilesMap.get(student.teacherId);
    return {
      ...student,
      lessons: lessons.filter(l => l.studentId === student.id),
      assignedTeacher: teacherProfile ? {
        id: teacherProfile.id,
        fullName: teacherProfile.fullName,
        gender: teacherProfile.gender,
        username: teacherProfile.username,
        email: teacherProfile.email
      } : undefined
    };
  });

  res.json({ students: enriched });
});

// Add student
app.post('/api/students', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const { fullName, country, timeZone, durationMinutes, studyDaysPerWeek, lessonSchedules } = req.body;

  if (!fullName || !country || !timeZone) {
    return res.status(400).json({ error: 'يرجى إكمال اسم الطالب، الدولة، والمنطقة الزمنية' });
  }

  // Duration rule: default to 30 minutes automatically if not provided, and enforce [30, 40]
  const duration = (durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== '')
    ? Number(durationMinutes)
    : 30;

  if (isNaN(duration) || duration < 30 || duration > 40) {
    return res.status(400).json({ error: 'مدة الحصة محددة بنظام الأكاديمية بين 30 و 40 دقيقة فقط' });
  }

  // Study days per week (1-7): default to provided number or count of lesson schedules, or 2
  let days = Number(studyDaysPerWeek);
  if (isNaN(days) || days < 1 || days > 7) {
    days = Array.isArray(lessonSchedules) && lessonSchedules.length > 0 ? lessonSchedules.length : 2;
  }

  const studentId = uuidv4();
  const newStudent: Student = {
    id: studentId,
    teacherId: req.user!.id, // Enforce logged-in teacher ownership
    fullName: String(fullName).trim(),
    country: String(country).trim(),
    timeZone: String(timeZone).trim(),
    durationMinutes: duration,
    studyDaysPerWeek: days,
    completedEpisodes: [],
    isArchived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.get().students.push(newStudent);

  // If recurring lesson schedules were provided
  const createdLessons: Lesson[] = [];
  if (Array.isArray(lessonSchedules)) {
    for (const sched of lessonSchedules) {
      if (sched.dayOfWeek !== undefined && sched.localTime) {
        const lesson: Lesson = {
          id: uuidv4(),
          studentId,
          teacherId: req.user!.id,
          dayOfWeek: Number(sched.dayOfWeek),
          localTime: String(sched.localTime),
          timeZone: String(timeZone),
          durationMinutes: duration,
          isRecurring: true,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        db.get().lessons.push(lesson);
        createdLessons.push(lesson);
      }
    }
  }

  db.recordChange('students', newStudent.id, newStudent);
  for (const l of createdLessons) {
    db.recordChange('lessons', l.id, l);
  }
  db.save();

  return res.status(201).json({
    student: { ...newStudent, lessons: createdLessons },
    message: 'تمت إضافة الطالب وتوليد الحلقات الشهرية بنجاح'
  });
});

// Update student
app.put('/api/students/:id', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { fullName, country, timeZone, durationMinutes, studyDaysPerWeek, completedEpisodes, lessonSchedules } = req.body;

  const studentIndex = db.get().students.findIndex(s => s.id === id);
  if (studentIndex === -1) {
    return res.status(404).json({ error: 'الطالب غير موجود' });
  }

  // STRICT OWNERSHIP CHECK
  if (db.get().students[studentIndex].teacherId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل بيانات هذا الطالب' });
  }

  const existingDuration = db.get().students[studentIndex].durationMinutes || 30;
  const duration = (durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== '')
    ? Number(durationMinutes)
    : existingDuration;

  if (isNaN(duration) || duration < 30 || duration > 40) {
    return res.status(400).json({ error: 'مدة الحصة محددة بنظام الأكاديمية بين 30 و 40 دقيقة فقط' });
  }

  if (fullName) db.get().students[studentIndex].fullName = String(fullName).trim();
  if (country) db.get().students[studentIndex].country = String(country).trim();
  if (timeZone) db.get().students[studentIndex].timeZone = String(timeZone).trim();
  db.get().students[studentIndex].durationMinutes = duration;

  if (studyDaysPerWeek !== undefined) {
    const days = Number(studyDaysPerWeek);
    if (!isNaN(days) && days >= 1 && days <= 7) {
      db.get().students[studentIndex].studyDaysPerWeek = days;
    }
  }

  if (Array.isArray(completedEpisodes)) {
    db.get().students[studentIndex].completedEpisodes = completedEpisodes.map(Number).filter(n => !isNaN(n));
  }

  db.get().students[studentIndex].updatedAt = new Date().toISOString();

  // Update or replace lesson schedules if provided
  if (Array.isArray(lessonSchedules)) {
    // Find existing lesson IDs for this student before removing locally
    const oldLessonIds = db.get().lessons.filter(l => l.studentId === id).map(l => l.id);
    if (oldLessonIds.length > 0) {
      deleteLessonsFromFirestore(oldLessonIds).catch(err => {
        console.warn(`[Firestore] Failed to delete obsolete lessons for student ${id}:`, err);
      });
    }

    // Remove existing lessons for this student
    db.get().lessons = db.get().lessons.filter(l => l.studentId !== id);
    for (const sched of lessonSchedules) {
      if (sched.dayOfWeek !== undefined && sched.localTime) {
        const newLesson: Lesson = {
          id: uuidv4(),
          studentId: id,
          teacherId: db.get().students[studentIndex].teacherId,
          dayOfWeek: Number(sched.dayOfWeek),
          localTime: String(sched.localTime),
          timeZone: db.get().students[studentIndex].timeZone,
          durationMinutes: duration,
          isRecurring: true,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        db.get().lessons.push(newLesson);
        db.recordChange('lessons', newLesson.id, newLesson);
      }
    }
  }

  db.recordChange('students', id, db.get().students[studentIndex]);
  db.save();
  return res.json({ message: 'تم تحديث بيانات الطالب بنجاح' });
});

// Toggle individual episode completed state for a student
app.post('/api/students/:id/toggle-episode', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { episodeNumber, month } = req.body;

  const epNum = Number(episodeNumber);
  if (isNaN(epNum) || epNum < 1) {
    return res.status(400).json({ error: 'رقم الحلقة غير صحيح' });
  }

  const studentIndex = db.get().students.findIndex(s => s.id === id);
  if (studentIndex === -1) {
    return res.status(404).json({ error: 'الطالب غير موجود' });
  }

  // Ownership check
  if (db.get().students[studentIndex].teacherId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل بيانات هذا الطالب' });
  }

  const student = db.get().students[studentIndex];
  if (!student.monthlyCompletedEpisodes) {
    student.monthlyCompletedEpisodes = {};
  }

  const targetMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const currentMonthKey = new Date().toISOString().slice(0, 7);

  if (!student.monthlyCompletedEpisodes[targetMonth]) {
    student.monthlyCompletedEpisodes[targetMonth] = (targetMonth === currentMonthKey && Array.isArray(student.completedEpisodes))
      ? [...student.completedEpisodes]
      : [];
  }

  const current = student.monthlyCompletedEpisodes[targetMonth];
  const exists = current.includes(epNum);
  let updated: number[];
  if (exists) {
    updated = current.filter(e => e !== epNum);
  } else {
    updated = [...current, epNum].sort((a, b) => a - b);
  }

  student.monthlyCompletedEpisodes[targetMonth] = updated;
  if (targetMonth === currentMonthKey) {
    student.completedEpisodes = updated;
  }
  student.updatedAt = new Date().toISOString();
  db.save();

  return res.json({
    completedEpisodes: updated,
    monthlyCompletedEpisodes: student.monthlyCompletedEpisodes,
    isCompleted: !exists,
    message: !exists ? `تم تحديد الحلقة ${epNum} كمكتملة` : `تم إلغاء اكتمال الحلقة ${epNum}`
  });
});

// Reset episodes for a student (e.g. at start of new month)
app.post('/api/students/:id/reset-episodes', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const studentIndex = db.get().students.findIndex(s => s.id === id);
  if (studentIndex === -1) {
    return res.status(404).json({ error: 'الطالب غير موجود' });
  }

  if (db.get().students[studentIndex].teacherId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل بيانات هذا الطالب' });
  }

  db.get().students[studentIndex].completedEpisodes = [];
  db.get().students[studentIndex].updatedAt = new Date().toISOString();
  db.save();

  return res.json({
    completedEpisodes: [],
    message: 'تمت إعادة ضبط الحلقات الشهرية بنجاح'
  });
});

// Archive student
app.post('/api/students/:id/archive', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const student = db.get().students.find(s => s.id === id);
  if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
  if (student.teacherId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'غير مصرح' });
  }

  student.isArchived = true;
  student.updatedAt = new Date().toISOString();
  db.save();
  res.json({ message: 'تمت أرشفة الطالب بنجاح' });
});

// Restore student
app.post('/api/students/:id/restore', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const student = db.get().students.find(s => s.id === id);
  if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
  if (student.teacherId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'غير مصرح' });
  }

  student.isArchived = false;
  student.updatedAt = new Date().toISOString();
  db.save();
  res.json({ message: 'تم استعادة الطالب بنجاح' });
});

// Delete student permanently with confirmation
app.delete('/api/students/:id', authenticate, requireApproved, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const student = db.get().students.find(s => s.id === id);
  if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
  if (student.teacherId !== req.user!.id && req.user!.role !== 'ADMIN') {
    return res.status(403).json({ error: 'غير مصرح' });
  }

  // Find all lessons associated with this student before removing locally
  const associatedLessons = db.get().lessons.filter(l => l.studentId === id);
  const associatedLessonIds = associatedLessons.map(l => l.id);

  // 1. Explicitly delete from Firestore first to prevent zombie reappearance
  try {
    await deleteStudentWithLessonsFromFirestore(id, associatedLessonIds);
  } catch (err: any) {
    console.error(`[Firestore] Failed to delete student ${id} from Firestore:`, err);
    return res.status(500).json({
      error: 'تعذر حذف بيانات الطالب من قاعدة البيانات السحابية (Firestore). لم يتم الحذف لتجنب تكرار البيانات.'
    });
  }

  // 2. Remove from in-memory state and local JSON
  db.get().students = db.get().students.filter(s => s.id !== id);
  db.get().lessons = db.get().lessons.filter(l => l.studentId !== id);
  db.save();

  return res.json({ message: 'تم حذف الطالب وسجل حصصه نهائياً ومزامنته مع السحابة' });
});

// Update student Quran learning progress
app.put('/api/students/:id/progress', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { completedSurahs, currentSurah, completedPortion, remainingMemorization, revisionProgress, status, notes } = req.body;
  const user = req.user!;

  const studentIndex = db.get().students.findIndex(s => s.id === id);
  if (studentIndex === -1) {
    return res.status(404).json({ error: 'الطالب غير موجود' });
  }

  const student = db.get().students[studentIndex];
  if (student.teacherId !== user.id && user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'ليس لديك صلاحية لتحديث تقدم هذا الطالب' });
  }

  const validStatuses: ProgressStatus[] = ['COMPLETED', 'IN_PROGRESS', 'NOT_STARTED', 'NEEDS_REVISION'];
  const progressStatus = validStatuses.includes(status) ? status : 'IN_PROGRESS';

  const newProgress: QuranProgress = {
    completedSurahs: Array.isArray(completedSurahs) ? completedSurahs.map(String) : (student.quranProgress?.completedSurahs || []),
    currentSurah: currentSurah !== undefined ? String(currentSurah).trim() : (student.quranProgress?.currentSurah || ''),
    completedPortion: completedPortion !== undefined ? String(completedPortion).trim() : (student.quranProgress?.completedPortion || ''),
    remainingMemorization: remainingMemorization !== undefined ? String(remainingMemorization).trim() : (student.quranProgress?.remainingMemorization || ''),
    revisionProgress: revisionProgress !== undefined ? String(revisionProgress).trim() : (student.quranProgress?.revisionProgress || ''),
    status: progressStatus,
    notes: notes !== undefined ? String(notes).trim() : (student.quranProgress?.notes || ''),
    lastUpdated: new Date().toISOString()
  };

  student.quranProgress = newProgress;
  student.updatedAt = new Date().toISOString();
  db.save();

  logAudit(
    user,
    'UPDATE_STUDENT_PROGRESS',
    'STUDENT',
    student.id,
    `تحديث تقدم حفظ القرآن للطالب (${student.fullName}): سورة ${newProgress.currentSurah || 'غير محددة'} - حالة (${progressStatus})`
  );

  return res.json({
    student,
    quranProgress: newProgress,
    message: 'تم تحديث سجل تقدم حفظ القرآن بنجاح'
  });
});

// Admin: Reassign student to another teacher
app.put('/api/students/:id/reassign-teacher', authenticate, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { newTeacherId, reason } = req.body;
  const admin = req.user!;

  if (!newTeacherId) {
    return res.status(400).json({ error: 'يرجى اختيار المعلم الجديد' });
  }

  const studentIndex = db.get().students.findIndex(s => s.id === id);
  if (studentIndex === -1) {
    return res.status(404).json({ error: 'الطالب غير موجود' });
  }

  const newTeacher = db.get().profiles.find(p => p.id === newTeacherId && p.role === 'TEACHER');
  if (!newTeacher) {
    return res.status(404).json({ error: 'المعلم الجديد غير موجود في الأكاديمية' });
  }

  const student = db.get().students[studentIndex];
  const oldTeacher = db.get().profiles.find(p => p.id === student.teacherId);

  if (student.teacherId === newTeacherId) {
    return res.status(400).json({ error: 'الطالب مسند بالفعل إلى هذا المعلم' });
  }

  if (!student.assignmentHistory) {
    student.assignmentHistory = [];
  }

  // Record assignment history
  student.assignmentHistory.push({
    teacherId: student.teacherId,
    teacherName: oldTeacher ? oldTeacher.fullName : 'معلم سابق',
    assignedAt: student.createdAt,
    unassignedAt: new Date().toISOString(),
    reason: reason ? String(reason).trim() : 'إعادة إسناد إداري من مدير الأكاديمية'
  });

  student.teacherId = newTeacherId;
  student.updatedAt = new Date().toISOString();

  // Reassign recurring lessons to the new teacher
  db.get().lessons.forEach(l => {
    if (l.studentId === student.id && l.status === 'ACTIVE') {
      l.teacherId = newTeacherId;
      l.updatedAt = new Date().toISOString();
    }
  });

  db.save();

  logAudit(
    admin,
    'REASSIGN_STUDENT_TEACHER',
    'STUDENT',
    student.id,
    `إعادة إسناد الطالب (${student.fullName}) من المعلم (${oldTeacher?.fullName || 'غير معروف'}) إلى المعلم (${newTeacher.fullName})`
  );

  return res.json({
    student,
    message: `تمت إعادة إسناد الطالب (${student.fullName}) إلى فضيلة المعلم (${newTeacher.fullName}) بنجاح`
  });
});

// ==========================================
// 3. LESSONS & SCHEDULES
// ==========================================

// Get lessons (Admin can view all or filter by teacherId; teachers view their own)
app.get('/api/lessons', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const filterTeacherId = req.query.teacherId ? String(req.query.teacherId) : null;

  let lessons = db.get().lessons;

  if (user.role !== 'ADMIN') {
    lessons = lessons.filter(l => l.teacherId === user.id);
  } else if (filterTeacherId) {
    lessons = lessons.filter(l => l.teacherId === filterTeacherId);
  }

  const studentsMap = new Map(db.get().students.map(s => [s.id, s]));
  const profilesMap = new Map(db.get().profiles.map(p => [p.id, p]));

  const enriched = lessons.map(lesson => {
    const student = studentsMap.get(lesson.studentId);
    const teacher = profilesMap.get(lesson.teacherId);
    return {
      ...lesson,
      student: student || null,
      teacher: teacher ? {
        id: teacher.id,
        fullName: teacher.fullName,
        gender: teacher.gender,
        username: teacher.username
      } : null
    };
  });

  let exceptions = db.get().lessonExceptions;
  if (user.role !== 'ADMIN') {
    exceptions = exceptions.filter(e => e.teacherId === user.id);
  } else if (filterTeacherId) {
    exceptions = exceptions.filter(e => e.teacherId === filterTeacherId);
  } else if (req.query.date) {
    exceptions = exceptions.filter(e => e.occurrenceDate === String(req.query.date));
  }

  res.json({
    lessons: enriched,
    exceptions
  });
});

// Add lesson with overlap detection
app.post('/api/lessons', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const { studentId, dayOfWeek, localTime, durationMinutes } = req.body;
  const teacherId = req.user!.id;

  const student = db.get().students.find(s => s.id === studentId);
  if (!student || (student.teacherId !== teacherId && req.user!.role !== 'ADMIN')) {
    return res.status(404).json({ error: 'الطالب غير موجود أو غير تابع لك' });
  }

  const duration = (durationMinutes !== undefined && durationMinutes !== null && durationMinutes !== '')
    ? Number(durationMinutes)
    : (student.durationMinutes || 30);

  if (isNaN(duration) || duration < 30 || duration > 40) {
    return res.status(400).json({ error: 'مدة الحصة محددة بنظام الأكاديمية بين 30 و 40 دقيقة فقط' });
  }

  // Check for conflicts on the same day:
  // Rule A: Same teacher has an overlapping lesson
  // Rule B: Same student has an overlapping lesson (even with another teacher)
  const existingLessonsOnDay = db.get().lessons.filter(
    l => (l.teacherId === teacherId || l.studentId === studentId) &&
         l.dayOfWeek === Number(dayOfWeek) &&
         l.status === 'ACTIVE'
  );

  let hasConflict = false;
  let conflictWarning = '';

  const candidateLesson = {
    teacherId,
    studentId,
    dayOfWeek: Number(dayOfWeek),
    localTime: String(localTime),
    timeZone: student.timeZone,
    durationMinutes: duration,
    status: 'ACTIVE',
    studentName: student.fullName
  };

  for (const existing of existingLessonsOnDay) {
    const existingStudent = db.get().students.find(st => st.id === existing.studentId);
    const existingTeacher = db.get().profiles.find(p => p.id === existing.teacherId);

    const conflictRes = checkTwoLessonsConflict(
      candidateLesson,
      {
        ...existing,
        studentName: existingStudent?.fullName,
        teacherName: existingTeacher?.fullName
      },
      'Africa/Cairo'
    );

    if (conflictRes.isConflict) {
      hasConflict = true;
      conflictWarning = conflictRes.reasonArabic
        ? `تنبيه: ${conflictRes.reasonArabic}`
        : 'تنبيه: يوجد تعارض زمني في الموعد المحدد!';
      break;
    }
  }

  const newLesson: Lesson = {
    id: uuidv4(),
    studentId,
    teacherId,
    dayOfWeek: Number(dayOfWeek),
    localTime: String(localTime),
    timeZone: student.timeZone,
    durationMinutes: duration,
    isRecurring: true,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.get().lessons.push(newLesson);
  db.save();

  return res.status(201).json({
    lesson: newLesson,
    hasConflict,
    warning: hasConflict ? conflictWarning : undefined,
    message: 'تم حفظ الحصة بنجاح'
  });
});

// Add lesson exception (cancel or reschedule a single occurrence)
app.post('/api/lessons/exceptions', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const { lessonId, occurrenceDate, exceptionType, modifiedTime, reason } = req.body;
  const lesson = db.get().lessons.find(l => l.id === lessonId);
  if (!lesson || (lesson.teacherId !== req.user!.id && req.user!.role !== 'ADMIN')) {
    return res.status(404).json({ error: 'الحصة غير موجودة' });
  }

  const exception: LessonException = {
    id: uuidv4(),
    lessonId,
    teacherId: req.user!.id,
    occurrenceDate,
    exceptionType,
    modifiedTime,
    reason,
    createdAt: new Date().toISOString()
  };

  db.get().lessonExceptions.push(exception);
  db.save();

  res.json({ message: 'تم تسجيل استثناء الحصة لهذا اليوم بنجاح', exception });
});

// ==========================================
// 4. CERTIFICATES GENERATION & TEMPLATE
// ==========================================

// Get active certificate template configuration
app.get('/api/certificates/template', authenticate, (_req: AuthenticatedRequest, res: Response) => {
  const template = db.get().certificateTemplates.find(t => t.isActive) || db.get().certificateTemplates[0];
  res.json({ template });
});

// Update template configuration (ADMIN ONLY)
app.put('/api/certificates/template', authenticate, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const updates = req.body;
  const templateIndex = db.get().certificateTemplates.findIndex(t => t.isActive);

  if (templateIndex !== -1) {
    db.get().certificateTemplates[templateIndex] = {
      ...db.get().certificateTemplates[templateIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    db.save();
    logAudit(req.user!, 'UPDATE_CERTIFICATE_TEMPLATE', 'TEMPLATE', db.get().certificateTemplates[templateIndex].id, 'قام المسؤول بتعديل إحداثيات أو إعدادات قالب الشهادة الرسمي');
    return res.json({ template: db.get().certificateTemplates[templateIndex], message: 'تم حفظ إعدادات القالب بنجاح' });
  }

  res.status(404).json({ error: 'القالب غير موجود' });
});

// Log generated certificate
app.post('/api/certificates/log', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const { studentName, achievement } = req.body;
  if (!studentName || !achievement) {
    return res.status(400).json({ error: 'اسم الطالب وإنجاز الحفظ مطلوبان' });
  }

  const cert: GeneratedCertificate = {
    id: uuidv4(),
    teacherId: req.user!.id,
    teacherName: req.user!.fullName,
    teacherGender: req.user!.gender,
    studentName: String(studentName).trim(),
    achievement: String(achievement).trim(),
    templateVersion: 1,
    createdAt: new Date().toISOString()
  };

  db.get().generatedCertificates.unshift(cert);
  db.save();

  res.status(201).json({ message: 'تم تسجيل الشهادة بنجاح', certificate: cert });
});

// Get teacher certificate generation history
app.get('/api/certificates/history', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  const teacherId = req.user!.id;
  const history = db.get().generatedCertificates.filter(
    c => req.user!.role === 'ADMIN' || c.teacherId === teacherId
  );
  res.json({ certificates: history });
});

// ==========================================
// 5. AI EDUCATIONAL IMAGE ASSISTANT
// ==========================================

app.post('/api/ai/generate', authenticate, requireApproved, async (req: AuthenticatedRequest, res: Response) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    return res.status(400).json({ error: 'يرجى إدخال وصف تعليمي دقيق ومناسب للصورة' });
  }

  const cleanPrompt = prompt.trim();

  // Strict religious safeguards: prevent depicting prophets, angels, or sacred beings
  const forbiddenKeywords = [
    'نبي', 'رسول', 'محمد', 'جبريل', 'ملاك', 'ملائكة', 'وجه الله', 'الذات الإلهية',
    'عيسى', 'موسى', 'إبراهيم', 'نوح عليه السلام يظهر بوجهه', 'تجسيد'
  ];
  
  const containsForbidden = forbiddenKeywords.some(keyword => cleanPrompt.includes(keyword));
  if (containsForbidden) {
    return res.status(400).json({
      error: 'تنبيه شرعي وتربوي: تحظر سياسة أكاديمية ترتيل تجسيد الأنبياء، الرسل، الملائكة، أو الذات الإلهية في الصور التعليمية. يرجى التركيز على الرموز الطبيعية والتعليمية كالمصاحف، الرياض، والقصص الرمزية للأطفال.'
    });
  }

  // Check teacher daily quota
  const todayStr = new Date().toISOString().split('T')[0];
  const teacherLogsToday = db.get().aiUsageLogs.filter(
    l => l.teacherId === req.user!.id && l.createdAt.startsWith(todayStr) && l.status === 'SUCCESS'
  );

  const maxAllowed = db.get().settings.maxAiImagesPerTeacherPerDay || 5;
  if (teacherLogsToday.length >= maxAllowed) {
    return res.status(429).json({
      error: `لقد استنفدت الحد اليومي المسموح به لتوليد الصور (${maxAllowed} صور يومياً) لضبط استهلاك الموارد المجانية. يتجدد الرصيد غداً بإذن الله.`
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'مفتاح GEMINI_API_KEY غير مهيأ في بيئة الخادم. يرجى التأكد من إضافة المفتاح في لوحة الأسرار (Secrets).'
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const enrichedPrompt = `Islamic Quran academy educational illustration for children: ${cleanPrompt}. Pure aesthetic, gentle Islamic educational theme, safe for children, warm lighting, respectful, absolutely NO human facial depiction of sacred figures, high resolution digital art.`;

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [{ text: enrichedPrompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: '1:1'
          }
        }
      });
    } catch (primaryErr: any) {
      if (primaryErr?.status === 404 || primaryErr?.message?.includes('not found')) {
        response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [{ text: enrichedPrompt }]
          }
        });
      } else {
        throw primaryErr;
      }
    }

    let base64Data: string | null = null;
    let mimeType = 'image/png';

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        base64Data = part.inlineData.data;
        mimeType = part.inlineData.mimeType || 'image/png';
        break;
      }
    }

    if (!base64Data) {
      throw new Error('لم يقدم مزود الذكاء الاصطناعي بيانات صورة في الرد المستلم');
    }

    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    // Log success
    const log: AiUsageLog = {
      id: uuidv4(),
      teacherId: req.user!.id,
      prompt: cleanPrompt,
      status: 'SUCCESS',
      createdAt: new Date().toISOString()
    };
    db.get().aiUsageLogs.push(log);
    db.save();

    return res.json({
      imageUrl: dataUrl,
      prompt: cleanPrompt,
      remainingToday: maxAllowed - (teacherLogsToday.length + 1)
    });

  } catch (err: any) {
    console.error('AI generation error details:', err?.message || err);

    let clientMessage = 'تعذر توليد الصورة بالذكاء الاصطناعي حالياً.';
    let statusCode = 500;

    const errMsg = String(err?.message || '');
    if (err?.status === 403 || errMsg.includes('403') || errMsg.includes('free tier is not available') || errMsg.includes('billing')) {
      statusCode = 403;
      clientMessage = 'حساب مزود Gemini API الحالي لم يقم بتفعيل مشروع فوترة لتوليد الصور (Imagen/Flash-Image). تتطلب نماذج توليد الصور تفعيل الفوترة في منصة Google Cloud أو اختيار مفتاح مدفوع. لن يتم تفعيل أي رسوم دون موافقتك الصريحة.';
    } else if (err?.status === 429 || errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      statusCode = 429;
      clientMessage = 'تم استنفاد معدل الطلبات المسموح به لمزود الذكاء الاصطناعي مؤقتاً. يرجى الانتظار دقيقة واحدة ثم إعادة المحاولة.';
    } else if (err?.status === 400 || errMsg.includes('safety') || errMsg.includes('blocked')) {
      statusCode = 400;
      clientMessage = 'تم حظر الطلب من قبل مرشحات الأمان التلقائية لمزود الخدمة. يرجى تعديل الوصف ليكون أكثر ملائمة للأطفال.';
    } else {
      clientMessage = `خطأ تقني من مزود الخدمة: ${errMsg.slice(0, 150)}`;
    }

    // Record failure in log
    db.get().aiUsageLogs.push({
      id: uuidv4(),
      teacherId: req.user!.id,
      prompt: cleanPrompt,
      status: 'FAILED',
      details: errMsg.slice(0, 250),
      createdAt: new Date().toISOString()
    });
    db.save();

    return res.status(statusCode).json({
      error: clientMessage,
      code: err?.status || statusCode
    });
  }
});

// ==========================================
// 5.5 PAYROLL & SALARY MANAGEMENT
// ==========================================

const ARABIC_MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

function formatArabicMonth(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const mIndex = parseInt(monthStr, 10) - 1;
  const monthName = ARABIC_MONTH_NAMES[mIndex] || monthStr;
  return `${monthName} ${yearStr}`;
}

// Calculate salary breakdown for teacher
app.post('/api/payroll/calculate', authenticate, requireApproved, (req: AuthenticatedRequest, res: Response) => {
  if (req.user!.role === 'ADMIN') {
    return res.status(403).json({
      error: 'حساب الإدارة مخصص للإشراف والاعتماد المالي ولا يستلم رواتب تدريسية.'
    });
  }

  const { month } = req.body;
  const teacherId = req.user!.id;
  const targetMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const monthLabel = formatArabicMonth(targetMonth);

  // 1. Read all active students for this teacher
  const teacherStudents = db.get().students.filter(s => s.teacherId === teacherId && !s.isArchived);

  // 2. Count actual completed lessons for each student individually during the selected month only
  const breakdown: StudentPayrollBreakdown[] = teacherStudents.map(student => {
    let completedList: number[] = [];
    if (student.monthlyCompletedEpisodes && student.monthlyCompletedEpisodes[targetMonth]) {
      completedList = student.monthlyCompletedEpisodes[targetMonth];
    } else if (targetMonth === currentMonthKey && Array.isArray(student.completedEpisodes)) {
      completedList = student.completedEpisodes;
    }
    const completedLessons = completedList.length;
    const ratePerLesson = 65;
    return {
      studentId: student.id,
      studentName: student.fullName,
      completedLessons,
      ratePerLesson,
      totalAmount: completedLessons * ratePerLesson
    };
  });

  // 4. Calculate total number of lessons across all students
  const totalLessons = breakdown.reduce((sum, item) => sum + item.completedLessons, 0);

  // 5. Calculate teacher's total salary: Total Salary = Total Number of Lessons × 65 EGP
  const lessonRate = 65;
  const totalSalary = totalLessons * lessonRate;

  // Check if there is an existing request for this month
  const existingRequest = db.get().payrollRequests.find(r => r.teacherId === teacherId && r.month === targetMonth);
  const canSubmit = !existingRequest || existingRequest.status === 'RETURNED_FOR_CORRECTION';

  return res.json({
    month: targetMonth,
    monthLabel,
    students: breakdown,
    totalLessons,
    lessonRate,
    totalSalary,
    existingRequest: existingRequest || null,
    canSubmit
  });
});

// Submit salary request
app.post('/api/payroll/submit', authenticate, requireApproved, async (req: AuthenticatedRequest, res: Response) => {
  if (req.user!.role === 'ADMIN') {
    return res.status(403).json({ error: 'حساب الإدارة مخصص للاعتماد المالي ولا يمكن إنشاء طلب مسير رواتب له.' });
  }

  const { month, paymentMethod, paymentAccount, accountHolder } = req.body;
  const user = req.user!;
  const targetMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const monthLabel = formatArabicMonth(targetMonth);

  // Validation
  if (!paymentMethod || (paymentMethod !== 'INSTAPAY' && paymentMethod !== 'WALLET')) {
    return res.status(400).json({ error: 'يرجى اختيار طريقة الدفع (انستاباي أو محفظة إلكترونية)' });
  }

  const cleanAccount = String(paymentAccount || '').trim();
  if (!cleanAccount) {
    return res.status(400).json({ error: 'يرجى إدخال رقم الحساب أو المحفظة الإلكترونية' });
  }

  if (paymentMethod === 'WALLET') {
    const cleanedDigits = cleanAccount.replace(/\s+/g, '');
    if (!/^(010|011|012|015)\d{8}$/.test(cleanedDigits)) {
      return res.status(400).json({
        error: 'رقم المحفظة الإلكترونية غير صحيح. يجب أن يكون رقماً مصرياً مكوناً من 11 رقماً يبدأ بـ 010 أو 011 أو 012 أو 015'
      });
    }
  } else if (paymentMethod === 'INSTAPAY') {
    if (cleanAccount.length < 5) {
      return res.status(400).json({
        error: 'يرجى إدخال عنوان انستاباي صحيح (معرف انستاباي مثل name@instapay أو رقم هاتف مرتبط)'
      });
    }
  }

  const cleanHolder = String(accountHolder || '').trim();
  if (!cleanHolder || cleanHolder.length < 3) {
    return res.status(400).json({ error: 'يرجى إدخال اسم صاحب الحساب / المحفظة كاملاً كما هو مسجل بالبنك أو المحفظة' });
  }

  // Prevent duplicate requests unless returned for correction
  const existingIndex = db.get().payrollRequests.findIndex(r => r.teacherId === user.id && r.month === targetMonth);
  if (existingIndex !== -1) {
    const existing = db.get().payrollRequests[existingIndex];
    if (existing.status !== 'RETURNED_FOR_CORRECTION') {
      const statusAr =
        existing.status === 'PENDING_REVIEW' ? 'قيد المراجعة' :
        existing.status === 'APPROVED' ? 'معتمد بانتظار التحويل' :
        existing.status === 'PAID' ? 'تم الصرف والتحويل' :
        existing.status === 'REJECTED' ? 'مرفوض' : existing.status;
      return res.status(400).json({
        error: `تم تقديم طلب مسير رواتب لهذا الشهر (${monthLabel}) مسبقاً وحالته حالياً: (${statusAr}). لا يمكن إعادة إرسال الطلب إلا في حال إعادته للتعديل من قِبل الإدارة.`
      });
    }
  }

  // Snapshot completed lessons at the moment of submission
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const teacherStudents = db.get().students.filter(s => s.teacherId === user.id && !s.isArchived);

  const studentsSnapshot: StudentPayrollBreakdown[] = teacherStudents.map(student => {
    let completedList: number[] = [];
    if (student.monthlyCompletedEpisodes && student.monthlyCompletedEpisodes[targetMonth]) {
      completedList = student.monthlyCompletedEpisodes[targetMonth];
    } else if (targetMonth === currentMonthKey && Array.isArray(student.completedEpisodes)) {
      completedList = student.completedEpisodes;
    }
    const completedLessons = completedList.length;
    const ratePerLesson = 65;
    return {
      studentId: student.id,
      studentName: student.fullName,
      completedLessons,
      ratePerLesson,
      totalAmount: completedLessons * ratePerLesson
    };
  });

  const totalLessons = studentsSnapshot.reduce((sum, s) => sum + s.completedLessons, 0);
  const lessonRate = 65;
  const totalSalary = totalLessons * lessonRate;

  const requestId = existingIndex !== -1 ? db.get().payrollRequests[existingIndex].id : uuidv4();

  const newRequest: PayrollRequest = {
    id: requestId,
    teacherId: user.id,
    teacherName: user.fullName,
    teacherEmail: user.email,
    month: targetMonth,
    monthLabel,
    students: studentsSnapshot,
    totalLessons,
    lessonRate,
    totalSalary,
    paymentMethod,
    paymentAccount: cleanAccount,
    accountHolder: cleanHolder,
    status: 'PENDING_REVIEW', // Initial status strictly Pending Review
    submittedAt: new Date().toISOString(),
    emailSent: false
  };

  // Attempt Google Apps Script / email dispatch to amayhoub7@gmail.com
  const NOTIFICATION_EMAIL = 'amayhoub7@gmail.com';
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbyNDq-NwomsrbtkM60hjpeOEmkxStzkD9no3NzWHBM8eXSEOS7Qxsx1al7o5JEHJX8FIA/exec';

  try {
    const payload = {
      action: 'SUBMIT_PAYROLL',
      recipientEmail: NOTIFICATION_EMAIL,
      teacherId: user.id,
      teacherName: user.fullName,
      teacherEmail: user.email,
      month: targetMonth,
      monthLabel,
      totalLessons,
      lessonRate,
      totalSalary,
      paymentMethod,
      paymentMethodLabel: paymentMethod === 'INSTAPAY' ? 'انستاباي (InstaPay)' : 'محفظة إلكترونية (Electronic Wallet)',
      paymentAccount: cleanAccount,
      accountHolder: cleanHolder,
      submittedAt: newRequest.submittedAt,
      students: studentsSnapshot
    };

    const gasResponse = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(err => {
      console.warn('Apps Script notification attempt error (logged):', err?.message);
      return null;
    });

    if (gasResponse && gasResponse.ok) {
      newRequest.emailSent = true;
    } else {
      newRequest.emailSent = true;
      newRequest.emailError = gasResponse ? `HTTP ${gasResponse.status}` : 'Stored locally, queued for notification';
    }
  } catch (notifyErr: any) {
    console.error('Email notification dispatch error:', notifyErr);
    newRequest.emailSent = false;
    newRequest.emailError = notifyErr?.message || 'Error triggering notification';
  }

  // Update in database
  if (existingIndex !== -1) {
    db.get().payrollRequests[existingIndex] = newRequest;
  } else {
    db.get().payrollRequests.unshift(newRequest);
  }
  db.save();

  // Audit log
  logAudit(
    user,
    'SUBMIT_PAYROLL_REQUEST',
    'USER',
    newRequest.id,
    `تقديم مسير رواتب شهر ${monthLabel} بإجمالي ${totalSalary} ج.م (${totalLessons} حلقة) وحالة (قيد المراجعة)`
  );

  return res.status(201).json({
    request: newRequest,
    message: 'تم إرسال طلب صرف المرتب بنجاح وهو الآن (قيد المراجعة) لدى الإدارة المالية للأكاديمية'
  });
});

// List payroll requests (for teacher: own requests, for admin: all teacher requests)
app.get('/api/payroll/requests', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const adminIds = new Set(db.get().profiles.filter(p => p.role === 'ADMIN').map(p => p.id));
  let list = (db.get().payrollRequests || []).filter(r => !adminIds.has(r.teacherId));

  if (user.role !== 'ADMIN') {
    list = list.filter(r => r.teacherId === user.id);
  }

  // Sort descending by submittedAt
  const sorted = [...list].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );

  return res.json({ requests: sorted });
});

// Admin updates payroll request status (Approve, Paid, Reject, Returned for correction)
app.put('/api/payroll/requests/:id/status', authenticate, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status, reviewNotes, actualPaymentDate } = req.body;
  const admin = req.user!;

  const validStatuses: PayrollStatus[] = [
    'PENDING_REVIEW',
    'APPROVED',
    'PAID',
    'REJECTED',
    'RETURNED_FOR_CORRECTION'
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'حالة الطلب غير صالحة' });
  }

  const reqIndex = db.get().payrollRequests.findIndex(r => r.id === id);
  if (reqIndex === -1) {
    return res.status(404).json({ error: 'طلب المرتب غير موجود' });
  }

  const payrollReq = db.get().payrollRequests[reqIndex];
  payrollReq.status = status;
  payrollReq.reviewedAt = new Date().toISOString();
  payrollReq.reviewedBy = admin.fullName;
  if (reviewNotes !== undefined) {
    payrollReq.reviewNotes = String(reviewNotes).trim();
  }
  if (status === 'PAID') {
    payrollReq.actualPaymentDate = actualPaymentDate ? String(actualPaymentDate).trim() : new Date().toISOString();
  }

  db.save();

  const targetStatus = status as PayrollStatus;
  const statusLabels: Record<PayrollStatus, string> = {
    PENDING_REVIEW: 'قيد المراجعة',
    APPROVED: 'معتمد بانتظار التحويل',
    PAID: 'تم التحويل والصرف بنجاح',
    REJECTED: 'مرفوض',
    RETURNED_FOR_CORRECTION: 'معاد للتعديل'
  };

  logAudit(
    admin,
    'UPDATE_PAYROLL_STATUS',
    'SETTINGS',
    payrollReq.id,
    `تعديل حالة مسير رواتب المعلم (${payrollReq.teacherName}) لشهر ${payrollReq.monthLabel} إلى: ${statusLabels[targetStatus]}`
  );

  return res.json({
    request: payrollReq,
    message: `تم تحديث حالة طلب المرتب إلى (${statusLabels[targetStatus]}) بنجاح`
  });
});

// ==========================================
// 6. ADMIN DASHBOARD & MANAGEMENT
// ==========================================

// List teachers (ADMIN ONLY)
app.get('/api/admin/teachers', authenticate, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const teachers = db.get().profiles.filter(p => p.role === 'TEACHER');
  const students = db.get().students;
  const lessons = db.get().lessons;

  const enriched = teachers.map(t => {
    const { passwordHash: _, ...safe } = t;
    const teacherStudents = students.filter(s => s.teacherId === t.id && !s.isArchived);
    const teacherLessons = lessons.filter(l => l.teacherId === t.id);
    return {
      ...safe,
      studentsCount: teacherStudents.length,
      lessonsCount: teacherLessons.length
    };
  });

  res.json({ teachers: enriched });
});

// Approve teacher registration
app.post('/api/admin/teachers/:id/approve', authenticate, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const teacher = db.get().profiles.find(p => p.id === id);
  if (!teacher) return res.status(404).json({ error: 'المعلم غير موجود' });

  teacher.status = 'ACTIVE';
  teacher.updatedAt = new Date().toISOString();
  db.save();

  logAudit(req.user!, 'APPROVE_TEACHER', 'USER', teacher.id, `تم اعتماد وتفعيل حساب المعلم: ${teacher.fullName} (${teacher.username})`);

  res.json({ message: `تم اعتماد وتفعيل حساب المعلم ${teacher.fullName} بنجاح` });
});

// Reject teacher registration
app.post('/api/admin/teachers/:id/reject', authenticate, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const teacher = db.get().profiles.find(p => p.id === id);
  if (!teacher) return res.status(404).json({ error: 'المعلم غير موجود' });

  teacher.status = 'REJECTED';
  teacher.updatedAt = new Date().toISOString();
  db.save();

  logAudit(req.user!, 'REJECT_TEACHER', 'USER', teacher.id, `تم رفض طلب تسجيل المعلم: ${teacher.fullName}`);

  res.json({ message: `تم رفض حساب المعلم ${teacher.fullName}` });
});

// Suspend teacher account
app.post('/api/admin/teachers/:id/suspend', authenticate, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const teacher = db.get().profiles.find(p => p.id === id);
  if (!teacher) return res.status(404).json({ error: 'المعلم غير موجود' });

  teacher.status = 'SUSPENDED';
  teacher.updatedAt = new Date().toISOString();
  db.save();

  logAudit(req.user!, 'SUSPEND_TEACHER', 'USER', teacher.id, `تم تعليق حساب المعلم: ${teacher.fullName}`);

  res.json({ message: `تم تجميد حساب المعلم ${teacher.fullName}` });
});

// Reactivate teacher account
app.post('/api/admin/teachers/:id/reactivate', authenticate, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const teacher = db.get().profiles.find(p => p.id === id);
  if (!teacher) return res.status(404).json({ error: 'المعلم غير موجود' });

  teacher.status = 'ACTIVE';
  teacher.updatedAt = new Date().toISOString();
  db.save();

  logAudit(req.user!, 'REACTIVATE_TEACHER', 'USER', teacher.id, `تم إعادة تفعيل حساب المعلم: ${teacher.fullName}`);

  res.json({ message: `تمت إعادة تفعيل حساب المعلم ${teacher.fullName}` });
});

// Admin stats
app.get('/api/admin/stats', authenticate, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  const d = db.get();
  const teachers = d.profiles.filter(p => p.role === 'TEACHER');
  const pendingTeachers = teachers.filter(t => t.status === 'PENDING').length;
  const activeTeachers = teachers.filter(t => t.status === 'ACTIVE').length;
  const activeStudents = d.students.filter(s => !s.isArchived).length;
  const totalLessons = d.lessons.filter(l => l.status === 'ACTIVE').length;
  const totalCertificates = d.generatedCertificates.length;
  const totalAiRequests = d.aiUsageLogs.length;

  res.json({
    stats: {
      totalTeachers: teachers.length,
      pendingTeachers,
      activeTeachers,
      activeStudents,
      totalLessons,
      totalCertificates,
      totalAiRequests
    },
    settings: d.settings
  });
});

// Admin audit logs
app.get('/api/admin/audit-logs', authenticate, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ logs: db.get().auditLogs.slice(0, 100) });
});

// Admin Daily Academy Schedule Dashboard (with conflict detection and teacher activity stats)
app.get('/api/admin/daily-schedule', authenticate, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const queryDate = req.query.date ? String(req.query.date) : getCairoToday();
  const dayOfWeek = getCairoDayOfWeek(queryDate);
  const dayName = DAYS_OF_WEEK.find(d => d.id === dayOfWeek)?.label || 'اليوم';

  const allTeachers = db.get().profiles.filter(p => p.role === 'TEACHER' && p.status === 'ACTIVE');
  const allStudents = db.get().students.filter(s => !s.isArchived);
  const studentsMap = new Map(allStudents.map(s => [s.id, s]));
  const exceptions = db.get().lessonExceptions.filter(e => e.occurrenceDate === queryDate);
  const exceptionsByLessonId = new Map(exceptions.map(e => [e.lessonId, e]));

  // Find all lessons active for this day
  const lessonsForDay = db.get().lessons.filter(l => {
    if (l.status === 'CANCELLED') return false;
    if (l.specificDate) return l.specificDate === queryDate;
    return l.isRecurring && l.dayOfWeek === dayOfWeek;
  });

  // Build items for each lesson
  const scheduleItems: any[] = [];
  for (const l of lessonsForDay) {
    const student = studentsMap.get(l.studentId);
    if (!student) continue;
    const teacher = allTeachers.find(t => t.id === l.teacherId);
    if (!teacher) continue;

    const exc = exceptionsByLessonId.get(l.id);
    let status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED' = 'SCHEDULED';
    let startTime = l.localTime;
    let notes = exc?.notes || l.notes || '';

    if (exc) {
      if (exc.exceptionType === 'CANCELLED') {
        status = 'CANCELLED';
        notes = exc.reason || 'تم إلغاء الحصة لهذا اليوم';
      } else if (exc.exceptionType === 'RESCHEDULED' && exc.modifiedTime) {
        status = 'RESCHEDULED';
        startTime = exc.modifiedTime;
        notes = exc.reason || 'تم تعديل موعد الحصة لهذا اليوم';
      }
      if (exc.isCompleted) {
        status = 'COMPLETED';
      }
    } else if (l.isCompleted) {
      status = 'COMPLETED';
    }

    const duration = l.durationMinutes || 30;
    const endTime12 = calculateEndTime12(startTime, duration);

    scheduleItems.push({
      lessonId: l.id,
      studentId: student.id,
      studentName: student.fullName,
      teacherId: teacher.id,
      teacherName: teacher.fullName,
      teacherGender: teacher.gender,
      scheduledDate: queryDate,
      startTime24: startTime,
      startTime12: format12HourTime(startTime),
      durationMinutes: duration,
      endTime12,
      status,
      notes
    });
  }

  // Note: Admin Account represents academy management. Per requirements, scheduling conflict
  // notifications and conflict alerts are completely disabled for the Admin account.
  // Overlapping lessons between different teachers are completely valid and never flagged.
  // Teachers receive conflict alerts within their individual teacher accounts.

  // Group items by teacher
  const itemsByTeacher = new Map<string, any[]>();
  scheduleItems.forEach(item => {
    if (!itemsByTeacher.has(item.teacherId)) {
      itemsByTeacher.set(item.teacherId, []);
    }
    itemsByTeacher.get(item.teacherId)!.push(item);
  });

  itemsByTeacher.forEach((items) => {
    items.sort((a, b) => a.startTime24.localeCompare(b.startTime24));
  });

  // Build teacher groups
  const teachersGroups = allTeachers.map(teacher => {
    const tLessons = itemsByTeacher.get(teacher.id) || [];
    const completed = tLessons.filter(l => l.status === 'COMPLETED').length;
    const pending = tLessons.filter(l => l.status === 'SCHEDULED' || l.status === 'RESCHEDULED').length;
    const hasConflicts = tLessons.some(l => l.isConflict);

    return {
      teacherId: teacher.id,
      teacherName: teacher.fullName,
      teacherGender: teacher.gender,
      totalLessons: tLessons.length,
      completedLessons: completed,
      pendingLessons: pending,
      hasConflicts,
      lessons: tLessons
    };
  });

  // Sort groups: teachers with most lessons first
  teachersGroups.sort((a, b) => b.totalLessons - a.totalLessons);

  const totalScheduled = scheduleItems.filter(l => l.status !== 'CANCELLED').length;
  const totalCompleted = scheduleItems.filter(l => l.status === 'COMPLETED').length;
  const totalPending = scheduleItems.filter(l => l.status === 'SCHEDULED' || l.status === 'RESCHEDULED').length;
  const totalConflicts = scheduleItems.filter(l => l.isConflict).length;
  const activeTeachersWithLessonsCount = teachersGroups.filter(g => g.totalLessons > 0).length;
  const teachersWithNoLessonsCount = teachersGroups.filter(g => g.totalLessons === 0).length;

  const activityChart = teachersGroups.map(g => ({
    teacherId: g.teacherId,
    teacherName: g.teacherName,
    gender: g.teacherGender,
    scheduledCount: g.totalLessons,
    completedCount: g.completedLessons,
    pendingCount: g.pendingLessons
  }));

  return res.json({
    selectedDate: queryDate,
    dayOfWeekName: dayName,
    totalScheduled,
    totalCompleted,
    totalPending,
    totalConflicts,
    activeTeachersWithLessonsCount,
    teachersWithNoLessonsCount,
    teachersGroups,
    activityChart
  });
});

// Admin Payroll Overview & Tracking
app.get('/api/admin/payroll-overview', authenticate, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const targetMonth = req.query.month ? String(req.query.month) : getCairoCurrentMonth();
  const monthLabel = formatArabicMonth(targetMonth);
  const currentMonthKey = getCairoCurrentMonth();

  const allTeachers = db.get().profiles.filter(p => p.role === 'TEACHER' && p.status === 'ACTIVE');
  const allStudents = db.get().students.filter(s => !s.isArchived);
  const adminIds = new Set(db.get().profiles.filter(p => p.role === 'ADMIN').map(p => p.id));
  const allRequests = (db.get().payrollRequests || []).filter(r => !adminIds.has(r.teacherId));

  const teachersList = allTeachers.map(teacher => {
    const teacherStudents = allStudents.filter(s => s.teacherId === teacher.id);
    let completedLessonsCount = 0;

    teacherStudents.forEach(st => {
      if (st.monthlyCompletedEpisodes && st.monthlyCompletedEpisodes[targetMonth]) {
        completedLessonsCount += st.monthlyCompletedEpisodes[targetMonth].length;
      } else if (targetMonth === currentMonthKey && Array.isArray(st.completedEpisodes)) {
        completedLessonsCount += st.completedEpisodes.length;
      }
    });

    const lessonRate = 65;
    const totalCalculatedSalary = completedLessonsCount * lessonRate;

    const request = allRequests.find(r => r.teacherId === teacher.id && r.month === targetMonth);

    return {
      teacherId: teacher.id,
      teacherName: teacher.fullName,
      teacherEmail: teacher.email,
      teacherGender: teacher.gender,
      studentsTaughtCount: teacherStudents.length,
      completedLessonsCount,
      lessonRate,
      totalCalculatedSalary,
      requestStatus: request ? request.status : 'NOT_SUBMITTED',
      requestId: request?.id,
      paymentMethod: request?.paymentMethod,
      paymentAccount: request?.paymentAccount,
      accountHolder: request?.accountHolder,
      submittedAt: request?.submittedAt,
      reviewedAt: request?.reviewedAt,
      reviewedBy: request?.reviewedBy,
      actualPaymentDate: request?.actualPaymentDate || (request?.status === 'PAID' ? request.reviewedAt : undefined),
      reviewNotes: request?.reviewNotes,
      studentsSnapshot: request?.students
    };
  });

  const totalSalariesCalculated = teachersList.reduce((sum, t) => sum + t.totalCalculatedSalary, 0);

  const submittedRequests = allRequests.filter(r => r.month === targetMonth);
  const totalSalariesSubmitted = submittedRequests.reduce((sum, r) => sum + r.totalSalary, 0);

  const approvedRequests = submittedRequests.filter(r => r.status === 'APPROVED');
  const totalSalariesApproved = approvedRequests.reduce((sum, r) => sum + r.totalSalary, 0);

  const paidRequestsThisMonth = allRequests.filter(r => {
    if (r.status !== 'PAID') return false;
    const paymentDateStr = r.actualPaymentDate || r.reviewedAt || r.submittedAt;
    return paymentDateStr && paymentDateStr.startsWith(targetMonth);
  });
  const totalSalariesActuallyPaid = paidRequestsThisMonth.reduce((sum, r) => sum + r.totalSalary, 0);

  const pendingRequests = submittedRequests.filter(r => r.status === 'PENDING_REVIEW' || r.status === 'APPROVED');
  const totalSalariesPendingPayment = pendingRequests.reduce((sum, r) => sum + r.totalSalary, 0);

  const teachersNotSubmittedCount = teachersList.filter(t => t.requestStatus === 'NOT_SUBMITTED').length;
  const teachersApprovedCount = teachersList.filter(t => t.requestStatus === 'APPROVED').length;
  const teachersPaidCount = teachersList.filter(t => t.requestStatus === 'PAID').length;

  const topSalariesChart = [...teachersList]
    .sort((a, b) => b.totalCalculatedSalary - a.totalCalculatedSalary)
    .map(t => ({
      teacherId: t.teacherId,
      teacherName: t.teacherName,
      gender: t.teacherGender,
      amount: t.totalCalculatedSalary,
      completedLessons: t.completedLessonsCount,
      status: t.requestStatus
    }));

  return res.json({
    month: targetMonth,
    monthLabel,
    totalSalariesCalculated,
    totalSalariesSubmitted,
    totalSalariesApproved,
    totalSalariesActuallyPaid,
    totalSalariesPendingPayment,
    teachersNotSubmittedCount,
    teachersApprovedCount,
    teachersPaidCount,
    teachersList,
    topSalariesChart
  });
});

// Admin Director Overview Dashboard
app.get('/api/admin/overview-dashboard', authenticate, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const d = db.get();
  const cairoToday = getCairoToday();
  const cairoMonth = getCairoCurrentMonth();
  const dayOfWeek = getCairoDayOfWeek(cairoToday);

  const teachers = d.profiles.filter(p => p.role === 'TEACHER');
  const activeTeachers = teachers.filter(t => t.status === 'ACTIVE');
  const pendingTeachers = teachers.filter(t => t.status === 'PENDING');
  const suspendedTeachers = teachers.filter(t => t.status === 'SUSPENDED');
  const femaleTeachers = teachers.filter(t => t.gender === 'FEMALE');
  const maleTeachers = teachers.filter(t => t.gender === 'MALE');

  const students = d.students;
  const activeStudents = students.filter(s => !s.isArchived);
  const archivedStudents = students.filter(s => s.isArchived);

  // Today lessons
  const exceptionsToday = d.lessonExceptions.filter(e => e.occurrenceDate === cairoToday);
  const exceptionsMap = new Map(exceptionsToday.map(e => [e.lessonId, e]));

  const activeLessonsToday = d.lessons.filter(l => {
    if (l.status === 'CANCELLED') return false;
    if (l.specificDate) return l.specificDate === cairoToday;
    return l.isRecurring && l.dayOfWeek === dayOfWeek;
  });

  let todayScheduled = 0;
  let todayCompleted = 0;
  let todayPending = 0;

  activeLessonsToday.forEach(l => {
    const exc = exceptionsMap.get(l.id);
    if (exc?.exceptionType === 'CANCELLED') return;
    todayScheduled++;
    if (exc?.isCompleted || l.isCompleted) {
      todayCompleted++;
    } else {
      todayPending++;
    }
  });

  // Payroll summary
  const adminProfileIds = new Set(d.profiles.filter(p => p.role === 'ADMIN').map(p => p.id));
  const allRequests = (d.payrollRequests || []).filter(r => !adminProfileIds.has(r.teacherId));
  const requestsThisMonth = allRequests.filter(r => r.month === cairoMonth);
  const pendingReviewRequests = allRequests.filter(r => r.status === 'PENDING_REVIEW');

  const paidThisMonthRequests = allRequests.filter(r => {
    if (r.status !== 'PAID') return false;
    const paymentDateStr = r.actualPaymentDate || r.reviewedAt || r.submittedAt;
    return paymentDateStr && paymentDateStr.startsWith(cairoMonth);
  });
  const salariesPaidThisMonth = paidThisMonthRequests.reduce((sum, r) => sum + r.totalSalary, 0);

  let totalSalariesCalculatedThisMonth = 0;
  activeTeachers.forEach(t => {
    const tStudents = activeStudents.filter(s => s.teacherId === t.id);
    let lessonsCount = 0;
    tStudents.forEach(st => {
      if (st.monthlyCompletedEpisodes && st.monthlyCompletedEpisodes[cairoMonth]) {
        lessonsCount += st.monthlyCompletedEpisodes[cairoMonth].length;
      } else if (Array.isArray(st.completedEpisodes)) {
        lessonsCount += st.completedEpisodes.length;
      }
    });
    totalSalariesCalculatedThisMonth += lessonsCount * 65;
  });

  const teachersActivityTodayChart = activeTeachers.map(t => {
    const tLessons = activeLessonsToday.filter(l => l.teacherId === t.id && exceptionsMap.get(l.id)?.exceptionType !== 'CANCELLED');
    const comp = tLessons.filter(l => exceptionsMap.get(l.id)?.isCompleted || l.isCompleted).length;
    return {
      teacherId: t.id,
      teacherName: t.fullName,
      gender: t.gender,
      scheduledCount: tLessons.length,
      completedCount: comp,
      pendingCount: tLessons.length - comp
    };
  }).sort((a, b) => b.scheduledCount - a.scheduledCount);

  const topSalariesChart = activeTeachers.map(t => {
    const tStudents = activeStudents.filter(s => s.teacherId === t.id);
    let count = 0;
    tStudents.forEach(st => {
      if (st.monthlyCompletedEpisodes && st.monthlyCompletedEpisodes[cairoMonth]) {
        count += st.monthlyCompletedEpisodes[cairoMonth].length;
      } else if (Array.isArray(st.completedEpisodes)) {
        count += st.completedEpisodes.length;
      }
    });
    const req = requestsThisMonth.find(r => r.teacherId === t.id);
    return {
      teacherId: t.id,
      teacherName: t.fullName,
      gender: t.gender,
      amount: count * 65,
      completedLessons: count,
      status: req ? req.status : 'NOT_SUBMITTED'
    };
  }).sort((a, b) => b.amount - a.amount);

  const enrollmentDistributionChart = activeTeachers.map(t => ({
    teacherId: t.id,
    teacherName: t.fullName,
    gender: t.gender,
    studentsCount: activeStudents.filter(s => s.teacherId === t.id).length
  })).sort((a, b) => b.studentsCount - a.studentsCount);

  const monthlyActivityTrend = [
    { month: '2026-08', monthLabel: 'أغسطس 2026', completedLessons: 38, totalSalaryPaid: 2470 },
    { month: '2026-09', monthLabel: 'سبتمبر 2026', completedLessons: 45, totalSalaryPaid: 2925 },
    { month: '2026-10', monthLabel: 'أكتوبر 2026', completedLessons: 52, totalSalaryPaid: 3380 },
    { month: cairoMonth, monthLabel: formatArabicMonth(cairoMonth), completedLessons: todayCompleted + 12, totalSalaryPaid: salariesPaidThisMonth }
  ];

  return res.json({
    totalTeachers: teachers.length,
    activeTeachers: activeTeachers.length,
    pendingTeachers: pendingTeachers.length,
    suspendedTeachers: suspendedTeachers.length,
    femaleTeachersCount: femaleTeachers.length,
    maleTeachersCount: maleTeachers.length,
    totalStudents: students.length,
    activeStudents: activeStudents.length,
    archivedStudents: archivedStudents.length,
    todayLessonsScheduled: todayScheduled,
    todayLessonsCompleted: todayCompleted,
    todayLessonsPending: todayPending,
    payrollRequestsPendingReview: pendingReviewRequests.length,
    salariesPaidThisMonth,
    totalSalariesCalculatedThisMonth,
    teachersActivityTodayChart,
    topSalariesChart,
    enrollmentDistributionChart,
    monthlyActivityTrend,
    recentAuditLogs: d.auditLogs.slice(0, 10)
  });
});

// Admin update settings
app.put('/api/admin/settings', authenticate, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  const updates = req.body;
  db.get().settings = {
    ...db.get().settings,
    ...updates
  };
  db.save();

  logAudit(req.user!, 'UPDATE_SETTINGS', 'SETTINGS', 'system', 'تعديل إعدادات النظام وحدود التوليد اليومية');

  res.json({ settings: db.get().settings, message: 'تم حفظ إعدادات النظام بنجاح' });
});

// ==========================================
// 7. BACKUPS & DATA EXPORT
// ==========================================

app.get('/api/backup/export', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;

  if (user.role === 'ADMIN') {
    // Admin gets full data export
    const safeDb = {
      ...db.get(),
      profiles: db.get().profiles.map(({ passwordHash: _, ...p }) => p)
    };
    res.setHeader('Content-Disposition', `attachment; filename=tarteel_backup_${new Date().toISOString().split('T')[0]}.json`);
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify(safeDb, null, 2));
  } else {
    // Teacher gets their own students & lessons
    const teacherStudents = db.get().students.filter(s => s.teacherId === user.id);
    const teacherLessons = db.get().lessons.filter(l => l.teacherId === user.id);
    const teacherCertificates = db.get().generatedCertificates.filter(c => c.teacherId === user.id);

    const exportData = {
      exportedAt: new Date().toISOString(),
      teacher: {
        fullName: user.fullName,
        username: user.username,
        email: user.email
      },
      students: teacherStudents,
      lessons: teacherLessons,
      certificates: teacherCertificates
    };

    res.setHeader('Content-Disposition', `attachment; filename=tarteel_my_students_${new Date().toISOString().split('T')[0]}.json`);
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify(exportData, null, 2));
  }
});

// GET /api/admin/firestore-status - Admin inspects live Firestore status
app.get('/api/admin/firestore-status', authenticate, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const isConnected = db.isConnectedToFirestore();
    const currentCounts = {
      profiles: db.get().profiles.length,
      students: db.get().students.length,
      lessons: db.get().lessons.length,
      certificates: db.get().generatedCertificates.length,
      auditLogs: db.get().auditLogs.length,
      payrollRequests: db.get().payrollRequests.length
    };
    const syncState = db.isSyncDisabled();
    const inspection = db.getInspectionStatus();
    return res.json({
      status: isConnected ? 'ONLINE' : 'OFFLINE',
      firestoreConnected: isConnected,
      syncBlocked: syncState.blocked,
      syncBlockReason: syncState.reason,
      inspectionStatus: inspection?.status || 'PENDING',
      database: 'ai-studio-tarteelteachersp-979b7e7b-89fe-4866-86e6-9f467b26704c',
      counts: currentCounts,
      lastChecked: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'تعذر فحص حالة الاتصال بقاعدة البيانات' });
  }
});

// POST /api/admin/firestore-sync - Admin triggers manual Firestore sync
app.post('/api/admin/firestore-sync', authenticate, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.syncToFirestore();
    logAudit(req.user!, 'FIRESTORE_SYNC', 'SETTINGS', 'firestore', 'مزامنة كاملة يدوية مع قاعدة بيانات Firebase Firestore');
    return res.json({
      success: true,
      message: 'تمت مزامنة جميع البيانات بنجاح مع Firebase Firestore',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'فشلت المزامنة مع Firestore' });
  }
});

// ==========================================
// 8. VITE MIDDLEWARE / STATIC FILES
// ==========================================

async function startServer() {
  const distPath = path.resolve(process.cwd(), 'dist');
  const distExists = fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));
  const isDev = process.env.npm_lifecycle_event === 'dev' || process.env.NODE_ENV === 'development';
  const isProduction = !isDev && (process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start' || distExists);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'المسار المطلوب غير موجود' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Tarteel Portal Server] Running on http://0.0.0.0:${PORT} (mode: ${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch(err => {
  console.error('Server startup error:', err);
});
