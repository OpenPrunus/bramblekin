// Bramblekin — écran de combat : scène animée (canvas 256 × 144), barres de PV, menus, lecture du journal envoyé par le serveur.
import { t, pick } from './i18n.js';
import { creatureCanvas, TYPE_COLORS, characterCanvas, palette } from './sprites.js';
import { sfx } from './audio.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 256;
const H = 144;

export class BattleView {
  constructor(root, { content, send, onClose, fast = false }) {
    this.root = root;
    this.content = content;
    this.send = send;
    this.onClose = onClose;
    this.fast = fast;
    this.queue = Promise.resolve();
    this.open = false;
    root.innerHTML = `
      <div class="b-scene"><canvas width="${W}" height="${H}"></canvas>
        <div class="hpbox foe"><div class="hp-name"><b></b><span class="lv"></span><span class="st"></span></div><div class="bar"><i></i></div><div class="balls"></div></div>
        <div class="hpbox mine"><div class="hp-name"><b></b><span class="lv"></span><span class="st"></span></div><div class="bar"><i></i></div><div class="hp-num"></div><div class="xpbar"><i></i></div></div>
        <div class="b-timer" hidden></div>
      </div>
      <div class="b-ui"><div class="b-msg" aria-live="polite"></div><div class="b-menu"></div></div>`;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.msgEl = root.querySelector('.b-msg');
    this.menuEl = root.querySelector('.b-menu');
    this.timerEl = root.querySelector('.b-timer');
    this.boxes = { 0: root.querySelector('.hpbox.mine'), 1: root.querySelector('.hpbox.foe') };
    this.skip = null;
    root.querySelector('.b-ui').addEventListener('click', (e) => { if (!e.target.closest('button')) this.skip?.(); });
    this.anim = this.freshAnim();
    this.loop = this.loop.bind(this);
  }

  freshAnim() {
    return {
      0: { sp: null, dx: 0, dy: 0, alpha: 1, flash: 0, hidden: false }, 1: { sp: null, dx: 0, dy: 0, alpha: 1, flash: 0, hidden: false },
      fx: null, orb: null, trainer: null,
    };
  }

  species(id) { return this.content.species[id - 1]; }
  move(id) { return this.content.moves[id]; }

  nameOf(side, sp) {
    const n = this.species(sp)?.name ?? '?';
    if (side === 0) return n;
    return this.kind === 'wild' ? t('wild', { n }) : t('foeOf', { n });
  }

  enqueue(fn) {
    this.queue = this.queue.then(fn).catch((e) => { console.error(e); });
    return this.queue;
  }

  // --- messages du serveur --------------------------------------------------------------------------------------------

  start(msg) {
    return this.enqueue(async () => {
      this.view = msg.view;
      this.intro = msg.intro;
      this.kind = msg.intro.kind;
      this.anim = this.freshAnim();
      this.open = true;
      this.root.hidden = false;
      this.root.classList.add('flash');
      sfx.encounter();
      requestAnimationFrame(this.loop);
      const mine = this.view.team[this.view.active];
      this.shown = { 0: { ...mine, sp: mine.sp }, 1: { ...this.view.foe } };
      this.anim[1].sp = this.view.foe.sp;
      this.anim[0].hidden = true;
      this.renderBox(0); this.renderBox(1);
      this.boxes[0].hidden = true;
      this.menuEl.innerHTML = '';
      await sleep(this.fast ? 50 : 500);
      this.root.classList.remove('flash');
      if (this.kind === 'wild') {
        await this.say(t('wildAppears', { n: this.species(this.view.foe.sp).name }));
      } else if (this.kind === 'trainer') {
        this.anim.trainer = { sprite: this.intro.sprite ?? 0 };
        await this.say(`« ${t(this.intro.text)} »`, 1600);
        await this.say(t('trainerWants', { c: t(`cls_${this.intro.cls}`), n: this.intro.name }));
        this.anim.trainer = null;
        await this.say(t('sends', { t: this.intro.name, n: this.species(this.view.foe.sp).name }));
      } else {
        await this.say(t('duelStart', { n: this.intro.name }));
        await this.say(this.intro.ranked ? t('duelRanked', { r: this.intro.rating }) : (this.intro.why ? t(`why_${this.intro.why}`) : t('duelFriendly')));
      }
      this.anim[0].sp = mine.sp;
      this.anim[0].hidden = false;
      this.boxes[0].hidden = false;
      await this.say(t('goKin', { n: this.species(mine.sp).name }));
      this.deadline = this.kind === 'duel' ? Date.now() + (this.intro.seconds ?? 45) * 1000 : 0;
      this.showMain();
    });
  }

