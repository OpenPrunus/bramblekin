// Bramblekin — l'application : écran titre, connexion au monde partagé, boucle de jeu, commandes, dialogues.
import { t, pick, setLang, getLang, applyI18n } from './i18n.js';
import { Net, playerToken, setPlayerToken } from './net.js';
import { World, DIRS, EMOTES } from './world.js';
import { BattleView } from './battle.js';
import { Panels, esc } from './ui.js';
import { sfx, setSound, soundOn } from './audio.js';

const $ = (id) => document.getElementById(id);
const KEYS = {
  ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r', KeyW: 'u', KeyS: 'd', KeyA: 'l', KeyD: 'r', KeyZ: 'u', KeyQ: 'l',
};

class App {
  constructor() {
    this.world = new World($('world'));
    this.panels = new Panels(this);
    this.content = null;
    this.profile = null;
    this.zoneInfo = null;
    this.token = playerToken();
    this.held = [];
    this.path = [];
    this.seq = 0;
    this.awaitingZone = false;
    this.inGame = false;
    this.kicked = false;
    this.retries = 0;
    this.dialogLines = [];
    this.learning = false;
    this.lastBump = 0;
    this.net = new Net({
      onopen: () => this.onOpen(),
      onmessage: (m) => this.onMessage(m),
      onclose: (wasOpen) => this.onClose(wasOpen),
    });
    this.battle = null;
    this.bindTitle();
    this.bindInput();
    applyI18n();
    document.documentElement.lang = getLang();
    this.last = performance.now();
    requestAnimationFrame((ts) => this.frame(ts));
    window.addEventListener('resize', () => this.world.resize());
    if (navigator.onLine === false) this.titleMessage(t('offline'));
  }

  // --- écran titre ----------------------------------------------------------------------------------------------------

  bindTitle() {
    const input = $('name');
    try { input.value = localStorage.getItem('bramblekin.name') ?? ''; } catch { /* ignoré */ }
    $('title-form').addEventListener('submit', (e) => { e.preventDefault(); this.play(); });
    $('btn-lang').addEventListener('click', () => this.toggleLang());
    $('btn-sound').addEventListener('click', () => this.toggleSound());
    $('btn-restore').addEventListener('click', () => this.restore());
    this.updateTitleButtons();
  }

  updateTitleButtons() {
    $('btn-lang').textContent = t('language');
    $('btn-sound').textContent = `${t('sound')} : ${t(soundOn() ? 'on' : 'off')}`;
  }

  toggleLang() {
    setLang(getLang() === 'fr' ? 'en' : 'fr');
    applyI18n();
    this.updateTitleButtons();
    this.updateHud();
  }

  toggleSound() {
    setSound(!soundOn());
    this.updateTitleButtons();
  }

  titleMessage(text) {
    const el = $('title-msg');
    el.textContent = text;
    el.hidden = !text;
  }

  restore() {
    const box = this.panels.showModal(`<h3>${esc(t('restoreTitle'))}</h3><p>${esc(t('restoreHint'))}</p><input id="restore-code" autocomplete="off" spellcheck="false" maxlength="128">`);
    this.panels.actions(box, [
      [t('ok'), () => {
        const code = $('restore-code').value.trim();
        if (!setPlayerToken(code)) { this.titleMessage(t('restoreBad')); this.panels.closeModal(); return; }
        this.token = code;
        this.panels.closeModal();
        this.titleMessage('');
      }, 'primary'],
      [t('cancel'), () => this.panels.closeModal()],
    ]);
    $('restore-code').focus();
  }

  play() {
    const name = $('name').value.trim();
    try { localStorage.setItem('bramblekin.name', name); } catch { /* ignoré */ }
    this.kicked = false;
    this.titleMessage(t('connecting'));
    $('btn-play').disabled = true;
    this.net.connect();
  }

  // --- réseau ---------------------------------------------------------------------------------------------------------

  send(m) { this.net.send(m); }

  onOpen() {
    this.retries = 0;
    this.send({ t: 'hello', name: $('name').value.trim(), token: this.token });
  }

  onClose(wasOpen) {
    $('btn-play').disabled = false;
    if (this.kicked) return;
    if (this.inGame && this.retries < 20) {
      this.toast(t('lost'));
      this.retries++;
      setTimeout(() => this.net.connect(), Math.min(8000, 800 * this.retries));
      return;
    }
    this.backToTitle(navigator.onLine === false ? t('offline') : (wasOpen ? t('lost') : t('offline')));
  }

  backToTitle(message) {
    this.inGame = false;
    $('title').hidden = false;
    $('hud').hidden = true;
    $('pad').hidden = true;
    $('battle').hidden = true;
    this.panels.close();
    this.titleMessage(message);
  }

