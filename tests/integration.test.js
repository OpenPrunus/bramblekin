// Intégration : le VRAI serveur PHP (server/server.php) sur un vrai port, avec des robots WebSocket.
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Bot, leaveHome, startGameServer, token, waitFor, walkTo } from './helpers.js';

let server;
let wild;
const bots = [];
const bot = async (srv = server) => {
  const b = await new Bot(srv.url).open();
  bots.push(b);
  return b;
};

before(async () => {
  server = await startGameServer({ BRAMBLE_ENCOUNTER_RATE: '0', BRAMBLE_TURN_SECONDS: '3' });
  wild = await startGameServer({ BRAMBLE_ENCOUNTER_RATE: '1' });
});
after(() => { for (const b of bots) b.close(); server?.stop(); wild?.stop(); });

/** Marche d'un pas (le serveur limite la cadence : on attend un peu entre deux pas). */
async function step(b, d) {
  b.send({ t: 'step', d, n: Date.now() });
  await new Promise((r) => setTimeout(r, 160));
}

describe('monde partagé', () => {
  test('bienvenue, contenu (150 créatures), compagnon, première carte', async () => {
    const a = await bot();
    const w = await a.hello('Alice');
    assert.equal(w.starter, true);
    assert.equal(w.content.species.length, 150);
    assert.equal(w.content.towns.length, 10);
    a.send({ t: 'starter', sp: 4 });
    const z = a.last('zone') ?? await a.next('zone');
    assert.equal(z.zone.id, 'ha1', 'on commence dans sa chambre');
    await a.next('profile', 3000, true);
    assert.equal(a.last('profile').profile.team[0].sp, 4);
    await leaveHome(a);
    const town = a.last('zone');
    assert.equal(town.zone.id, 't1');
    assert.equal(town.zone.rows.length, 24);
    assert.deepEqual([town.me.x, town.me.y], [7, 18]);
  });

  test('un pseudo pris ou un jeton invalide sont refusés', async () => {
    const b = await bot();
    b.send({ t: 'hello', name: 'alice', token: token('autre') });
    assert.equal((await b.next('error')).code, 'name_taken');
    b.send({ t: 'hello', name: 'Zed', token: 'x' });
    assert.equal((await b.next('error')).code, 'bad_token');
    b.send({ t: 'step', d: 'u', n: 1 });
    assert.equal((await b.next('error')).code, 'not_ready');
  });

  test('les joueurs de la même carte se voient bouger, partir et réagir', async () => {
    const a = await bot();
    await a.join('Carla');
    const b = await bot();
    await b.join('Dimitri');
    assert.deepEqual(b.zone.peers, [], 'chacun sa chambre');
    await leaveHome(a);
    await leaveHome(b);
    assert.ok(b.last('zone').peers.some((p) => p.name === 'Carla'));
    const moved = b.next('peer');
    await step(a, 'd');
    const seen = await moved;
    assert.equal(seen.name, 'Carla');
    assert.equal(seen.y, a.last('zone').me.y + 1);
    const emote = b.next('emote');
    a.send({ t: 'emote', e: 1 });
    assert.equal((await emote).e, 1);
    const gone = b.next('gone');
    a.close();
    assert.equal((await gone).id, seen.id);
  });

  test('le serveur refuse les murs et la téléportation, et sauvegarde la progression', async () => {
    const a = await bot();
    const tok = token('Eve-save');
    await a.join('Eve', 1, tok);
    const { x, y } = a.zone.me;
    // de la position de départ, vers le nord : la rue ; le bord de carte est un mur d'arbres
    for (let i = 0; i < 3; i++) await step(a, 'l');
    a.send({ t: 'step', d: 'zz', n: 99 });
    assert.equal((await a.next('pos')).n, 99);
    a.close();
    await waitFor(() => fs.readdirSync(path.join(server.dataDir, 'players')).length > 0, 3000, 'sauvegarde');
    const again = await bot();
    const w = await again.hello('Eve', tok);
    assert.equal(w.starter, false);
    assert.equal(w.profile.team[0].sp, 1);
    const z = await again.next('zone', 3000, true);
    assert.equal(z.me.y, y);
    assert.equal(z.me.x, x - 3);
  });

  test('duel entre deux joueurs : invitation, tours, délai, résultat classé', async () => {
    const a = await bot();
    await a.join('Fanny');
    const b = await bot();
    await b.join('Gaston');
    await leaveHome(a);
    await leaveHome(b);
    const idB = b.last('welcome').id;
    const idA = a.last('welcome').id;
    a.send({ t: 'invite', id: idB, kind: 'duel' });
    const inv = await b.next('invite');
    assert.equal(inv.kind, 'duel');
    assert.equal(inv.from, idA);
    b.send({ t: 'accept', id: idA });
    const [ba, bb] = await Promise.all([a.next('battle'), b.next('battle')]);
    assert.equal(ba.view.team[0].lv, 50);
    assert.equal(ba.intro.ranked, true);
    assert.equal(bb.intro.name, 'Fanny');
    // B laisse passer le premier tour : au bout du délai (3 s), le serveur choisit pour lui
    const t0 = Date.now();
    a.send({ t: 'act', k: 'move', i: 0 });
    await a.next('turn', 8000);
    assert.ok(Date.now() - t0 >= 1500, 'tour joué après le délai');
    // puis les deux jouent à chaque tour (attaque avec des PP, remplaçant après un K.-O.)
    const handled = new Map([[a, 0], [b, 0]]);
    for (let i = 0; i < 400 && !(a.last('battleEnd') && b.last('battleEnd')); i++) {
      for (const x of [a, b]) {
        const msgs = x.messages;
        const lastTurn = msgs.findLastIndex((m) => m.t === 'turn');
        if (lastTurn < 0 || lastTurn < handled.get(x) || x.last('battleEnd')) continue;
        handled.set(x, lastTurn + 1);
        const view = msgs[lastTurn].view;
        if (view.over || view.foeReplace) continue;
        if (view.replace) { x.send({ t: 'replace', i: view.team.findIndex((k) => k.hp > 0) }); continue; }
        const kin = view.team[view.active];
        const usable = kin.moves.findIndex((m) => m.pp > 0);
        x.send({ t: 'act', k: 'move', i: usable });
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    const ea = await a.next('battleEnd', 15000, true);
    const eb = await b.next('battleEnd', 15000, true);
    assert.notEqual(ea.result, eb.result);
    assert.equal(ea.ranked, true);
    const board = JSON.parse(fs.readFileSync(path.join(server.dataDir, 'ratings.json'), 'utf8'));
    assert.equal(Object.keys(board.players).length, 2);
    assert.ok(!JSON.stringify(board).includes(token('Fanny')), 'jamais le jeton en clair');
  });

  test('échange : invitation acceptée, on ne cède pas sa seule créature, annulation', async () => {
    const a = await bot();
    await a.join('Hector', 1);
    const b = await bot();
    await b.join('Iris', 4);
    await leaveHome(a);
    await leaveHome(b);
    a.send({ t: 'invite', id: b.last('welcome').id, kind: 'trade' });
    await b.next('invite');
    b.send({ t: 'accept', id: a.last('welcome').id });
    await a.next('trade');
    // on ne cède pas sa seule créature
    a.send({ t: 'offer', uid: a.last('welcome').profile.team[0]?.uid ?? 1 });
    assert.equal((await a.next('error')).code, 'bad_offer');
    a.send({ t: 'untrade' });
    assert.equal((await b.next('tradeEnd')).reason, 'cancel');
  });
});

describe('rencontres sauvages', () => {
  test('marcher dans les hautes herbes déclenche un combat ; on peut le gagner ou attraper la créature', async () => {
    const a = await bot(wild);
    await a.join('Jules', 7);
    await leaveHome(a);
    await walkTo(a, 14, 0);
    const r1 = await waitFor(() => (a.last('zone').zone.id === 'r1' ? a.last('zone') : null), 3000, 'route 1');
    // jusqu'à l'herbe haute la plus proche
    const rows = r1.zone.rows;
    let goal = null;
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '"' && y > 1 && (!goal || Math.abs(x - r1.me.x) + Math.abs(y - r1.me.y) < goal[2])) goal = [x, y, Math.abs(x - r1.me.x) + Math.abs(y - r1.me.y)]; });
    await walkTo(a, goal[0], goal[1], () => !!a.last('battle'));
    const battle = await a.next('battle', 3000, true);
    assert.equal(battle.intro.kind, 'wild');
    for (let i = 0; i < 60 && !a.last('battleEnd'); i++) {
      const view = a.last('turn')?.view ?? battle.view;
      const seen = a.messages.length;
      a.send(view.replace ? { t: 'replace', i: view.team.findIndex((k) => k.hp > 0) } : i % 2 && i < 10 ? { t: 'act', k: 'catch', item: 'orb' } : { t: 'act', k: 'move', i: 0 });
      await waitFor(() => a.messages.slice(seen).some((m) => ['turn', 'error', 'battleEnd'].includes(m.t)), 3000, 'tour');
    }
    const end = await a.next('battleEnd', 3000, true);
    assert.ok(['win', 'caught', 'lose', 'fled'].includes(end.result));
    if (end.result === 'caught') assert.equal(end.profile.team.length, 2);
  });
});
