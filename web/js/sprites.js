// Bramblekin — sprites générés : créatures (32 × 32, d'après la lignée, le stade et les types) et personnages (16 × 16).
// Tout est dessiné pixel par pixel, sans image externe ; les résultats sont mis en cache.

export const TYPE_COLORS = {
  normal: ['#cdb89a', '#8f7a5f', '#f1e5d0'],
  flame: ['#f07a3e', '#b4441f', '#ffc06e'],
  tide: ['#4f9fe2', '#2c62a6', '#a6d8ff'],
  leaf: ['#62bf5c', '#337a38', '#b4ea92'],
  volt: ['#f2cf3c', '#b38f17', '#fff495'],
  stone: ['#a9977e', '#6a5b48', '#d8cab1'],
  gust: ['#9dd3ea', '#5a90ae', '#e6f7ff'],
  frost: ['#aee8f2', '#5fb0c8', '#f4ffff'],
  venom: ['#a86fd4', '#6b3b93', '#dbb0f7'],
  spirit: ['#7570b2', '#3e3874', '#b2adec'],
};
const OUTLINE = '#1d1a26';

/** Générateur pseudo-aléatoire reproductible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLANS = {
  normal: ['biped', 'quad', 'blob'], flame: ['quad', 'biped', 'blob'], tide: ['serpent', 'blob', 'quad'],
  leaf: ['biped', 'blob', 'quad'], volt: ['quad', 'biped', 'floater'], stone: ['blob', 'quad', 'biped'],
  gust: ['bird', 'bird', 'floater'], frost: ['quad', 'blob', 'biped'], venom: ['serpent', 'blob', 'bird'],
  spirit: ['floater', 'floater', 'blob'],
};

const N = 32;
// matières : 0 vide, 1 corps, 2 ventre, 3 accent (2e type), 4 blanc d'œil, 5 pupille, 6 bouche, 7 ornement du 1er type, 8 ornement clair
function blank() { return new Uint8Array(N * N); }
function put(g, x, y, m) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < N && y < N) g[y * N + x] = m;
}
function get(g, x, y) { return x >= 0 && y >= 0 && x < N && y < N ? g[y * N + x] : 0; }
function ellipse(g, cx, cy, rx, ry, m, onlyOver = false) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && (!onlyOver || get(g, x, y) !== 0)) put(g, x, y, m);
    }
  }
}
function tri(g, x0, y0, x1, y1, x2, y2, m) {
  const minX = Math.floor(Math.min(x0, x1, x2)); const maxX = Math.ceil(Math.max(x0, x1, x2));
  const minY = Math.floor(Math.min(y0, y1, y2)); const maxY = Math.ceil(Math.max(y0, y1, y2));
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5; const py = y + 0.5;
      const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
      const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) put(g, x, y, m);
    }
  }
}
function rect(g, x, y, w, h, m) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(g, x + i, y + j, m);
}
/** Symétrie : la moitié gauche est recopiée à droite (les créatures sont vues de face). */
function mirror(g) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N / 2; x++) {
    const m = g[y * N + x];
    if (m) g[y * N + (N - 1 - x)] = m;
  }
}

