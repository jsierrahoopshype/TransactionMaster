// After publishing, one line in the publish row about the profile
// (hoopsmatic-accounts; Jorge, October 28 and 29, 2026), in a real browser
// (headless Chrome). The page's own doPublish and showAddToProfile, cut out
// of index.html, run on a local test page with a CSP like the real one
// ('self' scripts only), against stand-ins for /api/publish,
// /profile/api/me, /profile/api/trades and /profile/api/autolink:
//   - no profile: "Create a profile to see how fans judge this trade and get
//     your GM score →" to /profile/create; the trade waits in this browser
//     (hm_pending_trade); nothing sent to /profile/api/trades;
//   - a profile with "Always add" off (or an answer without it): "Add this
//     trade to your profile?  Yes, and future ones too · Just this one";
//     nothing sent until a choice. "Just this one": only the trade id and
//     this browser's session id to /profile/api/trades. "Yes, and future
//     ones too": /profile/api/autolink { on: true } first, then the same;
//   - "Always add" on: added right after the publish, as before;
//   - already on the profile, or refused: the profiles Worker's message;
//   - the profiles Worker down: nothing appears, publishing is as before.
// Run: node tests/add-to-profile.test.mjs (skipped without Chrome, except on CI).

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

const CHROME = findChrome();
if (!CHROME) {
  if (process.env.CI) { console.log('FAIL  no Chrome on CI (set CHROME_PATH)'); process.exit(1); }
  console.log('SKIP  no Chrome here');
  process.exit(0);
}

const SCRIPT = 'var lastTradeId = "t-e2e"; var lastPublishedId = null;\n'
  + 'function sendMachineOpinion() {} function showGameVerdict() {} function showChallengeEntry() {}\n'
  + 'function marketSession() { return "tm-e2e-session"; }\n'
  + cut('showAddToProfile') + cut('doPublish')
  + '\ndocument.getElementById("go").addEventListener("click", function () { doPublish(this); });\n';
const PAGE = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
  + '<button id="go" type="button">Publish this trade</button><span class="tm-publish" id="tmPublish"></span>'
  + '<script src="/tm.js"></script></body></html>';
const CSP = "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'";