  onMessage(m) {
    switch (m.t) {
      case 'welcome':
        this.content = m.content;
        this.world.myId = m.id;
        this.setProfile(m.profile);
        this.battle ??= new BattleView($('battle'), { content: this.content, send: (x) => this.send(x), onClose: () => this.afterBattle(), fast: window.BRAMBLE_FAST === true });
        this.battle.bagItems = () => this.profile.items;
        this.battle.themeOf = () => this.zoneInfo?.theme ?? 1;
        this.battle.placeOf = () => this.zoneInfo?.kind;
        if (m.starter) this.pendingIntro = m.profile.name;
        break;
      case 'zone':
        this.enterZone(m);
        if (this.pendingIntro) {
          const name = this.pendingIntro;
          this.pendingIntro = null;
          this.panels.intro(name, () => this.focusGame());
        }
        break;
      case 'starterPick': this.panels.starterPick(m.sp, (sp) => this.send({ t: 'starter', sp })); break;
      case 'profile': this.setProfile(m.profile); if (this.learning) { this.learning = false; this.learnNext(); } break;
      case 'pos':
        if (m.zone === this.world.zone?.id) { this.world.snap(m.x, m.y, m.d); this.path = []; this.awaitingZone = false; }
        break;
      case 'peer': if (m.id !== this.world.myId) this.world.upsertPeer(m); this.updateHud(); break;
      case 'gone': this.world.removePeer(m.id); this.updateHud(); break;
      case 'emote': this.world.emote(m.id, m.e); sfx.emote(); break;
      case 'say': this.say(m); break;
      case 'npcGone': this.world.removeNpc(m.id); break;
      case 'shop': this.panels.open('shop', m.items); break;
      case 'box': if (this.panels.current === 'box') { this.panels.lastData = m.box; this.panels.refresh(); } else this.panels.open('box', m.box); break;
      case 'used': this.used(m); break;
      case 'bought': sfx.select(); this.toast(t('bought', { item: pick(this.content.items.find((i) => i.id === m.item)?.name), n: m.n })); break;
      case 'battle':
        this.path = []; this.held = [];
        this.panels.close(); this.panels.closeModal(); this.closeDialog();
        this.battle.start(m);
        break;
      case 'turn': this.battle.turn(m); break;
      case 'chosen': this.battle.chosen(); break;
      case 'foeReady': this.battle.foeReady(); break;
      case 'battleEnd':
        this.profileAfterBattle = m.profile;
        this.battle.end(m);
        break;
      case 'invite': this.panels.invite(m); sfx.emote(); break;
      case 'inviteGone': this.panels.inviteGone(m.from); break;
      case 'invited': this.toast(t('invited')); break;
      case 'declined': this.toast(t('declined')); break;
      case 'trade': this.panels.trade(m); break;
      case 'tradeDone':
        this.panels.closeModal();
        this.setProfile(m.profile);
        sfx.caught();
        this.toast(t('tradeDone', { n: this.content.species[m.got - 1].name }));
        break;
      case 'tradeEnd': if (this.panels.modalKind === 'trade') this.panels.closeModal(); this.toast(t('tradeEnd')); break;
      case 'kicked':
        this.kicked = true;
        this.net.close();
        this.backToTitle(t('kicked'));
        break;
      case 'error': this.onError(m.code); break;
      default: break;
    }
  }

  onError(code) {
    if (['bad_name', 'name_taken', 'bad_token'].includes(code)) {
      this.net.close();
      $('btn-play').disabled = false;
      this.backToTitle(t(`err_${code}`));
      return;
    }
    if (this.battle?.error(code)) return;
    const key = `err_${code}`;
    if (t(key) !== key) this.toast(t(key));
  }

  setProfile(p) {
    if (!p) return;
    this.profile = p;
    this.world.look = p.look;
    this.world.riding = !!p.riding;
    this.world.abilities = { cut: (p.items.cs_cut ?? 0) > 0, surf: (p.items.cs_surf ?? 0) > 0 };
    $('btn-bike').hidden = !((p.items.bike ?? 0) > 0);
    $('btn-bike').classList.toggle('on', !!p.riding);
    this.updateHud();
    this.panels.refresh();
  }

  enterZone(m) {
    this.inGame = true;
    this.awaitingZone = false;
    this.path = [];
    this.zoneInfo = m.zone;
    this.world.setZone(m.zone, m.me, m.peers);
    this.world.resize();
    $('title').hidden = true;
    $('hud').hidden = false;
    $('pad').hidden = !this.touch;
    this.titleMessage('');
    this.updateHud();
    this.banner(pick(m.zone.name));
  }

