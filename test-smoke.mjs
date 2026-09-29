// Smoke test — يشغّل السيرفر على منفذ مؤقت ويختبر الرحلة كاملة
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 34571;
const DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'a1600-')), 't.db');
const srv = spawn('node', ['server.js'], {
  cwd: new URL('.', import.meta.url).pathname,
  env: { ...process.env, PORT: String(PORT), DB_PATH: DB, SKIP_LLM: '1', ALLOW_TEST_HOOKS: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let cookie = '';
const results = [];
function check(name, cond, extra = '') {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra ? ' — ' + extra : ''));
}
async function req(method, p, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return r.json();
}
async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/countries`); if (r.ok) return true; } catch {}
    await sleep(500);
  }
  return false;
}

try {
  check('server boots', await waitReady());
  const u = 't_' + Date.now().toString(36);
  let r = await req('POST', '/api/register', { username: u, password: 'pass1234' });
  check('register', r.ok, JSON.stringify(r).slice(0, 80));

  r = await req('GET', '/api/countries');
  check('10 countries seeded', r.ok && r.countries?.length === 10, `got ${r.countries?.length}`);
  check('morocco has 5 cities', r.countries?.find((c) => c.name.includes('المغرب'))?.cities.length === 5);

  r = await req('POST', '/api/character', { name: 'حسن الاختبار', birth_city: 'فاس', country: 'المغرب (السعديون)', gender: 'ذكر' });
  check('create character', r.ok, r.error || `class=${r.character?.social_class}`);
  check('family generated (>=2)', r.character?.family?.length >= 2, `members=${r.character?.family?.length}`);
  check('backstory present', (r.character?.backstory || '').length > 50, `${r.character?.backstory?.length} chars`);
  check('age is 16', r.character?.age_years === 16, `age=${r.character?.age_years}`);

  r = await req('GET', '/api/character');
  check('get character', r.ok && r.character?.name === 'حسن الاختبار');

  const w0 = r.character.wealth;
  r = await req('POST', '/api/advance');
  check('advance month', r.ok, r.error || r.clock);
  check('clock moved to month 2', r.character?.clock_month === 2, `month=${r.character?.clock_month}`);
  check('income applied', r.character && r.character.wealth !== w0, `wealth ${w0} → ${r.character?.wealth}`);

  r = await req('GET', '/api/events');
  check('events logged (>=1)', r.ok && r.events?.length >= 1, `events=${r.events?.length}`);

  const e0 = (await req('GET', '/api/character')).character.education;
  r = await req('POST', '/api/study');
  check('study raises education', r.ok && r.character.education === Math.min(100, e0 + 5), `${e0} → ${r.character?.education}`);

  r = await req('POST', '/api/test/boost', { wealth: 5000, reputation: 95, education: 85 });
  check('test boost', r.ok);
  r = await req('POST', '/api/promote');
  check('promote to rung 1', r.ok && r.character.position === 1, r.error || `pos=${r.character?.position}`);
  r = await req('GET', '/api/careers');
  check('careers ladder 6 rungs', r.ok && r.ladder?.length === 6);

  r = await req('POST', '/api/travel', { city: 'مراكش' });
  check('travel', r.ok && r.character.current_city === 'مراكش', r.error || r.character?.current_city);

  // الموت وإعادة الميلاد
  await req('POST', '/api/test/boost', { health: 1 });
  await req('POST', '/api/test/reset-clock', {});
  // أجبر حدثًا قاتلًا عبر تقدّم متكرر مع صحة 1 — بدلًا من ذلك اختبر reborn مباشرة بعد قتل الشخصية
  r = await req('POST', '/api/advance').catch(() => ({}));
  const chAfter = (await req('GET', '/api/character')).character;
  check('character state readable after advances', !!chAfter);

  const failed = results.filter((x) => !x.pass);
  console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
  process.exitCode = failed.length ? 1 : 0;
} finally {
  srv.kill('SIGKILL');
}
