// Bramblekin — décor : chaque case (16 × 16) est peinte pixel par pixel selon l'ambiance de la carte.

/** Ambiances : 1 à 10 villes (et leurs routes), 11 à 18 arènes, 19 Ligue. */
const THEMES = {
  1: { g: '#7cc46a', gd: '#5ea653', t: '#2f8a4a', td: '#1f6237', p: '#e3c98f', pd: '#c9ab6e', w: '#4aa0e0' },
  2: { g: '#86c860', gd: '#68ad48', t: '#3a8f3c', td: '#24662b', p: '#dcc28a', pd: '#c0a46a', w: '#4aa0e0' },
  3: { g: '#80c483', gd: '#61a568', t: '#2f7d5a', td: '#1d5a40', p: '#e6d3a4', pd: '#c9b382', w: '#3d8fd6' },
  4: { g: '#a5c95c', gd: '#87ac43', t: '#5b8a32', td: '#3d6622', p: '#e2c67e', pd: '#c4a65c', w: '#4aa0e0' },
  5: { g: '#a9b88a', gd: '#8b9b6d', t: '#5c7350', td: '#3f5237', p: '#c7b493', pd: '#a8936f', w: '#4a8dc0' },
  6: { g: '#9fd18f', gd: '#82b574', t: '#4c9a6a', td: '#336f4b', p: '#e8d6a8', pd: '#ccb886', w: '#5ab0e8' },
  7: { g: '#e6eef2', gd: '#c9d7de', t: '#5d8c86', td: '#3d6560', p: '#c8d4dc', pd: '#a9b8c2', w: '#7cc2e6' },
  8: { g: '#6f8f5a', gd: '#577545', t: '#3d5a38', td: '#283d26', p: '#a99a75', pd: '#8b7c58', w: '#4f7a6a' },
  9: { g: '#7d7fa6', gd: '#64668c', t: '#45436e', td: '#2e2c4f', p: '#a59cb5', pd: '#867d98', w: '#5b6cb0' },
  10: { g: '#c9d9e0', gd: '#aabfc8', t: '#4f7a72', td: '#355550', p: '#d9d2c4', pd: '#bdb4a3', w: '#7cc2e6' },
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

function px(ctx, x, y, c, w = 1, h = 1) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

function ground(ctx, ox, oy, th, r) {
  px(ctx, ox, oy, th.g, 16, 16);
  for (let k = 0; k < 6; k++) {
    const a = hash(ox + k * 7, oy + k * 13);
    px(ctx, ox + Math.floor(a * 15), oy + Math.floor(hash(oy + k, ox - k) * 15), th.gd);
  }
  if (r > 0.85) { px(ctx, ox + 5, oy + 9, th.gd, 1, 2); px(ctx, ox + 6, oy + 8, th.gd); }
}

/** Peint la case `ch` en (ox, oy) ; `frame` anime l'eau. */
export function drawTile(ctx, ch, ox, oy, th, frame, tx, ty, roof) {
  const r = hash(tx, ty);
  switch (ch) {
    case '.': ground(ctx, ox, oy, th, r); break;
    case ',': {
      px(ctx, ox, oy, th.p, 16, 16);
      for (let k = 0; k < 5; k++) px(ctx, ox + Math.floor(hash(tx * 3 + k, ty) * 15), oy + Math.floor(hash(ty * 5 + k, tx) * 15), th.pd);
      break;
    }
    case '"': {
      ground(ctx, ox, oy, th, r);
      for (let k = 0; k < 4; k++) {
        const bx = ox + 1 + k * 4;
        px(ctx, bx, oy + 6, th.gd, 1, 9); px(ctx, bx + 1, oy + 3, th.td, 1, 12); px(ctx, bx + 2, oy + 7, th.gd, 1, 8);
        px(ctx, bx + 1, oy + 2, th.t);
      }
      break;
    }
    case 'f': {
      ground(ctx, ox, oy, th, r);
      const cols = ['#f05a5a', '#ffd84a', '#ffffff', '#c77dff'];
      for (let k = 0; k < 3; k++) {
        const fx = ox + 2 + Math.floor(hash(tx + k, ty * 2) * 11);
        const fy = oy + 2 + Math.floor(hash(ty + k, tx * 3) * 11);
        px(ctx, fx, fy, cols[(k + Math.floor(r * 4)) % 4]); px(ctx, fx - 1, fy, cols[(k + 1) % 4]); px(ctx, fx + 1, fy, cols[(k + 1) % 4]);
        px(ctx, fx, fy - 1, cols[(k + 1) % 4]); px(ctx, fx, fy + 1, '#3d7a3a');
      }
      break;
    }
    case 'T': {
      ground(ctx, ox, oy, th, r);
      px(ctx, ox + 6, oy + 11, '#6b4a2f', 4, 5);
      px(ctx, ox + 2, oy + 2, th.td, 12, 10);
      px(ctx, ox + 1, oy + 4, th.td, 14, 6);
      px(ctx, ox + 3, oy + 1, th.t, 10, 9);
      px(ctx, ox + 2, oy + 3, th.t, 12, 6);
      px(ctx, ox + 5, oy + 2, '#ffffff22', 4, 2);
      px(ctx, ox + 4, oy + 3, th.g, 2, 1);
      px(ctx, ox + 9, oy + 6, th.g, 2, 1);
      break;
    }
    case '~': {
      px(ctx, ox, oy, th.w, 16, 16);
      const s = (frame + Math.floor(r * 4)) % 4;
      px(ctx, ox + ((2 + s * 3) % 14), oy + 4, '#ffffff99', 3, 1);
      px(ctx, ox + ((9 + s * 2) % 13), oy + 10, '#ffffff77', 3, 1);
      break;
    }
    case 'R': {
      const c = roof ?? '#b5533c';
      px(ctx, ox, oy, c, 16, 16);
      for (let y = 3; y < 16; y += 4) px(ctx, ox, oy + y, '#00000033', 16, 1);
      for (let y = 0; y < 16; y += 4) px(ctx, ox + ((y / 4) % 2) * 4 + 2, oy + y, '#00000022', 1, 3);
      break;
    }
    case '#': {
      px(ctx, ox, oy, '#efe4cf', 16, 16);
      px(ctx, ox, oy + 15, '#b8a888', 16, 1);
      if (r > 0.45) { px(ctx, ox + 4, oy + 4, '#5b7fa8', 8, 6); px(ctx, ox + 4, oy + 4, '#8fb6e0', 3, 2); px(ctx, ox + 7, oy + 4, '#3d3d3d', 1, 6); }
      break;
    }
    case 'D': case 'd': {
      px(ctx, ox, oy, '#efe4cf', 16, 16);
      px(ctx, ox + 3, oy + 2, '#6b4a2f', 10, 14);
      px(ctx, ox + 4, oy + 3, ch === 'D' ? '#2a1a12' : '#8a6243', 8, 13);
      px(ctx, ox + 10, oy + 9, '#e8c54a');
      break;
    }
    case 'r': {
      ground(ctx, ox, oy, th, r);
      px(ctx, ox + 2, oy + 5, '#6e6a66', 12, 10);
      px(ctx, ox + 3, oy + 4, '#8f8a84', 10, 9);
      px(ctx, ox + 4, oy + 5, '#b3ada6', 4, 2);
      px(ctx, ox + 2, oy + 14, '#00000033', 12, 1);
      break;
    }
    case '_': {
      const f = th.floor ?? '#cccccc';
      px(ctx, ox, oy, (tx + ty) % 2 ? f : '#f2efe6', 16, 16);
      px(ctx, ox, oy, '#00000014', 16, 1);
      px(ctx, ox, oy, '#00000014', 1, 16);
      break;
    }
    case 'W': {
      px(ctx, ox, oy, '#4b4458', 16, 16);
      px(ctx, ox, oy + 12, '#2e2a38', 16, 4);
      px(ctx, ox + 1, oy + 1, '#5e566e', 14, 2);
      break;
    }
    case 'b': px(ctx, ox, oy, '#a5793f', 16, 16); px(ctx, ox, oy + 7, '#7a5528', 16, 2); break;
    case 's': px(ctx, ox, oy, '#eedc9a', 16, 16); break;
    default: px(ctx, ox, oy, '#000000', 16, 16);
  }
}

/** Couleur de toit selon le bâtiment (même plan pour toutes les villes). */
export function roofAt(zone, x, y) {
  if (zone.kind !== 'town') return '#b5533c';
  if (y <= 5 && x >= 4 && x <= 9) return '#d8434b';                // centre de soin
  if (y <= 5 && x >= 20 && x <= 25) return '#3f7fd6';              // boutique
  if (y <= 4 && x >= 12 && x <= 17) return '#c79a2a';              // Ligue
  if (y >= 14 && x >= 4 && x <= 9 && zone.index >= 2 && zone.index <= 9) return ['#6fbf5f', '#4a9be0', '#e0b52a', '#8c7a63', '#78b6d6', '#7fc8d8', '#9a5cc8', '#5d579c'][zone.index - 2];
  return ['#8a5a44', '#6f7f5a', '#7d5a7a', '#5f6f8a'][((x < 15 ? 0 : 1) + (y > 10 ? 2 : 0) + zone.index) % 4];
}

/** Toute la carte dessinée une fois (deux images pour l'eau). */
export function renderZone(zone) {
  const th = theme(zone.theme);
  const frames = [];
  for (let f = 0; f < 2; f++) {
    const c = document.createElement('canvas');
    c.width = zone.rows[0].length * 16;
    c.height = zone.rows.length * 16;
    const ctx = c.getContext('2d');
    zone.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) drawTile(ctx, row[x], x * 16, y * 16, th, f * 2, x, y, roofAt(zone, x, y));
    });
    if (zone.kind === 'town') emblems(ctx);
    frames.push(c);
  }
  return frames;
}

/** Enseignes : croix du centre de soin, sac de la boutique. */
function emblems(ctx) {
  px(ctx, 7 * 16 + 4, 6 * 16 + 2, '#ffffff', 8, 8);
  px(ctx, 7 * 16 + 7, 6 * 16 + 3, '#d8434b', 2, 6);
  px(ctx, 7 * 16 + 5, 6 * 16 + 5, '#d8434b', 6, 2);
  px(ctx, 23 * 16 + 4, 6 * 16 + 2, '#ffffff', 8, 8);
  px(ctx, 23 * 16 + 5, 6 * 16 + 5, '#3f7fd6', 6, 4);
  px(ctx, 23 * 16 + 6, 6 * 16 + 3, '#3f7fd6', 1, 2);
  px(ctx, 23 * 16 + 9, 6 * 16 + 3, '#3f7fd6', 1, 2);
}

/** Cases où l'on marche (même règle que le serveur). */
export const WALKABLE = new Set(['.', ',', '"', 'f', 'D', '_', 'b', 's']);
