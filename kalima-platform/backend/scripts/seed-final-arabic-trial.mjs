// Builds the "عربي التجربة النهائية" trial through the site's own API, so it
// runs the same against a local copy, dev or production:
//   1. bank: a question bank (subject Arabic, 3rd primary) with six folders,
//      categories with subcategories and 67 questions of every type,
//      including three passages;
//   2. exam: a random-draw exam with six sections and several draw rules per
//      section, in its own exam folder, given to a teacher;
//   3. students: a few test students take it at different levels; essays are
//      graded (one student is left waiting), two appeals are sent (one is
//      answered) and the weakest student redoes it.
//
// Needs Node 18+. Settings come from environment variables:
//   KALIMA_URL       site address, e.g. https://dev.kalima-edu.com (default http://localhost:8090)
//   KALIMA_EMAIL     a staff account (SubAdmin or Moderator is best: an Admin
//   KALIMA_PASSWORD  login signs that Admin out of their other sessions)
//   TEACHER_EMAIL    teacher who gets the exam link (created if missing)
//   STUDENTS         how many test students (default 5, 0 to skip)
//   TEST_PASSWORD    password for created accounts (default TestPass#2026)
//   EMAIL_DOMAIN     domain for created accounts (default kalima.test)
//   STEPS            any of bank,exam,students (default all three)
//
// Example (PowerShell):
//   $env:KALIMA_URL="https://dev.kalima-edu.com"; $env:KALIMA_EMAIL="..."; $env:KALIMA_PASSWORD="..."
//   node scripts/seed-final-arabic-trial.mjs

const BASE = (process.env.KALIMA_URL || 'http://localhost:8090').replace(/\/+$/, '') + '/api/v2';
const STAFF_EMAIL = process.env.KALIMA_EMAIL;
const STAFF_PASSWORD = process.env.KALIMA_PASSWORD;
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass#2026';
const DOMAIN = process.env.EMAIL_DOMAIN || 'kalima.test';
const TEACHER_EMAIL = process.env.TEACHER_EMAIL || `final-teacher@${DOMAIN}`;
const STUDENTS = Number(process.env.STUDENTS ?? 5);
const STEPS = new Set((process.env.STEPS || 'bank,exam,students').split(',').map((s) => s.trim()));

const BANK_NAME = 'عربي التجربة النهائية';
const TERM_NAME = 'الترم الأول';
const EXAM_FOLDER_NAME = 'عربي التجربة النهائية';
const EXAM_NAME = 'امتحان عربي - التجربة النهائية';

// ---------- HTTP ----------

