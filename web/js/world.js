// Bramblekin — la carte vue de dessus : rendu, déplacements prédits du joueur, autres joueurs, personnages, émotions.
import { renderZone, WALKABLE } from './tiles.js';
import { characterCanvas, palette } from './sprites.js';

export const STEP_MS = 190;
export const DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
export const EMOTES = ['👋', '❤️', '😂', '😮', '😡', '❓', '❗', '🎉'];

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.zone = null;
    this.frames = [];
    this.me = null;
    this.peers = new Map();
    this.bubbles = new Map();          // id (joueur) ou 'me' → {e, until}
    this.scale = 3;
    this.time = 0;
    this.look = 0;
    this.myId = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
    this.scale = Math.max(2, Math.floor(Math.min(w, h) / (12 * 16)));
  }

  setZone(zone, me, peers) {
    this.zone = zone;
    this.frames = renderZone(zone);
    this.warps = new Set(zone.warps.map(([x, y]) => `${x},${y}`));
    this.me = { x: me.x, y: me.y, d: me.d, fromX: me.x, fromY: me.y, t: 1, moving: false, walk: 0 };
    this.peers = new Map();
    for (const p of peers) this.upsertPeer(p);
  }

  get width() { return this.zone ? this.zone.rows[0].length : 0; }
  get height() { return this.zone ? this.zone.rows.length : 0; }

  tile(x, y) {
    if (!this.zone || y < 0 || x < 0 || y >= this.height || x >= this.width) return '';
    return this.zone.rows[y][x];
  }

  npcAt(x, y) { return this.zone?.npcs.find((n) => n.x === x && n.y === y) ?? null; }

  peerAt(x, y) {
    for (const p of this.peers.values()) if (p.x === x && p.y === y) return p;
    return null;
  }

  isWarp(x, y) { return this.warps?.has(`${x},${y}`) ?? false; }

  free(x, y) { return WALKABLE.has(this.tile(x, y)) && !this.npcAt(x, y); }

  removeNpc(id) {
    if (this.zone) this.zone.npcs = this.zone.npcs.filter((n) => n.id !== id);
  }

  /** Commence un pas (déjà validé localement) ; le serveur confirme ou corrige. */
  startStep(dir) {
    const m = this.me;
    const [dx, dy] = DIRS[dir];
    m.d = dir;
    m.fromX = m.x; m.fromY = m.y;
    m.x += dx; m.y += dy;
    m.t = 0;
    m.moving = true;
    m.walk = (m.walk + 1) % 2;
  }

  snap(x, y, d) {
    const m = this.me;
    if (!m) return;
    Object.assign(m, { x, y, d: d ?? m.d, fromX: x, fromY: y, t: 1, moving: false });
  }

  upsertPeer(p) {
    const old = this.peers.get(p.id);
    if (old) {
      const near = Math.abs(old.x - p.x) + Math.abs(old.y - p.y) === 1;
      old.fromX = near ? old.x : p.x;
      old.fromY = near ? old.y : p.y;
      old.t = near ? 0 : 1;
      if (near) old.walk = (old.walk + 1) % 2;
      Object.assign(old, { x: p.x, y: p.y, d: p.d, look: p.look, busy: p.busy, name: p.name });
    } else {
      this.peers.set(p.id, { ...p, fromX: p.x, fromY: p.y, t: 1, walk: 0 });
    }
  }

  removePeer(id) { this.peers.delete(id); this.bubbles.delete(id); }

  emote(id, e) { this.bubbles.set(id, { e, until: this.time + 2500 }); }

  /** Chemin (directions) jusqu'à la case visée, ou jusqu'à une case voisine si elle est occupée. */
  path(tx, ty) {
    const m = this.me;
    if (!m) return [];
    const goal = (x, y) => (x === tx && y === ty);
    const occupied = !this.free(tx, ty);
    const start = `${m.x},${m.y}`;
    const prev = new Map([[start, null]]);
    const queue = [[m.x, m.y]];
    let found = null;
    while (queue.length && prev.size < 4000) {
      const [x, y] = queue.shift();
      if (occupied ? Math.abs(x - tx) + Math.abs(y - ty) === 1 : goal(x, y)) { found = [x, y]; break; }
      for (const [d, [dx, dy]] of Object.entries(DIRS)) {
        const nx = x + dx; const ny = y + dy;
        const key = `${nx},${ny}`;
        if (prev.has(key) || !this.free(nx, ny)) continue;
        if (this.isWarp(nx, ny) && !goal(nx, ny)) continue;
        prev.set(key, [`${x},${y}`, d]);
        queue.push([nx, ny]);
      }
    }
    if (!found) return [];
    const dirs = [];
    let key = `${found[0]},${found[1]}`;
    while (prev.get(key)) {
      const [from, d] = prev.get(key);
      dirs.unshift(d);
      key = from;
    }
    if (occupied) {
      const fx = tx - found[0]; const fy = ty - found[1];
      dirs.push(Object.keys(DIRS).find((d) => DIRS[d][0] === fx && DIRS[d][1] === fy) + '!');
    }
    return dirs;
  }

  /** Avance les animations ; renvoie vrai quand le joueur vient d'arriver sur sa case. */
  update(dt) {
    this.time += dt;
    let arrived = false;
    const m = this.me;
    if (m?.moving) {
      m.t += dt / STEP_MS;
      if (m.t >= 1) { m.t = 1; m.moving = false; arrived = true; }
    }
    for (const p of this.peers.values()) if (p.t < 1) p.t = Math.min(1, p.t + dt / STEP_MS);
    for (const [id, b] of this.bubbles) if (b.until < this.time) this.bubbles.delete(id);
    return arrived;
  }

  camera() {
    const S = this.scale * 16;
    const m = this.me;
    const vw = this.canvas.width / S;
    const vh = this.canvas.height / S;
    const px = m.fromX + (m.x - m.fromX) * m.t + 0.5;
    const py = m.fromY + (m.y - m.fromY) * m.t + 0.5;
    const cx = this.width <= vw ? this.width / 2 : Math.max(vw / 2, Math.min(this.width - vw / 2, px));
    const cy = this.height <= vh ? this.height / 2 : Math.max(vh / 2, Math.min(this.height - vh / 2, py));
    return { ox: Math.round(this.canvas.width / 2 - cx * S), oy: Math.round(this.canvas.height / 2 - cy * S), S };
  }

  /** Case sous un point de l'écran (coordonnées CSS). */
  screenToTile(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const { ox, oy, S } = this.camera();
    return [Math.floor(((clientX - r.left) * this.dpr - ox) / S), Math.floor(((clientY - r.top) * this.dpr - oy) / S)];
  }

  draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#16141c';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.zone || !this.me) return;
    const { ox, oy, S } = this.camera();
    const k = this.scale;
    const frame = this.frames[Math.floor(this.time / 600) % 2];
    ctx.drawImage(frame, ox, oy, frame.width * k, frame.height * k);
    const things = [];
    for (const n of this.zone.npcs) things.push({ kind: 'npc', n, x: n.x, y: n.y });
    for (const p of this.peers.values()) {
      things.push({ kind: 'peer', p, x: p.fromX + (p.x - p.fromX) * p.t, y: p.fromY + (p.y - p.fromY) * p.t });
    }
    const m = this.me;
    things.push({ kind: 'me', x: m.fromX + (m.x - m.fromX) * m.t, y: m.fromY + (m.y - m.fromY) * m.t });
    things.sort((a, b) => a.y - b.y);
    for (const th of things) {
      const sx = ox + Math.round(th.x * 16 * k);
      const sy = oy + Math.round(th.y * 16 * k);
      if (th.kind === 'npc') this.drawNpc(th.n, sx, sy, k);
      else {
        const who = th.kind === 'me' ? m : th.p;
        const moving = th.kind === 'me' ? m.moving : who.t < 1;
        const frameNo = moving && (th.kind === 'me' ? m.t : who.t) > 0.25 && (th.kind === 'me' ? m.t : who.t) < 0.85 ? 1 + who.walk : 0;
        const look = th.kind === 'me' ? this.look : who.look;
        ctx.drawImage(characterCanvas(palette('player', look), who.d, frameNo), sx, sy - 3 * k, 16 * k, 16 * k);
        // les hautes herbes cachent les pieds
        const tx = Math.round(th.x); const ty = Math.round(th.y);
        if (this.tile(tx, ty) === '"' && !moving) {
          ctx.drawImage(frame, tx * 16, ty * 16 + 9, 16, 7, ox + tx * 16 * k, oy + (ty * 16 + 9) * k, 16 * k, 7 * k);
        }
      }
    }
    // noms et bulles par-dessus
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const fs = Math.max(10, Math.round(4 * k));
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    for (const th of things) {
      if (th.kind === 'npc') continue;
      const sx = ox + Math.round(th.x * 16 * k) + 8 * k;
      const sy = oy + Math.round(th.y * 16 * k) - 4 * k;
      if (th.kind === 'peer') {
        const label = th.p.busy ? `⚔ ${th.p.name}` : th.p.name;
        const w = ctx.measureText(label).width + fs * 0.6;
        ctx.fillStyle = 'rgba(20,18,28,0.72)';
        ctx.fillRect(sx - w / 2, sy - fs * 1.15, w, fs * 1.2);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, sx, sy);
      }
      const b = this.bubbles.get(th.kind === 'me' ? this.myId : th.p.id);
      if (b) {
        const by = sy - (th.kind === 'peer' ? fs * 1.3 : 0);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(sx - fs * 1.1, by - fs * 2.1, fs * 2.2, fs * 1.9, fs * 0.4);
        ctx.fill();
        ctx.strokeStyle = '#1d1a26';
        ctx.lineWidth = Math.max(1, k / 2);
        ctx.stroke();
        ctx.font = `${Math.round(fs * 1.3)}px system-ui, sans-serif`;
        ctx.fillStyle = '#000';
        ctx.fillText(EMOTES[b.e] ?? '?', sx, by - fs * 0.35);
        ctx.font = `600 ${fs}px system-ui, sans-serif`;
      }
    }
  }

  drawNpc(n, sx, sy, k) {
    const ctx = this.ctx;
    if (n.kind === 'item') {
      const cx = sx + 8 * k; const cy = sy + 9 * k;
      ctx.fillStyle = '#1d1a26';
      ctx.beginPath(); ctx.arc(cx, cy, 5 * k, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e84a4a';
      ctx.beginPath(); ctx.arc(cx, cy, 4 * k, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(cx, cy, 4 * k, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#1d1a26'; ctx.fillRect(cx - 4 * k, cy - k / 2, 8 * k, k);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - k, cy - k, 2 * k, 2 * k);
      return;
    }
    if (n.kind === 'sign') {
      ctx.fillStyle = '#6b4a2f'; ctx.fillRect(sx + 7 * k, sy + 8 * k, 2 * k, 8 * k);
      ctx.fillStyle = '#1d1a26'; ctx.fillRect(sx + 1 * k, sy + 2 * k, 14 * k, 8 * k);
      ctx.fillStyle = '#c99a5b'; ctx.fillRect(sx + 2 * k, sy + 3 * k, 12 * k, 6 * k);
      ctx.fillStyle = '#8a6243'; ctx.fillRect(sx + 4 * k, sy + 5 * k, 8 * k, k); ctx.fillRect(sx + 4 * k, sy + 7 * k, 6 * k, k);
      return;
    }
    if (n.kind === 'pc') {
      ctx.fillStyle = '#1d1a26'; ctx.fillRect(sx + 2 * k, sy + 2 * k, 12 * k, 13 * k);
      ctx.fillStyle = '#9aa3b5'; ctx.fillRect(sx + 3 * k, sy + 3 * k, 10 * k, 11 * k);
      ctx.fillStyle = Math.floor(this.time / 500) % 2 ? '#5fd3a5' : '#3fae85'; ctx.fillRect(sx + 4 * k, sy + 4 * k, 8 * k, 5 * k);
      ctx.fillStyle = '#6b7385'; ctx.fillRect(sx + 4 * k, sy + 11 * k, 8 * k, 2 * k);
      return;
    }
    const pal = palette(['nurse', 'shop', 'prof', 'guard'].includes(n.kind) ? n.kind : 'npc', n.sprite ?? 0);
    ctx.drawImage(characterCanvas(pal, n.d ?? 'd', 0), sx, sy - 3 * k, 16 * k, 16 * k);
    if (n.kind === 'leader' || n.kind === 'champion') {
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(sx + 6 * k, sy - 4 * k, 4 * k, 2 * k);
    }
  }
}
