import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { auth } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { BookOpen, Lock, User, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';

interface LoginProps {
  onNavigate: (page: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onNavigate }) => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;
      if (!googleUser.email) {
        throw new Error('لم يتم استرجاع البريد الإلكتروني من حساب Google');
      }

      const idToken = await googleUser.getIdToken();
      if (!idToken) {
        throw new Error('تعذر استخراج رمز التوثيق (ID Token) من جلسة Google');
      }

      const res = await api.firebaseLogin(idToken);
      login(res.token, res.user);

      if (res.user.status === 'PENDING') {
        onNavigate('pending-approval');
      } else {
        onNavigate('dashboard');
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        setError('تم إلغاء طلب تسجيل الدخول.');
      } else {
        setError(err?.message || 'تعذر تسجيل الدخول بواسطة Google عبر Firebase، يمكنك استخدام اسم المستخدم وكلمة المرور أدناه.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanId = identifier.replace(/[\u200B-\u200F\uFEFF]/g, '').trim();
    const cleanPw = password.replace(/[\u200B-\u200F\uFEFF]/g, '').trim();

    try {
      const res = await api.login(cleanId, cleanPw, rememberMe);
      login(res.token, res.user);

      if (res.user.status === 'PENDING') {
        onNavigate('pending-approval');
      } else if (res.user.role === 'ADMIN') {
        onNavigate('admin');
      } else {
        onNavigate('dashboard');
      }
    } catch (err: any) {
      setError(err?.message || 'تعذر تسجيل الدخول، يرجى التأكد من البيانات المدخلة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo and Header */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-800 flex items-center justify-center shadow-lg border border-emerald-700">
            <BookOpen className="w-9 h-9 text-emerald-100" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-extrabold text-slate-900 tracking-tight">
          بوابة معلمي ترتيل
        </h2>
        <p className="mt-1 text-center text-sm text-emerald-800 font-medium">
          أكاديمية ترتيل القرآن الكريم
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 text-sm">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {/* Google Sign-in with Firebase */}
          <div className="mb-6">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-slate-300 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold shadow-xs transition hover:border-slate-400 disabled:opacity-60"
            >
              {googleLoading ? (
                <span>جارٍ الاتصال بـ Google...</span>
              ) : (
                <>
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>تسجيل الدخول السريع عبر Google (Firebase)</span>
                </>
              )}
            </button>
            <div className="mt-4 flex items-center justify-between">
              <span className="w-1/5 border-b border-slate-200"></span>
              <span className="text-[11px] text-slate-400 font-medium">أو باستخدام اسم المستخدم</span>
              <span className="w-1/5 border-b border-slate-200"></span>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                اسم المستخدم أو البريد الإلكتروني
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  dir="ltr"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="amyhoub7@gmail.com"
                  className="w-full px-3.5 py-2.5 pl-10 pr-4 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 transition text-left"
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pl-10 pr-4 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 transition text-left"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span>تذكرني على هذا الجهاز</span>
              </label>

              <button
                type="button"
                onClick={() => onNavigate('forgot-password')}
                className="text-emerald-700 hover:text-emerald-800 font-semibold transition"
              >
                نسيت كلمة المرور؟
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-emerald-800 hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-600 disabled:opacity-50 transition"
            >
              {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول إلى البوابة'}
            </button>
          </form>

          {/* Teacher registration link */}
          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-600">
              معلم جديد وترغب بالانضمام للأكاديمية؟{' '}
              <button
                onClick={() => onNavigate('register')}
                className="text-emerald-700 hover:text-emerald-800 font-bold mr-1 inline-flex items-center gap-1"
              >
                تقديم طلب تسجيل جديد
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