  turn(msg) {
    return this.enqueue(async () => {
      this.menuEl.innerHTML = '';
      for (const e of msg.log) await this.play(e);
      this.view = msg.view;
      const mine = this.view.team[this.view.active];
      this.shown[0] = { ...mine };
      this.shown[1] = { ...this.view.foe };
      this.anim[0].sp = mine.sp; this.anim[1].sp = this.view.foe.sp;
      if (mine.hp > 0) { this.anim[0].hidden = false; this.anim[0].alpha = 1; this.anim[0].dy = 0; }
      if (this.view.foe.hp > 0) { this.anim[1].hidden = false; this.anim[1].alpha = 1; this.anim[1].dy = 0; }
      this.renderBox(0); this.renderBox(1);
      this.deadline = this.kind === 'duel' ? Date.now() + (this.intro.seconds ?? 45) * 1000 : 0;
      if (this.view.over) return;
      if (this.view.replace) this.showParty(true);
      else if (this.view.foeReplace) this.text(t('waitFoe'));
      else this.showMain();
    });
  }

  end(msg) {
    return this.enqueue(async () => {
      this.menuEl.innerHTML = '';
      this.timerEl.hidden = true;
      this.deadline = 0;
      if (this.kind === 'duel') {
        const n = this.intro.name;
        if (msg.reason === 'left') await this.say(t('duelLeft', { n }));
        if (msg.reason === 'forfeit' && msg.result === 'win') await this.say(t('duelForfeit', { n }));
        await this.say(msg.result === 'win' ? t('duelWon', { n }) : t('duelLost', { n }));
        if (msg.ranked && typeof msg.rating === 'number') await this.say(t('ratingChange', { r: msg.rating, d: (msg.delta >= 0 ? '+' : '') + msg.delta }));
      } else if (msg.result === 'win' && this.kind === 'trainer') {
        await this.say(t('win'));
      }
      for (const e of msg.log) {
        if (e.k === 'money') await this.say(t('moneyWon', { n: e.n }));
        if (e.k === 'badge') { sfx.badge(); await this.say(t('badgeWon', { b: t(`badge${e.n}`) }), 1800); }
        if (e.k === 'champion') { sfx.badge(); await this.say(t('championWon'), 2500); }
        if (e.k === 'blackout') await this.say(t('blackout', { n: e.n }), 2200);
        if (e.k === 'stored') await this.say(t(e.where === 'box' ? 'storedBox' : 'storedTeam', { n: this.species(e.sp).name }), 1500);
        if (e.k === 'evolve') await this.evolve(e);
      }
      await sleep(this.fast ? 30 : 300);
      this.close();
    });
  }

