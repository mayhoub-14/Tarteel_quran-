export type TeacherGender = 'MALE' | 'FEMALE';

export interface UserProfile {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'TEACHER';
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  gender?: TeacherGender; // MALE: "فضيلة المعلم / الأستاذ" | FEMALE: "فضيلة المعلمة / الأستاذة"
  preferredTimeZone: string;
  createdAt: string;
  updatedAt: string;
  studentsCount?: number;
  lessonsCount?: number;
}

export type ProgressStatus = 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED' | 'NEEDS_REVISION';

export interface QuranProgress {
  completedSurahs: string[]; // e.g. ["الفاتحة", "البقرة", "جزء عم"]
  currentSurah: string; // e.g. "آل عمران"
  completedPortion: string; // e.g. "الآيات 1-50"
  currentPortion?: string; // e.g. "الجزء الثالث"
  remainingMemorization: string; // e.g. "باقي السورة حتى الآية 200"
  revisionProgress: string; // e.g. "مراجعة متقنة لجزء عم وتبارك"
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
  durationMinutes: number; // 30-40 (default 30)
  studyDaysPerWeek?: number; // 1-7 days per week (each day generates 4 episodes)
  completedEpisodes?: number[]; // list of completed episode numbers, e.g. [1, 2, 3]
  monthlyCompletedEpisodes?: { [monthKey: string]: number[] }; // monthly completion records
  quranProgress?: QuranProgress;
  assignmentHistory?: TeacherAssignmentRecord[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  lessons?: Lesson[];
  assignedTeacher?: {
    id: string;
    fullName: string;
    gender?: TeacherGender;
    username: string;
    email: string;
  };
}

export interface Lesson {
  id: string;
  studentId: string;
  teacherId: string;
  dayOfWeek: number; // 0..6
  localTime: string; // HH:mm
  timeZone: string;
  durationMinutes: number;
  isRecurring: boolean;
  specificDate?: string;
  notes?: string;
  isCompleted?: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
  student?: Student | null;
  teacher?: {
    id: string;
    fullName: string;
    gender?: TeacherGender;
    username: string;
  } | null;
}

export interface LessonException {
  id: string;
  lessonId: string;
  teacherId: string;
  occurrenceDate: string; // YYYY-MM-DD
  exceptionType: 'CANCELLED' | 'RESCHEDULED';
  modifiedTime?: string;
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
  nameX: number;
  nameY: number;
  nameFontSize: number;
  nameColor: string;
  achievementX: number;
  achievementY: number;
  achievementFontSize: number;
  achievementColor: string;
  prefixText: string;
  maskX: number;
  maskY: number;
  maskWidth: number;
  maskHeight: number;
  updatedAt: string;
}

export interface GeneratedCertificate {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherGender?: TeacherGender;
  studentName: string;
  achievement: string;
  templateVersion: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface SystemStats {
  totalTeachers: number;
  pendingTeachers: number;
  activeTeachers: number;
  activeStudents: number;
  totalLessons: number;
  totalCertificates: number;
  totalAiRequests: number;
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
  monthLabel: string; // Arabic label, e.g. "نوفمبر 2026"
  students: StudentPayrollBreakdown[];
  totalLessons: number;
  lessonRate: number; // 65
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

export interface AdminDailyScheduleItem {
  lessonId: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  teacherGender?: TeacherGender;
  scheduledDate: string; // YYYY-MM-DD
  startTime24: string;
  startTime12: string;
  durationMinutes: number;
  endTime12: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';
  notes?: string;
  isConflict?: boolean;
  conflictReason?: string;
}

export interface AdminTeacherScheduleGroup {
  teacherId: string;
  teacherName: string;
  teacherGender?: TeacherGender;
  totalLessons: number;
  completedLessons: number;
  pendingLessons: number;
  hasConflicts: boolean;
  lessons: AdminDailyScheduleItem[];
}

export interface AdminDailyScheduleResponse {
  selectedDate: string; // YYYY-MM-DD
  dayOfWeekName: string; // e.g. "الثلاثاء"
  totalScheduled: number;
  totalCompleted: number;
  totalPending: number;
  totalConflicts: number;
  activeTeachersWithLessonsCount: number;
  teachersWithNoLessonsCount: number;
  teachersGroups: AdminTeacherScheduleGroup[];
  activityChart: {
    teacherId: string;
    teacherName: string;
    gender?: TeacherGender;
    scheduledCount: number;
    completedCount: number;
    pendingCount: number;
  }[];
}

export interface TeacherPayrollOverviewItem {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  teacherGender?: TeacherGender;
  studentsTaughtCount: number;
  completedLessonsCount: number;
  lessonRate: number; // 65
  totalCalculatedSalary: number;
  requestStatus: 'NOT_SUBMITTED' | PayrollStatus;
  requestId?: string;
  paymentMethod?: PaymentMethod;
  paymentAccount?: string;
  accountHolder?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  actualPaymentDate?: string;
  reviewNotes?: string;
  studentsSnapshot?: StudentPayrollBreakdown[];
}

export interface AdminPayrollOverviewResponse {
  month: string; // YYYY-MM
  monthLabel: string; // e.g. "نوفمبر 2026"
  totalSalariesCalculated: number;
  totalSalariesSubmitted: number;
  totalSalariesApproved: number;
  totalSalariesActuallyPaid: number;
  totalSalariesPendingPayment: number;
  teachersNotSubmittedCount: number;
  teachersApprovedCount: number;
  teachersPaidCount: number;
  teachersList: TeacherPayrollOverviewItem[];
  topSalariesChart: {
    teacherId: string;
    teacherName: string;
    gender?: TeacherGender;
    amount: number;
    completedLessons: number;
    status: string;
  }[];
}

export interface AdminDirectorDashboardStats {
  totalTeachers: number;
  activeTeachers: number;
  pendingTeachers: number;
  suspendedTeachers: number;
  femaleTeachersCount: number;
  maleTeachersCount: number;
  totalStudents: number;
  activeStudents: number;
  archivedStudents: number;
  todayLessonsScheduled: number;
  todayLessonsCompleted: number;
  todayLessonsPending: number;
  payrollRequestsPendingReview: number;
  salariesPaidThisMonth: number;
  totalSalariesCalculatedThisMonth: number;
  teachersActivityTodayChart: {
    teacherId: string;
    teacherName: string;
    gender?: TeacherGender;
    scheduledCount: number;
    completedCount: number;
    pendingCount: number;
  }[];
  topSalariesChart: {
    teacherId: string;
    teacherName: string;
    gender?: TeacherGender;
    amount: number;
    completedLessons: number;
    status: string;
  }[];
  enrollmentDistributionChart: {
    teacherId: string;
    teacherName: string;
    gender?: TeacherGender;
    studentsCount: number;
  }[];
  monthlyActivityTrend: {
    month: string;
    monthLabel: string;
    completedLessons: number;
    totalSalaryPaid: number;
  }[];
  recentAuditLogs: AuditLog[];
}

