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
  vm.runInContext('var lastTradeId = "t1"; var lastPublishedId = null; function showGameVerdict() {} function showAddToProfile() {}\n' + cut('machineOpinion') + cut('sendMachineOpinion') + cut('doPublish'), ctx);
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
  ok('the page shows what it showed before: the link and "Copy link"', p.host.children.length === 2 && p.host.children[0].textContent === 'View published trade' && p.host.children[1].textContent === 'Copy link');
}
{
  const p = page({ machineFails: true });
  await p.ctx.doPublish(btn());
  await tick();
  ok('if the game is unreachable, publishing still finishes as before', p.host.children[0] && p.host.children[0].textContent === 'View published trade');
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
try {
  const base = execFileSync('git', ['show', 'origin/main:index.html'], { maxBuffer: 1 << 26 }).toString();
  if (base !== html) {
    const before = base.split('\n'), after = html.split('\n');
    let i = 0;
    for (const line of after) if (i < before.length && line === before[i]) i++;
    ok('index.html only gains lines compared with main (nothing removed or changed)', i === before.length, { matched: i, of: before.length });
  } else {
    console.log('SKIP  additive check: main already has this change');
  }
} catch (e) {
  console.log('SKIP  additive check: origin/main not available');
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
