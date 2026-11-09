import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { SUPPORTED_TIME_ZONES } from '../utils/timezone';
import {
  Settings,
  Lock,
  Globe,
  Download,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Database,
  FileSpreadsheet,
  FileCode,
  HardDrive,
  User,
  Users,
  Check
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();

  // Profile and Timezone
  const [preferredTimeZone, setPreferredTimeZone] = useState(user?.preferredTimeZone || 'Africa/Cairo');
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | null>(user?.gender || null);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  // Sync state if user context updates
  React.useEffect(() => {
    if (user) {
      setFullName(user.fullName || '');
      setPreferredTimeZone(user.preferredTimeZone || 'Africa/Cairo');
      setGender(user.gender || null);
    }
  }, [user]);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gender) {
      alert('يرجى تحديد صفة المعلم (ذكر أو أنثى) لضبط الألقاب الرسمية');
      return;
    }
    setUpdatingProfile(true);
    setProfileSuccess(null);
    try {
      await api.updateProfile({ fullName, preferredTimeZone, gender });
      await refreshUser();
      const label = gender === 'MALE'
        ? 'تم تحديث الملف الشخصي وضبط الألقاب: فضيلة المعلم / الأستاذ'
        : 'تم تحديث الملف الشخصي وضبط الألقاب: فضيلة المعلمة / الأستاذة';
      setProfileSuccess(label);
      setTimeout(() => setProfileSuccess(null), 5000);
    } catch (err: any) {
      alert(err?.message || 'تعذر تحديث البيانات');
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('كلمة المرور الجديدة وتأكيدها غير متطابقين');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('يجب ألا تقل كلمة المرور الجديدة عن 6 خانات');
      return;
    }

    setUpdatingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordSuccess('تم تغيير كلمة المرور بنجاح');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(null), 4000);
    } catch (err: any) {
      setPasswordError(err?.message || 'تعذر تغيير كلمة المرور');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleDownloadBackup = () => {
    const url = api.getBackupDownloadUrl();
    window.location.href = url;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-emerald-800" />
          إعدادات الحساب والنسخ الاحتياطي
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          إدارة بياناتك الشخصية، كلمة المرور، المنطقة الزمنية المفضلة، وتحميل النسخ الاحتياطية
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Profile & Preferred Time Zone */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-700" />
            الملف الشخصي والمنطقة الزمنية
          </h3>

          {profileSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            {/* Required Gender & Honorific Title Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>الصفة واللقب الرسمي (إجباري)</span>
                {gender && (
                  <span className="text-[11px] text-emerald-800 font-bold">
                    {gender === 'MALE' ? 'الألقاب المعتمدة: فضيلة المعلم / الأستاذ' : 'الألقاب المعتمدة: فضيلة المعلمة / الأستاذة'}
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

              {/* Live Preview of Titles */}
              <div className="mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                <span className="font-bold text-slate-700 block">معاينة الألقاب الرسمية المعتمدة لحسابك:</span>
                {gender === 'MALE' ? (
                  <div className="text-emerald-900 font-semibold space-y-0.5">
                    <p>• اللقب الرسمي: <strong>فضيلة المعلم {fullName || 'الاسم'}</strong></p>
                    <p>• اللقب الإداري والتقارير: <strong>الأستاذ {fullName || 'الاسم'}</strong></p>
                  </div>
                ) : gender === 'FEMALE' ? (
                  <div className="text-emerald-900 font-semibold space-y-0.5">
                    <p>• اللقب الرسمي: <strong>فضيلة المعلمة {fullName || 'الاسم'}</strong></p>
                    <p>• اللقب الإداري والتقارير: <strong>الأستاذة {fullName || 'الاسم'}</strong></p>
                  </div>
                ) : (
                  <p className="text-amber-700 font-bold">
                    يرجى تحديد الجنس لتفعيل اللقب الرسمي تلقائياً دون تخمين أو افتراض
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستخدم (ثابت)</label>
              <input
                type="text"
                disabled
                value={user?.username || ''}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
              <input
                type="text"
                disabled
                value={user?.email || ''}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المنطقة الزمنية المفضلة لعرض جداولك</label>
              <select
                value={preferredTimeZone}
                onChange={(e) => setPreferredTimeZone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white focus:ring-2 focus:ring-emerald-600 outline-none"
              >
                {SUPPORTED_TIME_ZONES.map((tz) => (
                  <option key={tz.id} value={tz.id}>
                    {tz.label} ({tz.id})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={updatingProfile}
              className="w-full py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-xs transition shadow-xs"
            >
              {updatingProfile ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
            </button>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-700" />
            تغيير كلمة المرور
          </h3>

          {passwordSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
              <span>{passwordSuccess}</span>
            </div>
          )}

          {passwordError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-900 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور الحالية</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور الجديدة</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تأكيد كلمة المرور الجديدة</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <button
              type="submit"
              disabled={updatingPassword}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition shadow-xs"
            >
              {updatingPassword ? 'جارٍ التحديث...' : 'تحديث كلمة المرور'}
            </button>
          </form>
        </div>
      </div>

      {/* Backup and Data Export Section */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-700" />
              النسخ الاحتياطي وحفظ البيانات
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تصدير نسخة احتياطية من سجلات طلابك وجداول حصصك وتاريخ الشهادات بصيغة JSON المعيارية
            </p>
          </div>

          <button
            onClick={handleDownloadBackup}
            className="px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-xs transition flex items-center gap-2 shadow-xs"
          >
            <Download className="w-4 h-4" />
            تحميل نسخة احتياطية الآن
          </button>
        </div>

        {/* Clear beginner-friendly instructions on retention policy */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-emerald-700" />
              حفظ تلقائي دوري
            </span>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              يقوم النظام بحفظ جميع التعديلات في ملفات قاعدة البيانات الدائمة وقالب الشهادة بشكل فوري.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              حفظ السجلات التاريخية
            </span>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              أرشفة الطلاب تحميهم من الحذف العرضي وتتيح استرجاع أي طالب في أي وقت بكامل حصصه السابقة.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <FileCode className="w-4 h-4 text-emerald-700" />
              استقلالية كاملة للبيانات
            </span>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              يمكنك تصدير ملف النسخة الاحتياطية واستعادته على أي بيئة استضافة أخرى دون أي قيود مدفوعة.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
