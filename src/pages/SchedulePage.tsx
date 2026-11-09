import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Lesson, Student, LessonException } from '../types';
import {
  DAYS_OF_WEEK,
  SUPPORTED_TIME_ZONES,
  convertLessonTime,
  format12HourTime,
  checkLessonOverlap,
  checkTwoLessonsConflict
} from '../utils/timezone';
import { TimePicker12 } from '../components/TimePicker12';
import {
  Calendar,
  Clock,
  AlertTriangle,
  Globe,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  User,
  XCircle,
  CheckCircle2,
  Filter
} from 'lucide-react';

export const SchedulePage: React.FC = () => {
  const { user } = useAuth();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [exceptions, setExceptions] = useState<LessonException[]>([]);
  const [viewMode, setViewMode] = useState<'weekly' | 'daily'>('weekly');
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
  const [displayTimeZone, setDisplayTimeZone] = useState<string>('Africa/Cairo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Exception modal state
  const [exceptionLesson, setExceptionLesson] = useState<Lesson | null>(null);
  const [exceptionDate, setExceptionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [exceptionType, setExceptionType] = useState<'CANCELLED' | 'RESCHEDULED'>('CANCELLED');
  const [modifiedTime, setModifiedTime] = useState<string>('18:00');
  const [reason, setReason] = useState<string>('');
  const [submittingException, setSubmittingException] = useState(false);
  const [exceptionSuccess, setExceptionSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadSchedule();
  }, []);

  const loadSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const [lessonsRes, studentsRes] = await Promise.all([
        api.getLessons(),
        api.getStudents(false),
      ]);
      setLessons(lessonsRes.lessons || []);
      setExceptions(lessonsRes.exceptions || []);
      setStudents(studentsRes.students || []);
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل بيانات الجدول الزمني');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exceptionLesson) return;
    setSubmittingException(true);

    try {
      await api.addLessonException({
        lessonId: exceptionLesson.id,
        occurrenceDate: exceptionDate,
        exceptionType,
        modifiedTime: exceptionType === 'RESCHEDULED' ? modifiedTime : undefined,
        reason: reason.trim() || undefined
      });
      setExceptionSuccess('تم تسجيل استثناء الحصة لهذا التاريخ بنجاح');
      setExceptionLesson(null);
      loadSchedule();
      setTimeout(() => setExceptionSuccess(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء حفظ استثناء الحصة');
    } finally {
      setSubmittingException(false);
    }
  };

  // Group lessons by day of week
  const lessonsByDay: Record<number, Lesson[]> = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: []
  };

  lessons.forEach((lesson) => {
    if (lessonsByDay[lesson.dayOfWeek]) {
      lessonsByDay[lesson.dayOfWeek].push(lesson);
    }
  });

  // Sort lessons within each day chronologically by converted display time
  Object.keys(lessonsByDay).forEach((dayKey) => {
    const d = Number(dayKey);
    lessonsByDay[d].sort((a, b) => {
      const timeA = convertLessonTime(a.localTime, a.timeZone, displayTimeZone).time;
      const timeB = convertLessonTime(b.localTime, b.timeZone, displayTimeZone).time;
      return timeA.localeCompare(timeB);
    });
  });

  const isAdmin = user?.role === 'ADMIN';

  // Conflict detection rules:
  // - Admin Account: Completely disabled. Admin monitors the entire academy where multiple teachers teach simultaneously. Never calculate or display conflict warnings for Admin.
  // - Teacher Account: Kept active strictly for the teacher's own lessons (Rule A: same teacher overlapping lessons). Different teachers teaching different students can NEVER conflict.
  const conflictsByDay: Record<number, { l1: Lesson; l2: Lesson; reason?: string }[]> = {};
  const conflictedLessonIds = new Set<string>();

  if (!isAdmin) {
    Object.entries(lessonsByDay).forEach(([dayStr, dayLessons]) => {
      const day = Number(dayStr);
      conflictsByDay[day] = [];
      for (let i = 0; i < dayLessons.length; i++) {
        for (let j = i + 1; j < dayLessons.length; j++) {
          const l1 = dayLessons[i];
          const l2 = dayLessons[j];

          // For teacher account, only check if both lessons belong to this teacher
          if (l1.teacherId !== l2.teacherId) {
            continue;
          }

          if (l1.status === 'CANCELLED' || l2.status === 'CANCELLED') {
            continue;
          }

          const conflictCheck = checkTwoLessonsConflict(l1, l2, displayTimeZone);
          if (conflictCheck.isConflict) {
            conflictsByDay[day].push({ l1, l2, reason: conflictCheck.reasonArabic });
            conflictedLessonIds.add(l1.id);
            conflictedLessonIds.add(l2.id);
          }
        }
      }
    });
  }

  const totalConflicts = isAdmin ? 0 : conflictedLessonIds.size;

  const getStudent = (studentId: string) => students.find(s => s.id === studentId);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-emerald-700" />
            جدول الحصص الأسبوعي واليومي
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {user?.gender === 'FEMALE'
              ? `جدول حصص فضيلة المعلمة: ${user?.fullName} ومتابعة التوقيت الدولي المقابل في مصر والسعودية والإمارات`
              : user?.gender === 'MALE'
              ? `جدول حصص فضيلة المعلم: ${user?.fullName} ومتابعة التوقيت الدولي المقابل في مصر والسعودية والإمارات`
              : 'جدولة الحصص الدورية ومتابعة التوقيت المقابل في مصر والسعودية والإمارات'}
          </p>
        </div>

        {/* Display Timezone Selector & View Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Display Timezone */}
          <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs shadow-xs">
            <Globe className="w-4 h-4 text-emerald-700" />
            <span className="font-semibold text-slate-700">عرض الجدول بتوقيت:</span>
            <select
              value={displayTimeZone}
              onChange={(e) => setDisplayTimeZone(e.target.value)}
              className="bg-transparent font-bold text-emerald-900 outline-none cursor-pointer"
            >
              <option value="Africa/Cairo">مصر (القاهرة) 🇪🇬</option>
              <option value="Asia/Riyadh">السعودية (الرياض) 🇸🇦</option>
              <option value="Asia/Dubai">الإمارات (دبي) 🇦🇪</option>
            </select>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center p-1 bg-slate-200/80 rounded-xl">
            <button
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                viewMode === 'weekly'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              عرض أسبوعي
            </button>
            <button
              onClick={() => setViewMode('daily')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                viewMode === 'daily'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              عرض يومي
            </button>
          </div>
        </div>
      </div>

      {/* Conflict Warning Banner if conflicts exist (Teachers only, never shown to Admin) */}
      {!isAdmin && totalConflicts > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3.5 text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <h4 className="font-bold text-amber-950 text-sm">
              تحذير: تم رصد تعارض زمني في {totalConflicts} حصة على مدار الأسبوع!
            </h4>
            <p className="leading-relaxed">
              الحصص المحددة باللون الأصفر تحتوي على تداخل زمني في وقت المعلم. يرجى تعديل وقت إحدى الحصص لتجنب انشغال المعلم مع طالبين في آن واحد.
            </p>
          </div>
        </div>
      )}

      {exceptionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl flex items-center gap-3 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
          <span>{exceptionSuccess}</span>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-sm">
          جارٍ تحميل جدول الحصص...
        </div>
      ) : viewMode === 'weekly' ? (
        /* WEEKLY GRID VIEW (Saturday to Friday) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {DAYS_OF_WEEK.map((day) => {
            const dayLessons = lessonsByDay[day.id] || [];
            const dayConflicts = conflictsByDay[day.id] || [];
            const isToday = day.id === new Date().getDay();

            return (
              <div
                key={day.id}
                className={`bg-white rounded-2xl border flex flex-col min-h-[380px] shadow-xs ${
                  isToday
                    ? 'border-emerald-600 ring-2 ring-emerald-500/20'
                    : 'border-slate-200'
                }`}
              >
                {/* Day Header */}
                <div
                  className={`p-3 border-b text-center rounded-t-2xl flex items-center justify-between ${
                    isToday
                      ? 'bg-emerald-800 text-white border-emerald-800'
                      : 'bg-slate-50 text-slate-800 border-slate-200'
                  }`}
                >
                  <span className="font-bold text-sm">{day.label}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      isToday
                        ? 'bg-emerald-700 text-emerald-100'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {dayLessons.length} حصص
                  </span>
                </div>

                {/* Day Lessons Content */}
                <div className="p-2.5 flex-1 space-y-2 overflow-y-auto max-h-[500px]">
                  {dayLessons.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center p-4 text-slate-400 text-xs">
                      لا توجد حصص مجدولة
                    </div>
                  ) : (
                    dayLessons.map((lesson) => {
                      const student = getStudent(lesson.studentId);
                      const displayTimeObj = convertLessonTime(
                        lesson.localTime,
                        lesson.timeZone,
                        displayTimeZone
                      );
                      const conflictDetail = !isAdmin
                        ? dayConflicts.find(c => c.l1.id === lesson.id || c.l2.id === lesson.id)
                        : undefined;
                      const isConflicted = !isAdmin && !!conflictDetail;

                      return (
                        <div
                          key={lesson.id}
                          className={`p-3 rounded-xl border text-xs transition relative group ${
                            isConflicted
                              ? 'bg-amber-50 border-amber-300'
                              : 'bg-slate-50 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/20'
                          }`}
                        >
                          {isConflicted && (
                            <span className="absolute top-2 left-2 text-[10px] text-amber-800 font-bold bg-amber-200 px-1.5 py-0.5 rounded">
                              تعارض زمني
                            </span>
                          )}

                          <div className="font-bold text-slate-900 text-sm truncate">
                            {student?.fullName || 'طالب ترتيل'}
                          </div>

                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {student?.country}
                          </div>

                          {/* Time in 12-hour format */}
                          <div className="mt-2 pt-1.5 border-t border-slate-200/80 space-y-1">
                            <div className="flex items-center justify-between font-mono font-bold text-emerald-950">
                              <span>{displayTimeObj.time12}</span>
                              <span className="text-[10px] font-sans font-medium text-slate-500">
                                {lesson.durationMinutes} دقيقة
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              بتوقيت الطالب: {format12HourTime(lesson.localTime)}
                            </div>
                            {conflictDetail?.reason && (
                              <div className="mt-1.5 text-[10px] text-amber-900 font-bold bg-amber-100/70 p-1 rounded leading-tight">
                                ⚠️ {conflictDetail.reason}
                              </div>
                            )}
                          </div>

                          {/* Action: Add single date exception */}
                          <button
                            onClick={() => {
                              setExceptionLesson(lesson);
                              setReason('');
                            }}
                            className="w-full mt-2 py-1 text-[10px] text-slate-500 hover:text-emerald-800 hover:bg-white rounded border border-transparent hover:border-slate-200 transition font-medium"
                          >
                            استثناء تاريخ محدد
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DAILY VIEW */
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
          {/* Day selection tabs */}
          <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
            {DAYS_OF_WEEK.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDay(d.id)}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
                  selectedDay === d.id
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {d.label} ({(lessonsByDay[d.id] || []).length})
              </button>
            ))}
          </div>

          {/* Selected Day Schedule Details */}
          <div>
            <h3 className="text-base font-bold text-slate-900 mb-4">
              حصص يوم {DAYS_OF_WEEK.find(d => d.id === selectedDay)?.label} (بتوقيت {displayTimeZone === 'Africa/Cairo' ? 'مصر' : displayTimeZone === 'Asia/Riyadh' ? 'السعودية' : 'الإمارات'})
            </h3>

            {(lessonsByDay[selectedDay] || []).length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                لا توجد حصص مجدولة لهذا اليوم
              </div>
            ) : (
              <div className="space-y-3">
                {(lessonsByDay[selectedDay] || []).map((lesson) => {
                  const student = getStudent(lesson.studentId);
                  const cairoTime = convertLessonTime(lesson.localTime, lesson.timeZone, 'Africa/Cairo');
                  const riyadhTime = convertLessonTime(lesson.localTime, lesson.timeZone, 'Asia/Riyadh');
                  const dubaiTime = convertLessonTime(lesson.localTime, lesson.timeZone, 'Asia/Dubai');

                  return (
                    <div
                      key={lesson.id}
                      className="p-4 rounded-2xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/10 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base text-slate-900">
                            {student?.fullName}
                          </span>
                          <span className="text-xs text-slate-500">
                            ({student?.country})
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 flex items-center gap-2">
                          <span className="font-semibold text-emerald-800">
                            المدة: {lesson.durationMinutes} دقيقة
                          </span>
                          <span>·</span>
                          <span>وقت الطالب المحلي: {format12HourTime(lesson.localTime)}</span>
                        </div>
                      </div>

                      {/* Multi-timezone conversion badges (12-hour AM/PM) */}
                      <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs font-mono">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">مصر</span>
                          <span className="font-bold text-slate-800">{cairoTime.time12}</span>
                        </div>
                        <div className="w-px h-6 bg-slate-200" />
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">السعودية</span>
                          <span className="font-bold text-slate-800">{riyadhTime.time12}</span>
                        </div>
                        <div className="w-px h-6 bg-slate-200" />
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">الإمارات</span>
                          <span className="font-bold text-slate-800">{dubaiTime.time12}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setExceptionLesson(lesson);
                          setReason('');
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition"
                      >
                        استثناء تاريخ
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Exception Modal */}
      {exceptionLesson && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              تسجيل استثناء لحصة الطالب ({getStudent(exceptionLesson.studentId)?.fullName})
            </h3>
            <p className="text-xs text-slate-500">
              يمكنك إلغاء أو تغيير وقت الحصة لتاريخ محدد فقط دون التأثير على الجدول الأسبوعي الدوري المستقبلي.
            </p>

            <form onSubmit={handleSaveException} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  تاريخ الحصة المستثناة
                </label>
                <input
                  type="date"
                  required
                  value={exceptionDate}
                  onChange={(e) => setExceptionDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  نوع الاستثناء
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setExceptionType('CANCELLED')}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${
                      exceptionType === 'CANCELLED'
                        ? 'bg-red-50 text-red-800 border-red-300'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    إلغاء الحصة لهذا اليوم
                  </button>
                  <button
                    type="button"
                    onClick={() => setExceptionType('RESCHEDULED')}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl border transition ${
                      exceptionType === 'RESCHEDULED'
                        ? 'bg-blue-50 text-blue-800 border-blue-300'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    تأجيل / تعديل الوقت
                  </button>
                </div>
              </div>

              {exceptionType === 'RESCHEDULED' && (
                <div>
                  <TimePicker12
                    value={modifiedTime}
                    onChange={setModifiedTime}
                    label="الوقت البديل (بتوقيت الطالب المحلي)"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  سبب الاستثناء (اختياري)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="مثال: عطلة رسمية أو استئذان مسبق"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setExceptionLesson(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingException}
                  className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition"
                >
                  {submittingException ? 'جارٍ الحفظ...' : 'حفظ الاستثناء'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
