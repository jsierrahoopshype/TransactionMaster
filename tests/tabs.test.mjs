// The Trade Machine family's tabs (Jorge, October 31, 2026): the page loads
// hoopsmatic-accounts' /who-wins-the-trade/static/tabs.js once, at the end
// of the body, so the row is built in one place (its own tests, in
// hoopsmatic-accounts test/tabs.test.mjs, cover the row under the menu,
// "Trade Machine" on, one line at 390px and nothing in rm= mode).
// Run: node tests/tabs.test.mjs

import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let failed = 0;
const ok = (name, cond) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + name); if (!cond) failed++; };
const tag = '<script src="/who-wins-the-trade/static/tabs.js" defer></script>';
ok('the tabs script is loaded once', html.split(tag).length === 2);
ok('at the end of the body, after the page\'s own script', html.indexOf(tag) > html.lastIndexOf('</script>', html.indexOf(tag) - 1) && html.indexOf(tag) < html.indexOf('</body>') && html.slice(html.indexOf(tag) + tag.length).trim() === '</body>\n</html>');
ok('same-origin and deferred: nothing else from outside', /src="\/who-wins-the-trade\/static\/tabs\.js" defer/.test(tag));
console.log(failed ? `\n${failed} test(s) failed` : '\nall tests passed');
process.exit(failed ? 1 : 0);
