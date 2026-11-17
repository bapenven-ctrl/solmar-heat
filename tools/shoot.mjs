// Screenshot driver over the Chrome DevTools Protocol (Node 22+, no
// dependencies: the built-in WebSocket client talks to Chrome).
//   node tools/shoot.mjs <url> <out.jpg> [timeoutMs]
// Launches stock headless Chrome with swiftshader, opens the URL, waits
// for window.__shotReady, captures a 1280x720 JPEG at quality 80, prints
// any console errors the page reported, and exits non-zero on failure.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const DEBUG_PORT = 9222;

const [url, outPath, timeoutArg] = process.argv.slice(2);
if (!url || !outPath) {
  console.error('usage: node tools/shoot.mjs <url> <out.jpg> [timeoutMs]');
  process.exit(2);
}
const timeoutMs = Number(timeoutArg) || 120000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(path, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}${path}`);
      if (res.ok) return res;
    } catch {
      // Chrome is still starting.
    }
    await sleep(500);
  }
  throw new Error(`Chrome DevTools did not answer on port ${DEBUG_PORT}`);
}

const chrome = spawn(CHROME, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--window-size=1280,720',
  '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore' });

let exitCode = 1;
try {
  await waitForHttp('/json/version');
  const targetRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!targetRes.ok) throw new Error(`could not open target: ${targetRes.status}`);
  const target = await targetRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('WebSocket to Chrome failed'));
  });

  let messageId = 0;
  const pending = new Map();
  const consoleMessages = [];
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
      consoleMessages.push(data.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (data.method === 'Runtime.exceptionThrown') {
      consoleMessages.push(`EXCEPTION: ${data.params.exceptionDetails.text} ${data.params.exceptionDetails.exception?.description ?? ''}`);
    } else if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error') {
      consoleMessages.push(`LOG: ${data.params.entry.text} ${data.params.entry.url ?? ''}`);
    }
  };
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = (messageId += 1);
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  const started = Date.now();
  let ready = false;
  while (Date.now() - started < timeoutMs) {
    const result = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true });
    if (result.result && result.result.value === true) {
      ready = true;
      break;
    }
    await sleep(250);
  }
  if (!ready) throw new Error('timed out waiting for window.__shotReady');

  const errorsResult = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__gameErrors || [])', returnByValue: true });
  const pageErrors = JSON.parse(errorsResult.result.value || '[]');
  for (const message of [...pageErrors, ...consoleMessages]) {
    console.log(`PAGE ERROR: ${message}`);
  }
  if (pageErrors.length > 0 || consoleMessages.length > 0) {
    console.log(`(${pageErrors.length + consoleMessages.length} console error(s) reported above)`);
  }

  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log(`saved ${outPath}`);
  exitCode = 0;
} catch (error) {
  console.error(`shoot failed: ${error.message}`);
} finally {
  chrome.kill('SIGTERM');
  await sleep(500);
  if (!chrome.killed) chrome.kill('SIGKILL');
}
process.exit(exitCode);
