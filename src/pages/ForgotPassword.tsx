import React, { useState } from 'react';
import { BookOpen, Mail, ArrowRight, CheckCircle2, ShieldCheck, Lock, KeyRound, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

interface ForgotPasswordProps {
  onNavigate: (page: string) => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onNavigate }) => {
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialToken = urlParams?.get('token') || urlParams?.get('setupToken') || '';

  const [step, setStep] = useState<'REQUEST' | 'SET_PASSWORD' | 'COMPLETED'>(
    initialToken ? 'SET_PASSWORD' : 'REQUEST'
  );
  const [email, setEmail] = useState('amyhoub7@gmail.com');
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(
    initialToken ? 'تم تفعيل رمز التحقق الخاص بك بنجاح من الرابط الآمن. يمكنك الآن تعيين كلمة المرور الجديدة.' : null
  );

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.requestPasswordReset(email);
      setSuccessInfo(res.message);
      if (res.setupToken) {
        setToken(res.setupToken);
      }
      setStep('SET_PASSWORD');
    } catch (err: any) {
      setError(err?.message || 'تعذر معالجة الطلب، يرجى التحقق من البريد الإلكتروني.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('يجب ألا تقل كلمة المرور عن 8 خانات وتحتوي على أرقام وحروف');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقين');
      return;
    }

    setLoading(true);
    try {
      await api.setupPassword({
        token,
        newPassword,
        confirmPassword
      });
      setStep('COMPLETED');
    } catch (err: any) {
      setError(err?.message || 'رمز التحقق غير صالح أو انتهت صلاحيته.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-800 flex items-center justify-center shadow-md border border-emerald-700">
            <BookOpen className="w-8 h-8 text-emerald-100" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-extrabold text-slate-900">
          {step === 'REQUEST' && 'إعداد واستعادة كلمة المرور'}
          {step === 'SET_PASSWORD' && 'تعيين كلمة المرور الجديدة'}
          {step === 'COMPLETED' && 'تم تعيين كلمة المرور بنجاح'}
        </h2>
        <p className="mt-1 text-center text-xs text-emerald-800 font-medium">
          أكاديمية ترتيل القرآن الكريم
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === 'REQUEST' && (
            <form className="space-y-4" onSubmit={handleRequestToken}>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                أدخل البريد الإلكتروني المسجل في أكاديمية ترتيل لإنشاء رمز آمن لتعيين كلمة المرور لأول مرة أو استعادتها.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  البريد الإلكتروني المعتمد
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="amyhoub7@gmail.com"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none text-left"
                    dir="ltr"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
                <span>
                  لأسباب أمنية، الرمز الناتج صالح للاستخدام مرة واحدة فقط ولمدة 60 دقيقة.
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-sm shadow-sm transition disabled:opacity-50"
              >
                {loading ? 'جارٍ التحقق وإنشاء الرمز...' : 'متابعة لتعيين كلمة المرور'}
              </button>

              <div className="pt-3 border-t border-slate-100 text-center">
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="text-xs text-slate-600 hover:text-slate-900 font-semibold inline-flex items-center gap-1.5"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  العودة لتسجيل الدخول
                </button>
              </div>
            </form>
          )}

          {step === 'SET_PASSWORD' && (
            <form className="space-y-4" onSubmit={handleSetPassword}>
              {successInfo && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>{successInfo}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رمز التحقق والأمان (Security Token)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value.trim())}
                    placeholder="أدخل الرمز المكون من 64 خانة"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none text-left"
                    dir="ltr"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none text-left"
                    dir="ltr"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                </div>
                <p className="mt-1 text-[10px] text-slate-500">يجب ألا تقل عن 8 خانات.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  تأكيد كلمة المرور الجديدة
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 outline-none text-left"
                    dir="ltr"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-sm shadow-sm transition disabled:opacity-50"
              >
                {loading ? 'جارٍ الحفظ والتشفير...' : 'حفظ وتثبيت كلمة المرور'}
              </button>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <button
                  type="button"
                  onClick={() => setStep('REQUEST')}
                  className="hover:text-slate-900 font-semibold"
                >
                  طلب رمز جديد
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="hover:text-slate-900 font-semibold inline-flex items-center gap-1"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  إلغاء والعودة
                </button>
              </div>
            </form>
          )}

          {step === 'COMPLETED' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-700" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">
                تم تثبيت كلمة المرور بنجاح
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-6">
                تم تشفير كلمة المرور وتفعيل حساب المسؤول بنجاح. يمكنك الآن تسجيل الدخول مباشرة باستخدام البريد الإلكتروني وكلمة المرور الجديدة.
              </p>
              <button
                onClick={() => onNavigate('login')}
                className="w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-sm transition"
              >
                تسجيل الدخول الآن
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
