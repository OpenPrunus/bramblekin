// Bramblekin — décor HD : chaque carte est peinte une fois (cases de 48 px, dessin vectoriel lissé, ombres, dégradés) ;
// les hautes herbes et l'eau sont animées à part, à chaque image.

export const T = 48;

/** Ambiances : 1 à 10 villes (et leurs routes), 11 à 18 arènes, 19 Ligue. */
const THEMES = {
  1: { g: '#8ad06e', gd: '#6fb85a', gl: '#a8e08a', t: '#3f9a52', td: '#2a7340', p: '#ead6a4', pd: '#d6bd84', w: '#4fa6e6', wd: '#2f7cc4' },
  2: { g: '#96d466', gd: '#78bb4e', gl: '#b5e68b', t: '#47a046', td: '#2e7633', p: '#e4cf9a', pd: '#cbb27a', w: '#4fa6e6', wd: '#2f7cc4' },
  3: { g: '#8ccf8c', gd: '#6db472', gl: '#ace3a8', t: '#3a8f66', td: '#256a4a', p: '#eedfb4', pd: '#d4c18f', w: '#3f98de', wd: '#226fb6' },
  4: { g: '#b4d466', gd: '#97ba4d', gl: '#cde58c', t: '#68973c', td: '#4a722a', p: '#ead09a', pd: '#cfb276', w: '#4fa6e6', wd: '#2f7cc4' },
  5: { g: '#b2c294', gd: '#96a77a', gl: '#cbd8b2', t: '#66805a', td: '#485e40', p: '#d3c3a3', pd: '#b6a581', w: '#4f94c8', wd: '#33719f' },
  6: { g: '#a6dc98', gd: '#88c27c', gl: '#c4ecb8', t: '#55a676', td: '#3a7c56', p: '#efe0b6', pd: '#d4c394', w: '#5ab6ec', wd: '#3a8ccc' },
  7: { g: '#eef4f7', gd: '#d5e2e9', gl: '#ffffff', t: '#5f9690', td: '#416f6a', p: '#d4dee6', pd: '#b7c6d1', w: '#86c9ea', wd: '#5aa2c8' },
  8: { g: '#7c9c66', gd: '#638250', gl: '#97b67f', t: '#46663f', td: '#2f472b', p: '#b4a681', pd: '#968862', w: '#5c8a78', wd: '#3f6a5a' },
  9: { g: '#8a8cb4', gd: '#6f7299', gl: '#a7a9cd', t: '#4f4c7c', td: '#36345a', p: '#b3aac4', pd: '#958ba8', w: '#6476bd', wd: '#46559b' },
  10: { g: '#d3e2e8', gd: '#b7cbd3', gl: '#ecf4f7', t: '#58867d', td: '#3c625b', p: '#e2dccf', pd: '#c7beac', w: '#86c9ea', wd: '#5aa2c8' },
};
const GYM = { 11: '#6fbf5f', 12: '#4a9be0', 13: '#f0c93a', 14: '#a7967f', 15: '#9fd0e8', 16: '#a8e6f0', 17: '#a46ad1', 18: '#6f6aa8', 19: '#d4af37' };

export function theme(n) {
  if (n >= 11) return { ...THEMES[10], floor: GYM[n] ?? '#cccccc' };
  return THEMES[n] ?? THEMES[1];
}

/** Petit hachage de position : variations stables du décor. */
export const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function shadeHex(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export const shade = shadeHex;

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function ground(ctx, ox, oy, th, tx, ty) {
  ctx.fillStyle = th.g;
  ctx.fillRect(ox, oy, T, T);
  for (let k = 0; k < 3; k++) {
    const a = hash(tx * 7 + k, ty * 13 - k);
    ellipse(ctx, ox + a * T, oy + hash(ty + k, tx - k) * T, 10 + a * 12, 6 + a * 8, k % 2 ? `${th.gd}55` : `${th.gl}55`);
  }
  ctx.strokeStyle = th.gd;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const bx = ox + 4 + hash(tx * 3 + k, ty * 5) * (T - 8);
    const by = oy + 8 + hash(ty * 3 + k, tx * 5) * (T - 12);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 2, by - 5); ctx.moveTo(bx, by); ctx.lineTo(bx + 2, by - 6); ctx.stroke();
  }
}

/** Neighbour test, bords de carte compris (un chemin qui sort de la carte reste droit). */
function same(rows, x, y, set) {
  if (y < 0 || y >= rows.length || x < 0 || x >= rows[0].length) return true;
  return set.includes(rows[y][x]);
}

