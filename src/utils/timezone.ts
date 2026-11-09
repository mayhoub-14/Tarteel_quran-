/**
 * Time Zone Utility for Tarteel Teachers Portal
 * Supports robust IANA time zone conversions, conflict detection,
 * and 12-hour AM/PM formatting.
 */

export interface TimeZoneOption {
  id: string;
  label: string;
  country: string;
  flag: string;
}

export const SUPPORTED_TIME_ZONES: TimeZoneOption[] = [
  { id: 'Africa/Cairo', label: 'توقيت مصر (القاهرة)', country: 'مصر', flag: '🇪🇬' },
  { id: 'Asia/Riyadh', label: 'توقيت السعودية (الرياض ومكة المكرمة)', country: 'المملكة العربية السعودية', flag: '🇸🇦' },
  { id: 'Asia/Dubai', label: 'توقيت الإمارات (دبي وأبوظبي)', country: 'الإمارات العربية المتحدة', flag: '🇦🇪' },
  { id: 'Asia/Kuwait', label: 'توقيت الكويت', country: 'الكويت', flag: '🇰🇼' },
  { id: 'Asia/Qatar', label: 'توقيت قطر', country: 'قطر', flag: '🇶🇦' },
  { id: 'Asia/Amman', label: 'توقيت الأردن', country: 'الأردن', flag: '🇯🇴' },
  { id: 'Europe/London', label: 'توقيت بريطانيا (لندن)', country: 'المملكة المتحدة', flag: '🇬🇧' },
  { id: 'America/New_York', label: 'توقيت شرق أمريكا (نيويورك)', country: 'الولايات المتحدة', flag: '🇺🇸' },
];

export const DAYS_OF_WEEK = [
  { id: 0, label: 'الأحد', short: 'أحد' },
  { id: 1, label: 'الإثنين', short: 'إثنين' },
  { id: 2, label: 'الثلاثاء', short: 'ثلاثاء' },
  { id: 3, label: 'الأربعاء', short: 'أربعاء' },
  { id: 4, label: 'الخميس', short: 'خميس' },
  { id: 5, label: 'الجمعة', short: 'جمعة' },
  { id: 6, label: 'السبت', short: 'سبت' },
];

/**
 * Convert 24-hour time ("18:30") to user-friendly 12-hour format ("6:30 PM")
 * Handles noon (12:00 PM) and midnight (12:00 AM) exactly as specified:
 * 00:00 -> 12:00 AM
 * 01:00 -> 1:00 AM
 * 08:30 -> 8:30 AM
 * 12:00 -> 12:00 PM
 * 13:00 -> 1:00 PM
 * 15:30 -> 3:30 PM
 * 18:00 -> 6:00 PM
 * 20:45 -> 8:45 PM
 */
export function format12HourTime(time24: string): string {
  if (!time24 || typeof time24 !== 'string') return '';
  const parts = time24.trim().split(':');
  if (parts.length < 2) return time24;

  let hours = parseInt(parts[0], 10);
  const minutes = parts[1].padStart(2, '0');

  if (isNaN(hours)) return time24;

  const period = hours >= 12 ? 'PM' : 'AM';
  let hours12 = hours % 12;
  if (hours12 === 0) hours12 = 12;

  return `${hours12}:${minutes} ${period}`;
}

/**
 * Convert 24-hour time to localized 12-hour format with Arabic indicator:
 * e.g. "6:00 PM"
 */
export function formatArabic12HourTime(time24: string): string {
  return format12HourTime(time24);
}

/**
 * Parse 12-hour parts (hour 1..12, minute 0..59, period AM/PM) into 24-hour string "HH:mm"
 */
export function parse12HourTo24(hour12: number, minute: number, period: 'AM' | 'PM'): string {
  let h = hour12 % 12;
  if (period === 'PM') {
    h += 12;
  }
  const hStr = String(h).padStart(2, '0');
  const mStr = String(minute).padStart(2, '0');
  return `${hStr}:${mStr}`;
}

/**
 * Split a 24-hour string "18:30" into 12-hour components { hour: 6, minute: 30, period: 'PM' }
 */
export function parseTimeStringTo12HourParts(time24: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
  if (!time24) return { hour: 5, minute: 0, period: 'PM' };
  const parts = time24.split(':');
  let h = parseInt(parts[0] || '17', 10);
  let m = parseInt(parts[1] || '0', 10);
  if (isNaN(h)) h = 17;
  if (isNaN(m)) m = 0;

  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;

  return { hour: h12, minute: m, period };
}