  chosen() { this.menuEl.innerHTML = ''; this.text(t('waitFoe')); }
  foeReady() { if (!this.menuEl.innerHTML) this.text(t('foeReady')); }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.onClose?.();
  }

  // --- lecture du journal ---------------------------------------------------------------------------------------------

  async play(e) {
    const side = e.s ?? e.t ?? 0;
    const target = e.t ?? (1 - side);
    const nm = (s) => this.nameOf(s, this.shown[s].sp);
    switch (e.k) {
      case 'use': {
        const mv = this.move(e.m);
        await this.say(t('uses', { n: nm(side), m: pick(mv?.name) }), 700);
        await this.lunge(side, mv?.type ?? 'normal', mv?.power > 0);
        break;
      }
      case 'miss': await this.say(t('miss')); break;
      case 'hit': {
        e.eff >= 2 ? sfx.superHit() : sfx.hit();
        await this.flash(target);
        await this.setHp(target, e.hp, e.max);
        if (e.crit) await this.say(t('crit'));
        if (e.eff >= 2) await this.say(t('superEff'));
        else if (e.eff > 0 && e.eff < 1) await this.say(t('notEff'));
        break;
      }
      case 'immune': await this.say(t('immune', { n: nm(target) })); break;
      case 'stat': {
        const s = t(e.stat);
        const key = e.d > 0 ? (e.d > 1 ? 'statUp2' : 'statUp') : (e.d < -1 ? 'statDown2' : 'statDown');
        await this.say(t(key, { s, n: nm(target) }));
        break;
      }
      case 'nostat': await this.say(t('nostat', { n: nm(target) })); break;
      case 'fail': await this.say(t('fail')); break;
      case 'status': {
        this.shown[target].st = e.st;
        this.renderBox(target);
        await this.say(t({ psn: 'stPsn', brn: 'stBrn', slp: 'stSlp', par: 'stPar' }[e.st], { n: nm(target) }));
        break;
      }
      case 'dot':
        await this.flash(target);
        await this.setHp(target, e.hp, e.max);
        await this.say(t(e.st === 'psn' ? 'dotPsn' : 'dotBrn', { n: nm(target) }));
        break;
      case 'asleep': await this.say(t('asleep', { n: nm(side) })); break;
      case 'wake': this.shown[side].st = null; this.renderBox(side); await this.say(t('wake', { n: nm(side) })); break;
      case 'para': await this.say(t('para', { n: nm(side) })); break;
      case 'heal':
        sfx.heal();
        await this.setHp(target, e.hp, e.max);
        await this.say(t('healed', { n: nm(target) }));
        break;
      case 'faint': {
        sfx.faint();
        await this.faint(target);
        await this.say(t('faint', { n: nm(target) }));
        this.shown[target].st = null;
        if (target === 0) this.boxes[0].hidden = true;
        break;
      }
      case 'send': {
        this.shown[side] = { ...this.shown[side], ...e.kin, sp: e.kin.sp };
        if (side === 0) {
          const full = this.view.team.find((k) => k.uid === e.kin.uid);
          if (full) this.shown[0] = { ...full, hp: e.kin.hp, max: e.kin.max, st: e.kin.st };
        }
        this.anim[side] = { ...this.anim[side], sp: e.kin.sp, hidden: false, alpha: 1, dy: 0, dx: 0 };
        this.boxes[side].hidden = false;
        this.renderBox(side);
        const who = this.kind === 'wild' ? '' : (this.intro.name ?? '');
        await this.say(side === 0 ? t('goKin', { n: this.species(e.kin.sp).name }) : t('sends', { t: who, n: this.species(e.kin.sp).name }));
        break;
      }
      case 'item': {
        const it = this.content.items.find((i) => i.id === e.item);
        if (side === 0) await this.say(t('itemUsed', { i: pick(it?.name) }));
        if (e.active) { sfx.heal(); await this.setHp(side, e.hp, e.max); }
        break;
      }
      case 'catch': await this.throwOrb(e); break;
      case 'run': await this.say(e.ok ? t('fled') : t('noFlee')); break;
      case 'xp': {
        const kin = this.view.team.find((k) => k.uid === e.uid);
        if (kin && this.shown[0].uid === e.uid) await this.say(t('xp', { n: this.species(this.shown[0].sp).name, g: e.gain }), 700);
        else if (kin) await this.say(t('xp', { n: this.species(kin.sp).name, g: e.gain }), 500);
        break;
      }
      case 'level': {
        sfx.level();
        const kin = this.view.team.find((k) => k.uid === e.uid);
        if (kin && this.shown[0].uid === e.uid) { this.shown[0].lv = e.level; this.renderBox(0); }
        await this.say(t('levelUp', { n: this.species(kin?.sp ?? 1).name, l: e.level }));
        break;
      }
      case 'learn': {
        const kin = this.view.team.find((k) => k.uid === e.uid);
        await this.say(t('learned', { n: this.species(kin?.sp ?? 1).name, m: pick(this.move(e.move)?.name) }));
        break;
      }
      case 'wants': {
        const kin = this.view.team.find((k) => k.uid === e.uid);
        await this.say(t('wants', { n: this.species(kin?.sp ?? 1).name, m: pick(this.move(e.move)?.name) }), 1400);
        break;
      }
      default: break;
    }
  }

  // --- menus ----------------------------------------------------------------------------------------------------------

  text(s) { this.msgEl.textContent = s; }

  /** Affiche un message ; un toucher (ou Espace) passe au suivant. */
  say(s, ms = 1000) {
    this.text(s);
    return new Promise((resolve) => {
      const done = () => { clearTimeout(timer); this.skip = null; resolve(); };
      const timer = setTimeout(done, this.fast ? 15 : ms);
      this.skip = done;
    });
  }

  button(label, fn, cls = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.innerHTML = label;
    b.addEventListener('click', () => { sfx.select(); fn(); });
    this.menuEl.append(b);
    return b;
  }

  showMain() {
    const kin = this.view.team[this.view.active];
    this.text(t('whatDo', { n: this.species(kin.sp).name }));
    this.menuEl.innerHTML = '';
    this.menuEl.className = 'b-menu main';
    this.button(t('fight'), () => this.showMoves(), 'b-fight');
    this.button(t('bag'), () => this.showBag(), 'b-bag');
    this.button(t('party'), () => this.showParty(false), 'b-party');
    if (this.kind === 'wild') this.button(t('run'), () => this.act({ k: 'run' }), 'b-run');
    else if (this.kind === 'duel') this.button(t('forfeit'), () => this.confirmForfeit(), 'b-run');
    else this.button(t('run'), () => this.say(t('noFlee')).then(() => this.showMain()), 'b-run disabled');
    this.menuEl.querySelector('button')?.focus({ preventScroll: true });
  }

  back() { this.button(`← ${t('back')}`, () => this.showMain(), 'b-back'); }

  showMoves() {
    const kin = this.view.team[this.view.active];
    this.menuEl.innerHTML = '';
    this.menuEl.className = 'b-menu moves';
    const allEmpty = kin.moves.every((m) => m.pp <= 0);
    kin.moves.forEach((m, i) => {
      const mv = this.move(m.id);
      const b = this.button(`<b>${pick(mv.name)}</b><small>${t(`type_${mv.type}`)} · ${mv.power || '—'} · ${t('pp')} ${m.pp}/${m.max}</small>`,
        () => this.act({ k: 'move', i: allEmpty ? -1 : i }), `move t-${mv.type}`);
      b.style.setProperty('--tc', TYPE_COLORS[mv.type][0]);
      if (m.pp <= 0 && !allEmpty) b.disabled = true;
    });
    this.back();
  }

  showBag() {
    this.menuEl.innerHTML = '';
    this.menuEl.className = 'b-menu list';
    const items = this.bagItems?.() ?? {};
    let any = false;
    for (const it of this.content.items) {
      const n = items[it.id] ?? 0;
      if (!n) continue;
      const orb = it.id.startsWith('orb');
      if (this.kind === 'duel' || (orb && this.kind !== 'wild')) continue;
      any = true;
      this.button(`${pick(it.name)} <small>×${n}</small>`, () => {
        if (orb) this.act({ k: 'catch', item: it.id });
        else this.pickTarget(it.id);
      });
    }
    if (!any) this.text(t('nothing'));
    this.back();
  }

  pickTarget(item) {
    this.menuEl.innerHTML = '';
    this.text(t('useOn'));
    this.view.team.forEach((k, i) => {
      this.button(`${this.species(k.sp).name} <small>${k.hp}/${k.max}</small>`, () => this.act({ k: 'item', item, i }));
    });
    this.back();
  }

  showParty(forced) {
    this.menuEl.innerHTML = '';
    this.menuEl.className = 'b-menu list';
    if (forced) this.text(t('chooseNext'));
    this.view.team.forEach((k, i) => {
      const b = this.button(`${this.species(k.sp).name} <small>${t('lv', { n: k.lv })} · ${k.hp}/${k.max}</small>`, () => {
        if (forced) { this.menuEl.innerHTML = ''; this.send({ t: 'replace', i }); } else this.act({ k: 'switch', i });
      });
      if (k.hp <= 0 || (!forced && i === this.view.active)) b.disabled = true;
    });
    if (!forced) this.back();
  }

  confirmForfeit() {
    this.menuEl.innerHTML = '';
    this.text(t('forfeitAsk'));
    this.button(t('yes'), () => { this.menuEl.innerHTML = ''; this.send({ t: 'forfeit' }); });
    this.button(t('no'), () => this.showMain());
  }

  act(a) {
    this.menuEl.innerHTML = '';
    this.send({ t: 'act', ...a });
  }

  /** Erreur renvoyée par le serveur pendant le combat : on revient au menu. */
  error(code) {
    if (!this.open) return false;
    if (code === 'already_chosen') return true;
    this.enqueue(async () => {
      await this.say(t(`err_${code}`) === `err_${code}` ? '…' : t(`err_${code}`));
      if (this.view.replace) this.showParty(true); else this.showMain();
    });
    return true;
  }

  // --- barres de PV ---------------------------------------------------------------------------------------------------

  renderBox(side) {
    const k = this.shown[side];
    const box = this.boxes[side];
    if (!k) return;
    box.querySelector('b').textContent = this.species(k.sp)?.name ?? '?';
    box.querySelector('.lv').textContent = t('lv', { n: k.lv });
    const st = box.querySelector('.st');
    st.textContent = k.st ? t(`st_${k.st}`) : '';
    st.className = `st ${k.st ?? ''}`;
    this.paintBar(side, k.hp, k.max);
    if (side === 0) {
      box.querySelector('.hp-num').textContent = `${Math.max(0, Math.round(k.hp))} / ${k.max}`;
      const full = this.view.team.find((x) => x.uid === k.uid) ?? k;
      const span = Math.max(1, (full.xpHi ?? 1) - (full.xpLo ?? 0));
      box.querySelector('.xpbar i').style.width = `${Math.min(100, Math.max(0, ((full.xp ?? 0) - (full.xpLo ?? 0)) / span * 100))}%`;
    } else {
      const balls = box.querySelector('.balls');
      balls.innerHTML = this.kind === 'wild' ? '' : (this.view.foeTeam ?? []).map((alive) => `<i class="${alive ? 'on' : ''}"></i>`).join('');
    }
  }

  paintBar(side, hp, max) {
    const bar = this.boxes[side].querySelector('.bar i');
    const p = Math.max(0, Math.min(1, hp / Math.max(1, max)));
    bar.style.width = `${p * 100}%`;
    bar.className = p > 0.5 ? 'ok' : p > 0.2 ? 'mid' : 'low';
  }

  async setHp(side, hp, max) {
    const from = this.shown[side].hp;
    const steps = this.fast ? 1 : 14;
    for (let i = 1; i <= steps; i++) {
      const v = from + (hp - from) * (i / steps);
      this.paintBar(side, v, max);
      if (side === 0) this.boxes[0].querySelector('.hp-num').textContent = `${Math.max(0, Math.round(v))} / ${max}`;
      await sleep(25);
    }
    this.shown[side].hp = hp;
    this.shown[side].max = max;
  }

  // --- animations -----------------------------------------------------------------------------------------------------

  async lunge(side, type, damaging) {
    const a = this.anim[side];
    const dir = side === 0 ? 1 : -1;
    for (let i = 0; i < 6; i++) { a.dx = dir * Math.sin((i / 6) * Math.PI) * 10; await sleep(this.fast ? 1 : 22); }
    a.dx = 0;
    if (damaging) {
      this.anim.fx = { side: 1 - side, type, t0: performance.now() };
      await sleep(this.fast ? 1 : 260);
    }
  }

  async flash(side) {
    const a = this.anim[side];
    for (let i = 0; i < 4; i++) { a.flash = i % 2 ? 0 : 1; await sleep(this.fast ? 1 : 70); }
    a.flash = 0;
  }

  async faint(side) {
    const a = this.anim[side];
    for (let i = 0; i <= 10; i++) { a.dy = i * 3; a.alpha = 1 - i / 10; await sleep(this.fast ? 1 : 35); }
    a.hidden = true;
  }

  async throwOrb(e) {
    const it = this.content.items.find((i) => i.id === e.item);
    sfx.throw();
    await this.say(t('throwOrb', { i: pick(it?.name) }), 600);
    const orb = { x: 40, y: 110, phase: 'fly', wobble: 0 };
    this.anim.orb = orb;
    for (let i = 0; i <= 20; i++) {
      const p = i / 20;
      orb.x = 40 + (184 - 40) * p;
      orb.y = 110 - Math.sin(p * Math.PI) * 70 + (64 - 110) * p;
      await sleep(this.fast ? 1 : 22);
    }
    this.anim[1].hidden = true;
    for (let s = 0; s < Math.min(3, e.shakes); s++) {
      sfx.shake();
      for (let i = 0; i < 8; i++) { orb.wobble = Math.sin((i / 8) * Math.PI * 2) * 0.5; await sleep(this.fast ? 1 : 50); }
      orb.wobble = 0;
      await sleep(this.fast ? 1 : 250);
    }
    if (e.ok) {
      sfx.caught();
      orb.phase = 'caught';
      await this.say(t('caught', { n: this.species(this.shown[1].sp).name }), 1600);
    } else {
      this.anim.orb = null;
      this.anim[1].hidden = false;
      await this.say(e.shakes >= 2 ? t('almost') : t('broke', { n: this.species(this.shown[1].sp).name }));
    }
  }

  async evolve(e) {
    this.root.hidden = false;
    this.boxes[0].hidden = true;
    this.boxes[1].hidden = true;
    this.anim[1].hidden = true;
    this.anim[0] = { ...this.anim[0], sp: e.from, hidden: false, alpha: 1, dy: 0, dx: 0, center: true };
    await this.say(t('evolving', { n: this.species(e.from).name }), 1200);
    for (let i = 0; i < 16; i++) {
      this.anim[0].sp = i % 2 ? e.to : e.from;
      this.anim[0].flash = i % 2;
      await sleep(this.fast ? 1 : 80 + i * 10);
    }
    this.anim[0].sp = e.to;
    this.anim[0].flash = 0;
    sfx.level();
    await this.say(t('evolved', { a: this.species(e.from).name, b: this.species(e.to).name }), 1800);
    this.anim[0].center = false;
  }

  // --- dessin ---------------------------------------------------------------------------------------------------------

  loop() {
    if (!this.open) return;
    this.draw();
    if (this.deadline) {
      const left = Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000));
      this.timerEl.hidden = false;
      this.timerEl.textContent = t('timeLeft', { s: left });
    } else {
      this.timerEl.hidden = true;
    }
    requestAnimationFrame(this.loop);
  }

  draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#bfe6ff'); g.addColorStop(0.55, '#e9f7e4'); g.addColorStop(1, '#a8d88f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#8cc77a';
    ctx.beginPath(); ctx.ellipse(186, 80, 52, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(70, 132, 62, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#76b366';
    ctx.beginPath(); ctx.ellipse(186, 82, 44, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(70, 134, 52, 9, 0, 0, Math.PI * 2); ctx.fill();
    if (this.anim.trainer) {
      ctx.drawImage(characterCanvas(palette('npc', this.anim.trainer.sprite), 'd', 0), 162, 22, 48, 48);
    }
    for (const side of [1, 0]) {
      const a = this.anim[side];
      if (a.hidden || !a.sp) continue;
      const sp = this.species(a.sp);
      if (!sp) continue;
      const img = creatureCanvas(sp);
      const size = side === 1 ? 64 : 80;
      let x = side === 1 ? 154 : 30;
      let y = side === 1 ? 20 : 58;
      if (a.center) { x = 88; y = 30; }
      ctx.save();
      ctx.globalAlpha = a.alpha;
      if (side === 0 && !a.center) {
        ctx.translate(x + size + a.dx, y + a.dy);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, size, size);
      } else {
        ctx.drawImage(img, x + a.dx, y + a.dy, size, size);
      }
      if (a.flash) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(side === 0 && !a.center ? 0 : x - 2, side === 0 && !a.center ? 0 : y - 2, size + 4, size + 4);
      }
      ctx.restore();
    }
    const fx = this.anim.fx;
    if (fx) {
      const p = (performance.now() - fx.t0) / 300;
      if (p >= 1) this.anim.fx = null;
      else {
        const [c1, , c3] = TYPE_COLORS[fx.type] ?? TYPE_COLORS.normal;
        const cx = fx.side === 1 ? 186 : 70;
        const cy = fx.side === 1 ? 52 : 98;
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2 + p * 3;
          const r = 6 + p * 26;
          ctx.fillStyle = i % 2 ? c1 : c3;
          ctx.fillRect(Math.round(cx + Math.cos(ang) * r) - 2, Math.round(cy + Math.sin(ang) * r * 0.7) - 2, 4, 4);
        }
      }
    }
    const orb = this.anim.orb;
    if (orb) {
      ctx.save();
      ctx.translate(orb.x, orb.y);
      ctx.rotate(orb.wobble);
      ctx.fillStyle = '#1d1a26'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e84a4a'; ctx.beginPath(); ctx.arc(0, 0, 5, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#1d1a26'; ctx.fillRect(-5, -0.5, 10, 1);
      ctx.fillStyle = orb.phase === 'caught' ? '#ffd84a' : '#ffffff'; ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
  }
}