function path(ctx, ox, oy, th, rows, x, y) {
  const P = ',D';
  const up = same(rows, x, y - 1, P); const dn = same(rows, x, y + 1, P);
  const lf = same(rows, x - 1, y, P); const rt = same(rows, x + 1, y, P);
  const r = 16;
  ctx.fillStyle = th.p;
  ctx.beginPath();
  ctx.roundRect(ox, oy, T, T, [!up && !lf ? r : 0, !up && !rt ? r : 0, !dn && !rt ? r : 0, !dn && !lf ? r : 0]);
  ctx.fill();
  for (let k = 0; k < 5; k++) {
    const px = ox + 5 + hash(x * 3 + k, y) * (T - 10);
    const py = oy + 5 + hash(y * 5 + k, x) * (T - 10);
    ellipse(ctx, px, py, 2 + hash(k, x + y) * 2, 1.5, th.pd);
  }
}

function tree(ctx, ox, oy, th, r) {
  const cx = ox + T / 2;
  ellipse(ctx, cx + 6, oy + T - 6, 19, 7, 'rgba(0,0,0,0.22)');
  const trunk = ctx.createLinearGradient(cx - 5, 0, cx + 5, 0);
  trunk.addColorStop(0, '#7a5232'); trunk.addColorStop(1, '#5a3a22');
  ctx.fillStyle = trunk;
  ctx.beginPath(); ctx.roundRect(cx - 5, oy + T - 22, 10, 18, 3); ctx.fill();
  const cy = oy + T / 2 - 6;
  const R = 21 + r * 3;
  for (const [dx, dy, rr] of [[-9, 4, R * 0.7], [9, 4, R * 0.7], [0, -4, R * 0.85]]) {
    const g = ctx.createRadialGradient(cx + dx - rr * 0.35, cy + dy - rr * 0.45, rr * 0.1, cx + dx, cy + dy, rr);
    g.addColorStop(0, shadeHex(th.t, 0.35)); g.addColorStop(0.6, th.t); g.addColorStop(1, th.td);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx + dx, cy + dy, rr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (let k = 0; k < 4; k++) ellipse(ctx, cx - 8 + k * 4, cy - 10 + (k % 2) * 4, 2.5, 1.5, 'rgba(255,255,255,0.22)');
}

function flowers(ctx, ox, oy, th, tx, ty) {
  ground(ctx, ox, oy, th, tx, ty);
  const cols = ['#ff6b81', '#ffd34e', '#ffffff', '#b98cff', '#ff9f43'];
  for (let k = 0; k < 4; k++) {
    const fx = ox + 8 + hash(tx + k, ty * 2) * (T - 16);
    const fy = oy + 8 + hash(ty + k, tx * 3) * (T - 16);
    const c = cols[Math.floor(hash(tx * k, ty) * cols.length)];
    ctx.strokeStyle = '#3d8a3a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(fx, fy + 2); ctx.lineTo(fx, fy + 8); ctx.stroke();
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ellipse(ctx, fx + Math.cos(a) * 3, fy + Math.sin(a) * 3, 2.6, 2.6, c);
    }
    ellipse(ctx, fx, fy, 1.8, 1.8, '#ffe66d');
  }
}

function rock(ctx, ox, oy, th, tx, ty) {
  ground(ctx, ox, oy, th, tx, ty);
  ellipse(ctx, ox + T / 2 + 4, oy + T - 9, 18, 6, 'rgba(0,0,0,0.25)');
  const g = ctx.createRadialGradient(ox + 18, oy + 18, 3, ox + T / 2, oy + T / 2 + 4, 22);
  g.addColorStop(0, '#c9c4bd'); g.addColorStop(0.7, '#8f8981'); g.addColorStop(1, '#6a645d');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(ox + T / 2, oy + T / 2 + 4, 18, 15, 0, 0, Math.PI * 2); ctx.fill();
}

function water(ctx, ox, oy, th, rows, x, y) {
  const g = ctx.createLinearGradient(ox, oy, ox, oy + T);
  g.addColorStop(0, th.w); g.addColorStop(1, th.wd);
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, T, T);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const W = '~';
  if (!same(rows, x, y - 1, W)) ctx.fillRect(ox, oy, T, 3);
  if (!same(rows, x - 1, y, W)) ctx.fillRect(ox, oy, 3, T);
  if (!same(rows, x + 1, y, W)) ctx.fillRect(ox + T - 3, oy, 3, T);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  if (!same(rows, x, y + 1, W)) ctx.fillRect(ox, oy + T - 4, T, 4);
}

