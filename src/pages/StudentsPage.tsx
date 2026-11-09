import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Student } from '../types';
import { SUPPORTED_TIME_ZONES, DAYS_OF_WEEK, convertLessonTime, format12HourTime } from '../utils/timezone';
import { TimePicker12 } from '../components/TimePicker12';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Archive,
  RotateCcw,
  Trash2,
  Calendar,
  Clock,
  Globe,
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Check,
  X
} from 'lucide-react';

export const StudentsPage: React.FC = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Student form state - strictly required fields (duration is set automatically to 30 mins)
  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('المملكة العربية السعودية');
  const [timeZone, setTimeZone] = useState('Asia/Riyadh');
  const [studyDaysPerWeek, setStudyDaysPerWeek] = useState<number>(2); // 1-7 days per week
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 2]); // Sunday, Tuesday default
  const [lessonLocalTime, setLessonLocalTime] = useState('17:00');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmation modal state
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);

  useEffect(() => {
    loadStudents();
  }, [showArchived]);

  const loadStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getStudents(showArchived);
      setStudents(res.students || []);
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل بيانات الطلاب');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setFullName('');
    setCountry('المملكة العربية السعودية');
    setTimeZone('Asia/Riyadh');
    setStudyDaysPerWeek(2);
    setSelectedDays([0, 2]);
    setLessonLocalTime('17:00');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFullName(student.fullName);
    setCountry(student.country);
    setTimeZone(student.timeZone);
    const existingDays = student.lessons?.map(l => l.dayOfWeek) || [0, 2];
    setSelectedDays(existingDays);
    const initialDays = student.studyDaysPerWeek || existingDays.length || 2;
    setStudyDaysPerWeek(initialDays);
    const existingTime = student.lessons?.[0]?.localTime || '17:00';
    setLessonLocalTime(existingTime);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCountryChange = (cName: string) => {
    setCountry(cName);
    const matched = SUPPORTED_TIME_ZONES.find(tz => tz.country === cName);
    if (matched) {
      setTimeZone(matched.id);
    }
  };

  const handleStudyDaysChange = (daysCount: number) => {
    setStudyDaysPerWeek(daysCount);
    // Sync selectedDays with the chosen count of days
    if (selectedDays.length < daysCount) {
      const available = [0, 1, 2, 3, 4, 5, 6].filter(d => !selectedDays.includes(d));
      const toAdd = available.slice(0, daysCount - selectedDays.length);
      setSelectedDays([...selectedDays, ...toAdd].sort((a, b) => a - b));
    } else if (selectedDays.length > daysCount) {
      setSelectedDays(selectedDays.slice(0, daysCount));
    }
    setFormError(null);
  };

  const toggleDay = (dayId: number) => {
    let nextDays: number[];
    if (selectedDays.includes(dayId)) {
      if (selectedDays.length === 1) {
        setFormError('يجب تحديد يوم واحد على الأقل للحصة الأسبوعية');
        return;
      }
      nextDays = selectedDays.filter(d => d !== dayId);
    } else {
      nextDays = [...selectedDays, dayId].sort((a, b) => a - b);
    }
    setSelectedDays(nextDays);
    setStudyDaysPerWeek(nextDays.length);
    setFormError(null);
  };

  const handleToggleEpisode = async (studentId: string, episodeNumber: number) => {
    // Optimistic UI update
    setStudents(prev =>
      prev.map(s => {
        if (s.id !== studentId) return s;
        const current = s.completedEpisodes || [];
        const isDone = current.includes(episodeNumber);
        const updated = isDone
          ? current.filter(n => n !== episodeNumber)
          : [...current, episodeNumber].sort((a, b) => a - b);
        return { ...s, completedEpisodes: updated };
      })
    );

    try {
      await api.toggleStudentEpisode(studentId, episodeNumber);
    } catch (err: any) {
      console.error('Error toggling episode:', err);
      loadStudents();
    }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Strict validation
    if (!fullName.trim()) {
      setFormError('يرجى إدخال اسم الطالب');
      return;
    }

    if (selectedDays.length === 0) {
      setFormError('يرجى اختيار يوم أو أيام الحصص الأسبوعية');
      return;
    }

    if (!lessonLocalTime) {
      setFormError('يرجى تحديد وقت الحصة');
      return;
    }

    setSaving(true);

    const schedules = selectedDays.map(dayOfWeek => ({
      dayOfWeek,
      localTime: lessonLocalTime
    }));

    try {
      if (editingStudent) {
        await api.updateStudent(editingStudent.id, {
          fullName,
          country,
          timeZone,
          durationMinutes: 30, // Default duration automatically 30 minutes
          studyDaysPerWeek,
          lessonSchedules: schedules
        });
        setSuccessMessage('تم تحديث بيانات الطالب وحلقاته بنجاح');
      } else {
        await api.createStudent({
          fullName,
          country,
          timeZone,
          durationMinutes: 30, // Default automatically 30 minutes
          studyDaysPerWeek,
          lessonSchedules: schedules
        });
        setSuccessMessage(`تمت إضافة الطالب وتوليد ${studyDaysPerWeek * 4} حلقة شهرية بنجاح`);
      }

      setIsModalOpen(false);
      loadStudents();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setFormError(err?.message || 'حدث خطأ أثناء حفظ بيانات الطالب');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (student: Student) => {
    try {
      if (student.isArchived) {
        await api.restoreStudent(student.id);
        setSuccessMessage(`تمت استعادة الطالب (${student.fullName}) إلى القائمة النشطة`);
      } else {
        await api.archiveStudent(student.id);
        setSuccessMessage(`تمت أرشفة الطالب (${student.fullName}) بنجاح`);
      }
      loadStudents();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'تعذر تغيير حالة أرشفة الطالب');
    }
  };

  const handleConfirmDelete = async () => {
    if (!studentToDelete) return;
    try {
      await api.deleteStudent(studentToDelete.id);
      setSuccessMessage(`تم حذف الطالب (${studentToDelete.fullName}) نهائياً`);
      setStudentToDelete(null);
      loadStudents();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'تعذر حذف الطالب');
    }
  };


  // Filter students by search term
  const filteredStudents = students.filter(s =>
    s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.country.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Time conversion preview for form
  const previewCairo = convertLessonTime(lessonLocalTime, timeZone, 'Africa/Cairo');
  const previewRiyadh = convertLessonTime(lessonLocalTime, timeZone, 'Asia/Riyadh');
  const previewDubai = convertLessonTime(lessonLocalTime, timeZone, 'Asia/Dubai');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              إدارة الطلاب
            </h2>
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-bold">
              {students.length} طالب
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {user?.gender === 'FEMALE'
              ? `سجل طلاب فضيلة المعلمة: ${user?.fullName} مع جدول الحصص الدوري والتوقيت الدولي`
              : user?.gender === 'MALE'
              ? `سجل طلاب فضيلة المعلم: ${user?.fullName} مع جدول الحصص الدوري والتوقيت الدولي`
              : 'سجل الطلاب التابعين لك مباشرة مع جدول الحصص الدوري والتوقيت الدولي'}
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          إضافة طالب جديد
        </button>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl flex items-center gap-3 text-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-900 rounded-2xl flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Controls Bar: Search & Archived toggle */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث باسم الطالب أو الدولة..."
            className="w-full pl-3 pr-10 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowArchived(false)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
              !showArchived
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            الطلاب النشطون
          </button>
          <button
            onClick={() => setShowArchived(true)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
              showArchived
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            الأرشيف
          </button>
        </div>
      </div>

      {/* Students List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">
          جارٍ تحميل سجلات الطلاب...
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-slate-300 p-8">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            {searchTerm ? 'لا يوجد طلاب يطابقون كلمة البحث' : showArchived ? 'لا يوجد طلاب في الأرشيف' : 'لم تقم بإضافة طلاب حتى الآن'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
            {searchTerm
              ? 'تأكد من كتابة الاسم بشكل صحيح'
              : 'أضف أول طالب لك لبدء جدولة الحصص وحساب التوقيت الدولي وإصدار شهادات التقدير.'}
          </p>
          {!showArchived && !searchTerm && (
            <button
              onClick={handleOpenAdd}
              className="mt-4 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              إضافة طالب جديد الآن
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStudents.map((student) => {
            const studentLessons = student.lessons || [];
            return (
              <div
                key={student.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs transition hover:shadow-md flex flex-col justify-between ${
                  student.isArchived ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200'
                }`}
              >
                <div className="space-y-4">
                  {/* Top: Name & Country */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base">
                        {student.fullName}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <Globe className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{student.country}</span>
                        <span>·</span>
                        <span className="font-mono">{student.timeZone.split('/')[1] || student.timeZone}</span>
                      </div>
                    </div>
                    {student.isArchived && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-bold">
                        مؤرشف
                      </span>
                    )}
                  </div>

                  {/* Lesson schedules & study days */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-xs">
                    {(() => {
                      const daysPerWeek = student.studyDaysPerWeek || studentLessons.length || 2;
                      const totalEpisodes = daysPerWeek * 4;
                      return (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                            أيام الدراسة أسبوعياً:
                          </span>
                          <span className="font-bold text-emerald-900 bg-emerald-100/70 px-2.5 py-0.5 rounded-lg">
                            {daysPerWeek} {daysPerWeek === 1 ? 'يوم' : daysPerWeek === 2 ? 'يومان' : 'أيام'} ({totalEpisodes} حلقة شهرياً)
                          </span>
                        </div>
                      );
                    })()}

                    <div className="pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] text-slate-500 block mb-1 font-semibold">
                        الحصص الأسبوعية:
                      </span>
                      {studentLessons.length === 0 ? (
                        <span className="text-slate-400 text-[11px]">لا توجد حصص مجدولة</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {studentLessons.map((l) => (
                            <span
                              key={l.id}
                              className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 font-medium"
                            >
                              {DAYS_OF_WEEK.find(d => d.id === l.dayOfWeek)?.label} ({format12HourTime(l.localTime)})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Generated Episodes Checkboxes Section */}
                  {(() => {
                    const daysPerWeek = student.studyDaysPerWeek || studentLessons.length || 2;
                    const totalEpisodes = daysPerWeek * 4;
                    const completedList = student.completedEpisodes || [];
                    const completedCount = completedList.filter(n => n <= totalEpisodes).length;
                    const percent = Math.min(100, Math.round((completedCount / totalEpisodes) * 100));

                    return (
                      <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <CheckSquare className="w-4 h-4 text-emerald-700" />
                            <span>متابعة الحلقات ({completedCount} من {totalEpisodes})</span>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-200">
                            {percent}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        {/* Sequentially Numbered Episode Checkboxes */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                          {Array.from({ length: totalEpisodes }, (_, i) => i + 1).map((epNum) => {
                            const isDone = completedList.includes(epNum);
                            return (
                              <label
                                key={epNum}
                                className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-[11px] cursor-pointer transition select-none ${
                                  isDone
                                    ? 'bg-emerald-800 text-white border-emerald-800 shadow-2xs font-bold'
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isDone}
                                  onChange={() => handleToggleEpisode(student.id, epNum)}
                                  className="w-3.5 h-3.5 rounded accent-emerald-600 cursor-pointer"
                                />
                                <span className="truncate">الحلقة {epNum}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                </div>

                {/* Card Actions */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEdit(student)}
                      className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition"
                      title="تعديل بيانات الطالب"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleArchive(student)}
                      className="p-1.5 text-slate-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition"
                      title={student.isArchived ? 'استعادة من الأرشيف' : 'أرشفة الطالب'}
                    >
                      {student.isArchived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setStudentToDelete(student)}
                      className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                      title="حذف الطالب نهائياً"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-400">
                    تكرار أسبوعي منتظم
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Student Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingStudent ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveStudent} className="space-y-4">
              {/* Field 1: Student Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  1. اسم الطالب أو الطالبة الكامل
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="مثال: نورة خالد صالح الرشيد"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
                />
              </div>

              {/* Field 2 & 3: Country & Student Time Zone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    2. دولة الطالب
                  </label>
                  <select
                    value={country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none bg-white"
                  >
                    <option value="المملكة العربية السعودية">المملكة العربية السعودية 🇸🇦</option>
                    <option value="مصر">جمهورية مصر العربية 🇪🇬</option>
                    <option value="الإمارات العربية المتحدة">الإمارات العربية المتحدة 🇦🇪</option>
                    <option value="الكويت">دولة الكويت 🇰🇼</option>
                    <option value="قطر">دولة قطر 🇶🇦</option>
                    <option value="الأردن">المملكة الأردنية 🇯🇴</option>
                    <option value="المملكة المتحدة">المملكة المتحدة 🇬🇧</option>
                    <option value="الولايات المتحدة">الولايات المتحدة 🇺🇸</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    3. المنطقة الزمنية (IANA)
                  </label>
                  <select
                    value={timeZone}
                    onChange={(e) => setTimeZone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none bg-white font-mono text-xs"
                  >
                    {SUPPORTED_TIME_ZONES.map((tz) => (
                      <option key={tz.id} value={tz.id}>
                        {tz.label} ({tz.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Number of study days per week (4 episodes automatically generated per day) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-700" />
                    عدد أيام الدراسة في الأسبوع:
                  </label>
                  <span className="text-xs font-bold text-emerald-900 bg-emerald-100/80 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                    {studyDaysPerWeek} {studyDaysPerWeek === 1 ? 'يوم' : studyDaysPerWeek === 2 ? 'يومان' : 'أيام'} أسبوعياً
                  </span>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                    <button
                      type="button"
                      key={num}
                      onClick={() => handleStudyDaysChange(num)}
                      className={`py-2 text-xs font-bold rounded-xl border transition ${
                        studyDaysPerWeek === num
                          ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {num} {num === 1 ? 'يوم' : 'أيام'}
                    </button>
                  ))}
                </div>

                {/* Automatic Episode Generation Notice & Preview */}
                <div className="mt-2.5 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-1.5 text-xs text-emerald-950">
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <CheckSquare className="w-4 h-4 text-emerald-700" />
                      توليد الحلقات تلقائياً (4 حلقات لكل يوم دراسة):
                    </span>
                    <span className="bg-emerald-800 text-white px-2.5 py-0.5 rounded-md text-[11px]">
                      {studyDaysPerWeek * 4} حلقة شهرياً
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-900/90 leading-relaxed">
                    يتم توليد 4 حلقات شهرياً لكل يوم دراسة أسبوعياً تلقائياً ({studyDaysPerWeek} × 4 = {studyDaysPerWeek * 4} حلقات). ستظهر مربعات اختيار مرقمة تسلسلياً (الحلقة 1 إلى الحلقة {studyDaysPerWeek * 4}) لمتابعة إنجاز كل حلقة بعد الدرس.
                  </p>
                </div>
              </div>

              {/* Field 4: Lesson Day or Days */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  4. أيام الحصص الأسبوعية المتكررة
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {DAYS_OF_WEEK.map((day) => {
                    const isSelected = selectedDays.includes(day.id);
                    return (
                      <button
                        type="button"
                        key={day.id}
                        onClick={() => toggleDay(day.id)}
                        className={`py-2 text-xs font-bold rounded-xl border text-center transition ${
                          isSelected
                            ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Field 5: Lesson Local Time with 12-hour AM/PM Picker */}
              <div>
                <TimePicker12
                  value={lessonLocalTime}
                  onChange={setLessonLocalTime}
                  label="5. وقت الحصة بتوقيت الطالب المحلي"
                />
              </div>

              {/* Field 6: Recurrence Live International Time Conversion Box */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <span className="font-bold text-slate-800 block">
                  6. معاينة التوقيت الدولي المقابل للحصة (بنظام 12 ساعة AM/PM):
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">مصر (القاهرة)</span>
                    <span className="font-mono font-bold text-emerald-900">{previewCairo.time12}</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">السعودية (الرياض)</span>
                    <span className="font-mono font-bold text-emerald-900">{previewRiyadh.time12}</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-400 block">الإمارات (دبي)</span>
                    <span className="font-mono font-bold text-emerald-900">{previewDubai.time12}</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold shadow-xs transition disabled:opacity-50"
                >
                  {saving ? 'جارٍ الحفظ...' : editingStudent ? 'حفظ التعديلات' : 'إضافة الطالب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Dialog */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">
                تأكيد حذف الطالب نهائياً
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                هل أنت متأكد من رغبتك في حذف الطالب <strong>({studentToDelete.fullName})</strong> وجميع حصصه المسجلة؟ لن يمكن التراجع عن هذا الإجراء.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStudentToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition shadow-xs"
              >
                تأكيد الحذف النهائي
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
