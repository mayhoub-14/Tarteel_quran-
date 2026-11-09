import {
  UserProfile,
  Student,
  Lesson,
  LessonException,
  CertificateTemplateConfig,
  GeneratedCertificate,
  AuditLog,
  SystemStats,
  SystemSettings,
  PayrollRequest,
  StudentPayrollBreakdown,
  PayrollStatus,
  PaymentMethod,
  QuranProgress,
  AdminDailyScheduleResponse,
  AdminPayrollOverviewResponse,
  AdminDirectorDashboardStats
} from '../types';

let cachedToken: string | null = null;

export function setAuthToken(token: string | null) {
  cachedToken = token;
  if (token) {
    localStorage.setItem('tarteel_token', token);
  } else {
    localStorage.removeItem('tarteel_token');
  }
}

export function getAuthToken(): string | null {
  if (!cachedToken) {
    cachedToken = localStorage.getItem('tarteel_token');
  }
  return cachedToken;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error || 'حدث خطأ أثناء معالجة الطلب، يرجى المحاولة مرة أخرى';
    const err = new Error(errorMsg) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  return data as T;
}

export const api = {
  // Auth
  async login(identifier: string, password: string, rememberMe: boolean) {
    const res = await request<{ token: string; user: UserProfile; message: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, rememberMe }),
    });
    setAuthToken(res.token);
    return res;
  },

  async firebaseLogin(idToken: string) {
    const res = await request<{ token: string; user: UserProfile; message: string }>('/api/auth/firebase-login', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    setAuthToken(res.token);
    return res;
  },

  async requestPasswordReset(email: string) {
    return request<{ message: string; setupToken?: string; expiresAt?: string }>('/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async setupPassword(data: { token: string; newPassword: string; confirmPassword: string }) {
    return request<{ message: string }>('/api/auth/setup-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async register(data: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
    gender: 'MALE' | 'FEMALE';
  }) {
    return request<{ message: string; status: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getMe() {
    return request<{ user: UserProfile }>('/api/auth/me');
  },

  async logout() {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async updateProfile(data: { fullName?: string; preferredTimeZone?: string; gender?: 'MALE' | 'FEMALE' }) {
    return request<{ user: UserProfile; message: string }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Students
  async getStudents(includeArchived = false, teacherId?: string) {
    const q = new URLSearchParams();
    q.set('includeArchived', String(includeArchived));
    if (teacherId) q.set('teacherId', teacherId);
    return request<{ students: Student[] }>(`/api/students?${q.toString()}`);
  },

  async updateStudentProgress(studentId: string, progress: Partial<QuranProgress>) {
    return request<{ student: Student; quranProgress: QuranProgress; message: string }>(
      `/api/students/${studentId}/progress`,
      {
        method: 'PUT',
        body: JSON.stringify(progress),
      }
    );
  },

  async reassignStudentTeacher(studentId: string, newTeacherId: string, reason?: string) {
    return request<{ student: Student; message: string }>(
      `/api/students/${studentId}/reassign-teacher`,
      {
        method: 'PUT',
        body: JSON.stringify({ newTeacherId, reason }),
      }
    );
  },

  async createStudent(student: {
    fullName: string;
    country: string;
    timeZone: string;
    durationMinutes?: number;
    studyDaysPerWeek?: number;
    lessonSchedules: { dayOfWeek: number; localTime: string }[];
  }) {
    return request<{ student: Student; message: string }>('/api/students', {
      method: 'POST',
      body: JSON.stringify(student),
    });
  },

  async updateStudent(id: string, student: {
    fullName?: string;
    country?: string;
    timeZone?: string;
    durationMinutes?: number;
    studyDaysPerWeek?: number;
    completedEpisodes?: number[];
    lessonSchedules?: { dayOfWeek: number; localTime: string }[];
  }) {
    return request<{ message: string }>(`/api/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(student),
    });
  },

  async toggleStudentEpisode(studentId: string, episodeNumber: number, month?: string) {
    return request<{ completedEpisodes: number[]; monthlyCompletedEpisodes?: { [m: string]: number[] }; isCompleted: boolean; message: string }>(
      `/api/students/${studentId}/toggle-episode`,
      {
        method: 'POST',
        body: JSON.stringify({ episodeNumber, month }),
      }
    );
  },

  async resetStudentEpisodes(studentId: string) {
    return request<{ completedEpisodes: number[]; message: string }>(
      `/api/students/${studentId}/reset-episodes`,
      {
        method: 'POST',
      }
    );
  },

  async archiveStudent(id: string) {
    return request<{ message: string }>(`/api/students/${id}/archive`, {
      method: 'POST',
    });
  },

  async restoreStudent(id: string) {
    return request<{ message: string }>(`/api/students/${id}/restore`, {
      method: 'POST',
    });
  },

  async deleteStudent(id: string) {
    return request<{ message: string }>(`/api/students/${id}`, {
      method: 'DELETE',
    });
  },

  // Lessons
  async getLessons(teacherId?: string, date?: string) {
    const q = new URLSearchParams();
    if (teacherId) q.set('teacherId', teacherId);
    if (date) q.set('date', date);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<{ lessons: Lesson[]; exceptions: LessonException[] }>(`/api/lessons${qs}`);
  },

  async addLesson(data: {
    studentId: string;
    dayOfWeek: number;
    localTime: string;
    durationMinutes: number;
  }) {
    return request<{ lesson: Lesson; hasConflict: boolean; warning?: string; message: string }>(
      '/api/lessons',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  },

  async addLessonException(data: {
    lessonId: string;
    occurrenceDate: string;
    exceptionType: 'CANCELLED' | 'RESCHEDULED';
    modifiedTime?: string;
    reason?: string;
  }) {
    return request<{ message: string; exception: LessonException }>('/api/lessons/exceptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Certificates
  async getCertificateTemplate() {
    return request<{ template: CertificateTemplateConfig }>('/api/certificates/template');
  },

  async updateCertificateTemplate(updates: Partial<CertificateTemplateConfig>) {
    return request<{ template: CertificateTemplateConfig; message: string }>('/api/certificates/template', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async logGeneratedCertificate(studentName: string, achievement: string) {
    return request<{ message: string; certificate: GeneratedCertificate }>('/api/certificates/log', {
      method: 'POST',
      body: JSON.stringify({ studentName, achievement }),
    });
  },

  async getCertificateHistory() {
    return request<{ certificates: GeneratedCertificate[] }>('/api/certificates/history');
  },

  // AI Assistant
  async generateEducationalImage(prompt: string) {
    return request<{ imageUrl: string; prompt: string; remainingToday?: number; note?: string }>(
      '/api/ai/generate',
      {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      }
    );
  },

  // Admin
  async getTeachers() {
    return request<{ teachers: UserProfile[] }>('/api/admin/teachers');
  },

  async approveTeacher(id: string) {
    return request<{ message: string }>(`/api/admin/teachers/${id}/approve`, { method: 'POST' });
  },

  async rejectTeacher(id: string) {
    return request<{ message: string }>(`/api/admin/teachers/${id}/reject`, { method: 'POST' });
  },

  async suspendTeacher(id: string) {
    return request<{ message: string }>(`/api/admin/teachers/${id}/suspend`, { method: 'POST' });
  },

  async reactivateTeacher(id: string) {
    return request<{ message: string }>(`/api/admin/teachers/${id}/reactivate`, { method: 'POST' });
  },

  async getAdminStats() {
    return request<{ stats: SystemStats; settings: SystemSettings }>('/api/admin/stats');
  },

  async getAuditLogs() {
    return request<{ logs: AuditLog[] }>('/api/admin/audit-logs');
  },

  async updateSettings(settings: Partial<SystemSettings>) {
    return request<{ settings: SystemSettings; message: string }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  // Backups
  getBackupDownloadUrl() {
    const token = getAuthToken();
    return `/api/backup/export?token=${token || ''}`;
  },

  // Payroll & Salaries
  async calculateSalary(month: string) {
    return request<{
      month: string;
      monthLabel: string;
      students: StudentPayrollBreakdown[];
      totalLessons: number;
      lessonRate: number;
      totalSalary: number;
      existingRequest: PayrollRequest | null;
      canSubmit: boolean;
    }>('/api/payroll/calculate', {
      method: 'POST',
      body: JSON.stringify({ month }),
    });
  },

  async submitPayroll(data: {
    month: string;
    paymentMethod: PaymentMethod;
    paymentAccount: string;
    accountHolder: string;
  }) {
    return request<{
      request: PayrollRequest;
      message: string;
    }>('/api/payroll/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getPayrollRequests() {
    return request<{ requests: PayrollRequest[] }>('/api/payroll/requests');
  },

  async updatePayrollStatus(id: string, status: PayrollStatus, reviewNotes?: string, actualPaymentDate?: string) {
    return request<{ request: PayrollRequest; message: string }>(`/api/payroll/requests/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, reviewNotes, actualPaymentDate }),
    });
  },

  // Admin Super Dashboard
  async getAdminDailySchedule(date?: string) {
    const qs = date ? `?date=${date}` : '';
    return request<AdminDailyScheduleResponse>(`/api/admin/daily-schedule${qs}`);
  },

  async getAdminPayrollOverview(month?: string) {
    const qs = month ? `?month=${month}` : '';
    return request<AdminPayrollOverviewResponse>(`/api/admin/payroll-overview${qs}`);
  },

  async getAdminDirectorDashboardStats() {
    return request<AdminDirectorDashboardStats>('/api/admin/overview-dashboard');
  },

  // Firebase Auth and Firestore Integration
  async getFirestoreStatus() {
    return request<{
      status: string;
      firestoreConnected: boolean;
      database: string;
      counts: {
        profiles: number;
        students: number;
        lessons: number;
        certificates: number;
        auditLogs: number;
        payrollRequests: number;
      };
      lastChecked: string;
    }>('/api/admin/firestore-status');
  },

  async triggerFirestoreSync() {
    return request<{
      success: boolean;
      message: string;
      timestamp: string;
    }>('/api/admin/firestore-sync', {
      method: 'POST',
    });
  }
};
