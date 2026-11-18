// Screenshot pipeline for Solmar Heat.
// Serves game/ locally, drives headless Chromium over the DevTools
// protocol (no dependencies), stages each scene from shots.json via
// ?scene=<name>, waits for the game to flag itself ready, and saves a
// JPEG per scene into screenshots/. Any page error fails the run.

import { createServer } from 'node:http';
import { readFile, writeFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const gameRoot = join(repoRoot, 'game');
const shots = JSON.parse(await readFile(join(repoRoot, 'shots.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

function serveGame() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        let path = decodeURIComponent(url.pathname);
        if (path === '/') path = '/index.html';
        const file = normalize(join(gameRoot, path));
        if (!file.startsWith(gameRoot)) {
          res.writeHead(403).end();
          return;
        }
        const data = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    join(homedir(), '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
    join(homedir(), '.cache/ms-playwright/chromium-1148/chrome-linux/chrome'),
    '/opt/meta-chromium/chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      await access(c);
      return c;
    } catch { /* keep looking */ }
  }
  throw new Error('No Chromium binary found');
}

// Minimal CDP client over the browser WebSocket (flatten sessions).
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.handlers = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, method } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const h of this.handlers) h(msg);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(payload));
    });
  }

  onEvent(fn) {
    this.handlers.push(fn);
  }
}

async function launchChrome() {
  const chromePath = await findChrome();
  const proc = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--window-size=1280,720',
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--remote-debugging-port=0',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome DevTools did not start')), 30000);
    proc.stderr.on('data', (chunk) => {
      buf += chunk;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on('exit', (code) => reject(new Error(`Chrome exited early (${code})`)));
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return { proc, cdp: new Cdp(ws) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const server = await serveGame();
  const port = server.address().port;
  const { proc, cdp } = await launchChrome();
  const pageErrors = [];

  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    cdp.onEvent((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        pageErrors.push(d.exception?.description || d.text || 'unknown exception');
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        pageErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    try {
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
    } catch { /* focus emulation is a nicety, not a requirement */ }
    try {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: shots.viewport.width,
        height: shots.viewport.height,
        deviceScaleFactor: 1,
        mobile: false,
      }, sessionId);
    } catch { /* the --window-size launch flag already sets the viewport */ }

    const only = process.env.ONLY || '';
    for (const scene of shots.scenes) {
      if (only && scene.name !== only) continue;
      const url = `http://127.0.0.1:${port}/index.html?scene=${scene.name}`;
      await cdp.send('Page.navigate', { url }, sessionId);
      // Headless Chromium only composites when asked: each throwaway
      // capture pumps the game's animation frames until it flags ready.
      const deadline = Date.now() + 300000;
      let ready = false;
      await sleep(600); // let the navigation commit before the first capture
      while (Date.now() < deadline) {
        try {
          await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 30 }, sessionId);
        } catch { /* frame not attached yet — keep polling */ }
        const res = await cdp.send('Runtime.evaluate', {
          expression: 'window.__SHOT_READY === true',
          returnByValue: true,
        }, sessionId);
        if (res.result && res.result.value === true) {
          ready = true;
          break;
        }
        await sleep(260);
      }
      if (!ready) {
        throw new Error(`Scene ${scene.name} never became ready; page errors so far: ${pageErrors.join(' | ') || 'none'}`);
      }

      let quality = shots.jpegQuality;
      let data = null;
      for (;;) {
        const shot = await cdp.send('Page.captureScreenshot', {
          format: 'jpeg',
          quality,
          captureBeyondViewport: false,
        }, sessionId);
        data = Buffer.from(shot.data, 'base64');
        if (data.length <= shots.maxBytes || quality <= 40) break;
        quality -= 18;
      }
      const out = join(repoRoot, 'screenshots', scene.file);
      await writeFile(out, data);
      console.log(`${scene.file}: ${data.length} bytes (jpeg q${quality})`);
    }
    await cdp.send('Target.closeTarget', { targetId });
  } finally {
    proc.kill('SIGKILL');
    server.close();
  }

  if (pageErrors.length) {
    console.error(`\nPAGE ERRORS (${pageErrors.length}):`);
    for (const e of pageErrors) console.error(' -', e);
    process.exit(1);
  }
  console.log('All scenes captured with zero page errors.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
