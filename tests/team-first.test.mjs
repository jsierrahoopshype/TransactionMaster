// "Your team first" (Jorge, October 31, 2026), in a real browser (headless
// Chrome). The page's own functions, cut out of index.html, run on a local
// test page with a CSP like the real one, stand-ins for the builder and the
// data load, and stand-ins for /profile/api/me and
// /who-wins-the-trade/api/team-week:
//   - plain load with a profile team (and the setting on): that team as team
//     A and another as team B, whether /profile/api/me answers before or
//     after the rosters; "Fans' favourite Knicks trade this week" in the
//     column under "Fans are judging today", every name linked;
//   - plain load with no profile: the two random teams, nothing else;
//   - the setting off: the two random teams;
//   - a shared link (?p=, ?t=, any parameter): unchanged, /profile/api/me
//     not even asked;
//   - rm= (the Roster Manager's embed mode): unchanged;
//   - a late answer never undoes what the visitor already changed.
// Plus: the real load step calls teamFirstOnLoad() right after the random
// pair, and the profile read starts at the top of the script.
// Run: node tests/team-first.test.mjs (skipped without Chrome, except on CI).

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

// The real page wires it in two places: checked as text.
ok('the profile read starts at the top of the script, after IS_RM_MODE', html.indexOf('var TEAM_FIRST = startTeamFirst();') > html.indexOf("const IS_RM_MODE = INITIAL_URL_PARAMS.has('rm');")
  && html.indexOf('var TEAM_FIRST = startTeamFirst();') < html.indexOf('let tradeTeams = []'));
ok('the load step calls teamFirstOnLoad() right after the two random teams, only when there is no trade in the URL',
  /No trade in the URL: start on two weighted random teams\n\s+const \[team1, team2\] = selectTwoWeightedTeams\(teams\);\n\s+tradeTeams = \[\n[^\n]*\n[^\n]*\n\s+\];\n\s+\/\/[^\n]*\n\s+\/\/[^\n]*\n\s+teamFirstOnLoad\(\);\n\s+\}/.test(html));

const CHROME = findChrome();
if (!CHROME) {
  if (process.env.CI) { console.log('FAIL  no Chrome on CI (set CHROME_PATH)'); process.exit(1); }
  console.log('SKIP  no Chrome here');
  process.exit(0);
}

const css = html.slice(html.indexOf('    /* "Who wins the trade?" and profiles in the Trade Machine (additive). */'), html.indexOf('</style>'));
// The page's top: the same three constants the real script starts with.
const TOP = `
const INITIAL_URL_PARAMS = new URLSearchParams(window.location.search);
const IS_LOOP_URL = INITIAL_URL_PARAMS.has('loop') || INITIAL_URL_PARAMS.has('player') ||
  (INITIAL_URL_PARAMS.has('from') && !INITIAL_URL_PARAMS.has('players')) ||
  (INITIAL_URL_PARAMS.has('to') && !INITIAL_URL_PARAMS.has('players')) || INITIAL_URL_PARAMS.has('exclude');
const IS_RM_MODE = INITIAL_URL_PARAMS.has('rm');
var TEAM_FIRST = startTeamFirst();
let teams = [];
let tradeTeams = [];
const teamAbbreviations = { 'Boston': 'BOS', 'LA Lakers': 'LAL', 'Miami': 'MIA', 'New York': 'NYK', 'Utah': 'UTA' };
const teamNicknames = { 'Boston': ['Celtics'], 'LA Lakers': ['Lakers'], 'Miami': ['Heat'], 'New York': ['Knicks'], 'Utah': ['Jazz'] };
window.__renders = 0;
function render() {
  window.__renders++;
  document.getElementById('tradeContainer').innerHTML = tradeTeams.map((t) => '<div class="team-card">' + t.teamName + '</div>').join('');
  try { placeSide(); } catch (e) {}
}
function redistributePlayers() {}
// Deterministic stand-ins for the weighted picks: the first two, and the first other.
function selectWeightedTeam(list) { return list[0]; }
function selectTwoWeightedTeams(list) { return [list[0], list[1]]; }
function buildTradeFromUrl() {
  if (!INITIAL_URL_PARAMS.has('t')) return null;
  return INITIAL_URL_PARAMS.get('t').split(',').map((t) => ({ teamName: t, playersOut: [], playersIn: [], tpeUsed: null, picksOut: [], rightsOut: [], cashOut: [] }));
}
`;
// The data load, as the page does it (without a trade in the URL: two
// random teams, then teamFirstOnLoad()), after the server's delay.
const LOAD = (delay) => `
setTimeout(function () {
  teams = ['Boston', 'LA Lakers', 'Miami', 'New York', 'Utah'];
  if (!IS_LOOP_URL) {
    const urlTrade = buildTradeFromUrl();
    if (urlTrade) {
      tradeTeams = urlTrade;
    } else {
      const [team1, team2] = selectTwoWeightedTeams(teams);
      tradeTeams = [
        { teamName: team1 || '', playersOut: [], playersIn: [], tpeUsed: null, picksOut: [], rightsOut: [], cashOut: [] },
        { teamName: team2 || '', playersOut: [], playersIn: [], tpeUsed: null, picksOut: [], rightsOut: [], cashOut: [] }
      ];
      teamFirstOnLoad();
    }
  }
  redistributePlayers();
  render();
  window.__loaded = true;
  // "Fans are judging today", as the page adds it (at the end of the column).
  setTimeout(function () {
    placeSide();
    const sec = document.createElement('section'); sec.id = 'tmFansToday'; sec.textContent = 'Fans are judging today';
    document.getElementById('tmSide').appendChild(sec);
  }, ${delay.today});
}, ${delay.load});
`;
const SCRIPT = (delay) => TOP + cut('placeSide') + cut('isPlainLoad') + cut('startTeamFirst') + cut('teamFirstCity') + cut('teamFirstPair')
  + cut('teamFirstSet') + cut('teamFirstOnLoad') + cut('teamFirstLate') + cut('showTeamWeek') + LOAD(delay);
