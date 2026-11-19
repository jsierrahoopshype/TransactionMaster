// The Trade Machine's opinion for "Who wins the trade?" (hoopsmatic-accounts,
// game build step 6): after a successful publish, index.html sends the
// meter's score and lean to /who-wins-the-trade/api/machine, and nothing
// else on the page changes.
//
// Runs the page's own functions (doPublish, machineOpinion,
// sendMachineOpinion), cut out of index.html, with stand-ins for the rest of
// the page. Run: node tests/machine-opinion.test.mjs

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let failed = 0;
const ok = (name, cond, detail) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name);
  if (!cond) { failed++; if (detail !== undefined) console.log('        ' + JSON.stringify(detail).slice(0, 400)); }
};

// A function's source, from "function name(" or "async function name(" to
// its closing brace at the same indentation.
function cut(name) {
  const m = html.match(new RegExp('\\n( *)(async )?function ' + name + '\\([\\s\\S]*?\\n\\1\\}'));
  if (!m) throw new Error('not found: ' + name);
  return m[0];
}

function page({ valid = true, values = 1, balance = { percentage: 71, details: [{ teamName: 'Boston', out: 100, in: 80 }, { teamName: 'LA Lakers', out: 80, in: 100 }] }, publish = { ok: true, url: '/trade/t1' }, machineFails = false } = {}) {
  const calls = [];
  const nodes = [];
  const mk = (tag) => {
    const n = { tag, children: [], textContent: '', style: {}, disabled: false, listeners: {},
      appendChild(c) { this.children.push(c); return c; }, addEventListener(t, f) { this.listeners[t] = f; } };
    Object.defineProperty(n, 'innerHTML', { set() { this.children = []; }, get() { return ''; } });
    nodes.push(n);
    return n;
  };
  const host = mk('div');
  const ctx = {
    window: { __tmLastValid: valid },
    tradeValueMapLower: { size: values },
    tradeTeams: [{ teamName: 'Boston' }, { teamName: 'LA Lakers' }],
    calculateTradeBalance: () => balance,
    marketSession: () => 'tm-session-1',
    location: { origin: 'https://hoopsmatic.com' },
    navigator: {},
    setTimeout,
    JSON, Math, Infinity, Array, Error,
    document: { getElementById: (id) => (id === 'tmPublish' ? host : null), createElement: mk },
    fetch: async (url, init) => {
      calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null });
      if (url === '/api/publish') return { ok: publish.ok, json: async () => (publish.ok ? { ok: true, tradeId: 't1', url: publish.url } : { error: 'nope' }) };
      if (machineFails) throw new Error('offline');
      return { ok: true, json: async () => ({ ok: true }) };
    },
  };
  vm.createContext(ctx);
  // showGameVerdict (step 10) has its own test; here it's a no-op.
  vm.runInContext('var lastTradeId = "t1"; var lastPublishedId = null; function showGameVerdict() {} function showAddToProfile() {} function showChallengeEntry() {}\n' + cut('machineOpinion') + cut('sendMachineOpinion') + cut('doPublish'), ctx);
  return { ctx, calls, host };
}

const btn = () => ({ disabled: false, textContent: 'Publish this trade' });
const tick = () => new Promise((r) => setTimeout(r, 10));

{
  const p = page();
  await p.ctx.doPublish(btn());
  await tick();
  ok('publish still goes to /api/publish first, as before', p.calls[0].url === '/api/publish' && p.calls[0].body.tradeId === 't1' && p.calls[0].body.sessionId === 'tm-session-1');
  ok('then the score and lean go to the game', p.calls[1] && p.calls[1].url === '/who-wins-the-trade/api/machine', p.calls);
  ok('with the trade id, the session id, the score and the team that gains more', JSON.stringify(p.calls[1].body) === JSON.stringify({ trade: 't1', tm: 'tm-session-1', score: 71, lean: 'LA Lakers' }), p.calls[1].body);
  ok('the page shows what it showed before: the link and "Copy link"', p.host.children.length === 2 && p.host.children[0].textContent === 'View' && p.host.children[1].textContent === 'Copy link');
}
{
  const p = page({ machineFails: true });
  await p.ctx.doPublish(btn());
  await tick();
  ok('if the game is unreachable, publishing still finishes as before', p.host.children[0] && p.host.children[0].textContent === 'View');
}
{
  const p = page({ valid: false });
  await p.ctx.doPublish(btn());
  await tick();
  ok('no score for a trade that is not legal', p.calls.length === 1);
}
{
  const p = page({ values: 0 });
  await p.ctx.doPublish(btn());
  await tick();
  ok('no score before the trade values have loaded (the meter is hidden then too)', p.calls.length === 1);
}
{
  const p = page({ publish: { ok: false } });
  const b = btn();
  await p.ctx.doPublish(b);
  await tick();
  ok('a failed publish sends nothing to the game and says what it said before', p.calls.length === 1 && b.textContent === 'Publishing did not work — try again' && b.disabled === false);
}
{
  const p = page({ balance: { percentage: 103.4, details: [{ teamName: 'Utah', out: 0, in: 50 }, { teamName: 'Miami', out: 50, in: 0 }] } });
  await p.ctx.doPublish(btn());
  await tick();
  ok('the score is kept to 0..100 as a whole number', p.calls[1] && p.calls[1].body.score === 100 && p.calls[1].body.lean === 'Utah', p.calls[1]);
}

