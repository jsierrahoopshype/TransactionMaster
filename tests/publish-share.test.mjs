// Publishing at the moment it pays off (hoopsmatic-accounts profile invite;
// Jorge, November 2, 2026), in a real browser (headless Chrome). The page's
// own functions, cut out of index.html, on a local test page with a CSP like
// the real one ('self' scripts only), against stand-ins for /api/publish,
// /who-wins-the-trade/api/picks-today, /who-wins-the-trade/api/count,
// /who-wins-the-trade/api/verdicts and /profile/api/me:
//   - under the Publish button, while the trade is legal and unpublished:
//     "Publish it and fans judge it in Who wins the trade? (410 picks
//     today)"; no line without the number; gone once published;
//   - "Generate Image" and "Copy to Clipboard" on a legal unpublished trade:
//     "Publish and share" next to each, the image actions still run as
//     before; it publishes once, counts one "publish_share", and shares
//     https://hoopsmatic.com/trade/<id>; nothing on an illegal trade;
//   - each publish is kept in this browser (hm_tm_published);
//   - "Your published trades" without a profile: each trade's verdict
//     ("Fans: BOS 64%", "Fans: too close to call", "Fans are judging it"),
//     never a count, and "Create a profile to keep these and get your GM
//     score →"; nothing with a profile.
// Run: node tests/publish-share.test.mjs (skipped without Chrome, except on CI).

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

// The real page, in order: the hooks in doPublish, showPublish and
// initGameLinks are there (added lines only).
ok('doPublish keeps the trade in this browser and redraws the list, after the profile line',
  /showAddToProfile\(lastPublishedId, host\);\n\s*try \{ rememberPublished\(lastPublishedId\); showMyPublished\(\); \} catch/.test(html));
ok('initGameLinks starts the line, the image actions and the list', /watchPublishNudge\(\); \} catch \(e\) \{\}\n\s*try \{ watchPublishHint\(\); \} catch \(e\) \{\}\n\s*try \{ watchImageActions\(\); \} catch \(e\) \{\}\n\s*try \{ showMyPublished\(\); \} catch \(e\) \{\}/.test(html));

const CHROME = findChrome();
if (!CHROME) {
  if (process.env.CI) { console.log('FAIL  no Chrome on CI (set CHROME_PATH)'); process.exit(1); }
  console.log('SKIP  no Chrome here');
  process.exit(0);
}

const SCRIPT = 'var lastTradeId = "t-e2e"; var lastPublishedId = null; var IS_RM_MODE = false;\n'
  + 'var tradeTeams = [{ teamName: "Boston Celtics", playersOut: [1], playersIn: [] }, { teamName: "Los Angeles Lakers", playersOut: [2], playersIn: [] }, { teamName: "", playersOut: [], playersIn: [] }];\n'
  + 'window.__tmLastValid = true; window.__imageClicks = 0;\n'
  + 'function sendMachineOpinion() {} function showGameVerdict() {} function showChallengeEntry() {} function showAddToProfile() {}\n'
  + 'function marketSession() { return "tm-e2e-session"; }\n'
  + 'function placeSide() { if (document.getElementById("tmSide")) return; var s = document.createElement("aside"); s.id = "tmSide"; var m = document.createElement("div"); m.id = "tmSideMarket"; s.appendChild(m); document.body.appendChild(s); }\n'
  + "const TM_PUBLISHED_KEY = 'hm_tm_published'; let picksTodayAsked = null; let hintWatch = null;\n"
  + ['publishedList', 'rememberPublished', 'publishableButton', 'showPublishHint', 'watchPublishHint', 'offerPublishAndShare', 'tidyPublishShare',
    'shareTradeLink', 'publishAndShare', 'watchImageActions', 'verdictWords', 'showMyPublished', 'doPublish'].map(cut).join('\n')
  + '\nfunction showPublish() { var host = document.getElementById("tmPublish"); try { tidyPublishShare(); } catch (e) {} host.innerHTML = ""; var b = document.createElement("button"); b.type = "button"; b.textContent = "Publish this trade"; b.addEventListener("click", function () { doPublish(b); }); host.appendChild(b); }\n'
  // The page's own image handlers, standing in: they must still run.
  + 'document.getElementById("generateImageBtn").addEventListener("click", function () { window.__imageClicks++; });\n'
  + 'document.getElementById("copyImageBtn").addEventListener("click", function () { window.__imageClicks++; });\n'
  + 'showPublish(); watchPublishHint(); watchImageActions(); showMyPublished();\n';
