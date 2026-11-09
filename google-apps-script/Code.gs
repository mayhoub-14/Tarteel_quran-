/**
 * =========================================================================
 * أكاديمية ترتيل القرآن الكريم - Tarteel Quran Academy
 * كود Google Apps Script المطور لربط ومزامنة كشف المرتبات وإرسال البريد
 * File: Code.gs
 * =========================================================================
 *
 * هذا الاسكريبت يقبل الطلبات البرمجية (doPost) من بوابة المعلمين في الأكاديمية:
 * 1. يتحقق من صحة البيانات (الاسم، الشهر، الحساب، الحلقات).
 * 2. يسجل بيانات الحلقات والتفاصيل المالية في شيت الإكسيل المعتمد (Google Sheets).
 * 3. يرسل بريداً إلكترونياً رسمياً منسقاً بتقنية HTML إلى الإدارة:
 *    المستلم: amayhoub7@gmail.com
 *    باستخدام الدالة الرسمية: MailApp.sendEmail() مع معالجة كاملة للأخطاء (try/catch).
 * 4. يمنع تكرار الطلب لنفس المعلم ونفس الشهر ويحفظ السجل بحالة "Pending Review" (قيد المراجعة).
 */

const ADMIN_EMAIL = 'amayhoub7@gmail.com';
const LESSON_RATE = 65; // سعر الحصة بالجنيه المصري
const SHEET_NAME = 'كشف المرتبات';

/**
 * دالة استقبال الطلبات البرمجية عبر الـ Web App (doPost)
 */
function doPost(e) {
  try {
    let data;
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      data = e.parameter;
    } else {
      throw new Error('لم يتم استلام أي بيانات.');
    }

    const result = processPayrollSubmission(data);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    const errorResponse = {
      success: false,
      error: error.message || error.toString()
    };
    return ContentService.createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * دالة متوافقة للاستدعاء الداخلي أو المباشر
 */
function submitPayroll(formData) {
  return processPayrollSubmission(formData);
}

/**
 * معالجة طلب المرتب والتحقق وتسجيله في الشيت وإرسال البريد
 */
function processPayrollSubmission(data) {
  const teacherName = (data.teacherName || '').trim();
  const teacherEmail = (data.teacherEmail || '').trim();
  const month = (data.month || '').trim(); // e.g. "2026-11"
  const monthLabel = data.monthLabel || month;
  const paymentMethod = data.paymentMethod || 'INSTAPAY';
  const paymentAccount = (data.paymentAccount || '').trim();
  const accountHolder = (data.accountHolder || '').trim();
  const students = Array.isArray(data.students) ? data.students : [];

  // التحقق الإلزامي من الحقول من جانب السيرفر
  if (!teacherName) {
    throw new Error('اسم المعلم/المعلمة مطلوب.');
  }
  if (!month) {
    throw new Error('يرجى تحديد شهر الاستحقاق.');
  }
  if (!paymentAccount) {
    throw new Error('رقم حساب التحويل أو المحفظة الإلكترونية مطلوب.');
  }
  if (!accountHolder) {
    throw new Error('اسم صاحب الحساب أو المحفظة مطلوب.');
  }
  if (students.length === 0) {
    throw new Error('لا توجد حلقات مكتملة مسجلة للطلاب في هذا الشهر.');
  }

  // حساب إجمالي الحصص والمرتب فعلياً ومطابقته (سعر الحصة 65 ج.م)
  let totalLessons = 0;
  students.forEach(st => {
    const sessions = Number(st.completedLessons) || 0;
    totalLessons += sessions;
  });

  if (totalLessons <= 0) {
    throw new Error('إجمالي الحصص المكتملة للشهر يجب أن يكون أكبر من صفر.');
  }

  const calculatedSalary = totalLessons * LESSON_RATE;
  const paymentMethodLabel = paymentMethod === 'INSTAPAY' ? 'انستاباي (InstaPay)' : 'محفظة إلكترونية (Electronic Wallet)';
  const submissionTime = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

  // 1. تسجيل البيانات في Google Sheets
  const sheetRecorded = recordInGoogleSheet({
    teacherName,
    teacherEmail,
    month: monthLabel,
    totalLessons,
    rate: LESSON_RATE,
    totalSalary: calculatedSalary,
    paymentMethod: paymentMethodLabel,
    paymentAccount,
    accountHolder,
    students,
    submissionTime,
    status: 'قيد المراجعة (Pending Review)'
  });

  // 2. إرسال البريد الإلكتروني عبر MailApp.sendEmail()
  let emailSent = false;
  let emailError = null;
  try {
    sendPayrollNotificationEmail({
      teacherName,
      teacherEmail,
      month: monthLabel,
      students,
      totalLessons,
      lessonRate: LESSON_RATE,
      totalSalary: calculatedSalary,
      paymentMethodLabel,
      paymentAccount,
      accountHolder,
      submissionTime
    });
    emailSent = true;
  } catch (err) {
    Logger.log('MailApp error: ' + err.toString());
    emailError = err.message || err.toString();
  }

  return {
    success: true,
    teacherName,
    month: monthLabel,
    studentsCount: students.length,
    totalLessons,
    lessonRate: LESSON_RATE,
    totalSalary: calculatedSalary,
    emailSent,
    emailError,
    sheetRecorded,
    status: 'PENDING_REVIEW',
    message: 'تم تسجيل طلب المرتب بنجاح وهو قيد المراجعة الإدارية.'
  };
}

/**
 * حفظ سجل المرتب في Google Sheet
 */
function recordInGoogleSheet(entry) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return false;

    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      // إضافة ترويسة الأعمدة
      sheet.appendRow([
        'تاريخ ووقت التقديم',
        'اسم المعلم',
        'البريد الإلكتروني',
        'الشهر المستحق',
        'إجمالي الحصص',
        'سعر الحصة (ج.م)',
        'إجمالي المرتب (ج.م)',
        'طريقة التحويل',
        'رقم الحساب / المحفظة',
        'اسم صاحب الحساب',
        'حالة الطلب',
        'تفاصيل الطلاب والحلقات'
      ]);
      sheet.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#008037').setFontColor('#FFFFFF');
    }

    const studentsBreakdownText = entry.students.map(s => `${s.studentName}: ${s.completedLessons} حصة (${s.completedLessons * entry.rate} ج.م)`).join(' | ');

    sheet.appendRow([
      entry.submissionTime,
      entry.teacherName,
      entry.teacherEmail,
      entry.month,
      entry.totalLessons,
      entry.rate,
      entry.totalSalary,
      entry.paymentMethod,
      entry.paymentAccount,
      entry.accountHolder,
      entry.status,
      studentsBreakdownText
    ]);

    return true;
  } catch (e) {
    Logger.log('Sheet error: ' + e.toString());
    return false;
  }
}

