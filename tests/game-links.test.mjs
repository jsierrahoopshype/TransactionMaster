// "Who wins the trade?" and profiles in the Trade Machine (hoopsmatic-accounts;
// Jorge, October 28, 2026), in a real browser (headless Chrome). The page's
// own block of functions, cut out of index.html, runs on a local test page
// with a CSP like the real one ('self' scripts only) and stand-ins for
// /who-wins-the-trade/api/exact, /who-wins-the-trade/api/stack,
// /profile/api/me and /profile/api/trades:
//   - the exact key: the same string the game builds for the same trade
//     (hoopsmatic-accounts test/exact.test.mjs uses the same one), and no
//     key for what can't be matched exactly;
//   - the fans' verdict under the meter: only for a legal trade the game
//     says fans judged, "Fans' verdict: BOS wins, 71% to 29%", the team and
//     the game linked; nothing otherwise, or when the game doesn't answer;
//   - the profile chip: nothing without a profile; the name, plus "2 of
//     your trades got verdicts" once, then only news; opens /profile/;
//   - "Fans are judging 10 trades today: load one": the picker with logos,
//     faces and linked names; "Load this trade" opens that trade's own
//     address; Escape closes it; nothing when there are no trades today;
//   - Roster Manager mode: none of it.
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
const TEAMS = "const teamAbbreviations = { 'Boston': 'BOS', 'LA Lakers': 'LAL', 'Miami': 'MIA' };\n";
const SCRIPT = (rm) => 'var IS_RM_MODE = ' + (rm ? 'true' : 'false') + ';\nlet tradeTeams = [];\n' + TEAMS + cutBlock()
  + cut('showGameVerdict') + cut('showAddToProfile') + '\nfunction marketSession() { return "tm-e2e-session"; }\n'
  + '\nwindow.__set = function (t) { tradeTeams = t; };\ninitGameLinks();\n';
const PAGE = (rm) => '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{--bg:#f5f5f7;--surface:#fff;--border:#d1d1d6;--text:#1d1d1f;--text-secondary:#6e6e73;--accent:#3b82f6}' + css + '</style></head><body>'
  + '<header><h1>NBA Trade Machine</h1><nav class="tm-tabs" aria-label="Trade Machine views"><a class="on" href="/">Build a trade</a><a href="/trade-market">Trade Market</a></nav>'
  + '<div class="header-actions"><div class="header-row"><button id="loopTradeBtn">Trade Loop</button><button id="generateImageBtn">Generate Image</button><button id="resetBtn">Reset Trade</button></div></div></header>'
  + '<div class="realistic-meter" id="realisticMeter">Trade Balance</div><span class="tm-publish" id="tmPublish"></span><div id="tradeContainer"></div>'
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
  fix: '?p=' + (9800000 + i) + '%2C' + (9830000 + i) + '&t=BOS%2CLAL&pd=0-1%2C1-0&stk=' + i,
}));
const VERDICT = { verdict: { winner: 'BOS', teams: [{ team: 'BOS', pct: 71, href: '/trade-market/team/boston/' }, { team: 'LAL', pct: 29, href: '/trade-market/team/la-lakers/' }] },
  trade: '2026-10-20T09:00:00.000Z-exa001', link: '/who-wins-the-trade/?t=2026-10-20T09%3A00%3A00.000Z-exa001' };
// What the game's own test (hoopsmatic-accounts test/exact.test.mjs) expects for this trade.
const KEY = 'BOS-LAL|9700001>LAL,9700002>BOS|BOS:2027:1>LAL';
const TRADE = [
  { teamName: 'Boston', playersOut: [{ player: 'Builder Star', playerId: '9700001', destination: 1 }], picksOut: [{ team: 'Boston', year: '2027', round: '1st', destination: 1, isSwap: false }], rightsOut: [], cashOut: [] },
  { teamName: 'LA Lakers', playersOut: [{ player: 'Builder Wing', playerId: '9700002', destination: 0 }], picksOut: [], rightsOut: [], cashOut: [] },
];