/**
 * Given a wall-clock time (HH:mm) on a specific reference day in a source timeZone,
 * convert it to target timeZone wall-clock time and indicate if the day shifted (+1, 0, -1).
 */
export function convertLessonTime(
  localTime: string, // "17:30"
  sourceTimeZone: string, // "Asia/Riyadh"
  targetTimeZone: string, // "Africa/Cairo"
  referenceDate: Date = new Date()
): { time: string; time12: string; dayOffset: number; formatted: string } {
  try {
    const [hours, minutes] = localTime.split(':').map(Number);
    
    const y = referenceDate.getFullYear();
    const sourceFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: sourceTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

    let utcMillis = Date.UTC(y, referenceDate.getMonth(), referenceDate.getDate(), hours, minutes);
    for (let i = 0; i < 3; i++) {
      const parts = sourceFormatter.formatToParts(new Date(utcMillis));
      const getP = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
      const measuredH = getP('hour');
      const measuredM = getP('minute');
      const diffMinutes = (hours * 60 + minutes) - (measuredH * 60 + measuredM);
      if (diffMinutes === 0) break;
      utcMillis += diffMinutes * 60 * 1000;
    }

    const targetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: targetTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

    const targetParts = targetFormatter.formatToParts(new Date(utcMillis));
    const getTP = (type: string) => parseInt(targetParts.find(p => p.type === type)?.value || '0', 10);
    const targetDay = getTP('day');
    const targetHour = getTP('hour');
    const targetMinute = getTP('minute');

    const formattedTime24 = `${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')}`;
    const formattedTime12 = format12HourTime(formattedTime24);
    
    const srcDay = referenceDate.getDate();
    let dayOffset = targetDay - srcDay;
    if (dayOffset > 15) dayOffset -= 30;
    if (dayOffset < -15) dayOffset += 30;

    return {
      time: formattedTime24,
      time12: formattedTime12,
      dayOffset,
      formatted: `${formattedTime12} ${dayOffset > 0 ? '(اليوم التالي)' : dayOffset < 0 ? '(اليوم السابق)' : ''}`.trim()
    };
  } catch (err) {
    return {
      time: localTime,
      time12: format12HourTime(localTime),
      dayOffset: 0,
      formatted: format12HourTime(localTime)
    };
  }
}

/**
 * Check if two intervals on the same day overlap
 * Returns true only if intervals strictly overlap: max(startA, startB) < min(endA, endB)
 * Lessons that end exactly when another starts do NOT overlap.
 */
export function checkLessonOverlap(
  timeA: string,
  durationA: number,
  timeB: string,
  durationB: number
): boolean {
  const [ha, ma] = timeA.split(':').map(Number);
  const startA = ha * 60 + ma;
  const endA = startA + durationA;

  const [hb, mb] = timeB.split(':').map(Number);
  const startB = hb * 60 + mb;
  const endB = startB + durationB;

  return Math.max(startA, startB) < Math.min(endA, endB);
}

export interface LessonConflictResult {
  isConflict: boolean;
  conflictType?: 'TEACHER_CONFLICT' | 'STUDENT_CONFLICT';
  reason?: string;
  reasonArabic?: string;
}

/**
 * Validates whether two lessons have a genuine scheduling conflict:
 * - Rule A (Teacher Conflict): Same teacher has two overlapping lessons on the same day.
 * - Rule B (Student Conflict): Same student has two overlapping lessons on the same day (even with different teachers).
 * - Rule C (Different Teachers): Different teachers teaching different students can NEVER conflict, even at the same time.
 * - Rule D (Admin Account): Lessons across different teachers and students are monitored without false global conflicts.
 * - Lessons ending exactly when another starts do NOT overlap.
 * - Cancelled lessons are excluded.
 */
