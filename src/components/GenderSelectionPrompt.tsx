import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { User, Users, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';

interface GenderSelectionPromptProps {
  onUpdated?: () => void;
}

export const GenderSelectionPrompt: React.FC<GenderSelectionPromptProps> = ({ onUpdated }) => {
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Only display if user is a TEACHER and has not selected gender yet
  if (!user || user.role !== 'TEACHER' || user.gender) {
    return null;
  }

  const handleSelectGender = async (selectedGender: 'MALE' | 'FEMALE') => {
    setSaving(true);
    setError(null);
    try {
      await api.updateProfile({ gender: selectedGender });
      await refreshUser();
      const label = selectedGender === 'MALE'
        ? 'تم ضبط الألقاب الرسمية: فضيلة المعلم / الأستاذ'
        : 'تم ضبط الألقاب الرسمية: فضيلة المعلمة / الأستاذة';
      setSuccess(label);
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err?.message || 'تعذر حفظ الجنس المختار');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-50 via-emerald-50 to-amber-50 border-y sm:border sm:rounded-2xl border-amber-300 p-4 sm:p-5 shadow-xs mb-6 animate-fade-in text-slate-800">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
            <h4 className="font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              تحديد الصفة واللقب الرسمي لحسابك في أكاديمية ترتيل
            </h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
            يرجى تحديد صفتك (ذكر / أنثى) لاعتماد الألقاب الرسمية الصحيحة بدقة في لوحة التحكم، الشهادات الصادرة، وسجلات الحصص والتقارير:
            <strong className="text-emerald-900 mx-1">"فضيلة المعلم / الأستاذ"</strong> للذكور، أو 
            <strong className="text-emerald-900 mx-1">"فضيلة المعلمة / الأستاذة"</strong> للإناث.
          </p>
          {error && (
            <p className="text-xs text-red-600 font-bold">{error}</p>
          )}
          {success && (
            <p className="text-xs text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {success}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSelectGender('MALE')}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-white hover:bg-emerald-50 text-slate-800 border-2 border-emerald-700 hover:border-emerald-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <User className="w-4 h-4 text-emerald-700" />
            <span>ذكر (فضيلة المعلم / الأستاذ)</span>
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => handleSelectGender('FEMALE')}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Users className="w-4 h-4 text-emerald-200" />
            <span>أنثى (فضيلة المعلمة / الأستاذة)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
