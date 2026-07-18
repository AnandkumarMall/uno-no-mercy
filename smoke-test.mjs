/**
 * smoke-test.mjs
 * End-to-end smoke test for UNO P2P game.
 * Tests: page loads, Phaser boots, Trystero connects, two tabs see each other,
 *        and player names resolve (no stuck "Joining…").
 *
 * Run: node smoke-test.mjs
 */

import { chromium } from 'playwright';

const BASE_URL   = 'http://localhost:3000/uno/';
const ROOM_CODE  = 'SMOKETEST';
const TIMEOUT    = 30_000;
const P2P_TIMEOUT = 20_000;

let browser;

async function run() {
  console.log('🚀 Launching Chromium...');
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });

  const errors = { a: [], b: [] };

  const ctxA = await browser.newContext({ permissions: ['microphone'] });
  const pageA = await ctxA.newPage();
  pageA.on('console', m => { if (m.type() === 'error' && !m.text().includes('Texture key')) console.log(`[A error] ${m.text()}`); });
  pageA.on('pageerror', e => { errors.a.push(e.message); console.log(`[A pageerror] ${e.message}`); });

  const ctxB = await browser.newContext({ permissions: ['microphone'] });
  const pageB = await ctxB.newPage();
  pageB.on('console', m => { if (m.type() === 'error' && !m.text().includes('Texture key')) console.log(`[B error] ${m.text()}`); });
  pageB.on('pageerror', e => { errors.b.push(e.message); console.log(`[B pageerror] ${e.message}`); });

  const results = [];

  // ── 1: Pages load ────────────────────────────────────────
  console.log('\n[1/7] Loading pages...');
  await Promise.all([
    pageA.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT }),
    pageB.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT }),
  ]);
  results.push({ test: 'Pages load (HTTP 200)', pass: true });
  console.log('  ✅ Both pages loaded');

  // ── 2: Phaser canvas ─────────────────────────────────────
  console.log('\n[2/7] Checking Phaser canvas renders...');
  await Promise.all([
    pageA.waitForSelector('canvas', { timeout: TIMEOUT }),
    pageB.waitForSelector('canvas', { timeout: TIMEOUT }),
  ]);
  results.push({ test: 'Phaser canvas renders', pass: true });
  console.log('  ✅ Canvas found in both tabs');

  // ── 3: Lobby UI ───────────────────────────────────────────
  console.log('\n[3/7] Waiting for Lobby UI...');
  await Promise.all([
    pageA.waitForSelector('#lobby-root', { timeout: TIMEOUT }),
    pageB.waitForSelector('#lobby-root', { timeout: TIMEOUT }),
  ]);
  results.push({ test: 'Lobby UI appears', pass: true });
  console.log('  ✅ Lobby UI visible in both tabs');

  // ── 4: Tab A joins ────────────────────────────────────────
  console.log('\n[4/7] Tab A joins room as "Alice"...');
  await pageA.fill('#inp-name', 'Alice');
  await pageA.fill('#inp-room', ROOM_CODE);
  await pageA.click('#btn-join');
  await pageA.waitForFunction(
    () => document.getElementById('status-text')?.textContent?.includes('In room'),
    { timeout: TIMEOUT }
  );
  const statusA = await pageA.$eval('#status-text', el => el.textContent);
  results.push({ test: 'Tab A joins room', pass: statusA.includes('In room'), detail: statusA.trim() });
  console.log(`  ✅ Tab A: "${statusA.trim()}"`);

  // ── 5: Tab B joins ────────────────────────────────────────
  console.log('\n[5/7] Tab B joins room as "Bob"...');
  await pageB.fill('#inp-name', 'Bob');
  await pageB.fill('#inp-room', ROOM_CODE);
  await pageB.click('#btn-join');
  await pageB.waitForFunction(
    () => document.getElementById('status-text')?.textContent?.includes('In room'),
    { timeout: TIMEOUT }
  );
  const statusB = await pageB.$eval('#status-text', el => el.textContent);
  results.push({ test: 'Tab B joins room', pass: statusB.includes('In room'), detail: statusB.trim() });
  console.log(`  ✅ Tab B: "${statusB.trim()}"`);

  // ── 6: P2P peer discovery ─────────────────────────────────
  console.log('\n[6/7] Waiting for P2P peer discovery...');
  let peerDiscovered = false;
  try {
    await pageA.waitForFunction(
      () => document.getElementById('player-list')?.children.length >= 2,
      { timeout: P2P_TIMEOUT }
    );
    peerDiscovered = true;
  } catch {
    const n = await pageA.$eval('#player-list', el => el.children.length).catch(() => 0);
    console.log(`  ⚠️  Timeout — player list has ${n} pill(s)`);
  }
  results.push({ test: 'P2P peer discovery', pass: peerDiscovered });
  console.log(`  ${peerDiscovered ? '✅' : '❌'} Peer discovery`);

  // ── 7: Player names resolve (no "Joining…" stuck) ─────────
  console.log('\n[7/7] Verifying player names resolved correctly...');
  let namesResolved = false;
  let nameDetail = '';
  if (peerDiscovered) {
    try {
      // Wait up to 5s for "Joining…" to be replaced by the real name
      await pageA.waitForFunction(
        () => {
          const pills = [...document.getElementById('player-list').children];
          return pills.length >= 2 && pills.every(p => !p.textContent.includes('Joining'));
        },
        { timeout: 5000 }
      );
      // Read the actual names shown in Tab A's player list
      const names = await pageA.$$eval('#player-list > div', els =>
        els.map(e => e.textContent.trim().replace(/\s+/g, ' '))
      );
      namesResolved = names.some(n => n.includes('Alice')) && names.some(n => n.includes('Bob'));
      nameDetail = names.join(' | ');
    } catch {
      const names = await pageA.$$eval('#player-list > div', els =>
        els.map(e => e.textContent.trim().replace(/\s+/g, ' '))
      ).catch(() => []);
      nameDetail = names.join(' | ') || '(could not read)';
    }
  }
  results.push({ test: 'Player names resolve (no stuck "Joining…")', pass: namesResolved, detail: nameDetail });
  console.log(`  ${namesResolved ? '✅' : '❌'} Names: ${nameDetail}`);

  // ── JS errors ─────────────────────────────────────────────
  const criticalErrors = [...errors.a, ...errors.b].filter(e => !e.includes('Texture key'));
  results.push({ test: 'No critical JS errors', pass: criticalErrors.length === 0, detail: criticalErrors.join(' | ') || 'none' });

  // ── Summary ───────────────────────────────────────────────
  console.log('\n' + '─'.repeat(64));
  console.log('RESULTS:');
  let allPassed = true;
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`  ${icon} ${r.test}${r.detail ? ` — ${r.detail}` : ''}`);
    if (!r.pass) allPassed = false;
  }
  console.log('─'.repeat(64));
  console.log(allPassed ? '\n🎉 ALL TESTS PASSED' : '\n💥 SOME TESTS FAILED');
  return allPassed;
}

run()
  .then(passed => { browser?.close(); process.exit(passed ? 0 : 1); })
  .catch(err => { console.error('\n💥 Crashed:', err.message); browser?.close(); process.exit(1); });
