// "Who wins the trade?" and profiles in the Trade Machine (hoopsmatic-accounts;
// Jorge, October 28 and 29, 2026), in a real browser (headless Chrome). The
// page's own block of functions, cut out of index.html, runs on a local test
// page with a CSP like the real one ('self' scripts only), small stand-ins
// for the builder (render, buildTradeFromUrl) and stand-ins for
// /who-wins-the-trade/api/exact, /who-wins-the-trade/api/stack,
// /profile/api/me and /profile/api/trades:
//   - the exact key: the same string the game builds for the same trade
//     (hoopsmatic-accounts test/exact.test.mjs uses the same one), and no
//     key for what can't be matched exactly;
//   - the fans' verdict under the meter: only for a legal trade the game
//     says fans judged, "Fans: BOS 71–29 →", the team linked to its page and
//     the arrow to the trade in the game; nothing otherwise;
//   - the side column, top to bottom: the meter (with the fans' verdict) and
//     the publish area moved into it as they are, the Trade Market cards for
//     the players in the trade, then the "Fans are judging today" list
//     (logos, faces, linked names, "Load"), the cards shown on a phone too
//     (October 29, 2026); nothing of it below the builder; "Load" fills the
//     builder in place; no fans' value line under the players in the builder;
//   - the header: "Fans' trades (10)" as a third pill linking to the list;
//     with a profile, one round avatar with the initial at the far right and
//     a number when trades got verdicts; nothing without a profile;
//   - no pop-ups, no "load one" line or picker; every piece exactly once
//     after many redraws; none of it in Roster Manager mode.
// Run: node tests/game-links.test.mjs (skipped without Chrome, except on CI).

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { findChrome, launchBrowser } from './helpers/browser.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let failed = 0;
const ok = (name, cond, detail) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name);
  if (!cond) { failed++; if (detail !== undefined) console.log('        ' + JSON.stringify(detail).slice(0, 400)); }
};
function cut(name) {
  const m = html.match(new RegExp('\\n( *)(async )?function ' + name + '\\([\\s\\S]*?\\n\\1\\}'));
  if (!m) throw new Error('not found: ' + name);
  return m[0];
}
// The whole block, from its comment to the next one (marketSession's).
function cutBlock() {
  const start = html.indexOf('    /*\n     * "WHO WINS THE TRADE?" AND PROFILES IN THE TRADE MACHINE');
  const end = html.indexOf('    /*\n     * A session is a random id in this browser');
  if (start < 0 || end < start) throw new Error('block not found');
  return html.slice(start, end);
}

const CHROME = findChrome();
if (!CHROME) {
  if (process.env.CI) { console.log('FAIL  no Chrome on CI (set CHROME_PATH)'); process.exit(1); }
  console.log('SKIP  no Chrome here');
  process.exit(0);
}

