import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import {
  UserProfile,
  Student,
  Lesson,
  LessonException,
  AuditLog,
  CertificateTemplateConfig,
  QuranProgress,
  ProgressStatus,
  AdminDirectorDashboardStats,
  AdminDailyScheduleResponse,
  AdminPayrollOverviewResponse,
  TeacherPayrollOverviewItem,
  PayrollStatus
} from '../types';
import {
  getCairoToday,
  getCairoCurrentMonth,
  addDays,
  formatArabicDateHeader,
  isDateStale,
  DAYS_OF_WEEK
} from '../utils/timezone';
import {
  ShieldAlert,
  Users,
  Check,
  X,
  FileText,
  Award,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Layers,
  Banknote,
  BookOpen,
  Clock,
  ChevronRight,
  ChevronLeft,
  Search,
  Filter,
  UserCheck,
  AlertTriangle,
  RotateCcw,
  Eye,
  ArrowRightLeft,
  CalendarDays,
  TrendingUp,
  CreditCard,
  DollarSign,
  PieChart,
  BarChart3,
  Sliders,
  CheckSquare,
  Sparkles,
  Database
} from 'lucide-react';

export const AdminPage: React.FC = () => {
  // Navigation tabs for the Academy Director
  const [activeTab, setActiveTab] = useState<
    'overview' | 'teachers-students' | 'quran-progress' | 'daily-schedule' | 'payroll' | 'settings-logs'
  >('overview');

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data states
  const [dashboardStats, setDashboardStats] = useState<AdminDirectorDashboardStats | null>(null);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [template, setTemplate] = useState<CertificateTemplateConfig | null>(null);

  // Tab 2: Teachers & Students filters
  const [teacherFilter, setTeacherFilter] = useState<string>('ALL');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [studentProgressFilter, setStudentProgressFilter] = useState<string>('ALL');
  const [selectedTeacherForStudents, setSelectedTeacherForStudents] = useState<UserProfile | null>(null);

  // Modals for Student Management
  const [reassignModalStudent, setReassignModalStudent] = useState<Student | null>(null);
  const [newTeacherId, setNewTeacherId] = useState<string>('');
  const [reassignReason, setReassignReason] = useState<string>('');
  const [reassigning, setReassigning] = useState<boolean>(false);

  const [progressModalStudent, setProgressModalStudent] = useState<Student | null>(null);
  const [currentSurahInput, setCurrentSurahInput] = useState<string>('');
  const [completedPortionInput, setCompletedPortionInput] = useState<string>('');
  const [remainingInput, setRemainingInput] = useState<string>('');
  const [revisionInput, setRevisionInput] = useState<string>('');
  const [progressStatusInput, setProgressStatusInput] = useState<ProgressStatus>('IN_PROGRESS');
  const [completedSurahsList, setCompletedSurahsList] = useState<string[]>([]);
  const [newSurahTag, setNewSurahTag] = useState<string>('');
  const [teacherNotesInput, setTeacherNotesInput] = useState<string>('');
  const [savingProgress, setSavingProgress] = useState<boolean>(false);

  // Tab 4: Daily Schedule State
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string>(getCairoToday());
  const [scheduleData, setScheduleData] = useState<AdminDailyScheduleResponse | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState<boolean>(false);

  // Tab 5: Payroll State
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState<string>(getCairoCurrentMonth());
  const [payrollOverview, setPayrollOverview] = useState<AdminPayrollOverviewResponse | null>(null);
  const [loadingPayroll, setLoadingPayroll] = useState<boolean>(false);
  const [payrollStatusModalTeacher, setPayrollStatusModalTeacher] = useState<TeacherPayrollOverviewItem | null>(null);
  const [newPayrollStatus, setNewPayrollStatus] = useState<PayrollStatus>('APPROVED');
  const [payrollReviewNotes, setPayrollReviewNotes] = useState<string>('');
  const [actualPaymentDateInput, setActualPaymentDateInput] = useState<string>(getCairoToday());
  const [updatingPayrollStatus, setUpdatingPayrollStatus] = useState<boolean>(false);
  const [viewPayrollSnapshot, setViewPayrollSnapshot] = useState<TeacherPayrollOverviewItem | null>(null);

  // Tab 6: Template Coordinates
  const [nameY, setNameY] = useState(725);
  const [nameFontSize, setNameFontSize] = useState(60);
  const [nameColor, setNameColor] = useState('#111827');
  const [achievementY, setAchievementY] = useState(815);
  const [achievementFontSize, setAchievementFontSize] = useState(38);
  const [achievementColor, setAchievementColor] = useState('#065F46');
  const [prefixText, setPrefixText] = useState('تقديرا لتفوقها في');
  const [maskY, setMaskY] = useState(640);
  const [maskHeight, setMaskHeight] = useState(215);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Firestore State
  const [firestoreStatus, setFirestoreStatus] = useState<{
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
  } | null>(null);
  const [loadingFirestoreStatus, setLoadingFirestoreStatus] = useState<boolean>(false);
  const [syncingFirestore, setSyncingFirestore] = useState<boolean>(false);

  // Initial load
  useEffect(() => {
    loadAllAdminData();
    refreshFirestoreStatus();
  }, []);

  const refreshFirestoreStatus = async () => {
    setLoadingFirestoreStatus(true);
    try {
      const status = await api.getFirestoreStatus();
      setFirestoreStatus(status);
    } catch (err: any) {
      console.warn('Error fetching Firestore status:', err);
    } finally {
      setLoadingFirestoreStatus(false);
    }
  };

  const handleManualFirestoreSync = async () => {
    setSyncingFirestore(true);
    setError(null);
    try {
      const res = await api.triggerFirestoreSync();
      setSuccess(res.message || 'تمت المزامنة الكاملة مع Firebase Firestore بنجاح');
      await refreshFirestoreStatus();
      await loadAllAdminData();
    } catch (err: any) {
      setError(err?.message || 'فشلت المزامنة مع قاعدة بيانات Firebase');
    } finally {
      setSyncingFirestore(false);
    }
  };

  // When schedule date changes
  useEffect(() => {
    if (activeTab === 'daily-schedule') {
      loadScheduleForDate(selectedScheduleDate);
    }
  }, [selectedScheduleDate, activeTab]);

  // When payroll month changes
  useEffect(() => {
    if (activeTab === 'payroll') {
      loadPayrollForMonth(selectedPayrollMonth);
    }
  }, [selectedPayrollMonth, activeTab]);

  const loadAllAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, teachersRes, studentsRes, logsRes, tplRes] = await Promise.all([
        api.getAdminDirectorDashboardStats(),
        api.getTeachers(),
        api.getStudents(true), // include archived for full visibility
        api.getAuditLogs(),
        api.getCertificateTemplate()
      ]);

      setDashboardStats(statsRes);
      setTeachers(teachersRes.teachers || []);
      setStudents(studentsRes.students || []);
      setAuditLogs(logsRes.logs || []);

      if (tplRes.template) {
        setTemplate(tplRes.template);
        setNameY(tplRes.template.nameY);
        setNameFontSize(tplRes.template.nameFontSize);
        setNameColor(tplRes.template.nameColor);
        setAchievementY(tplRes.template.achievementY);
        setAchievementFontSize(tplRes.template.achievementFontSize);
        setAchievementColor(tplRes.template.achievementColor);
        setPrefixText(tplRes.template.prefixText);
        setMaskY(tplRes.template.maskY);
        setMaskHeight(tplRes.template.maskHeight);
      }
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل بيانات الإدارة العامة');
    } finally {
      setLoading(false);
    }
  };

  const loadScheduleForDate = async (dateStr: string) => {
    setLoadingSchedule(true);
    try {
      const res = await api.getAdminDailySchedule(dateStr);
      setScheduleData(res);
    } catch (err: any) {
      console.error('Error loading daily schedule:', err);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const loadPayrollForMonth = async (monthStr: string) => {
    setLoadingPayroll(true);
    try {
      const res = await api.getAdminPayrollOverview(monthStr);
      setPayrollOverview(res);
    } catch (err: any) {
      console.error('Error loading payroll overview:', err);
    } finally {
      setLoadingPayroll(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllAdminData();
    if (activeTab === 'daily-schedule') await loadScheduleForDate(selectedScheduleDate);
    if (activeTab === 'payroll') await loadPayrollForMonth(selectedPayrollMonth);
    setRefreshing(false);
  };

  // Reassign student
  const handleOpenReassignModal = (student: Student) => {
    setReassignModalStudent(student);
    setNewTeacherId(student.teacherId);
    setReassignReason('');
  };

  const handleConfirmReassign = async () => {
    if (!reassignModalStudent || !newTeacherId) return;
    setReassigning(true);
    try {
      await api.reassignStudentTeacher(reassignModalStudent.id, newTeacherId, reassignReason);
      setSuccess(`تمت إعادة إسناد الطالب (${reassignModalStudent.fullName}) بنجاح`);
      setReassignModalStudent(null);
      await loadAllAdminData();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'تعذر إعادة إسناد الطالب');
    } finally {
      setReassigning(false);
    }
  };

  // Progress modal
  const handleOpenProgressModal = (student: Student) => {
    setProgressModalStudent(student);
    const p = student.quranProgress;
    setCurrentSurahInput(p?.currentSurah || '');
    setCompletedPortionInput(p?.completedPortion || '');
    setRemainingInput(p?.remainingMemorization || '');
    setRevisionInput(p?.revisionProgress || '');
    setProgressStatusInput(p?.status || 'IN_PROGRESS');
    setCompletedSurahsList(p?.completedSurahs || []);
    setTeacherNotesInput(p?.notes || '');
    setNewSurahTag('');
  };

  const handleAddSurahTag = () => {
    if (!newSurahTag.trim()) return;
    if (!completedSurahsList.includes(newSurahTag.trim())) {
      setCompletedSurahsList([...completedSurahsList, newSurahTag.trim()]);
    }
    setNewSurahTag('');
  };

  const handleRemoveSurahTag = (tag: string) => {
    setCompletedSurahsList(completedSurahsList.filter(s => s !== tag));
  };

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progressModalStudent) return;
    setSavingProgress(true);
    try {
      await api.updateStudentProgress(progressModalStudent.id, {
        currentSurah: currentSurahInput,
        completedPortion: completedPortionInput,
        remainingMemorization: remainingInput,
        revisionProgress: revisionInput,
        status: progressStatusInput,
        completedSurahs: completedSurahsList,
        notes: teacherNotesInput
      });
      setSuccess(`تم تحديث سجل تقدم حفظ القرآن للطالب (${progressModalStudent.fullName}) بنجاح`);
      setProgressModalStudent(null);
      await loadAllAdminData();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'تعذر تحديث تقدم الحفظ');
    } finally {
      setSavingProgress(false);
    }
  };

  // Teacher status management
  const handleApproveTeacher = async (id: string, name: string) => {
    try {
      await api.approveTeacher(id);
      setSuccess(`تم اعتماد وتفعيل حساب المعلم (${name}) بنجاح`);
      await loadAllAdminData();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'تعذر اعتماد المعلم');
    }
  };

  const handleRejectTeacher = async (id: string, name: string) => {
    try {
      await api.rejectTeacher(id);
      setSuccess(`تم رفض طلب تسجيل المعلم (${name})`);
      await loadAllAdminData();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'تعذر رفض الحساب');
    }
  };

  const handleSuspendTeacher = async (id: string, name: string) => {
    try {
      await api.suspendTeacher(id);
      setSuccess(`تم تجميد حساب المعلم (${name})`);
      await loadAllAdminData();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'تعذر تجميد الحساب');
    }
  };

  const handleReactivateTeacher = async (id: string, name: string) => {
    try {
      await api.reactivateTeacher(id);
      setSuccess(`تمت إعادة تفعيل حساب المعلم (${name})`);
      await loadAllAdminData();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'تعذر إعادة التفعيل');
    }
  };

  // Payroll status change modal
  const handleOpenPayrollModal = (item: TeacherPayrollOverviewItem) => {
    setPayrollStatusModalTeacher(item);
    setNewPayrollStatus(item.requestStatus === 'NOT_SUBMITTED' ? 'APPROVED' : (item.requestStatus as PayrollStatus));
    setPayrollReviewNotes(item.reviewNotes || '');
    setActualPaymentDateInput(item.actualPaymentDate ? item.actualPaymentDate.slice(0, 10) : getCairoToday());
  };

  const handleSavePayrollStatus = async () => {
    if (!payrollStatusModalTeacher || !payrollStatusModalTeacher.requestId) {
      alert('لا يمكن تغيير حالة معلم لم يقدم طلب مسير بعد');
      return;
    }
    setUpdatingPayrollStatus(true);
    try {
      await api.updatePayrollStatus(
        payrollStatusModalTeacher.requestId,
        newPayrollStatus,
        payrollReviewNotes,
        newPayrollStatus === 'PAID' ? actualPaymentDateInput : undefined
      );
      setSuccess(`تم تحديث حالة مسير الراتب للمعلم (${payrollStatusModalTeacher.teacherName}) بنجاح`);
      setPayrollStatusModalTeacher(null);
      await loadPayrollForMonth(selectedPayrollMonth);
      await loadAllAdminData();
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'تعذر تحديث حالة الراتب');
    } finally {
      setUpdatingPayrollStatus(false);
    }
  };

  // Save template settings
  const handleSaveTemplateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTemplate(true);
    try {
      await api.updateCertificateTemplate({
        nameY,
        nameFontSize,
        nameColor,
        achievementY,
        achievementFontSize,
        achievementColor,
        prefixText,
        maskY,
        maskHeight
      });
      setSuccess('تم حفظ إحداثيات وضوابط قالب الشهادة بنجاح');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'تعذر حفظ إعدادات القالب');
    } finally {
      setSavingTemplate(false);
    }
  };

  // Helper for status badge
  const renderProgressStatusBadge = (status?: ProgressStatus) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
            <span>مكتمل</span>
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
            <BookOpen className="w-3 h-3 text-blue-700" />
            <span>قيد الحفظ</span>
          </span>
        );
      case 'NEEDS_REVISION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
            <RotateCcw className="w-3 h-3 text-amber-700" />
            <span>بحاجة لمراجعة</span>
          </span>
        );
      case 'NOT_STARTED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>لم يبدأ بعد</span>
          </span>
        );
    }
  };

  const renderPayrollStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
            <span>تم الصرف والتحويل</span>
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-900 border border-sky-200">
            <Check className="w-3 h-3 text-sky-700" />
            <span>معتمد بانتظار التحويل</span>
          </span>
        );
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-700" />
            <span>قيد المراجعة</span>
          </span>
        );
      case 'RETURNED_FOR_CORRECTION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-900 border border-orange-200">
            <RotateCcw className="w-3 h-3 text-orange-700" />
            <span>معاد للتعديل</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-900 border border-rose-200">
            <X className="w-3 h-3 text-rose-700" />
            <span>مرفوض</span>
          </span>
        );
      case 'NOT_SUBMITTED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
            <span>لم يقدم بعد</span>
          </span>
        );
    }
  };

  // Filter students for Tab 2
  const filteredStudents = students.filter(s => {
    // Teacher filter
    if (teacherFilter !== 'ALL' && s.teacherId !== teacherFilter) return false;
    // Status filter
    if (studentStatusFilter === 'ACTIVE' && s.isArchived) return false;
    if (studentStatusFilter === 'ARCHIVED' && !s.isArchived) return false;
    // Progress filter
    if (studentProgressFilter !== 'ALL') {
      const pStatus = s.quranProgress?.status || 'NOT_STARTED';
      if (pStatus !== studentProgressFilter) return false;
    }
    // Search filter
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      const nameMatch = s.fullName.toLowerCase().includes(q);
      const idMatch = s.id.toLowerCase().includes(q);
      const surahMatch = s.quranProgress?.currentSurah?.toLowerCase().includes(q);
      if (!nameMatch && !idMatch && !surahMatch) return false;
    }
    return true;
  });

  const activeTeachersCount = teachers.filter(t => t.status === 'ACTIVE').length;
  const pendingTeachersCount = teachers.filter(t => t.status === 'PENDING').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" dir="rtl">
      {/* EXECUTIVE HEADER */}
      <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-6 sm:p-7 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-950 text-xs font-bold">
              <ShieldAlert className="w-4 h-4 text-emerald-800" />
              <span>الإدارة العامة والمراقبة الشاملة للأكاديمية</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              لوحة تحكم مدير الأكاديمية (Super Admin)
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
              رؤية مركزية متكاملة لجميع المعلمين، المعلمات، الطلاب، جدول الحصص اليومي، تقدم حفظ القرآن، مسيرات الرواتب، والتقارير المالية.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl px-4 py-2.5 text-xs text-emerald-900 space-y-0.5">
              <span className="text-[11px] text-emerald-700 block font-semibold">التوقيت المعتمد للنظام:</span>
              <span className="font-bold text-slate-900 font-mono">توقيت مصر (القاهرة · Africa/Cairo)</span>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'جاري التحديث...' : 'تحديث البيانات المركزية'}</span>
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {success && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl flex items-center gap-3 text-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0" />
            <span className="font-semibold">{success}</span>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl flex items-center gap-3 text-xs">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
        )}
      </div>

      {/* TOP TAB NAVIGATION BAR */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 text-xs font-bold scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition whitespace-nowrap cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>المؤشرات العامة (Overview)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('teachers-students')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition whitespace-nowrap cursor-pointer ${
            activeTab === 'teachers-students'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>المعلمون والطلاب ({teachers.length} معلماً · {students.length} طالباً)</span>
          {pendingTeachersCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px]">
              {pendingTeachersCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('quran-progress')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition whitespace-nowrap cursor-pointer ${
            activeTab === 'quran-progress'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>متابعة تقدم حفظ القرآن</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('daily-schedule');
            loadScheduleForDate(selectedScheduleDate);
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition whitespace-nowrap cursor-pointer ${
            activeTab === 'daily-schedule'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>جدول حصص اليوم ومراقبة النشاط</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('payroll');
            loadPayrollForMonth(selectedPayrollMonth);
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition whitespace-nowrap cursor-pointer ${
            activeTab === 'payroll'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Banknote className="w-4 h-4" />
          <span>مسيرات الرواتب والشؤون المالية</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings-logs')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition whitespace-nowrap cursor-pointer ${
            activeTab === 'settings-logs'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>سجل الرقابة الأمنية والقالب</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DIRECTOR OVERVIEW DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && dashboardStats && (
        <div className="space-y-6">
          {/* 8 Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[11px] text-slate-500 block">إجمالي المعلمين</span>
              <span className="text-xl font-black text-slate-900">{dashboardStats.totalTeachers}</span>
              <span className="text-[10px] text-emerald-800 block">{dashboardStats.activeTeachers} نشط</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[11px] text-slate-500 block">إجمالي الطلاب</span>
              <span className="text-xl font-black text-slate-900">{dashboardStats.totalStudents}</span>
              <span className="text-[10px] text-emerald-800 block">{dashboardStats.activeStudents} مسجل</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[11px] text-slate-500 block">حصص اليوم المجدولة</span>
              <span className="text-xl font-black text-slate-900">{dashboardStats.todayLessonsScheduled}</span>
              <span className="text-[10px] text-slate-400 block">لكل المعلمين</span>
            </div>

            <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200 shadow-xs space-y-1">
              <span className="text-[11px] text-emerald-900 font-bold block">حصص اليوم المكتملة</span>
              <span className="text-xl font-black text-emerald-900">{dashboardStats.todayLessonsCompleted}</span>
              <span className="text-[10px] text-emerald-700 block">تم تنفيذها</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <span className="text-[11px] text-slate-500 block">حصص اليوم المتبقية</span>
              <span className="text-xl font-black text-amber-700">{dashboardStats.todayLessonsPending}</span>
              <span className="text-[10px] text-slate-400 block">بانتظار الانعقاد</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/30 shadow-xs space-y-1">
              <span className="text-[11px] text-amber-900 font-bold block">رواتب قيد المراجعة</span>
              <span className="text-xl font-black text-amber-800">{dashboardStats.payrollRequestsPendingReview}</span>
              <span className="text-[10px] text-amber-700 block">بانتظار تدقيقك</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs space-y-1">
              <span className="text-[11px] text-emerald-900 font-bold block">المصروف هذا الشهر</span>
              <span className="text-lg font-black text-emerald-950 font-mono">
                {dashboardStats.salariesPaidThisMonth.toLocaleString('ar-EG')} ج.م
              </span>
              <span className="text-[10px] text-slate-400 block">صُرف فعلياً</span>
            </div>

            <div className="bg-emerald-900 text-white p-4 rounded-2xl shadow-xs space-y-1">
              <span className="text-[11px] text-emerald-200 font-bold block">إجمالي المستحقات</span>
              <span className="text-lg font-black text-white font-mono">
                {dashboardStats.totalSalariesCalculatedThisMonth.toLocaleString('ar-EG')} ج.م
              </span>
              <span className="text-[10px] text-emerald-300 block">محسوب للشهر</span>
            </div>
          </div>

          {/* 5 CHARTS GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Teachers with Most Lessons Today */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-emerald-700" />
                    <span>المعلمون الأكثر تدريساً اليوم (مقارنة الحصص)</span>
                  </h3>
                  <span className="text-xs text-slate-500">حسب جدول اليوم الفعلي ({formatArabicDateHeader(getCairoToday())})</span>
                </div>
                <button
                  onClick={() => setActiveTab('daily-schedule')}
                  className="text-xs text-emerald-800 hover:underline font-bold"
                >
                  فتح الجدول الكامل ←
                </button>
              </div>

              <div className="space-y-3 pt-2">
                {dashboardStats.teachersActivityTodayChart.slice(0, 5).map((t, idx) => {
                  const maxVal = Math.max(...dashboardStats.teachersActivityTodayChart.map(x => x.scheduledCount), 1);
                  const widthPct = Math.round((t.scheduledCount / maxVal) * 100);
                  return (
                    <div key={t.teacherId} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-slate-800">
                          {idx + 1}. {t.gender === 'FEMALE' ? 'فضيلة المعلمة' : 'فضيلة المعلم'} {t.teacherName}
                        </span>
                        <span className="text-slate-600 font-mono">
                          {t.scheduledCount} حصة (منفذ: {t.completedCount} · متبقي: {t.pendingCount})
                        </span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                        <div
                          style={{ width: `${(t.completedCount / maxVal) * 100}%` }}
                          className="bg-emerald-600 h-full transition-all"
                          title={`مكتمل: ${t.completedCount}`}
                        />
                        <div
                          style={{ width: `${(t.pendingCount / maxVal) * 100}%` }}
                          className="bg-amber-400 h-full transition-all"
                          title={`متبقي: ${t.pendingCount}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chart 2: Top Salaries This Month */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-700" />
                    <span>المعلمون الأعلى استحقاقاً للراتب هذا الشهر</span>
                  </h3>
                  <span className="text-xs text-slate-500">حسب إجمالي الحلقات المنفذة × 65 ج.م</span>
                </div>
                <button
                  onClick={() => setActiveTab('payroll')}
                  className="text-xs text-emerald-800 hover:underline font-bold"
                >
                  كشف المرتبات ←
                </button>
              </div>

              <div className="space-y-3 pt-2">
                {dashboardStats.topSalariesChart.slice(0, 5).map((t, idx) => {
                  const maxAmt = Math.max(...dashboardStats.topSalariesChart.map(x => x.amount), 1);
                  const widthPct = Math.round((t.amount / maxAmt) * 100);
                  return (
                    <div key={t.teacherId} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-slate-800">
                          {idx + 1}. {t.gender === 'FEMALE' ? 'المعلمة' : 'المعلم'} {t.teacherName}
                        </span>
                        <span className="font-black text-emerald-900 font-mono">
                          {t.amount.toLocaleString('ar-EG')} ج.م ({t.completedLessons} حلقة)
                        </span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${widthPct}%` }}
                          className="bg-gradient-to-l from-emerald-600 to-emerald-800 h-full rounded-full transition-all"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chart 3: Student Enrollment Distribution */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-emerald-700" />
                <span>توزيع الطلاب حسب المعلمين والمعلمات</span>
              </h3>
              <div className="space-y-3 pt-2">
                {dashboardStats.enrollmentDistributionChart.map((t) => {
                  const total = dashboardStats.totalStudents || 1;
                  const pct = Math.round((t.studentsCount / total) * 100);
                  return (
                    <div key={t.teacherId} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-800">
                          {t.gender === 'FEMALE' ? 'فضيلة المعلمة' : 'فضيلة المعلم'} {t.teacherName}
                        </span>
                        <span className="text-slate-600 font-mono">
                          {t.studentsCount} طالب ({pct}%)
                        </span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className="bg-emerald-700 h-full rounded-full transition-all"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chart 4 & 5: Monthly Lesson & Financial Trend */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-emerald-700" />
                <span>مؤشرات النشاط والمصروفات خلال الأشهر الأخيرة</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {dashboardStats.monthlyActivityTrend.map((m) => (
                  <div key={m.month} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-1">
                    <span className="text-[11px] text-slate-500 font-bold block">{m.monthLabel}</span>
                    <span className="text-base font-black text-slate-900 block">{m.completedLessons} حلقة</span>
                    <span className="text-xs font-bold text-emerald-800 font-mono block">
                      {m.totalSalaryPaid.toLocaleString('ar-EG')} ج.م
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Stream of Recent Audit Logs */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-700" />
                <span>آخر العمليات والإجراءات الرقابية المسجلة</span>
              </h3>
              <button
                onClick={() => setActiveTab('settings-logs')}
                className="text-xs text-emerald-800 font-bold hover:underline"
              >
                عرض سجل العمليات الكامل ←
              </button>
            </div>

            <div className="space-y-2">
              {dashboardStats.recentAuditLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-4">
                  <div>
                    <span className="font-bold text-slate-900 mr-2">{log.actorName}</span>
                    <span className="text-slate-600">{log.details}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('ar-EG')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TEACHERS AND STUDENTS MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'teachers-students' && (
        <div className="space-y-6">
          {/* Top Search & Filter Bar */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
              <input
                type="text"
                placeholder="ابحث باسم الطالب، كود الطالب، أو السورة..."
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-semibold">المعلم:</span>
                <select
                  value={teacherFilter}
                  onChange={e => setTeacherFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold"
                >
                  <option value="ALL">جميع المعلمين ({teachers.length})</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.gender === 'FEMALE' ? 'المعلمة' : 'المعلم'}: {t.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-semibold">الحالة:</span>
                <select
                  value={studentStatusFilter}
                  onChange={e => setStudentStatusFilter(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold"
                >
                  <option value="ACTIVE">النشطون فقط</option>
                  <option value="ALL">الكل (نشط ومؤرشف)</option>
                  <option value="ARCHIVED">المؤرشفون</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-semibold">مستوى الحفظ:</span>
                <select
                  value={studentProgressFilter}
                  onChange={e => setStudentProgressFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white font-bold"
                >
                  <option value="ALL">جميع المستويات</option>
                  <option value="COMPLETED">مكتمل</option>
                  <option value="IN_PROGRESS">قيد الحفظ</option>
                  <option value="NEEDS_REVISION">بحاجة لمراجعة</option>
                  <option value="NOT_STARTED">لم يبدأ</option>
                </select>
              </div>
            </div>
          </div>

          {/* Pending Teachers Alert if any */}
          {pendingTeachersCount > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <div>
                  <span className="font-bold text-amber-950 block">
                    يوجد {pendingTeachersCount} طلب تسجيل معلم معلق بانتظار اعتمادك
                  </span>
                  <span className="text-amber-800">
                    يمكنك اعتماد المعلمين الجدد وتفعيل صلاحياتهم فوراً من قسم "سجل الرقابة الأمنية والقالب".
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('settings-logs')}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition"
              >
                مراجعة الطلبات المعلقة
              </button>
            </div>
          )}

          {/* Students Directory Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  سجل طلاب الأكاديمية ({filteredStudents.length} طالباً)
                </h3>
                <span className="text-xs text-slate-500">
                  بيانات كل طالب، المعلم المسند إليه، كود الطالب، ومستوى تقدم الحفظ
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">كود الطالب</th>
                    <th className="py-3 px-4">اسم الطالب</th>
                    <th className="py-3 px-4">المعلم المسند إليه</th>
                    <th className="py-3 px-4">تاريخ الالتحاق</th>
                    <th className="py-3 px-4">السورة الحالية والمقرر</th>
                    <th className="py-3 px-4 text-center">حالة الحفظ</th>
                    <th className="py-3 px-4">آخر تحديث للتقدم</th>
                    <th className="py-3 px-4 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredStudents.map((st) => {
                    const isStale = isDateStale(st.quranProgress?.lastUpdated, 14);
                    return (
                      <tr key={st.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-mono text-slate-500 font-bold">
                          {st.id.slice(0, 14)}...
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {st.fullName}
                          {st.isArchived && (
                            <span className="mr-2 px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px]">مؤرشف</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-emerald-950">
                            {st.assignedTeacher?.gender === 'FEMALE' ? 'فضيلة المعلمة' : 'فضيلة المعلم'}{' '}
                            {st.assignedTeacher?.fullName || 'معلم غير محدد'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(st.createdAt).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">
                            {st.quranProgress?.currentSurah ? `سورة ${st.quranProgress.currentSurah}` : 'غير محدد'}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate max-w-xs">
                            {st.quranProgress?.completedPortion || 'لم يتم تسجيل مقرر بعد'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {renderProgressStatusBadge(st.quranProgress?.status)}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <span>
                              {st.quranProgress?.lastUpdated
                                ? new Date(st.quranProgress.lastUpdated).toLocaleDateString('ar-EG')
                                : 'لا يوجد سجل'}
                            </span>
                            {isStale && (
                              <span className="px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px] font-bold" title="لم يتم تحديث السجل منذ أكثر من 14 يوماً">
                                متأخر
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenProgressModal(st)}
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 rounded-lg font-bold transition flex items-center gap-1"
                              title="تعديل سجل حفظ القرآن"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                              <span>التقدم</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenReassignModal(st)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold transition flex items-center gap-1"
                              title="إعادة إسناد لمعلم آخر"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span>إسناد</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: QURAN PROGRESS MONITORING */}
      {/* ========================================================================= */}
      {activeTab === 'quran-progress' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-700" />
                <span>متابعة تقدم حفظ القرآن الكريم لجميع الطلاب</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                كشف تفصيلي بالسورة الحالية، الآيات المكتملة، المتبقي من المنهج، وتاريخ آخر تحديث
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {students.filter(s => !s.isArchived).map(st => {
              const p = st.quranProgress;
              const isStale = isDateStale(p?.lastUpdated, 14);
              return (
                <div key={st.id} className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 space-y-4 hover:border-emerald-300 transition">
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">{st.fullName}</h4>
                      <p className="text-[11px] text-emerald-800 font-semibold">
                        المعلم:{' '}
                        {st.assignedTeacher?.gender === 'FEMALE' ? 'فضيلة المعلمة' : 'فضيلة المعلم'}{' '}
                        {st.assignedTeacher?.fullName || 'غير مسند'}
                      </p>
                    </div>
                    <div>{renderProgressStatusBadge(p?.status)}</div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-500 text-[11px] block">السورة الحالية والمقرر:</span>
                      <span className="font-bold text-slate-900 block">
                        {p?.currentSurah ? `سورة ${p.currentSurah}` : 'لم تحدد بعد'}
                        {p?.completedPortion ? ` (${p.completedPortion})` : ''}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[11px] block">المتبقي من الحفظ:</span>
                      <span className="text-slate-700 block">{p?.remainingMemorization || 'غير محدد'}</span>
                    </div>

                    <div>
                      <span className="text-slate-500 text-[11px] block">سجل المراجعة والتثبيت:</span>
                      <span className="text-slate-700 block">{p?.revisionProgress || 'لا يوجد'}</span>
                    </div>

                    {p?.completedSurahs && p.completedSurahs.length > 0 && (
                      <div>
                        <span className="text-slate-500 text-[11px] block mb-1">السور والأجزاء المكتملة:</span>
                        <div className="flex flex-wrap gap-1">
                          {p.completedSurahs.map((s, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-emerald-50 text-emerald-900 rounded-md text-[10px] font-semibold border border-emerald-200">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {p?.notes && (
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 text-[11px]">
                        ملاحظات المعلم: {p.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <span>آخر تحديث:</span>
                      <span>
                        {p?.lastUpdated ? new Date(p.lastUpdated).toLocaleDateString('ar-EG') : 'غير مسجل'}
                      </span>
                      {isStale && (
                        <span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 rounded font-bold">
                          متأخر
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenProgressModal(st)}
                      className="px-3 py-1 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg font-bold transition text-xs"
                    >
                      تحديث السجل
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: TODAY'S LESSONS SCHEDULE & ACTIVITY STATS */}
      {/* ========================================================================= */}
      {activeTab === 'daily-schedule' && (
        <div className="space-y-6">
          {/* Date Selector & Mode Switcher */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedScheduleDate(getCairoToday())}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  selectedScheduleDate === getCairoToday()
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                اليوم ({formatArabicDateHeader(getCairoToday())})
              </button>

              <button
                type="button"
                onClick={() => setSelectedScheduleDate(addDays(getCairoToday(), 1))}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  selectedScheduleDate === addDays(getCairoToday(), 1)
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                غداً
              </button>

              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
                <Calendar className="w-4 h-4 text-slate-500 mr-1" />
                <input
                  type="date"
                  value={selectedScheduleDate}
                  onChange={e => setSelectedScheduleDate(e.target.value)}
                  className="px-2 py-1 bg-white rounded-lg text-xs font-mono font-bold border border-slate-300"
                />
              </div>
            </div>

            {scheduleData && (
              <div className="flex items-center gap-3 text-xs">
                <span className="font-bold text-slate-900">
                  إجمالي حصص التاريخ: <strong className="text-emerald-900 text-sm">{scheduleData.totalScheduled}</strong>
                </span>
                <span className="text-emerald-800 font-bold">منفذ: {scheduleData.totalCompleted}</span>
                <span className="text-amber-700 font-bold">متبقي: {scheduleData.totalPending}</span>
              </div>
            )}
          </div>

          {/* Activity Chart Section */}
          {scheduleData && scheduleData.activityChart.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-700" />
                <span>إحصائيات نشاط المعلمين لتاريخ ({scheduleData.selectedDate})</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {scheduleData.activityChart.map(t => (
                  <div key={t.teacherId} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-900">
                        {t.gender === 'FEMALE' ? 'المعلمة' : 'المعلم'}: {t.teacherName}
                      </span>
                      <span className="font-black text-slate-900 text-sm">{t.scheduledCount} حصص</span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-600">
                      <span className="text-emerald-800 font-semibold">منفذ: {t.completedCount}</span>
                      <span>·</span>
                      <span className="text-amber-700 font-semibold">متبقي: {t.pendingCount}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grouped Lessons by Teacher */}
          {loadingSchedule ? (
            <div className="py-12 text-center text-sm text-slate-500">جاري تحميل جدول الحصص...</div>
          ) : scheduleData && scheduleData.teachersGroups.length > 0 ? (
            <div className="space-y-4">
              {scheduleData.teachersGroups.map(group => (
                <div key={group.teacherId} className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-800 text-white flex items-center justify-center font-bold text-sm">
                        {group.totalLessons}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">
                          {group.teacherGender === 'FEMALE' ? 'فضيلة المعلمة' : 'فضيلة المعلم'}: {group.teacherName}
                        </h4>
                        <span className="text-xs text-slate-500">
                          {group.totalLessons > 0
                            ? `لديه ${group.totalLessons} حصص مجدولة لهذا التاريخ (مكتمل: ${group.completedLessons} · متبقي: ${group.pendingLessons})`
                            : 'لا توجد حصص مجدولة لهذا المعلم في هذا التاريخ'}
                        </span>
                      </div>
                    </div>

                  </div>

                  {group.lessons.length > 0 ? (
                    <div className="p-4 sm:p-6 divide-y divide-slate-100">
                      {group.lessons.map(l => (
                        <div
                          key={l.lessonId}
                          className="py-3.5 px-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-20 text-center bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 font-mono font-bold text-xs text-slate-900">
                              {l.startTime12}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 text-sm">
                                الطالب: {l.studentName}
                              </div>
                              <div className="text-xs text-slate-500">
                                المدة: {l.durationMinutes} دقيقة · ينتهي: {l.endTime12}
                                {l.notes && <span className="mr-2 text-slate-700">({l.notes})</span>}
                              </div>
                            </div>
                          </div>

                          <div>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold ${
                                l.status === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : l.status === 'CANCELLED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : l.status === 'RESCHEDULED'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {l.status === 'COMPLETED'
                                ? 'مكتملة'
                                : l.status === 'CANCELLED'
                                ? 'ملغاة'
                                : l.status === 'RESCHEDULED'
                                ? 'موعد معدل'
                                : 'مجدولة بانتظار الانعقاد'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-400">
                      لا توجد حصص مسجلة
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-slate-500 bg-white rounded-3xl border border-slate-200">
              لا توجد بيانات حصص لهذا التاريخ
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: ACADEMY PAYROLL MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'payroll' && (
        <div className="space-y-6">
          {/* Month Selector & Formula Header */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-emerald-800 font-bold block mb-1">
                الإدارة المالية والتدقيق المعتمد
              </span>
              <h2 className="text-xl font-bold text-slate-900">
                إدارة مسيرات رواتب المعلمين والمعلمات
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                المعادلة المعتمدة:{' '}
                <strong className="text-emerald-950 font-mono">
                  إجمالي المرتب = الحلقات المكتملة المعتمدة × 65 ج.م
                </strong>
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 font-semibold">اختر شهر الاستحقاق:</span>
              <select
                value={selectedPayrollMonth}
                onChange={e => setSelectedPayrollMonth(e.target.value)}
                className="px-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 cursor-pointer"
              >
                <option value="2026-11">نوفمبر 2026 (الشهر الحالي)</option>
                <option value="2026-10">أكتوبر 2026</option>
                <option value="2026-09">سبتمبر 2026</option>
                <option value="2026-08">أغسطس 2026</option>
                <option value="2026-12">ديسمبر 2026</option>
                <option value="2027-01">يناير 2027</option>
              </select>
            </div>
          </div>

          {/* 6 Summary Cards for Payroll */}
          {payrollOverview && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[11px] text-slate-500 block">إجمالي المستحق المحسوب</span>
                <span className="text-lg font-black text-slate-900 font-mono">
                  {payrollOverview.totalSalariesCalculated.toLocaleString('ar-EG')} ج.م
                </span>
                <span className="text-[10px] text-slate-400 block">حسب الحلقات المنفذة</span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[11px] text-slate-500 block">المرفوع للمراجعة</span>
                <span className="text-lg font-black text-slate-900 font-mono">
                  {payrollOverview.totalSalariesSubmitted.toLocaleString('ar-EG')} ج.م
                </span>
                <span className="text-[10px] text-slate-400 block">طلبات المعلمين المرفوعة</span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-sky-200 bg-sky-50/40 shadow-xs space-y-1">
                <span className="text-[11px] text-sky-900 font-bold block">الرواتب المعتمدة</span>
                <span className="text-lg font-black text-sky-950 font-mono">
                  {payrollOverview.totalSalariesApproved.toLocaleString('ar-EG')} ج.م
                </span>
                <span className="text-[10px] text-sky-700 block">{payrollOverview.teachersApprovedCount} معلم معتمد</span>
              </div>

              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-300 shadow-xs space-y-1">
                <span className="text-[11px] text-emerald-950 font-bold block">المصروف فعلياً بالشهر</span>
                <span className="text-lg font-black text-emerald-900 font-mono">
                  {payrollOverview.totalSalariesActuallyPaid.toLocaleString('ar-EG')} ج.م
                </span>
                <span className="text-[10px] text-emerald-700 block">{payrollOverview.teachersPaidCount} معلم تم تحويله</span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/40 shadow-xs space-y-1">
                <span className="text-[11px] text-amber-900 font-bold block">مستحقات بانتظار التحويل</span>
                <span className="text-lg font-black text-amber-950 font-mono">
                  {payrollOverview.totalSalariesPendingPayment.toLocaleString('ar-EG')} ج.م
                </span>
                <span className="text-[10px] text-amber-700 block">معلق أو معتمد</span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                <span className="text-[11px] text-slate-500 block">معلمون لم يقدموا بعد</span>
                <span className="text-xl font-black text-slate-900">
                  {payrollOverview.teachersNotSubmittedCount}
                </span>
                <span className="text-[10px] text-slate-400 block">لم يرفعوا الطلب</span>
              </div>
            </div>
          )}

          {/* Payroll Teachers Table */}
          {loadingPayroll ? (
            <div className="py-12 text-center text-sm text-slate-500">جاري تدقيق مسيرات الرواتب...</div>
          ) : payrollOverview ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    كشف مسيرات رواتب المعلمين لشهر ({payrollOverview.monthLabel})
                  </h3>
                  <span className="text-xs text-slate-500">
                    فحص الحلقات، التحقق من الحسابات المالية، والاعتماد والصرف
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">المعلم / المعلمة</th>
                      <th className="py-3 px-4 text-center">الطلاب المسجلون</th>
                      <th className="py-3 px-4 text-center">الحلقات المكتملة</th>
                      <th className="py-3 px-4 text-center">المبلغ المحسوب</th>
                      <th className="py-3 px-4">طريقة التحويل والحساب</th>
                      <th className="py-3 px-4 text-center">حالة الطلب</th>
                      <th className="py-3 px-4">تاريخ الصرف والاعتماد</th>
                      <th className="py-3 px-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {payrollOverview.teachersList.map(t => (
                      <tr key={t.teacherId} className="hover:bg-slate-50/70 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-sm">
                            {t.teacherGender === 'FEMALE' ? 'فضيلة المعلمة' : 'فضيلة المعلم'}: {t.teacherName}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">{t.teacherEmail}</div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                          {t.studentsTaughtCount} طلاب
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold">
                            {t.completedLessonsCount} حلقة
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-black text-emerald-950 font-mono text-sm">
                          {t.totalCalculatedSalary.toLocaleString('ar-EG')} ج.م
                        </td>
                        <td className="py-3.5 px-4 text-xs">
                          {t.paymentMethod ? (
                            <div>
                              <span className="font-bold text-slate-800 block">
                                {t.paymentMethod === 'INSTAPAY' ? 'انستاباي' : 'محفظة إلكترونية'}
                              </span>
                              <span className="font-mono text-slate-500 text-[11px] dir-ltr text-right block">
                                {t.paymentAccount}
                              </span>
                              <span className="text-[10px] text-slate-400 block">({t.accountHolder})</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">لم تُسجل وسيلة</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {renderPayrollStatusBadge(t.requestStatus)}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-500">
                          {t.actualPaymentDate ? (
                            <div className="text-emerald-900 font-bold">
                              تم: {new Date(t.actualPaymentDate).toLocaleDateString('ar-EG')}
                            </div>
                          ) : t.submittedAt ? (
                            <div>قُدم: {new Date(t.submittedAt).toLocaleDateString('ar-EG')}</div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            {t.requestId && (
                              <button
                                type="button"
                                onClick={() => setViewPayrollSnapshot(t)}
                                className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 transition"
                                title="عرض كشف الطلاب المرفوع"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}

                            {t.requestId && (
                              <button
                                type="button"
                                onClick={() => handleOpenPayrollModal(t)}
                                className="px-3 py-1 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg font-bold transition text-xs"
                              >
                                تغيير الحالة / صرف
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: SETTINGS, TEMPLATE & AUDIT LOGS */}
      {/* ========================================================================= */}
      {activeTab === 'settings-logs' && (
        <div className="space-y-6">
          {/* Firebase Cloud Firestore Live Status & Sync */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-800">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900">
                      قاعدة بيانات Firebase Cloud Firestore السحابية
                    </h3>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                      متصل (Online - Live Sync)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    النظام مربوط رسمياً بـ Firebase Firestore لتخزين ومزامنة بيانات المعلمين، الطلاب، الحصص، والمسيرات
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={refreshFirestoreStatus}
                  disabled={loadingFirestoreStatus}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1.5 disabled:opacity-50"
                  title="تحديث حالة الاتصال والإحصائيات"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingFirestoreStatus ? 'animate-spin' : ''}`} />
                  تحديث الحالة
                </button>
                <button
                  type="button"
                  onClick={handleManualFirestoreSync}
                  disabled={syncingFirestore}
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${syncingFirestore ? 'animate-spin' : ''}`} />
                  {syncingFirestore ? 'جارٍ المزامنة السحابية...' : 'مزامنة سحابية يدوية'}
                </button>
              </div>
            </div>

            {/* Cloud Details & Metric Counts */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500 block mb-1">المعلمون بالحسابات</span>
                <span className="text-lg font-black text-slate-900">
                  {firestoreStatus?.counts?.profiles ?? teachers.length}
                </span>
                <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">مجموعة profiles</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500 block mb-1">الطلاب المقيدون</span>
                <span className="text-lg font-black text-slate-900">
                  {firestoreStatus?.counts?.students ?? students.length}
                </span>
                <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">مجموعة students</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500 block mb-1">الحصص المجدولة</span>
                <span className="text-lg font-black text-slate-900">
                  {firestoreStatus?.counts?.lessons ?? 0}
                </span>
                <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">مجموعة lessons</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500 block mb-1">شهادات التقدير</span>
                <span className="text-lg font-black text-slate-900">
                  {firestoreStatus?.counts?.certificates ?? 0}
                </span>
                <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">مجموعة certificates</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500 block mb-1">طلبات المسيرات</span>
                <span className="text-lg font-black text-slate-900">
                  {firestoreStatus?.counts?.payrollRequests ?? 0}
                </span>
                <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">مجموعة payroll</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <span className="text-[11px] text-slate-500 block mb-1">سجلات الرقابة</span>
                <span className="text-lg font-black text-slate-900">
                  {firestoreStatus?.counts?.auditLogs ?? auditLogs.length}
                </span>
                <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">مجموعة auditLogs</span>
              </div>
            </div>

            <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/60 text-xs text-slate-600 space-y-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                <div>
                  <span className="font-bold text-slate-800">معرف قاعدة البيانات السحابية: </span>
                  <code className="text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-200 font-mono">
                    {firestoreStatus?.database || 'ai-studio-tarteelteachersp-979b7e7b-89fe-4866-86e6-9f467b26704c'}
                  </code>
                </div>
                <div>
                  <span className="font-bold text-slate-800">خطة التشغيل: </span>
                  <span className="text-emerald-800 font-bold">Google Cloud Spark Free Tier (بدون تكاليف إضافية)</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                * جميع التحديثات التي يقوم بها المعلمون أو الإدارة تُكتب فوراً مع الاحتفاظ بنسخة احتياطية مشفرة وتزامن حي مع خوادم Firebase.
              </p>
            </div>
          </div>

          {/* Pending Teachers Management Section */}
          <div className="bg-white rounded-3xl border border-amber-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-amber-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-amber-950 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                  طلبات تسجيل المعلمين الجدد ({pendingTeachersCount} طلب معلق)
                </h3>
                <span className="text-xs text-amber-800/80">
                  فحص بيانات المعلمين الجدد، ضبط الألقاب، وتفعيل حساباتهم للتدريس
                </span>
              </div>
            </div>

            {teachers.filter(t => t.status === 'PENDING').length === 0 ? (
              <div className="p-6 text-center text-xs text-amber-800 bg-amber-50/50 rounded-2xl">
                لا توجد طلبات تسجيل معلقة حالياً، جميع حسابات المعلمين معتمدة ونشطة.
              </div>
            ) : (
              <div className="space-y-3">
                {teachers.filter(t => t.status === 'PENDING').map(teacher => (
                  <div key={teacher.id} className="p-4 rounded-2xl border border-amber-200 bg-amber-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">
                          {teacher.gender === 'FEMALE' ? 'فضيلة المعلمة' : 'فضيلة المعلم'}: {teacher.fullName}
                        </span>
                        <span className="text-xs font-mono text-slate-500">(@{teacher.username})</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-purple-100 text-purple-800">
                          {teacher.gender === 'FEMALE' ? 'أنثى' : 'ذكر'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {teacher.email} · مسجل بتاريخ: {new Date(teacher.createdAt).toLocaleDateString('ar-EG')}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApproveTeacher(teacher.id, teacher.fullName)}
                        className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                      >
                        <Check className="w-4 h-4" />
                        اعتماد وتفعيل
                      </button>
                      <button
                        onClick={() => handleRejectTeacher(teacher.id, teacher.fullName)}
                        className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                      >
                        <X className="w-4 h-4" />
                        رفض
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Teachers Management */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              إدارة حسابات المعلمين المعتمدين في الأكاديمية ({teachers.filter(t => t.status === 'ACTIVE').length})
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <tr>
                    <th className="py-2.5 px-3">الاسم واللقب الرسمي</th>
                    <th className="py-2.5 px-3">اسم المستخدم</th>
                    <th className="py-2.5 px-3">البريد الإلكتروني</th>
                    <th className="py-2.5 px-3 text-center">الطلاب المسجلون</th>
                    <th className="py-2.5 px-3 text-left">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teachers.filter(t => t.status === 'ACTIVE').map(teacher => (
                    <tr key={teacher.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-bold text-slate-900">
                        {teacher.gender === 'FEMALE' ? 'فضيلة المعلمة' : 'فضيلة المعلم'} {teacher.fullName}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">{teacher.username}</td>
                      <td className="py-3 px-3 text-slate-500">{teacher.email}</td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-800">
                        {students.filter(s => s.teacherId === teacher.id && !s.isArchived).length}
                      </td>
                      <td className="py-3 px-3 text-left">
                        <button
                          onClick={() => handleSuspendTeacher(teacher.id, teacher.fullName)}
                          className="px-2.5 py-1 text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg border border-amber-200 font-medium transition"
                        >
                          تجميد الحساب
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Certificate Template Coordinates */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  إعدادات القالب الرسمي المعتمد لشهادات التقدير
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ضبط إحداثيات النصوص وحجم الخطوط على شهادة الأكاديمية الرسمية
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveTemplateSettings} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <span className="font-bold text-xs text-slate-800 block">إحداثيات اسم الطالب</span>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">المحور الرأسي (Y): {nameY}px</label>
                    <input type="range" min={650} max={780} value={nameY} onChange={e => setNameY(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">حجم الخط: {nameFontSize}px</label>
                    <input type="range" min={40} max={80} value={nameFontSize} onChange={e => setNameFontSize(Number(e.target.value))} className="w-full" />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <span className="font-bold text-xs text-slate-800 block">إحداثيات إنجاز الحفظ</span>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">المحور الرأسي (Y): {achievementY}px</label>
                    <input type="range" min={770} max={880} value={achievementY} onChange={e => setAchievementY(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">حجم الخط: {achievementFontSize}px</label>
                    <input type="range" min={28} max={50} value={achievementFontSize} onChange={e => setAchievementFontSize(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingTemplate}
                  className="px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-xs transition shadow-xs"
                >
                  {savingTemplate ? 'جارٍ الحفظ...' : 'حفظ إعدادات القالب'}
                </button>
              </div>
            </form>
          </div>

          {/* Audit Logs */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-700" />
              <span>سجل الرقابة الأمنية والعمليات الإدارية (Audit Logs)</span>
            </h3>
            <p className="text-xs text-slate-500">توثيق كافة إجراءات النظام، إعادة الإسناد، ومسيرات الرواتب</p>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-900 mr-2">{log.actorName}</span>
                    <span className="text-slate-600">{log.details}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('ar-EG')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: REASSIGN STUDENT TEACHER */}
      {/* ========================================================================= */}
      {reassignModalStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-200">
            <div className="border-b border-slate-200 pb-3">
              <span className="text-xs text-emerald-800 font-bold block">إدارة الإسناد</span>
              <h3 className="text-lg font-black text-slate-900">
                إعادة إسناد الطالب: {reassignModalStudent.fullName}
              </h3>
              <p className="text-xs text-slate-500">
                المعلم الحالي:{' '}
                {teachers.find(t => t.id === reassignModalStudent.teacherId)?.fullName || 'غير مسند'}
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 block">اختر المعلم الجديد:</label>
                <select
                  value={newTeacherId}
                  onChange={e => setNewTeacherId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                >
                  {teachers.filter(t => t.status === 'ACTIVE').map(t => (
                    <option key={t.id} value={t.id}>
                      {t.gender === 'FEMALE' ? 'فضيلة المعلمة' : 'فضيلة المعلم'}: {t.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 block">سبب إعادة الإسناد (للتوثيق بالسجل):</label>
                <textarea
                  rows={2}
                  value={reassignReason}
                  onChange={e => setReassignReason(e.target.value)}
                  placeholder="مثال: رغبة ولي الأمر في تغيير الموعد أو التخصص..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                * سيتم حفظ تاريخ الإسناد السابق في سجل الطالب وتحديث مواعيد الحصص لتتبع المعلم الجديد تلقائياً دون فقد أي بيانات.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setReassignModalStudent(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={reassigning}
                onClick={handleConfirmReassign}
                className="px-6 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl disabled:opacity-50"
              >
                {reassigning ? 'جارٍ الإسناد...' : 'تأكيد الإسناد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: UPDATE QURAN PROGRESS */}
      {/* ========================================================================= */}
      {progressModalStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-200">
            <div className="border-b border-slate-200 pb-3">
              <span className="text-xs text-emerald-800 font-bold block">متابعة المنهج القرآني</span>
              <h3 className="text-lg font-black text-slate-900">
                تحديث سجل حفظ الطالب: {progressModalStudent.fullName}
              </h3>
            </div>

            <form onSubmit={handleSaveProgress} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block">السورة الحالية:</label>
                  <input
                    type="text"
                    value={currentSurahInput}
                    onChange={e => setCurrentSurahInput(e.target.value)}
                    placeholder="مثال: الكهف"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-800 block">حالة الحفظ:</label>
                  <select
                    value={progressStatusInput}
                    onChange={e => setProgressStatusInput(e.target.value as ProgressStatus)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                  >
                    <option value="IN_PROGRESS">قيد الحفظ (In Progress)</option>
                    <option value="COMPLETED">مكتمل (Completed)</option>
                    <option value="NEEDS_REVISION">بحاجة لمراجعة (Needs Revision)</option>
                    <option value="NOT_STARTED">لم يبدأ بعد (Not Started)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-800 block">المقرر المكتمل من السورة:</label>
                <input
                  type="text"
                  value={completedPortionInput}
                  onChange={e => setCompletedPortionInput(e.target.value)}
                  placeholder="مثال: الآيات 1 إلى 50"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-800 block">المتبقي من الحفظ:</label>
                <input
                  type="text"
                  value={remainingInput}
                  onChange={e => setRemainingInput(e.target.value)}
                  placeholder="مثال: الآيات 51 إلى 110"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-800 block">سجل المراجعة والتثبيت:</label>
                <input
                  type="text"
                  value={revisionInput}
                  onChange={e => setRevisionInput(e.target.value)}
                  placeholder="مثال: مراجعة متقنة لقصار السور"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              {/* Completed Surahs Tags */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 block">السور والأجزاء المكتملة مسبقاً:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSurahTag}
                    onChange={e => setNewSurahTag(e.target.value)}
                    placeholder="اكتب اسم السورة أو الجزء..."
                    className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300"
                  />
                  <button
                    type="button"
                    onClick={handleAddSurahTag}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold"
                  >
                    إضافة
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {completedSurahsList.map((tag, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-lg text-xs font-semibold">
                      <span>{tag}</span>
                      <button type="button" onClick={() => handleRemoveSurahTag(tag)} className="text-emerald-700 hover:text-red-700">
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-800 block">ملاحظات المعلم وتوجيهات الحفظ:</label>
                <textarea
                  rows={2}
                  value={teacherNotesInput}
                  onChange={e => setTeacherNotesInput(e.target.value)}
                  placeholder="ملاحظات حول الأداء والتجويد..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setProgressModalStudent(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingProgress}
                  className="px-6 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl disabled:opacity-50"
                >
                  {savingProgress ? 'جارٍ الحفظ...' : 'حفظ التحديث'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: PAYROLL STATUS & PAYMENT RECORDING */}
      {/* ========================================================================= */}
      {payrollStatusModalTeacher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-200">
            <div className="border-b border-slate-200 pb-3">
              <span className="text-xs text-emerald-800 font-bold block">لوحة الاعتماد والصرف المالي</span>
              <h3 className="text-lg font-black text-slate-900">
                مراجعة مسير: {payrollStatusModalTeacher.teacherName}
              </h3>
              <p className="text-xs text-slate-500">
                المبلغ المستحق: {payrollStatusModalTeacher.totalCalculatedSalary} ج.م ({payrollStatusModalTeacher.completedLessonsCount} حلقة)
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 block">تحديد الحالة المعتمدة:</label>
                <select
                  value={newPayrollStatus}
                  onChange={e => setNewPayrollStatus(e.target.value as PayrollStatus)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold"
                >
                  <option value="APPROVED">معتمد بانتظار التحويل (APPROVED)</option>
                  <option value="PAID">تم الصرف والتحويل بنجاح (PAID)</option>
                  <option value="PENDING_REVIEW">قيد المراجعة (PENDING_REVIEW)</option>
                  <option value="RETURNED_FOR_CORRECTION">معاد للتعديل (RETURNED_FOR_CORRECTION)</option>
                  <option value="REJECTED">مرفوض (REJECTED)</option>
                </select>
              </div>

              {newPayrollStatus === 'PAID' && (
                <div className="space-y-1.5 p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <label className="font-bold text-emerald-950 block">تاريخ التحويل الفعلي:</label>
                  <input
                    type="date"
                    value={actualPaymentDateInput}
                    onChange={e => setActualPaymentDateInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-emerald-300 bg-white font-mono font-bold"
                  />
                  <span className="text-[11px] text-emerald-800 block">
                    * يدخل هذا المبلغ ضمن حسابات الصرف الفعلي لشهر هذا التاريخ.
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 block">ملاحظات الإدارة أو رقم الحوالة:</label>
                <textarea
                  rows={2}
                  value={payrollReviewNotes}
                  onChange={e => setPayrollReviewNotes(e.target.value)}
                  placeholder="اكتب رقم الحوالة أو ملاحظات للمعلم..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPayrollStatusModalTeacher(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={updatingPayrollStatus}
                onClick={handleSavePayrollStatus}
                className="px-6 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl disabled:opacity-50"
              >
                {updatingPayrollStatus ? 'جارٍ الحفظ...' : 'تأكيد وحفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: VIEW SUBMITTED PAYROLL SNAPSHOT */}
      {/* ========================================================================= */}
      {viewPayrollSnapshot && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs text-emerald-800 font-bold block">كشف الحلقات المعتمد</span>
                <h3 className="text-lg font-black text-slate-900">
                  طلب مسير: {viewPayrollSnapshot.teacherName}
                </h3>
              </div>
              <div>{renderPayrollStatusBadge(viewPayrollSnapshot.requestStatus)}</div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">طريقة التحويل:</span>
                <span className="font-bold text-slate-900">{viewPayrollSnapshot.paymentMethod}</span>
              </div>
              <div>
                <span className="text-slate-500 block">رقم الحساب / المحفظة:</span>
                <span className="font-mono font-bold text-slate-900">{viewPayrollSnapshot.paymentAccount}</span>
              </div>
              <div>
                <span className="text-slate-500 block">اسم صاحب الحساب:</span>
                <span className="font-bold text-slate-900">{viewPayrollSnapshot.accountHolder}</span>
              </div>
              <div>
                <span className="text-slate-500 block">المبلغ الإجمالي:</span>
                <span className="font-bold text-emerald-900">{viewPayrollSnapshot.totalCalculatedSalary} ج.م</span>
              </div>
            </div>

            {viewPayrollSnapshot.studentsSnapshot && viewPayrollSnapshot.studentsSnapshot.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">تفاصيل الحلقات لكل طالب:</span>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 font-bold">
                      <tr>
                        <th className="py-2 px-3">اسم الطالب</th>
                        <th className="py-2 px-3 text-center">الحلقات</th>
                        <th className="py-2 px-3 text-left">المبلغ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewPayrollSnapshot.studentsSnapshot.map((s, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-semibold text-slate-900">{s.studentName}</td>
                          <td className="py-2 px-3 text-center font-bold text-emerald-800">{s.completedLessons}</td>
                          <td className="py-2 px-3 text-left font-mono font-bold text-slate-900">{s.totalAmount} ج.م</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="pt-2 text-left">
              <button
                type="button"
                onClick={() => setViewPayrollSnapshot(null)}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