const PAGE = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'
  + '<div class="header-row"><button class="btn btn-success" id="generateImageBtn">Generate Image</button><button id="resetBtn">Reset Trade</button></div>'
  + '<div class="image-modal-footer"><button id="downloadImageBtn">Download Image</button><button id="copyImageBtn">Copy to Clipboard</button></div>'
  + '<div id="tmSideTop"><span class="tm-publish" id="tmPublish"></span></div>'
  + '<script src="/tm.js"></script></body></html>';
const CSP = "default-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'";

const state = { picks: { picks: 410 }, me: { profile: false }, verdicts: {}, calls: [] };
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();
  state.calls.push({ method: req.method, url: req.url, body });
  const send = (status, type, text) => { res.writeHead(status, { 'Content-Type': type, 'Content-Security-Policy': CSP }); res.end(text); };
  if (req.url === '/tm.html') return send(200, 'text/html; charset=utf-8', PAGE);
  if (req.url === '/tm.js') return send(200, 'text/javascript; charset=utf-8', SCRIPT);
  if (req.url === '/api/publish') return send(200, 'application/json', JSON.stringify({ ok: true, tradeId: 't-e2e', url: '/trade/t-e2e' }));
  if (req.url === '/who-wins-the-trade/api/picks-today') return send(200, 'application/json', JSON.stringify(state.picks));
  if (req.url === '/who-wins-the-trade/api/count') return send(200, 'application/json', '{"ok":true}');
  if (req.url.startsWith('/who-wins-the-trade/api/verdicts')) return send(200, 'application/json', JSON.stringify({ verdicts: state.verdicts }));
  if (req.url === '/profile/api/me') return send(200, 'application/json', JSON.stringify(state.me));
  return send(404, 'text/plain', 'not found');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await launchBrowser(CHROME);
const settle = () => new Promise((r) => setTimeout(r, 300));
const HINT = 'Publish it and fans judge it in Who wins the trade? (410 picks today)';

