import React, { useState } from 'react';
import { api } from '../services/api';
import { BookOpen, User, Users, Mail, Lock, AlertCircle, CheckCircle2, ArrowRight, Check } from 'lucide-react';

interface RegisterProps {
  onNavigate: (page: string) => void;
}

export const Register: React.FC<RegisterProps> = ({ onNavigate }) => {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!gender) {
      setError('يرجى تحديد صفة المعلم (ذكر أو أنثى) لضبط الألقاب الرسمية المناسبة');
      return;
    }

    if (password !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }

    if (password.length < 6) {
      setError('يجب ألا تقل كلمة المرور عن 6 خانات');
      return;
    }

    setLoading(true);

    try {
      await api.register({
        fullName,
        username,
        email,
        gender,
        password,
        confirmPassword
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء إرسال طلب التسجيل');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-300">
              <CheckCircle2 className="w-10 h-10 text-emerald-700" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              تم استلام طلب التسجيل بنجاح!
            </h3>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm leading-relaxed mb-6">
              حسابك الآن في حالة <strong className="text-amber-800">"قيد المراجعة والاعتماد" (PENDING)</strong>. 
              وفقاً لسياسة أكاديمية ترتيل، يقوم مسؤول النظام بمراجعة طلبات المعلمين الجدد واعتمادها قبل السماح بالدخول إلى الجداول وبيانات الطلاب.
            </div>
            <p className="text-xs text-slate-500 mb-6">
              يمكنك التحقق من حالة حسابك عبر تسجيل الدخول في أي وقت.
            </p>
            <button
              onClick={() => onNavigate('login')}
              className="w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-sm transition"
            >
              العودة لصفحة تسجيل الدخول
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-800 flex items-center justify-center shadow-md border border-emerald-700">
            <BookOpen className="w-8 h-8 text-emerald-100" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-extrabold text-slate-900">
          تسجيل معلم جديد
        </h2>
        <p className="mt-1 text-center text-xs text-emerald-800 font-medium">
          أكاديمية ترتيل القرآن الكريم
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-800 text-xs">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                الاسم الكامل (ثلاثي أو رباعي)
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="مثال: عبد الرحمن أحمد أو سارة الكردي"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
                />
              </div>
            </div>

            {/* Required Gender Selection Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>صفة المعلم (إجباري لضبط الألقاب الرسمية)</span>
                {gender && (
                  <span className="text-[11px] text-emerald-800 font-bold">
                    {gender === 'MALE' ? 'الألقاب: فضيلة المعلم / الأستاذ' : 'الألقاب: فضيلة المعلمة / الأستاذة'}
                  </span>
                )}
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setGender('MALE')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    gender === 'MALE'
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>ذكر (فضيلة المعلم)</span>
                  {gender === 'MALE' && <Check className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => setGender('FEMALE')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    gender === 'FEMALE'
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>أنثى (فضيلة المعلمة)</span>
                  {gender === 'FEMALE' && <Check className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                يُحدد اللقب المعتمد رسمياً في شهاداتك وجداول حصصك ولوحة تحكمك
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                اسم المستخدم (بالإنجليزية)
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ahmed_tarteel"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">يُستخدم لتسجيل الدخول السريع</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teacher@example.com"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                تأكيد كلمة المرور
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none"
                />
              </div>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-xl text-xs text-emerald-900 leading-relaxed">
              <strong>تنويه:</strong> بعد إرسال الطلب، يدخل الحساب تلقائياً في مرحلة المراجعة (Pending) حتى يعتمده مسؤول الأكاديمية لحماية خصوصية بيانات الطلاب.
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-sm shadow-sm transition disabled:opacity-50"
            >
              {loading ? 'جارٍ إرسال الطلب...' : 'إرسال طلب التسجيل'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <button
              onClick={() => onNavigate('login')}
              className="text-xs text-slate-600 hover:text-slate-900 font-semibold inline-flex items-center gap-1.5"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              لديك حساب بالفعل؟ تسجيل الدخول
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