async function request(method, path, { body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return json.data ?? json;
}

async function login(email, password) {
  const data = await request('POST', '/auth/login', { body: { email, password } });
  return data.tokens.accessToken;
}

let staff;
const api = (method, path, body) => request(method, path, { body, token: staff });

// ---------- Question helpers ----------

const LETTERS = 'أبجده';
const mcq = (stem, options, correct, extra = {}) => ({
  type: 'mcq_single', stem_text: stem,
  options: options.map((text, i) => ({ text, is_correct: LETTERS[i] === correct })), ...extra,
});
const multi = (stem, options, extra = {}) => ({
  type: 'mcq_multi', stem_text: stem,
  options: options.map(([text, ok]) => ({ text, is_correct: !!ok })), ...extra,
});
const tf = (stem, isTrue, extra = {}) => ({
  type: 'true_false', stem_text: stem,
  options: [{ text: 'صح', is_correct: isTrue }, { text: 'خطأ', is_correct: !isTrue }], ...extra,
});
// Essays need their explanation (model answer) as text.
const essay = (stem, explanation, extra = {}) => ({
  type: 'essay', stem_text: stem, explanation_mode: 'combined_text', explanation_text: explanation, ...extra,
});
const matching = (stem, pairs, decoys = [], extra = {}) => {
  const items = [];
  pairs.forEach(([left, right], i) => {
    items.push({ key: `l${i}`, side: 'left', text: left, match_key: `r${i}` });
    items.push({ key: `r${i}`, side: 'right', text: right });
  });
  decoys.forEach((text, i) => items.push({ key: `d${i}`, side: 'right', text }));
  return { type: 'matching', stem_text: stem, matching_items: items, ...extra };
};
const why = (text) => ({ explanation_mode: 'combined_text', explanation_text: text });

// ---------- Content ----------
// Categories: [category, [subcategories]].
const CATEGORIES = [
  ['نحو', ['أنواع الكلمة', 'المفرد والمثنى والجمع', 'أدوات الاستفهام', 'حروف الجر', 'الضمائر']],
  ['إملاء', ['التاء المربوطة والمفتوحة', 'اللام الشمسية والقمرية', 'التنوين', 'الهمزة']],
  ['قراءة وفهم', ['قطعة قصصية', 'قطعة معلوماتية']],
  ['نصوص', ['أناشيد']],
  ['مفردات', ['المعنى', 'المضاد', 'المفرد والجمع']],
  ['تعبير', ['ترتيب الجمل', 'تعبير حر']],
];

// Each folder: name, then items. An item is [difficulty, category, subcategory, question]
// or a passage: { passage: {...}, children: [items] }.
const FOLDERS = [
  ['النحو', [
    ['easy', 'نحو', 'أنواع الكلمة', mcq('كلمة «يكتبُ» نوعها:', ['اسم', 'فعل', 'حرف'], 'ب', why('«يكتب» تدل على حدث في زمن، فهي فعل.'))],
    ['easy', 'نحو', 'أنواع الكلمة', mcq('اختر الكلمة التي هي اسم:', ['ذهبَ', 'في', 'قلم', 'يلعبُ'], 'ج')],
    ['easy', 'نحو', 'أنواع الكلمة', tf('كلمة «على» حرف.', true)],
    ['medium', 'نحو', 'أنواع الكلمة', multi('اختر كل الكلمات التي هي أفعال:', [['شربَ', 1], ['باب', 0], ['ينامُ', 1], ['مِن', 0], ['اكتبْ', 1]])],
    ['medium', 'نحو', 'أنواع الكلمة', matching('صِلْ كل كلمة بنوعها:', [['شجرة', 'اسم'], ['جرى', 'فعل'], ['إلى', 'حرف']])],
    ['easy', 'نحو', 'المفرد والمثنى والجمع', mcq('مثنى كلمة «ولد» هو:', ['أولاد', 'ولدان', 'ولدات', 'والد'], 'ب')],
    ['medium', 'نحو', 'المفرد والمثنى والجمع', mcq('جمع كلمة «معلم» هو:', ['معلمان', 'معلمون', 'معلمة', 'تعليم'], 'ب')],
    ['medium', 'نحو', 'المفرد والمثنى والجمع', tf('كلمة «بنتان» تدل على الجمع.', false, why('«بنتان» تدل على اثنتين، فهي مثنى.'))],
    ['hard', 'نحو', 'المفرد والمثنى والجمع', mcq('اختر الجملة الصحيحة:', ['الطالبتان نشيطتان', 'الطالبتان نشيطات', 'الطالبات نشيطتان', 'الطالبة نشيطتان'], 'أ', {
      explanation_mode: 'per_option',
      options: [
        { text: 'الطالبتان نشيطتان', is_correct: true, explanation_text: 'صحيحة: مثنى مع مثنى.' },
        { text: 'الطالبتان نشيطات', explanation_text: 'خطأ: «نشيطات» جمع و«الطالبتان» مثنى.' },
        { text: 'الطالبات نشيطتان', explanation_text: 'خطأ: «الطالبات» جمع و«نشيطتان» مثنى.' },
        { text: 'الطالبة نشيطتان', explanation_text: 'خطأ: «الطالبة» مفرد و«نشيطتان» مثنى.' },
      ],
    })],
    ['easy', 'نحو', 'أدوات الاستفهام', mcq('أكمل: «.......... اسمُك؟»', ['ما', 'أين', 'متى', 'كم'], 'أ')],
    ['medium', 'نحو', 'أدوات الاستفهام', mcq('أكمل: «.......... تسكن؟» - أسكن في القاهرة.', ['متى', 'أين', 'كيف', 'مَن'], 'ب')],
    ['hard', 'نحو', 'أدوات الاستفهام', mcq('نسأل عن الزمن بأداة الاستفهام:', ['أين', 'متى', 'مَن', 'كم'], 'ب')],
    ['medium', 'نحو', 'أدوات الاستفهام', essay('كوِّن سؤالًا تبدأ فيه بأداة الاستفهام «كيف».', 'مثال: كيف حالُك؟ تُقبل أي جملة استفهام صحيحة تبدأ بـ«كيف» وتنتهي بعلامة الاستفهام.')],
    ['easy', 'نحو', 'حروف الجر', mcq('أكمل: «ذهبتُ .......... المدرسة».', ['إلى', 'لن', 'لم', 'هل'], 'أ')],
    ['medium', 'نحو', 'حروف الجر', tf('كلمة «في» من حروف الجر.', true)],
    ['medium', 'نحو', 'الضمائر', mcq('«فاطمة تلعب». نضع بدل «فاطمة» الضمير:', ['هو', 'هي', 'هم', 'أنا'], 'ب')],
    ['very_hard', 'نحو', 'الضمائر', mcq('اختر الضمير المناسب: «.......... يذاكرون دروسَهم».', ['هم', 'هو', 'هي', 'أنا'], 'أ', why('الفعل «يذاكرون» للجمع، فنستخدم «هم».'))],
    ['hard', 'نحو', 'الضمائر', matching('صِلْ كل ضمير بالفعل المناسب له:', [['أنا', 'أذاكرُ'], ['نحن', 'نذاكرُ'], ['هم', 'يذاكرون']], ['تذاكرين'])],
  ]],
  ['الإملاء', [
    ['easy', 'إملاء', 'التاء المربوطة والمفتوحة', mcq('الكلمة التي تنتهي بتاء مربوطة هي:', ['بيت', 'حديقة', 'صوت', 'نبات'], 'ب')],
    ['easy', 'إملاء', 'التاء المربوطة والمفتوحة', mcq('الكلمة التي تنتهي بتاء مفتوحة هي:', ['مدرسة', 'زهرة', 'بنت', 'شجرة'], 'ج')],
    ['medium', 'إملاء', 'التاء المربوطة والمفتوحة', tf('كلمة «كتابُه» تنتهي بهاء.', true)],
    ['hard', 'إملاء', 'التاء المربوطة والمفتوحة', multi('اختر كل الكلمات التي تنتهي بتاء مربوطة:', [['سيارة', 1], ['سكت', 0], ['وردة', 1], ['مكتبة', 1], ['بيوت', 0]])],
    ['easy', 'إملاء', 'اللام الشمسية والقمرية', mcq('الكلمة التي فيها لام شمسية هي:', ['القمر', 'الشمس', 'الكتاب', 'الباب'], 'ب')],
    ['medium', 'إملاء', 'اللام الشمسية والقمرية', mcq('الكلمة التي فيها لام قمرية هي:', ['النهر', 'الشجرة', 'القلم', 'السماء'], 'ج')],
    ['medium', 'إملاء', 'اللام الشمسية والقمرية', matching('صِلْ كل كلمة بنوع اللام فيها:', [['الدرس', 'لام شمسية'], ['البحر', 'لام قمرية']])],
    ['medium', 'إملاء', 'التنوين', mcq('أكمل: «رأيتُ .......... جميلًا».', ['طائرٌ', 'طائرًا', 'طائرٍ', 'طائرُ'], 'ب')],
    ['medium', 'إملاء', 'التنوين', essay('اكتب كلمة «قلم» منونة بتنوين الضم.', 'قلمٌ')],
    ['hard', 'إملاء', 'الهمزة', mcq('اختر الكلمة المكتوبة كتابة صحيحة:', ['أرنب', 'ارنب', 'إرنب', 'ءرنب'], 'أ')],
    ['hard', 'إملاء', 'الهمزة', tf('همزة كلمة «إلى» تُكتب تحت الألف.', true)],
    ['very_hard', 'إملاء', 'الهمزة', mcq('اختر الكلمة المكتوبة كتابة صحيحة:', ['سماء', 'سماأ', 'سماه', 'سمائ'], 'أ')],
  ]],
  ['القراءة', [
    { passage: { type: 'passage', font: 'naskh', stem_text: 'أمانةُ سمير\nوجدَ سميرٌ محفظةً على الأرضِ أمامَ بابِ المدرسة، ففتحَها فوجدَ بها نقودًا وبطاقةً عليها اسمُ صاحبِها. لم يأخذْ سميرٌ شيئًا، وذهبَ إلى مديرِ المدرسةِ وأعطاه المحفظة. فرحَ صاحبُ المحفظةِ كثيرًا، وشكرَ سميرًا على أمانتِه، وقالَ المديرُ أمامَ التلاميذ: سميرٌ قدوةٌ لنا جميعًا.' },
      children: [
        ['easy', 'قراءة وفهم', 'قطعة قصصية', mcq('أين وجد سميرٌ المحفظة؟', ['في الفصل', 'أمام باب المدرسة', 'في البيت', 'في الحديقة'], 'ب')],
        ['easy', 'قراءة وفهم', 'قطعة قصصية', mcq('ماذا وجد سميرٌ في المحفظة؟', ['نقودًا وبطاقة', 'كتبًا', 'ألعابًا', 'طعامًا'], 'أ')],
        ['easy', 'قراءة وفهم', 'قطعة قصصية', tf('أخذ سميرٌ النقود لنفسه.', false)],
        ['medium', 'قراءة وفهم', 'قطعة قصصية', mcq('لمن أعطى سميرٌ المحفظة؟', ['لصديقه', 'لمدير المدرسة', 'لأمه', 'للمعلم'], 'ب')],
        ['medium', 'قراءة وفهم', 'قطعة قصصية', mcq('مضاد كلمة «فرح»:', ['سعد', 'حزن', 'ضحك', 'لعب'], 'ب')],
        ['medium', 'قراءة وفهم', 'قطعة قصصية', matching('صِلْ كل كلمة بمعناها:', [['قدوة', 'مثال نقتدي به'], ['أمانة', 'حفظ حقوق الناس'], ['محفظة', 'حافظة النقود']])],
        ['hard', 'قراءة وفهم', 'قطعة قصصية', multi('اختر صفات سمير:', [['أمين', 1], ['صادق', 1], ['كسول', 0], ['طمّاع', 0]])],
        ['very_hard', 'قراءة وفهم', 'قطعة قصصية', essay('ماذا تفعل لو وجدتَ شيئًا ليس لك؟', 'أردُّه إلى صاحبه أو أعطيه لمسؤول مثل المدير أو المعلم، ولا آخذه لنفسي.')],
      ] },
    { passage: { type: 'passage', font: 'naskh', stem_text: 'النحلة\nالنحلةُ حشرةٌ صغيرةٌ نافعةٌ، تعيشُ في بيتٍ يُسمّى الخلية. تطيرُ النحلةُ من زهرةٍ إلى زهرةٍ، وتمتصُّ رحيقَ الأزهار، ثم تصنعُ منه العسل. والعسلُ غذاءٌ مفيدٌ، فيه شفاءٌ للناس.' },
      children: [
        ['easy', 'قراءة وفهم', 'قطعة معلوماتية', mcq('ماذا يُسمّى بيت النحلة؟', ['العش', 'الخلية', 'الجحر', 'الكوخ'], 'ب')],
        ['easy', 'قراءة وفهم', 'قطعة معلوماتية', tf('النحلة حشرة ضارة.', false, why('في القطعة: النحلة حشرة صغيرة نافعة.'))],
        ['medium', 'قراءة وفهم', 'قطعة معلوماتية', mcq('تصنع النحلة العسل من:', ['الماء', 'رحيق الأزهار', 'أوراق الشجر', 'التراب'], 'ب')],
        ['medium', 'قراءة وفهم', 'قطعة معلوماتية', mcq('معنى كلمة «تمتصُّ»:', ['تشرب', 'ترمي', 'تبني', 'تنام'], 'أ')],
        ['hard', 'قراءة وفهم', 'قطعة معلوماتية', mcq('لماذا العسل مفيد؟', ['لأنه حلو فقط', 'لأنه غذاء فيه شفاء', 'لأن لونه أصفر', 'لأنه غالٍ'], 'ب')],
        ['hard', 'قراءة وفهم', 'قطعة معلوماتية', essay('اكتب فائدتين للنحلة.', 'تصنع العسل، والعسل غذاء مفيد فيه شفاء للناس.')],
      ] },
  ]],
  ['النصوص والأناشيد', [
    { passage: { type: 'passage', font: 'amiri', stem_text: 'نشيد: وطني\nوطني الحبيبُ أحبُّهُ … وأصونُهُ طولَ الزمنْ\nنيلٌ يفيضُ بخيرِهِ … يسقي الحقولَ ويحتضنْ\nأرضٌ تزينُها الزهورُ … وسماؤها صفوٌ حسنْ\nأبني بلادي بالعلومِ … وأكونُ درعًا للوطنْ' },
      children: [
        ['easy', 'نصوص', 'أناشيد', mcq('عن ماذا يتحدث النشيد؟', ['عن الوطن', 'عن الحيوانات', 'عن الرياضة', 'عن الطعام'], 'أ')],
        ['easy', 'نصوص', 'أناشيد', mcq('ما الذي يسقي الحقول في النشيد؟', ['المطر', 'النيل', 'البحر', 'البئر'], 'ب')],
        ['medium', 'نصوص', 'أناشيد', tf('يبني الشاعر بلاده بالعلوم.', true)],
        ['medium', 'نصوص', 'أناشيد', mcq('معنى كلمة «أصونه»:', ['أحفظه', 'أتركه', 'أبيعه', 'أنساه'], 'أ')],
        ['hard', 'نصوص', 'أناشيد', mcq('مضاد كلمة «تزينها»:', ['تجمّلها', 'تشوّهها', 'ترويها', 'تحرسها'], 'ب')],
        ['hard', 'نصوص', 'أناشيد', matching('صِلْ كل كلمة بمعناها:', [['يفيض', 'يزيد ويكثر'], ['درعًا', 'حماية'], ['الحقول', 'الأراضي المزروعة']])],
        ['very_hard', 'نصوص', 'أناشيد', essay('كيف تخدم وطنك؟ اكتب جملتين.', 'مثال: أتعلّم وأجتهد في دراستي، وأحافظ على نظافة بلدي. تُقبل أي جملتين مناسبتين.')],
      ] },
  ]],
  ['المفردات', [
    ['easy', 'مفردات', 'المعنى', mcq('معنى كلمة «الفرحة»:', ['السعادة', 'الحزن', 'التعب', 'الخوف'], 'أ')],
    ['medium', 'مفردات', 'المعنى', mcq('معنى كلمة «يُسارع»:', ['يتأخر', 'يُسرع', 'ينام', 'يقف'], 'ب')],
    ['medium', 'مفردات', 'المعنى', matching('صِلْ كل كلمة بمعناها:', [['شجاع', 'جريء لا يخاف'], ['كريم', 'يعطي الآخرين'], ['نشيط', 'يعمل بهمة']])],
    ['easy', 'مفردات', 'المضاد', mcq('مضاد كلمة «كبير»:', ['صغير', 'طويل', 'عظيم', 'واسع'], 'أ')],
    ['medium', 'مفردات', 'المضاد', mcq('مضاد كلمة «نظيف»:', ['جميل', 'متسخ', 'لامع', 'جديد'], 'ب')],
    ['medium', 'مفردات', 'المضاد', tf('مضاد كلمة «ليل» هو «نهار».', true)],
    ['hard', 'مفردات', 'المضاد', multi('اختر الأزواج المتضادة:', [['قريب - بعيد', 1], ['سريع - بطيء', 1], ['جميل - حسن', 0], ['صادق - كاذب', 1]])],
    ['medium', 'مفردات', 'المفرد والجمع', mcq('جمع كلمة «كتاب»:', ['كتابان', 'كتب', 'كاتب', 'مكتبة'], 'ب')],
    ['hard', 'مفردات', 'المفرد والجمع', mcq('مفرد كلمة «أشجار»:', ['شجرة', 'أشجر', 'شجران', 'مشجر'], 'أ')],
    ['hard', 'مفردات', 'المفرد والجمع', essay('اكتب جمع كلمة «زهرة».', 'زهور أو أزهار (تُقبل الإجابتان).')],
  ]],
  ['التعبير', [
    ['medium', 'تعبير', 'ترتيب الجمل', essay('رتِّب الكلمات لتكوّن جملة: (المدرسة - إلى - التلميذ - ذهب)', 'ذهب التلميذ إلى المدرسة.')],
    ['hard', 'تعبير', 'ترتيب الجمل', essay('رتِّب الكلمات لتكوّن جملة: (الحديقة - في - الأطفال - يلعب)', 'يلعب الأطفال في الحديقة.')],
    ['medium', 'تعبير', 'ترتيب الجمل', mcq('اختر الجملة المرتبة ترتيبًا صحيحًا:', ['ذهبَ أحمدُ إلى السوق', 'إلى ذهبَ السوقِ أحمدُ', 'السوقِ أحمدُ ذهبَ إلى', 'ذهبَ إلى أحمدُ السوق'], 'أ')],
    ['very_hard', 'تعبير', 'تعبير حر', essay('اكتب ثلاث جمل عن فصل الشتاء.', 'مثال: في الشتاء يبرد الجو وتسقط الأمطار. نلبس الملابس الثقيلة. نشرب المشروبات الدافئة. تُقبل أي ثلاث جمل مناسبة.')],
    ['hard', 'تعبير', 'تعبير حر', essay('اكتب جملتين عن صديقك.', 'مثال: صديقي اسمه علي، وهو مهذب ومجتهد. نلعب معًا في الفسحة. تُقبل أي جملتين مناسبتين.')],
    ['easy', 'تعبير', 'تعبير حر', tf('نضع علامة الاستفهام (؟) في آخر السؤال.', true)],
  ]],
];

// ---------- Lookups ----------

const findBank = async () => (await api('GET', '/question-bank/banks')).find((b) => b.name === BANK_NAME);

async function bankParts(bankId) {
  const tree = await api('GET', `/question-bank/banks/${bankId}/tree`);
  const term = tree.find((f) => f.parent_id === bankId && f.name === TERM_NAME);
  const folders = new Map(tree.filter((f) => term && f.parent_id === term.id).map((f) => [f.name, f.id]));
  const cats = await api('GET', `/question-bank/banks/${bankId}/categories`);
  const flat = [];
  const walk = (list, parent) => list.forEach((c) => {
    flat.push({ ...c, parent_id: c.parent_id ?? parent ?? null });
    if (c.subcategories) walk(c.subcategories, c.id);
  });
  walk(Array.isArray(cats) ? cats : cats.categories ?? [], null);
  const category = (name, sub) => {
    const top = flat.find((c) => !c.parent_id && c.name === name);
    const child = sub && flat.find((c) => c.parent_id === top?.id && c.name === sub);
    return { category: top?.id ?? null, subcategory: child?.id ?? null };
  };
  return { term, folders, category };
}

async function lookups() {
  const subjects = await request('GET', '/subjects');
  const levels = await request('GET', '/levels');
  const governments = await request('GET', '/governments');
  const arabic = subjects.find((s) => /عرب|arab/i.test(s.title));
  const third = levels.find((l) => /الثالث الابتدائي/.test(l.title_ar || '') || /^3(rd)?\s*primary/i.test(l.title || ''));
  const government = governments[0];
  const zones = government ? await request('GET', `/zones?government_id=${government.id}`) : [];
  return { arabic, third, government, zone: zones[0] };
}

// ---------- 1. Bank ----------

async function buildBank(look) {
  if (await findBank()) {
    console.log(`Bank "${BANK_NAME}" already exists; skipping the bank step.`);
    return;
  }
  const bank = await api('POST', '/question-bank/banks', { name: BANK_NAME, subject_id: look.arabic?.id ?? null });
  for (const [name, subs] of CATEGORIES) {
    const top = await api('POST', `/question-bank/banks/${bank.id}/categories`, { name });
    for (const sub of subs) await api('POST', `/question-bank/banks/${bank.id}/categories`, { name: sub, parent_id: top.id });
  }
  const term = await api('POST', '/question-bank/folders', { parent_id: bank.id, name: TERM_NAME });
  if (look.third) await api('PATCH', `/question-bank/folders/${term.id}`, { level_ids: [look.third.id] });
  const parts = await bankParts(bank.id);

  let count = 0;
  const addItem = async (folderId, [difficulty, cat, sub, question], passageId = null) => {
    const { category, subcategory } = parts.category(cat, sub);
    await api('POST', `/question-bank/folders/${folderId}/questions`, {
      difficulty, category_id: category, subcategory_id: subcategory, ...(passageId && { passage_id: passageId }), ...question,
    });
    count++;
  };
  for (const [name, items] of FOLDERS) {
    const folder = await api('POST', '/question-bank/folders', { parent_id: term.id, name });
    for (const item of items) {
      if (item.passage) {
        const passage = await api('POST', `/question-bank/folders/${folder.id}/questions`, item.passage);
        for (const child of item.children) await addItem(folder.id, child, passage.id);
      } else {
        await addItem(folder.id, item);
      }
    }
  }
  console.log(`Bank "${BANK_NAME}" (id ${bank.id}): ${FOLDERS.length} folders, ${count} questions.`);
}

// ---------- 2. Exam ----------

// Sections: [name, folder, [ [category, subcategory|null, counts] ]]. Marks: hard 2, very hard 3.
const SECTIONS = [
  ['القسم الأول: النحو', 'النحو', [
    ['نحو', 'أنواع الكلمة', { easy_count: 2, medium_count: 1 }],
    ['نحو', 'المفرد والمثنى والجمع', { easy_count: 1, medium_count: 1, hard_count: 1 }],
    ['نحو', 'الضمائر', { medium_count: 1 }],
    ['نحو', null, { hard_count: 1, very_hard_count: 1 }],
  ]],
  ['القسم الثاني: الإملاء', 'الإملاء', [
    ['إملاء', 'التاء المربوطة والمفتوحة', { easy_count: 2, medium_count: 1 }],
    ['إملاء', 'اللام الشمسية والقمرية', { easy_count: 1, medium_count: 1 }],
    ['إملاء', null, { hard_count: 1 }],
  ]],
  ['القسم الثالث: القراءة', 'القراءة', [
    ['قراءة وفهم', 'قطعة قصصية', { easy_count: 2, medium_count: 2, hard_count: 1 }],
    ['قراءة وفهم', 'قطعة معلوماتية', { easy_count: 1, medium_count: 2, hard_count: 1 }],
  ]],
  ['القسم الرابع: النصوص', 'النصوص والأناشيد', [
    ['نصوص', 'أناشيد', { easy_count: 2, medium_count: 2 }],
    ['نصوص', 'أناشيد', { hard_count: 1 }],
  ]],
  ['القسم الخامس: المفردات', 'المفردات', [
    ['مفردات', 'المعنى', { easy_count: 1, medium_count: 1 }],
    ['مفردات', 'المضاد', { easy_count: 1, medium_count: 1 }],
    ['مفردات', null, { hard_count: 1 }],
  ]],
  ['القسم السادس: التعبير', 'التعبير', [
    ['تعبير', 'ترتيب الجمل', { medium_count: 1 }],
    ['تعبير', 'تعبير حر', { very_hard_count: 1 }],
  ]],
];

async function ensureTeacher(look) {
  const found = (await api('GET', `/exam-admin/teachers/search?q=${encodeURIComponent(TEACHER_EMAIL)}`)).items.find((u) => u.email === TEACHER_EMAIL);
  if (found) return found;
  await api('POST', '/admin/users', {
    name: 'مدرس التجربة النهائية', email: TEACHER_EMAIL, password: TEST_PASSWORD, phone: '01088800000', role: 'Teacher', gender: 'male',
    is_primary: true, is_preparatory: false, is_secondary: false,
    subject_id: look.arabic?.id, government_id: look.government?.id, zone_id: look.zone?.id,
  });
  return (await api('GET', `/exam-admin/teachers/search?q=${encodeURIComponent(TEACHER_EMAIL)}`)).items.find((u) => u.email === TEACHER_EMAIL);
}

async function findExam() {
  const folders = await api('GET', '/exam-admin/folders');
  const folder = folders.find((f) => f.name === EXAM_FOLDER_NAME);
  if (!folder) return { folder: null, exam: null };
  const details = await api('GET', `/exam-admin/folders/${folder.id}`);
  return { folder, exam: details.exams.find((e) => e.name === EXAM_NAME) ?? null };
}

async function buildExam(look) {
  const bank = await findBank();
  if (!bank) throw new Error(`Bank "${BANK_NAME}" not found; run the bank step first.`);
  let { folder, exam } = await findExam();
  if (exam) {
    console.log(`Exam "${EXAM_NAME}" already exists (id ${exam.id}); skipping the exam step.`);
    return;
  }
  const parts = await bankParts(bank.id);
  folder = folder ?? await api('POST', '/exam-admin/folders', { name: EXAM_FOLDER_NAME });
  exam = await api('POST', `/exam-admin/folders/${folder.id}/exams`, { name: EXAM_NAME, type: 'exam', mode: 'random' });
  await api('PATCH', `/exam-admin/exams/${exam.id}`, {
    description: 'امتحان التجربة النهائية: ست أقسام، وكل قسم يُسحب بقواعده من بنك «عربي التجربة النهائية».',
    subject_id: look.arabic?.id ?? null, duration_minutes: 60, pass_percent: 50, redo_percent: 70, max_redos: 1,
    redo_new_questions: true, shuffle: true, show_answers: 'immediately',
  });
  const full = await api('GET', `/exam-admin/exams/${exam.id}`);
  for (const [i, [name, folderName, rules]] of SECTIONS.entries()) {
    const section = i === 0
      ? await api('PATCH', `/exam-admin/sections/${full.sections[0].id}`, { name })
      : await api('POST', `/exam-admin/exams/${exam.id}/sections`, { name });
    const folderId = parts.folders.get(folderName);
    await api('PUT', `/exam-admin/sections/${section.id}/rules`, {
      rules: rules.map(([cat, sub, counts]) => {
        const { category, subcategory } = parts.category(cat, sub);
        return { folder_ids: [folderId], category_id: category, subcategory_id: subcategory, hard_mark: 2, very_hard_mark: 3, ...counts };
      }),
    });
  }
  const draw = await api('POST', `/exam-admin/exams/${exam.id}/draw`);
  if (draw.shortages?.length) console.warn('Draw shortages:', JSON.stringify(draw.shortages));
  const published = await api('POST', `/exam-admin/exams/${exam.id}/publish`);
  await api('PATCH', `/exam-admin/exams/${exam.id}`, { target_total: published.total });

  const teacher = await ensureTeacher(look);
  const now = Date.now();
  await api('POST', `/exam-admin/folders/${folder.id}/teachers`, {
    teacher_id: teacher.id,
    starts_at: new Date(now - 3600_000).toISOString(),
    ends_at: new Date(now + 60 * 86400_000).toISOString(),
  });
  console.log(`Exam "${EXAM_NAME}" (id ${exam.id}): ${draw.drawn} questions, ${published.total} marks, given to ${teacher.name}.`);
}

// ---------- 3. Students ----------

const keyCache = new Map();
async function answerKey(questionId) {
  if (!keyCache.has(questionId)) keyCache.set(questionId, await api('GET', `/question-bank/questions/${questionId}`));
  return keyCache.get(questionId);
}

// A student answers each question right with chance `skill`.
async function answerFor(q, skill, rnd) {
  const key = await answerKey(q.id);
  const right = rnd() < skill;
  if (q.type === 'essay') {
    const model = key.explanation_text || '';
    return { text: right ? model : (rnd() < 0.5 ? 'لا أعرف' : model.split(' ').slice(0, 3).join(' ')) };
  }
  if (q.type === 'matching') {
    const items = key.matching_items ?? [];
    const pairs = items.filter((m) => m.side === 'left' && m.match_item_id)
      .filter(() => right || rnd() < skill)
      .map((m) => [m.id, m.match_item_id]);
    return { pairs };
  }
  const options = key.options ?? [];
  const correct = options.filter((o) => o.is_correct).map((o) => o.id);
  const wrong = options.filter((o) => !o.is_correct).map((o) => o.id);
  if (right) return { option_ids: correct };
  if (q.type === 'mcq_multi') return { option_ids: [correct[0], wrong[0]].filter(Boolean) };
  return { option_ids: [wrong[Math.floor(rnd() * wrong.length)]] };
}

const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

async function ensureStudent(i, look) {
  const email = `final-student${i}@${DOMAIN}`;
  try {
    return { email, token: await login(email, TEST_PASSWORD) };
  } catch (err) {
    if (err.status !== 401 && err.status !== 400 && err.status !== 404) throw err;
  }
  await api('POST', '/admin/users', {
    name: `طالب التجربة النهائية ${i}`, email, password: TEST_PASSWORD, phone: `0108880001${i}`, role: 'Student', gender: i % 2 ? 'male' : 'female',
    level_id: look.third?.id, government_id: look.government?.id, zone_id: look.zone?.id, parent_phone_number: `0108880009${i}`,
  });
  return { email, token: await login(email, TEST_PASSWORD) };
}

async function takeExam(student, code, skill, rnd, events = []) {
  const start = await request('POST', `/exams/links/${code}/start`, { token: student.token });
  const headers = { token: student.token };
  const list = Array.isArray(start.questions) ? start.questions : Object.values(start.questions);
  const answers = [];
  for (const q of list) answers.push({ question_id: q.id, answer: await answerFor(q, skill, rnd) });
  const withToken = async (method, path, body) => {
    const res = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${headers.token}`, 'Content-Type': 'application/json', 'X-Attempt-Token': start.session_token }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).data;
  };
  await withToken('PUT', `/exams/attempts/${start.id}/answers`, { answers });
  for (const type of events) await withToken('POST', `/exams/attempts/${start.id}/events`, { type });
  return withToken('POST', `/exams/attempts/${start.id}/submit`, {});
}

// Essays: a strong student gets full marks, others half or nothing.
async function gradeEssays(attemptId, skill, rnd) {
  const paper = await api('GET', `/exam-admin/attempts/${attemptId}`);
  const essays = (paper.review ?? paper.questions ?? []).filter((r) => (r.question?.type ?? r.type) === 'essay');
  if (!essays.length) return;
  const grades = essays.map((r) => {
    const mark = Number(r.mark);
    const share = rnd() < skill ? 1 : rnd() < 0.5 ? 0.5 : 0;
    return { question_id: r.question_id ?? r.question?.id, mark: Math.floor(mark * share * 2) / 2 };
  });
  await api('PUT', `/exam-admin/attempts/${attemptId}/grades`, { grades });
}

async function appeal(student, attemptId, text) {
  const result = await request('GET', `/exams/attempts/${attemptId}/result`, { token: student.token });
  const lost = (result.review ?? result.questions ?? []).find((r) => Number(r.earned) < Number(r.mark));
  if (!lost) return null;
  const form = new FormData();
  form.append('question_id', String(lost.question_id));
  form.append('text', text);
  return request('POST', `/exams/attempts/${attemptId}/appeals`, { token: student.token, form });
}

async function runStudents(look) {
  if (!STUDENTS) return;
  const { exam } = await findExam();
  if (!exam) throw new Error('Exam not found; run the exam step first.');
  const teacher = await ensureTeacher(look);
  const link = (await api('GET', `/exam-admin/exams/${exam.id}/teachers?q=${encodeURIComponent(TEACHER_EMAIL)}`)).items.find((r) => r.teacher.id === teacher.id)?.link;
  if (!link) throw new Error('The teacher has no link on the exam.');

  const skills = [0.95, 0.85, 0.7, 0.5, 0.3, 0.6, 0.8, 0.4];
  const done = [];
  for (let i = 1; i <= STUDENTS; i++) {
    const student = await ensureStudent(i, look);
    const skill = skills[(i - 1) % skills.length];
    const rnd = seeded(1000 + i);
    const events = skill < 0.6 ? ['tab_leave', 'fullscreen_exit'] : [];
    try {
      const attempt = await takeExam(student, link.code, skill, rnd, events);
      done.push({ i, student, skill, rnd, attempt });
      console.log(`Student ${i} (${student.email}) submitted attempt ${attempt.id}.`);
    } catch (err) {
      console.log(`Student ${i}: ${err.message}`);
    }
  }
  // Grade every paper with essays except the last one, which stays waiting.
  for (const d of done.slice(0, -1)) await gradeEssays(d.attempt.id, d.skill, d.rnd);
  // Two appeals; the first is accepted with full marks, the second stays waiting.
  const appeals = [];
  for (const d of done.slice(1, 3)) {
    const sent = await appeal(d.student, d.attempt.id, 'أرجو مراجعة الدرجة، أعتقد أن إجابتي صحيحة.').catch(() => null);
    if (sent) appeals.push({ d, sent });
  }
  if (appeals[0]) {
    const paper = await api('GET', `/exam-admin/attempts/${appeals[0].d.attempt.id}`);
    const row = (paper.review ?? paper.questions ?? []).find((r) => (r.question_id ?? r.question?.id) === appeals[0].sent.question_id);
    await api('POST', `/exam-admin/appeals/${appeals[0].sent.id}/decision`, { accept: true, mark: Number(row?.mark ?? 1), reply: 'راجعتُ إجابتك وهي صحيحة، تم تعديل الدرجة.' });
  }
  // The weakest graded student redoes the exam (new questions are drawn).
  const weak = done.slice(0, -1).sort((a, b) => a.skill - b.skill)[0];
  if (weak) {
    try {
      const redo = await takeExam(weak.student, link.code, Math.min(1, weak.skill + 0.25), seeded(2000), []);
      await gradeEssays(redo.id, weak.skill + 0.25, seeded(3000));
      console.log(`Student ${weak.i} redid the exam (attempt ${redo.id}).`);
    } catch (err) {
      console.log(`Redo skipped: ${err.message}`);
    }
  }
  console.log(`Students: ${done.length}, appeals: ${appeals.length}. Link: ${link.code}`);
}

// ---------- Run ----------

(async () => {
  if (!STAFF_EMAIL || !STAFF_PASSWORD) throw new Error('Set KALIMA_EMAIL and KALIMA_PASSWORD (a SubAdmin or Moderator account).');
  staff = await login(STAFF_EMAIL, STAFF_PASSWORD);
  const look = await lookups();
  if (!look.arabic) console.warn('No Arabic subject found; the bank and exam get no subject.');
  if (!look.third) console.warn('No 3rd primary level found; the folder gets no level.');
  if (STEPS.has('bank')) await buildBank(look);
  if (STEPS.has('exam')) await buildExam(look);
  if (STEPS.has('students')) await runStudents(look);
  console.log('Done.');
})().catch((err) => { console.error(err.message); process.exit(1); });