  /** Résultat d'un objet utilisé hors combat : vélo, attaque apprise, niveau, évolution. */
  used(m) {
    const name = (uid) => this.content.species[(this.profile.team.find((k) => k.uid === uid)?.sp ?? 1) - 1].name;
    const lines = [];
    for (const e of m.log) {
      if (e.k === 'bike') { this.toast(t(e.on ? 'bikeOn' : 'bikeOff')); sfx.select(); }
      if (e.k === 'learn') lines.push(t('learned', { n: name(e.uid), m: pick(this.content.moves[e.move].name) }));
      if (e.k === 'wants') { lines.push(t('wants', { n: name(e.uid), m: pick(this.content.moves[e.move].name) })); this.learning = true; }
      if (e.k === 'level') lines.push(t('levelUp', { n: name(e.uid), l: e.level }));
      if (e.k === 'evolve') lines.push(t('evolved', { a: this.content.species[e.from - 1].name, b: this.content.species[e.to - 1].name }));
    }
    if (m.log.some((e) => e.k === 'evolve' || e.k === 'level')) sfx.level();
    if (lines.length) { this.panels.close(); this.dialog(lines); }
  }

  afterBattle() {
    if (this.profileAfterBattle) this.setProfile(this.profileAfterBattle);
    this.profileAfterBattle = null;
    this.learnNext();
    this.focusGame();
  }

  learnNext() {
    const kin = this.profile?.team.find((k) => k.pending?.length);
    if (!kin || this.battle?.open) return;
    this.panels.learn(kin, kin.pending[0], () => { this.learning = true; });
  }

  // --- HUD, bandeaux, dialogues ---------------------------------------------------------------------------------------

  updateHud() {
    if (!this.profile) return;
    $('hud-zone').textContent = pick(this.zoneInfo?.name) ?? '';
    $('hud-money').textContent = t('money', { n: this.profile.money });
    const others = this.world.peers.size;
    $('hud-online').textContent = others ? t('online', { n: others + 1 }) : '';
    $('btn-menu').textContent = t('menu');
  }

