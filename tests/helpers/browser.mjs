// A real browser for the page's end-to-end tests, with no dependencies:
// headless Chrome over the Chrome DevTools Protocol, using Node 22's
// built-in WebSocket. GitHub's ubuntu-latest runners have Google Chrome;
// elsewhere set CHROME_PATH. (A trimmed copy of hoopsmatic-accounts'
// test/helpers/browser.mjs.) Not a test file itself: the workflow runs
// tests/*.test.mjs only.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  if (existsSync('/opt/pw-browsers')) {
    for (const d of readdirSync('/opt/pw-browsers')) candidates.push(join('/opt/pw-browsers', d, 'chrome-linux', 'chrome'));
  }
  return candidates.find((p) => p && existsSync(p)) || null;
}

export async function launchBrowser(exe) {
  const dir = mkdtempSync(join(tmpdir(), 'tm-e2e-'));
  const proc = spawn(exe, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-breakpad', '--disable-crash-reporter',
    '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank',
  ], { stdio: 'ignore', detached: true });
  proc.unref();
  const file = join(dir, 'DevToolsActivePort');
  const deadline = Date.now() + 45000;
  while (!existsSync(file) || readFileSync(file, 'utf8').split('\n').length < 2) {
    if (Date.now() > deadline) {
      try { process.kill(-proc.pid, 'SIGKILL'); } catch { proc.kill('SIGKILL'); }
      throw new Error('Chrome did not start: ' + exe);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  const [port, path] = readFileSync(file, 'utf8').split('\n');
  const ws = new WebSocket('ws://127.0.0.1:' + port + path);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    const t = setTimeout(() => { pending.delete(id); reject(new Error('Chrome did not answer ' + method)); }, 15000);
    t.unref();
    pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  return {
    async newPage() {
      const { browserContextId } = await send('Target.createBrowserContext');
      const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const page = new Page(send, sessionId);
      listeners.add((msg) => { if (msg.sessionId === sessionId) page.onEvent(msg); });
      for (const d of ['Page', 'Runtime', 'Log']) await send(d + '.enable', {}, sessionId);
      return page;
    },
    async close() {
      for (const { reject } of pending.values()) reject(new Error('browser closed'));
      pending.clear();
      try { ws.close(); } catch { /* already closed */ }
      try { process.kill(-proc.pid, 'SIGKILL'); } catch { proc.kill('SIGKILL'); }
      await new Promise((r) => setTimeout(r, 300));
      try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* left in tmp */ }
    },
  };
}

class Page {
  constructor(send, sessionId) {
    this.send = (method, params) => send(method, params, sessionId);
    this.problems = [];    // CSP violations and script errors
    this.loadWaiters = [];
  }
  onEvent({ method, params }) {
    if (method === 'Page.loadEventFired') this.loadWaiters.splice(0).forEach((r) => r());
    if (method === 'Log.entryAdded' && /Content Security Policy/i.test(params.entry.text)) this.problems.push(params.entry.text);
    if (method === 'Runtime.exceptionThrown') this.problems.push(params.exceptionDetails.text);
  }
  async goto(url) {
    const loaded = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('page did not load')), 15000);
      this.loadWaiters.push(() => { clearTimeout(t); resolve(); });
    });
    await this.send('Page.navigate', { url });
    await loaded;
  }
  // Runs one of the test's own fixed snippets in the page.
  async js(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async waitFor(expression, what) {
    for (let i = 0; i < 200; i++) {
      if (await this.js(expression)) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('timed out waiting for ' + (what || expression));
  }
}
