import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { CertificateTemplateConfig, GeneratedCertificate, TeacherGender } from '../types';
import { getTeacherHonorific, formatTeacherTitle } from '../utils/teacherTitle';
import { GenderSelectionPrompt } from '../components/GenderSelectionPrompt';
import { jsPDF } from 'jspdf';
import {
  Award,
  Download,
  FileCheck,
  RotateCcw,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  FileDown,
  Printer,
  History,
  Info,
  Check,
  User,
  Users
} from 'lucide-react';

export type StudentGender = 'MALE' | 'FEMALE';

export const CertificatePage: React.FC = () => {
  const { user } = useAuth();

  // Required three fields strictly according to specs
  const [studentName, setStudentName] = useState('');
  const [gender, setGender] = useState<StudentGender>('FEMALE');
  const [memorizationAchievement, setMemorizationAchievement] = useState('');

  const [templateConfig, setTemplateConfig] = useState<CertificateTemplateConfig | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<GeneratedCertificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const templateImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    loadTemplateAndHistory();
    preloadTemplateAndFonts();
  }, []);

  const loadTemplateAndHistory = async () => {
    try {
      const [tplRes, histRes] = await Promise.all([
        api.getCertificateTemplate(),
        api.getCertificateHistory()
      ]);
      setTemplateConfig(tplRes.template);
      setHistory(histRes.certificates || []);
    } catch (err: any) {
      console.error('Error loading template config:', err);
    }
  };

  // Preload clean master template and explicit Arabic fonts
  const preloadTemplateAndFonts = async () => {
    try {
      if (typeof document !== 'undefined' && 'fonts' in document) {
        await Promise.all([
          document.fonts.load('800 72px Cairo'),
          document.fonts.load('800 64px Cairo'),
          document.fonts.load('700 40px Cairo'),
          document.fonts.load('700 32px Cairo'),
          document.fonts.load('600 20px Cairo'),
          document.fonts.load('700 24px Cairo'),
          document.fonts.ready
        ]);
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = '/tarteel-certificate-clean-template.png';
      img.onload = () => {
        templateImageRef.current = img;
      };
    } catch (err) {
      console.warn('Font/template preload notice:', err);
    }
  };

  /**
   * Intelligently balance and wrap Arabic text into 1 or 2 lines
   * without breaking words or diacritics
   */
  const wrapArabicText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] => {
    const totalWidth = ctx.measureText(text).width;
    if (totalWidth <= maxWidth) {
      return [text];
    }

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 2) {
      return [text];
    }

    let bestBreakIdx = Math.floor(words.length / 2);
    let minDiff = Infinity;

    for (let i = 1; i < words.length; i++) {
      const line1 = words.slice(0, i).join(' ');
      const line2 = words.slice(i).join(' ');
      const w1 = ctx.measureText(line1).width;
      const w2 = ctx.measureText(line2).width;

      if (w1 <= maxWidth && w2 <= maxWidth) {
        const diff = Math.abs(w1 - w2);
        if (diff < minDiff) {
          minDiff = diff;
          bestBreakIdx = i;
        }
      }
    }

    const firstLine = words.slice(0, bestBreakIdx).join(' ');
    const secondLine = words.slice(bestBreakIdx).join(' ');

    return [firstLine, secondLine];
  };

  /**
   * Render certificate with gender-aware Arabic wording,
   * matching Cairo typography and dimensions of reference certificate
   */
  const renderCertificateOnCanvas = async (
    name: string,
    studentGender: StudentGender,
    achievement: string,
    customTeacher?: { fullName: string; gender?: TeacherGender }
  ): Promise<string> => {
    // 1. Ensure Arabic fonts are fully loaded before rendering
    if (typeof document !== 'undefined' && 'fonts' in document) {
      try {
        await Promise.all([
          document.fonts.load('800 72px Cairo'),
          document.fonts.load('800 64px Cairo'),
          document.fonts.load('700 40px Cairo'),
          document.fonts.load('700 32px Cairo'),
          document.fonts.load('600 20px Cairo'),
          document.fonts.load('700 24px Cairo'),
          document.fonts.ready
        ]);
      } catch (e) {
        console.warn('Font loading check:', e);
      }
    }

    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return reject(new Error('عنصر الرسم غير متوفر'));
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        return reject(new Error('تعذر إنشاء سياق الرسم 2D'));
      }

      const drawContent = (img: HTMLImageElement) => {
        // High-resolution certificate: 2000 x 1414
        canvas.width = 2000;
        canvas.height = 1414;

        // 1. Draw the official clean master template (100% preserved artwork, borders, logo, calligraphy)
        ctx.drawImage(img, 0, 0, 2000, 1414);

        // 2. Clear variable zones with pure white background (#FFFFFF)
        // Zone A: Student name & achievement (Y: 670 to 885)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(450, 670, 1100, 218);

        // Zone B: Dua lines (Y: 890 to 1010)
        ctx.fillRect(310, 890, 1380, 120);

        // Zone C: Bottom area cleared with pure white background (guarantees congratulation text is completely removed)
        ctx.fillRect(600, 1070, 800, 120);

        // Configure Arabic rendering properties
        ctx.direction = 'rtl';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if ('letterSpacing' in ctx) {
          (ctx as any).letterSpacing = '0px';
        }

        const config = templateConfig || {
          nameX: 1000,
          nameY: 746,
          nameFontSize: 72,
          nameColor: '#0a0a0a',
          achievementX: 1000,
          achievementY: 857,
          achievementFontSize: 40,
          achievementColor: '#008037',
          prefixText: 'تقديراً لتفوقها في'
        };

        const fontStack = "Cairo, -apple-system, BlinkMacSystemFont, sans-serif";

        // ----------------------------------------------------
        // 3. Render Student Name (Bold modern geometric Arabic Cairo 800)
        // ----------------------------------------------------
        const cleanName = name.trim();
        let nameFontSize = config.nameFontSize || 72;
        ctx.font = `800 ${nameFontSize}px ${fontStack}`;

        let nameWidth = ctx.measureText(cleanName).width;
        const maxAllowedNameWidth = 1180;

        // Auto-scale font size if name is long so it never overflows
        if (nameWidth > maxAllowedNameWidth) {
          nameFontSize = Math.max(38, Math.floor(nameFontSize * (maxAllowedNameWidth / nameWidth)));
          ctx.font = `800 ${nameFontSize}px ${fontStack}`;
        }

        ctx.fillStyle = config.nameColor || '#0a0a0a';
        // Draw centered student name at Y = 746
        ctx.fillText(cleanName, config.nameX || 1000, config.nameY || 746);

        // ----------------------------------------------------
        // 4. Render Memorization Achievement (Gender-Aware, Cairo 700 in #008037)
        // ----------------------------------------------------
        const cleanAchievement = achievement.trim();
        let fullAchievement = cleanAchievement;

        // Check if user already typed prefix
        const hasPrefix = cleanAchievement.startsWith('تقديرا') || cleanAchievement.startsWith('تقديراً');
        if (!hasPrefix) {
          // Male: "تقديرًا لتفوقه في" | Female: "تقديرًا لتفوقها في"
          const genderPrefix = studentGender === 'MALE' ? 'تقديرًا لتفوقه في' : 'تقديرًا لتفوقها في';
          fullAchievement = `${genderPrefix} ${cleanAchievement}`;
        } else {
          // If teacher typed prefix but wrong gender, adjust it
          if (studentGender === 'MALE' && (fullAchievement.includes('لتفوقها') || fullAchievement.includes('لحفظها'))) {
            fullAchievement = fullAchievement.replace('لتفوقها', 'لتفوقه').replace('لحفظها', 'لحفظه');
          } else if (studentGender === 'FEMALE' && (fullAchievement.includes('لتفوقه') || fullAchievement.includes('لحفظه'))) {
            fullAchievement = fullAchievement.replace('لتفوقه', 'لتفوقها').replace('لحفظه', 'لحفظها');
          }
        }

        let achieveFontSize = config.achievementFontSize || 40;
        ctx.font = `700 ${achieveFontSize}px ${fontStack}`;

        const maxAllowedAchieveWidth = 1200;
        const achieveLines = wrapArabicText(ctx, fullAchievement, maxAllowedAchieveWidth);

        ctx.fillStyle = config.achievementColor || '#008037'; // Authentic Tarteel rich green

        if (achieveLines.length === 1) {
          let singleWidth = ctx.measureText(achieveLines[0]).width;
          if (singleWidth > maxAllowedAchieveWidth) {
            achieveFontSize = Math.max(26, Math.floor(achieveFontSize * (maxAllowedAchieveWidth / singleWidth)));
            ctx.font = `700 ${achieveFontSize}px ${fontStack}`;
          }
          ctx.fillText(achieveLines[0], config.achievementX || 1000, config.achievementY || 857);
        } else {
          // Two balanced lines
          const lineSpacing = 44;
          const startY = 835;

          achieveLines.forEach((lineText, idx) => {
            let lineWidth = ctx.measureText(lineText).width;
            let currentSize = achieveFontSize;
            if (lineWidth > maxAllowedAchieveWidth) {
              currentSize = Math.max(26, Math.floor(currentSize * (maxAllowedAchieveWidth / lineWidth)));
              ctx.font = `700 ${currentSize}px ${fontStack}`;
            }
            ctx.fillText(lineText, config.achievementX || 1000, startY + (idx * lineSpacing));
          });
        }

        // ----------------------------------------------------
        // 5. Render Dua Lines (Strictly Gender-Aware Cairo 700 in #008037)
        // ----------------------------------------------------
        // Male: له ... يجعله ... عليه | Female: لها ... يجعلها ... عليها
        const duaLine1 = studentGender === 'MALE'
          ? 'راجين من الله سبحانه وتعالى له دوام التوفيق والنجاح وأن يجعله من أهل'
          : 'راجين من الله سبحانه وتعالى لها دوام التوفيق والنجاح وأن يجعلها من أهل';

        const duaLine2 = studentGender === 'MALE'
          ? 'القرآن وخاصته وأن يتم عليه نعمة حفظ القرآن الكريم'
          : 'القرآن وخاصته وأن يتم عليها نعمة حفظ القرآن الكريم';

        ctx.font = `700 32px ${fontStack}`;
        ctx.fillStyle = '#008037';
        ctx.fillText(duaLine1, 1000, 916);
        ctx.fillText(duaLine2, 1000, 970);

        // ----------------------------------------------------
        // 6. Bottom Congratulation Line ("هنيئًا لك الأجر والثواب")
        // Has been completely removed without replacement per user specification
        // ----------------------------------------------------

        // ----------------------------------------------------
        // 7. Render Supervising Teacher Attribution (Gender-Aware based on Teacher's Profile)
        // ----------------------------------------------------
        // Strictly uses teacher's saved profile gender (never confused with student gender)
        const supervisingTeacher = customTeacher || user;
        if (supervisingTeacher?.fullName) {
          const teacherGender = supervisingTeacher.gender;
          const supervisorLabel = teacherGender === 'FEMALE' ? 'المعلمة المشرفة' : 'المعلم المشرف';
          const teacherTitle = teacherGender === 'FEMALE'
            ? 'فضيلة المعلمة'
            : teacherGender === 'MALE'
            ? 'فضيلة المعلم'
            : '';

          // Label
          ctx.font = `600 20px ${fontStack}`;
          ctx.fillStyle = '#4B5563';
          ctx.fillText(supervisorLabel, 1550, 1088);

          // Name with official honorific title
          ctx.font = `700 24px ${fontStack}`;
          ctx.fillStyle = '#008037';
          const fullTitleText = teacherTitle ? `${teacherTitle} ${supervisingTeacher.fullName}` : supervisingTeacher.fullName;
          ctx.fillText(fullTitleText, 1550, 1122);
        }

        const dataUrl = canvas.toDataURL('image/png', 1.0);
        resolve(dataUrl);
      };

      const img = templateImageRef.current || new Image();
      if (img.complete && img.naturalWidth > 0) {
        drawContent(img);
      } else {
        img.crossOrigin = 'anonymous';
        img.src = '/tarteel-certificate-clean-template.png';
        img.onload = () => drawContent(img);
        img.onerror = () => reject(new Error('تعذر تحميل قالب الشهادة المعتمد'));
      }
    });
  };

  const handleGenerateCertificate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (loading) return; // Prevent duplicate concurrent requests

    setValidationError(null);
    setSuccessMessage(null);

    // Validation
    if (!studentName.trim()) {
      setValidationError('يرجى إدخال اسم الطالب أو الطالبة (الحقل مطلوب)');
      return;
    }
    if (!memorizationAchievement.trim()) {
      setValidationError('يرجى إدخال ما أتم حفظه من القرآن الكريم (الحقل مطلوب)');
      return;
    }

    setLoading(true);

    try {
      const url = await renderCertificateOnCanvas(studentName, gender, memorizationAchievement);
      setGeneratedImageUrl(url);

      // Log in database
      await api.logGeneratedCertificate(studentName, memorizationAchievement);
      const genderLabel = gender === 'MALE' ? 'للطالب (ذكر)' : 'للطالبة (أنثى)';
      setSuccessMessage(`تم إنشاء الشهادة بنجاح بصياغة لغوية دقيقة ومطابقة ${genderLabel}!`);
      loadTemplateAndHistory();
    } catch (err: any) {
      setValidationError(err?.message || 'حدث خطأ أثناء تركيب الشهادة');
    } finally {
      setLoading(false);
    }
  };

  // Download high-res PNG (2000x1414)
  const handleDownloadPng = () => {
    if (!generatedImageUrl) return;
    const link = document.createElement('a');
    const safeName = studentName.trim().replace(/\s+/g, '_');
    link.download = `شهادة_ترتيل_${safeName}.png`;
    link.href = generatedImageUrl;
    link.click();
  };

  // Download print-ready PDF (A4 Landscape, 300 DPI scaling)
  const handleDownloadPdf = () => {
    if (!generatedImageUrl) return;
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      doc.addImage(generatedImageUrl, 'PNG', 0, 0, 297, 210, undefined, 'FAST');
      const safeName = studentName.trim().replace(/\s+/g, '_');
      doc.save(`شهادة_ترتيل_${safeName}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('تعذر تصدير ملف PDF، يمكنك استخدام خيار تحميل PNG عالي الوضوح');
    }
  };

  const handleResetForAnother = () => {
    setStudentName('');
    setGender('FEMALE');
    setMemorizationAchievement('');
    setGeneratedImageUrl(null);
    setValidationError(null);
    setSuccessMessage(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hidden high-res canvas (2000x1414) */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Gender Selection Prompt if teacher has not selected gender yet */}
      <GenderSelectionPrompt onUpdated={loadTemplateAndHistory} />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Award className="w-6 h-6 text-emerald-700" />
            إنشاء شهادة تقدير
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            إصدار الشهادات الرسمية بالقالب المعتمد مع المطابقة اللغوية الدقيقة لجنس الطالب (ذكر / أنثى) واعتماد لقب المعلم المشرف
          </p>
        </div>

        {/* Certificate Quality & Supervising Teacher Status */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {user && (
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700">
              <span className="text-slate-500">
                {user.gender === 'FEMALE' ? 'المعلمة المشرفة:' : 'المعلم المشرف:'}
              </span>
              <span className="font-bold text-emerald-900">
                {user.gender === 'FEMALE'
                  ? `فضيلة المعلمة ${user.fullName}`
                  : user.gender === 'MALE'
                  ? `فضيلة المعلم ${user.fullName}`
                  : user.fullName}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 text-xs text-emerald-900 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <span>مطابقة لغوية ذكية · قالب رسمي نقي</span>
          </div>
        </div>
      </div>


      {/* Validation or Success alerts */}
      {validationError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-900 rounded-2xl flex items-center gap-3 text-xs shadow-xs animate-fade-in">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl flex items-center gap-3 text-xs shadow-xs animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Layout: Form (Left on RTL) & Certificate Preview (Right on RTL) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Section strictly containing the 3 specified fields (5 Columns) */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">
              بيانات الشهادة الرسمية
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              الحقول الثلاثة المحددة بدقة لإنشاء الشهادة الرسمية
            </p>
          </div>

          <form onSubmit={handleGenerateCertificate} className="space-y-5">
            {/* Field 1: اسم الطالب أو الطالبة */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                1. اسم الطالب أو الطالبة
              </label>
              <input
                type="text"
                required
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="أدخل الاسم كاملاً (مثال: عبد الله محمد الشريف أو نورة خالد الرشيد)"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none transition font-medium"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                يُرسم بخط عربي عريض وأنيق في منتصف الشهادة مع ربط الحروف بدقة
              </p>
            </div>

            {/* Field 2: جنس الطالب (ذكر / أنثى) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                2. جنس الطالب (لتحديد الصياغة اللغوية والضمائر تلقائياً)
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setGender('MALE')}
                  className={`py-2.5 px-4 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition ${
                    gender === 'MALE'
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  <User className="w-4 h-4" />
                  <span>طالب (ذكر)</span>
                  {gender === 'MALE' && <Check className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => setGender('FEMALE')}
                  className={`py-2.5 px-4 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition ${
                    gender === 'FEMALE'
                      ? 'bg-emerald-800 text-white border-emerald-800 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>طالبة (أنثى)</span>
                  {gender === 'FEMALE' && <Check className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Gender preview notice */}
              <div className="mt-2 p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200/60 text-[11px] text-emerald-950 space-y-0.5">
                <span className="font-bold block">الصياغة المطبقة في الشهادة:</span>
                {gender === 'MALE' ? (
                  <p>• "تقديرًا لتفوقه في..." | "له دوام التوفيق والنجاح وأن يجعله من أهل القرآن وأن يتم عليه..."</p>
                ) : (
                  <p>• "تقديرًا لتفوقها في..." | "لها دوام التوفيق والنجاح وأن يجعلها من أهل القرآن وأن يتم عليها..."</p>
                )}
              </div>
            </div>

            {/* Field 3: ما أتم حفظه من القرآن الكريم */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                3. ما أتم حفظه من القرآن الكريم
              </label>
              <textarea
                required
                rows={3}
                value={memorizationAchievement}
                onChange={(e) => setMemorizationAchievement(e.target.value)}
                placeholder="مثال: حفظ جزء عم كاملاً، أو حفظ سورة البقرة، أو إتقان أحكام التجويد"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-600 outline-none transition resize-none leading-relaxed"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                يُرسم باللون الأخضر الملكي لهوية الأكاديمية (#008037) مع موازنة ذكية للأسطر الطويلة
              </p>
            </div>

            {/* Template Guarantee Notice */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2 leading-relaxed">
              <Info className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
              <span>
                <strong>ضمان أصالة القالب:</strong> يستخدم التطبيق القالب المعتمد الأصلي للأكاديمية مع الحفاظ التام على البسملة، الشعار القرآني، الزخارف الإسلامية، وتعديل الضمائر النحوية فقط.
              </span>
            </div>

            {/* Submit Button strictly labeled "إنشاء الشهادة" */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-sm shadow-xs transition disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>جارٍ تركيب النصوص وتوليد الشهادة...</span>
                </>
              ) : (
                <>
                  <Award className="w-5 h-5 text-emerald-200" />
                  <span>إنشاء الشهادة</span>
                </>
              )}
            </button>
          </form>

          {/* Action to create another certificate */}
          {generatedImageUrl && (
            <button
              onClick={handleResetForAnother}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              إنشاء شهادة لطالب آخر
            </button>
          )}
        </div>

        {/* Certificate Live Preview & Download (7 Columns) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-emerald-700" />
                  معاينة الشهادة المكتملة
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  الدقة الأصلية: 2000 × 1414 بكسل (جاهزة للطباعة والتوزيع)
                </p>
              </div>

              {/* Download Buttons */}
              {generatedImageUrl && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadPng}
                    className="px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs"
                    title="تنزيل صورة PNG فائقة الوضوح"
                  >
                    <Download className="w-4 h-4" />
                    تحميل PNG
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    className="px-3.5 py-1.5 bg-purple-800 hover:bg-purple-900 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs"
                    title="تنزيل ملف PDF للطباعة المباشرة A4"
                  >
                    <FileDown className="w-4 h-4" />
                    تحميل PDF
                  </button>
                </div>
              )}
            </div>

            {/* The Image Container */}
            <div className="relative aspect-[2000/1414] bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center">
              {loading ? (
                <div className="text-center p-6 space-y-3">
                  <div className="w-10 h-10 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-bold text-slate-700">جارٍ تهيئة الخطوط والضمائر العربية وتركيب النصوص بدقة...</p>
                </div>
              ) : generatedImageUrl ? (
                <img
                  src={generatedImageUrl}
                  alt={`شهادة تقدير ترتيل - ${studentName}`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center">
                  <img
                    src="/tarteel-certificate-clean-template.png"
                    alt="القالب الرسمي لشهادة ترتيل"
                    className="absolute inset-0 w-full h-full object-contain opacity-50 blur-[0.5px]"
                  />
                  <div className="relative z-10 bg-white/95 backdrop-blur-xs p-5 rounded-2xl shadow-md border border-slate-200 max-w-sm">
                    <Award className="w-10 h-10 text-emerald-700 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-800">
                      معاينة القالب المعتمد لأكاديمية ترتيل
                    </p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      أدخل اسم الطالب، حدد الجنس (ذكر / أنثى)، وما أتم حفظه من القرآن الكريم، ثم اضغط على "إنشاء الشهادة".
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Certificate Generation History */}
          {history.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-700" />
                الشهادات الصادرة مؤخراً ({history.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {history.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">{item.studentName}</span>
                      <span className="text-[11px] text-slate-500 block">{item.achievement}</span>
                      {item.teacherName && (
                        <span className="text-[10px] text-emerald-800 font-semibold block mt-0.5">
                          {item.teacherGender === 'FEMALE'
                            ? `المعلمة المشرفة: فضيلة المعلمة ${item.teacherName}`
                            : item.teacherGender === 'MALE'
                            ? `المعلم المشرف: فضيلة المعلم ${item.teacherName}`
                            : `المشرف: ${item.teacherName}`}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setStudentName(item.studentName);
                        setMemorizationAchievement(item.achievement);
                        setLoading(true);
                        renderCertificateOnCanvas(item.studentName, gender, item.achievement)
                          .then(url => setGeneratedImageUrl(url))
                          .finally(() => setLoading(false));
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 rounded-lg transition"
                    >
                      إعادة عرض
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
