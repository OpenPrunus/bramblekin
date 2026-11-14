// Bramblekin — la carte vue de dessus : rendu, déplacements prédits du joueur, autres joueurs, personnages, émotions.
import { renderZone, WALKABLE, T, theme, drawGrass, drawWater, hash } from './tiles.js';
import { characterCanvas, palette, CHAR_W, CHAR_H } from './sprites.js';

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
    this.abilities = { cut: false, surf: false };
    this.riding = false;
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
    // taille d'une case à l'écran (pixels réels) : une douzaine de cases sur le petit côté
    this.tilePx = Math.max(28 * dpr, Math.min(w, h) / 11);
    // une petite carte (intérieur) occupe toute la largeur de l'écran plutôt que de flotter au milieu
    if (this.zone) this.tilePx = Math.max(this.tilePx, Math.min(w / this.width, h / this.height, this.tilePx * 1.7));
  }

  setZone(zone, me, peers) {
    this.zone = zone;
    this.map = renderZone(zone);
    this.th = theme(zone.theme);
    this.resize();
    this.special = [];
    zone.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '"' || row[x] === '~') this.special.push([x, y, row[x]]); });
    this.motes = Array.from({ length: 26 }, (_, i) => ({ x: hash(i, 3), y: hash(7, i), s: 0.5 + hash(i, i) }));
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

  /** Capacités du joueur (capsules spéciales) : tailler les buissons, nager. */
  free(x, y) {
    const t = this.tile(x, y);
    const ok = WALKABLE.has(t) || (t === 'x' && this.abilities.cut) || (t === '~' && this.abilities.surf);
    return ok && !this.npcAt(x, y);
  }

  get stepMs() { return this.riding ? STEP_MS / 2 : STEP_MS; }

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
      Object.assign(old, { x: p.x, y: p.y, d: p.d, look: p.look, busy: p.busy, name: p.name, bike: p.bike });
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
      const near = Math.abs(x - tx) + Math.abs(y - ty) === 1;
      // on parle aussi par-dessus un comptoir (infirmière, vendeur)
      const across = (x === tx || y === ty) && Math.abs(x - tx) + Math.abs(y - ty) === 2 && this.tile((x + tx) / 2, (y + ty) / 2) === 'C';
      if (occupied ? near || across : goal(x, y)) { found = [x, y]; break; }
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
      const fx = Math.sign(tx - found[0]); const fy = Math.sign(ty - found[1]);
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
      m.t += dt / this.stepMs;
      if (m.t >= 1) { m.t = 1; m.moving = false; arrived = true; }
    }
    for (const p of this.peers.values()) if (p.t < 1) p.t = Math.min(1, p.t + dt / (p.bike ? STEP_MS / 2 : STEP_MS));
    for (const [id, b] of this.bubbles) if (b.until < this.time) this.bubbles.delete(id);
    return arrived;
  }

  camera() {
    const S = this.tilePx;
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = this.zone?.kind === 'inside' || this.zone?.kind === 'gym' ? '#2a2230' : '#1f3a2a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.zone || !this.me) return;
    const { ox, oy, S } = this.camera();
    const k = S / T;
    ctx.drawImage(this.map, ox, oy, this.width * S, this.height * S);
    // eau et herbes hautes animées (seulement à l'écran)
    const vis = (x, y) => ox + (x + 1) * S > 0 && ox + x * S < this.canvas.width && oy + (y + 1) * S > 0 && oy + (y - 1) * S < this.canvas.height;
    for (const [x, y, ch] of this.special) {
      if (!vis(x, y)) continue;
      if (ch === '~') drawWater(ctx, ox + x * S, oy + y * S, k, this.time, x, y);
      else drawGrass(ctx, ox + x * S, oy + y * S, k, this.th, this.time, x, y);
    }
    const things = [];
    for (const n of this.zone.npcs) things.push({ kind: 'npc', n, x: n.x, y: n.y });
    for (const p of this.peers.values()) {
      things.push({ kind: 'peer', p, x: p.fromX + (p.x - p.fromX) * p.t, y: p.fromY + (p.y - p.fromY) * p.t });
    }
    const m = this.me;
    things.push({ kind: 'me', x: m.fromX + (m.x - m.fromX) * m.t, y: m.fromY + (m.y - m.fromY) * m.t });
    things.sort((a, b) => a.y - b.y);
    for (const th of things) {
      const sx = ox + th.x * S;
      const sy = oy + th.y * S;
      if (th.kind === 'npc') { this.drawNpc(th.n, sx, sy, k); continue; }
      const who = th.kind === 'me' ? m : th.p;
      const t = th.kind === 'me' ? m.t : who.t;
      const moving = th.kind === 'me' ? m.moving : who.t < 1;
      const frameNo = moving && t > 0.2 && t < 0.8 ? 1 + who.walk : 0;
      const look = th.kind === 'me' ? this.look : who.look;
      const tx0 = Math.round(th.x); const ty0 = Math.round(th.y);
      const swimming = this.tile(tx0, ty0) === '~';
      const bike = th.kind === 'me' ? this.riding : who.bike;
      if (swimming) {
        // on nage : seul le haut du corps dépasse, avec des ronds dans l'eau
        ctx.save();
        ctx.beginPath(); ctx.rect(sx - S, sy - S, S * 3, S * 1.35); ctx.clip();
        ctx.drawImage(characterCanvas(palette('player', look), who.d, 0), sx, sy - (CHAR_H - T) * k + 14 * k, CHAR_W * k, CHAR_H * k);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2 * k;
        const r = (this.time / 40) % 14;
        ctx.beginPath(); ctx.ellipse(sx + 24 * k, sy + 34 * k, (14 + r) * k, (5 + r * 0.3) * k, 0, 0, Math.PI * 2); ctx.stroke();
      } else {
        this.shadow(sx, sy, k);
        if (bike) this.drawBike(sx, sy, k, who.d);
        ctx.drawImage(characterCanvas(palette('player', look), who.d, bike ? 0 : frameNo), sx, sy - (CHAR_H - T) * k - (bike ? 6 * k : 0), CHAR_W * k, CHAR_H * k);
      }
      // les hautes herbes cachent les jambes
      const tx = Math.round(th.x); const ty = Math.round(th.y);
      if (this.tile(tx, ty) === '"') drawGrass(ctx, ox + tx * S, oy + ty * S, k, this.th, this.time, tx, ty, true);
    }
    this.ambience(ctx);
    // noms et bulles par-dessus
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = Math.max(11 * this.dpr, Math.round(S * 0.24));
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    for (const th of things) {
      if (th.kind === 'npc') continue;
      const sx = ox + th.x * S + S / 2;
      const sy = oy + th.y * S - S * 0.5;
      if (th.kind === 'peer') {
        const label = th.p.busy ? `⚔ ${th.p.name}` : th.p.name;
        const w = ctx.measureText(label).width + fs;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - fs * 0.75, w, fs * 1.5, fs * 0.75); ctx.fill();
        ctx.fillStyle = '#2b2a3a';
        ctx.fillText(label, sx, sy);
      }
      const b = this.bubbles.get(th.kind === 'me' ? this.myId : th.p.id);
      if (b) {
        const by = sy - (th.kind === 'peer' ? fs * 2.2 : fs * 0.6);
        const r = fs * 1.15;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = fs * 0.5; ctx.shadowOffsetY = fs * 0.15;
        ctx.beginPath(); ctx.arc(sx, by, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx - r * 0.3, by + r * 0.8); ctx.lineTo(sx, by + r * 1.4); ctx.lineTo(sx + r * 0.3, by + r * 0.8); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.font = `${Math.round(fs * 1.25)}px system-ui, sans-serif`;
        ctx.fillStyle = '#000';
        ctx.fillText(EMOTES[b.e] ?? '?', sx, by + fs * 0.08);
        ctx.font = `700 ${fs}px system-ui, sans-serif`;
      }
    }
  }

  /** Un vélo sous le personnage (de profil ou de face selon la direction). */
  drawBike(sx, sy, k, d) {
    const ctx = this.ctx;
    ctx.lineWidth = 2.5 * k;
    ctx.strokeStyle = '#2b2a3a';
    if (d === 'l' || d === 'r') {
      for (const wx of [12, 36]) { ctx.beginPath(); ctx.arc(sx + wx * k, sy + 40 * k, 8 * k, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = '#e0525b';
      ctx.beginPath(); ctx.moveTo(sx + 12 * k, sy + 40 * k); ctx.lineTo(sx + 22 * k, sy + 30 * k); ctx.lineTo(sx + 36 * k, sy + 40 * k); ctx.lineTo(sx + 28 * k, sy + 28 * k); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.roundRect(sx + 21 * k, sy + 32 * k, 6 * k, 16 * k, 3 * k); ctx.stroke();
      ctx.strokeStyle = '#e0525b';
      ctx.beginPath(); ctx.moveTo(sx + 12 * k, sy + 30 * k); ctx.lineTo(sx + 36 * k, sy + 30 * k); ctx.stroke();
    }
  }

  shadow(sx, sy, k) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(sx + 24 * k, sy + 44 * k, 15 * k, 5.5 * k, 0, 0, Math.PI * 2); ctx.fill();
  }

  /** Lumière d'ambiance : vignette douce, teinte de la carte, poussières ou flocons qui flottent. */
  ambience(ctx) {
    const W = this.canvas.width; const H = this.canvas.height;
    const z = this.zone;
    const inside = z.kind === 'inside' || z.kind === 'gym';
    if (!inside) {
      // ombres de nuages qui glissent sur la carte, et lumière chaude venant d'en haut à gauche
      const { ox, oy, S } = this.camera();
      for (let i = 0; i < 4; i++) {
        const wx = ((hash(i, 9) * this.width + this.time / 2600 * (0.6 + hash(i, 4))) % (this.width + 16)) - 8;
        const wy = hash(9, i) * this.height;
        const cx = ox + wx * S; const cy = oy + wy * S; const r = S * (4 + hash(i, i) * 3);
        const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
        g.addColorStop(0, 'rgba(20,40,60,0.13)'); g.addColorStop(1, 'rgba(20,40,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.4, r, 0, 0, Math.PI * 2); ctx.fill();
      }
      const sun = ctx.createLinearGradient(0, 0, W, H);
      sun.addColorStop(0, 'rgba(255,240,200,0.14)'); sun.addColorStop(0.5, 'rgba(255,240,200,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, inside ? 'rgba(40,20,10,0.35)' : 'rgba(10,30,40,0.28)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    const tint = inside ? 'rgba(255,190,120,0.07)' : { 7: 'rgba(200,230,255,0.10)', 8: 'rgba(60,90,40,0.10)', 9: 'rgba(70,50,120,0.16)', 10: 'rgba(220,235,255,0.08)' }[z.theme];
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H); }
    const snow = z.theme === 7 || z.theme === 10;
    ctx.fillStyle = snow ? 'rgba(255,255,255,0.85)' : inside ? 'rgba(255,230,180,0.35)' : 'rgba(255,255,220,0.45)';
    for (const p of this.motes) {
      const t = this.time / (snow ? 7000 : 14000);
      const x = ((p.x + t * (snow ? 0.15 : 0.4) * p.s + Math.sin(t * 6 + p.y * 9) * 0.02) % 1) * W;
      const y = ((p.y + t * (snow ? 1 : -0.25) * p.s) % 1 + 1) % 1 * H;
      ctx.beginPath(); ctx.arc(x, y, (snow ? 2.2 : 1.4) * p.s * this.dpr, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawNpc(n, sx, sy, k) {
    const ctx = this.ctx;
    if (n.kind === 'item') {
      const cx = sx + 24 * k; const cy = sy + 28 * k; const r = 9 * k;
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(cx + 2 * k, cy + r, r, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.5, r * 0.1, cx, cy, r);
      g.addColorStop(0, '#ff9a9a'); g.addColorStop(0.5, '#e84a4a'); g.addColorStop(1, '#a52a2a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.fill();
      const w = ctx.createRadialGradient(cx - r * 0.3, cy, r * 0.1, cx, cy, r);
      w.addColorStop(0, '#ffffff'); w.addColorStop(1, '#cfd3da');
      ctx.fillStyle = w; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#2b2a3a'; ctx.fillRect(cx - r, cy - k, 2 * r, 2 * k);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, 2.6 * k, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b2a3a'; ctx.lineWidth = k; ctx.stroke();
      const glow = 0.5 + Math.sin(this.time / 300) * 0.5;
      ctx.fillStyle = `rgba(255,255,255,${0.5 * glow})`; ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.45, 2 * k, 0, Math.PI * 2); ctx.fill();
      return;
    }
    if (n.kind === 'sign') {
      this.shadow(sx, sy, k);
      ctx.fillStyle = '#6b4a2f'; ctx.fillRect(sx + 21 * k, sy + 22 * k, 6 * k, 22 * k);
      const g = ctx.createLinearGradient(0, sy + 6 * k, 0, sy + 28 * k);
      g.addColorStop(0, '#d9ab6c'); g.addColorStop(1, '#a8743f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(sx + 6 * k, sy + 6 * k, 36 * k, 22 * k, 4 * k); ctx.fill();
      ctx.fillStyle = 'rgba(80,45,20,0.45)'; ctx.fillRect(sx + 12 * k, sy + 13 * k, 24 * k, 2 * k); ctx.fillRect(sx + 12 * k, sy + 19 * k, 16 * k, 2 * k);
      return;
    }
    if (n.kind === 'pc') {
      this.shadow(sx, sy, k);
      ctx.fillStyle = '#c8ccd6'; ctx.beginPath(); ctx.roundRect(sx + 8 * k, sy + 4 * k, 32 * k, 40 * k, 5 * k); ctx.fill();
      const on = Math.floor(this.time / 600) % 2;
      const g = ctx.createLinearGradient(0, sy + 8 * k, 0, sy + 26 * k);
      g.addColorStop(0, on ? '#7ff0c4' : '#5fd3a5'); g.addColorStop(1, '#2f9e78');
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(sx + 12 * k, sy + 8 * k, 24 * k, 18 * k, 3 * k); ctx.fill();
      ctx.fillStyle = '#8a90a0'; ctx.fillRect(sx + 12 * k, sy + 32 * k, 24 * k, 4 * k);
      return;
    }
    const pk = ['nurse', 'shop', 'prof', 'guard', 'leader', 'champion'].includes(n.kind) ? n.kind : 'npc';
    this.shadow(sx, sy, k);
    ctx.drawImage(characterCanvas(palette(pk, n.sprite ?? 0), n.d ?? 'd', 0), sx, sy - (CHAR_H - T) * k, CHAR_W * k, CHAR_H * k);
  }
}
