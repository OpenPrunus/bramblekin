// Bramblekin — panneaux : équipe, sac, bestiaire, carte, classement, code, options ; boutique, boîte, échange, invitations.
import { t, pick, getLang } from './i18n.js';
import { creatureCanvas, TYPE_COLORS, LOOKS, SPRITE_SIZE, characterCanvas, palette } from './sprites.js';
import { soundOn } from './audio.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Image d'une créature (canvas copié, agrandi par le CSS). */
export function kinImg(sp, cls = '', silhouette = false) {
  const c = document.createElement('canvas');
  c.width = SPRITE_SIZE; c.height = SPRITE_SIZE;
  c.className = `kin ${cls}`;
  if (sp) c.getContext('2d').drawImage(creatureCanvas(sp, { silhouette }), 0, 0);
  return c;
}

const typeBadge = (type) => `<span class="type" style="--tc:${TYPE_COLORS[type][0]}">${esc(t(`type_${type}`))}</span>`;

export class Panels {
  constructor(app) {
    this.app = app;
    this.sheet = document.getElementById('sheet');
    this.body = document.getElementById('sheet-body');
    this.tabs = document.getElementById('sheet-tabs');
    this.modal = document.getElementById('modal');
    this.modalBox = document.getElementById('modal-box');
    this.current = null;
    document.getElementById('sheet-close').addEventListener('click', () => this.close());
    this.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (b) this.open(b.dataset.tab);
    });
    // le clic qui suit un toucher tombe sur le fond de la fenêtre qui vient de s'ouvrir : on l'ignore
    this.modal.addEventListener('click', (e) => {
      if (performance.now() - this.openedAt < 450) { e.stopPropagation(); e.preventDefault(); return; }
      if (e.target === this.modal && this.modal.dataset.dismiss === '1') this.closeModal();
    }, true);
  }

  get isOpen() { return !this.sheet.hidden || !this.modal.hidden; }

  species(id) { return this.app.content.species[id - 1]; }

  // --- feuille à onglets -----------------------------------------------------------------------------------------------

  open(tab, data) {
    this.current = tab;
    this.sheet.hidden = false;
    const menuTabs = ['team', 'bag', 'dex', 'map', 'ranking', 'code', 'options'];
    this.tabs.innerHTML = menuTabs.includes(tab)
      ? menuTabs.map((k) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}">${esc(t(k))}</button>`).join('')
      : `<h2>${esc(t(tab === 'shop' ? 'shop' : tab === 'box' ? 'pc' : tab))}</h2>`;
    this.body.innerHTML = '';
    this.body.scrollTop = 0;
    this[`render_${tab}`]?.(data);
    this.sheet.querySelector('#sheet-close').focus({ preventScroll: true });
  }

  refresh() {
    if (!this.sheet.hidden && this.current && !['dex', 'map', 'ranking', 'code', 'options'].includes(this.current)) {
      const keep = this.body.scrollTop;
      this.body.innerHTML = '';
      this[`render_${this.current}`]?.(this.lastData);
      this.body.scrollTop = keep;
    }
  }

  close() {
    this.sheet.hidden = true;
    this.current = null;
    this.app.focusGame();
  }

  render_team() {
    const p = this.app.profile;
    const list = document.createElement('div');
    list.className = 'kin-list';
    p.team.forEach((k, i) => list.append(this.kinCard(k, i)));
    this.body.append(list);
  }

  kinCard(k, i) {
    const sp = this.species(k.sp);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `kin-card${k.hp <= 0 ? ' ko' : ''}`;
    card.append(kinImg(sp));
    const pct = Math.max(0, k.hp / k.max * 100);
    card.insertAdjacentHTML('beforeend', `<div class="kc-info"><b>${esc(sp.name)}</b> <span class="lv">${t('lv', { n: k.lv })}</span>
      ${k.st ? `<span class="st ${k.st}">${t(`st_${k.st}`)}</span>` : ''}${k.pending?.length ? '<span class="dot" title="!">!</span>' : ''}
      <div class="types">${sp.types.map(typeBadge).join('')}</div>
      <div class="bar"><i class="${pct > 50 ? 'ok' : pct > 20 ? 'mid' : 'low'}" style="width:${pct}%"></i></div><small>${k.hp} / ${k.max} ${t('hp')}</small></div>`);
    card.addEventListener('click', () => this.kinDetail(k, i));
    return card;
  }

  kinDetail(k, i) {
    const sp = this.species(k.sp);
    this.body.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'kin-detail';
    box.append(kinImg(sp, 'big'));
    const moves = k.moves.map((m) => {
      const mv = this.app.content.moves[m.id];
      return `<li style="--tc:${TYPE_COLORS[mv.type][0]}"><b>${esc(pick(mv.name))}</b> <small>${t(`type_${mv.type}`)} · ${mv.power || '—'} · ${t('pp')} ${m.pp}/${m.max}</small></li>`;
    }).join('');
    box.insertAdjacentHTML('beforeend', `<h3>${esc(sp.name)} <span class="lv">${t('lv', { n: k.lv })}</span></h3>
      <div class="types">${sp.types.map(typeBadge).join('')}</div>
      <p>${k.hp} / ${k.max} ${t('hp')} · ${t('atk')} ${k.stats.atk} · ${t('def')} ${k.stats.def} · ${t('spd')} ${k.stats.spd}</p>
      <p><small>${t('xpNext', { n: Math.max(0, k.xpHi - k.xp) })}${sp.evo ? ` · ${t('dexEvolves', { n: sp.evoLv })}` : ''}</small></p>
      <h4>${t('moves')}</h4><ul class="moves">${moves}</ul><div class="row"></div>`);
    const row = box.querySelector('.row');
    const btn = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.addEventListener('click', fn);
      row.append(b);
      return b;
    };
    if (i > 0) {
      btn(t('lead'), () => { this.app.send({ t: 'order', from: i, to: 0 }); this.close(); });
      btn(t('moveUp'), () => { this.app.send({ t: 'order', from: i, to: i - 1 }); this.close(); });
    }
    for (const it of ['potion', 'potion2', 'potion3', 'remedy', 'revive']) {
      const n = this.app.profile.items[it] ?? 0;
      if (n > 0) {
        const item = this.app.content.items.find((x) => x.id === it);
        btn(`${pick(item.name)} ×${n}`, () => { this.app.send({ t: 'use', item: it, uid: k.uid }); this.close(); });
      }
    }
    if (k.pending?.length) btn(t('learnNow'), () => { this.close(); this.app.learnNext(); });
    btn(`← ${t('back')}`, () => this.open('team'));
    this.body.append(box);
  }

  render_bag() {
    const p = this.app.profile;
    const ul = document.createElement('ul');
    ul.className = 'bag';
    let any = false;
    for (const it of this.app.content.items) {
      const n = p.items[it.id] ?? 0;
      if (!n) continue;
      any = true;
      ul.insertAdjacentHTML('beforeend', `<li><span class="item-ico i-${it.id.replace(/\d/, '')}"></span>${esc(pick(it.name))}<b>×${n}</b></li>`);
    }
    this.body.insertAdjacentHTML('beforeend', `<p class="money">${t('money', { n: p.money })} · ${t('badges', { n: p.badges.length })}</p>`);
    const badges = document.createElement('div');
    badges.className = 'badges';
    for (let b = 1; b <= 8; b++) badges.insertAdjacentHTML('beforeend', `<span class="badge ${p.badges.includes(b) ? 'on' : ''} b${b}" title="${esc(t(`badge${b}`))}"></span>`);
    this.body.append(badges);
    this.body.append(any ? ul : Object.assign(document.createElement('p'), { textContent: t('nothing') }));
  }

  render_dex() {
    const dex = this.app.profile.dex;
    const seen = Object.keys(dex).length;
    const caught = Object.values(dex).filter((v) => v === 2).length;
    this.body.insertAdjacentHTML('beforeend', `<p>${t('dexCount', { seen, caught })}</p>`);
    const grid = document.createElement('div');
    grid.className = 'dex-grid';
    for (const sp of this.app.content.species) {
      const state = dex[sp.id] ?? 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `dex-cell s${state}`;
      b.append(state ? kinImg(sp) : kinImg(sp, '', true));
      b.insertAdjacentHTML('beforeend', `<small>${String(sp.id).padStart(3, '0')}</small>`);
      b.addEventListener('click', () => this.dexDetail(sp, state));
      grid.append(b);
    }
    this.body.append(grid);
  }

  dexDetail(sp, state) {
    this.body.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'kin-detail';
    box.append(kinImg(sp, 'big', !state));
    const where = sp.tier === 0 ? t('dexStarter') : sp.tier === 10 ? t('dexLegend') : t('dexWhere', { n: sp.tier });
    box.insertAdjacentHTML('beforeend', state
      ? `<h3>${String(sp.id).padStart(3, '0')} · ${esc(sp.name)}</h3><div class="types">${sp.types.map(typeBadge).join('')}</div>
        <p>${t('hp')} ${sp.base.hp} · ${t('atk')} ${sp.base.atk} · ${t('def')} ${sp.base.def} · ${t('spd')} ${sp.base.spd}</p>
        <p><small>${sp.stage === 1 ? where : ''}${sp.evo ? ` ${t('dexEvolves', { n: sp.evoLv })}` : ''}</small></p>`
      : `<h3>${String(sp.id).padStart(3, '0')} · ???</h3><p>${t('dexUnknown')}</p>`);
    const back = document.createElement('button');
    back.type = 'button'; back.textContent = `← ${t('back')}`;
    back.addEventListener('click', () => this.open('dex'));
    box.append(back);
    this.body.append(box);
  }

  render_map() {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 420;
    c.className = 'region';
    const ctx = c.getContext('2d');
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const row = Math.floor(i / 2);
      pts.push([i % 2 === 0 ? (row % 2 ? 230 : 90) : (row % 2 ? 90 : 230), 390 - i * 38]);
    }
    ctx.fillStyle = '#9fd18f'; ctx.fillRect(0, 0, 320, 420);
    ctx.fillStyle = '#7cb46b';
    for (let k = 0; k < 40; k++) { ctx.beginPath(); ctx.arc((k * 97) % 320, (k * 53) % 420, 14, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#e8eef2';
    ctx.beginPath(); ctx.moveTo(110, 40); ctx.lineTo(160, 0); ctx.lineTo(210, 40); ctx.fill();
    ctx.strokeStyle = '#d9b36b'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    const z = this.app.zoneInfo;
    const here = z ? (z.kind === 'route' ? z.index + 0.5 : z.index) : 1;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    pts.forEach(([x, y], i) => {
      ctx.fillStyle = '#1d1a26'; ctx.fillRect(x - 9, y - 9, 18, 18);
      ctx.fillStyle = i === 9 ? '#d4af37' : '#d8434b'; ctx.fillRect(x - 7, y - 7, 14, 14);
      ctx.fillStyle = '#1d1a26';
      ctx.fillText(pick(this.app.content.towns[i]), x, y + 22);
    });
    const a = pts[Math.min(9, Math.floor(here) - 1)];
    const b = pts[Math.min(9, Math.ceil(here) - 1)];
    const f = here % 1;
    const mx = a[0] + (b[0] - a[0]) * f; const my = a[1] + (b[1] - a[1]) * f;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = LOOKS[this.app.profile.look] ?? '#3f7fd6'; ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
    this.body.append(c);
    this.body.insertAdjacentHTML('beforeend', `<p class="center">${esc(t('youAreHere'))} : <b>${esc(pick(z?.name))}</b></p>`);
  }

  async render_ranking() {
    this.body.insertAdjacentHTML('beforeend', `<p>${t('rankingHint')}</p><div class="rank">…</div>`);
    const holder = this.body.querySelector('.rank');
    try {
      const rows = await (await fetch('api.php', { cache: 'no-store' })).json();
      holder.innerHTML = rows.length
        ? `<table><tbody>${rows.map((r) => `<tr class="${r.name === this.app.profile.name ? 'me' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td><b>${r.rating}</b></td><td><small>${r.wins}–${r.losses}</small></td></tr>`).join('')}</tbody></table>`
        : `<p>${t('rankingEmpty')}</p>`;
    } catch {
      holder.textContent = t('offline');
    }
  }

  render_code() {
    this.body.insertAdjacentHTML('beforeend', `<h3>${t('codeTitle')}</h3><p>${t('codeHint')}</p><code class="token">${esc(this.app.token)}</code><div class="row"><button type="button" class="copy">${t('copy')}</button></div>`);
    this.body.querySelector('.copy').addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(this.app.token); e.target.textContent = t('copied'); } catch { /* ignoré */ }
    });
  }

  render_options() {
    this.body.insertAdjacentHTML('beforeend', `
      <div class="row"><button type="button" class="lang">${t('language')}</button><button type="button" class="snd">${t('sound')} : ${t(soundOn() ? 'on' : 'off')}</button></div>
      <h4>${t('outfit')}</h4><div class="looks">${LOOKS.map((c, i) => `<button type="button" data-look="${i}" class="${i === this.app.profile.look ? 'on' : ''}" style="--c:${c}" aria-label="${t('outfit')} ${i + 1}"></button>`).join('')}</div>
      <h4>${t('help')}</h4><div class="help">${t('helpText')}</div>
      <p class="links"><a href="https://games.prunus.dev">${t('allGames')}</a> · <a href="https://github.com/OpenPrunus/bramblekin" target="_blank" rel="noopener noreferrer">${t('github')}</a></p>`);
    this.body.querySelector('.lang').addEventListener('click', () => { this.app.toggleLang(); this.open('options'); });
    this.body.querySelector('.snd').addEventListener('click', () => { this.app.toggleSound(); this.open('options'); });
    for (const b of this.body.querySelectorAll('[data-look]')) b.addEventListener('click', () => this.app.send({ t: 'look', n: Number(b.dataset.look) }));
  }

  render_shop(items) {
    this.lastData = items;
    const p = this.app.profile;
    this.body.insertAdjacentHTML('beforeend', `<p class="money">${t('money', { n: p.money })}</p>`);
    const ul = document.createElement('ul');
    ul.className = 'shop';
    for (const { id, price } of items) {
      const it = this.app.content.items.find((x) => x.id === id);
      const li = document.createElement('li');
      li.innerHTML = `<span class="item-ico i-${id.replace(/\d/, '')}"></span><span class="nm">${esc(pick(it.name))} <small>×${p.items[id] ?? 0}</small></span><span class="price">${price}</span>`;
      for (const n of [1, 5]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `${t('buy')} ×${n}`;
        b.disabled = p.money < price * n;
        b.addEventListener('click', () => this.app.send({ t: 'buy', item: id, n }));
        li.append(b);
      }
      ul.append(li);
    }
    this.body.append(ul);
  }

  render_box(box) {
    this.lastData = box;
    const p = this.app.profile;
    const wrap = document.createElement('div');
    wrap.className = 'box-cols';
    const col = (title, list, action) => {
      const c = document.createElement('div');
      c.innerHTML = `<h4>${title} <small>(${list.length})</small></h4>`;
      for (const k of list) {
        const sp = this.species(k.sp);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'kin-mini';
        b.append(kinImg(sp));
        b.insertAdjacentHTML('beforeend', `<span>${esc(sp.name)} <small>${t('lv', { n: k.lv })}</small></span>`);
        b.addEventListener('click', () => this.app.send({ t: action, uid: k.uid }));
        c.append(b);
      }
      return c;
    };
    wrap.append(col(t('team'), p.team, 'deposit'), col(t('pc'), box, 'withdraw'));
    this.body.append(wrap);
  }

  // --- fenêtres ---------------------------------------------------------------------------------------------------------

  showModal(html, { dismiss = true } = {}) {
    this.modal.hidden = false;
    this.openedAt = performance.now();
    this.modal.dataset.dismiss = dismiss ? '1' : '0';
    this.modalBox.innerHTML = html;
    return this.modalBox;
  }

  closeModal() {
    this.modal.hidden = true;
    this.modalKind = null;
    this.app.focusGame();
  }

  actions(box, list) {
    const row = document.createElement('div');
    row.className = 'row';
    for (const [label, fn, cls] of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (cls) b.className = cls;
      b.addEventListener('click', fn);
      row.append(b);
    }
    box.append(row);
    row.querySelector('button')?.focus({ preventScroll: true });
  }

  peer(p) {
    const box = this.showModal(`<h3>${esc(p.name)}</h3>${p.busy ? `<p><small>${t('busy')}</small></p>` : ''}`);
    this.modalKind = 'peer';
    this.actions(box, [
      [t('duel'), () => { this.app.send({ t: 'invite', id: p.id, kind: 'duel' }); this.closeModal(); }, 'primary'],
      [t('trade'), () => { this.app.send({ t: 'invite', id: p.id, kind: 'trade' }); this.closeModal(); }],
      [t('cancel'), () => this.closeModal()],
    ]);
  }

  invite(m) {
    const box = this.showModal(`<p>${esc(t(m.kind === 'duel' ? 'inviteDuel' : 'inviteTrade', { n: m.name }))}</p>`, { dismiss: false });
    this.modalKind = `invite:${m.from}`;
    this.actions(box, [
      [t('accept'), () => { this.app.send({ t: 'accept', id: m.from }); this.closeModal(); }, 'primary'],
      [t('decline'), () => { this.app.send({ t: 'decline', id: m.from }); this.closeModal(); }],
    ]);
  }

  inviteGone(from) {
    if (this.modalKind === `invite:${from}`) this.closeModal();
  }

  trade(s) {
    const p = this.app.profile;
    const box = this.showModal(`<h3>${esc(t('tradeTitle', { n: s.name }))}</h3><div class="trade"><div class="mine"><h4>${t('tradeYours')}</h4></div><div class="theirs"><h4>${t('tradeTheirs')}</h4></div></div><p><small>${t('tradePick')}</small></p><div class="kin-row"></div>`, { dismiss: false });
    this.modalKind = 'trade';
    const mineK = p.team.find((k) => k.uid === s.mine);
    box.querySelector('.mine').append(mineK ? this.tradeKin(mineK) : Object.assign(document.createElement('p'), { textContent: t('tradeNone') }));
    box.querySelector('.theirs').append(s.theirs ? this.tradeKin(s.theirs) : Object.assign(document.createElement('p'), { textContent: t('tradeNone') }));
    const row = box.querySelector('.kin-row');
    for (const k of p.team) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `kin-mini${k.uid === s.mine ? ' on' : ''}`;
      b.append(kinImg(this.species(k.sp)));
      b.insertAdjacentHTML('beforeend', `<small>${t('lv', { n: k.lv })}</small>`);
      b.addEventListener('click', () => this.app.send({ t: 'offer', uid: k.uid }));
      row.append(b);
    }
    const ready = s.mine !== null && s.theirs !== null;
    this.actions(box, [
      [s.confirmed ? t('confirmed') : t('confirm'), () => this.app.send({ t: 'confirm' }), `primary${!ready || s.confirmed ? ' disabled' : ''}`],
      [t('cancel'), () => this.app.send({ t: 'untrade' })],
    ]);
    if (s.confirmed && !s.theyConfirmed) box.insertAdjacentHTML('beforeend', `<p><small>${t('waitingConfirm')}</small></p>`);
    if (!ready || s.confirmed) box.querySelector('.primary').disabled = true;
  }

  tradeKin(k) {
    const sp = this.species(k.sp);
    const d = document.createElement('div');
    d.className = 'trade-kin';
    d.append(kinImg(sp, 'big'));
    d.insertAdjacentHTML('beforeend', `<b>${esc(sp.name)}</b> <small>${t('lv', { n: k.lv })}</small><div class="types">${sp.types.map(typeBadge).join('')}</div>`);
    return d;
  }

  learn(kin, move, onDone) {
    const sp = this.species(kin.sp);
    const mv = this.app.content.moves[move];
    const box = this.showModal(`<h3>${esc(t('learnTitle', { n: sp.name, m: pick(mv.name) }))}</h3>
      <p><small>${t(`type_${mv.type}`)} · ${mv.power || '—'} · ${t('pp')} ${mv.pp}</small></p><p>${t('learnHint')}</p>`, { dismiss: false });
    this.modalKind = 'learn';
    const list = kin.moves.map((m, i) => [pick(this.app.content.moves[m.id].name), () => { this.app.send({ t: 'learn', uid: kin.uid, move, slot: i }); this.closeModal(); onDone(); }]);
    list.push([t('dontLearn'), () => { this.app.send({ t: 'learn', uid: kin.uid, move, slot: -1 }); this.closeModal(); onDone(); }]);
    this.actions(box, list);
    box.querySelector('.row').classList.add('col');
  }

  /** Au laboratoire : l'orbe examiné montre son compagnon ; on confirme ou on regarde les autres. */
  starterPick(id, onPick) {
    const sp = this.species(id);
    const box = this.showModal(`<div class="pick"></div><h3>${esc(sp.name)}</h3><div class="types center-row">${sp.types.map(typeBadge).join('')}</div><p>${esc(t('pickAsk', { n: sp.name }))}</p>`, { dismiss: false });
    box.querySelector('.pick').append(kinImg(sp, 'big'));
    this.modalKind = 'pick';
    this.actions(box, [
      [t('yes'), () => { this.closeModal(); onPick(id); }, 'primary'],
      [t('no'), () => this.closeModal()],
    ]);
  }

  /** Présentation du monde par le professeur, la toute première fois. */
  intro(name, onDone) {
    let i = 1;
    const box = this.showModal('<div class="prof-portrait"></div><p class="intro-text"></p><div class="intro-kins"></div>', { dismiss: false });
    this.modalKind = 'intro';
    box.classList.add('intro');
    const portrait = box.querySelector('.prof-portrait');
    const face = document.createElement('canvas');
    face.width = 48; face.height = 64;
    face.getContext('2d').drawImage(characterCanvas(palette('prof', 0), 'd', 0), 0, 0);
    portrait.append(face);
    const kins = box.querySelector('.intro-kins');
    for (const id of [1, 4, 7, 22, 49]) kins.append(kinImg(this.species(id)));
    const text = box.querySelector('.intro-text');
    const show = () => { text.textContent = t(`intro${i}`, { n: name }); };
    show();
    this.actions(box, [
      [t('next'), () => { i++; if (i > 4) { this.closeModal(); box.classList.remove('intro'); onDone(); } else show(); }, 'primary'],
      [t('introSkip'), () => { this.closeModal(); box.classList.remove('intro'); onDone(); }],
    ]);
  }

  lang() { return getLang(); }
}
