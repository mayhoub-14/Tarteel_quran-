import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Clock, ShieldAlert, LogOut, RefreshCw, CheckCircle2 } from 'lucide-react';

interface PendingApprovalProps {
  onNavigate: (page: string) => void;
}

export const PendingApproval: React.FC<PendingApprovalProps> = ({ onNavigate }) => {
  const { user, logout, refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleRefresh = async () => {
    setChecking(true);
    setMessage(null);
    try {
      await refreshUser();
      if (user?.status === 'ACTIVE') {
        onNavigate('dashboard');
      } else {
        setMessage('حسابك ما زال بانتظار موافقة الإدارة. تم فحص الحالة الآن.');
      }
    } catch {
      setMessage('تعذر تحديث الحالة حالياً');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-10 px-6 sm:px-10 shadow-sm border border-slate-200 rounded-3xl text-center">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-200">
            <Clock className="w-10 h-10 text-amber-600 animate-pulse" />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {user?.gender === 'FEMALE'
              ? `مرحباً بكِ، فضيلة المعلمة ${user.fullName}`
              : user?.gender === 'MALE'
              ? `مرحباً بك، فضيلة المعلم ${user.fullName}`
              : `مرحباً بك، ${user?.fullName || 'معلم الأكاديمية'}`}
          </h2>

          <div className="inline-block px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold mb-6">
            حالة الحساب: بانتظار اعتماد الإدارة (PENDING)
          </div>

          <p className="text-slate-600 text-sm leading-relaxed mb-6">
            لقد تم استلام طلب انضمامك إلى <strong>أكاديمية ترتيل القرآن الكريم</strong> بنجاح. 
            حرصاً على أمان وسرية بيانات الطلاب والجداول، لا يتم تفعيل صلاحيات إدارة الحصص والطلاب إلا بعد قيام إدارة الأكاديمية بمراجعة الحساب واعتماده رسمياً.
          </p>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600 text-right space-y-2 mb-8">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <ShieldAlert className="w-4 h-4 text-emerald-700" />
              <span>إجراءات الأمان المتبعة:</span>
            </div>
            <p>• لا يمكن لأي حساب غير معتمد الاطلاع على أي من سجلات الطلاب أو تعديلها.</p>
            <p>• في حال تم اعتمادك، يمكنك الدخول مباشرة إلى لوحة تحكم المعلم دون الحاجة لإنشاء حساب جديد.</p>
            <p>• إذا كنت تجري اختباراً للنظام، يمكنك تسجيل الدخول بحساب المسؤول <strong>admin</strong> من صفحة تسجيل الدخول لاعتماد هذا الحساب بضغطة زر واحدة!</p>
          </div>

          {message && (
            <div className="mb-6 p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs">
              {message}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleRefresh}
              disabled={checking}
              className="flex-1 py-3 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-sm transition flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              فحص حالة الاعتماد الآن
            </button>

            <button
              onClick={logout}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm transition flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
