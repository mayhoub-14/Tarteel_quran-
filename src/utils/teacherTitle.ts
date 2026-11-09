import { TeacherGender } from '../types';

/**
 * Returns the formal Arabic honorific title for a teacher based on profile gender.
 * Strictly follows Tarteel Academy rules:
 * - Male: "فضيلة المعلم" or "الأستاذ"
 * - Female: "فضيلة المعلمة" or "الأستاذة"
 * - Undefined: Returns empty string (never assumes masculine).
 */
export function getTeacherHonorific(
  gender?: TeacherGender | null,
  variant: 'sheikh' | 'ostaz' | 'role' | 'supervisor' = 'sheikh'
): string {
  if (gender === 'FEMALE') {
    switch (variant) {
      case 'sheikh':
        return 'فضيلة المعلمة';
      case 'ostaz':
        return 'الأستاذة';
      case 'role':
        return 'معلمة معتمدة';
      case 'supervisor':
        return 'المعلمة المشرفة';
      default:
        return 'فضيلة المعلمة';
    }
  }

  if (gender === 'MALE') {
    switch (variant) {
      case 'sheikh':
        return 'فضيلة المعلم';
      case 'ostaz':
        return 'الأستاذ';
      case 'role':
        return 'معلم معتمد';
      case 'supervisor':
        return 'المعلم المشرف';
      default:
        return 'فضيلة المعلم';
    }
  }

  // Not selected yet: Never guess or default to masculine!
  switch (variant) {
    case 'role':
      return 'معلم';
    case 'supervisor':
      return 'المشرف';
    default:
      return '';
  }
}

/**
 * Formats teacher's full name with their appropriate honorific title.
 * Examples:
 * - formatTeacherTitle('محمد عبد الرحمن', 'MALE', 'sheikh') => 'فضيلة المعلم محمد عبد الرحمن'
 * - formatTeacherTitle('سارة أحمد', 'FEMALE', 'sheikh') => 'فضيلة المعلمة سارة أحمد'
 * - formatTeacherTitle('سارة أحمد', 'FEMALE', 'ostaz') => 'الأستاذة سارة أحمد'
 * - formatTeacherTitle('سارة أحمد', undefined) => 'سارة أحمد' (Never assumes masculine!)
 */
export function formatTeacherTitle(
  fullName: string,
  gender?: TeacherGender | null,
  variant: 'sheikh' | 'ostaz' | 'supervisor' = 'sheikh'
): string {
  const cleanName = (fullName || '').trim();
  if (!cleanName) return '';

  const honorific = getTeacherHonorific(gender, variant);
  if (!honorific) {
    return cleanName;
  }

  // Prevent duplicate prefixes if the name already contains them
  if (cleanName.startsWith(honorific)) {
    return cleanName;
  }

  return `${honorific}: ${cleanName}`;
}

/**
 * Returns a personalized greeting respecting the teacher's gender.
 */
export function getTeacherGreeting(
  fullName: string,
  gender?: TeacherGender | null
): { greeting: string; titleWithColon: string; titleBadge: string } {
  if (gender === 'FEMALE') {
    return {
      greeting: `مرحباً بكِ، فضيلة المعلمة ${fullName}`,
      titleWithColon: `فضيلة المعلمة: ${fullName}`,
      titleBadge: 'فضيلة المعلمة / الأستاذة'
    };
  }

  if (gender === 'MALE') {
    return {
      greeting: `مرحباً بك، فضيلة المعلم ${fullName}`,
      titleWithColon: `فضيلة المعلم: ${fullName}`,
      titleBadge: 'فضيلة المعلم / الأستاذ'
    };
  }

  return {
    greeting: `مرحباً بك، ${fullName}`,
    titleWithColon: fullName,
    titleBadge: 'يرجى تحديد الصفة (ذكر / أنثى)'
  };
}