// Additive only: against main, the page gains lines and loses none.
// Named exceptions, each one Jorge asked for; lines inside them on main may
// change, anything else may not:
// - showAddToProfile (October 28, 2026): the one-off "Add to my profile"
//   button became the opt-in "Always add my published trades to my profile";
// - October 29, 2026, the new layout: showGameVerdict (the publish status as
//   one slim row), the "Who wins the trade?" and profiles block and its CSS
//   (the "load one" line and its picker removed; the side column), and the
//   publish link's text ("View").
const REPLACEABLE = ['showAddToProfile', 'showGameVerdict'];
const REPLACEABLE_BLOCKS = [
  ['    /*', '     * "WHO WINS THE TRADE?" AND PROFILES IN THE TRADE MACHINE', '     * A session is a random id in this browser'],
  [null, '    /* "Who wins the trade?" and profiles in the Trade Machine (additive). */', '</style>'],
];
const REPLACEABLE_LINES = ["        a.textContent = 'View published trade';"];
// November 19, 2026: the 25 routine console.log calls were removed from the Trade Machine, with
// the lines that only fed them (a "check the console" comment, a diagnostic try/catch, a debug
// if-block and two log-only variables). These exact 37 lines may be gone; nothing else may.
const REMOVED_DEBUG_LINES = [
  "    // Version indicator - check browser console to verify deployment",
  "    console.log('%c🏀 NBA Trade Machine v17.22 - stronger best-player premium (45% cap, maxes at $55M TV) - Jun 27 2026', 'color: #22c55e; font-weight: bold; font-size: 14px');",
  "    console.log('Features: Pick Swaps, TPE multi-player, NA decomposition, Offseason mode, Sign-and-Trade');",
  "        console.log('[TM signings] loaded ' + signingDateMap.size + ' signing dates for auto cooling-period derivation');",
  "        console.log('[TM trade-date] tab cols: player=\"' + (pCol || 'NONE') + '\" date=\"' + (dCol || 'NONE') + '\"');",
  "        console.log('[TM trade-date] applied no-aggregation to ' + n + ' players');",
  "            console.log('[TM trade-date] loaded ' + m.size + ' trade dates (' + tag + ')');",
  "        console.log(`[TM player] ${tradeTeam.teamName} sends ${p.player}: RESTRICTIONS=\"${p.tradeAvailable||''}\", notAggregated=${!!p.notAggregated}, expiring=${!!p.isExpiring}`);",
  "          const _elig = tradeEligibleDate(p);",
  "          console.log(`[TM cooling] ${p.player}: RESTRICTIONS=\"${p.tradeAvailable}\" → `",
  "            + (_elig ? 'eligible ' + _elig.toISOString().slice(0,10) : 'NO parseable date/token')",
  "            + ` → ${_cooling ? 'IN COOLING — trade BLOCKED' : 'tradeable (eligibility not in the future)'}`);",
  "          console.log(`🔄 Auto-added TPE: ${team.teamName} using $${(usableTPE.value/1000000).toFixed(1)}M TPE to absorb an incoming contract`);",
  "      console.log('[TM] Applied RM picks:', rmPicks.length);",
  "        console.log('[TM] Got PICKS message:', e.data.picks?.length, 'picks');",
  "              console.log('[TM] Auto-selected pick #' + ap + ' from URL param after PICKS');",
  "        console.log('[TM] Trade rejected by RM — Send button re-enabled');",
  "            console.log('[TM] Applied', swapped, 'player swaps from RM trades');",
  "        console.log('[TM] DRAFT_TRADE: partner=' + pf + ' pickNum=' + pn + ' draftPicks2026=' + draftPicks.filter(p=>p.year==='2026').length);",
  "            console.log('[TM] Team picks for ' + pf + ':', tp.map(p => p.year + ' ' + p.round + ' ' + (p.notes||'')).join(', '));",
  "              console.log('[TM] Auto-selected pick #' + pn + ' at index ' + pi);",
  "      // DIAGNOSTIC: does the RESTRICTIONS / NOT AGGREGATED data reach the engine?",
  "      try {",
  "        const _hdrs = (results.data && results.data[0]) ? Object.keys(results.data[0]) : [];",
  "        console.log('[TM CSV] RESTRICTIONS column present:', _hdrs.includes('RESTRICTIONS'),",
  "                    '| NOT AGGREGATED column present:', _hdrs.includes('NOT AGGREGATED'));",
  "        const _cw = (results.data || []).find(r => (r.PLAYER || '').toLowerCase().includes('coby white'));",
  "        if (_cw) console.log('[TM CSV] Coby White → TEAM=\"' + (_cw.TEAM || '') + '\", RESTRICTIONS=\"' + (_cw['RESTRICTIONS'] || '') + '\", NOT AGGREGATED=\"' + (_cw['NOT AGGREGATED'] || '') + '\"');",
  "        else console.log('[TM CSV] Coby White NOT found among CSV rows');",
  "      } catch (e) { console.log('[TM CSV] diagnostic error', e); }",
  "      console.log('[TM capholds] cap-hold column = \"' + (capHoldCol || 'NONE') + '\" (blank cell = no cap hold / waived)');",
  "          if ((row.PLAYER || '').trim() === 'Jonathan Isaac') {",
  "            console.log('[TM capholds] Jonathan Isaac: col=\"' + (capHoldCol || 'NONE') + '\" raw=\"' + (capHoldCol ? (row[capHoldCol] || '') : '') + '\" hasCapHold=' + (capHoldCol ? (row[capHoldCol] || '').toString().trim() !== '' : true));",
  "          }",
  "          const _excludedWaived = players.filter(p => p.salary2627 <= 0 && p.salary > 0 && !p.is10Day && p.player && !p.dataHasCapHold);",
  "          console.log('[TM capholds] excluded ' + _excludedWaived.length + ' blank-cap-hold (waived) players' + (_excludedWaived.length ? ': ' + _excludedWaived.slice(0, 10).map(p => p.player).join(', ') : ''));",
  "        console.log('[TM] Sending TM_READY to RM. IS_OFFSEASON=' + IS_OFFSEASON + ' draftPicks2026=' + draftPicks.filter(p=>p.year==='2026').length + ' players=' + players.length);"
];
function replaceableLines(lines) {
  const out = new Set();
  for (const name of REPLACEABLE) {
    const start = lines.findIndex((l) => l.startsWith('    function ' + name + '(') || l.startsWith('    async function ' + name + '('));
    if (start < 0) continue;
    let from = start;
    while (from > 0 && lines[from - 1].trim() !== '' && /^\s*(\/\*|\*)/.test(lines[from - 1])) from--;
    let to = start;
    while (to < lines.length && lines[to] !== '    }') to++;
    for (let k = from; k <= to; k++) out.add(k);
  }
  for (const [opener, first, stop] of REPLACEABLE_BLOCKS) {
    let from = lines.findIndex((l) => l.startsWith(first));
    if (from < 0) continue;
    if (opener && lines[from - 1] === opener) from--;
    let to = lines.findIndex((l, k) => k > from && l.startsWith(stop));
    if (to < 0) continue;
    if (lines[to - 1] === '    /*') to--;
    for (let k = from; k < to; k++) out.add(k);
  }
  lines.forEach((l, k) => { if (REPLACEABLE_LINES.includes(l) || REMOVED_DEBUG_LINES.includes(l)) out.add(k); });
  return out;
}
try {
  const base = execFileSync('git', ['show', 'origin/main:index.html'], { maxBuffer: 1 << 26 }).toString();
  if (base !== html) {
    const before = base.split('\n'), after = html.split('\n');
    const skip = replaceableLines(before);
    // Every line of main outside the named function must still be there, in order.
    const kept = before.filter((l, k) => !skip.has(k));
    let j = 0;
    for (const line of after) if (j < kept.length && line === kept[j]) j++;
    ok('index.html only gains lines compared with main (nothing removed or changed outside the named exceptions)', j === kept.length, { matched: j, of: kept.length });
  } else {
    console.log('SKIP  additive check: main already has this change');
  }
} catch (e) {
  console.log('SKIP  additive check: origin/main not available');
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
