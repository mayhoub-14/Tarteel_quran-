import React from 'react';
import { parseTimeStringTo12HourParts, parse12HourTo24, format12HourTime } from '../utils/timezone';
import { Clock } from 'lucide-react';

interface TimePicker12Props {
  value: string; // "18:00" in 24-hour format
  onChange: (time24: string) => void;
  label?: string;
  className?: string;
}

export const TimePicker12: React.FC<TimePicker12Props> = ({
  value,
  onChange,
  label,
  className = ''
}) => {
  const { hour, minute, period } = parseTimeStringTo12HourParts(value);

  const handleHourChange = (newHour: number) => {
    const time24 = parse12HourTo24(newHour, minute, period);
    onChange(time24);
  };

  const handleMinuteChange = (newMinute: number) => {
    const time24 = parse12HourTo24(hour, newMinute, period);
    onChange(time24);
  };

  const handlePeriodChange = (newPeriod: 'AM' | 'PM') => {
    const time24 = parse12HourTo24(hour, minute, newPeriod);
    onChange(time24);
  };

  const formattedDisplay = format12HourTime(value);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-emerald-700" />
            {label}
          </label>
          <span className="text-xs font-mono font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            {formattedDisplay || '12:00 PM'}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-300">
        {/* Hour Selector (1 - 12) */}
        <div className="flex-1">
          <label className="text-[10px] text-slate-400 block mb-0.5 text-center">الساعة</label>
          <select
            value={hour}
            onChange={(e) => handleHourChange(Number(e.target.value))}
            className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-center text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        <span className="text-slate-400 font-bold text-base mt-3">:</span>

        {/* Minute Selector */}
        <div className="flex-1">
          <label className="text-[10px] text-slate-400 block mb-0.5 text-center">الدقيقة</label>
          <select
            value={minute}
            onChange={(e) => handleMinuteChange(Number(e.target.value))}
            className="w-full bg-white border border-slate-300 rounded-lg py-1.5 px-2 text-center text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
          >
            {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>

        {/* Period Selector (AM / PM) */}
        <div className="flex-1">
          <label className="text-[10px] text-slate-400 block mb-0.5 text-center">الفترة</label>
          <div className="grid grid-cols-2 gap-1 mt-0.5">
            <button
              type="button"
              onClick={() => handlePeriodChange('AM')}
              className={`py-1 text-xs font-bold rounded-lg border transition ${
                period === 'AM'
                  ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => handlePeriodChange('PM')}
              className={`py-1 text-xs font-bold rounded-lg border transition ${
                period === 'PM'
                  ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              PM
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
