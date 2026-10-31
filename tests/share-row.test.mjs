// "Share your trade" under the Trade Machine's publish message (Jorge,
// October 31, 2026; hoopsmatic-accounts src/wwtt/share.js): once the game's
// answer is shown, a row of inline links from /who-wins-the-trade/api/share:
// "Share on X" and "Share on Bluesky" (new tab), "Copy link" ("Copied" in
// place). Nothing when the answer is missing or odd; once per publish.
// Runs the page's own showGameVerdict and showShareRow, cut out of
// index.html. Run: node tests/share-row.test.mjs

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
const SHARE = { url: 'https://hoopsmatic.com/who-wins-the-trade/trade/t1', text: 'Who wins this trade? Vote here:', x: 'https://x.com/intent/post?text=Who&url=u', bsky: 'https://bsky.app/intent/compose?text=Who' };
function page(share, clip = true) {
  const mk = (tag) => {
    const n = { tag, children: [], textContent: '', style: {}, className: '', href: '', listeners: {}, setAttribute() {}, select() {}, removeChild(c) { this.children = this.children.filter((x) => x !== c); },
      appendChild(c) { this.children.push(c); return c; }, addEventListener(t, f) { this.listeners[t] = f; },
      querySelector(sel) { return this.children.find((c) => sel[0] === '.' && c.className === sel.slice(1)) || null; } };
    return n;
  };
  const host = mk('div');
  const copied = [];
  const ctx = {
    setTimeout, JSON, encodeURIComponent,
    navigator: clip ? { clipboard: { writeText: async (t) => { copied.push(t); } } } : {},
    document: { createElement: mk, createTextNode: (t) => ({ tag: '#text', textContent: t }), body: mk('body'), execCommand: () => false },
    fetch: async (url) => {
      if (url.startsWith('/who-wins-the-trade/api/builder')) return { ok: true, json: async () => ({ message: 'Fans are judging this now. Check back for the verdict.', link: 'https://hoopsmatic.com/who-wins-the-trade/' }) };
      if (url.startsWith('/who-wins-the-trade/api/share')) return share === 'down' ? Promise.reject(new Error('offline')) : { ok: !!share, json: async () => share };
      return { ok: false, json: async () => null };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(cut('showGameVerdict') + cut('showShareRow'), ctx);
  return { ctx, host, copied };
}
const tick = () => new Promise((r) => setTimeout(r, 30));

{
  const p = page(SHARE);
  p.ctx.showGameVerdict('t1', p.host);
  await tick();
  const row = p.host.children[1];
  ok('the row comes right after the publish message', p.host.children[0].className === 'tm-game-verdict' && row && row.className === 'tm-share');
  ok('three inline links: Share on X, Share on Bluesky, Copy link', row.children.map((c) => c.textContent).join('|') === 'Share on X|Share on Bluesky|Copy link');
  ok('X and Bluesky open their own share pages in a new tab', row.children[0].href === SHARE.x && row.children[1].href === SHARE.bsky
    && row.children.slice(0, 2).every((a) => a.target === '_blank' && a.rel === 'noopener'));
  ok('Copy link points at the trade page', row.children[2].href === SHARE.url);
  row.children[2].listeners.click({ preventDefault() {} });
  await tick();
  ok('Copy link copies it and says "Copied" in place', p.copied[0] === SHARE.url && row.children[2].textContent === 'Copied');
  p.ctx.showShareRow('t1', p.host);
  await tick();
  ok('once per publish', p.host.children.filter((c) => c.className === 'tm-share').length === 1);
}
{
  const p = page(SHARE, false);
  p.ctx.showShareRow('t1', p.host);
  await tick();
  p.host.children[0].children[2].listeners.click({ preventDefault() {} });
  ok('no copying allowed at all: the link itself shows, to copy by hand', p.host.children[0].children[2].textContent === SHARE.url);
}
for (const [name, share] of [['no share answer', null], ['the game is unreachable', 'down'], ['an address off hoopsmatic.com', { ...SHARE, url: 'https://example.com/x' }], ['an odd X address', { ...SHARE, x: 'javascript:alert(1)' }]]) {
  const p = page(share);
  p.ctx.showShareRow('t1', p.host);
  await tick();
  ok(name + ': nothing added', p.host.children.length === 0);
}
console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