function floorWood(ctx, ox, oy, tx, ty) {
  for (let k = 0; k < 4; k++) {
    const c = ['#c99a6b', '#c08f60', '#d1a576', '#bd8c5c'][(k + ty) % 4];
    ctx.fillStyle = c;
    ctx.fillRect(ox, oy + k * 12, T, 12);
    ctx.fillStyle = 'rgba(80,45,20,0.25)';
    ctx.fillRect(ox, oy + k * 12 + 11, T, 1);
    ctx.fillRect(ox + ((tx * 17 + k * 29) % T), oy + k * 12, 1, 12);
  }
}

function floorGym(ctx, ox, oy, th, tx, ty) {
  const f = th.floor ?? '#cccccc';
  const g = ctx.createLinearGradient(ox, oy, ox + T, oy + T);
  const light = (tx + ty) % 2 === 0;
  g.addColorStop(0, light ? '#f6f3ec' : shadeHex(f, 0.45));
  g.addColorStop(1, light ? '#e4dfd3' : shadeHex(f, 0.2));
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, T, T);
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.strokeRect(ox + 0.5, oy + 0.5, T - 1, T - 1);
}

function innerWall(ctx, ox, oy, rows, x, y, gymTint) {
  const floorBelow = y + 1 < rows.length && '_mCSkQBp'.includes(rows[y + 1][x]) && y === 0;
  if (floorBelow) {
    const g = ctx.createLinearGradient(0, oy, 0, oy + T);
    g.addColorStop(0, gymTint ? shadeHex(gymTint, 0.5) : '#f3e3c3'); g.addColorStop(1, gymTint ? shadeHex(gymTint, 0.25) : '#e6cf9f');
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, T, T);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let k = 4; k < T; k += 12) ctx.fillRect(ox + k, oy, 2, T - 12);
    ctx.fillStyle = gymTint ? shadeHex(gymTint, -0.35) : '#8a6040';
    ctx.fillRect(ox, oy + T - 10, T, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(ox, oy + T - 10, T, 2);
  } else {
    ctx.fillStyle = '#4a3f52';
    ctx.fillRect(ox, oy, T, T);
    ctx.fillStyle = '#5c5066';
    ctx.fillRect(ox + 2, oy + 2, T - 4, T - 4);
  }
}

/** Mobilier des intérieurs. */
function furniture(ctx, ch, ox, oy, th, tx, ty, floor) {
  floor();
  const shadow = () => ellipse(ctx, ox + T / 2 + 3, oy + T - 6, 20, 6, 'rgba(0,0,0,0.2)');
  switch (ch) {
    case 'C': {
      const g = ctx.createLinearGradient(0, oy, 0, oy + T);
      g.addColorStop(0, '#f7efe0'); g.addColorStop(0.3, '#e9d8bb'); g.addColorStop(0.32, '#b8794a'); g.addColorStop(1, '#8e5a34');
      ctx.fillStyle = g;
      ctx.fillRect(ox, oy + 8, T, T - 8);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(ox, oy + 8, T, 2);
      break;
    }
    case 'S': {
      shadow();
      ctx.fillStyle = '#8a5a36'; ctx.fillRect(ox + 3, oy + 2, T - 6, T - 6);
      ctx.fillStyle = '#6d4426';
      for (let k = 0; k < 3; k++) ctx.fillRect(ox + 3, oy + 2 + k * 14 + 13, T - 6, 3);
      const cols = ['#e85d75', '#4fa6e6', '#ffd34e', '#7bd389', '#b98cff', '#ff9f43'];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
        ctx.fillStyle = cols[Math.floor(hash(tx * 9 + k, ty * 7 + r) * cols.length)];
        ctx.beginPath(); ctx.roundRect(ox + 7 + k * 9, oy + 5 + r * 14, 7, 10, 2); ctx.fill();
      }
      break;
    }
    case 'p': {
      shadow();
      ctx.fillStyle = '#c0633f'; ctx.beginPath(); ctx.roundRect(ox + 14, oy + 28, 20, 16, 4); ctx.fill();
      for (const [dx, dy, r] of [[0, -6, 12], [-9, 2, 9], [9, 2, 9]]) {
        const g = ctx.createRadialGradient(ox + 24 + dx - 3, oy + 20 + dy - 4, 1, ox + 24 + dx, oy + 20 + dy, r);
        g.addColorStop(0, '#9fe08a'); g.addColorStop(1, '#2f8a44');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox + 24 + dx, oy + 20 + dy, r, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'k':
      shadow();
      ctx.fillStyle = '#4a7fc0'; ctx.beginPath(); ctx.roundRect(ox + 6, oy + 10, T - 12, T - 16, 8); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(ox + 10, oy + 14, T - 20, 4);
      break;
    case 'Q': {
      ctx.fillStyle = '#7a4f30'; ctx.fillRect(ox + 4, oy, T - 8, T);
      ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.roundRect(ox + 7, oy + 3, T - 14, T - 6, 6); ctx.fill();
      if (ty === 1) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(ox + 11, oy + 7, T - 22, 14, 6); ctx.fill(); }
      else { ctx.fillStyle = '#e57373'; ctx.fillRect(ox + 7, oy, T - 14, T - 6); }
      break;
    }
    case 'B':
      shadow();
      ctx.fillStyle = '#a06a3d'; ctx.fillRect(ox, oy + 10, T, 26);
      ctx.fillStyle = '#c08552'; ctx.fillRect(ox, oy + 8, T, 6);
      ctx.fillStyle = '#7a4f30'; ctx.fillRect(ox + 4, oy + 36, 5, 8); ctx.fillRect(ox + T - 9, oy + 36, 5, 8);
      break;
    case 'm':
      ctx.fillStyle = '#c0475e'; ctx.beginPath(); ctx.roundRect(ox + 4, oy + 6, T - 8, T - 12, 6); ctx.fill();
      ctx.strokeStyle = '#ffd34e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(ox + 8, oy + 10, T - 16, T - 20, 4); ctx.stroke();
      break;
    default: break;
  }
}