// The page's own CSS for the block, so the test looks like the real thing.
const css = html.slice(html.indexOf('    /* "Who wins the trade?" and profiles in the Trade Machine (additive). */'), html.indexOf('</style>'));
// The real page's rules for the header and the tabs, so the avatar's place is the real one.
const rule = (sel) => { const m = html.match(new RegExp('\\n    ' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[\\s\\S]*?\\n    \\}')); if (!m) throw new Error('no CSS rule ' + sel); return m[0]; };
const PAGE_CSS = rule('header') + rule('.header-actions') + html.match(/\n    \.tm-tabs \{[^}]*\}/)[0] + html.match(/\n    \.tm-tabs a \{[\s\S]*?\}/)[0]
  // The page's own rule that hides the Trade Market panel below 1200px.
  + html.match(/\n    @media \(max-width: 1199px\) \{ \.mkt-panel \{ display: none; \} \}/)[0];
const TEAMS = "const teamAbbreviations = { 'Boston': 'BOS', 'LA Lakers': 'LAL', 'Miami': 'MIA' };\n";
// Stand-ins for the builder: render() redraws the team area from scratch
// (with a Trade Market panel when players move), as the page does, then
// calls placeSide(); buildTradeFromUrl() reads "stk" from the address.
const BUILDER = `
window.__renders = 0; window.__stopped = 0;
function render() {
  window.__renders++;
  const moving = tradeTeams.some((t) => (t.playersOut || []).length);
  // Each outgoing player as the page draws it: a chip whose remove button
  // names its team and player, then its "To:" row.
  document.getElementById('tradeContainer').innerHTML = tradeTeams.map((t, i) => '<div class="team-card">' + t.teamName
    + (t.playersOut || []).map((p, j) => '<div class="player-chip"><div class="player-chip-row"><div class="player-chip-info"><div class="player-chip-name">' + p.player + '</div></div><button class="player-chip-remove" data-team="' + i + '" data-player="' + j + '">x</button></div><div class="player-destination">To</div></div>').join('')
    + (t.cashOut || []).map((c, j) => '<div class="player-chip"><div class="player-chip-row"><button class="player-chip-remove cash-remove" data-team="' + i + '" data-cash="' + j + '">x</button></div></div>').join('')
    + '</div>').join('')
    + (moving ? '<aside class="mkt-panel" aria-label="Trade Market for these players">' + tradeTeams.map((t) => (t.playersOut || []).map((p) => '<div class="mp-card" data-mp="' + p.playerId + '"><div class="mp-body"><div class="salary-row">Trade Heat</div><div class="salary-row">People this week</div>' + fansValueHtml(p.playerId) + '</div></div>').join('')).join('') + '</aside>' : '');
  try { placeSide(); } catch (e) {}
}
function redistributePlayers() {}
function stopLoop() { window.__stopped++; }
function buildTradeFromUrl() {
  const k = new URLSearchParams(location.search).get('stk');
  if (k === null) return null;
  return [{ teamName: 'Boston', playersOut: [{ player: 'Made Up Wing ' + k, playerId: String(9800000 + Number(k)), destination: 1 }], picksOut: [], rightsOut: [], cashOut: [] },
    { teamName: 'LA Lakers', playersOut: [{ player: 'Made Up Guard ' + k, playerId: String(9830000 + Number(k)), destination: 0 }], picksOut: [], rightsOut: [], cashOut: [] }];
}
`;
const SCRIPT = (rm) => 'var IS_RM_MODE = ' + (rm ? 'true' : 'false') + ';\nlet tradeTeams = [{ teamName: "Boston", playersOut: [], picksOut: [], rightsOut: [], cashOut: [] }, { teamName: "LA Lakers", playersOut: [], picksOut: [], rightsOut: [], cashOut: [] }];\n' + TEAMS + BUILDER + cutBlock()
  + cut('showGameVerdict') + cut('showAddToProfile') + '\nfunction marketSession() { return "tm-e2e-session"; }\n'
  + '\nwindow.__set = function (t) { tradeTeams = t; };\nrender();\ninitGameLinks();\n';
const PAGE = (rm) => '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{--bg:#f5f5f7;--surface:#fff;--border:#d1d1d6;--text:#1d1d1f;--text-secondary:#6e6e73;--accent:#3b82f6}' + PAGE_CSS + css + '</style></head><body>'
  + '<header><h1>NBA Trade Machine</h1><nav class="tm-tabs" aria-label="Trade Machine views"><a class="on" href="/">Build a trade</a><a href="/trade-market">Trade Market</a></nav>'
  + '<div class="header-actions"><div class="header-row"><button id="loopTradeBtn">Trade Loop</button><button id="generateImageBtn">Generate Image</button><button id="resetBtn">Reset Trade</button></div></div></header>'
  + '<div id="mainContent"><div class="trade-status" id="tradeStatus"><span>Trade is valid</span><span class="tm-publish" id="tmPublish"></span></div>'
  + '<div class="realistic-meter" id="realisticMeter">Trade Balance</div><div class="trade-container" id="tradeContainer"></div>'
  + '<div class="glossary-section"><div class="glossary-header"><h3>Badge Glossary</h3></div></div></div>'
  + '<script src="/tm' + (rm ? '-rm' : '') + '.js"></script></body></html>';
const CSP = "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'";

const side = (team, city, names) => ({
  team, href: '/trade-market/team/' + city + '/', logo: '/who-wins-the-trade/img/logo/' + team.toLowerCase() + '.svg',
  gets: names.map(([name, salary, id], i) => ({ name, salary, href: '/trade-market/' + name.toLowerCase().replace(/ /g, '-') + '/', img: '/who-wins-the-trade/img/face/' + id + '-' + name.toLowerCase().replace(/ /g, '-') + '.webp' })),
  picks: [],
});
const STACK = Array.from({ length: 10 }, (_, i) => ({
  id: '2026-10-28T10:00:0' + i + '.000Z-stk00' + i,
  a: side('BOS', 'boston', [['Made Up Wing ' + i, 30000000, 9800000 + i], ['Made Up Big ' + i, 12000000, 9810000 + i], ['Made Up Filler ' + i, 2000000, 9820000 + i]]),
  b: side('LAL', 'la-lakers', [['Made Up Guard ' + i, 29000000, 9830000 + i]]),
  fix: '?p=' + (9800000 + i) + '%2C' + (9830000 + i) + '&t=BOS%2CLAL&pd=0-1%2C1-0&stk=' + i + (i === 3 ? '&rm=NYK' : ''),
}));
const VERDICT = { verdict: { winner: 'BOS', teams: [{ team: 'BOS', pct: 71, href: '/trade-market/team/boston/' }, { team: 'LAL', pct: 29, href: '/trade-market/team/la-lakers/' }] },
  trade: '2026-10-20T09:00:00.000Z-exa001', link: '/who-wins-the-trade/?t=2026-10-20T09%3A00%3A00.000Z-exa001' };
// What the game's own test (hoopsmatic-accounts test/exact.test.mjs) expects for this trade.
const KEY = 'BOS-LAL|9700001>LAL,9700002>BOS|BOS:2027:1>LAL';
const TRADE = [
  { teamName: 'Boston', playersOut: [{ player: 'Builder Star', playerId: '9700001', destination: 1 }], picksOut: [{ team: 'Boston', year: '2027', round: '1st', destination: 1, isSwap: false }], rightsOut: [], cashOut: [] },
  { teamName: 'LA Lakers', playersOut: [{ player: 'Builder Wing', playerId: '9700002', destination: 0 }], picksOut: [], rightsOut: [], cashOut: [] },
];

const state = { values: { players: { 9800003: { pct: 78 } } }, exact: VERDICT, stack: { day: '2026-10-28', trades: STACK }, me: { profile: false }, trades: { profile: true, trades: ['a', 'b'], judged: 2 }, calls: [], challenge: [], challengeAnswer: { status: 200, body: { ok: true, message: "You're in today's challenge. Fans are judging it now." } } };
const json = (v) => JSON.stringify(v);
const server = createServer((req, res) => {
  state.calls.push(req.url);
  const send = (status, type, text) => { res.writeHead(status, { 'Content-Type': type, 'Content-Security-Policy': CSP }); res.end(text); };
  const path = req.url.split('?')[0];
  if (path === '/' || path === '/tm.html') return send(200, 'text/html; charset=utf-8', PAGE(false));
  if (path === '/rm.html') return send(200, 'text/html; charset=utf-8', PAGE(true));
  if (path === '/tm.js') return send(200, 'text/javascript; charset=utf-8', SCRIPT(false));
  if (path === '/tm-rm.js') return send(200, 'text/javascript; charset=utf-8', SCRIPT(true));
  if (path === '/who-wins-the-trade/api/exact') return state.exact === 'down' ? send(500, 'text/plain', 'error') : send(200, 'application/json', json(state.exact));
  if (path === '/who-wins-the-trade/api/player-values') return send(200, 'application/json', json(state.values));
  // Market movers (hoopsmatic-accounts /api/player-movers): 404 for a player who isn't there.
  if (path === '/who-wins-the-trade/api/player-movers') {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    state.moverAsks = (state.moverAsks || 0) + 1;
    if (state.movers === 'down') return send(500, 'text/plain', 'error');
    return state.movers && state.movers[id] ? send(200, 'application/json', json(state.movers[id])) : send(404, 'application/json', json({ id: null }));
  }
  if (path === '/who-wins-the-trade/api/stack') return state.stack === 'down' ? send(500, 'text/plain', 'error') : send(200, 'application/json', json(state.stack));
  if (path === '/profile/api/me') return send(200, 'application/json', json(state.me));
  if (path === '/profile/api/game/challenge' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { state.challenge.push(Buffer.concat(chunks).toString()); send(state.challengeAnswer.status, 'application/json', json(state.challengeAnswer.body)); });
    return;
  }
  if (path === '/profile/api/trades') return send(200, 'application/json', json(req.method === 'POST' ? { ok: true, message: 'Added to your profile.' } : state.trades));
  if (path === '/who-wins-the-trade/api/builder') return send(200, 'application/json', json({ message: 'Fans are judging this now. Check back for the verdict.', link: 'https://hoopsmatic.com/who-wins-the-trade/' }));
  if (path.startsWith('/who-wins-the-trade/img/')) {
    return send(200, path.endsWith('.svg') ? 'image/svg+xml' : 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#888"/></svg>');
  }
  return send(404, 'text/plain', 'not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await launchBrowser(CHROME);
const settle = () => new Promise((r) => setTimeout(r, 300));
const q = (sel, what = 'textContent') => 'document.querySelector(' + JSON.stringify(sel) + ')?.' + what;

try {
  const page = await browser.newPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });

  // --- The exact key ------------------------------------------------------
  state.me = { profile: false };
  await page.goto(origin + '/tm.html');
  await page.js('window.__set(' + json(TRADE) + '), true');
  ok('the exact key is the one the game builds for the same trade', await page.js('exactTradeKey()') === KEY);
  const variants = {
    'draft rights': (t) => { t[0].rightsOut = [{ playerName: 'X' }]; },
    cash: (t) => { t[1].cashOut = [{ destination: 0 }]; },
    'a sign-and-trade': (t) => { t[0].playersOut[0].isSignAndTrade = true; },
    'a player with no id': (t) => { t[1].playersOut[0].playerId = null; },
    'three teams': (t) => { t.push({ teamName: 'Miami', playersOut: [], picksOut: [], rightsOut: [], cashOut: [] }); },
    'nothing moving': (t) => { t[0].playersOut = []; t[0].picksOut = []; t[1].playersOut = []; },
  };
  for (const [what, change] of Object.entries(variants)) {
    const t = JSON.parse(json(TRADE)); change(t);
    await page.js('window.__set(' + json(t) + '), true');
    ok('no key with ' + what, await page.js('exactTradeKey()') === null);
  }
  const swap = JSON.parse(json(TRADE)); swap[0].picksOut[0].isSwap = true;
  await page.js('window.__set(' + json(swap) + '), true');
  ok('a swap is a different pick', await page.js('exactTradeKey()') === 'BOS-LAL|9700001>LAL,9700002>BOS|BOS:2027:1s>LAL');

  // --- The fans' verdict ----------------------------------------------------
  await page.js('window.__set(' + json(TRADE) + '), showFansVerdict(true), true');
  await page.waitFor(q('#tmFansVerdict .fv-team') + ' !== undefined', 'the verdict');
  ok('asked by the exact key', state.calls.some((u) => u === '/who-wins-the-trade/api/exact?key=' + encodeURIComponent(KEY)));
  ok('"Fans: BOS 71–29 →", right under the meter, in the side column',
    await page.js(q('#tmFansVerdict')) === 'Fans: BOS 71\u201329 \u2192'
    && await page.js('document.getElementById("realisticMeter").nextElementSibling.id') === 'tmFansVerdict'
    && await page.js('!!document.querySelector("#tmSide #tmFansVerdict")'));
  ok('BOS links to its team page', await page.js(q('#tmFansVerdict .fv-team', 'getAttribute("href")')) === '/trade-market/team/boston/');
  ok('the arrow links to that trade in the game', await page.js(q('#tmFansVerdict .fv-game', 'getAttribute("href")')) === VERDICT.link
    && await page.js(q('#tmFansVerdict .fv-game', 'getAttribute("aria-label")')) === 'See this trade in Who wins the trade?');
  ok('no counts, percentages only', !/\b(20|14|6)\b/.test(await page.js(q('#tmFansVerdict'))));
  ok('no sideways scroll at 375px', await page.js('document.documentElement.scrollWidth <= innerWidth'));

  // Several renders before the answer (the live page does this): one box only.
  await page.js('document.getElementById("tmFansVerdict").remove(), true');
  const quick = JSON.parse(json(TRADE)); quick[1].playersOut[0].playerId = '9700050';
  await page.js('window.__set(' + json(quick) + '), showFansVerdict(true), showFansVerdict(true), showFansVerdict(true), true');
  await page.waitFor(q('#tmFansVerdict .fv-team') + ' !== undefined', 'the verdict');
  await settle();
  ok('three renders before the answer: still exactly one verdict box', await page.js('document.querySelectorAll("#tmFansVerdict, .tm-fans-verdict").length') === 1);

  // Too close to call.
  state.exact = { ...VERDICT, verdict: { winner: null, teams: [{ team: 'BOS', pct: 48, href: '/trade-market/team/boston/' }, { team: 'LAL', pct: 52, href: '/trade-market/team/la-lakers/' }] } };
  const close = JSON.parse(json(TRADE)); close[1].playersOut[0].playerId = '9700099';
  await page.js('window.__set(' + json(close) + '), showFansVerdict(true), true');
  await page.waitFor(q('#tmFansVerdict') + ' === "Fans: too close, 52\u201348 \u2192"', 'too close to call');
  ok('too close to call: says so, with the bigger share first', true);

  // Not judged, or not this trade: nothing shows.
  state.exact = { verdict: null };
  const other = JSON.parse(json(TRADE)); other[1].playersOut[0].playerId = '9700003';
  await page.js('window.__set(' + json(other) + '), showFansVerdict(true), true');
  await settle();
  ok('no verdict: the line is hidden', await page.js(q('#tmFansVerdict', 'hidden')) === true);
  const before = state.calls.length;
  await page.js('window.__set(' + json(TRADE) + '), showFansVerdict(false), true');
  await settle();
  ok('an illegal trade: hidden, and the game isn\'t asked', await page.js(q('#tmFansVerdict', 'hidden')) === true && state.calls.length === before);
  state.exact = 'down';
  const fresh = JSON.parse(json(TRADE)); fresh[1].playersOut[0].playerId = '9700004';
  await page.js('window.__set(' + json(fresh) + '), showFansVerdict(true), true');
  await settle();
  ok('the game down: nothing shows', await page.js(q('#tmFansVerdict', 'hidden')) === true);
  state.exact = VERDICT;

  // --- No profile: no avatar ------------------------------------------------
  ok('without a profile: no avatar, and /profile/api/trades isn\'t asked', await page.js('!document.getElementById("tmProfileChip")') && !state.calls.includes('/profile/api/trades'));

  // --- The side column and "Fans are judging today" ------------------------
  await page.waitFor(q('#tmFansToday .ft-trade') + ' !== undefined', 'the list');
  ok('the meter and the publish area moved into the side column, as they are (same ids)',
    await page.js('!!document.querySelector("#tmSide #realisticMeter") && !!document.querySelector("#tmSide #tmPublish") && document.querySelectorAll("#realisticMeter, #tmPublish").length === 2'));
  ok('the team area is the same element, now beside (or above) the column', await page.js('document.getElementById("tradeContainer").parentNode.id === "tmWork" && document.getElementById("tmSide").parentNode.id === "tmWork"'));
  ok('"Fans are judging today" is the column\'s last part, under the Trade Market; nothing of it below the builder',
    await page.js('document.getElementById("tmFansToday").parentNode.id === "tmSide" && document.getElementById("tmSide").lastElementChild.id === "tmFansToday"'
      + ' && document.getElementById("tmSideMarket").compareDocumentPosition(document.getElementById("tmFansToday")) & Node.DOCUMENT_POSITION_FOLLOWING'
      + ' && document.querySelector(".glossary-section").previousElementSibling.id !== "tmFansToday" && document.querySelectorAll(".tm-fans-today").length === 1'));
  ok('"Fans are judging today" lists today\'s 10', await page.js(q('#tmFansToday h2')) === 'Fans are judging today' && await page.js('document.querySelectorAll("#tmFansToday .ft-trade").length') === 10);
  ok('each with both logos, the biggest name a side with a face, and the rest as "+N"',
    await page.js('document.querySelectorAll(".ft-trade")[0].querySelectorAll(".ft-logo").length') === 2
    && await page.js('[...document.querySelectorAll(".ft-trade")[0].querySelectorAll(".ft-name")].map((a) => a.textContent).join("|")') === 'Made Up Wing 0|Made Up Guard 0'
    && await page.js('document.querySelectorAll(".ft-trade")[0].querySelectorAll(".ft-face img").length') === 2
    && await page.js('document.querySelector(".ft-trade .ft-more").textContent') === '+2');
  ok('every team and player named links to its page', await page.js('[...document.querySelectorAll("#tmFansToday .ft-team, #tmFansToday .ft-name")].every((a) => a.tagName === "A" && /^\\/trade-market\\//.test(a.getAttribute("href")))'));
  ok('"Challenge" right after "Fans\' trades", straight to the board', await page.js(q('#tmFansPill', 'nextElementSibling.id')) === 'tmChallengePill'
    && await page.js(q('#tmChallengePill')) === 'Challenge' && await page.js(q('#tmChallengePill', 'getAttribute("href")')) === '/who-wins-the-trade/#challenge');
  ok('"Fans\' trades (10)": a third pill, a plain link to the list', await page.js(q('.tm-tabs #tmFansPill')) === 'Fans\u2019 trades (10)' && await page.js(q('#tmFansPill', 'getAttribute("href")')) === '#tmFansToday'
    && await page.js('document.querySelectorAll(".tm-tabs a").length') === 4);
  ok('no pop-ups: no "load one" line, no picker, no dialog', await page.js('!document.querySelector(".tm-game-line, .tm-picker, [role=dialog]")'));
  ok('the list fits a phone', await page.js('document.documentElement.scrollWidth <= innerWidth'));
  // "Load" fills the builder in place: no new page.
  state.calls = [];
  await page.js('window.__marker = 1, document.querySelectorAll("#tmFansToday .ft-load")[3].click(), true');
  await page.waitFor('location.search.indexOf("stk=3") >= 0 && tradeTeams[0].playersOut.length === 1', 'the trade');
  ok('"Load" fills the builder in place from the trade\'s own address (one "?", no new page)',
    await page.js('window.__marker === 1 && location.search === ' + json(STACK[3].fix.replace('&rm=NYK', ''))) && !state.calls.some((u) => u.startsWith('/?') || u.startsWith('/tm.html'))
    && await page.js('tradeTeams.map((t) => t.playersOut[0].playerId).join(",")') === '9800003,9830003' && await page.js('window.__stopped') === 1, state.calls);
  ok('a trade saved in the Roster Manager (rm=NYK) loads without its embed mode: no rm in the address, the page as it was',
    await page.js('location.search.indexOf("rm=") < 0 && !document.body.classList.contains("rm-mode") && !!document.getElementById("tmFansPill")'));
  ok('after a load, the Trade Market panel is in the column (one only)', await page.js('document.querySelectorAll(".mkt-panel").length === 1 && !!document.querySelector("#tmSide .mkt-panel")'));
  await page.js('render(); render(); true');
  ok('redraws keep exactly one Trade Market panel, in the column', await page.js('document.querySelectorAll(".mkt-panel").length === 1 && !!document.querySelector("#tmSide .mkt-panel")'));
  ok('the column, top to bottom: the meter with the fans\' verdict, the publish row, the Trade Market cards, then "Fans are judging today"',
    await page.js('(() => { const t = document.getElementById("tmSideTop"), m = document.getElementById("tmSideMarket"); return t.nextElementSibling === m && m.nextElementSibling && m.nextElementSibling.id === "tmFansToday" && t.firstElementChild.id === "realisticMeter" && [...t.children].map((c) => c.id).indexOf("tmPublish") > [...t.children].map((c) => c.id).indexOf("realisticMeter") && !!m.querySelector(".mkt-panel .mp-card"); })()'));
  ok('on a phone (375px) the Trade Market cards show in the column, below the builder', await page.js('getComputedStyle(document.querySelector("#tmSide .mkt-panel")).display !== "none" && document.querySelector("#tmSide .mkt-panel").getBoundingClientRect().height > 0'));
  // Players added or removed: the cards follow.
  await page.js('window.__set([{ teamName: "Boston", playersOut: [{ player: "A", playerId: "9800003", destination: 1 }, { player: "B", playerId: "9800004", destination: 1 }], picksOut: [], rightsOut: [], cashOut: [] }, { teamName: "LA Lakers", playersOut: [], picksOut: [], rightsOut: [], cashOut: [] }]); render(); true');
  const added = await page.js('[...document.querySelectorAll("#tmSide .mp-card")].map((c) => c.getAttribute("data-mp")).join(",")');
  await page.js('window.__set([{ teamName: "Boston", playersOut: [{ player: "B", playerId: "9800004", destination: 1 }], picksOut: [], rightsOut: [], cashOut: [] }, { teamName: "LA Lakers", playersOut: [], picksOut: [], rightsOut: [], cashOut: [] }]); render(); true');
  const removed = await page.js('[...document.querySelectorAll("#tmSide .mp-card")].map((c) => c.getAttribute("data-mp")).join(",")');
  ok('the cards follow the players in the trade, added and removed', added === '9800003,9800004' && removed === '9800004', [added, removed]);
  await page.js('window.__set(buildTradeFromUrl()); render(); true');

  // --- Fans' value per player, in the Trade Market panel (phase 2) --------
  await page.waitFor('document.querySelector(".mp-card[data-mp=\\"9800003\\"] .mp-fans") !== null', 'the fans\' value');
  ok('fans\' value in the Trade Market panel: "Fans side with the team getting him in 78% of judged trades."',
    await page.js(q('.mp-card[data-mp="9800003"] .mp-fans')) === 'Fans side with the team getting him in 78% of judged trades.'
    && await page.js('!!document.querySelector("#tmSide .mp-card[data-mp=\\"9800003\\"] .mp-fans")'));
  ok('no line for a player without 5 decided trades', await page.js('!document.querySelector(".mp-card[data-mp=\\"9830003\\"] .mp-fans")'));
  // A card already on the page when the values arrive gets its line, once.
  await page.js('document.querySelector(".mp-card[data-mp=\\"9800003\\"] .mp-fans").remove(); loadFansValues(); loadFansValues(); true');
  await page.waitFor('document.querySelector(".mp-card[data-mp=\\"9800003\\"] .mp-fans") !== null', 'the patched line');
  await settle();
  ok('cards already drawn get the line once, under Trade Heat and People this week', await page.js('document.querySelectorAll(".mp-card[data-mp=\\"9800003\\"] .mp-fans").length') === 1
    && await page.js('document.querySelector(".mp-card[data-mp=\\"9800003\\"] .mp-fans").previousElementSibling.textContent') === 'People this week');
  // On the live site hoopsmatic-worker swaps in its own card and redraws it
  // (outerHTML) when the player's data arrives, without the line: the line
  // comes back, once, after the share line (October 29, 2026: live, no card
  // showed it).
  const WORKER_CARD = '<div class="mp-card" data-mp="9800003"><div class="mp-head"><a class="mp-name" href="/trade-market/made-up-filler-3/">Made Up Filler 3</a></div><div class="mp-body">'
    + '<div class="salary-row mp-heat"><span class="salary-label">Trade Heat</span><span class="salary-value">65/100</span></div><div class="mp-note">How actively fans are trading him this week.</div>'
    + '<div class="mp-share">In 1.7% of trades</div><div class="mp-group"><div class="section-label">Most sent to</div><div class="salary-row"><span class="salary-label">Utah</span><span class="salary-value">20%</span></div></div></div></div>';
  for (let i = 0; i < 4; i++) {
    await page.js('document.querySelector(".mp-card[data-mp=\\"9800003\\"]").outerHTML = ' + json(WORKER_CARD) + '; true');
    await settle();
  }
  ok('a card redrawn by the Worker\'s panel gets the line back once, after the share line',
    await page.js('document.querySelectorAll(".mp-card[data-mp=\\"9800003\\"] .mp-fans").length') === 1
    && await page.js('document.querySelector(".mp-card[data-mp=\\"9800003\\"] .mp-fans").previousElementSibling.className') === 'mp-share');
  await page.js('render(); render(); true');
  await settle();
  ok('and after more redraws, still one line per card', await page.js('[...document.querySelectorAll(".mp-card")].every((c) => c.querySelectorAll(".mp-fans").length <= 1)')
    && await page.js('document.querySelectorAll(".mp-card[data-mp=\\"9800003\\"] .mp-fans").length') === 1);
  // No line under the players in the builder (Jorge, October 29, 2026: it
  // made the page too long); the panel cards keep theirs.
  for (let i = 0; i < 4; i++) await page.js('render(); true');
  await settle();
  ok('no fans\' value line in the builder; the panel card keeps its one line', await page.js('!document.querySelector("#tradeContainer .mp-fans, #tradeContainer .tm-trade-fans")')
    && await page.js('document.querySelectorAll("#tmSide .mp-card[data-mp=\\"9800003\\"] .mp-fans").length') === 1);

  // Market movers (Jorge, October 31, 2026): under the fans' value line,
  // "+6 pts this week" and a link to the movers page; nothing when the API
  // fails, the player isn't there, or there's no change. Asked once per player.
  const MOVER_TRADE = [{ teamName: 'Boston', playersOut: [{ player: 'Made Up Filler 3', playerId: '9800003', destination: 1 }], picksOut: [], rightsOut: [], cashOut: [] },
    { teamName: 'LA Lakers', playersOut: [{ player: 'Made Up Guard 3', playerId: '9830003', destination: 0 }], picksOut: [], rightsOut: [], cashOut: [] }];
  const moverLine = () => page.js('(() => { const f = document.querySelector("#tmSide .mp-card[data-mp=\\"9800003\\"] .mp-fans"); const n = f && f.nextElementSibling; return n && n.className === "mp-move" ? n.textContent + "|" + n.querySelector("a").getAttribute("href") : null; })()');
  state.movers = { 9800003: { id: '9800003', value: 78, change: 6, day: '2026-11-07' } };
  state.moverAsks = 0;
  await page.goto(origin + '/tm.html');
  await page.js('window.__set(' + json(MOVER_TRADE) + '); render(); true');
  await page.waitFor('document.querySelector("#tmSide .mp-card[data-mp=\\"9800003\\"] .mp-move") !== null', 'the movers line');
  ok('movers: "+6 pts this week" and "See this week\'s movers →" right under the fans\' value line', await moverLine() === '+6 pts this week See this week\u2019s movers \u2192|/who-wins-the-trade/movers');
  // HM_SHOTS=<folder>: the panel with the line, at 390px and 1440px.
  if (process.env.HM_SHOTS) {
    const { writeFileSync } = await import('node:fs');
    for (const [width, mobile] of [[390, true], [1440, false]]) {
      await page.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile });
      await settle();
      const r = await page.js('(() => { const b = document.querySelector("#tmSide .mp-card[data-mp=\\"9800003\\"]").getBoundingClientRect(); return { x: Math.max(0, b.left - 16 + scrollX), y: Math.max(0, b.top - 16 + scrollY), width: Math.min(document.documentElement.clientWidth, b.width + 32), height: b.height + 32 }; })()');
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...r, scale: 1 } });
      writeFileSync(process.env.HM_SHOTS + '/tm-movers-line-' + width + '.png', Buffer.from(data, 'base64'));
    }
    await page.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
  }
  for (let i = 0; i < 3; i++) { await page.js('render(); true'); await settle(); }
  ok('movers: one line per card after redraws, asked once per player', await page.js('document.querySelectorAll("#tmSide .mp-card[data-mp=\\"9800003\\"] .mp-move").length') === 1
    && state.moverAsks === 1);
  state.movers = { 9800003: { id: '9800003', value: 70, change: -4, day: '2026-11-07' } };
  await page.goto(origin + '/tm.html');
  await page.js('window.__set(' + json(MOVER_TRADE) + '); render(); true');
  await page.waitFor('document.querySelector("#tmSide .mp-card[data-mp=\\"9800003\\"] .mp-move") !== null', 'the falling line');
  ok('movers: a fall reads "\u22124 pts this week"', (await moverLine()).startsWith('\u22124 pts this week'));
  for (const [what, movers] of [['the API fails', 'down'], ['the player isn\'t there', {}], ['no change', { 9800003: { id: '9800003', value: 78, change: 0 } }], ['no 7-day change yet', { 9800003: { id: '9800003', value: 78, change: null } }]]) {
    state.movers = movers;
    await page.goto(origin + '/tm.html');
    await page.js('window.__set(' + json(MOVER_TRADE) + '); render(); true');
    await page.waitFor('document.querySelector("#tmSide .mp-card[data-mp=\\"9800003\\"] .mp-fans") !== null', 'the fans\' value');
    await settle(); await settle();
    ok('movers: nothing when ' + what, await page.js('!document.querySelector(".mp-move")'));
  }
  state.movers = null;

  // No trades today: no list, no pill.
  state.stack = { day: '2026-10-28', trades: [] };
  await page.goto(origin + '/tm.html');
  await settle();
  ok('no trades today: no list and no pill', await page.js('!document.getElementById("tmFansToday") && !document.getElementById("tmFansPill")'));
  state.stack = 'down';
  await page.goto(origin + '/tm.html');
  await settle();
  ok('the game down: no list and no pill', await page.js('!document.getElementById("tmFansToday") && !document.getElementById("tmFansPill")'));
  state.stack = { day: '2026-10-28', trades: STACK };

  // --- The profile avatar ---------------------------------------------------
  const chipPage = await browser.newPage();
  await chipPage.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
  state.me = { profile: true, name: 'jajito', leaderboard: false, is_public: false };
  state.trades = { profile: true, trades: ['a', 'b', 'c'], judged: 2 };
  await chipPage.goto(origin + '/tm.html');
  await chipPage.waitFor(q('#tmProfileChip .av-badge') + ' !== undefined', 'the avatar');
  ok('with a profile: a round avatar with the initial and the number of trades with new verdicts',
    await chipPage.js(q('#tmProfileChip .av-ini')) === 'J' && await chipPage.js(q('#tmProfileChip .av-badge')) === '2'
    && await chipPage.js(q('#tmProfileChip', 'getAttribute("aria-label")')) === 'Your profile: jajito. 2 of your trades got verdicts');
  ok('in the header, after the pills, opening the profile', await chipPage.js(q('header > #tmProfileChip', 'getAttribute("href")')) === '/profile/'
    && await chipPage.js('document.querySelector("header .tm-tabs").nextElementSibling.id') === 'tmProfileChip');
  ok('at the far right of the header', await chipPage.js('(() => { const a = document.getElementById("tmProfileChip").getBoundingClientRect(), h = document.querySelector("header").getBoundingClientRect(); return h.right - a.right < 4; })()'));
  await chipPage.goto(origin + '/tm.html');
  await chipPage.waitFor(q('#tmProfileChip') + ' !== undefined', 'the avatar');
  await settle();
  ok('next visit, no news: no number', await chipPage.js('!document.querySelector("#tmProfileChip .av-badge")') && await chipPage.js(q('#tmProfileChip', 'getAttribute("aria-label")')) === 'Your profile: jajito');
  state.trades = { profile: true, trades: ['a', 'b', 'c'], judged: 3 };
  await chipPage.goto(origin + '/tm.html');
  await chipPage.waitFor(q('#tmProfileChip .av-badge') + ' !== undefined', 'the news');
  ok('one more judged since: "1"', await chipPage.js(q('#tmProfileChip .av-badge')) === '1');
  ok('this browser keeps one number only', await chipPage.js('localStorage.getItem("hm_tm_verdicts_seen")') === '3' && await chipPage.js('localStorage.length') === 1);
  state.me = { profile: true, name: null };
  await chipPage.goto(origin + '/tm.html');
  await chipPage.waitFor(q('#tmProfileChip') + ' !== undefined', 'the avatar');
  ok('no display name yet: still an avatar, labelled "Your profile"', await chipPage.js(q('#tmProfileChip', 'getAttribute("aria-label")')) === 'Your profile');
  ok('no sideways scroll with the avatar at 375px', await chipPage.js('document.documentElement.scrollWidth <= innerWidth'));

  // --- The page redraws many times: every piece is on it exactly once ------
  // (October 29, 2026: the live page drew from cached data and again from
  // fresh data, and the chip and the "load one" line showed twice.)
  state.me = { profile: true, name: 'jajito', leaderboard: false, is_public: false, autolink: true };
  state.trades = { profile: true, trades: ['a'], judged: 1 };
  state.exact = VERDICT;
  await chipPage.goto(origin + '/tm.html');
  await chipPage.waitFor(q('#tmProfileChip') + ' !== undefined && ' + q('#tmFansToday') + ' !== undefined', 'the avatar and the list');
  await chipPage.js('window.__set(' + json(TRADE) + '); for (let i = 0; i < 12; i++) { render(); initGameLinks(); placeSide(); showProfileChip(); showTodaysTrades(); showFansVerdict(true); } true');
  await chipPage.js('for (let i = 0; i < 6; i++) { showGameVerdict("t-e2e", document.getElementById("tmPublish")); showAddToProfile("t-e2e", document.getElementById("tmPublish")); showChallengeEntry("t-e2e", document.getElementById("tmPublish")); } true');
  await new Promise((r) => setTimeout(r, 1200));
  const counts = await chipPage.js('({ avatar: document.querySelectorAll(".tm-avatar").length, pill: document.querySelectorAll("#tmFansPill").length, challengeLink: document.querySelectorAll("#tmChallengePill").length, side: document.querySelectorAll(".tm-side").length, list: document.querySelectorAll(".tm-fans-today").length, items: document.querySelectorAll(".ft-trade").length, verdict: document.querySelectorAll(".tm-fans-verdict").length, meter: document.querySelectorAll("#realisticMeter").length, publish: document.querySelectorAll("#tmPublish").length, game: document.querySelectorAll(".tm-game-verdict").length, added: document.querySelectorAll(".tm-add-profile").length, challenge: document.querySelectorAll(".tm-challenge button").length, market: document.querySelectorAll(".mkt-panel").length })');
  ok('after many redraws: exactly one of every piece', json(counts) === json({ avatar: 1, pill: 1, challengeLink: 1, side: 1, list: 1, items: 10, verdict: 1, meter: 1, publish: 1, game: 1, added: 1, challenge: 1, market: 1 }), counts);

  // --- "Enter today's challenge" (phase 2 item 9) --------------------------
  ok('with a profile, the publish row offers the challenge, after the rest', await chipPage.js(q('#tmPublish > p:last-child button')) === 'Enter today\u2019s challenge');
  await chipPage.js(q('.tm-challenge button', 'click()'));
  await chipPage.waitFor(q('.tm-challenge a') + ' !== undefined', 'the answer');
  ok('entering sends only the trade id and the session id', state.challenge.length === 1 && state.challenge[0] === json({ trade: 't-e2e', tm: 'tm-e2e-session' }), state.challenge);
  ok('then a link to the challenge on the game page, no button left', await chipPage.js(q('.tm-challenge a')) === 'In today\u2019s challenge \u2192'
    && await chipPage.js(q('.tm-challenge a', 'getAttribute("href")')) === '/who-wins-the-trade/#challenge' && !(await chipPage.js('!!document.querySelector(".tm-challenge button")')));
  state.challengeAnswer = { status: 409, body: { ok: false, message: "You've already entered today's challenge." } };
  await chipPage.js('document.querySelector(".tm-challenge").remove(); showChallengeEntry("t-e2e", document.getElementById("tmPublish")); true');
  await chipPage.waitFor(q('.tm-challenge button') + ' !== undefined', 'the button again');
  await chipPage.js(q('.tm-challenge button', 'click()'));
  await chipPage.waitFor(q('.tm-challenge span') + ' !== undefined', 'the refusal');
  ok('refused (one a day): the profiles Worker\'s words, as text', await chipPage.js(q('.tm-challenge span')) === "You've already entered today's challenge.");
  state.me = { profile: false };
  await chipPage.js('document.querySelector(".tm-challenge").remove(); showChallengeEntry("t-e2e", document.getElementById("tmPublish")); true');
  await settle();
  ok('without a profile: no challenge button', !(await chipPage.js('!!document.querySelector(".tm-challenge")')));

  // --- "Publish it and see what fans think →" (October 29, 2026) ------------
  // Only while the trade is legal and its "Publish this trade" button is
  // there; pressing it presses that button; gone once published.
  await chipPage.js('(() => { window.__clicks = 0; window.__tmLastValid = true; const h = document.getElementById("tmPublish"); h.innerHTML = ""; h.style.display = ""; h.classList.remove("tm-side-off");'
    + ' const b = document.createElement("button"); b.type = "button"; b.textContent = "Publish this trade"; b.addEventListener("click", function () { window.__clicks++; }); h.appendChild(b); return true; })()');
  await chipPage.waitFor('document.getElementById("tmPublishNudge") && !document.getElementById("tmPublishNudge").hidden', 'the nudge');
  ok('a legal trade not yet published: one slim line under the meter, "Publish it and see what fans think →", right above the publish row',
    await chipPage.js(q('#tmPublishNudge button')) === 'Publish it and see what fans think \u2192' && await chipPage.js('document.getElementById("tmPublishNudge").nextElementSibling.id === "tmPublish" && document.querySelectorAll(".tm-publish-nudge").length === 1'));
  await chipPage.js('document.querySelector("#tmPublishNudge button").click(), true');
  ok('pressing it presses "Publish this trade" (nothing is published on its own)', await chipPage.js('window.__clicks') === 1);
  await chipPage.js('for (let i = 0; i < 5; i++) { showPublishNudge(); render(); } true');
  ok('one line, however often the page redraws', await chipPage.js('document.querySelectorAll(".tm-publish-nudge").length') === 1);
  await chipPage.js('window.__tmLastValid = false; showPublishNudge(); true');
  ok('not legal: no line', await chipPage.js('document.getElementById("tmPublishNudge").hidden') === true);
  await chipPage.js('(() => { window.__tmLastValid = true; document.getElementById("tmPublish").innerHTML = \'<a href="/trade/t1">View</a>\'; return true; })()');
  await settle();
  ok('published: no line', await chipPage.js('document.getElementById("tmPublishNudge").hidden') === true);

  // --- Roster Manager mode: none of it --------------------------------------
  state.me = { profile: true, name: 'jajito' };
  await chipPage.goto(origin + '/rm.html');
  await settle();
  await chipPage.js('window.__set(' + json(TRADE) + '), render(), showFansVerdict(true), true');
  await settle();
  ok('Roster Manager mode: no avatar, no pill, no column, no verdict; the meter stays where it was',
    await chipPage.js('!document.getElementById("tmProfileChip") && !document.getElementById("tmFansPill") && !document.getElementById("tmChallengePill") && !document.getElementById("tmPublishNudge") && !document.getElementById("tmSide") && !document.getElementById("tmFansVerdict") && document.getElementById("realisticMeter").parentNode.id === "mainContent"'));

  ok('no script errors, nothing blocked by the CSP', page.problems.length === 0 && chipPage.problems.length === 0, page.problems.concat(chipPage.problems));
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