// What the stand-ins answer, set per scenario; what they received.
const state = { me: { profile: false }, link: { status: 200, body: { ok: true, message: 'Added to your profile.' } }, calls: [] };
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();
  state.calls.push({ method: req.method, url: req.url, body });
  const send = (status, type, text) => { res.writeHead(status, { 'Content-Type': type, 'Content-Security-Policy': CSP }); res.end(text); };
  if (req.url === '/tm.html') return send(200, 'text/html; charset=utf-8', PAGE);
  if (req.url === '/tm.js') return send(200, 'text/javascript; charset=utf-8', SCRIPT);
  if (req.url === '/api/publish') return send(200, 'application/json', JSON.stringify({ ok: true, tradeId: 't-e2e', url: '/trade/t-e2e' }));
  if (req.url === '/profile/api/me') return state.me === 'down' ? send(500, 'text/plain', 'error') : send(200, 'application/json', JSON.stringify(state.me));
  if (req.url === '/profile/api/trades' && req.method === 'POST') return send(state.link.status, 'application/json', JSON.stringify(state.link.body));
  if (req.url === '/profile/api/autolink' && req.method === 'POST') return send(200, 'application/json', JSON.stringify({ ok: true, autolink: true }));
  return send(404, 'text/plain', 'not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await launchBrowser(CHROME);
const settle = () => new Promise((r) => setTimeout(r, 300));

async function publish(page) {
  state.calls = [];
  await page.goto(origin + '/tm.html');
  await page.js('document.getElementById("go").click(), true');
  await page.waitFor('document.querySelector("#tmPublish a")', 'the publish link');
  await settle();
}
const posts = () => state.calls.filter((c) => c.url === '/profile/api/trades');

try {
  const page = await browser.newPage();
  const noButton = '![...document.querySelectorAll("#tmPublish button")].some((b) => b.textContent === "Add to my profile" || b.classList.contains("tm-add-yes"))';

  // Without a profile: the invitation, the trade kept in this browser.
  state.me = { profile: false };
  await publish(page);
  await page.waitFor('document.querySelector(".tm-add-profile a")', 'the invitation');
  ok('without a profile: "Create a profile to see how fans judge this trade and get your GM score →", to /profile/create',
    await page.js('document.querySelector(".tm-add-profile a").textContent === "Create a profile to see how fans judge this trade and get your GM score \\u2192" && document.querySelector(".tm-add-profile a").getAttribute("href") === "/profile/create"'));
  ok('without a profile: the trade waits in this browser for the new profile; nothing sent to /profile/api/trades',
    await page.js('JSON.parse(localStorage.getItem("hm_pending_trade")).trade === "t-e2e"') && posts().length === 0);
  ok('without a profile: the publish link and "Copy link" as before', await page.js('document.querySelector("#tmPublish a").textContent === "View" && document.querySelector("#tmPublish button").textContent === "Copy link"'));

  // A profile with "Always add" off: the question, nothing sent until a choice.
  for (const [label, me] of [['setting off', { profile: true, name: 'Made Up Fan', leaderboard: false, is_public: false, team: null, autolink: false }],
    ['no autolink in the answer (an older profiles Worker)', { profile: true, name: 'Made Up Fan', leaderboard: false, is_public: false }]]) {
    state.me = me;
    await publish(page);
    await page.waitFor('document.querySelector(".tm-add-profile .tm-add-one")', 'the question');
    ok(label + ': "Add this trade to your profile?  Yes, and future ones too · Just this one", nothing sent yet',
      await page.js('document.querySelector(".tm-add-profile span").textContent === "Add this trade to your profile? Yes, and future ones too \\u00b7 Just this one"') && posts().length === 0);
  }
  // "Just this one": only this trade.
  state.link = { status: 200, body: { ok: true, message: 'Added to your profile.' } };
  await page.js('document.querySelector(".tm-add-one").click(), true');
  await page.waitFor('document.querySelector(".tm-add-profile span a")', 'the answer');
  ok('"Just this one": only the trade id and the session id, then "Added to your profile"; the setting untouched',
    posts().length === 1 && posts()[0].body === JSON.stringify({ trade: 't-e2e', tm: 'tm-e2e-session' })
    && !state.calls.some((c) => c.url === '/profile/api/autolink') && await page.js('document.querySelector(".tm-add-profile span a").textContent === "Added to your profile"'));
  // "Yes, and future ones too": the setting on first, then this trade.
  state.me = { profile: true, name: 'Made Up Fan', autolink: false };
  await publish(page);
  await page.waitFor('document.querySelector(".tm-add-profile .tm-add-yes")', 'the question');
  await page.js('document.querySelector(".tm-add-yes").click(), true');
  await page.waitFor('document.querySelector(".tm-add-profile span a")', 'the answer');
  const order = state.calls.filter((c) => c.url === '/profile/api/autolink' || c.url === '/profile/api/trades').map((c) => c.url + ' ' + c.body);
  ok('"Yes, and future ones too": the setting turned on ({ on: true }), then this trade added', JSON.stringify(order) === JSON.stringify(['/profile/api/autolink {"on":true}', '/profile/api/trades {"trade":"t-e2e","tm":"tm-e2e-session"}']), order);

  // The setting on.
  state.me = { profile: true, name: 'Made Up Fan', leaderboard: false, is_public: false, team: null, autolink: true };
  state.link = { status: 200, body: { ok: true, message: 'Added to your profile.' } };
  await publish(page);
  await page.waitFor('document.querySelector(".tm-add-profile span") && document.querySelector(".tm-add-profile span").textContent.length > 0', 'the answer');
  const sent = posts();
  ok('setting on: the trade is added right after the publish, sending only the trade id and the session id', sent.length === 1 && sent[0].body === JSON.stringify({ trade: 't-e2e', tm: 'tm-e2e-session' }), sent);
  ok('then says it was added, with a link to the profile, after the publish link',
    await page.js('document.querySelector(".tm-add-profile span").textContent === "Added to your profile" && document.querySelector(".tm-add-profile span a").getAttribute("href") === "/profile/"')
    && await page.js('document.querySelector("#tmPublish .tm-add-profile").previousElementSibling.textContent === "Copy link"'));
  ok('and there is no button to press', await page.js(noButton));

  // Already on the profile (409): the same as added.
  state.link = { status: 409, body: { ok: false, message: 'This trade is already on your profile.' } };
  await publish(page);
  await page.waitFor('document.querySelector(".tm-add-profile span") && document.querySelector(".tm-add-profile span").textContent.length > 0', 'the answer');
  ok('already linked: the same link, the profiles Worker\'s words as its title', await page.js('document.querySelector(".tm-add-profile span").textContent === "Added to your profile" && document.querySelector(".tm-add-profile span a").title === "This trade is already on your profile."'));

  // Refused: the reason.
  state.link = { status: 403, body: { ok: false, message: 'Only the browser that built this trade can add it to a profile.' } };
  await publish(page);
  await page.waitFor('document.querySelector(".tm-add-profile span") && document.querySelector(".tm-add-profile span").textContent.length > 0', 'the answer');
  ok('refused: the profiles Worker\'s reason is shown, as text', await page.js('document.querySelector(".tm-add-profile span").textContent === "Only the browser that built this trade can add it to a profile." && !document.querySelector(".tm-add-profile a")'));

  // The profiles Worker down: nothing appears.
  state.me = 'down';
  await publish(page);
  ok('profiles Worker down: nothing added, publishing as before', await page.js('!document.querySelector(".tm-add-profile") && document.querySelector("#tmPublish a").textContent === "View"'));

  ok('no script errors, nothing blocked by the CSP', page.problems.length === 0, page.problems);
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