/** Repère les bâtiments (rectangles de toit R, mur #, porte D) pour les dessiner d'un seul tenant. */
function buildings(rows) {
  const seen = new Set();
  const out = [];
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[0].length; x++) {
    if (rows[y][x] !== 'R' || seen.has(`${x},${y}`)) continue;
    let w = 0; while (rows[y][x + w] === 'R') w++;
    let h = 0; while (y + h < rows.length && 'R#Dd'.includes(rows[y + h][x])) h++;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seen.add(`${x + i},${y + j}`);
    out.push({ x, y, w, h });
  }
  return out;
}

function building(ctx, b, zone, roof) {
  const ox = b.x * T; const oy = b.y * T; const W = b.w * T; const H = b.h * T;
  const roofH = 2 * T;
  // ombre portée
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.roundRect(ox + 10, oy + 18, W + 6, H - 8, 10); ctx.fill();
  // mur
  const wall = ctx.createLinearGradient(0, oy + roofH, 0, oy + H);
  wall.addColorStop(0, '#fbf3e4'); wall.addColorStop(1, '#e8dcc6');
  ctx.fillStyle = wall;
  ctx.fillRect(ox + 4, oy + roofH - 6, W - 8, H - roofH + 6);
  ctx.fillStyle = '#cdbb9d';
  ctx.fillRect(ox + 4, oy + H - 6, W - 8, 6);
  // fenêtres
  for (let i = 0; i < b.w; i++) {
    for (let j = 2; j < b.h; j++) {
      const ch = zone.rows[b.y + j][b.x + i];
      if (ch !== '#' || (j === b.h - 1 && Math.abs(i - Math.floor(b.w / 2)) === 0)) continue;
      if ((i + j) % 2 === 1 || i === 0 || i === b.w - 1) continue;
      const wx = ox + i * T + 10; const wy = oy + j * T + 10;
      ctx.fillStyle = '#8a6a4a'; ctx.beginPath(); ctx.roundRect(wx - 3, wy - 3, T - 14, T - 22, 4); ctx.fill();
      const gl = ctx.createLinearGradient(wx, wy, wx + 20, wy + 20);
      gl.addColorStop(0, '#d9f1ff'); gl.addColorStop(1, '#7fb6e0');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.roundRect(wx, wy, T - 20, T - 28, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(wx + 3, wy + 3, 6, 2);
    }
  }
  // porte
  for (let i = 0; i < b.w; i++) {
    const ch = zone.rows[b.y + b.h - 1][b.x + i];
    if (ch !== 'D' && ch !== 'd') continue;
    const dx = ox + i * T + 8; const dy = oy + (b.h - 1) * T + 2;
    ctx.fillStyle = '#5c3a22'; ctx.beginPath(); ctx.roundRect(dx - 3, dy - 3, T - 10, T - 1, [10, 10, 0, 0]); ctx.fill();
    const dg = ctx.createLinearGradient(dx, 0, dx + T - 16, 0);
    dg.addColorStop(0, '#a8703f'); dg.addColorStop(1, '#7d4f2a');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.roundRect(dx, dy, T - 16, T - 4, [8, 8, 0, 0]); ctx.fill();
    ellipse(ctx, dx + T - 22, dy + 24, 2.5, 2.5, '#ffd34e');
    ctx.fillStyle = '#b9a07c'; ctx.fillRect(dx - 6, oy + H - 3, T - 4, 3);
  }
  // toit (débord, dégradé, tuiles)
  const rg = ctx.createLinearGradient(0, oy - 6, 0, oy + roofH);
  rg.addColorStop(0, shadeHex(roof, 0.25)); rg.addColorStop(1, shadeHex(roof, -0.25));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(ox - 4, oy + roofH);
  ctx.lineTo(ox + 10, oy - 4);
  ctx.lineTo(ox + W - 10, oy - 4);
  ctx.lineTo(ox + W + 4, oy + roofH);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.13)';
  ctx.lineWidth = 2;
  for (let y = oy + 10; y < oy + roofH; y += 11) {
    const k = (y - oy + 4) / (roofH + 4);
    ctx.beginPath(); ctx.moveTo(ox + 10 - 14 * k, y); ctx.lineTo(ox + W - 10 + 14 * k, y); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(ox + 10, oy - 4, W - 20, 4);
  ctx.fillStyle = shadeHex(roof, -0.45);
  ctx.fillRect(ox - 4, oy + roofH - 4, W + 8, 5);
  // cheminée
  ctx.fillStyle = '#9b6b52'; ctx.fillRect(ox + W - 34, oy - 14, 12, 22);
  ctx.fillStyle = '#7a5040'; ctx.fillRect(ox + W - 36, oy - 16, 16, 5);
}

/** Enseignes des centres, boutiques et arènes (positions fixes du plan de ville). */
function emblem(ctx, x, y, kind, color) {
  const cx = x * T + T / 2; const cy = y * T + 14;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = color;
  if (kind === 'center') { ctx.fillRect(cx - 3, cy - 8, 6, 16); ctx.fillRect(cx - 8, cy - 3, 16, 6); }
  else if (kind === 'shop') { ctx.beginPath(); ctx.roundRect(cx - 7, cy - 3, 14, 10, 2); ctx.fill(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy - 3, 4, Math.PI, 0); ctx.stroke(); }
  else { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5; const r = k % 2 ? 4 : 9; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.fill(); }
}

/** Couleur de toit selon le bâtiment (même plan pour toutes les villes). */
export function roofAt(zone, x, y) {
  if (y <= 5 && x >= 4 && x <= 9) return '#e0525b';
  if (y <= 5 && x >= 20 && x <= 25) return '#3f86e0';
  if (y <= 4 && x >= 12 && x <= 17) return '#d4a72c';
  if (zone.index === 1 && y >= 14 && x >= 20) return '#3fb3a6';      // laboratoire du professeur
  if (y >= 14 && x >= 4 && x <= 9 && zone.index >= 2 && zone.index <= 9) return ['#5fb84f', '#3f8fdf', '#e6b72a', '#8c7a63', '#5fb2d8', '#6fc3d6', '#9a5cc8', '#5d579c'][zone.index - 2];
  return ['#a0614a', '#6f8f5a', '#8a5f86', '#5f7398'][((x < 15 ? 0 : 1) + (y > 10 ? 2 : 0) + zone.index) % 4];
}

/** Toute la carte dessinée une fois (les herbes hautes et les reflets de l'eau sont animés à part). */
export function renderZone(zone) {
  const th = theme(zone.theme);
  const rows = zone.rows;
  const c = document.createElement('canvas');
  c.width = rows[0].length * T;
  c.height = rows.length * T;
  const ctx = c.getContext('2d');
  const inside = zone.kind === 'inside';
  const gym = zone.kind === 'gym';
  const gymTint = gym ? (th.floor ?? '#cccccc') : null;
  // 1. sols
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ox = x * T; const oy = y * T;
      const ch = row[x];
      if (inside || gym) {
        const floor = () => (gym ? floorGym(ctx, ox, oy, th, x, y) : floorWood(ctx, ox, oy, x, y));
        if (ch === 'W') innerWall(ctx, ox, oy, rows, x, y, gymTint);
        else if (ch === 'D') { floor(); ctx.fillStyle = '#3b2c22'; ctx.fillRect(ox + 6, oy, T - 12, T); ctx.fillStyle = '#f7d27a55'; ctx.fillRect(ox + 10, oy, T - 20, T); }
        else if (ch === 'r') { floor(); ellipse(ctx, ox + T / 2 + 3, oy + T - 6, 16, 6, 'rgba(0,0,0,0.25)'); const g = ctx.createLinearGradient(ox + 12, 0, ox + 36, 0); g.addColorStop(0, '#f0ece4'); g.addColorStop(1, '#a8a196'); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(ox + 12, oy - 10, 24, T + 2, 6); ctx.fill(); ellipse(ctx, ox + T / 2, oy - 10, 14, 5, gymTint ?? '#d4af37'); }
        else if ('CSpkQBm'.includes(ch)) furniture(ctx, ch, ox, oy, th, x, y, floor);
        else floor();
        continue;
      }
      if (ch === ',' || ch === 'D' || ch === 'd') { ground(ctx, ox, oy, th, x, y); path(ctx, ox, oy, th, rows, x, y); }
      else if (ch === '~') water(ctx, ox, oy, th, rows, x, y);
      else if (ch === 'f') flowers(ctx, ox, oy, th, x, y);
      else if (ch === '"') { ground(ctx, ox, oy, th, x, y); ellipse(ctx, ox + T / 2, oy + T / 2 + 4, T / 2, T / 2 - 4, `${th.gd}aa`); }
      else ground(ctx, ox, oy, th, x, y);
    }
  });
  if (!inside && !gym) {
    // 2. rochers et arbres, rangée par rangée (les feuillages débordent sur la rangée du dessus)
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === 'T') tree(ctx, x * T, y * T, th, hash(x, y));
        else if (row[x] === 'r') rock(ctx, x * T, y * T, th, x, y);
      }
    });
    // 3. bâtiments
    for (const b of buildings(rows)) building(ctx, b, zone, roofAt(zone, b.x, b.y));
    if (zone.kind === 'town') {
      emblem(ctx, 7, 6, 'center', '#e0525b');
      emblem(ctx, 23, 6, 'shop', '#3f86e0');
      if (zone.index >= 2 && zone.index <= 9) emblem(ctx, 7, 16, 'gym', roofAt(zone, 4, 14));
      if (zone.index === 10) emblem(ctx, 15, 5, 'gym', '#d4af37');
    }
  }
  return c;
}