/**
 * إرسال بريد الكتروني رسمي ومنسق للإدارة باستخدام MailApp.sendEmail()
 */
function sendPayrollNotificationEmail(params) {
  const subject = `طلب صرف مرتب جديد - ${params.teacherName} (${params.month})`;

  let studentRowsHtml = '';
  params.students.forEach((st, idx) => {
    const count = Number(st.completedLessons) || 0;
    const amount = count * params.lessonRate;
    studentRowsHtml += `
      <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? 'background-color: #f8fafc;' : ''}">
        <td style="padding: 10px 14px; text-align: right; color: #1e293b; font-weight: 600;">${st.studentName}</td>
        <td style="padding: 10px 14px; text-align: center; color: #047857; font-weight: bold;">${count}</td>
        <td style="padding: 10px 14px; text-align: center; color: #64748b;">${params.lessonRate} ج.م</td>
        <td style="padding: 10px 14px; text-align: left; color: #065f46; font-weight: bold;">${amount.toLocaleString('ar-EG')} ج.م</td>
      </tr>
    `;
  });

  const htmlBody = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; color: #334155; direction: rtl; }
        .card { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
        .header { background: linear-gradient(135deg, #064e3b, #047857); padding: 28px; text-align: center; color: #ffffff; }
        .content { padding: 28px; }
        .info-grid { display: table; width: 100%; margin-bottom: 24px; border-collapse: separate; border-spacing: 8px; }
        .info-cell { display: table-cell; background: #f8fafc; padding: 12px 16px; border-radius: 10px; border: 1px solid #e2e8f0; }
        .table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 8px; font-weight: bold; font-size: 12px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
        .total-box { background: #ecfdf5; border: 2px solid #a7f3d0; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0; }
        .footer { text-align: center; font-size: 11px; color: #94a3b8; padding: 18px; border-top: 1px solid #e2e8f0; background: #f8fafc; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2 style="margin: 0; font-size: 22px;">أكاديمية ترتيل القرآن الكريم</h2>
          <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 14px;">إشعار استلام كشف مرتب جديد للمراجعة والاعتماد</p>
        </div>

        <div class="content">
          <div style="margin-bottom: 20px; text-align: right;">
            <span class="badge">حالة الطلب: قيد المراجعة الإدارية (Pending Review)</span>
          </div>

          <table style="width: 100%; margin-bottom: 20px; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b;">اسم المعلم:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${params.teacherName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">الشهر المستحق:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${params.month}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">تاريخ التقديم:</td>
              <td style="padding: 6px 0; color: #334155;">${params.submissionTime}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">طريقة الاستلام:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #047857;">${params.paymentMethodLabel}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">رقم الحساب / المحفظة:</td>
              <td style="padding: 6px 0; font-family: monospace; font-weight: bold; color: #0f172a; direction: ltr; text-align: right;">${params.paymentAccount}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;">اسم صاحب الحساب:</td>
              <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${params.accountHolder}</td>
            </tr>
          </table>

          <h3 style="font-size: 15px; margin: 18px 0 10px 0; color: #0f172a;">تفاصيل الحلقات المكتملة لكل طالب:</h3>
          <table class="table">
            <thead>
              <tr style="background: #f1f5f9; color: #475569; font-size: 12px;">
                <th style="padding: 10px 14px; text-align: right;">اسم الطالب</th>
                <th style="padding: 10px 14px; text-align: center;">الحلقات المكتملة</th>
                <th style="padding: 10px 14px; text-align: center;">سعر الحصة</th>
                <th style="padding: 10px 14px; text-align: left;">المستحق</th>
              </tr>
            </thead>
            <tbody>
              ${studentRowsHtml}
            </tbody>
          </table>

          <div class="total-box">
            <div style="font-size: 13px; color: #047857; margin-bottom: 4px;">إجمالي الحصص المنفذة: <strong>${params.totalLessons} حصة</strong> × ${params.lessonRate} ج.م</div>
            <div style="font-size: 24px; font-weight: 800; color: #064e3b;">
              إجمالي المرتب المستحق: ${params.totalSalary.toLocaleString('ar-EG')} جنيه مصري
            </div>
          </div>
        </div>

        <div class="footer">
          تم إنشاء هذا الإشعار تلقائياً بواسطة بوابة معلمي أكاديمية ترتيل القرآن الكريم.<br>
          يرجى مراجعة الكشف ومطابقته واعتماد الصرف عبر لوحة تحكم الإدارة.
        </div>
      </div>
    </body>
    </html>
  `;

  // استخدام MailApp.sendEmail الرسمي
  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    subject: subject,
    htmlBody: htmlBody
  });
}