try {
  const page = await browser.newPage();

  // The line under the Publish button.
  await page.goto(origin + '/tm.html');
  await page.waitFor('document.getElementById("tmPublishHint")', 'the line');
  ok('under the Publish button: the exact line with today\'s number', await page.js('document.getElementById("tmPublishHint").textContent') === HINT);
  ok('right under it, shown', await page.js('document.getElementById("tmPublish").nextElementSibling.id === "tmPublishHint" && !document.getElementById("tmPublishHint").hidden'));

  state.picks = { picks: null };
  await page.goto(origin + '/tm.html');
  await settle();
  ok('no number: no line', await page.js('!document.getElementById("tmPublishHint")'));
  state.picks = { picks: 410 };

  // Generate Image on a legal, unpublished trade.
  await page.goto(origin + '/tm.html');
  await page.waitFor('document.getElementById("tmPublishHint")', 'the line');
  await page.js('document.getElementById("generateImageBtn").click(), true');
  ok('"Publish and share" next to Generate Image and next to Copy to Clipboard',
    await page.js('document.getElementById("generateImageBtn").nextElementSibling.textContent === "Publish and share" && document.getElementById("copyImageBtn").nextElementSibling.textContent === "Publish and share"'));
  ok('Generate Image still does what it did', await page.js('window.__imageClicks') === 1);
  await page.js('document.getElementById("copyImageBtn").click(), true');
  ok('once each, however often pressed', await page.js('document.querySelectorAll(".tm-pub-share").length') === 2 && await page.js('window.__imageClicks') === 2);
  ok('nothing published yet', !state.calls.some((c) => c.url === '/api/publish'));

  state.calls = [];
  await page.js('document.querySelector("#copyImageBtn + .tm-pub-share").click(), true');
  await page.waitFor('document.querySelector("#tmPublish a")', 'the publish');
  await page.waitFor('/^Published/.test(document.querySelector("#copyImageBtn + .tm-pub-share").textContent)', 'the share');
  await settle();
  ok('published once, through the page\'s own publish', state.calls.filter((c) => c.url === '/api/publish').length === 1);
  ok('one "publish_share" counted, nothing else sent with it', JSON.stringify(state.calls.filter((c) => c.url === '/who-wins-the-trade/api/count').map((c) => c.body)) === JSON.stringify(['{"kind":"publish_share"}']));
  const shared = await page.js('(() => { const b = document.querySelector("#copyImageBtn + .tm-pub-share"); const a = b.nextElementSibling; return { text: b.textContent, link: a && a.classList.contains("tm-pub-link") ? a.getAttribute("href") : null }; })()');
  const clip = await page.js('navigator.clipboard.readText().catch(() => null)');
  ok('the trade\'s page is shared: copied, or shown as a link when copying isn\'t allowed',
    (shared.text === 'Published · link copied' && (clip === null || clip === 'https://hoopsmatic.com/trade/t-e2e')) || (shared.text === 'Published' && shared.link === 'https://hoopsmatic.com/trade/t-e2e'), { shared, clip });
  ok('the other button says Published', await page.js('document.querySelector("#generateImageBtn + .tm-pub-share").textContent') === 'Published');
  ok('the line under Publish is gone once published', await page.js('document.getElementById("tmPublishHint").hidden'));
  const kept = JSON.parse(await page.js('localStorage.getItem("hm_tm_published")'));
  ok('kept in this browser: the trade ID, when and its teams', kept.length === 1 && kept[0].id === 't-e2e' && typeof kept[0].at === 'number' && kept[0].t === 'Boston Celtics · Los Angeles Lakers', kept);

  // An illegal trade: no button.
  await page.goto(origin + '/tm.html');
  await page.js('window.__tmLastValid = false, true');
  await page.js('document.getElementById("generateImageBtn").click(), true');
  ok('an illegal trade: no "Publish and share"; Generate Image as before', await page.js('!document.querySelector(".tm-pub-share") && window.__imageClicks === 1'));

  // "Your published trades", without a profile.
  await page.js(`localStorage.setItem("hm_tm_published", JSON.stringify([
    { id: "t-1", at: 1, t: "Boston Celtics · Los Angeles Lakers" }, { id: "t-2", at: 2, t: "Miami Heat · Utah Jazz" }, { id: "t-3", at: 3, t: "Denver Nuggets · Phoenix Suns" }])), true`);
  state.verdicts = { 't-1': { teams: [{ team: 'BOS', pct: 64 }, { team: 'LAL', pct: 36 }], winner: 'BOS' }, 't-2': { teams: [{ team: 'MIA', pct: 52 }, { team: 'UTA', pct: 48 }], winner: null } };
  state.me = { profile: false };
  await page.goto(origin + '/tm.html');
  await page.waitFor('document.getElementById("tmMyPublished")', 'the list');
  const rows = await page.js('[...document.querySelectorAll("#tmMyPublished li")].map((li) => li.querySelector("a").textContent + " | " + li.querySelector("a").getAttribute("href") + " | " + li.querySelector(".mp-verdict").textContent)');
  ok('newest first, each with its live verdict, never a count', JSON.stringify(rows) === JSON.stringify([
    'Denver Nuggets · Phoenix Suns | /trade/t-3 | Fans are judging it',
    'Miami Heat · Utah Jazz | /trade/t-2 | Fans: too close to call',
    'Boston Celtics · Los Angeles Lakers | /trade/t-1 | Fans: BOS 64%']), rows);
  ok('"Your published trades", then the profile line under it',
    await page.js('document.querySelector("#tmMyPublished h2").textContent === "Your published trades" && document.querySelector("#tmMyPublished .mp-create a").textContent === "Create a profile to keep these and get your GM score \\u2192" && document.querySelector("#tmMyPublished .mp-create a").getAttribute("href") === "/profile/create"'));
  ok('in the side column, before the Trade Market', await page.js('document.getElementById("tmMyPublished").nextElementSibling.id === "tmSideMarket"'));

  state.me = { profile: true, name: 'Made Up Fan' };
  await page.goto(origin + '/tm.html');
  await settle();
  ok('with a profile: no list (the profile page has them)', await page.js('!document.getElementById("tmMyPublished")'));

  ok('no script errors, nothing blocked by the CSP', page.problems.length === 0, page.problems);
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
