// The game's answer after publishing, for "Who wins the trade?"
// (hoopsmatic-accounts, game build step 10): under the publish link, the
// page shows the one line /who-wins-the-trade/api/builder gives, and adds
// nothing when there's no line or no answer.
//
// Runs the page's own doPublish and showGameVerdict, cut out of index.html,
// with stand-ins for the rest of the page. Run: node tests/game-verdict.test.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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

function page(answer) {
  const calls = [];
  const mk = (tag) => {
    const n = { tag, children: [], textContent: '', style: {}, className: '', href: '', listeners: {},
      appendChild(c) { this.children.push(c); return c; }, addEventListener(t, f) { this.listeners[t] = f; },
      // Only ".class" lookups among direct children, which is all the page asks.
      querySelector(sel) { return this.children.find((c) => sel[0] === '.' && c.className === sel.slice(1)) || null; } };
    Object.defineProperty(n, 'innerHTML', { set() { this.children = []; }, get() { return ''; } });
    return n;
  };
  const host = mk('div');
  const ctx = {
    window: {}, location: { origin: 'https://hoopsmatic.com' }, navigator: {}, setTimeout, JSON, Error, encodeURIComponent,
    marketSession: () => 'tm-session-1',
    document: { getElementById: (id) => (id === 'tmPublish' ? host : null), createElement: mk, createTextNode: (t) => ({ tag: '#text', textContent: t }) },
    fetch: async (url) => {
      calls.push(url);
      if (url === '/api/publish') return { ok: true, json: async () => ({ ok: true, tradeId: 't1', url: '/trade/t1' }) };
      if (answer === 'down') throw new Error('offline');
      return { ok: true, json: async () => answer };
    },
  };
  vm.createContext(ctx);
  vm.runInContext('var lastTradeId = "t1"; var lastPublishedId = null; function sendMachineOpinion() {} function showAddToProfile() {}\n' + cut('showGameVerdict') + cut('doPublish'), ctx);
  return { ctx, calls, host };
}
const btn = () => ({ disabled: false, textContent: 'Publish this trade' });
const tick = () => new Promise((r) => setTimeout(r, 20));
const LINK = 'https://hoopsmatic.com/who-wins-the-trade/';

{
  const p = page({ message: "Fans' verdict on this trade: BOS 61% · LAL 39%", link: LINK });
  await p.ctx.doPublish(btn());
  await tick();
  ok('asks the game about the published trade', p.calls[1] === '/who-wins-the-trade/api/builder?trade=t1', p.calls);
  ok('keeps the link and "Copy link" first, as before', p.host.children[0].textContent === 'View published trade' && p.host.children[1].textContent === 'Copy link');
  const line = p.host.children[2];
  ok('then one line with the message and "Who wins the trade?" as a link', line && line.tag === 'p' && line.children[0].textContent === "Fans' verdict on this trade: BOS 61% · LAL 39% "
    && line.children[1].tag === 'a' && line.children[1].href === LINK && line.children[1].textContent === 'Who wins the trade?', line);
}
for (const [name, answer] of [['no message (a trade the game can\'t deal, or before launch)', { message: null }], ['the game is unreachable', 'down'], ['an answer that is not a message', { message: 42 }]]) {
  const p = page(answer);
  await p.ctx.doPublish(btn());
  await tick();
  ok(name + ': nothing added, the page is as before', p.host.children.length === 2 && p.host.children[0].textContent === 'View published trade');
}
{
  const p = page({ message: 'Something', link: 'https://example.com/' });
  await p.ctx.doPublish(btn());
  await tick();
  ok('a link anywhere but the game is not made a link', p.host.children[2] && p.host.children[2].children.length === 1);
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
