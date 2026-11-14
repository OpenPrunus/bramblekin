// Bramblekin — petits sons synthétisés (aucun fichier audio).
let ctx = null;
let enabled = true;
try { enabled = localStorage.getItem('bramblekin.sound') !== 'off'; } catch { /* ignoré */ }

export const soundOn = () => enabled;
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem('bramblekin.sound', on ? 'on' : 'off'); } catch { /* ignoré */ }
}

function tone(freq, dur, type = 'square', vol = 0.06, at = 0, slide = 0) {
  if (!enabled) return;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch { /* audio indisponible */ }
}

export const sfx = {
  select: () => tone(880, 0.05),
  bump: () => tone(110, 0.06, 'triangle', 0.08),
  hit: () => { tone(200, 0.12, 'sawtooth', 0.07, 0, -120); },
  superHit: () => { tone(260, 0.1, 'sawtooth', 0.08, 0, -160); tone(140, 0.15, 'square', 0.06, 0.08, -60); },
  faint: () => tone(400, 0.5, 'triangle', 0.08, 0, -340),
  heal: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'triangle', 0.06, i * 0.09)); },
  level: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.1, 'square', 0.05, i * 0.07)); },
  throw: () => tone(600, 0.25, 'triangle', 0.05, 0, 400),
  shake: () => tone(180, 0.08, 'square', 0.05),
  caught: () => { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.14, 'square', 0.05, i * 0.1)); },
  encounter: () => { [330, 392, 330, 494].forEach((f, i) => tone(f, 0.09, 'square', 0.05, i * 0.08)); },
  badge: () => { [523, 523, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.15, 'square', 0.05, i * 0.12)); },
  emote: () => tone(1200, 0.06, 'sine', 0.05),
};
