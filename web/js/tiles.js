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
  // taches de lumière et d'ombre douces
  for (let k = 0; k < 4; k++) {
    const a = hash(tx * 7 + k, ty * 13 - k);
    ellipse(ctx, ox + a * T, oy + hash(ty + k, tx - k) * T, 9 + a * 12, 5 + a * 7, k % 2 ? `${th.gd}44` : `${th.gl}55`);
  }
  // brins d'herbe fins, deux tons
  ctx.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    const bx = ox + 3 + hash(tx * 3 + k, ty * 5) * (T - 6);
    const by = oy + 6 + hash(ty * 3 + k, tx * 5) * (T - 8);
    const h = 3 + hash(k, tx + ty) * 4;
    ctx.strokeStyle = k % 3 ? th.gd : shade(th.gl, 0.15);
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 1, by - h * 0.6, bx - 2, by - h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + 1, by); ctx.quadraticCurveTo(bx + 2, by - h * 0.5, bx + 3, by - h * 0.9); ctx.stroke();
  }
  // trèfles et petites fleurs isolées
  if (hash(tx * 31, ty * 17) > 0.82) {
    const fx = ox + 10 + hash(tx, ty * 3) * 28; const fy = oy + 10 + hash(ty, tx * 3) * 28;
    for (let p = 0; p < 3; p++) ellipse(ctx, fx + Math.cos(p * 2.1) * 2.2, fy + Math.sin(p * 2.1) * 2.2, 2, 2, shade(th.gd, -0.1));
  }
  if (hash(tx * 13, ty * 29) > 0.9) ellipse(ctx, ox + 8 + hash(tx, ty) * 30, oy + 8 + hash(ty, tx) * 30, 1.6, 1.6, hash(tx, ty * 7) > 0.5 ? '#fff6c8' : '#ffd1e0');
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
  const corners = [!up && !lf ? r : 0, !up && !rt ? r : 0, !dn && !rt ? r : 0, !dn && !lf ? r : 0];
  // bordure sombre, puis terre battue avec un centre plus clair
  ctx.fillStyle = th.pd;
  ctx.beginPath(); ctx.roundRect(ox, oy, T, T, corners); ctx.fill();
  const g = ctx.createRadialGradient(ox + T / 2, oy + T / 2, 4, ox + T / 2, oy + T / 2, T * 0.75);
  g.addColorStop(0, shade(th.p, 0.18)); g.addColorStop(1, th.p);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(ox + (lf ? 0 : 2), oy + (up ? 0 : 2), T - (lf ? 0 : 2) - (rt ? 0 : 2), T - (up ? 0 : 2) - (dn ? 0 : 2), corners.map((c) => Math.max(0, c - 2))); ctx.fill();
  // cailloux et grains
  for (let k = 0; k < 8; k++) {
    const px = ox + 5 + hash(x * 3 + k, y) * (T - 10);
    const py = oy + 5 + hash(y * 5 + k, x) * (T - 10);
    const rr = 1 + hash(k, x + y) * 2.4;
    ellipse(ctx, px + 0.6, py + 0.8, rr, rr * 0.7, 'rgba(0,0,0,0.12)');
    ellipse(ctx, px, py, rr, rr * 0.7, k % 3 ? th.pd : shade(th.p, 0.35));
  }
  // pierres de bordure du côté de l'herbe
  ctx.fillStyle = shade(th.pd, -0.1);
  const stones = (sx, sy, horiz) => { for (let k = 0; k < 4; k++) { const o = 6 + k * 11 + hash(x + k, y) * 3; ellipse(ctx, horiz ? ox + o : sx, horiz ? sy : oy + o, 3.2, 2.2, k % 2 ? shade(th.pd, -0.05) : shade(th.p, -0.2)); } };
  if (!up) stones(0, oy + 2, true);
  if (!dn) stones(0, oy + T - 2, true);
  if (!lf) stones(ox + 2, 0, false);
  if (!rt) stones(ox + T - 2, 0, false);
}