export function checkTwoLessonsConflict(
  lessonA: {
    id?: string;
    teacherId: string;
    studentId: string;
    dayOfWeek: number;
    localTime: string;
    timeZone?: string;
    durationMinutes: number;
    status?: string;
    specificDate?: string;
    teacherName?: string;
    studentName?: string;
  },
  lessonB: {
    id?: string;
    teacherId: string;
    studentId: string;
    dayOfWeek: number;
    localTime: string;
    timeZone?: string;
    durationMinutes: number;
    status?: string;
    specificDate?: string;
    teacherName?: string;
    studentName?: string;
  },
  referenceTimeZone: string = 'Africa/Cairo'
): LessonConflictResult {
  // If same lesson ID, cannot conflict with itself
  if (lessonA.id && lessonB.id && lessonA.id === lessonB.id) {
    return { isConflict: false };
  }

  // Cancelled or inactive lessons are excluded
  if (lessonA.status === 'CANCELLED' || lessonB.status === 'CANCELLED') {
    return { isConflict: false };
  }

  // Same day check
  if (lessonA.specificDate && lessonB.specificDate) {
    if (lessonA.specificDate !== lessonB.specificDate) {
      return { isConflict: false };
    }
  } else if (lessonA.dayOfWeek !== lessonB.dayOfWeek) {
    return { isConflict: false };
  }

  // CRITICAL RULE C: Different teachers teaching different students is completely valid!
  const isSameTeacher = lessonA.teacherId === lessonB.teacherId;
  const isSameStudent = lessonA.studentId === lessonB.studentId;

  if (!isSameTeacher && !isSameStudent) {
    return { isConflict: false };
  }

  // Convert both to reference time zone for true universal clock comparison
  const tzA = lessonA.timeZone || referenceTimeZone;
  const tzB = lessonB.timeZone || referenceTimeZone;

  const convA = convertLessonTime(lessonA.localTime, tzA, referenceTimeZone);
  const convB = convertLessonTime(lessonB.localTime, tzB, referenceTimeZone);

  // If day offsets differ after conversion, they don't fall on the same day in reference timezone
  if (convA.dayOffset !== convB.dayOffset) {
    return { isConflict: false };
  }

  const [ha, ma] = convA.time.split(':').map(Number);
  const startA = ha * 60 + ma;
  const endA = startA + (lessonA.durationMinutes || 30);

  const [hb, mb] = convB.time.split(':').map(Number);
  const startB = hb * 60 + mb;
  const endB = startB + (lessonB.durationMinutes || 30);

  // Interval overlap: Math.max(startA, startB) < Math.min(endA, endB)
  // If endA === startB or endB === startA, not overlapping!
  const hasOverlap = Math.max(startA, startB) < Math.min(endA, endB);

  if (!hasOverlap) {
    return { isConflict: false };
  }

  if (isSameTeacher) {
    return {
      isConflict: true,
      conflictType: 'TEACHER_CONFLICT',
      reason: `Teacher ${lessonA.teacherId} has overlapping lessons`,
      reasonArabic: `تعارض في جدول المعلم مع حصة الطالب (${lessonB.studentName || 'طالب آخر'}) في (${convB.time12})`
    };
  } else {
    return {
      isConflict: true,
      conflictType: 'STUDENT_CONFLICT',
      reason: `Student ${lessonA.studentId} is assigned to two overlapping lessons`,
      reasonArabic: `تعارض في جدول الطالب: مسجل في حصة أخرى مع (${lessonB.teacherName || 'معلم آخر'}) في (${convB.time12})`
    };
  }
}

/**
 * Get current date in Cairo timezone as "YYYY-MM-DD"
 */
export function getCairoToday(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

/**
 * Get current month in Cairo timezone as "YYYY-MM"
 */
export function getCairoCurrentMonth(): string {
  return getCairoToday().slice(0, 7);
}

/**
 * Get day of week (0 = Sunday .. 6 = Saturday) for any YYYY-MM-DD date in Cairo
 */
export function getCairoDayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    weekday: 'short'
  }).format(utcDate);

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  return map[dayName] !== undefined ? map[dayName] : utcDate.getUTCDay();
}

/**
 * Safe calendar arithmetic: add or subtract days across months, leap years, and year boundaries
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Calculate end time formatted in 12-hour AM/PM from start time "HH:mm" and duration minutes
 */
export function calculateEndTime12(startTime24: string, durationMinutes: number): string {
  if (!startTime24) return '';
  const [h, m] = startTime24.split(':').map(Number);
  const totalMinutes = h * 60 + m + durationMinutes;
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;
  const end24 = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  return format12HourTime(end24);
}

/**
 * Format full Arabic date for headers (e.g. "الثلاثاء، 3 نوفمبر 2026")
 */
export function formatArabicDateHeader(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

/**
 * Check if a date string is older than threshold days (default 14 days)
 */
export function isDateStale(dateIsoOrStr?: string, daysThreshold = 14): boolean {
  if (!dateIsoOrStr) return true;
  const targetTime = new Date(dateIsoOrStr).getTime();
  if (isNaN(targetTime)) return true;
  const now = Date.now();
  const diffDays = (now - targetTime) / (1000 * 60 * 60 * 24);
  return diffDays > daysThreshold;
}

