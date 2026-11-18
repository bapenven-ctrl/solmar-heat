// Screenshot pipeline: serves game/ statically, drives headless Chromium
// over CDP (no external dependencies), opens each staged ?shot= scene from
// shots.json at 1280x720 and saves a JPEG into screenshots/.
// Usage: node tools/shoot.mjs [name-filter]
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = fileURLToPath(new URL('..', import.meta.url));
const gameDir = join(root, 'game');
const shots = JSON.parse(await readFile(join(root, 'shots.json'), 'utf8'));
const filter = process.argv[2];
const PORT = 8901, CDP = 9337;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = normalize(join(gameDir, p));
    if (!file.startsWith(gameDir)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(PORT, r));

async function findChromium() {
  const base = join(homedir(), '.cache', 'ms-playwright');
  const dirs = (await readdir(base)).sort().reverse();
  for (const d of dirs) {
    for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome',
      'chrome-headless-shell-linux64/chrome-headless-shell']) {
      const p = join(base, d, rel);
      if (existsSync(p)) return p;
    }
  }
  throw new Error('no chromium in ~/.cache/ms-playwright');
}

const chrome = spawn(await findChromium(), [
  '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1280,720', '--remote-debugging-port=' + CDP,
  '--user-data-dir=/tmp/solmar-shot-profile', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitJson(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { }
    await sleep(250);
  }
  throw new Error('CDP not up: ' + url);
}

let msgId = 0;
function cdpSession(ws) {
  const pending = new Map(); const listeners = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) for (const f of listeners) f(m);
  });
  return {
    send(method, params = {}) {
      const id = ++msgId;
      return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
    },
    on(f) { listeners.push(f); },
  };
}

let failures = 0;
try {
  await waitJson(`http://127.0.0.1:${CDP}/json/version`);
  for (const shot of shots) {
    if (filter && !shot.name.includes(filter)) continue;
    const url = `http://127.0.0.1:${PORT}/index.html${shot.query}`;
    const target = await (await fetch(`http://127.0.0.1:${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    const s = cdpSession(ws);
    const errors = [];
    s.on((m) => {
      if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        errors.push('console: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    });
    await s.send('Page.enable'); await s.send('Runtime.enable');
    await s.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await s.send('Page.navigate', { url });
    for (let i = 0; i < 40; i++) {
      const r = await s.send('Runtime.evaluate', { expression: 'window.__ready === true', returnByValue: true });
      if (r.result?.result?.value) break;
      await sleep(250);
    }
    await sleep(3800);
    const shotRes = await s.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, fromSurface: true });
    const data = shotRes.result?.data;
    if (!data) { console.error(shot.name, 'NO SCREENSHOT', JSON.stringify(shotRes).slice(0, 300)); failures++; }
    else {
      const buf = Buffer.from(data, 'base64');
      await writeFile(join(root, 'screenshots', shot.name), buf);
      console.log(shot.name, buf.length, 'bytes', errors.length ? 'ERRORS: ' + errors.join(' | ') : 'clean');
      if (errors.length) failures++;
    }
    ws.close();
    await fetch(`http://127.0.0.1:${CDP}/json/close/${target.id}`).catch(() => { });
  }
} finally {
  chrome.kill('SIGKILL');
  server.close();
}
if (failures) { console.error('FAILURES:', failures); process.exit(1); }
console.log('all screenshots done');