const PAGE = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
  + '<style>:root{--bg:#f5f5f7;--surface:#fff;--border:#d1d1d6;--text:#1d1d1f;--text-secondary:#6e6e73;--accent:#3b82f6}' + css + '</style></head><body>'
  + '<div id="mainContent"><div class="trade-status" id="tradeStatus"><span class="tm-publish" id="tmPublish"></span></div>'
  + '<div class="realistic-meter" id="realisticMeter">Trade Balance</div><div class="trade-container" id="tradeContainer"></div></div>'
  + '<script src="/tm.js"></script></body></html>';
const CSP = "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'";

const WEEK = { team: 'NYK', trade: { id: '2026-10-29T10:00:00.000Z-wk001', href: '/trade/2026-10-29T10%3A00%3A00.000Z-wk001', pct: 85,
  sides: [{ team: 'NYK', href: '/trade-market/team/new-york/', players: [{ name: 'Made Up Celt', href: '/trade-market/made-up-celt/' }], picks: [] },
    { team: 'BOS', href: '/trade-market/team/boston/', players: [{ name: 'Made Up Knick', href: '/trade-market/made-up-knick/' }], picks: ['2027 1st'] }] } };
const state = { me: { profile: false }, meDelay: 0, delay: { load: 50, today: 10 }, week: WEEK, asks: [] };
const json = (v) => JSON.stringify(v);
const server = createServer((req, res) => {
  const send = (status, type, text) => { res.writeHead(status, { 'Content-Type': type, 'Content-Security-Policy': CSP }); res.end(text); };
  const path = req.url.split('?')[0];
  state.asks.push(req.url);
  if (path === '/' || path === '/index.html') return send(200, 'text/html; charset=utf-8', PAGE);
  if (path === '/tm.js') return send(200, 'text/javascript; charset=utf-8', SCRIPT(state.delay));
  if (path === '/profile/api/me') return setTimeout(() => send(200, 'application/json', json(state.me)), state.meDelay);
  if (path === '/who-wins-the-trade/api/team-week') return send(200, 'application/json', json(state.week));
  return send(404, 'text/plain', 'not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await launchBrowser(CHROME);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = { profile: true, name: 'Made Up Fan', leaderboard: false, is_public: false, team: 'NYK', autolink: false, team_first: true };

async function open(path, { me, meDelay = 0, load = 50 } = {}) {
  state.me = me; state.meDelay = meDelay; state.delay = { load, today: 10 }; state.asks = [];
  const page = await browser.newPage();
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await page.goto(origin + path);
  await page.waitFor('window.__loaded === true', 'the load');
  await wait(Math.max(meDelay, 0) + 250);
  return page;
}
const teamsOf = (page) => page.js('tradeTeams.map((t) => t.teamName).join(",")');

try {
  // 1. Plain load with a team: the profile answers before the rosters.
  let page = await open('/', { me: PROFILE, meDelay: 0, load: 300 });
  ok('plain load with a team: that team first, another second', await teamsOf(page) === 'New York,Boston');
  await page.waitFor('!!document.getElementById("tmTeamWeek")', 'the team-week box');
  ok('"Fans\' favourite Knicks trade this week", under "Fans are judging today"',
    await page.js('document.querySelector("#tmTeamWeek h2").textContent') === 'Fans’ favourite Knicks trade this week'
    && await page.js('document.getElementById("tmFansToday").nextElementSibling === document.getElementById("tmTeamWeek")'));
  ok('the card: every team and player linked, the split, the trade\'s page',
    await page.js('[...document.querySelectorAll("#tmTeamWeek a")].map((a) => a.textContent + " " + a.getAttribute("href")).join("|")')
      === 'NYK /trade-market/team/new-york/|Made Up Celt /trade-market/made-up-celt/|BOS /trade-market/team/boston/|Made Up Knick /trade-market/made-up-knick/|See the trade → /trade/2026-10-29T10%3A00%3A00.000Z-wk001'
    && (await page.js('document.querySelector("#tmTeamWeek .tw-foot").textContent')).startsWith('Fans gave it to NYK, 85%.'));
  ok('team-week asked for the profile\'s team', state.asks.includes('/who-wins-the-trade/api/team-week?team=NYK'));
  if (process.env.HM_SHOTS) {
    const { writeFileSync } = await import('node:fs');
    for (const [w, m] of [[390, true], [1440, false]]) {
      await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: m });
      await wait(200);
      const r = await page.js('(() => { const b = document.getElementById("tmTeamWeek").getBoundingClientRect(); return { x: Math.max(0, b.left - 12), y: Math.max(0, b.top + scrollY - 12), width: Math.min(document.documentElement.clientWidth, b.width + 24), height: b.height + 24 }; })()');
      const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...r, scale: 1 } });
      writeFileSync(process.env.HM_SHOTS + '/tm-team-week-' + w + '.png', Buffer.from(data, 'base64'));
    }
  }

  // 1b. The profile answers after the rosters: switched once, if untouched.
  page = await open('/', { me: PROFILE, meDelay: 400, load: 20 });
  ok('plain load with a team, the profile answering late: switched to that team', await teamsOf(page) === 'New York,Boston');
  // ...but never over something the visitor already changed.
  state.me = PROFILE; state.meDelay = 600; state.delay = { load: 20, today: 10 };
  page = await browser.newPage();
  await page.goto(origin + '/');
  await page.waitFor('window.__loaded === true', 'the load');
  await page.js('tradeTeams[1].teamName = "Utah"; render(); true');
  await wait(900);
  ok('a late answer never undoes the visitor\'s own change', await teamsOf(page) === 'Boston,Utah');

  // 2. Plain load with no profile.
  page = await open('/', { me: { profile: false } });
  ok('plain load with no profile: the two random teams, no box', await teamsOf(page) === 'Boston,LA Lakers' && await page.js('!document.getElementById("tmTeamWeek")'));
  ok('no profile: team-week never asked', !state.asks.some((u) => u.startsWith('/who-wins-the-trade/api/team-week')));

  // 3. The setting off.
  page = await open('/', { me: { ...PROFILE, team_first: false } });
  ok('setting off: the two random teams, no box', await teamsOf(page) === 'Boston,LA Lakers' && await page.js('!document.getElementById("tmTeamWeek")'));
  // A profile with no team.
  page = await open('/', { me: { ...PROFILE, team: null } });
  ok('a profile with no team: the two random teams', await teamsOf(page) === 'Boston,LA Lakers');

  // 4. A shared link and other parameters: unchanged, the profile not asked.
  for (const path of ['/?t=Miami,Utah', '/?p=1628386&t=Miami,Utah', '/?ref=x', '/?loop=1']) {
    page = await open(path, { me: PROFILE });
    const expected = path.includes('t=') ? 'Miami,Utah' : (path.includes('loop') ? '' : 'Boston,LA Lakers');
    ok('shared link unchanged: ' + path, await teamsOf(page) === expected && await page.js('!document.getElementById("tmTeamWeek")')
      && !state.asks.includes('/profile/api/me'), { teams: await teamsOf(page), asks: state.asks });
  }

  // 5. The Roster Manager's embed mode.
  page = await open('/?rm=NYK', { me: PROFILE });
  ok('rm= unchanged: no team first, no box, the profile not asked', await teamsOf(page) === 'Boston,LA Lakers'
    && await page.js('!document.getElementById("tmTeamWeek")') && !state.asks.includes('/profile/api/me'));

  // No trade this week for the team: no box.
  state.week = { team: null, trade: null };
  page = await open('/', { me: PROFILE });
  ok('no favourite trade this week: no box, the team still first', await teamsOf(page) === 'New York,Boston' && await page.js('!document.getElementById("tmTeamWeek")'));
  state.week = WEEK;
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
