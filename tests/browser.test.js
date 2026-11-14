// Navigateur : un vrai Chrome headless piloté par DevTools. Le site est servi par `php -S`, le serveur de jeu est le vrai
// serveur PHP, un robot Node joue un autre joueur du monde partagé.
//   npm run test:browser          (PHP_BIN et CHROME_BIN réglables ; SHOTS=/dossier enregistre des captures)
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Bot, PHP, ROOT, freePort, sleep, startGameServer, waitFor } from './helpers.js';
import { launchChrome } from './cdp.js';

let BASE, php, game, c;
const shots = process.env.SHOTS;

before(async () => {
  game = await startGameServer({ BRAMBLE_ENCOUNTER_RATE: '1' });
  const port = await freePort();
  php = spawn(PHP, ['-S', `127.0.0.1:${port}`, '-t', path.join(ROOT, 'web')], {
    env: { ...process.env, BRAMBLE_WS: game.url, BRAMBLE_DATA_DIR: game.dataDir }, stdio: 'ignore',
  });
  BASE = `http://127.0.0.1:${port}`;
  await waitFor(async () => (await fetch(`${BASE}/`)).ok, 15000, 'site PHP');
  c = await launchChrome();
});
after(async () => {
  await c?.close();
  try { php?.kill(); } catch { /* déjà arrêté */ }
  game?.stop();
});

const ev = (x) => c.ev(x);
const shot = (name) => (shots ? c.shot(path.join(shots, `${name}.png`)) : null);