const state = { exact: VERDICT, stack: { day: '2026-10-28', trades: STACK }, me: { profile: false }, trades: { profile: true, trades: ['a', 'b'], judged: 2 }, calls: [] };
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
  if (path === '/who-wins-the-trade/api/stack') return state.stack === 'down' ? send(500, 'text/plain', 'error') : send(200, 'application/json', json(state.stack));
  if (path === '/profile/api/me') return send(200, 'application/json', json(state.me));
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
  await page.waitFor(q('#tmFansVerdict .fv-line') + ' !== undefined', 'the verdict');
  ok('asked by the exact key', state.calls.some((u) => u === '/who-wins-the-trade/api/exact?key=' + encodeURIComponent(KEY)));
  ok('"Fans\' verdict: BOS wins, 71% to 29%", right under the meter',
    await page.js(q('#tmFansVerdict .fv-line')) === "Fans' verdict: BOS wins, 71% to 29%"
    && await page.js('document.getElementById("realisticMeter").nextElementSibling.id') === 'tmFansVerdict');
  ok('BOS links to its team page', await page.js(q('#tmFansVerdict .fv-team', 'getAttribute("href")')) === '/trade-market/team/boston/');
  ok('the link to that trade in the game', await page.js(q('#tmFansVerdict .fv-game', 'getAttribute("href")')) === VERDICT.link
    && await page.js(q('#tmFansVerdict .fv-game')) === 'See it in Who wins the trade? →');
  ok('no counts, percentages only', !/\b(20|14|6)\b/.test(await page.js(q('#tmFansVerdict'))));
  ok('no sideways scroll at 375px', await page.js('document.documentElement.scrollWidth <= innerWidth'));

  // Several renders before the answer (the live page does this): one box only.
  await page.js('document.getElementById("tmFansVerdict").remove(), true');
  const quick = JSON.parse(json(TRADE)); quick[1].playersOut[0].playerId = '9700050';
  await page.js('window.__set(' + json(quick) + '), showFansVerdict(true), showFansVerdict(true), showFansVerdict(true), true');
  await page.waitFor(q('#tmFansVerdict .fv-line') + ' !== undefined', 'the verdict');
  await settle();
  ok('three renders before the answer: still exactly one verdict box', await page.js('document.querySelectorAll("#tmFansVerdict, .tm-fans-verdict").length') === 1);

  // Too close to call.
  state.exact = { ...VERDICT, verdict: { winner: null, teams: [{ team: 'BOS', pct: 48, href: '/trade-market/team/boston/' }, { team: 'LAL', pct: 52, href: '/trade-market/team/la-lakers/' }] } };
  const close = JSON.parse(json(TRADE)); close[1].playersOut[0].playerId = '9700099';
  await page.js('window.__set(' + json(close) + '), showFansVerdict(true), true');
  await page.waitFor(q('#tmFansVerdict .fv-line') + ' === "Fans\' verdict: too close to call, 52% to 48%"', 'too close to call');
  ok('too close to call: says so, with the bigger share first', true);

  // Not judged, or not this trade: nothing shows.
  state.exact = { verdict: null };
  const other = JSON.parse(json(TRADE)); other[1].playersOut[0].playerId = '9700003';
  await page.js('window.__set(' + json(other) + '), showFansVerdict(true), true');
  await settle();
  ok('no verdict: the line is hidden', await page.js(q('#tmFansVerdict', 'hidden')) === true);
  // An illegal trade: not even asked.
  const before = state.calls.length;
  await page.js('window.__set(' + json(TRADE) + '), showFansVerdict(false), true');
  await settle();
  ok('an illegal trade: hidden, and the game isn\'t asked', await page.js(q('#tmFansVerdict', 'hidden')) === true && state.calls.length === before);
  // The game down: nothing, no error.
  state.exact = 'down';
  const fresh = JSON.parse(json(TRADE)); fresh[1].playersOut[0].playerId = '9700004';
  await page.js('window.__set(' + json(fresh) + '), showFansVerdict(true), true');
  await settle();
  ok('the game down: nothing shows', await page.js(q('#tmFansVerdict', 'hidden')) === true);
  state.exact = VERDICT;

  // --- No profile: no chip --------------------------------------------------
  ok('without a profile: no chip, and /profile/api/trades isn\'t asked', await page.js('!document.getElementById("tmProfileChip")') && !state.calls.includes('/profile/api/trades'));

  // --- "Fans are judging 10 trades today" ----------------------------------
  await page.waitFor(q('#tmGameLine') + ' !== undefined', 'the line');
  ok('the line right under the Trade Loop / Generate Image / Reset Trade buttons',
    await page.js(q('#tmGameLine')) === 'Fans are judging 10 trades today: load one →'
    && await page.js('document.querySelector(".header-row").nextElementSibling.id') === 'tmGameLine');
  await page.js('document.querySelector("#tmGameLine button").click(), true');
  await page.waitFor(q('#tmTradePicker .tp-trade') + ' !== undefined', 'the picker');
  ok('the picker lists today\'s 10', await page.js('document.querySelectorAll("#tmTradePicker .tp-trade").length') === 10);
  ok('logos, and the two biggest names a side with faces', await page.js('document.querySelectorAll("#tmTradePicker .tp-trade")[0].querySelectorAll(".tp-logo").length') === 2
    && await page.js('[...document.querySelectorAll("#tmTradePicker .tp-trade")[0].querySelectorAll(".tp-name")].map((a) => a.textContent).join("|")') === 'Made Up Wing 0|Made Up Big 0|Made Up Guard 0'
    && await page.js('document.querySelectorAll("#tmTradePicker .tp-trade")[0].querySelectorAll(".tp-face img").length') === 3);
  ok('every team and player named links to its page', await page.js('[...document.querySelectorAll("#tmTradePicker .tp-abbr, #tmTradePicker .tp-name")].every((a) => a.tagName === "A" && /^\\/trade-market\\//.test(a.getAttribute("href")))'));
  ok('the rest as "+ 1 more"', await page.js('document.querySelector("#tmTradePicker .tp-more").textContent') === '+ 1 more');
  ok('the picker fits a phone', await page.js('document.documentElement.scrollWidth <= innerWidth && document.querySelector(".tm-picker-sheet").getBoundingClientRect().width <= innerWidth'));
  await page.js('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })), true');
  ok('Escape closes it', await page.js('!document.getElementById("tmTradePicker")'));
  await page.js('document.querySelector("#tmGameLine button").click(), true');
  await page.waitFor(q('#tmTradePicker .tp-load') + ' !== undefined', 'the picker');
  state.calls = [];
  await page.js('document.querySelectorAll("#tmTradePicker .tp-load")[3].click(), true');
  await page.waitFor('location.search.indexOf("stk=3") >= 0', 'the trade\'s address');
  ok('"Load this trade" opens that trade\'s own address (one "?")', state.calls.includes('/?' + STACK[3].fix.slice(1)), state.calls);

  // No trades today: no line.
  state.stack = { day: '2026-10-28', trades: [] };
  await page.goto(origin + '/tm.html');
  await settle();
  ok('no trades today: no line', await page.js('!document.getElementById("tmGameLine")'));
  state.stack = 'down';
  await page.goto(origin + '/tm.html');
  await settle();
  ok('the game down: no line', await page.js('!document.getElementById("tmGameLine")'));
  state.stack = { day: '2026-10-28', trades: STACK };

  // --- The profile chip -----------------------------------------------------
  const chipPage = await browser.newPage();
  await chipPage.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 1, mobile: true });
  state.me = { profile: true, name: 'Made Up Fan', leaderboard: false, is_public: false };
  state.trades = { profile: true, trades: ['a', 'b', 'c'], judged: 2 };
  await chipPage.goto(origin + '/tm.html');
  await chipPage.waitFor(q('#tmProfileChip .pc-news') + ' !== undefined', 'the chip');
  ok('with a profile: the name and "2 of your trades got verdicts"', await chipPage.js(q('#tmProfileChip')) === 'Made Up Fan2 of your trades got verdicts'
    && await chipPage.js(q('#tmProfileChip .pc-name')) === 'Made Up Fan');
  ok('in the header, after the two tabs, opening the profile', await chipPage.js(q('header .tm-tabs #tmProfileChip', 'getAttribute("href")')) === '/profile/'
    && await chipPage.js('document.querySelector(".tm-tabs").lastElementChild.id') === 'tmProfileChip');
  await chipPage.goto(origin + '/tm.html');
  await chipPage.waitFor(q('#tmProfileChip') + ' !== undefined', 'the chip');
  await settle();
  ok('next visit, no news: the name only', await chipPage.js(q('#tmProfileChip')) === 'Made Up Fan' && await chipPage.js('!document.querySelector("#tmProfileChip .pc-news")'));
  state.trades = { profile: true, trades: ['a', 'b', 'c'], judged: 3 };
  await chipPage.goto(origin + '/tm.html');
  await chipPage.waitFor(q('#tmProfileChip .pc-news') + ' !== undefined', 'the news');
  ok('one more judged since: "1 of your trades got a verdict"', await chipPage.js(q('#tmProfileChip .pc-news')) === '1 of your trades got a verdict');
  ok('this browser keeps one number only', await chipPage.js('localStorage.getItem("hm_tm_verdicts_seen")') === '3' && await chipPage.js('localStorage.length') === 1);
  state.me = { profile: true, name: null };
  await chipPage.goto(origin + '/tm.html');
  await chipPage.waitFor(q('#tmProfileChip') + ' !== undefined', 'the chip');
  ok('no display name yet: "Your profile"', await chipPage.js(q('#tmProfileChip .pc-name')) === 'Your profile');
  ok('no sideways scroll with the chip at 375px', await chipPage.js('document.documentElement.scrollWidth <= innerWidth'));

  // --- The page redraws many times: every piece is on it exactly once ------
  // (October 29, 2026: the live page drew from cached data and again from
  // fresh data, and the chip and the "load one" line showed twice.)
  state.me = { profile: true, name: 'Made Up Fan', leaderboard: false, is_public: false, autolink: true };
  state.trades = { profile: true, trades: ['a'], judged: 1 };
  state.exact = VERDICT;
  await chipPage.goto(origin + '/tm.html');
  await chipPage.waitFor(q('#tmProfileChip') + ' !== undefined && ' + q('#tmGameLine') + ' !== undefined', 'the chip and the line');
  await chipPage.js('window.__set(' + json(TRADE) + '); for (let i = 0; i < 12; i++) { initGameLinks(); showProfileChip(); showTodaysTrades(); showFansVerdict(true); } true');
  await chipPage.js('for (let i = 0; i < 6; i++) { showGameVerdict("t-e2e", document.getElementById("tmPublish")); showAddToProfile("t-e2e", document.getElementById("tmPublish")); } true');
  await new Promise((r) => setTimeout(r, 1200));
  const counts = await chipPage.js('({ chip: document.querySelectorAll(".tm-profile-chip").length, line: document.querySelectorAll(".tm-game-line").length, verdict: document.querySelectorAll(".tm-fans-verdict").length, game: document.querySelectorAll(".tm-game-verdict").length, added: document.querySelectorAll(".tm-add-profile").length })');
  ok('after many redraws: exactly one chip, one line, one verdict, one game message, one "Added to your profile"', json(counts) === json({ chip: 1, line: 1, verdict: 1, game: 1, added: 1 }), counts);

  // --- Roster Manager mode: none of it --------------------------------------
  state.me = { profile: true, name: 'Made Up Fan' };
  await chipPage.goto(origin + '/rm.html');
  await settle();
  await chipPage.js('window.__set(' + json(TRADE) + '), showFansVerdict(true), true');
  await settle();
  ok('Roster Manager mode: no chip, no line, no verdict', await chipPage.js('!document.getElementById("tmProfileChip") && !document.getElementById("tmGameLine") && !document.getElementById("tmFansVerdict")'));

  ok('no script errors, nothing blocked by the CSP', page.problems.length === 0 && chipPage.problems.length === 0, page.problems.concat(chipPage.problems));
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
