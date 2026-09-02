const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('build produces a clean multiplayer HTML shell', () => {
  execFileSync(process.execPath, ['build-client.js'], { cwd: root, stdio: 'pipe' });
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.equal((html.match(/<script\b/g) || []).length, (html.match(/<\/script>/g) || []).length);
  assert.equal((html.match(/<\/html>/g) || []).length, 1);
  assert.equal(html.slice(html.indexOf('</html>') + '</html>'.length).trim(), '');
  assert.match(html, /window\.__SERVER_DEPLOYMENT__=true;/);
  assert.match(html, /beginRememberedServerSession/);
  assert.match(html, /serverLocalHint/);
});
