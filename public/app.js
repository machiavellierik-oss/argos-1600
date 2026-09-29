// ARGOS 1600 — واجهة اللعبة
const $ = (s) => document.querySelector(s);
const app = $('#app'), nav = $('#bottomnav');

async function api(method, path, body) {
  const r = await fetch(path, {
    method, credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let ME = null, COUNTRIES = [], CHAR = null;

function bar(pct, cls) {
  return `<div class="bar b-${cls}"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
}
function showNav(on) { nav.classList.toggle('hidden', !on); }
function navOn(route) {
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.r === route));
}

// ---------- الصفحات ----------
async function pAccount() {
  navOn('account');
  if (!ME) {
    app.innerHTML = `
    <div class="hero"><div class="logo">🏺</div><h1>أرجوس 1600</h1>
    <p class="tag">حياة عالم مفتوح… سنة 1600 ميلادية. وُلد من جديد واشق طريقك من الصفر إلى المجد.</p></div>
    <div class="card">
      <h2>تسجيل الدخول</h2>
      <div id="msg"></div>
      <label>اسم المستخدم</label><input id="u" maxlength="20">
      <label>كلمة السر</label><input id="p" type="password">
      <button id="login">دخول</button>
      <button id="reg" class="ghost">حساب جديد</button>
    </div>`;
    $('#login').onclick = () => doAuth('login');
    $('#reg').onclick = () => doAuth('register');
  } else {
    app.innerHTML = `
    <h1>👤 حسابي</h1>
    <div class="card"><div class="row"><span class="lbl">المستخدم</span><span class="val">${esc(ME.username)}</span></div></div>
    <button id="out" class="ghost">تسجيل الخروج</button>`;
    $('#out').onclick = async () => { await api('POST', '/api/logout'); location.reload(); };
  }
}
async function doAuth(which) {
  const username = $('#u').value.trim(), password = $('#p').value;
  const r = await api('POST', '/api/' + which, { username, password });
  if (!r.ok) { $('#msg').innerHTML = `<div class="err">${esc(r.error)}</div>`; return; }
  location.reload();
}

async function pCreate() {
  navOn('');
  if (!COUNTRIES.length) COUNTRIES = (await api('GET', '/api/countries')).countries || [];
  const c0 = COUNTRIES[0];
  app.innerHTML = `
  <div class="hero"><div class="logo">🌟</div><h1>صمّم شخصيتك</h1>
  <p class="tag">سنة 1600م… تُولد من جديد وعمرك 16 سنة. اختر أين تبدأ حياتك.</p></div>
  <div class="card">
    <div id="msg"></div>
    <label>اسم الشخصية</label><input id="cname" maxlength="40" placeholder="مثال: حسن الفاسي">
    <label>الجنس</label><select id="cgender"><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select>
    <label>الدولة</label><select id="ccountry">${COUNTRIES.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select>
    <label>مدينة الميلاد</label><select id="ccity"></select>
    <button id="birth">🌟 وُلد وابدأ الحياة</button>
  </div>`;
  const fillCities = () => {
    const c = COUNTRIES.find((x) => x.name === $('#ccountry').value);
    $('#ccity').innerHTML = c.cities.map((t) => `<option>${esc(t)}</option>`).join('');
  };
  $('#ccountry').onchange = fillCities; fillCities();
  $('#birth').onclick = async () => {
    const btn = $('#birth'); btn.disabled = true; btn.textContent = '⏳ تُنسج أقدارك…';
    const r = await api('POST', '/api/character', {
      name: $('#cname').value.trim(), gender: $('#cgender').value,
      country: $('#ccountry').value, birth_city: $('#ccity').value,
    });
    if (!r.ok) { $('#msg').innerHTML = `<div class="err">${esc(r.error)}</div>`; btn.disabled = false; btn.textContent = '🌟 وُلد وابدأ الحياة'; return; }
    showBirthCard(r.character);
  };
}
function showBirthCard(ch) {
  showNav(true);
  app.innerHTML = `
  <div class="hero"><div class="logo">🎂</div><h1>وُلد ${esc(ch.name)}!</h1>
  <p class="tag">${esc(ch.birth_city)} — ${esc(ch.country)} | طبقة: ${esc(ch.social_class)}</p></div>
  <div class="card glow"><h2>📖 خلفية قصتك</h2><div class="story">${esc(ch.backstory)}</div></div>
  <div class="card"><h2>👨‍👩‍👧 عائلتك</h2>
    ${ch.family.map((f) => `<div class="fam"><span>${esc(f.name)}</span><span class="rel">${esc(f.relation)} · ${f.age} سنة</span></div>`).join('')}
  </div>
  <button onclick="location.hash='#/life'">ابدأ حياتك ⚔️</button>`;
}

async function loadChar() {
  const r = await api('GET', '/api/character');
  CHAR = r.character || null;
  return CHAR;
}

async function pLife() {
  navOn('life');
  const ch = await loadChar();
  if (!ch) { location.hash = '#/create'; return; }
  if (!ch.alive) {
    app.innerHTML = `
    <div class="tombstone"><div class="rip">⚰️</div>
    <h1>هنا يرقد ${esc(ch.name)}</h1>
    <p class="tag">${esc(ch.death_cause)}<br>عاش ${ch.age_years} سنة · ${esc(ch.clock_label)}</p>
    <div class="card"><div class="story">${esc(ch.backstory)}</div></div>
    <button id="reborn">🌟 وُلد من جديد بشخصية أخرى</button></div>`;
    $('#reborn').onclick = async () => { await api('POST', '/api/reborn'); location.hash = '#/create'; location.reload(); };
    return;
  }
  const cities = (COUNTRIES.find((c) => c.name === ch.country) || { cities: [] }).cities;
  app.innerHTML = `
  <div class="clock"><div class="dt">📅 ${esc(ch.clock_label)}</div><div class="small">كل ساعة حقيقية = شهر في اللعبة</div></div>
  <div class="card glow">
    <h1 style="margin:0">${esc(ch.name)} <span class="small">${ch.age_years} سنة</span></h1>
    <div class="small">${esc(ch.occupation)} · ${esc(ch.current_city)} · ${esc(ch.country)}</div>
    <div class="stats" style="margin-top:10px">
      <div class="stat"><div class="v">${ch.wealth}</div><div class="k">💰 الثروة</div></div>
      <div class="stat"><div class="v">${ch.health}</div><div class="k">❤️ الصحة</div></div>
    </div>
    <div style="margin-top:8px"><div class="row"><span class="lbl">⭐ السمعة ${ch.reputation}</span></div>${bar(ch.reputation, 'gold')}</div>
    <div style="margin-top:6px"><div class="row"><span class="lbl">📚 التعليم ${ch.education}</span></div>${bar(ch.education, 'blue')}</div>
  </div>
  <div id="msg"></div>
  <button id="adv">⏭️ تقدّم شهرًا</button>
  <div class="actions" style="margin-top:8px">
    <button id="study" class="ghost">📚 دراسة (15💰)</button>
    <button id="rest" class="ghost">🛌 راحة وعلاج (10💰)</button>
  </div>
  <div class="card" style="margin-top:10px"><h2>🧳 السفر</h2>
    <div class="row"><select id="tcity" style="margin:0">${cities.filter((t) => t !== ch.current_city).map((t) => `<option>${esc(t)}</option>`).join('')}</select></div>
    <button id="travel" class="ghost">سافر (25💰)</button>
  </div>`;
  const msg = (t, ok) => { $('#msg').innerHTML = `<div class="${ok ? 'okmsg' : 'err'}">${t}</div>`; };
  $('#adv').onclick = async () => {
    const b = $('#adv'); b.disabled = true;
    const r = await api('POST', '/api/advance');
    if (!r.ok) msg(esc(r.error)); else { await pLife(); return; }
    b.disabled = false;
  };
  $('#study').onclick = async () => { const r = await api('POST', '/api/study'); r.ok ? pLife() : msg(esc(r.error)); };
  $('#rest').onclick = async () => { const r = await api('POST', '/api/rest'); r.ok ? pLife() : msg(esc(r.error)); };
  $('#travel').onclick = async () => {
    const r = await api('POST', '/api/travel', { city: $('#tcity').value });
    r.ok ? pLife() : msg(esc(r.error));
  };
}

async function pCareer() {
  navOn('career');
  const ch = await loadChar();
  if (!ch) { location.hash = '#/create'; return; }
  const r = await api('GET', '/api/careers');
  if (!r.ok) { app.innerHTML = `<div class="err">${esc(r.error)}</div>`; return; }
  app.innerHTML = `<h1>💼 سلّم المناصب</h1><p class="tag">${esc(ch.country)}</p><div id="msg"></div>` +
    r.ladder.map((s) => `
    <div class="step ${s.current ? 'cur' : ''} ${s.reached && !s.current ? 'done' : ''}">
      <div class="n">${s.reached ? '✓' : s.index + 1}</div>
      <div style="flex:1"><b>${esc(s.title)}</b>
        <div class="req">💰 ${s.minWealth} · ⭐ ${s.minRep} · 📚 ${s.minEdu} · دخل ${s.income}/شهر</div>
      </div>
      ${s.eligible ? '<button id="promo" style="width:auto;margin:0;padding:8px 14px">ترقَّ ⬆️</button>' : ''}
    </div>`).join('');
  const pb = $('#promo');
  if (pb) pb.onclick = async () => {
    const pr = await api('POST', '/api/promote');
    if (!pr.ok) $('#msg').innerHTML = `<div class="err">${esc(pr.error)}</div>`;
    else pCareer();
  };
}

async function pFamily() {
  navOn('family');
  const ch = await loadChar();
  if (!ch) { location.hash = '#/create'; return; }
  app.innerHTML = `<h1>👨‍👩‍👧 العائلة</h1>
  <div class="card"><h2>📖 خلفية قصتك</h2><div class="story">${esc(ch.backstory)}</div></div>
  <div class="card">
    ${ch.family.map((f) => `<div class="fam ${f.alive ? '' : 'dead'}">
      <span>${f.alive ? '' : '⚰️ '}${esc(f.name)}<div class="small">${esc(f.occupation || '')}</div></span>
      <span class="rel">${esc(f.relation)} · ${f.age} سنة</span></div>`).join('')}
  </div>`;
}

async function pEvents() {
  navOn('events');
  const ch = await loadChar();
  if (!ch) { location.hash = '#/create'; return; }
  const r = await api('GET', '/api/events');
  app.innerHTML = `<h1>📜 سجل حياتك</h1>` +
    (r.events.length ? r.events.map((e) => `
    <div class="ev"><div class="t">${esc(e.title)}</div>
    <div class="d">${esc(fmtEvDate(e))}</div><div class="b">${esc(e.body)}</div></div>`).join('')
    : '<div class="card">لا أحداث بعد — تقدّم شهرًا لتبدأ حكايتك.</div>');
}
const EV_MONTHS = ['محرم','صفر','ربيع الأول','ربيع الثاني','جمادى الأولى','جمادى الثانية','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
function fmtEvDate(e) { return `${EV_MONTHS[(e.month - 1) % 12]} ${e.year}م`; }

// ---------- الراوتر ----------
const routes = { '/create': pCreate, '/life': pLife, '/career': pCareer, '/family': pFamily, '/events': pEvents, '/account': pAccount };
async function router() {
  const me = await api('GET', '/api/me');
  ME = me.user;
  if (!ME) { showNav(false); if (location.hash !== '#/account') location.hash = '#/account'; await pAccount(); return; }
  showNav(true);
  const has = me.hasCharacter;
  let h = location.hash.replace('#', '') || '/life';
  if (!has && h !== '/create' && h !== '/account') h = '/create';
  if (has && h === '/create') h = '/life';
  (routes[h] || pLife)();
}
window.addEventListener('hashchange', router);
router();