function tree(ctx, ox, oy, th, r) {
  const cx = ox + T / 2;
  ellipse(ctx, cx + 7, oy + T - 5, 21, 7, 'rgba(0,0,0,0.25)');
  // tronc avec racines et écorce
  const trunk = ctx.createLinearGradient(cx - 6, 0, cx + 6, 0);
  trunk.addColorStop(0, '#8a5d38'); trunk.addColorStop(0.5, '#6d4626'); trunk.addColorStop(1, '#4e3119');
  ctx.fillStyle = trunk;
  ctx.beginPath();
  ctx.moveTo(cx - 5, oy + T - 22); ctx.lineTo(cx + 5, oy + T - 22); ctx.lineTo(cx + 6, oy + T - 7);
  ctx.quadraticCurveTo(cx + 10, oy + T - 4, cx + 11, oy + T - 3); ctx.lineTo(cx - 11, oy + T - 3);
  ctx.quadraticCurveTo(cx - 10, oy + T - 4, cx - 6, oy + T - 7); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(40,20,5,0.35)'; ctx.lineWidth = 0.8;
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(cx - 3 + k * 3, oy + T - 20); ctx.lineTo(cx - 3 + k * 3 + (k - 1), oy + T - 8); ctx.stroke(); }
  // feuillage : trois masses, chacune faite de grappes de feuilles avec ombre et lumière
  const cy = oy + T / 2 - 7;
  const R = 20 + r * 3;
  const blobs = [[-10, 5, R * 0.68], [10, 5, R * 0.68], [0, -5, R * 0.82]];
  for (const [dx, dy, rr] of blobs) {
    const g = ctx.createRadialGradient(cx + dx - rr * 0.35, cy + dy - rr * 0.45, rr * 0.1, cx + dx, cy + dy, rr);
    g.addColorStop(0, shade(th.t, 0.25)); g.addColorStop(0.65, th.t); g.addColorStop(1, th.td);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx + dx, cy + dy, rr, 0, Math.PI * 2); ctx.fill();
  }
  for (let k = 0; k < 16; k++) {
    const a = hash(k, r * 100) * Math.PI * 2;
    const d = 4 + hash(r * 50, k) * (R - 6);
    const lx = cx + Math.cos(a) * d; const ly = cy + Math.sin(a) * d * 0.85;
    const lit = Math.cos(a + 2.3) * 0.5 + 0.5;
    ellipse(ctx, lx + 1, ly + 1.5, 4.2, 3.2, `${th.td}88`);
    ellipse(ctx, lx, ly, 4, 3, lit > 0.55 ? shade(th.t, 0.32) : shade(th.t, 0.06));
  }
  for (let k = 0; k < 6; k++) ellipse(ctx, cx - 12 + hash(k, r) * 14, cy - 10 + hash(r, k) * 10, 1.6, 1.1, 'rgba(255,255,230,0.55)');
  if (r > 0.78) for (let k = 0; k < 3; k++) ellipse(ctx, cx - 8 + k * 7, cy + 2 + (k % 2) * 6, 2.2, 2.2, '#e2405a');
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