/** Plan de la créature : parties du corps, placées selon la lignée et le stade. */
function build(sp) {
  const rand = mulberry32((sp.line + 1) * 7919 + 31);
  const g = blank();
  const t1 = sp.types[0];
  const t2 = sp.types[1] ?? null;
  const plans = PLANS[t1];
  const plan = plans[Math.floor(rand() * plans.length)];
  const legend = sp.tier === 10;
  const s = legend ? 1.05 : [0.7, 0.86, 1.0][Math.min(2, sp.stage - 1)] * (sp.evo === null && sp.stage === 1 ? 1.25 : 1);
  const earKind = Math.floor(rand() * 5);
  const eyeBig = rand() < 0.5;
  const belly = rand() < 0.7;
  const tuft = rand();
  let head = { x: 16, y: 13, r: 6 * s };
  let bodyTop = 16;
  switch (plan) {
    case 'blob':
      ellipse(g, 16, 31 - 9 * s, 10 * s, 9 * s, 1);
      head = { x: 16, y: 31 - 12 * s, r: 7 * s };
      bodyTop = 31 - 18 * s;
      rect(g, 16 - 7 * s, 30, 3, 1, 1);
      break;
    case 'quad':
      ellipse(g, 16, 31 - 6 * s, 10 * s, 5.5 * s, 1);
      for (const lx of [-8, -4]) rect(g, 16 + lx * s, 31 - 3 * s, Math.max(2, 2.5 * s), 3 * s + 1, 1);
      head = { x: 16, y: 31 - 13 * s, r: 6.5 * s };
      ellipse(g, head.x, head.y, head.r, head.r * 0.92, 1);
      bodyTop = head.y - head.r;
      break;
    case 'bird':
      ellipse(g, 16, 31 - 8 * s, 7 * s, 8 * s, 1);
      ellipse(g, 16 - 8 * s, 31 - 9 * s, 3 * s, 7 * s, 3);
      tri(g, 16 - 2, 31 - 13 * s, 16, 31 - 10 * s, 16 + 2, 31 - 13 * s, 8);
      rect(g, 16 - 3 * s, 30, 1, 2, 6);
      head = { x: 16, y: 31 - 15 * s, r: 5.5 * s };
      ellipse(g, head.x, head.y, head.r, head.r, 1);
      bodyTop = head.y - head.r;
      break;
    case 'serpent':
      ellipse(g, 16, 31 - 4 * s, 11 * s, 4 * s, 1);
      ellipse(g, 16, 31 - 10 * s, 7.5 * s, 4 * s, 1);
      head = { x: 16, y: 31 - 17 * s, r: 6 * s };
      ellipse(g, head.x, head.y, head.r * 1.1, head.r * 0.9, 1);
      bodyTop = head.y - head.r;
      break;
    case 'floater':
      ellipse(g, 16, 31 - 15 * s, 9 * s, 9 * s, 1);
      tri(g, 16 - 7 * s, 31 - 13 * s, 16, 31, 16 + 7 * s, 31 - 13 * s, 1);
      head = { x: 16, y: 31 - 16 * s, r: 9 * s };
      bodyTop = head.y - head.r;
      break;
    default: // biped
      ellipse(g, 16, 31 - 7 * s, 7.5 * s, 7.5 * s, 1);
      ellipse(g, 16 - 8 * s, 31 - 8 * s, 2 * s, 3.5 * s, 1);
      rect(g, 16 - 5 * s, 31 - 1, 3 * s, 2, 1);
      head = { x: 16, y: 31 - 17 * s, r: 7 * s };
      ellipse(g, head.x, head.y, head.r, head.r * 0.95, 1);
      bodyTop = head.y - head.r;
  }
  if (belly && plan !== 'floater') ellipse(g, 16, 31 - 6 * s, 4.5 * s, 4.5 * s, 2, true);
  // oreilles, cornes
  const hx = head.x - head.r * 0.6;
  const hy = head.y - head.r * 0.7;
  if (earKind === 0) tri(g, hx - 2 * s, hy + 2, hx, hy - 5 * s, hx + 2.5 * s, hy + 1, 1);
  if (earKind === 1) ellipse(g, hx, hy, 2.4 * s, 2.4 * s, 1);
  if (earKind === 2) ellipse(g, hx - 1, hy - 3 * s, 1.6 * s, 4.5 * s, 1);
  if (earKind === 3 || sp.stage >= 3) tri(g, hx + 1, hy, hx + 2, hy - 4 * s - sp.stage, hx + 3.5, hy, 6);
  // ornement du type principal sur la tête
  ornament(g, t1, head, s, sp.stage, 7, tuft);
  if (t2) ornament(g, t2, { x: head.x, y: head.y + head.r + 6 * s, r: head.r * 0.8 }, s * 0.8, 1, 3, 1 - tuft, true);
  // yeux, bouche
  const ex = head.x - head.r * 0.45;
  const ey = head.y - head.r * 0.05;
  const er = eyeBig ? 1.9 * Math.max(0.8, s) : 1.4 * Math.max(0.8, s);
  ellipse(g, ex, ey, er, er * 1.15, 4);
  ellipse(g, ex + 0.4, ey + 0.4, er * 0.55, er * 0.7, 5);
  put(g, ex - 0.6, ey - 0.8, 4);
  if (t1 === 'spirit') ellipse(g, ex + 0.4, ey + 0.4, er * 0.55, er * 0.7, 8);
  const my = head.y + head.r * 0.45;
  put(g, 15, my, 6); put(g, 14, my - 1, 6);
  mirror(g);
  void bodyTop;
  return g;
}

