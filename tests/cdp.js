// Pilote minimal de Chrome headless par DevTools (sans dépendance) : navigation, évaluation, captures, toucher.
import { spawn } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { freePort, waitFor } from './helpers.js';

export async function launchChrome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bramble-chrome-'));
  const port = await freePort();
  const proc = spawn(process.env.CHROME_BIN || 'google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank',
  ], { stdio: 'ignore' });
  const tab = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'), 15000, 'Chrome');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('DevTools')); });
  const pending = new Map();
  const errors = [];
  let id = 0;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`${m.params.entry.text} ${m.params.entry.url ?? ''}`);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await call('Page.enable'); await call('Runtime.enable'); await call('Log.enable');
  const ev = async (expr) => {
    const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page : ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  return {
    call, ev, errors,
    async device({ w, h, touch }) {
      await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: touch ? 2 : 1, mobile: !!touch });
      await call('Emulation.setTouchEmulationEnabled', touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    },
    async shot(file) {
      const { data } = await call('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
    },
    async tap(x, y) {
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    async key(code, key, down = true, up = true) {
      const vk = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Space: 32, Enter: 13, Escape: 27 }[code] ?? 0;
      if (down) await call('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
      if (up) await call('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
    },
    async close() {
      try { await Promise.race([call('Browser.close'), new Promise((r) => setTimeout(r, 2000))]); } catch { /* déjà fermé */ }
      try { ws.close(); } catch { /* déjà fermé */ }
      try { proc.kill(); } catch { /* déjà arrêté */ }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignoré */ }
    },
  };
}
