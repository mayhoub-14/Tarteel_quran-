import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { PayrollRequest, StudentPayrollBreakdown, PayrollStatus, PaymentMethod } from '../types';
import {
  Banknote,
  Calculator,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  XCircle,
  RotateCcw,
  UserCheck,
  CreditCard,
  Smartphone,
  Eye,
  History,
  Info,
  Calendar,
  Layers,
  FileSpreadsheet
} from 'lucide-react';

const LESSON_RATE = 65; // Fixed rate: 65 EGP per lesson

// Arabic month list for selection
const MONTH_OPTIONS = [
  { value: '2026-11', label: 'نوفمبر 2026 (الشهر الحالي)' },
  { value: '2026-10', label: 'أكتوبر 2026' },
  { value: '2026-09', label: 'سبتمبر 2026' },
  { value: '2026-08', label: 'أغسطس 2026' },
  { value: '2026-07', label: 'يوليو 2026' },
  { value: '2026-06', label: 'يونيو 2026' },
  { value: '2026-05', label: 'مايو 2026' },
];

export const SalaryPage: React.FC = () => {
  const { user } = useAuth();

  // Calculation state
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-11');
  const [calculating, setCalculating] = useState<boolean>(false);
  const [calculationResult, setCalculationResult] = useState<{
    month: string;
    monthLabel: string;
    students: StudentPayrollBreakdown[];
    totalLessons: number;
    lessonRate: number;
    totalSalary: number;
    existingRequest: PayrollRequest | null;
    canSubmit: boolean;
  } | null>(null);

  // Payment form state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('INSTAPAY');
  const [paymentAccount, setPaymentAccount] = useState<string>('');
  const [accountHolder, setAccountHolder] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // History state
  const [requestsHistory, setRequestsHistory] = useState<PayrollRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [selectedRequestDetails, setSelectedRequestDetails] = useState<PayrollRequest | null>(null);

  // Admin status update modal state
  const [adminTargetRequest, setAdminTargetRequest] = useState<PayrollRequest | null>(null);
  const [adminNewStatus, setAdminNewStatus] = useState<PayrollStatus>('APPROVED');
  const [adminNotes, setAdminNotes] = useState<string>('');
  const [adminUpdating, setAdminUpdating] = useState<boolean>(false);

  // Filter tab for admin
  const [adminTab, setAdminTab] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');

  const isAdmin = user?.role === 'ADMIN';

  // Load history on mount (only calculate for teachers, Admin does not receive salary)
  useEffect(() => {
    loadRequestsHistory();
    if (!isAdmin) {
      handleCalculate(selectedMonth);
    }
  }, [isAdmin]);

  const loadRequestsHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await api.getPayrollRequests();
      setRequestsHistory(res.requests || []);
    } catch (err: any) {
      console.error('Error fetching payroll history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCalculate = async (monthToCalc: string) => {
    setCalculating(true);
    setFormError(null);
    setSubmitSuccess(null);
    try {
      const res = await api.calculateSalary(monthToCalc);
      setCalculationResult(res);
      // If there's an existing request with payment info, prefill for convenience
      if (res.existingRequest) {
        setPaymentMethod(res.existingRequest.paymentMethod);
        setPaymentAccount(res.existingRequest.paymentAccount);
        setAccountHolder(res.existingRequest.accountHolder);
      }
    } catch (err: any) {
      setFormError(err?.message || 'حدث خطأ أثناء احتساب المرتب');
    } finally {
      setCalculating(false);
    }
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = e.target.value;
    setSelectedMonth(newMonth);
    handleCalculate(newMonth);
  };

  const handleSubmitPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitSuccess(null);

    if (!calculationResult) {
      setFormError('يرجى احتساب المرتب أولاً قبل الإرسال');
      return;
    }

    if (!paymentMethod) {
      setFormError('يرجى اختيار طريقة الدفع (انستاباي أو محفظة إلكترونية)');
      return;
    }

    const cleanAccount = paymentAccount.trim();
    if (!cleanAccount) {
      setFormError(
        paymentMethod === 'INSTAPAY'
          ? 'يرجى إدخال عنوان أو رقم حساب انستاباي'
          : 'يرجى إدخال رقم المحفظة الإلكترونية'
      );
      return;
    }

    if (paymentMethod === 'WALLET') {
      const cleaned = cleanAccount.replace(/\s+/g, '');
      if (!/^(010|011|012|015)\d{8}$/.test(cleaned)) {
        setFormError('رقم المحفظة الإلكترونية غير صحيح. يجب أن يكون رقماً مصرياً مكوناً من 11 رقماً يبدأ بـ 010 أو 011 أو 012 أو 015');
        return;
      }
    } else if (paymentMethod === 'INSTAPAY') {
      if (cleanAccount.length < 5) {
        setFormError('يرجى إدخال عنوان انستاباي صحيح (معرف انستاباي أو رقم هاتف مسجل)');
        return;
      }
    }

    const cleanHolder = accountHolder.trim();
    if (!cleanHolder || cleanHolder.length < 3) {
      setFormError('يرجى إدخال اسم صاحب الحساب أو المحفظة ثلاثياً على الأقل');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.submitPayroll({
        month: selectedMonth,
        paymentMethod,
        paymentAccount: cleanAccount,
        accountHolder: cleanHolder
      });

      setSubmitSuccess(
        `تم إرسال طلب صرف المرتب بنجاح وهو الآن قيد مراجعة واعتماد الإدارة.`
      );

      // Refresh calculation and history
      await handleCalculate(selectedMonth);
      await loadRequestsHistory();
    } catch (err: any) {
      setFormError(err?.message || 'فشل إرسال طلب المرتب');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminUpdateStatus = async () => {
    if (!adminTargetRequest) return;
    setAdminUpdating(true);
    try {
      await api.updatePayrollStatus(adminTargetRequest.id, adminNewStatus, adminNotes);
      setAdminTargetRequest(null);
      setAdminNotes('');
      await loadRequestsHistory();
      if (calculationResult && calculationResult.month === adminTargetRequest.month) {
        await handleCalculate(calculationResult.month);
      }
    } catch (err: any) {
      alert(err?.message || 'تعذر تحديث حالة الطلب');
    } finally {
      setAdminUpdating(false);
    }
  };

  // Status badge helper
  const renderStatusBadge = (status: PayrollStatus) => {
    switch (status) {
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>قيد المراجعة</span>
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
            <span>معتمد بانتظار التحويل</span>
          </span>
        );
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>تم الصرف والتحويل بنجاح</span>
          </span>
        );
      case 'RETURNED_FOR_CORRECTION':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-800 border border-orange-200">
            <RotateCcw className="w-3.5 h-3.5 text-orange-600" />
            <span>معاد للتعديل</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>مرفوض</span>
          </span>
        );
      default:
        return null;
    }
  };

  const teacherTitle =
    user?.gender === 'FEMALE'
      ? `فضيلة المعلمة / الأستاذة: ${user?.fullName}`
      : user?.gender === 'MALE'
      ? `فضيلة المعلم / الأستاذ: ${user?.fullName}`
      : user?.fullName || 'معلم الأكاديمية';

  // Filtered requests for admin view
  const filteredRequests = requestsHistory.filter(req => {
    if (adminTab === 'PENDING') return req.status === 'PENDING_REVIEW';
    if (adminTab === 'PAID') return req.status === 'PAID';
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold mb-1">
            <Banknote className="w-4 h-4 text-emerald-700" />
            <span>الشؤون المالية والإدارية · أكاديمية ترتيل</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {isAdmin ? 'إدارة واعتماد مسيرات رواتب المعلمين' : 'نظام احتساب وصرف مستحقات المعلمين'}
          </h1>
          <p className="text-sm text-slate-600">
            {isAdmin ? (
              <span className="font-bold text-emerald-900">حساب مدير الأكاديمية (الإدارة العامة والاعتماد المالي)</span>
            ) : (
              <>المعلم المسجل: <span className="font-bold text-slate-900">{teacherTitle}</span></>
            )}
          </p>
        </div>

        {/* Lesson Rate Card */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 px-5 flex items-center gap-4 shadow-xs self-start sm:self-auto">
          <div className="w-10 h-10 rounded-xl bg-emerald-800 text-white flex items-center justify-center flex-shrink-0">
            <Calculator className="w-5 h-5 text-emerald-200" />
          </div>
          <div>
            <div className="text-xs text-emerald-900 font-semibold">قيمة الحلقة المعتمدة</div>
            <div className="text-xl font-black text-emerald-950">
              {LESSON_RATE} <span className="text-xs font-normal text-emerald-800">ج.م / حلقة</span>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Management Notice */}
      {isAdmin ? (
        <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl space-y-2">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <UserCheck className="w-5 h-5 text-emerald-700" />
            <span>بوابة الإدارة العامة والرقابة المالية</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            حساب الإدارة مخصص حصراً لمتابعة، مراجعة، واعتماد مسيرات رواتب فضيلة المعلمين والمعلمات، وتوثيق أرقام الحوالات وتواريخ الصرف الفعلي. لا يتم احتساب أو إنشاء أي مسيرات رواتب لحساب الإدارة.
          </p>
        </div>
      ) : (
        <>
          {/* SECTION 1: MONTH SELECTION & AUTOMATIC CALCULATION */}
          <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm overflow-hidden">
            {/* Banner */}
        <div className="bg-gradient-to-l from-emerald-900 via-emerald-800 to-emerald-900 p-6 sm:p-7 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-emerald-200 font-semibold block mb-1">
                الخطوة الأولى
              </span>
              <h2 className="text-xl font-bold">
                احتساب المرتب الشهري تلقائياً
              </h2>
              <p className="text-xs text-emerald-100/90 pt-1">
                يتم قراءة الحلقات المكتملة لجميع طلابك خلال الشهر المحدد واحتساب المستحقات وفق معادلة الأكاديمية الرسمية.
              </p>
            </div>

            {/* Month Selector Controls */}
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur-xs p-2 rounded-2xl border border-white/20">
              <Calendar className="w-5 h-5 text-emerald-200 mr-1" />
              <div className="space-y-0.5">
                <label htmlFor="monthSelect" className="text-[11px] text-emerald-200 block font-semibold">
                  اختر الشهر المطلوب:
                </label>
                <select
                  id="monthSelect"
                  value={selectedMonth}
                  onChange={handleMonthChange}
                  className="bg-white text-slate-900 text-sm font-bold rounded-xl px-3 py-1.5 border-0 focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                >
                  {MONTH_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => handleCalculate(selectedMonth)}
                disabled={calculating}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-xs disabled:opacity-50"
              >
                <Calculator className="w-4 h-4" />
                <span>{calculating ? 'جاري الاحتساب...' : 'احتساب المرتب'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Calculation Content */}
        <div className="p-6 sm:p-8 space-y-6">
          {/* Duplicate Request Notice / Current Request Status */}
          {calculationResult?.existingRequest && (
            <div
              className={`p-4 rounded-2xl border flex items-start gap-3.5 text-xs ${
                calculationResult.existingRequest.status === 'RETURNED_FOR_CORRECTION'
                  ? 'bg-orange-50 border-orange-200 text-orange-950'
                  : 'bg-amber-50 border-amber-200 text-amber-950'
              }`}
            >
              {calculationResult.existingRequest.status === 'RETURNED_FOR_CORRECTION' ? (
                <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-sm">
                    {calculationResult.existingRequest.status === 'RETURNED_FOR_CORRECTION'
                      ? 'تمت إعادة هذا الطلب من الإدارة للتعديل:'
                      : 'يوجد طلب مسير رواتب مسجل مسبقاً لهذا الشهر:'}
                  </span>
                  <div>{renderStatusBadge(calculationResult.existingRequest.status)}</div>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  تاريخ التقديم:{' '}
                  <span className="font-semibold">
                    {new Date(calculationResult.existingRequest.submittedAt).toLocaleString('ar-EG')}
                  </span>
                  {' · '}
                  إجمالي المبلغ المقدم:{' '}
                  <span className="font-bold text-emerald-900">
                    {calculationResult.existingRequest.totalSalary} ج.م
                  </span>
                  {' ('}
                  {calculationResult.existingRequest.totalLessons} حلقة
                  {')'}
                </p>
                {calculationResult.existingRequest.reviewNotes && (
                  <p className="p-2.5 bg-white/70 rounded-xl border border-orange-200 text-orange-900 font-medium">
                    ملاحظات الإدارة:{' '}
                    <span className="font-semibold">{calculationResult.existingRequest.reviewNotes}</span>
                  </p>
                )}
                {!calculationResult.canSubmit && (
                  <p className="text-xs text-amber-900 font-semibold pt-1">
                    * حماية من تكرار الطلب: لا يمكن إرسال طلب جديد لنفس الشهر طالما أن الطلب السابق قيد المراجعة أو معتمد. إذا كنت بحاجة لتعديل، يرجى التواصل مع الإدارة لإعادة الطلب للتعديل.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Detailed Breakdown Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-700" />
                <span>كشف الحلقات والمستحقات حسب الطالب لشهر ({calculationResult?.monthLabel || selectedMonth}):</span>
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                المعادلة: عدد الحلقات × {LESSON_RATE} ج.م
              </span>
            </div>

            {calculating ? (
              <div className="py-12 text-center text-sm text-slate-500">
                جاري احتساب حلقات الطلاب وقراءة الخانات المحددة...
              </div>
            ) : calculationResult?.students && calculationResult.students.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-right text-sm">
                  <thead className="bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">اسم الطالب</th>
                      <th className="py-3 px-4 text-center">الحلقات المكتملة</th>
                      <th className="py-3 px-4 text-center">سعر الحلقة</th>
                      <th className="py-3 px-4 text-left">المبلغ المستحق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {calculationResult.students.map((st, idx) => (
                      <tr key={st.studentId} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 text-xs text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{st.studentName}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                              st.completedLessons > 0
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {st.completedLessons} حلقة
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs text-slate-500">
                          {LESSON_RATE} ج.م
                        </td>
                        <td className="py-3 px-4 text-left font-black text-slate-900 font-mono">
                          {st.totalAmount} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-emerald-50/70 border-t-2 border-emerald-200 text-slate-900 font-bold">
                    <tr>
                      <td colSpan={2} className="py-4 px-4 text-sm font-extrabold text-emerald-950">
                        الإجمالي العام للشهر:
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="text-base font-black text-emerald-900">
                          {calculationResult.totalLessons} حلقة
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center text-xs text-emerald-800">
                        × {LESSON_RATE} ج.م
                      </td>
                      <td className="py-4 px-4 text-left">
                        <span className="text-xl font-black text-emerald-900 font-mono">
                          {calculationResult.totalSalary} ج.م
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                لا يوجد طلاب مسجلون بحسابك حالياً. يمكنك إضافة طلاب من صفحة الطلاب لضبط حلقاتهم.
              </div>
            )}

            {/* Total Summary Formula Box */}
            {calculationResult && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-1">
                  <span className="text-xs text-slate-500 font-semibold block">إجمالي عدد الحلقات</span>
                  <span className="text-2xl font-black text-slate-900">{calculationResult.totalLessons}</span>
                  <span className="text-xs text-slate-400 block">حلقة مكتملة</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-1">
                  <span className="text-xs text-slate-500 font-semibold block">سعر الحلقة الموحد</span>
                  <span className="text-2xl font-black text-slate-900">{LESSON_RATE}</span>
                  <span className="text-xs text-slate-400 block">جنيه مصري</span>
                </div>
                <div className="bg-emerald-800 text-white border border-emerald-900 rounded-2xl p-4 text-center space-y-1 shadow-xs">
                  <span className="text-xs text-emerald-200 font-semibold block">إجمالي المرتب المستحق</span>
                  <span className="text-2xl font-black text-white">{calculationResult.totalSalary}</span>
                  <span className="text-xs text-emerald-200 block">جنيه مصري (EGP)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: PAYMENT INFORMATION & SUBMIT FORM */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="space-y-1 pb-4 border-b border-slate-200">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold mb-1 border border-emerald-200">
            <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
            <span>الخطوة الثانية: بيانات التحويل والصرف</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            بيانات وسيلة الدفع (انستاباي / محفظة إلكترونية)
          </h2>
          <p className="text-xs text-slate-600">
            يرجى إدخال بيانات التحويل المالية بدقة ليتم إيداع المستحقات فور اعتماد الإدارة.
          </p>
        </div>

        {/* Alerts */}
        {formError && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl text-xs flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <span className="font-semibold">{formError}</span>
          </div>
        )}

        {submitSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-950 rounded-2xl text-xs flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-sm block">تم إرسال الطلب بنجاح:</span>
              <p className="leading-relaxed text-emerald-800">{submitSuccess}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmitPayroll} className="space-y-6">
          {/* Payment Method Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 block">
              اختر طريقة التحويل المفضلة: <span className="text-rose-600">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* InstaPay */}
              <button
                type="button"
                onClick={() => setPaymentMethod('INSTAPAY')}
                className={`p-4 rounded-2xl border-2 text-right transition flex items-start gap-3 cursor-pointer ${
                  paymentMethod === 'INSTAPAY'
                    ? 'border-emerald-700 bg-emerald-50/60 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    paymentMethod === 'INSTAPAY'
                      ? 'bg-emerald-800 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">انستاباي (InstaPay)</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    التحويل عبر عنوان الدفع اللحظي (IPA) أو رقم الهاتف المرتبط
                  </div>
                </div>
              </button>

              {/* Electronic Wallet */}
              <button
                type="button"
                onClick={() => setPaymentMethod('WALLET')}
                className={`p-4 rounded-2xl border-2 text-right transition flex items-start gap-3 cursor-pointer ${
                  paymentMethod === 'WALLET'
                    ? 'border-emerald-700 bg-emerald-50/60 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    paymentMethod === 'WALLET'
                      ? 'bg-emerald-800 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">محفظة إلكترونية (E-Wallet)</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    فودافون كاش، أورنج كاش، اتصالات كاش، وي باي، إلخ
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Account Number & Account Holder Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Account / Wallet Number */}
            <div className="space-y-1.5">
              <label htmlFor="paymentAccountInput" className="text-xs font-bold text-slate-800 block">
                {paymentMethod === 'INSTAPAY'
                  ? 'عنوان انستاباي (IPA) أو رقم الهاتف المرتبط:'
                  : 'رقم المحفظة الإلكترونية (11 رقم):'}{' '}
                <span className="text-rose-600">*</span>
              </label>
              <input
                id="paymentAccountInput"
                type="text"
                dir="ltr"
                value={paymentAccount}
                onChange={e => setPaymentAccount(e.target.value)}
                placeholder={
                  paymentMethod === 'INSTAPAY'
                    ? 'e.g. name@instapay or 010xxxxxxxx'
                    : '010xxxxxxxx / 011xxxxxxxx / 012xxxxxxxx'
                }
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 text-sm font-mono text-left"
                required
              />
              <span className="text-[11px] text-slate-500 block">
                {paymentMethod === 'INSTAPAY'
                  ? 'مثال: mohamed@instapay أو رقم الهاتف المربوط بـ InstaPay'
                  : 'رقم فودافون كاش أو أورنج كاش أو اتصالات كاش أو وي باي'}
              </span>
            </div>

            {/* Account Holder Name */}
            <div className="space-y-1.5">
              <label htmlFor="accountHolderInput" className="text-xs font-bold text-slate-800 block">
                اسم صاحب الحساب / المحفظة بالكامل: <span className="text-rose-600">*</span>
              </label>
              <input
                id="accountHolderInput"
                type="text"
                value={accountHolder}
                onChange={e => setAccountHolder(e.target.value)}
                placeholder="الاسم المسجل بالبنك أو شركة الاتصالات"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 text-sm"
                required
              />
              <span className="text-[11px] text-slate-500 block">
                يستخدم للتحقق ومطابقة الاسم أثناء إجراء التحويل المالي
              </span>
            </div>
          </div>


          {/* Submit Action Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
            <div>
              {calculationResult && (
                <div className="text-xs text-slate-600">
                  المبلغ الإجمالي للطلب:{' '}
                  <span className="text-base font-black text-emerald-900 font-mono">
                    {calculationResult.totalSalary} ج.م
                  </span>
                  {' ('}
                  {calculationResult.totalLessons} حلقة
                  {')'}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={Boolean(submitting || (calculationResult && !calculationResult.canSubmit))}
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-base rounded-2xl shadow-md shadow-emerald-900/10 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Send className="w-5 h-5 text-emerald-200" />
              <span>
                {submitting
                  ? 'جاري إرسال الطلب...'
                  : calculationResult?.existingRequest?.status === 'RETURNED_FOR_CORRECTION'
                  ? 'إعادة إرسال طلب المرتب بعد التعديل'
                  : 'إرسال طلب المرتب'}
              </span>
            </button>
          </div>
        </form>
      </div>
      </>
      )}

      {/* SECTION 3: PAYROLL REQUESTS HISTORY */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-bold mb-1">
              <History className="w-3.5 h-3.5 text-slate-600" />
              <span>سجل الطلبات والمستحقات السابقة</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {isAdmin ? 'جميع طلبات مسيرات الرواتب في الأكاديمية (لوحة الإدارة)' : 'طلبات المرتب الخاصة بي'}
            </h2>
          </div>

          {/* Admin Filter Tabs */}
          {isAdmin && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setAdminTab('ALL')}
                className={`px-3 py-1.5 rounded-xl transition ${
                  adminTab === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الكل ({requestsHistory.length})
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('PENDING')}
                className={`px-3 py-1.5 rounded-xl transition ${
                  adminTab === 'PENDING' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                قيد المراجعة ({requestsHistory.filter(r => r.status === 'PENDING_REVIEW').length})
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('PAID')}
                className={`px-3 py-1.5 rounded-xl transition ${
                  adminTab === 'PAID' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                تم الصرف ({requestsHistory.filter(r => r.status === 'PAID').length})
              </button>
            </div>
          )}
        </div>

        {loadingHistory ? (
          <div className="py-12 text-center text-sm text-slate-500">
            جاري تحميل سجل مسيرات الرواتب...
          </div>
        ) : filteredRequests.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-700 text-xs font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">الشهر</th>
                  {isAdmin && <th className="py-3 px-4">المعلم</th>}
                  <th className="py-3 px-4 text-center">عدد الحلقات</th>
                  <th className="py-3 px-4 text-center">إجمالي المرتب</th>
                  <th className="py-3 px-4">طريقة التحويل</th>
                  <th className="py-3 px-4 text-center">الحالة</th>
                  <th className="py-3 px-4">تاريخ التقديم</th>
                  <th className="py-3 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRequests.map(req => (
                  <tr key={req.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-bold text-slate-900">{req.monthLabel}</td>
                    {isAdmin && (
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{req.teacherName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{req.teacherEmail}</div>
                      </td>
                    )}
                    <td className="py-3 px-4 text-center font-bold text-slate-800">
                      {req.totalLessons} حلقة
                    </td>
                    <td className="py-3 px-4 text-center font-black text-emerald-900 font-mono">
                      {req.totalSalary} ج.م
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div className="font-semibold text-slate-800">
                        {req.paymentMethod === 'INSTAPAY' ? 'انستاباي' : 'محفظة إلكترونية'}
                      </div>
                      <div className="font-mono text-slate-500 text-[11px] dir-ltr text-right">
                        {req.paymentAccount}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">{renderStatusBadge(req.status)}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {new Date(req.submittedAt).toLocaleDateString('ar-EG', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-2">
                        {/* View Snapshot Details */}
                        <button
                          type="button"
                          onClick={() => setSelectedRequestDetails(req)}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 transition"
                          title="عرض كشف الطلاب المرفوع"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Admin Action Button */}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setAdminTargetRequest(req);
                              setAdminNewStatus(req.status);
                              setAdminNotes(req.reviewNotes || '');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold transition"
                          >
                            مراجعة / تعديل الحالة
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            لا توجد طلبات مسيرات رواتب مسجلة حتى الآن.
          </div>
        )}
      </div>

      {/* MODAL 1: VIEW DETAILS MODAL */}
      {selectedRequestDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs text-emerald-800 font-bold block">
                  كشف الحلقات المعتمد بالطلب
                </span>
                <h3 className="text-lg font-black text-slate-900">
                  تفاصيل مسير رواتب شهر {selectedRequestDetails.monthLabel}
                </h3>
                <p className="text-xs text-slate-500">
                  المعلم: {selectedRequestDetails.teacherName} ({selectedRequestDetails.teacherEmail})
                </p>
              </div>
              <div>{renderStatusBadge(selectedRequestDetails.status)}</div>
            </div>

            {/* Payment Details Box */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">طريقة التحويل:</span>
                <span className="font-bold text-slate-900">
                  {selectedRequestDetails.paymentMethod === 'INSTAPAY' ? 'انستاباي (InstaPay)' : 'محفظة إلكترونية (E-Wallet)'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">رقم الحساب / المحفظة:</span>
                <span className="font-mono font-bold text-slate-900 dir-ltr text-right block">
                  {selectedRequestDetails.paymentAccount}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">اسم صاحب الحساب:</span>
                <span className="font-bold text-slate-900">
                  {selectedRequestDetails.accountHolder}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">تاريخ الإرسال:</span>
                <span className="font-semibold text-slate-700">
                  {new Date(selectedRequestDetails.submittedAt).toLocaleString('ar-EG')}
                </span>
              </div>
            </div>

            {/* Students Snapshot List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700">
                الطلاب والحلقات المحسوبة في هذا الطلب:
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold">
                    <tr>
                      <th className="py-2.5 px-3">اسم الطالب</th>
                      <th className="py-2.5 px-3 text-center">الحلقات</th>
                      <th className="py-2.5 px-3 text-center">سعر الحلقة</th>
                      <th className="py-2.5 px-3 text-left">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedRequestDetails.students.map((st, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-semibold text-slate-900">{st.studentName}</td>
                        <td className="py-2 px-3 text-center font-bold text-emerald-800">
                          {st.completedLessons} حلقة
                        </td>
                        <td className="py-2 px-3 text-center font-mono text-slate-500">
                          {st.ratePerLesson || LESSON_RATE} ج.م
                        </td>
                        <td className="py-2 px-3 text-left font-bold font-mono text-slate-900">
                          {st.totalAmount} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-emerald-50/70 font-bold border-t border-emerald-200">
                    <tr>
                      <td className="py-2.5 px-3 text-emerald-950">الإجمالي:</td>
                      <td className="py-2.5 px-3 text-center text-emerald-900 font-black">
                        {selectedRequestDetails.totalLessons} حلقة
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-500">× {LESSON_RATE}</td>
                      <td className="py-2.5 px-3 text-left text-emerald-900 font-black font-mono">
                        {selectedRequestDetails.totalSalary} ج.م
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Review Notes if any */}
            {selectedRequestDetails.reviewNotes && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                <span className="font-bold text-amber-950 block">ملاحظات الإدارة المالية:</span>
                <p className="text-amber-900">{selectedRequestDetails.reviewNotes}</p>
                {selectedRequestDetails.reviewedBy && (
                  <p className="text-[11px] text-amber-700">
                    المراجع: {selectedRequestDetails.reviewedBy} ·{' '}
                    {selectedRequestDetails.reviewedAt && new Date(selectedRequestDetails.reviewedAt).toLocaleString('ar-EG')}
                  </p>
                )}
              </div>
            )}

            <div className="pt-2 text-left">
              <button
                type="button"
                onClick={() => setSelectedRequestDetails(null)}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADMIN STATUS UPDATE MODAL */}
      {isAdmin && adminTargetRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-200">
            <div className="space-y-1 border-b border-slate-200 pb-3">
              <span className="text-xs text-emerald-800 font-bold block">
                لوحة الإدارة المالية · أكاديمية ترتيل
              </span>
              <h3 className="text-lg font-black text-slate-900">
                مراجعة مسير راتب: {adminTargetRequest.teacherName}
              </h3>
              <p className="text-xs text-slate-500">
                الشهر: {adminTargetRequest.monthLabel} · المبلغ: {adminTargetRequest.totalSalary} ج.م ({adminTargetRequest.totalLessons} حلقة)
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">
                  تحديد الحالة الجديدة:
                </label>
                <select
                  value={adminNewStatus}
                  onChange={e => setAdminNewStatus(e.target.value as PayrollStatus)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="PENDING_REVIEW">قيد المراجعة (PENDING_REVIEW)</option>
                  <option value="APPROVED">معتمد بانتظار التحويل (APPROVED)</option>
                  <option value="PAID">تم الصرف والتحويل بنجاح (PAID)</option>
                  <option value="RETURNED_FOR_CORRECTION">معاد للتعديل (RETURNED_FOR_CORRECTION)</option>
                  <option value="REJECTED">مرفوض (REJECTED)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">
                  ملاحظات المراجعة أو سبب الإعادة/الرفض:
                </label>
                <textarea
                  rows={3}
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="اكتب ملاحظات للمعلم أو رقم الحوالة/المرجع البنكي..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setAdminTargetRequest(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={adminUpdating}
                onClick={handleAdminUpdateStatus}
                className="px-6 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl transition disabled:opacity-50"
              >
                {adminUpdating ? 'جاري الحفظ...' : 'حفظ الحالة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