/** Petit décor du type : flamme, nageoire, pousse, antennes, plaques, plumes, cristaux, taches, volutes, touffe. */
function ornament(g, type, head, s, stage, m, roll, low = false) {
  const top = head.y - head.r;
  const x = head.x;
  switch (type) {
    case 'flame':
      if (low) { ellipse(g, x - head.r, head.y, 1.5 * s + 1, 2 * s + 1, m, true); break; }
      tri(g, x - 3 * s, top + 2, x, top - 5 * s - stage, x + 1, top + 2, m);
      tri(g, x - 1, top + 1, x - 1.5 * s, top - 3 * s, x + 1, top + 1, 8);
      break;
    case 'tide':
      if (low) { ellipse(g, x - head.r * 1.1, head.y, 1.6 * s, 3 * s, m); break; }
      tri(g, x - 1, top + 3, x, top - 4 * s - stage, x + 1, top + 3, m);
      ellipse(g, x - head.r - 0.5, head.y, 1.5, 2.5 * s, m);
      break;
    case 'leaf':
      if (low) { ellipse(g, x - head.r * 0.9, head.y, 2.2 * s, 1.4 * s, m); break; }
      ellipse(g, x - 2.5 * s, top - 1.5 * s, 2.5 * s, 1.4 * s, m);
      rect(g, x - 0.5, top - 2 * s, 1, 2 * s + 1, m);
      if (stage >= 3) ellipse(g, x - 1, top - 3 * s, 1.5, 1.5, 8);
      break;
    case 'volt':
      if (low) { tri(g, x - head.r, head.y - 2, x - head.r - 2, head.y + 2, x - head.r + 1, head.y + 1, m); break; }
      rect(g, x - 3 * s, top - 4 * s, 1, 3 * s, m);
      rect(g, x - 3 * s - 1, top - 4 * s - 1, 2, 2, 8);
      break;
    case 'stone':
      ellipse(g, x - head.r * 0.5, (low ? head.y : top + 2), 2 * s, 1.5 * s, m, true);
      if (stage >= 2 && !low) tri(g, x - head.r, top + 3, x - head.r - 2, top - 2 * s, x - head.r + 3, top + 1, m);
      break;
    case 'gust':
      if (low) { ellipse(g, x - head.r * 1.2, head.y, 2 * s, 3.5 * s, m); break; }
      tri(g, x - 1, top + 2, x - 2 * s - 2, top - 4 * s, x + 1, top + 1, m);
      break;
    case 'frost':
      for (let k = 0; k < 2 + Math.min(2, stage); k++) {
        const kx = x - 1 - k * 2 * s;
        if (!low) tri(g, kx - 1, top + 2, kx, top - 2 * s - (k % 2) * 2, kx + 1, top + 2, k % 2 ? 8 : m);
      }
      if (low) ellipse(g, x - head.r * 0.6, head.y, 1.4, 1.4, m, true);
      break;
    case 'venom':
      ellipse(g, x - head.r * 0.5, low ? head.y : head.y + head.r * 0.6, 1.3 * s, 1.1 * s, m, true);
      if (!low && roll > 0.5) rect(g, x - 1, head.y + head.r * 0.6, 1, 2, 8);
      break;
    case 'spirit':
      if (low) { ellipse(g, x - head.r * 0.7, head.y + 1, 1.5, 1.5, m, true); break; }
      ellipse(g, x - head.r * 0.9, top + 1, 1.2 * s, 2.5 * s, m);
      break;
    default:
      if (!low) ellipse(g, x - 1.5, top, 2.5 * s, 1.5 * s, roll > 0.5 ? 8 : m);
      else ellipse(g, x - head.r, head.y + 1, 1.5 * s, 1.2 * s, 2, true);
  }
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const cache = new Map();

/** Canvas 32 × 32 de la créature (vue de face). `sp` : espèce telle que décrite par le serveur. */
export function creatureCanvas(sp, { silhouette = false } = {}) {
  const key = `${sp.id}${silhouette ? 's' : ''}`;
  if (cache.has(key)) return cache.get(key);
  const g = build(sp);
  const [main, dark, light] = TYPE_COLORS[sp.types[0]];
  const acc = TYPE_COLORS[sp.types[1] ?? sp.types[0]];
  const orn = {
    flame: ['#ff9b2f', '#ffe066'], tide: ['#3f86d6', '#c8ecff'], leaf: ['#3f9e45', '#ffd1e8'], volt: ['#ffd92e', '#ffffff'],
    stone: ['#7d6d58', '#c9b89d'], gust: ['#ffffff', '#cdeefa'], frost: ['#8fe0f0', '#ffffff'], venom: ['#d778f0', '#f4f4f4'],
    spirit: ['#a29be8', '#ff6b9a'], normal: ['#efe0c4', '#ffffff'],
  }[sp.types[0]];
  const mat = { 1: main, 2: light, 3: acc[0], 4: '#ffffff', 5: '#22202c', 6: '#3a2a2a', 7: orn[0], 8: orn[1] };
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const ctx = c.getContext('2d');
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const m = g[y * N + x];
      if (m) {
        let col = mat[m];
        if (m === 1 || m === 3) {
          if (!get(g, x - 1, y - 1) || !get(g, x, y - 1)) col = shade(col, 0.28);
          else if (!get(g, x + 1, y + 1) || !get(g, x, y + 2)) col = m === 1 ? dark : shade(col, -0.3);
        }
        ctx.fillStyle = silhouette ? '#2c2a38' : col;
        ctx.fillRect(x, y, 1, 1);
      } else if (get(g, x - 1, y) || get(g, x + 1, y) || get(g, x, y - 1) || get(g, x, y + 1)) {
        ctx.fillStyle = silhouette ? '#2c2a38' : OUTLINE;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  cache.set(key, c);
  return c;
}

// --- personnages (16 × 16) -------------------------------------------------------------------------------------------------

const BODY = {
  d: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '...ohhhhhhhho...',
    '...ohssssssho...',
    '...osesssseso...',
    '....osssssso....',
    '...occccccco....',
    '..oscccccccso...',
    '..oscccccccso...',
    '...occccccco....',
    '...opppppppo....',
  ],
  u: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '...ohhhhhhhho...',
    '...ohhhhhhhho...',
    '...ohhhhhhhho...',
    '....ohhhhhho....',
    '...occccccco....',
    '..oscccccccso...',
    '..oscccccccso...',
    '...occccccco....',
    '...opppppppo....',
  ],
  l: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '...ohhhhhhhho...',
    '...ohhhhhhhho...',
    '...osshhhhhho...',
    '...oesshhhhho...',
    '....osssssso....',
    '....occcccco....',
    '....occcscco....',
    '....occcscco....',
    '....occcccco....',
    '....opppppo.....',
  ],
};
const LEGS = {
  // trois images : pieds joints, pied gauche levé, pied droit levé
  d: [['...oppo.oppo....', '...okko.okko....', '....oo...oo.....'],
    ['...oppo.oppo....', '...okko.okko....', '.........oo.....'],
    ['...oppo.oppo....', '...okko.okko....', '....oo..........']],
  l: [['....oppppo......', '....okkkko......', '.....oooo.......'],
    ['...oppo.oppo....', '..okko...okko...', '...oo.....oo....'],
    ['....oppppo......', '....okkkko......', '.....oooo.......']],
};
export const BODY_ROWS = BODY;
export const LEG_ROWS = LEGS;

