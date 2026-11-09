import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Student, Lesson, LessonException } from '../types';
import { convertLessonTime, format12HourTime, DAYS_OF_WEEK, checkTwoLessonsConflict } from '../utils/timezone';
import { getTeacherHonorific, formatTeacherTitle, getTeacherGreeting } from '../utils/teacherTitle';
import { GenderSelectionPrompt } from '../components/GenderSelectionPrompt';
import {
  Users,
  Calendar,
  Award,
  Banknote,
  AlertTriangle,
  Clock,
  PlusCircle,
  ArrowUpRight,
  ChevronLeft,
  CalendarDays,
  ShieldCheck,
  CheckCircle2,
  Settings
} from 'lucide-react';

interface TeacherDashboardProps {
  onNavigate: (page: string) => void;
  onOpenAddStudent?: () => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [exceptions, setExceptions] = useState<LessonException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [studentsRes, lessonsRes] = await Promise.all([
        api.getStudents(false),
        api.getLessons(),
      ]);
      setStudents(studentsRes.students || []);
      setLessons(lessonsRes.lessons || []);
      setExceptions(lessonsRes.exceptions || []);
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل بيانات لوحة التحكم');
    } finally {
      setLoading(false);
    }
  };

  // Determine today's day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const today = new Date();
  const currentDayOfWeek = today.getDay();

  // Filter today's lessons
  const todayLessons = lessons
    .filter(l => l.dayOfWeek === currentDayOfWeek && l.status === 'ACTIVE')
    .sort((a, b) => a.localTime.localeCompare(b.localTime));

  const isAdmin = user?.role === 'ADMIN';

  // Check for conflicts among active lessons on the same day:
  // Admin account never calculates or displays conflict warnings.
  // Teachers only see conflicts when the same teacher has overlapping lessons.
  const conflicts: { day: number; lesson1: Lesson; lesson2: Lesson }[] = [];
  const lessonsByDay: Record<number, Lesson[]> = {};

  if (!isAdmin) {
    lessons.forEach(l => {
      if (l.status === 'ACTIVE' && l.teacherId === user?.id) {
        if (!lessonsByDay[l.dayOfWeek]) lessonsByDay[l.dayOfWeek] = [];
        lessonsByDay[l.dayOfWeek].push(l);
      }
    });

    Object.entries(lessonsByDay).forEach(([dayStr, dayLessons]) => {
      const day = Number(dayStr);
      for (let i = 0; i < dayLessons.length; i++) {
        for (let j = i + 1; j < dayLessons.length; j++) {
          const l1 = dayLessons[i];
          const l2 = dayLessons[j];

          // Teacher conflict: same teacher overlapping lessons
          if (l1.teacherId !== l2.teacherId) {
            continue;
          }

          const conflictCheck = checkTwoLessonsConflict(l1, l2, 'Africa/Cairo');
          if (conflictCheck.isConflict) {
            conflicts.push({ day, lesson1: l1, lesson2: l2 });
          }
        }
      }
    });
  }

  const getStudentName = (studentId: string) => {
    const s = students.find(item => item.id === studentId);
    return s ? s.fullName : 'طالب محذوف';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Required Gender Selection Prompt if teacher has not specified gender yet */}
      <GenderSelectionPrompt onUpdated={loadData} />

      {/* Welcome Banner */}
      <div className="bg-gradient-to-l from-emerald-900 to-emerald-800 rounded-3xl p-6 sm:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 border border-emerald-700/50">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-700/80 text-emerald-100 text-xs font-semibold">
              أكاديمية ترتيل القرآن الكريم
            </span>
            <span className="text-emerald-200/80 text-xs">
              {user?.gender === 'FEMALE' ? '· مرحباً بكِ' : '· مرحباً بك'}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {user?.gender === 'FEMALE'
                ? `فضيلة المعلمة: ${user?.fullName}`
                : user?.gender === 'MALE'
                ? `فضيلة المعلم: ${user?.fullName}`
                : user?.fullName}
            </h2>

            {/* Quick title indicator badge */}
            <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-950/50 text-emerald-200 border border-emerald-700/60">
              {user?.gender === 'FEMALE'
                ? 'فضيلة المعلمة / الأستاذة'
                : user?.gender === 'MALE'
                ? 'فضيلة المعلم / الأستاذ'
                : 'يرجى تحديد اللقب والصفة'}
            </span>
          </div>

          <p className="text-emerald-100/90 text-sm max-w-xl leading-relaxed">
            {user?.gender === 'FEMALE'
              ? 'نسأل الله أن يبارك في جهودكِ المباركة في تعليم كتاب الله وتدريسه. يمكنكِ إدارة حصصك، تحويل التوقيت الدولي، وإصدار شهادات التقدير الرسمية لطلابك.'
              : 'نسأل الله أن يبارك في جهودكم المباركة في تعليم كتاب الله وتدريسه. يمكنك إدارة حصصك، تحويل التوقيت الدولي، وإصدار شهادات التقدير الرسمية لطلابك.'}
          </p>
        </div>

        {/* Quick Add Student Action */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('students')}
            className="px-5 py-3 bg-white text-emerald-950 font-bold rounded-2xl hover:bg-emerald-50 shadow-sm transition flex items-center gap-2 text-sm"
          >
            <PlusCircle className="w-5 h-5 text-emerald-700" />
            إضافة طالب جديد
          </button>
        </div>
      </div>

      {/* Scheduling Conflict Alert Banner (Teachers only) */}
      {!isAdmin && conflicts.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3.5 text-amber-900">
          <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <h4 className="font-bold text-amber-950">
              تنبيه هام: تم اكتشاف {conflicts.length} تعارض في جدول حصصك!
            </h4>
            <p className="text-xs text-amber-800 leading-relaxed">
              يوجد تداخل بين حصص الطلاب: {conflicts.map(c => `(${getStudentName(c.lesson1.studentId)} مع ${getStudentName(c.lesson2.studentId)} يوم ${DAYS_OF_WEEK.find(d => d.id === c.day)?.label})`).join('، ')}. 
              يرجى مراجعة صفحة جدول الحصص لتعديل المواعيد.
            </p>
          </div>
          <button
            onClick={() => onNavigate('schedule')}
            className="mr-auto px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 text-xs font-bold rounded-lg transition"
          >
            حل التعارض
          </button>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active Students */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">الطلاب النشطون</p>
            <p className="text-2xl font-extrabold text-slate-900">{students.length}</p>
            <p className="text-[11px] text-emerald-600 font-medium mt-1">مسجلين في حلقاتك</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Weekly Lessons */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">الحصص الأسبوعية</p>
            <p className="text-2xl font-extrabold text-slate-900">{lessons.length}</p>
            <p className="text-[11px] text-slate-400 mt-1">حصة منتظمة أسبوعياً</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <CalendarDays className="w-6 h-6" />
          </div>
        </div>

        {/* Today's Lessons Count */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">حصص اليوم ({DAYS_OF_WEEK.find(d => d.id === currentDayOfWeek)?.label})</p>
            <p className="text-2xl font-extrabold text-slate-900">{todayLessons.length}</p>
            <p className="text-[11px] text-amber-600 font-medium mt-1">
              {todayLessons.length === 0 ? 'لا توجد حصص مجدولة اليوم' : 'مطلوب إتمامها اليوم'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Official Certificate Status */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">قالب الشهادة الرسمي</p>
            <p className="text-base font-extrabold text-emerald-900 flex items-center gap-1.5 mt-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              معتمد للأكاديمية
            </p>
            <p className="text-[11px] text-slate-400 mt-1">دقة عالية 2000×1414</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Grid: Today's Schedule & Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Today's Lessons (2 Columns) */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-700" />
                حصص اليوم ({DAYS_OF_WEEK.find(d => d.id === currentDayOfWeek)?.label})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مواعيد الحصص بتوقيت الطالب المحلي وما يعادلها بتوقيت مصر والسعودية والإمارات
              </p>
            </div>
            <button
              onClick={() => onNavigate('schedule')}
              className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1"
            >
              عرض الجدول الأسبوعي
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              جارٍ تحميل بيانات الحصص...
            </div>
          ) : todayLessons.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">لا توجد حصص مجدولة لهذا اليوم</p>
              <p className="text-xs text-slate-400 mt-1">يمكنك الاستفادة من وقتك في إعداد شهادات التقدير أو مراجعة خطط الحفظ</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayLessons.map((lesson) => {
                const student = students.find(s => s.id === lesson.studentId);
                const cairoTime = convertLessonTime(lesson.localTime, lesson.timeZone, 'Africa/Cairo');
                const riyadhTime = convertLessonTime(lesson.localTime, lesson.timeZone, 'Asia/Riyadh');
                const dubaiTime = convertLessonTime(lesson.localTime, lesson.timeZone, 'Asia/Dubai');

                return (
                  <div
                    key={lesson.id}
                    className="p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-base">
                          {student?.fullName || 'طالب ترتيل'}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({student?.country})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <span className="font-medium text-emerald-800">
                          مدة الحصة: {lesson.durationMinutes} دقيقة
                        </span>
                        <span>·</span>
                        <span>توقيت الطالب: {format12HourTime(lesson.localTime)}</span>
                      </div>
                    </div>

                    {/* Time Conversions Card (12-hour AM/PM) */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs flex items-center gap-3">
                      <div>
                        <span className="text-[11px] text-slate-400 block">مصر</span>
                        <span className="font-mono font-bold text-slate-800">{cairoTime.time12}</span>
                      </div>
                      <div className="w-px h-6 bg-slate-200" />
                      <div>
                        <span className="text-[11px] text-slate-400 block">السعودية</span>
                        <span className="font-mono font-bold text-slate-800">{riyadhTime.time12}</span>
                      </div>
                      <div className="w-px h-6 bg-slate-200" />
                      <div>
                        <span className="text-[11px] text-slate-400 block">الإمارات</span>
                        <span className="font-mono font-bold text-slate-800">{dubaiTime.time12}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Shortcuts & Academy Tools (1 Column) */}
        <div className="space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              الوصول السريع
            </h3>

            <div className="space-y-2.5">
              <button
                onClick={() => onNavigate('students')}
                className="w-full p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 hover:bg-emerald-100/70 text-right flex items-center justify-between transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-800 text-white flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">إدارة الطلاب</span>
                    <span className="text-[11px] text-slate-500">إضافة وتعديل بيانات الطلاب والحصص</span>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-emerald-700 group-hover:translate-x-[-2px] transition" />
              </button>

              <button
                onClick={() => onNavigate('certificates')}
                className="w-full p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200/80 hover:bg-purple-100/70 text-right flex items-center justify-between transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-800 text-white flex items-center justify-center">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">إنشاء شهادة تقدير</span>
                    <span className="text-[11px] text-slate-500">بالقالب الرسمي للأكاديمية مع تنزيل PNG / PDF</span>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-purple-700 group-hover:translate-x-[-2px] transition" />
              </button>

              <button
                onClick={() => onNavigate('schedule')}
                className="w-full p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/80 hover:bg-blue-100/70 text-right flex items-center justify-between transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-800 text-white flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">جدول الحصص والتوقيت</span>
                    <span className="text-[11px] text-slate-500">عرض أسبوعي وتحويل فوري للمناطق الزمنية</span>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-blue-700 group-hover:translate-x-[-2px] transition" />
              </button>

              <button
                onClick={() => onNavigate('salary')}
                className="w-full p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 hover:bg-emerald-100/70 text-right flex items-center justify-between transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-800 text-white flex items-center justify-center">
                    <Banknote className="w-4 h-4 text-emerald-200" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">المرتبات</span>
                    <span className="text-[11px] text-slate-500">تسجيل بيانات الحلقات الشهرية ومراجعة المستحقات</span>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-emerald-700 group-hover:translate-x-[-2px] transition" />
              </button>
            </div>
          </div>

          {/* Academy Identity Card */}
          <div className="p-4 rounded-3xl bg-slate-900 text-white text-xs space-y-2 border border-slate-800">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>هوية أكاديمية ترتيل المعتمدة</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              جميع بيانات طلابك معزولة بأمان تام، وتخضع شهادات التقدير لمعايير وقالب الأكاديمية الرسمي فقط دون تدخل عشوائي.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