/** Petit buisson taillable (capsule spéciale Coupe) : plus bas qu'un arbre, avec des baies. */
function bush(ctx, ox, oy, th, tx, ty) {
  ground(ctx, ox, oy, th, tx, ty);
  ellipse(ctx, ox + T / 2 + 4, oy + T - 8, 18, 6, 'rgba(0,0,0,0.22)');
  for (const [dx, dy, r] of [[-8, 4, 11], [8, 4, 11], [0, -4, 13]]) {
    const g = ctx.createRadialGradient(ox + T / 2 + dx - 4, oy + T / 2 + dy - 5, 1, ox + T / 2 + dx, oy + T / 2 + dy, r);
    g.addColorStop(0, '#8fdc6a'); g.addColorStop(1, '#3d8a35');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox + T / 2 + dx, oy + T / 2 + dy, r, 0, Math.PI * 2); ctx.fill();
  }
  for (const [bx, by] of [[18, 20], [29, 24], [23, 30]]) ellipse(ctx, ox + bx, oy + by, 2.4, 2.4, '#e2405a');
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
  const W = '~';
  const g = ctx.createLinearGradient(ox, oy, ox + T, oy + T);
  g.addColorStop(0, shade(th.w, 0.08)); g.addColorStop(1, th.wd);
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, T, T);
  // fond plus sombre au large, plus clair près des rives
  const edge = !same(rows, x, y - 1, W) || !same(rows, x - 1, y, W) || !same(rows, x + 1, y, W) || !same(rows, x, y + 1, W);
  if (!edge) { ctx.fillStyle = 'rgba(10,40,90,0.18)'; ctx.fillRect(ox, oy, T, T); }
  // rives : sable mouillé et écume
  const foam = (fx, fy, w, h) => { ctx.fillStyle = 'rgba(232,214,170,0.9)'; ctx.fillRect(fx, fy, w, h); ctx.fillStyle = 'rgba(255,255,255,0.75)'; };
  if (!same(rows, x, y - 1, W)) { foam(ox, oy, T, 4); for (let k = 0; k < 5; k++) ellipse(ctx, ox + 5 + k * 10, oy + 5, 4, 1.6, 'rgba(255,255,255,0.8)'); }
  if (!same(rows, x - 1, y, W)) { foam(ox, oy, 4, T); for (let k = 0; k < 5; k++) ellipse(ctx, ox + 5, oy + 5 + k * 10, 1.6, 4, 'rgba(255,255,255,0.8)'); }
  if (!same(rows, x + 1, y, W)) { foam(ox + T - 4, oy, 4, T); for (let k = 0; k < 5; k++) ellipse(ctx, ox + T - 5, oy + 5 + k * 10, 1.6, 4, 'rgba(255,255,255,0.8)'); }
  if (!same(rows, x, y + 1, W)) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(ox, oy + T - 5, T, 5); }
  // nénuphars
  if (hash(x * 5, y * 11) > 0.8) {
    const lx = ox + 12 + hash(x, y) * 22; const ly = oy + 12 + hash(y, x) * 22;
    ctx.fillStyle = '#4caf50';
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.arc(lx, ly, 7, 0.4, Math.PI * 2 - 0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(lx - 2, ly - 2, 3, 0, Math.PI * 2); ctx.fill();
    if (hash(y, x * 3) > 0.5) { for (let p = 0; p < 5; p++) ellipse(ctx, lx + Math.cos(p * 1.26) * 2.5, ly - 3 + Math.sin(p * 1.26) * 2.5, 2, 2, '#ffc4dc'); ellipse(ctx, lx, ly - 3, 1.4, 1.4, '#ffe66d'); }
  }
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
  // ombre portée douce
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = `rgba(0,0,0,${0.07})`;
    ctx.beginPath(); ctx.roundRect(ox + 6 + k * 3, oy + 14 + k * 2, W + 2, H - 6, 12); ctx.fill();
  }
  // mur : enduit, colombages, soubassement de pierre
  const wy = oy + roofH - 6;
  const wall = ctx.createLinearGradient(0, wy, 0, oy + H);
  wall.addColorStop(0, '#fff8ec'); wall.addColorStop(1, '#eadfc9');
  ctx.fillStyle = wall;
  ctx.fillRect(ox + 4, wy, W - 8, H - roofH + 6);
  ctx.fillStyle = 'rgba(120,80,45,0.55)';
  for (let i = 1; i < b.w; i++) ctx.fillRect(ox + i * T - 2, wy, 4, H - roofH - 4);
  ctx.fillRect(ox + 4, oy + roofH + T - 3, W - 8, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(ox + 4, wy, W - 8, 8);
  for (let i = 0; i < b.w * 4; i++) {
    const sx = ox + 4 + i * 12; const c = hash(i, b.x + b.y) > 0.5 ? '#b9ab93' : '#a8997f';
    ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(sx, oy + H - 9, 11, 8, 2); ctx.fill();
  }
  // fenêtres : volets, rideaux, reflets, jardinières fleuries
  for (let i = 0; i < b.w; i++) {
    for (let j = 2; j < b.h; j++) {
      const ch = zone.rows[b.y + j][b.x + i];
      if (ch !== '#') continue;
      if ((i + j) % 2 === 1 || i === 0 || i === b.w - 1) continue;
      const wx = ox + i * T + 12; const wy2 = oy + j * T + 8;
      const ww = T - 24; const wh = T - 26;
      ctx.fillStyle = shade(roof, -0.1);
      ctx.beginPath(); ctx.roundRect(wx - 9, wy2 - 1, 7, wh + 2, 2); ctx.fill();
      ctx.beginPath(); ctx.roundRect(wx + ww + 2, wy2 - 1, 7, wh + 2, 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (const sx of [wx - 8, wx + ww + 3]) for (let k = 0; k < 4; k++) ctx.fillRect(sx, wy2 + 2 + k * 4, 5, 1);
      ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.roundRect(wx - 2, wy2 - 2, ww + 4, wh + 4, 3); ctx.fill();
      const gl = ctx.createLinearGradient(wx, wy2, wx + ww, wy2 + wh);
      gl.addColorStop(0, '#e6f6ff'); gl.addColorStop(0.5, '#9ccbee'); gl.addColorStop(1, '#5d93c4');
      ctx.fillStyle = gl; ctx.fillRect(wx, wy2, ww, wh);
      ctx.fillStyle = '#fff3f0';
      ctx.beginPath(); ctx.moveTo(wx, wy2); ctx.lineTo(wx + 7, wy2); ctx.quadraticCurveTo(wx + 3, wy2 + wh * 0.6, wx, wy2 + wh); ctx.fill();
      ctx.beginPath(); ctx.moveTo(wx + ww, wy2); ctx.lineTo(wx + ww - 7, wy2); ctx.quadraticCurveTo(wx + ww - 3, wy2 + wh * 0.6, wx + ww, wy2 + wh); ctx.fill();
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(wx + ww / 2 - 1, wy2, 2, wh); ctx.fillRect(wx, wy2 + wh / 2 - 1, ww, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.moveTo(wx + 3, wy2 + 9); ctx.lineTo(wx + 9, wy2 + 2); ctx.lineTo(wx + 12, wy2 + 2); ctx.lineTo(wx + 5, wy2 + 9); ctx.fill();
      // jardinière
      ctx.fillStyle = '#8a5a36'; ctx.beginPath(); ctx.roundRect(wx - 4, wy2 + wh + 2, ww + 8, 6, 2); ctx.fill();
      for (let k = 0; k < 6; k++) {
        const fx = wx - 2 + k * ((ww + 4) / 5);
        ellipse(ctx, fx, wy2 + wh + 1, 3, 2.6, '#4c9a3e');
        ellipse(ctx, fx, wy2 + wh - 1, 1.8, 1.8, ['#ff6b81', '#ffd34e', '#ffffff', '#b98cff'][(k + i + j) % 4]);
      }
    }
  }
  // porte : encadrement, marche, poignée, lanterne
  for (let i = 0; i < b.w; i++) {
    const ch = zone.rows[b.y + b.h - 1][b.x + i];
    if (ch !== 'D' && ch !== 'd') continue;
    const dx = ox + i * T + 8; const dy = oy + (b.h - 1) * T + 2;
    ctx.fillStyle = '#b9a07c'; ctx.beginPath(); ctx.roundRect(dx - 8, oy + H - 5, T, 7, 3); ctx.fill();
    ctx.fillStyle = '#5c3a22'; ctx.beginPath(); ctx.roundRect(dx - 4, dy - 4, T - 8, T, [12, 12, 0, 0]); ctx.fill();
    const dg = ctx.createLinearGradient(dx, 0, dx + T - 16, 0);
    dg.addColorStop(0, '#b47a45'); dg.addColorStop(1, '#7d4f2a');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.roundRect(dx, dy, T - 16, T - 5, [10, 10, 0, 0]); ctx.fill();
    ctx.fillStyle = 'rgba(60,30,10,0.35)';
    for (let k = 1; k < 3; k++) ctx.fillRect(dx + k * (T - 16) / 3, dy + 4, 1.2, T - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.roundRect(dx + 6, dy + 5, T - 28, 8, 4); ctx.fill();
    ellipse(ctx, dx + T - 21, dy + 25, 2.6, 2.6, '#ffd34e');
    ellipse(ctx, dx + T - 21.6, dy + 24.4, 0.9, 0.9, '#fff7c2');
    // lanterne
    const lx = dx + T - 4; const ly = dy + 6;
    ctx.fillStyle = '#3a3340'; ctx.fillRect(lx - 1, ly - 6, 2, 6);
    const lg = ctx.createRadialGradient(lx, ly + 4, 0, lx, ly + 4, 12);
    lg.addColorStop(0, 'rgba(255,220,130,0.55)'); lg.addColorStop(1, 'rgba(255,220,130,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, ly + 4, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3340'; ctx.beginPath(); ctx.roundRect(lx - 4, ly, 8, 9, 2); ctx.fill();
    ctx.fillStyle = '#ffe08a'; ctx.fillRect(lx - 2.5, ly + 1.5, 5, 6);
  }
  // toit : débord, rangées de tuiles décalées et ombrées, faîtage, cheminée
  const rg = ctx.createLinearGradient(0, oy - 6, 0, oy + roofH);
  rg.addColorStop(0, shade(roof, 0.28)); rg.addColorStop(1, shade(roof, -0.22));
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.moveTo(ox - 6, oy + roofH); ctx.lineTo(ox + 10, oy - 4); ctx.lineTo(ox + W - 10, oy - 4); ctx.lineTo(ox + W + 6, oy + roofH);
  ctx.closePath(); ctx.fill();
  ctx.save();
  ctx.clip();
  for (let row = 0, y = oy + 2; y < oy + roofH; y += 9, row++) {
    const k = (y - oy + 4) / (roofH + 4);
    const x0 = ox + 10 - 16 * k; const x1 = ox + W - 10 + 16 * k;
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(x0, y + 7, x1 - x0, 2);
    for (let x = x0 + (row % 2) * 6; x < x1; x += 12) {
      ctx.fillStyle = hash(Math.round(x), row) > 0.85 ? shade(roof, -0.12) : 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.roundRect(x, y, 11, 8, [0, 0, 4, 4]); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x + 11, y + 1, 1, 7);
    }
  }
  ctx.restore();
  ctx.fillStyle = shade(roof, 0.35); ctx.fillRect(ox + 10, oy - 6, W - 20, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(ox + 10, oy - 6, W - 20, 1.5);
  ctx.fillStyle = shade(roof, -0.5); ctx.fillRect(ox - 6, oy + roofH - 4, W + 12, 5);
  ctx.fillStyle = '#a2735a'; ctx.fillRect(ox + W - 36, oy - 16, 13, 24);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; for (let k = 0; k < 4; k++) ctx.fillRect(ox + W - 36, oy - 12 + k * 6, 13, 1);
  ctx.fillStyle = '#7a5040'; ctx.fillRect(ox + W - 38, oy - 18, 17, 5);
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
  // double résolution (plafonnée pour les grands plans sur téléphone)
  const Q = Math.min(2, Math.sqrt(14e6 / (rows[0].length * T * rows.length * T)));
  c.width = Math.round(rows[0].length * T * Q);
  c.height = Math.round(rows.length * T * Q);
  const ctx = c.getContext('2d');
  ctx.scale(Q, Q);
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
      else if (ch === 'x') bush(ctx, ox, oy, th, x, y);
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
  // touffes irrégulières : brins de hauteurs, d'épaisseurs et de teintes variées, qui ondulent
  const n = front ? 7 : 13;
  for (let k = 0; k < n; k++) {
    const r1 = hash(tx * 7 + k * 3, ty * 5 + k);
    const r2 = hash(ty * 3 + k, tx * 11 - k);
    const bx = ox + (2 + r1 * (T - 4)) * s;
    const base = oy + (T - 1 - (front ? 0 : r2 * 10)) * s;
    const h = (front ? 16 + r2 * 10 : 22 + r2 * 20) * s;
    const w = (2.4 + r1 * 2.2) * s;
    const sway = Math.sin(time / 520 + tx * 0.7 + ty * 0.4 + k * 0.9) * 4 * s;
    const light = 0.15 + (k % 3) * 0.12 + (front ? 0.05 : 0);
    const g = ctx.createLinearGradient(0, base - h, 0, base);
    g.addColorStop(0, shade(th.t, light + 0.25)); g.addColorStop(1, shade(th.td, -0.1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx - w, base);
    ctx.quadraticCurveTo(bx - w * 0.4, base - h * 0.55, bx + sway, base - h);
    ctx.quadraticCurveTo(bx + w * 0.5, base - h * 0.5, bx + w, base);
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
