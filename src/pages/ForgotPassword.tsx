import React from 'react';
import { ArrowRight, BookOpen, ShieldCheck } from 'lucide-react';

interface ForgotPasswordProps {
  onNavigate: (page: string) => void;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-800 flex items-center justify-center shadow-md border border-emerald-700">
            <BookOpen className="w-8 h-8 text-emerald-100" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-2xl font-extrabold text-slate-900">
          استعادة كلمة المرور
        </h2>
        <p className="mt-1 text-center text-xs text-emerald-800 font-medium">
          أكاديمية ترتيل القرآن الكريم
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 leading-7">
            <div className="flex items-center gap-2 font-bold mb-2">
              <ShieldCheck className="w-5 h-5" />
              الاستعادة الآمنة غير متاحة مؤقتًا
            </div>
            تم إيقاف إصدار رموز استعادة كلمة المرور تلقائيًا لحماية الحسابات. يرجى التواصل مع إدارة الأكاديمية من خلال وسيلة التواصل المعتمدة لإعادة تعيين كلمة المرور.
          </div>

          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="mt-6 w-full py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-sm transition inline-flex items-center justify-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            العودة لتسجيل الدخول
          </button>
        </div>
      </div>
    </div>
  );
};