async function start(device, name) {
  await c.device(device);
  await c.call('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'local_storage' });
  await c.call('Page.navigate', { url: `${BASE}/` });
  await waitFor(() => ev('!!window.__bramble'), 10000, 'page');
  await ev(`window.BRAMBLE_FAST = true; localStorage.setItem('bramblekin.lang', 'fr')`);
  await ev(`document.getElementById('name').value = ${JSON.stringify(name)}; document.getElementById('btn-play').click()`);
  await waitFor(() => ev("!document.getElementById('starter').hidden"), 10000, 'choix du compagnon');
  assert.equal(await ev("document.querySelectorAll('.starter').length"), 3);
  await ev("document.querySelectorAll('.starter')[0].click()");
  await waitFor(() => ev('window.__bramble.inGame'), 10000, 'première carte');
}

/** Aucun débordement horizontal, cibles tactiles assez grandes. */
async function checkLayout(touch) {
  assert.equal(await ev('document.documentElement.scrollWidth <= innerWidth'), true, 'pas de défilement horizontal');
  if (touch) {
    const small = await ev(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent && (b.getBoundingClientRect().width < 40 || b.getBoundingClientRect().height < 40)).map((b) => b.textContent || b.id)`);
    assert.deepEqual(small, [], 'boutons trop petits');
  }
}

async function walkTo(x, y) {
  await ev(`window.__bramble.path = window.__bramble.world.path(${x}, ${y})`);
}

describe('Bramblekin dans Chrome', () => {
  test('ordinateur : compagnon, ville, infirmière, route, combat sauvage, menus', async () => {
    await start({ w: 1100, h: 700 }, 'Navigo');
    await shot('desk-town');
    assert.equal(await ev('window.__bramble.zoneInfo.id'), 't1');
    // parler à l'infirmière en touchant la carte
    await ev(`(() => { const n = window.__bramble.world.zone.npcs.find((n) => n.kind === 'nurse'); window.__bramble.path = window.__bramble.world.path(n.x, n.y); })()`);
    await waitFor(() => ev("!document.getElementById('dialog').hidden"), 15000, 'dialogue');
    assert.match(await ev("document.getElementById('dialog-text').textContent"), /pleine forme/);
    await ev("document.getElementById('dialog').click()");
    // menus
    for (const tab of ['team', 'bag', 'dex', 'map', 'code', 'options']) {
      await ev(`window.__bramble.panels.open('${tab}')`);
      assert.equal(await ev("document.getElementById('sheet').hidden"), false);
      if (tab === 'dex') assert.equal(await ev("document.querySelectorAll('.dex-cell').length"), 150);
    }
    await ev('window.__bramble.panels.close()');
    // au nord : la route 1 ; dans les herbes : une rencontre
    await walkTo(14, 0);
    await waitFor(() => ev("window.__bramble.zoneInfo.id === 'r1'"), 20000, 'route 1');
    await ev(`(() => { const a = window.__bramble; const w = a.world; let best = null;
      w.zone.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '"' && w.free(x, y)) { const d = Math.abs(x - w.me.x) + Math.abs(y - w.me.y); if (!best || d < best[2]) best = [x, y, d]; } });
      a.path = w.path(best[0], best[1]); })()`);
    await waitFor(() => ev('!!window.__bramble.battle?.open'), 20000, 'combat');
    await waitFor(() => ev("!!document.querySelector('.b-fight')"), 15000, 'menu de combat');
    await shot('desk-battle');
    for (let i = 0; i < 300 && (await ev('window.__bramble.battle.open')); i++) {
      await ev(`(() => { const m = document.querySelector('.b-menu'); const f = m.querySelector('.b-fight'); if (f) return f.click();
        const mv = m.querySelector('.move:not([disabled])'); if (mv) return mv.click();
        const p = m.classList.contains('list') && m.querySelector('button:not([disabled])'); if (p) return p.click(); window.__bramble.battle.skip?.(); })()`);
      await sleep(40);
    }
    assert.equal(await ev('window.__bramble.battle.open'), false, 'combat terminé');
    assert.ok(await ev('window.__bramble.profile.team[0].xp > 125 || window.__bramble.zoneInfo.id === "t1"'));
    await checkLayout(false);
    assert.deepEqual(c.errors, []);
  });

  test('téléphone : un autre joueur apparaît, on le touche, il nous défie, le duel se joue au toucher', async () => {
    await start({ w: 390, h: 844, touch: true }, 'Mobilo');
    assert.equal(await ev("document.getElementById('pad').hidden"), false, 'manette tactile');
    await checkLayout(true);
    const bot = await new Bot(game.url).open();
    await bot.join('Robot', 4);
    await waitFor(() => ev('window.__bramble.world.peers.size === 1'), 5000, 'le robot est visible');
    await shot('phone-peer');
    // toucher le robot ouvre son menu
    const pos = await ev(`(() => { const w = window.__bramble.world; const p = [...w.peers.values()][0]; const { ox, oy, S } = w.camera();
      return [(ox + (p.x + 0.5) * S) / w.dpr, (oy + (p.y + 0.5) * S) / w.dpr]; })()`);
    await c.tap(pos[0], pos[1]);
    await waitFor(() => ev("!document.getElementById('modal').hidden"), 3000, 'menu du joueur');
    await sleep(500);                                       // les clics juste après l'ouverture sont ignorés (clic fantôme du toucher)
    await ev("document.querySelector('#modal-box button:last-child').click()");
    // le robot défie : on accepte
    const myId = await ev('window.__bramble.world.myId');
    bot.send({ t: 'invite', id: myId, kind: 'duel' });
    await waitFor(() => ev("!document.getElementById('modal').hidden && document.getElementById('modal-box').textContent.includes('Robot')"), 3000, 'invitation');
    await sleep(500);
    await ev("document.querySelector('#modal-box .primary').click()");
    await waitFor(() => ev('!!window.__bramble.battle?.open'), 5000, 'duel');
    await bot.next('battle', 5000, true);
    await waitFor(() => ev("!!document.querySelector('.b-fight')"), 15000, 'menu de duel');
    await checkLayout(true);
    await shot('phone-duel');
    // on abandonne : défaite, retour à la carte
    await ev("document.querySelector('.b-run').click()");
    await ev("document.querySelector('.b-menu button').click()");
    assert.equal((await bot.next('battleEnd', 5000, true)).result, 'win');
    await waitFor(() => ev('!window.__bramble.battle.open'), 15000, 'fin du duel');
    bot.close();
    assert.deepEqual(c.errors, []);
  });

  test('téléphone en paysage : carte et combat tiennent à l\'écran', async () => {
    await start({ w: 844, h: 390, touch: true }, 'Paysa');
    await checkLayout(true);
    await walkTo(14, 0);
    await waitFor(() => ev("window.__bramble.zoneInfo.id === 'r1'"), 20000, 'route 1');
    await ev(`(() => { const a = window.__bramble; const w = a.world; let best = null;
      w.zone.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '"' && w.free(x, y)) { const d = Math.abs(x - w.me.x) + Math.abs(y - w.me.y); if (!best || d < best[2]) best = [x, y, d]; } });
      a.path = w.path(best[0], best[1]); })()`);
    await waitFor(() => ev("!!document.querySelector('.b-fight')"), 25000, 'menu de combat');
    const fits = await ev(`[...document.querySelectorAll('#battle .b-menu button, .hpbox')].every((e) => { const r = e.getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1; })`);
    assert.equal(fits, true, 'tout le combat est visible');
    await shot('land-battle');
    await checkLayout(true);
    assert.deepEqual(c.errors, []);
  });
});