/** Herbes hautes animées (dessinées à chaque image) : `front` ne dessine que les brins de devant. */
export function drawGrass(ctx, ox, oy, s, th, time, tx, ty, front = false) {
  const n = 7;
  for (let k = 0; k < n; k++) {
    if (front && k % 2 === 0) continue;
    const bx = ox + (4 + k * ((T - 8) / (n - 1))) * s;
    const base = oy + (T - 2) * s;
    const h = (front ? 22 : 30 + hash(tx * 7 + k, ty) * 10) * s;
    const sway = Math.sin(time / 520 + tx * 0.7 + ty * 0.4 + k) * 4 * s;
    const g = ctx.createLinearGradient(0, base - h, 0, base);
    g.addColorStop(0, shadeHex(th.t, 0.35)); g.addColorStop(1, th.td);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx - 4 * s, base);
    ctx.quadraticCurveTo(bx - 2 * s, base - h * 0.6, bx + sway, base - h);
    ctx.quadraticCurveTo(bx + 2 * s, base - h * 0.6, bx + 4 * s, base);
    ctx.fill();
  }
}

/** Reflets mobiles sur l'eau. */
export function drawWater(ctx, ox, oy, s, time, tx, ty) {
  const t = time / 900 + hash(tx, ty) * 6;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (let k = 0; k < 2; k++) {
    const p = (t + k * 0.5) % 1;
    const x = ox + (8 + ((hash(tx + k, ty) * 30 + p * 14) % 32)) * s;
    const y = oy + (12 + k * 18) * s;
    ctx.globalAlpha = Math.sin(p * Math.PI);
    ctx.beginPath(); ctx.ellipse(x, y, 7 * s, 1.6 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Cases où l'on marche (même règle que le serveur). */
export const WALKABLE = new Set(['.', ',', '"', 'f', 'D', '_', 'b', 's', 'm']);
