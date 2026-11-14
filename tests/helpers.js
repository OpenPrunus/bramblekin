// Utilitaires partagés par les tests d'intégration et de navigateur : serveur PHP réel, client WebSocket de test, ports libres.
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const PHP = process.env.PHP_BIN || 'php';

export const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
  s.on('error', reject);
});

export async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  let last;
  for (;;) {
    try { last = await fn(); if (last) return last; } catch (e) { last = `erreur : ${e.message}`; }
    if (Date.now() - t0 > ms) throw new Error(`délai dépassé : ${what} (dernière valeur : ${JSON.stringify(last)})`);
    await sleep(50);
  }
}

/** Lance le vrai serveur de jeu PHP (server/server.php) sur un port libre, avec un dossier de données temporaire. */
export async function startGameServer(env = {}) {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bramble-data-'));
  fs.chmodSync(dataDir, 0o777);
  const child = spawn(PHP, [path.join(ROOT, 'server/server.php')], {
    env: { ...process.env, WS_PORT: String(port), BRAMBLE_DATA_DIR: dataDir, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  await waitFor(() => out.includes('listening'), 15000, `serveur de jeu (${out})`);
  return {
    port,
    url: `ws://127.0.0.1:${port}`,
    dataDir,
    log: () => out,
    stop() {
      child.kill();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Client WebSocket de test : garde tous les messages reçus et permet d'attendre un message précis. */
let botCount = 0;
const nextIp = () => { botCount++; return `198.18.${(botCount >> 8) & 255}.${botCount & 255}`; };   // une adresse distincte par robot

export class Bot {
  constructor(url, origin, ip) {
    this.messages = [];
    this.url = url;
    this.origin = origin;
    this.ip = ip ?? nextIp();
    this.closed = false;
  }

  async open() {
    this.ws = new WebSocket(this.url, { headers: { 'X-Real-IP': this.ip } });          // le reverse proxy transmet l'adresse du client
    this.ws.onmessage = (e) => this.messages.push(JSON.parse(e.data));
    this.ws.onclose = () => { this.closed = true; };
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error('connexion WebSocket impossible'));
    });
    return this;
  }

  send(obj) { this.ws.send(JSON.stringify(obj)); }

  of(type) { return this.messages.filter((m) => m.t === type); }

  last(type) { return this.of(type).at(-1); }

  /** Attend un message de ce type reçu APRÈS l'appel (ou déjà présent si `fromStart`). */
  async next(type, ms = 5000, fromStart = false) {
    const seen = fromStart ? 0 : this.messages.length;
    return waitFor(() => this.messages.slice(seen).find((m) => m.t === type), ms, `message "${type}"`);
  }

  async hello(name, tok = token(name)) {
    this.send({ t: 'hello', name, token: tok });
    return this.next('welcome');
  }

  /** Pseudo, compagnon de départ, première carte. */
  async join(name, starter = 7, tok = token(name)) {
    const w = await this.hello(name, tok);
    this.zone = await this.next('zone', 5000, true);
    if (w.starter) {
      this.send({ t: 'starter', sp: starter });
      await this.next('profile');
    }
    return w;
  }

  close() { try { this.ws.close(); } catch { /* déjà fermé */ } }
}

const STEPS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };

/** Marche jusqu'à (x, y) sur la carte courante du robot (parcours en largeur, un pas toutes les 160 ms). */
export async function walkTo(b, x, y, stopIf = () => false) {
  const z = b.last('zone');
  const rows = z.zone.rows;
  const blocked = new Set(z.zone.npcs.map((n) => `${n.x},${n.y}`));
  const me = b.last('pos')?.zone === z.zone.id ? b.last('pos') : z.me;
  const ok = (px, py) => '.,"fD_bsm'.includes(rows[py]?.[px] ?? 'T') && !blocked.has(`${px},${py}`);
  const prev = new Map([[`${me.x},${me.y}`, null]]);
  const queue = [[me.x, me.y]];
  while (queue.length) {
    const [cx, cy] = queue.shift();
    if (cx === x && cy === y) break;
    for (const [d, [dx, dy]] of Object.entries(STEPS)) {
      const k = `${cx + dx},${cy + dy}`;
      if (!prev.has(k) && ok(cx + dx, cy + dy)) { prev.set(k, [`${cx},${cy}`, d]); queue.push([cx + dx, cy + dy]); }
    }
  }
  const dirs = [];
  for (let k = `${x},${y}`; prev.get(k);) { const [from, d] = prev.get(k); dirs.unshift(d); k = from; }
  if (!prev.has(`${x},${y}`)) throw new Error(`pas de chemin vers ${x},${y} dans ${z.zone.id}`);
  for (const d of dirs) {
    if (stopIf()) return;
    b.send({ t: 'step', d, n: Date.now() });
    await sleep(160);
  }
}

/** De la maison de départ jusqu'à la place de Bourg-Ronce. */
export async function leaveHome(b) {
  if (b.last('zone').zone.id !== 'ha1') return;
  const seen = b.messages.length;
  await walkTo(b, 5, 8);
  await waitFor(() => b.messages.slice(seen).find((m) => m.t === 'zone'), 3000, 'sortie de la maison');
}

export const token = (seed) => (seed + 'x'.repeat(32)).slice(0, 32).replace(/[^A-Za-z0-9_-]/g, 'a');

