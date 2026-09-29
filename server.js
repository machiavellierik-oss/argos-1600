// ============================================================
// ARGOS 1600 — لعبة حياة عالم مفتوح سنة 1600م
// Node.js + Express + node:sqlite — ملف واحد
// ============================================================
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'game.db');
const SKIP_LLM = process.env.SKIP_LLM === '1';
const TEST_HOOKS = process.env.ALLOW_TEST_HOOKS === '1';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

// ---------------- قاعدة البيانات ----------------
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS characters(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  birth_city TEXT NOT NULL,
  current_city TEXT NOT NULL,
  country TEXT NOT NULL,
  social_class TEXT NOT NULL,
  wealth INTEGER DEFAULT 0,
  health INTEGER DEFAULT 80,
  reputation INTEGER DEFAULT 10,
  education INTEGER DEFAULT 0,
  occupation TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  alive INTEGER DEFAULT 1,
  backstory TEXT DEFAULT '',
  birth_year INTEGER NOT NULL,
  birth_month INTEGER NOT NULL,
  death_cause TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS family_members(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  relation TEXT NOT NULL,
  name TEXT NOT NULL,
  age INTEGER NOT NULL,
  occupation TEXT DEFAULT '',
  alive INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS life_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS world_clock(
  id INTEGER PRIMARY KEY CHECK (id = 1),
  year INTEGER DEFAULT 1600,
  month INTEGER DEFAULT 1,
  last_manual TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS game_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);
db.prepare(`INSERT OR IGNORE INTO world_clock(id, year, month) VALUES (1, 1600, 1)`).run();

// ---------------- بيانات البذور: 10 دول سنة 1600 ----------------
// ladder: 6 درجات — title / minWealth / minRep / minEdu / income (شهري)
const COUNTRIES = [
  { name: 'الدولة العثمانية', cities: ['إسطنبول', 'القاهرة', 'دمشق', 'بغداد', 'حلب', 'الجزائر'],
    ladder: [
      { title: 'فلاح / عامل', minWealth: 0, minRep: 0, minEdu: 0, income: 8 },
      { title: 'حرفي', minWealth: 60, minRep: 10, minEdu: 5, income: 16 },
      { title: 'تاجر', minWealth: 200, minRep: 20, minEdu: 15, income: 34 },
      { title: 'قاضٍ / محتسب', minWealth: 400, minRep: 40, minEdu: 50, income: 60 },
      { title: 'باشا / والٍ', minWealth: 1200, minRep: 65, minEdu: 60, income: 130 },
      { title: 'وزير / صدر أعظم', minWealth: 4000, minRep: 90, minEdu: 80, income: 300 },
    ] },
  { name: 'الدولة الصفوية', cities: ['أصفهان', 'تبريز', 'شيراز', 'قزوين', 'هراة'],
    ladder: [
      { title: 'فلاح / عامل', minWealth: 0, minRep: 0, minEdu: 0, income: 8 },
      { title: 'حرفي', minWealth: 60, minRep: 10, minEdu: 5, income: 15 },
      { title: 'تاجر', minWealth: 200, minRep: 20, minEdu: 15, income: 32 },
      { title: 'عالم / قاضٍ', minWealth: 350, minRep: 40, minEdu: 55, income: 58 },
      { title: 'خان / حاكم مدينة', minWealth: 1100, minRep: 65, minEdu: 55, income: 125 },
      { title: 'وكيل السلطنة / وزير', minWealth: 3800, minRep: 90, minEdu: 75, income: 290 },
    ] },
  { name: 'دولة المغول (الهند)', cities: ['دلهي', 'أغرا', 'لاهور', 'أحمد آباد', 'بنارس'],
    ladder: [
      { title: 'فلاح / عامل', minWealth: 0, minRep: 0, minEdu: 0, income: 7 },
      { title: 'حرفي', minWealth: 60, minRep: 10, minEdu: 5, income: 15 },
      { title: 'تاجر', minWealth: 200, minRep: 20, minEdu: 15, income: 33 },
      { title: 'كاتب ديوان', minWealth: 350, minRep: 35, minEdu: 50, income: 55 },
      { title: 'أمير / صوبدار', minWealth: 1100, minRep: 65, minEdu: 50, income: 120 },
      { title: 'وزير السلطنة', minWealth: 3800, minRep: 90, minEdu: 70, income: 280 },
    ] },
  { name: 'الصين (مينغ)', cities: ['بكين', 'نانجينغ', 'سوتشو', 'هانغتشو', 'قوانغتشو'],
    ladder: [
      { title: 'فلاح / عامل', minWealth: 0, minRep: 0, minEdu: 0, income: 7 },
      { title: 'حرفي', minWealth: 60, minRep: 10, minEdu: 5, income: 14 },
      { title: 'تاجر', minWealth: 200, minRep: 20, minEdu: 15, income: 30 },
      { title: 'شويتساي / طالب علم', minWealth: 300, minRep: 30, minEdu: 60, income: 40 },
      { title: 'تشيفو / مأمور مقاطعة', minWealth: 1000, minRep: 60, minEdu: 75, income: 110 },
      { title: 'مندرين كبير / وزير', minWealth: 3500, minRep: 90, minEdu: 90, income: 260 },
    ] },
  { name: 'إسبانيا', cities: ['مدريد', 'إشبيلية', 'برشلونة', 'توليدو', 'غرناطة'],
    ladder: [
      { title: 'فلاح / عامل', minWealth: 0, minRep: 0, minEdu: 0, income: 8 },
      { title: 'حرفي', minWealth: 60, minRep: 10, minEdu: 5, income: 16 },
      { title: 'تاجر', minWealth: 200, minRep: 20, minEdu: 15, income: 34 },
      { title: 'كاتب / محامٍ', minWealth: 400, minRep: 35, minEdu: 50, income: 58 },
      { title: 'كوريخيدور / عمدة', minWealth: 1100, minRep: 60, minEdu: 55, income: 120 },
      { title: 'مستشار الملك / وزير', minWealth: 4000, minRep: 90, minEdu: 75, income: 290 },
    ] },
  { name: 'إنجلترا', cities: ['لندن', 'يورك', 'بريستول', 'نورويتش', 'أكسفورد'],
    ladder: [
      { title: 'فلاح / عامل', minWealth: 0, minRep: 0, minEdu: 0, income: 8 },
      { title: 'حرفي', minWealth: 60, minRep: 10, minEdu: 5, income: 16 },
      { title: 'تاجر', minWealth: 200, minRep: 20, minEdu: 15, income: 34 },
      { title: 'كاتب / قس', minWealth: 380, minRep: 35, minEdu: 50, income: 56 },
      { title: 'عمدة', minWealth: 1100, minRep: 60, minEdu: 55, income: 118 },
      { title: 'لورد / مستشار الملكة', minWealth: 4000, minRep: 90, minEdu: 75, income: 290 },
    ] },
  { name: 'فرنسا', cities: ['باريس', 'ليون', 'مرسيليا', 'بوردو', 'روان'],
    ladder: [
      { title: 'فلاح / عامل', minWealth: 0, minRep: 0, minEdu: 0, income: 8 },
      { title: 'حرفي', minWealth: 60, minRep: 10, minEdu: 5, income: 16 },
      { title: 'تاجر', minWealth: 200, minRep: 20, minEdu: 15, income: 34 },
      { title: 'كاتب عدل / محامٍ', minWealth: 400, minRep: 35, minEdu: 50, income: 58 },
      { title: 'عمدة / حاكم مدينة', minWealth: 1100, minRep: 60, minEdu: 55, income: 120 },
      { title: 'وزير / مستشار الملك', minWealth: 4000, minRep: 90, minEdu: 75, income: 295 },
    ] },
  { name: 'المغرب (السعديون)', cities: ['مراكش', 'فاس', 'مكناس', 'سلا', 'تطوان'],
    ladder: [
      { title: 'فلاح / عامل', minWealth: 0, minRep: 0, minEdu: 0, income: 8 },
      { title: 'حرفي', minWealth: 60, minRep: 10, minEdu: 5, income: 15 },
      { title: 'تاجر', minWealth: 200, minRep: 20, minEdu: 15, income: 32 },
      { title: 'قاضٍ / محتسب', minWealth: 380, minRep: 40, minEdu: 50, income: 56 },
      { title: 'عمدة / قائد', minWealth: 1100, minRep: 65, minEdu: 55, income: 118 },
      { title: 'وزير / حاجب', minWealth: 3800, minRep: 90, minEdu: 75, income: 285 },
    ] },
  { name: 'روسيا القيصرية', cities: ['موسكو', 'نوفغورود', 'قازان', 'أستراخان', 'تفير'],
    ladder: [
      { title: 'فلاح / قن', minWealth: 0, minRep: 0, minEdu: 0, income: 6 },
      { title: 'حرفي', minWealth: 60, minRep: 10, minEdu: 5, income: 14 },
      { title: 'تاجر', minWealth: 200, minRep: 20, minEdu: 15, income: 30 },
      { title: 'كاتب ديوان', minWealth: 350, minRep: 35, minEdu: 50, income: 52 },
      { title: 'فويفودا / حاكم', minWealth: 1100, minRep: 60, minEdu: 50, income: 115 },
      { title: 'بويار / مستشار القيصر', minWealth: 3800, minRep: 90, minEdu: 70, income: 280 },
    ] },
  { name: 'البندقية', cities: ['البندقية', 'بادوفا', 'فيرونا', 'بريشيا', 'كريما'],
    ladder: [
      { title: 'بحّار / عامل', minWealth: 0, minRep: 0, minEdu: 0, income: 9 },
      { title: 'حرفي', minWealth: 60, minRep: 10, minEdu: 5, income: 16 },
      { title: 'تاجر', minWealth: 200, minRep: 20, minEdu: 15, income: 36 },
      { title: 'كاتب / محامٍ', minWealth: 400, minRep: 35, minEdu: 50, income: 58 },
      { title: 'عضو مجلس', minWealth: 1200, minRep: 65, minEdu: 55, income: 125 },
      { title: 'دوجي / مستشار', minWealth: 4200, minRep: 92, minEdu: 75, income: 300 },
    ] },
];
const countryByName = (n) => COUNTRIES.find((c) => c.name === n);

// ---------------- أسماء ----------------
const MALE = ['أحمد','محمد','علي','حسن','حسين','عمر','يوسف','إبراهيم','خالد','سعيد','محمود','عبد الله','مصطفى','كريم','طارق','سليم','ناصر','رشيد','جمال','حمزة'];
const FEMALE = ['فاطمة','عائشة','خديجة','مريم','زينب','سارة','ليلى','نور','حفصة','رقية','أمينة','سلمى','هبة','جميلة','آسية'];
const SURNAMES = ['الحلبي','الدمشقي','الفاسي','البغدادي','المصري','الأندلسي','التركي','الفارسي','الشامي','المغربي','التونسي','القرطبي'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// ---------------- الطبقات الاجتماعية ----------------
const CLASSES = [
  { name: 'فلاح', w: 55, wealth: [20, 60], startJob: 0, edu: [0, 5] },
  { name: 'حرفي', w: 15, wealth: [60, 120], startJob: 0, edu: [5, 15] },
  { name: 'تاجر', w: 12, wealth: [150, 400], startJob: 0, edu: [10, 25] },
  { name: 'جندي', w: 8, wealth: [40, 100], startJob: 0, edu: [0, 10] },
  { name: 'نبيل', w: 7, wealth: [500, 1500], startJob: 0, edu: [20, 40] },
  { name: 'رجل دين', w: 3, wealth: [80, 200], startJob: 0, edu: [25, 45] },
];
function rollClass() {
  const total = CLASSES.reduce((s, c) => s + c.w, 0);
  let r = Math.random() * total;
  for (const c of CLASSES) { r -= c.w; if (r <= 0) return c; }
  return CLASSES[0];
}
const FATHER_JOBS = { 'فلاح': 'مزارع', 'حرفي': 'نجار', 'تاجر': 'تاجر', 'جندي': 'جندي في الجيش', 'نبيل': 'من وجهاء المدينة', 'رجل دين': 'إمام وعالم' };

// ---------------- توليد العائلة ----------------
function genFamily(characterName, gender, city, country, cls) {
  const fam = [];
  const surname = pick(SURNAMES);
  const fatherName = pick(MALE) + ' ' + surname;
  const motherName = pick(FEMALE) + ' ' + surname;
  fam.push({ relation: 'أب', name: fatherName, age: rint(38, 52), occupation: FATHER_JOBS[cls.name] || 'عامل', alive: 1 });
  fam.push({ relation: 'أم', name: motherName, age: rint(34, 46), occupation: pick(['ربة منزل', 'ربة منزل', 'خياطة', 'قابلة']), alive: 1 });
  const nSib = rint(0, 4);
  for (let i = 0; i < nSib; i++) {
    const isBro = Math.random() < 0.5;
    fam.push({
      relation: isBro ? 'أخ' : 'أخت',
      name: (isBro ? pick(MALE) : pick(FEMALE)) + ' ' + surname,
      age: rint(2, 14),
      occupation: '',
      alive: 1,
    });
  }
  return { fam, surname, fatherName, motherName };
}

function ruleBackstory(name, gender, city, country, cls, fatherName, motherName, nSib) {
  const p1 = `وُلد ${name} سنة 1600م في مدينة ${city} بـ${country}، لعائلة من طبقة ${cls.name === 'فلاح' ? 'الفلاحين' : cls.name === 'حرفي' ? 'الحرفيين' : cls.name === 'تاجر' ? 'التجار' : cls.name === 'جندي' ? 'الجند' : cls.name === 'نبيل' ? 'النبلاء' : 'رجال الدين'}. أبوه ${fatherName} يعمل ${FATHER_JOBS[cls.name] || 'عاملًا'}، وأمه ${motherName} تدير شؤون البيت.`;
  const p2 = nSib > 0
    ? `له ${nSib} من الإخوة والأخوات يشاركونه البيت الضيق والدفء العائلي. بلغ ${name} السادسة عشرة هذا العام، وبدأ يحلم بحياة أكبر من ${city} — فهل يرضى بنصيبه، أم يشق طريقه نحو المجد؟`
    : `ليس له إخوة، فنشأ وحيدًا بين أبويه يتعلم منهما الصبر والكدّ. بلغ ${name} السادسة عشرة هذا العام، وبدأ يحلم بحياة أكبر من ${city} — فهل يرضى بنصيبه، أم يشق طريقه نحو المجد؟`;
  return p1 + '\n\n' + p2;
}

async function llmBackstory(prompt) {
  if (SKIP_LLM) return null;
  try {
    const url = 'https://text.pollinations.ai/' + encodeURIComponent(prompt);
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const txt = (await res.text()).trim();
    if (!txt || txt.length < 40) return null;
    return txt.slice(0, 900);
  } catch { return null; }
}

// ---------------- الساعة ----------------
function getClock() { return db.prepare('SELECT * FROM world_clock WHERE id=1').get(); }
function ageMonths(ch, clock) { return (clock.year - ch.birth_year) * 12 + (clock.month - ch.birth_month); }
const MONTH_NAMES = ['محرم','صفر','ربيع الأول','ربيع الثاني','جمادى الأولى','جمادى الثانية','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
function fmtDate(year, month) { return `${MONTH_NAMES[(month - 1) % 12]} ${year}م`; }

// ---------------- الأحداث الشهرية ----------------
function randomEvent(ch) {
  const roll = Math.random();
  const ev = { kind: 'خير', title: '', body: '', dh: 0, dw: 0, dr: 0, de: 0, killFam: false };
  if (roll < 0.10) { // مرض
    ev.kind = 'مرض'; ev.title = '🤒 مرضٌ ألمّ بك';
    ev.dh = -rint(8, 15); ev.body = 'أصابتك حمّى شديدة ألزمتك الفراش أيامًا.';
  } else if (roll < 0.16) { // وباء
    ev.kind = 'وباء'; ev.title = '☠️ وباء يجتاح المدينة';
    ev.dh = -rint(20, 32); ev.body = 'انتشر وباء في الأزقة، ومات كثيرون. نجوتَ بأعجوبة.';
    if (Math.random() < 0.25) ev.killFam = true;
  } else if (roll < 0.22) { // حرب
    ev.kind = 'حرب'; ev.title = '⚔️ حربٌ على الأبواب';
    ev.dw = -Math.round(ch.wealth * 0.3); ev.dr = -5; ev.body = 'اندلعت حرب قريبة ففُرضت ضرائب باهظة ونهب بعض التجار.';
  } else if (roll < 0.32) { // فرصة تجارة
    ev.kind = 'فرصة'; ev.title = '💰 فرصة تجارية';
    ev.dw = rint(40, 120); ev.body = 'قافلة محمّلة بالبضائع مرّت بمدينتك فربحت من التجارة معها.';
  } else if (roll < 0.42) { // لقاء مؤثر
    ev.kind = 'لقاء'; ev.title = '🤝 لقاءٌ غيّر مسارك';
    ev.dr = rint(8, 15); ev.body = 'التقيت بشخصية نافذة أعجبت بكلامك وفتحت لك أبوابًا.';
  } else if (roll < 0.48) { // قحط
    ev.kind = 'قحط'; ev.title = '🌾 سنة قحط';
    ev.dw = -Math.round(ch.wealth * 0.2); ev.dh = -5; ev.body = 'شحّ المطر فغلت الأسعار وجاع الفقراء.';
  } else if (roll < 0.56) { // رخاء
    ev.kind = 'رخاء'; ev.title = '🌟 سنة رخاء';
    ev.dw = Math.round(ch.wealth * 0.15) + 20; ev.dh = 5; ev.body = 'موسم وفير عمّ الخير فيه على الجميع.';
  } else if (roll < 0.62) { // سرقة
    ev.kind = 'سرقة'; ev.title = '🥷 سُرق مالك!';
    ev.dw = -Math.round(ch.wealth * 0.15) - 10; ev.body = 'تسلل لصوص إلى دارك ليلًا وسرقوا جزءًا من مالك.';
  } else if (roll < 0.68) { // تكريم
    ev.kind = 'تكريم'; ev.title = '🏅 تكريمٌ من الأعيان';
    ev.dr = 10; ev.body = 'كرّمك وجهاء المدينة لحسن سيرتك بين الناس.';
  } else if (roll < 0.72) { // مولود
    ev.kind = 'مولود'; ev.title = '👶 مولود جديد في العائلة';
    ev.body = 'رزقت عائلتك بمولود جديد عمّت به الفرحة الدار.';
    ev.newborn = true;
  }
  return ev;
}

function logEvent(charId, year, month, kind, title, body) {
  db.prepare('INSERT INTO life_events(character_id, year, month, kind, title, body) VALUES (?,?,?,?,?,?)')
    .run(charId, year, month, kind, title, body);
}

function applyMonthly(ch, clock) {
  const country = countryByName(ch.country);
  const rung = country.ladder[ch.position] || country.ladder[0];
  const ageY = Math.floor(ageMonths(ch, clock) / 12);
  const changes = [];

  // الدخل الشهري
  ch.wealth += rung.income;
  // نفقة المعيشة
  const living = 5;
  ch.wealth -= living;
  if (ch.wealth < 0) { ch.wealth = 0; ch.health -= 5; changes.push('جوع'); }

  // الشيخوخة
  if (ageY >= 65) ch.health -= 4;
  else if (ageY >= 50) ch.health -= 2;

  // حدث عشوائي 35%
  let ev = null;
  if (Math.random() < 0.35) {
    ev = randomEvent(ch);
    ch.health += ev.dh; ch.wealth += ev.dw; ch.reputation += ev.dr; ch.education += ev.de;
    if (ch.wealth < 0) ch.wealth = 0;
    if (ev.killFam) {
      const fam = db.prepare('SELECT * FROM family_members WHERE character_id=? AND alive=1').all(ch.id);
      if (fam.length) {
        const victim = pick(fam);
        db.prepare('UPDATE family_members SET alive=0 WHERE id=?').run(victim.id);
        ev.body += ` ومات ${victim.relation}ك ${victim.name} في الوباء.`;
      }
    }
    if (ev.newborn) {
      db.prepare('INSERT INTO family_members(character_id, relation, name, age, occupation, alive) VALUES (?,?,?,?,?,1)')
        .run(ch.id, Math.random() < 0.5 ? 'أخ' : 'أخت', pick(Math.random() < 0.5 ? MALE : FEMALE) + ' ' + pick(SURNAMES), 0, '');
    }
    logEvent(ch.id, clock.year, clock.month, ev.kind, ev.title, ev.body);
  } else {
    ch.health = Math.min(100, ch.health + 1); // راحة
  }

  // الموت
  let died = false;
  if (ch.health <= 0) {
    ch.health = 0; ch.alive = 0; died = true;
    ch.death_cause = ev && (ev.kind === 'وباء' || ev.kind === 'مرض') ? ev.title : 'الوفاة بعد عمرٍ مديد';
    logEvent(ch.id, clock.year, clock.month, 'وفاة', '⚰️ توفّي ' + ch.name, `${ch.death_cause}. عاش ${ageY} سنة في ${ch.country}.`);
  }

  ch.health = Math.max(0, Math.min(100, ch.health));
  ch.reputation = Math.max(0, Math.min(100, ch.reputation));
  ch.education = Math.max(0, Math.min(100, ch.education));
  db.prepare('UPDATE characters SET wealth=?, health=?, reputation=?, education=?, alive=?, death_cause=? WHERE id=?')
    .run(ch.wealth, ch.health, ch.reputation, ch.education, ch.alive, ch.death_cause, ch.id);
  return { ev, died, ageY };
}

function advanceWorld(manual) {
  const clock = getClock();
  if (manual) {
    const last = clock.last_manual ? new Date(clock.last_manual).getTime() : 0;
    if (Date.now() - last < 60000) return { ok: false, error: 'انتظر دقيقة قبل التقدم اليدوي مجددًا' };
    db.prepare('UPDATE world_clock SET last_manual=? WHERE id=1').run(new Date().toISOString());
  }
  let { year, month } = clock;
  month++;
  if (month > 12) { month = 1; year++; }
  db.prepare('UPDATE world_clock SET year=?, month=? WHERE id=1').run(year, month);
  const chars = db.prepare('SELECT * FROM characters WHERE alive=1').all();
  let deaths = 0;
  for (const ch of chars) {
    const r = applyMonthly(ch, { year, month });
    if (r.died) deaths++;
  }
  if (month === 1) db.prepare('INSERT INTO game_log(year, month, text) VALUES (?,?,?)').run(year, month, `حلت سنة ${year}م — ${chars.length} شخصية على قيد الحياة`);
  return { ok: true, year, month, advanced: chars.length, deaths };
}

// تقدّم تلقائي: كل ساعة حقيقية = شهر لعب
setInterval(() => {
  try { advanceWorld(false); } catch (e) { console.error('auto tick failed', e.message); }
}, 3600000);

// ---------------- التطبيق ----------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// جلسات
function hashPw(pw, salt) { return crypto.createHash('sha256').update(salt + pw).digest('hex'); }
function auth(req, res, next) {
  const m = (req.headers.cookie || '').match(/sess=([a-f0-9]{64})/);
  if (!m) return res.status(401).json({ ok: false, error: 'سجّل الدخول أولًا' });
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(m[1]);
  if (!s) return res.status(401).json({ ok: false, error: 'انتهت الجلسة' });
  req.userId = s.user_id;
  next();
}
function myChar(userId) { return db.prepare('SELECT * FROM characters WHERE user_id=?').get(userId); }
function charView(ch) {
  const clock = getClock();
  const country = countryByName(ch.country);
  const fam = db.prepare('SELECT * FROM family_members WHERE character_id=? ORDER BY age DESC').all(ch.id);
  const ladder = country.ladder.map((r, i) => ({ ...r, index: i, current: i === ch.position }));
  return {
    ...ch,
    age_years: Math.floor(ageMonths(ch, clock) / 12),
    age_months_total: ageMonths(ch, clock),
    clock_year: clock.year, clock_month: clock.month, clock_label: fmtDate(clock.year, clock.month),
    ladder, family: fam,
  };
}

// ---- الحسابات ----
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !/^[A-Za-z0-9_\u0621-\u064A]{3,20}$/.test(username))
    return res.json({ ok: false, error: 'اسم المستخدم 3-20 حرفًا (عربي/إنجليزي/أرقام)' });
  if (!password || password.length < 4)
    return res.json({ ok: false, error: 'كلمة السر 4 أحرف على الأقل' });
  const salt = crypto.randomBytes(16).toString('hex');
  try {
    const r = db.prepare('INSERT INTO users(username, pass_hash, salt) VALUES (?,?,?)')
      .run(username, hashPw(password, salt), salt);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token, user_id) VALUES (?,?)').run(token, r.lastInsertRowid);
    res.setHeader('Set-Cookie', `sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
    res.json({ ok: true });
  } catch { res.json({ ok: false, error: 'اسم المستخدم مسجّل بالفعل' }); }
});
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u || hashPw(password, u.salt) !== u.pass_hash)
    return res.json({ ok: false, error: 'بيانات الدخول غير صحيحة' });
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token, user_id) VALUES (?,?)').run(token, u.id);
  res.setHeader('Set-Cookie', `sess=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  res.json({ ok: true });
});
app.post('/api/logout', auth, (req, res) => {
  const m = req.headers.cookie.match(/sess=([a-f0-9]{64})/);
  db.prepare('DELETE FROM sessions WHERE token=?').run(m[1]);
  res.setHeader('Set-Cookie', 'sess=; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  const m = (req.headers.cookie || '').match(/sess=([a-f0-9]{64})/);
  if (!m) return res.json({ ok: true, user: null });
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(m[1]);
  if (!s) return res.json({ ok: true, user: null });
  const u = db.prepare('SELECT id, username FROM users WHERE id=?').get(s.user_id);
  res.json({ ok: true, user: u, hasCharacter: !!myChar(u.id) });
});

// ---- الدول ----
app.get('/api/countries', (req, res) => {
  res.json({ ok: true, countries: COUNTRIES.map((c) => ({ name: c.name, cities: c.cities })) });
});

// ---- إنشاء الشخصية ----
app.post('/api/character', auth, async (req, res) => {
  const { name, birth_city, country, gender } = req.body || {};
  if (myChar(req.userId)) return res.json({ ok: false, error: 'لديك شخصية بالفعل' });
  if (!name || name.trim().length < 2 || name.trim().length > 40)
    return res.json({ ok: false, error: 'الاسم من 2 إلى 40 حرفًا' });
  const c = countryByName(country);
  if (!c) return res.json({ ok: false, error: 'اختر دولة صحيحة' });
  if (!c.cities.includes(birth_city)) return res.json({ ok: false, error: 'اختر مدينة من مدن الدولة' });
  if (!['ذكر', 'أنثى'].includes(gender)) return res.json({ ok: false, error: 'اختر الجنس' });

  const cls = rollClass();
  const clock = getClock();
  const { fam, fatherName, motherName } = genFamily(name.trim(), gender, birth_city, country, cls);
  const wealth = rint(cls.wealth[0], cls.wealth[1]);
  const education = rint(cls.edu[0], cls.edu[1]);
  const occupation = c.ladder[0].title;

  // خلفية قصصية: قاعدية أولًا، ثم محاولة LLM (لا تكسر اللعبة أبدًا)
  let backstory = ruleBackstory(name.trim(), gender, birth_city, country, cls, fatherName, motherName, fam.filter((f) => f.relation === 'أخ' || f.relation === 'أخت').length);
  const prompt = `اكتب خلفية قصصية من فقرتين قصيرتين بالعربية الفصحى المبسطة لشاب عمره 16 سنة يعيش سنة 1600م في مدينة ${birth_city} في ${country}. اسمه ${name.trim()}، من أسرة ${cls.name}، أبوه ${fatherName} وأمه ${motherName}. لا تذكر أي تاريخ بعد سنة 1600 ولا أي تقنية حديثة.`;
  try {
    const llm = await llmBackstory(prompt);
    if (llm) backstory = llm;
  } catch { /* تجاهل تام — النص القاعدي يكفي */ }

  const r = db.prepare(`INSERT INTO characters(user_id, name, gender, birth_city, current_city, country, social_class, wealth, health, reputation, education, occupation, position, backstory, birth_year, birth_month)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    req.userId, name.trim(), gender, birth_city, birth_city, country, cls.name, wealth, rint(70, 95), 10, education, occupation, 0, backstory, clock.year - 16, clock.month);
  const cid = r.lastInsertRowid;
  const ins = db.prepare('INSERT INTO family_members(character_id, relation, name, age, occupation) VALUES (?,?,?,?,?)');
  for (const f of fam) ins.run(cid, f.relation, f.name, f.age, f.occupation);
  logEvent(cid, clock.year, clock.month, 'ميلاد', '🎂 وُلد ' + name.trim(), `وُلد ${name.trim()} في ${birth_city} بـ${country} لأسرة ${cls.name}.`);
  res.json({ ok: true, character: charView(myChar(req.userId)) });
});

// ---- بياناتي ----
app.get('/api/character', auth, (req, res) => {
  const ch = myChar(req.userId);
  if (!ch) return res.json({ ok: true, character: null });
  res.json({ ok: true, character: charView(ch) });
});

// ---- تقدّم شهر ----
app.post('/api/advance', auth, (req, res) => {
  const ch = myChar(req.userId);
  if (!ch) return res.json({ ok: false, error: 'أنشئ شخصيتك أولًا' });
  if (!ch.alive) return res.json({ ok: false, error: 'شخصيتك متوفاة — أنشئ شخصية جديدة' });
  const r = advanceWorld(true);
  if (!r.ok) return res.json(r);
  res.json({ ok: true, clock: fmtDate(r.year, r.month), character: charView(myChar(req.userId)) });
});

// ---- الأحداث ----
app.get('/api/events', auth, (req, res) => {
  const ch = myChar(req.userId);
  if (!ch) return res.json({ ok: true, events: [] });
  const evs = db.prepare('SELECT * FROM life_events WHERE character_id=? ORDER BY id DESC LIMIT 60').all(ch.id);
  res.json({ ok: true, events: evs });
});

// ---- المهنة: السلّم والترقي ----
app.get('/api/careers', auth, (req, res) => {
  const ch = myChar(req.userId);
  if (!ch) return res.json({ ok: false, error: 'أنشئ شخصيتك أولًا' });
  const country = countryByName(ch.country);
  const ladder = country.ladder.map((r, i) => {
    const met = ch.wealth >= r.minWealth && ch.reputation >= r.minRep && ch.education >= r.minEdu;
    return { ...r, index: i, current: i === ch.position, reached: i <= ch.position, eligible: i === ch.position + 1 && met };
  });
  res.json({ ok: true, ladder, position: ch.position });
});
app.post('/api/promote', auth, (req, res) => {
  const ch = myChar(req.userId);
  if (!ch || !ch.alive) return res.json({ ok: false, error: 'لا توجد شخصية حيّة' });
  const country = countryByName(ch.country);
  const next = country.ladder[ch.position + 1];
  if (!next) return res.json({ ok: false, error: 'وصلت أعلى المناصب! 🎉' });
  const need = [];
  if (ch.wealth < next.minWealth) need.push(`الثروة ${next.minWealth}`);
  if (ch.reputation < next.minRep) need.push(`السمعة ${next.minRep}`);
  if (ch.education < next.minEdu) need.push(`التعليم ${next.minEdu}`);
  if (need.length) return res.json({ ok: false, error: 'ينقصك: ' + need.join('، ') });
  const clock = getClock();
  db.prepare('UPDATE characters SET position=position+1, occupation=? WHERE id=?').run(next.title, ch.id);
  logEvent(ch.id, clock.year, clock.month, 'ترقية', '🎖️ ترقية إلى ' + next.title, `رُقّي ${ch.name} إلى منصب ${next.title} في ${ch.country}.`);
  res.json({ ok: true, character: charView(myChar(req.userId)) });
});

// ---- أفعال: دراسة / راحة / سفر ----
app.post('/api/study', auth, (req, res) => {
  const ch = myChar(req.userId);
  if (!ch || !ch.alive) return res.json({ ok: false, error: 'لا توجد شخصية حيّة' });
  if (ch.wealth < 15) return res.json({ ok: false, error: 'تحتاج 15 من الثروة للدراسة' });
  if (ch.education >= 100) return res.json({ ok: false, error: 'بلغت أقصى التعليم' });
  db.prepare('UPDATE characters SET wealth=wealth-15, education=MIN(100, education+5) WHERE id=?').run(ch.id);
  res.json({ ok: true, character: charView(myChar(req.userId)) });
});
app.post('/api/rest', auth, (req, res) => {
  const ch = myChar(req.userId);
  if (!ch || !ch.alive) return res.json({ ok: false, error: 'لا توجد شخصية حيّة' });
  if (ch.wealth < 10) return res.json({ ok: false, error: 'تحتاج 10 من الثروة للعلاج والراحة' });
  if (ch.health >= 100) return res.json({ ok: false, error: 'صحتك كاملة' });
  db.prepare('UPDATE characters SET wealth=wealth-10, health=MIN(100, health+12) WHERE id=?').run(ch.id);
  res.json({ ok: true, character: charView(myChar(req.userId)) });
});
app.post('/api/travel', auth, (req, res) => {
  const ch = myChar(req.userId);
  if (!ch || !ch.alive) return res.json({ ok: false, error: 'لا توجد شخصية حيّة' });
  const { city } = req.body || {};
  const country = countryByName(ch.country);
  if (!country.cities.includes(city)) return res.json({ ok: false, error: 'مدينة غير صالحة' });
  if (city === ch.current_city) return res.json({ ok: false, error: 'أنت فيها بالفعل' });
  if (ch.wealth < 25) return res.json({ ok: false, error: 'السفر يكلف 25 من الثروة' });
  const clock = getClock();
  db.prepare('UPDATE characters SET wealth=wealth-25, current_city=? WHERE id=?').run(city, ch.id);
  logEvent(ch.id, clock.year, clock.month, 'سفر', '🧳 سفر إلى ' + city, `انتقل ${ch.name} للعيش في ${city}.`);
  res.json({ ok: true, character: charView(myChar(req.userId)) });
});

// ---- شخصية جديدة بعد الموت ----
app.post('/api/reborn', auth, (req, res) => {
  const ch = myChar(req.userId);
  if (!ch) return res.json({ ok: false, error: 'لا توجد شخصية' });
  if (ch.alive) return res.json({ ok: false, error: 'شخصيتك ما زالت حيّة!' });
  db.prepare('DELETE FROM family_members WHERE character_id=?').run(ch.id);
  db.prepare('DELETE FROM life_events WHERE character_id=?').run(ch.id);
  db.prepare('DELETE FROM characters WHERE id=?').run(ch.id);
  res.json({ ok: true });
});

// ---- خطاف اختبار فقط (ALLOW_TEST_HOOKS=1) ----
if (TEST_HOOKS) {
  app.post('/api/test/boost', auth, (req, res) => {
    const { wealth, reputation, education, health } = req.body || {};
    db.prepare('UPDATE characters SET wealth=COALESCE(?,wealth), reputation=COALESCE(?,reputation), education=COALESCE(?,education), health=COALESCE(?,health) WHERE user_id=?')
      .run(wealth ?? null, reputation ?? null, education ?? null, health ?? null, req.userId);
    res.json({ ok: true });
  });
  app.post('/api/test/reset-clock', (req, res) => {
    db.prepare('UPDATE world_clock SET year=1600, month=1, last_manual=? WHERE id=1').run(new Date(Date.now() - 120000).toISOString());
    res.json({ ok: true });
  });
}

app.listen(PORT, () => console.log(`ARGOS-1600 on :${PORT} — ${SKIP_LLM ? 'LLM skipped' : 'LLM on'}`));