export const LOOKS = ['#d6463d', '#3f7fd6', '#3ea65a', '#e6a52c', '#8c55c9', '#e46fa8', '#2fb3b3', '#6b6b78'];
const HAIR = ['#4a2f22', '#1f1d24', '#d4a03a', '#a3482a', '#6a4a8c', '#e3e0d6'];

/** Couleurs d'un personnage : `sprite` (PNJ) ou `look` (joueur). */
export function palette(kind, n) {
  const P = (h, s, c, p, k = '#3a2b24') => ({ h, s, c, p, k, e: '#22202c', o: OUTLINE });
  switch (kind) {
    case 'player': return P(HAIR[n % HAIR.length], '#f3c9a1', LOOKS[n % LOOKS.length], '#3b4664');
    case 'nurse': return P('#e98bb3', '#f6d2b2', '#ffffff', '#f2a7c4');
    case 'shop': return P('#5a3b2a', '#e9b98c', '#3f7fd6', '#2d3550');
    case 'prof': return P('#c9c9c9', '#f0caa4', '#f4f4f4', '#6f5c48');
    case 'guard': return P('#2a2a2a', '#d9a882', '#2e3d6b', '#1d2440', '#111111');
    case 'pc': return P('#888888', '#cccccc', '#888888', '#666666');
    default: {
      const k = n % 20;
      return P(HAIR[k % HAIR.length], ['#f3c9a1', '#d9a882', '#a8744f', '#f0caa4'][k % 4],
        ['#c0392b', '#8e44ad', '#16a085', '#d35400', '#2c3e50', '#27ae60', '#e67e22', '#7f8c8d', '#2980b9', '#c2185b'][k % 10],
        ['#34495e', '#5d4037', '#263238', '#4e342e'][k % 4]);
    }
  }
}

const charCache = new Map();

/** Canvas 16 × 16 d'un personnage, dans une direction (u d l r) et une image de marche (0, 1, 2). */
export function characterCanvas(pal, dir, frame = 0) {
  const key = `${pal.h}${pal.c}${pal.p}${pal.s}${dir}${frame}`;
  if (charCache.has(key)) return charCache.get(key);
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  const side = dir === 'l' || dir === 'r';
  const rows = [...BODY[side ? 'l' : dir], ...LEGS[side ? 'l' : 'd'][frame]];
  const bob = frame === 0 ? 0 : 1;
  rows.forEach((row, y) => {
    for (let x = 0; x < 16; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      ctx.fillStyle = pal[ch] ?? pal.o;
      const px = dir === 'r' ? 15 - x : x;
      ctx.fillRect(px, y + (y < 13 ? bob : 0), 1, 1);
    }
  });
  charCache.set(key, c);
  return c;
}