  banner(text) {
    const b = $('banner');
    b.textContent = text;
    b.hidden = false;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { b.hidden = true; }, 2200);
  }

  toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    $('toasts').append(el);
    setTimeout(() => el.remove(), 3200);
  }

  say(m) {
    let key = m.text;
    const params = { ...m };
    if (m.gift) sfx.badge();
    if (m.after) key = key.startsWith('leader') ? 'leaderAfter' : key === 'champion' ? 'championAfter' : 'trainerAfter';
    if (m.item) params.item = pick(this.content.items.find((i) => i.id === m.item)?.name);
    if (key === 'labThanks') sfx.caught();
    if (key === 'nurse') sfx.heal();
    const prefix = m.name ? `${t(`cls_${m.cls}`)} ${m.name} : ` : '';
    this.dialog([prefix + t(key, params)]);
  }

  dialog(lines) {
    this.dialogLines = [...lines];
    this.advanceDialog();
  }

  advanceDialog() {
    const box = $('dialog');
    const line = this.dialogLines.shift();
    if (line === undefined) { this.closeDialog(); return; }
    $('dialog-text').textContent = line;
    box.hidden = false;
  }

  closeDialog() { $('dialog').hidden = true; this.dialogLines = []; }

  get dialogOpen() { return !$('dialog').hidden; }

  focusGame() { $('world').focus({ preventScroll: true }); }

  // --- commandes ------------------------------------------------------------------------------------------------------

  get locked() {
    return !this.inGame || this.awaitingZone || this.dialogOpen || this.panels.isOpen || !!this.battle?.open;
  }

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const dir = KEYS[e.code];
      if (this.battle?.open) {
        if (['Space', 'Enter'].includes(e.code) && !e.target.closest?.('button')) { this.battle.skip?.(); e.preventDefault(); }
        return;
      }
      if (dir && !this.panels.isOpen) {
        e.preventDefault();
        if (!this.held.includes(dir)) this.held.push(dir);
        this.path = [];
      } else if (['Space', 'Enter', 'KeyE'].includes(e.code) && !this.panels.isOpen) {
        e.preventDefault();
        this.pressA();
      } else if (['Escape', 'KeyX', 'KeyM'].includes(e.code)) {
        e.preventDefault();
        this.pressB();
      }
    });
    window.addEventListener('keyup', (e) => {
      const dir = KEYS[e.code];
      if (dir) this.held = this.held.filter((d) => d !== dir);
    });
    window.addEventListener('blur', () => { this.held = []; });
    // manette tactile
    const pad = $('pad');
    for (const b of pad.querySelectorAll('[data-dir]')) {
      const dir = b.dataset.dir;
      const on = (e) => { e.preventDefault(); if (!this.held.includes(dir)) this.held.push(dir); this.path = []; };
      const off = (e) => { e.preventDefault(); this.held = this.held.filter((d) => d !== dir); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    }
    $('btn-a').addEventListener('click', () => this.pressA());
    $('btn-b').addEventListener('click', () => this.pressB());
    $('btn-menu').addEventListener('click', () => (this.panels.isOpen ? this.panels.close() : this.panels.open('team')));
    $('btn-emote').addEventListener('click', () => this.emotePicker());
    $('btn-bike').addEventListener('click', () => { if (!this.locked) this.send({ t: 'use', item: 'bike' }); });
    $('dialog').addEventListener('click', () => this.advanceDialog());
    // toucher la carte : marcher jusque-là, parler, ou ouvrir le menu d'un joueur
    $('world').addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.enableTouch();
      if (this.dialogOpen) { this.advanceDialog(); return; }
      if (this.locked) return;
      const [tx, ty] = this.world.screenToTile(e.clientX, e.clientY);
      const peer = this.world.peerAt(tx, ty);
      if (peer) { this.panels.peer(peer); return; }
      this.path = this.world.path(tx, ty);
    });
    window.addEventListener('touchstart', () => this.enableTouch(), { once: true, passive: true });
    if (window.matchMedia?.('(pointer: coarse)').matches) this.touch = true;
  }

  enableTouch() {
    if (this.touch) return;
    this.touch = true;
    if (this.inGame) $('pad').hidden = false;
  }

  pressA() {
    if (this.dialogOpen) { this.advanceDialog(); return; }
    if (this.locked || this.world.me?.moving) return;
    const m = this.world.me;
    const [dx, dy] = DIRS[m.d];
    const peer = this.world.peerAt(m.x + dx, m.y + dy);
    if (peer && !this.world.npcAt(m.x + dx, m.y + dy)) { this.panels.peer(peer); return; }
    this.send({ t: 'interact' });
  }

  pressB() {
    if (this.dialogOpen) { this.closeDialog(); return; }
    if (!this.panels.modal.hidden && this.panels.modal.dataset.dismiss === '1') { this.panels.closeModal(); return; }
    if (this.panels.isOpen) { this.panels.close(); return; }
    if (this.inGame && !this.battle?.open) this.panels.open('team');
  }

  emotePicker() {
    if (this.locked) return;
    const box = this.panels.showModal(`<div class="emotes">${EMOTES.map((e, i) => `<button type="button" data-e="${i}">${e}</button>`).join('')}</div>`);
    for (const b of box.querySelectorAll('[data-e]')) {
      b.addEventListener('click', () => { this.send({ t: 'emote', e: Number(b.dataset.e) }); this.panels.closeModal(); });
    }
  }

  // --- boucle ---------------------------------------------------------------------------------------------------------

  frame(ts) {
    const dt = Math.min(100, ts - this.last);
    this.last = ts;
    if (this.inGame && this.world.zone) {
      this.world.update(dt);
      this.walk();
      this.world.draw();
    }
    requestAnimationFrame((x) => this.frame(x));
  }

  walk() {
    if (this.locked || this.world.me.moving) return;
    let dir = this.held.at(-1);
    let interact = false;
    if (!dir && this.path.length) {
      dir = this.path.shift();
      if (dir.endsWith('!')) { dir = dir.slice(0, 1); interact = true; }
    }
    if (!dir) return;
    const m = this.world.me;
    const [dx, dy] = DIRS[dir];
    const tx = m.x + dx;
    const ty = m.y + dy;
    if (interact) {
      if (m.d !== dir) { m.d = dir; this.send({ t: 'turn', d: dir }); }
      const peer = this.world.peerAt(tx, ty);
      if (peer && !this.world.npcAt(tx, ty)) this.panels.peer(peer);
      else this.send({ t: 'interact' });
      return;
    }
    if (this.world.free(tx, ty)) {
      this.send({ t: 'step', d: dir, n: ++this.seq });
      this.world.startStep(dir);
      if (this.world.isWarp(tx, ty)) this.awaitingZone = true;
      return;
    }
    if (m.d !== dir) { m.d = dir; this.send({ t: 'turn', d: dir }); }
    this.path = [];
    if (performance.now() - this.lastBump > 300) { sfx.bump(); this.lastBump = performance.now(); }
  }
}

const app = new App();
window.__bramble = app;
