// Điều khiển ván chơi: thao tác người chơi, vòng lặp AI, panel/preview/menu.
import { CONFIG, FACTIONS, TERRAIN, STATS, LEVEL, MAP_SIZES } from './config.js';
import { generateMap } from './mapgen.js';
import {
  createState, reachable, targetsFrom, previewAttack, moveUnit, attackUnit, waitUnit, mergeUnits,
  splitUnit, splitTiles, canSplit, endTurn, unitAt, key, pathTo, defensePct, statsOf, terrainId,
  alliesOf, rangeAt, inEnemyZoc, terrainFacts, tilesInRange, threatTiles, moveCostFor, canFortify, fortifyUnit, fortifyBonus, levelOf, nextLevelXp,
} from './rules.js';
import { planNextAction } from './ai.js';
import { executeAction } from './actions.js';
import { t, setLang, getLang, LANGS, langName } from './i18n.js';
import { icon, rankIcon } from './icons.js';
import { createMissionState, MISSION_TYPES } from './missions.js';

const SPEEDS = { normal: 1, fast: 2.4, instant: 14 };
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Game {
  constructor(view, settings, save) {
    this.view = view;
    this.settings = settings;
    this.save = save;
    this.busy = false;
    this.sel = null;
    this.pending = null;
    this.hoverUnit = null;
    this.hoverTile = null;
    this.confirmEnd = false;
    this.players = { human: { type: 'player' }, orc: { type: 'ai' } }; // sau này: hotseat/AI cả hai phe
    view.hooks = {
      onTap: (tile) => this.onTap(tile),
      onHover: (tile) => this.onHover(tile),
      onCancel: () => this.cancel(),
      onCamera: () => this.placeMoveBtn(),
      isActionable: (tile) => this.isActionable(tile),
      onLongPress: (tile) => this.inspect(tile),
    };
    this.bindChrome();
    view.setIdle(settings.idle === true);
    view.setClouds(settings.clouds !== false);
  }

  get state() { return this.view.state; }
  get speed() { return SPEEDS[this.settings.speed] || 1; }

  // ---------- Vòng đời ----------
  // hold = true: dựng bản đồ nhưng chưa bắt đầu lượt (màn mở đầu đang che phía trước)
  newGame(seed, hold = false) {
    this.seed = seed >>> 0;
    const size = MAP_SIZES[this.settings.mapSize] || MAP_SIZES.small;
    const map = generateMap(this.seed, size.w, size.h);
    this.map = map;
    this.busy = false;
    this.sel = null; this.pending = null; this.origin = null;
    this.view.speed = this.speed;
    const st = createMissionState(map, this.settings.mission || 'skirmish', 'human');
    this.view.reset(st);
    this.refreshAll();
    if (!hold) { this.briefMission(); this.beginTurn(); }
  }

  // Nhắc mục tiêu nhiệm vụ lúc bắt đầu (giao tranh thì thôi, ai cũng biết)
  briefMission() {
    const m = this.state.mission;
    if (m.type === 'skirmish') return;
    this.toast(t('mission.brief.' + m.type, { n: m.turns }), 5200);
  }

  snd(name, opts) { this.audio?.play(name, opts); }

  async beginTurn() {
    const f = this.state.current;
    this.snd(f === 'human' ? 'turn_player' : 'turn_enemy');
    this.banner(t(f === 'human' ? 'ui.yourTurn' : 'ui.enemyTurn'), f);
    this.refreshAll();
    if (this.players[f].type === 'ai') await this.runAI(f);
  }

  banner(text, cls = '') {
    const b = $('banner');
    b.hidden = true; void b.offsetWidth;
    b.className = cls; b.textContent = text; b.hidden = false;
    clearTimeout(this._bt);
    this._bt = setTimeout(() => { b.hidden = true; }, 1300 / Math.min(this.speed, 3));
  }

  toast(text, ms = 1800) {
    const el = $('toast');
    el.textContent = text; el.hidden = false;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ---------- AI ----------
  async runAI(f) {
    this.busy = true;
    this.refreshAll();
    const level = f === 'orc' ? this.settings.difficulty : this.settings.difficulty;
    const s = this.state;
    await wait(550 / this.speed);
    let guard = 0, a;
    while (!s.winner && (a = planNextAction(s, level)) && guard++ < 80) {
      const u = s.units.find((x) => x.id === a.unit.id);
      if (!u) break;
      await this.view.ensureVisible(u.x, u.y);
      const ev = executeAction(s, a);
      await this.view.playEvents(ev);
      await wait(140 / this.speed);
    }
    if (!s.winner) await this.view.playEvents(endTurn(s));
    this.busy = false;
    this.afterTurnChange();
  }

  afterTurnChange() {
    if (this.state.winner) return this.gameOver();
    this.beginTurn();
  }

  // ---------- Kết thúc lượt ----------
  idleUnits() {
    const s = this.state;
    return alliesOf(s, s.current).filter((u) => !u.acted && u.status === 'ok');
  }

  async onEndTurn() {
    const s = this.state;
    if (this.busy || s.winner || this.players[s.current].type !== 'player') return;
    const idle = this.idleUnits().length;
    if (idle > 0 && !this.confirmEnd) {
      this.confirmEnd = true;
      this.renderEndTurn();
      clearTimeout(this._ce);
      this._ce = setTimeout(() => { this.confirmEnd = false; this.renderEndTurn(); }, 3500);
      return;
    }
    this.confirmEnd = false;
    this.snd('end_turn');
    this.deselect();
    this.busy = true;
    this.refreshAll();
    await this.view.playEvents(endTurn(s));
    this.busy = false;
    this.afterTurnChange();
  }

  // ---------- Chọn / hành động ----------
  clearInfo() { this.moveTarget = null; this.inspectTile = null; this.rangeTiles = null; this.hoverRange = null; this.threat = null; }

  deselect() {
    this.sel = null; this.pending = null; this.attackOpts = null; this.reach = null; this.origin = null;
    this.mode = 'idle';
    this.clearInfo();
    this.refreshOverlay();
    this.refreshActions();
    this.hidePreview();
    this.refreshPanel();
  }

  cancel() {
    if (this.busy) return;
    this.snd('ui_cancel');
    if (this.moveTarget) { this.moveTarget = null; this.refreshOverlay(); return; }
    if (this.pending) { this.pending = null; this.hidePreview(); this.refreshOverlay(); return; }
    if (this.splitting) { this.splitting = false; this.select(this.sel); return; }
    this.deselect();
  }

  select(u) {
    const s = this.state;
    this.snd('ui_select');
    this.sel = u; this.pending = null; this.splitting = false;
    this.clearInfo();
    const own = u.faction === s.current && !u.acted && u.status === 'ok';
    if (!own) {
      this.reach = { tiles: new Map(), merges: new Map() };
      this.attackOpts = new Map();
      this.mode = 'view';
    } else {
      this.reach = u.moved ? { tiles: new Map([[key(u.x, u.y), { x: u.x, y: u.y, cost: 0 }]]), merges: new Map() } : reachable(s, u);
      this.attackOpts = this.computeAttackOpts(u);
      this.mode = u.moved ? 'moved' : 'selected';
      // cung thủ (và sau này pháo binh): hiện vùng tầm bắn từ chỗ đang đứng
      if (statsOf(u).range[1] > 1) this.rangeTiles = tilesInRange(s, u, u.x, u.y);
    }
    // xem một đơn vị địch: hiện vùng nó có thể đánh tới ở lượt sau
    if (u.faction !== s.current && !u.static) this.threat = threatTiles(s, u);
    this.refreshOverlay();
    this.refreshActions();
    this.hidePreview();
    this.refreshPanel();
  }

  computeAttackOpts(u) {
    const s = this.state;
    const opts = new Map();
    const dmgOf = (node, tgt) => previewAttack(s, u, tgt, node.x, node.y, node.cost);
    for (const node of this.reach.tiles.values()) {
      for (const tg of targetsFrom(s, u, node.x, node.y)) {
        const cur = opts.get(tg.id);
        const here = node.x === u.x && node.y === u.y;
        const defHere = defensePct(s, u, node.x, node.y);
        const better = !cur
          || (here && !(cur.node.x === u.x && cur.node.y === u.y))
          || (!(cur.node.x === u.x && cur.node.y === u.y) && (defHere > cur.def || (defHere === cur.def && node.cost < cur.node.cost)));
        if (better) opts.set(tg.id, { node, target: tg, def: defHere });
      }
    }
    for (const o of opts.values()) o.pv = dmgOf(o.node, o.target);
    return opts;
  }

  refreshOverlay() {
    const s = this.state, u = this.sel, o = {};
    if (u) {
      o.selected = { x: u.x, y: u.y };
      if (this.splitting) {
        o.split = splitTiles(s, u);
      } else if (this.mode === 'selected') {
        o.move = [...this.reach.tiles.values()].filter((n) => !(n.x === u.x && n.y === u.y));
        o.merge = [...this.reach.merges.keys()].map((id) => s.units.find((x) => x.id === id)).filter(Boolean).map((x) => ({ x: x.x, y: x.y }));
      }
      if (this.attackOpts && !this.splitting) o.attack = [...this.attackOpts.values()].map((a) => ({ x: a.target.x, y: a.target.y }));
      if (this.pending) {
        const n = this.pending.node;
        if (n.x !== u.x || n.y !== u.y) { o.dest = { x: n.x, y: n.y }; o.path = pathTo(this.reach.tiles.get(key(n.x, n.y))); }
        if (statsOf(u).range[1] > 1) o.range = tilesInRange(s, u, n.x, n.y);
      }
    }
    if (this.moveTarget && u && this.mode === 'selected' && this.reach.tiles.has(key(this.moveTarget.x, this.moveTarget.y))) {
      const mt = this.moveTarget;
      o.dest = { x: mt.x, y: mt.y };
      o.path = pathTo(this.reach.tiles.get(key(mt.x, mt.y)));
      if (statsOf(u).range[1] > 1) o.range = tilesInRange(s, u, mt.x, mt.y);
    }
    if (!o.range && !this.splitting) o.range = this.hoverRange || this.rangeTiles || undefined;
    if (this.threat) o.threat = this.threat;
    o.hover = this.inspectTile || this.hoverTile || undefined;
    this.view.setOverlay(o);
    this.placeMoveBtn();
  }

  // ---------- Tap / hover ----------
  onHover(tile) {
    if (this.busy) return;
    const same = tile && this.hoverTile && tile.x === this.hoverTile.x && tile.y === this.hoverTile.y;
    if (same || (!tile && !this.hoverTile)) return;
    this.hoverTile = tile;
    this.hoverUnit = tile ? unitAt(this.state, tile.x, tile.y) : null;
    this.hoverRange = null;
    const u = this.sel;
    if (tile && u && this.mode === 'selected' && statsOf(u).range[1] > 1 && this.reach.tiles.has(key(tile.x, tile.y))) {
      this.hoverRange = tilesInRange(this.state, u, tile.x, tile.y);
    }
    this.refreshOverlay();
    if (!this.pending) {
      this.refreshPanel();
      const opt = this.hoverUnit && this.attackOpts?.get(this.hoverUnit.id);
      if (opt && !this.splitting) this.showPreview(opt, false); else this.hidePreview();
    }
  }

  async onTap(tile) {
    const s = this.state;
    if (this.busy || s.winner || this.players[s.current].type !== 'player') return;
    if (!tile) return this.cancel();
    const u = unitAt(s, tile.x, tile.y);
    const sel = this.sel;

    if (this.splitting) {
      const ok = splitTiles(s, sel).some((p) => p.x === tile.x && p.y === tile.y);
      if (ok) return this.doSplit(tile);
      return this.cancel();
    }

    if (this.pending) {
      if (u && u.id === this.pending.target.id) return this.confirmAttack();
      this.pending = null; this.hidePreview();
    }

    if (u && sel && u.id !== sel.id && u.faction !== s.current && this.attackOpts?.has(u.id)) {
      return this.proposeAttack(u);
    }
    if (u && sel && u.id !== sel.id && u.faction === s.current && this.mode === 'selected' && this.reach.merges.has(u.id)) {
      return this.doMerge(u);
    }
    if (u) {
      if (sel && u.id === sel.id) return this.deselect();
      this.select(u);
      return;
    }
    if (sel && this.mode === 'selected' && this.reach.tiles.has(key(tile.x, tile.y))) {
      return this.proposeMove(tile);
    }
    if (this.moveTarget) { this.moveTarget = null; this.refreshOverlay(); return; }
    this.inspect(tile);
  }

  // Ô đang có hành động hợp lệ cho đơn vị được chọn (đi, đánh, gộp, tách)
  isActionable(tile) {
    const s = this.state, u = this.sel;
    if (!u || this.busy || s.winner || this.mode === 'view') return false;
    if (this.splitting) return splitTiles(s, u).some((p) => p.x === tile.x && p.y === tile.y);
    const at = unitAt(s, tile.x, tile.y);
    if (at) {
      if (this.attackOpts?.has(at.id)) return true;
      return this.mode === 'selected' && this.reach.merges.has(at.id);
    }
    return this.mode === 'selected' && this.reach.tiles.has(key(tile.x, tile.y)) && !(tile.x === u.x && tile.y === u.y);
  }

  // Xem thông tin một ô (chạm vào ô trống, hoặc giữ ngón tay lên bất kỳ ô nào). Không đổi đơn vị đang chọn.
  inspect(tile) {
    const s = this.state;
    if (this.busy || !tile || s.winner) return;
    if (this.inspectTile && this.inspectTile.x === tile.x && this.inspectTile.y === tile.y) {
      this.inspectTile = null; this.threat = null;
    } else {
      this.inspectTile = tile;
      const u = unitAt(s, tile.x, tile.y);
      this.threat = u && u.faction !== s.current && !u.static ? threatTiles(s, u) : null;
    }
    this.pending = null; this.hidePreview();
    this.refreshOverlay();
    this.refreshPanel();
  }

  proposeAttack(enemy) {
    const opt = this.attackOpts.get(enemy.id);
    if (!opt) return;
    this.moveTarget = null;
    this.pending = opt;
    this.refreshOverlay();
    this.showPreview(opt, true);
  }

  async confirmAttack() {
    const s = this.state, u = this.sel, p = this.pending;
    if (!u || !p) return;
    this.snd('ui_confirm');
    this.busy = true;
    this.hidePreview();
    this.view.setOverlay({});
    if (p.node.x !== u.x || p.node.y !== u.y) {
      const ev = moveUnit(s, u, p.node.x, p.node.y);
      if (ev) await this.view.playEvents(ev);
    }
    const tgt = s.units.find((x) => x.id === p.target.id);
    if (tgt) await this.view.playEvents(attackUnit(s, u, tgt));
    this.afterAction();
  }

  // Bước xác nhận di chuyển: chạm ô chỉ đánh dấu đích; quân chỉ đi khi bấm nút "Tới đây" ngay trên ô (đỡ trượt tay)
  proposeMove(tile) {
    if (this.moveTarget && this.moveTarget.x === tile.x && this.moveTarget.y === tile.y) return;
    this.snd('ui_select');
    this.moveTarget = { x: tile.x, y: tile.y };
    this.hidePreview(); this.pending = null;
    this.refreshOverlay();
  }

  placeMoveBtn() {
    const b = $('movebtn');
    if (!b) return;
    if (!this.moveTarget || this.busy || !this.sel) { b.hidden = true; return; }
    const p = this.view.tileScreen(this.moveTarget.x, this.moveTarget.y);
    b.innerHTML = icon('check') + ' ' + esc(t('ui.moveHere'));
    b.hidden = false;
    b.style.left = p.x + 'px'; b.style.top = (p.y - 22) + 'px';
  }

  async confirmMove() {
    const t0 = this.moveTarget;
    if (!t0 || this.busy || !this.sel) return;
    this.snd('ui_confirm');
    this.moveTarget = null; $('movebtn').hidden = true;
    return this.doMove(t0);
  }

  async doMove(tile) {
    const s = this.state, u = this.sel;
    const origin = { x: u.x, y: u.y, fort: u.fort };
    this.busy = true;
    this.view.setOverlay({});
    const ev = moveUnit(s, u, tile.x, tile.y);
    if (ev) await this.view.playEvents(ev);
    this.busy = false;
    // bước chân có thể quyết định ván (tướng hộ tống tới đích): phải kết thúc ngay, không để kẹt giữa chừng
    if (s.winner) { this.sel = null; this.origin = null; this.mode = 'idle'; this.refreshAll(); return this.gameOver(); }
    this.select(u);
    this.origin = { id: u.id, ...origin };
    this.refreshActions();
  }

  async doMerge(tgt) {
    const s = this.state, u = this.sel;
    this.busy = true; this.hidePreview(); this.view.setOverlay({});
    const ev = mergeUnits(s, u, tgt);
    if (ev) { await this.view.playEvents(ev); this.toast(t('ui.toast.merged')); } else (this.snd('ui_deny'), this.toast(t('ui.toast.mergeFail')));
    this.afterAction();
  }

  startSplit() {
    const u = this.sel;
    if (!u || !canSplit(this.state, u)) { this.snd('ui_deny'); return this.toast(t('ui.toast.noSplit')); };
    this.splitting = true;
    this.pending = null;
    this.refreshOverlay(); this.refreshActions(); this.hidePreview();
    this.toast(t('ui.toast.pickSplit'));
  }

  async doSplit(tile) {
    const s = this.state, u = this.sel;
    this.busy = true; this.view.setOverlay({});
    const ev = splitUnit(s, u, tile.x, tile.y);
    this.splitting = false;
    if (ev) { await this.view.playEvents(ev); this.toast(t('ui.toast.splitDone')); }
    this.afterAction();
  }

  async doFortify() {
    const u = this.sel;
    if (!u || this.busy || !canFortify(this.state, u)) return;
    this.busy = true; this.hidePreview(); this.view.setOverlay({});
    const ev = fortifyUnit(this.state, u);
    if (ev) await this.view.playEvents(ev);
    this.afterAction();
  }

  async doWait() {
    const u = this.sel;
    if (!u || this.busy) return;
    this.busy = true; this.view.setOverlay({});
    await this.view.playEvents(waitUnit(this.state, u));
    this.afterAction();
  }

  doUndo() {
    this.snd('ui_cancel');
    const u = this.sel, o = this.origin;
    if (!u || !o || o.id !== u.id || u.acted || this.busy || this.state.winner) return;
    u.x = o.x; u.y = o.y; u.moved = false; u.movedDist = 0; u.fort = o.fort || 0;   // trả lại cả trại đã dựng
    this.view.reconcile();
    this.select(u);
  }

  afterAction() {
    this.busy = false;
    this.sel = null; this.pending = null; this.attackOpts = null; this.reach = null; this.origin = null; this.splitting = false;
    this.mode = 'idle';
    if (this.state.winner) { this.refreshAll(); return this.gameOver(); }
    this.refreshAll();
  }

  // ---------- Panel / preview ----------
  refreshAll() {
    this.renderTop();
    this.renderEndTurn();
    this.refreshOverlay();
    this.refreshActions();
    this.refreshPanel();
  }

  renderTop() {
    const s = this.state;
    const f = s.current;
    $('turninfo').innerHTML = `<span class="chip" style="background:${FACTIONS[f].fill}"></span>${esc(t('ui.turn', { n: s.turn }))} · ${esc(t('faction.' + f))}`;
    const mi = $('missioninfo'), m = s.mission;
    mi.textContent = m.type === 'skirmish' ? '' : t('mission.info.' + m.type, { n: Math.min(s.turn, m.turns), total: m.turns });
    const wave = (m.waves || []).find((w) => !w.done);
    if (wave) mi.textContent += ' · ' + t('mission.wave', { n: wave.at });
    const ci = $('captureinfo');
    ci.classList.remove('danger');
    if (s.capture.human > 0) ci.textContent = t('ui.capture.progress', { n: s.capture.human, total: CONFIG.captureTurns });
    else if (s.capture.orc > 0) { ci.textContent = t('ui.capture.danger', { n: s.capture.orc, total: CONFIG.captureTurns }); ci.classList.add('danger'); }
    else ci.textContent = '';
  }

  renderEndTurn() {
    const b = $('endturn'), s = this.state;
    const mine = this.players[s.current].type === 'player' && !s.winner;
    b.disabled = !mine || this.busy;
    const idle = mine ? this.idleUnits().length : 0;
    b.classList.toggle('confirm', this.confirmEnd);
    b.classList.toggle('pulse', mine && !this.busy && idle === 0 && !this.sel);
    b.textContent = this.confirmEnd && idle ? t('ui.endTurnIdle', { n: idle }) : t('ui.endTurn');
  }

  refreshActions() {
    const el = $('actions');
    const u = this.sel, s = this.state;
    if (!u || this.mode === 'view' || this.busy) { el.innerHTML = ''; return; }
    // ic: tên icon (nút chỉ có icon thì cần aria để đọc được bằng trình đọc màn hình)
    const btn = (act, label, cls = '', ic = '', aria = '') => `<button data-act="${act}" class="${cls}"${aria ? ` aria-label="${esc(aria)}" title="${esc(aria)}"` : ''}>${ic ? icon(ic) : ''}${label ? esc(label) : ''}</button>`;
    let h = '';
    if (this.splitting) h = btn('cancel', '', 'x', 'x', t('ui.cancel'));
    else {
      h += btn('wait', t('ui.wait'), this.mode === 'moved' ? 'primary' : '');
      if (canFortify(s, u)) h += btn('fortify', t('ui.fortify'), '', 'tent');
      if (canSplit(s, u)) h += btn('split', t('ui.split'));
      if (this.mode === 'moved' && this.origin && this.origin.id === u.id) h += btn('undo', t('ui.undo'), '', 'undo');
      h += btn('cancel', '', 'x', 'x', t('ui.cancel'));
    }
    el.innerHTML = h;
  }

  // Panel thông tin: ưu tiên ô đang inspect/hover; nếu trên ô có quân thì hiện thẻ quân, ô trống thì hiện địa hình
  refreshPanel() {
    const s = this.state, el = $('panel');
    const at = this.inspectTile || this.hoverTile;
    const atUnit = at && unitAt(s, at.x, at.y);
    let html;
    if (atUnit) html = this.unitCard(atUnit);
    else if (at) html = this.terrainCard(at);
    else if (this.sel && s.units.some((x) => x.id === this.sel.id)) html = this.unitCard(this.sel);
    else html = `<div class="hint">${esc(t(this.sel ? 'ui.hint.selected' : 'ui.hint.empty'))}</div>`;
    el.innerHTML = html;
  }

  costText(c) { return isFinite(c) ? String(c) : '–'; }
  sg(n) { return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'; }

  // Hiệu ứng địa hình: mỗi dòng một icon + chữ ngắn, đọc lướt được. Trả về [[tên icon, chữ], ...]
  terrainLines(tid) {
    const f = terrainFacts(tid);
    const L = [];
    if (!f.passable) { L.push(['ban', t('fx.blocked')]); return L; }
    const cav = f.cost.cavHuman === f.cost.cavOrc ? this.costText(f.cost.cavHuman) : `${this.costText(f.cost.cavHuman)}/${this.costText(f.cost.cavOrc)}`;
    L.push(['foot', t('fx.cost', { h: this.costText(f.cost.human), o: this.costText(f.cost.orc), c: cav })]);
    if (f.def.human || f.def.orc) L.push(['shield', t('fx.def', { h: this.sg(f.def.human) + '%', o: this.sg(f.def.orc) + '%' })]);
    if (f.atk) L.push(['sword', t('fx.atk', { n: this.sg(f.atk) + '%' })]);
    if (f.rangeBonus) L.push(['bow', t('fx.range', { n: f.rangeBonus })]);
    if (f.heal) L.push(['plus', t('fx.heal', { n: f.heal })]);
    if (f.noCavalry) L.push(['ban', t('fx.nocav')]);
    return L;
  }

  terrainCard(tile) {
    const s = this.state;
    const tid = terrainId(s, tile.x, tile.y);
    const L = this.terrainLines(tid).map(([ic, tx]) => `<li>${icon(ic)}<span>${esc(tx)}</span></li>`).join('');
    const nk = 'terrain.note.' + tid, note = t(nk);
    let you = '';
    const u = this.sel;
    if (u && u.faction === s.current && s.units.some((x) => x.id === u.id) && isFinite(moveCostFor(tid, u.faction, u.role))) {
      const def = Math.round(defensePct(s, u, tile.x, tile.y));
      const cost = moveCostFor(tid, u.faction, u.role);
      const fb = Math.round(fortifyBonus(s, u, tile.x, tile.y));
      you = `<div class="you"><div><b>${esc(t('fx.forYou', { unit: t(`unit.${u.faction}.${u.role}`) }))}</b> ${icon('shield')} ${def}% ${icon('foot')} ${this.costText(cost)}</div>`
        + `<div>${icon('tent')} ${esc(t('fx.fort', { n: fb }))}</div></div>`;
    }
    return `<h3>${esc(t('terrain.' + tid))}</h3><ul class="fx">${L}</ul>${you}${note === nk ? '' : `<div class="note">${esc(note)}</div>`}`;
  }

  unitCard(u) {
    const s = this.state, st = statsOf(u), f = FACTIONS[u.faction];
    const tid = terrainId(s, u.x, u.y);
    const def = Math.round(defensePct(s, u, u.x, u.y));
    const lvl = levelOf(u.xp || 0);
    const atk = (st.atk * (1 + lvl * LEVEL.atkPerLevel)).toFixed(1).replace(/\.0$/, '');
    const [mn, mx] = rangeAt(s, u, u.x, u.y);
    let status = t('ui.status.ready');
    if (u.status === 'routed') status = t('ui.status.routed');
    else if (u.faction === s.current && u.acted) status = t('ui.status.done');
    else if (u.faction === s.current && u.moved) status = t('ui.status.moved');
    const pips = Array.from({ length: CONFIG.maxStrength }, (_, i) => `<b class="${i < u.strength ? 'on ' + u.faction : ''}"></b>`).join('');
    if (u.static) {
      return `<h3><span class="chip" style="background:${f.fill}"></span>${esc(t(`unit.${u.faction}.${u.role}`))}</h3>
      <div class="pips" title="${esc(t('ui.strength'))}">${pips}</div>
      <div class="line"><span title="${esc(t('ui.strength'))}">${icon('heart')} <b>${u.strength}/${CONFIG.maxStrength}</b></span><span title="${esc(t('ui.defense'))}">${icon('shield')} <b>${def}%</b></span></div>
      <div class="desc">${esc(t('unit.desc.objective'))}</div>`;
    }
    const mor = Math.round(u.morale);
    const morCol = mor <= f.routAt ? '#d8402f' : mor <= f.routAt + 25 ? '#e6a800' : '#4aa86a';
    const nx = nextLevelXp(u);
    const xpTxt = nx ? `${u.xp}/${nx}` : t('ui.xpmax');
    const tdef = terrainFacts(tid).def[u.faction];
    const fort = u.fort === 2 ? `<div class="fortline">${icon('tent')}${esc(t('ui.fort.on', { n: Math.round(fortifyBonus(s, u)) }))}</div>` : '';
    const ic = (k) => icon({ strength: 'heart', morale: 'flag', xp: 'chevron', def: 'shield', atk: 'sword', move: 'foot', range: 'bow' }[k]);
    return `<h3><span class="chip" style="background:${f.fill}"></span>${esc(t(`unit.${u.faction}.${u.role}`))}${u.vip ? `<span class="tag vip">${esc(t('ui.vip'))}</span>` : ''}<span class="stars">${rankIcon(lvl, 'gold')}</span></h3>
      <div class="pips" title="${esc(t('ui.strength'))}">${pips}</div>
      <div class="line"><span title="${esc(t('ui.strength'))}">${ic('strength')} <b>${u.strength}/${CONFIG.maxStrength}</b></span><span title="${esc(t('ui.morale'))}">${ic('morale')} <b>${mor}</b></span><span title="${esc(t('ui.xp'))}">${ic('xp')} <b>${xpTxt}</b></span></div>
      <div class="bar" title="${esc(t('ui.morale'))}"><i style="width:${mor}%;background:${morCol}"></i></div>
      <div class="stats"><span title="${esc(t('ui.defense'))}">${ic('def')} <b>${def}%</b></span><span title="${esc(t('ui.atk'))}">${ic('atk')} <b>${atk}</b></span><span title="${esc(t('ui.move'))}">${ic('move')} <b>${st.move}</b></span><span title="${esc(t('ui.range'))}">${ic('range')} <b>${mn === mx ? mx : mn + '–' + mx}</b></span></div>
      <div class="terr">${esc(t('terrain.' + tid))}${tdef ? ` · ${ic('def')}${this.sg(tdef)}%` : ''}</div>
      ${fort}
      <span class="tag">${esc(status)}</span>
      <details><summary>${esc(lvl ? t('ui.rank.' + lvl) : t('ui.info'))}</summary><div class="desc">${esc(t('unit.desc.' + u.role))}</div></details>`;
  }

  showPreview(opt, withButtons) {
    const s = this.state, atk = this.sel, tgt = opt.target, pv = opt.pv;
    const el = $('preview');
    const d = pv.detail;
    const lines = [];
    lines.push(`<span class="good">${esc(t('ui.preview.deal', { n: pv.dmg }))}</span> (${tgt.strength} ${icon('arrow')} ${pv.defLeft})`);
    if (pv.kills) lines.push(`<span class="good">${esc(t('ui.preview.kill'))}</span>`);
    else if (pv.counter > 0) lines.push(`<span class="bad">${esc(t('ui.preview.take', { n: pv.counter }))}</span> (${atk.strength} ${icon('arrow')} ${pv.atkLeft})`);
    else lines.push(esc(t('ui.preview.noCounter')));
    if (pv.counterKills) lines.push(`<span class="bad">${esc(t('ui.preview.dies'))}</span>`);
    const notes = [];
    if (d.flank) notes.push(t('ui.preview.flank', { n: Math.round(d.flank * CONFIG.flankBonus * 100) }));
    if (d.charge > 1) notes.push(t('ui.preview.charge', { n: Math.round((d.charge - 1) * 100) }));
    notes.push(t('ui.preview.defense', { n: Math.round(d.defPct) }));
    if (opt.node.x !== atk.x || opt.node.y !== atk.y) notes.push(t('ui.preview.from'));
    el.innerHTML = `<h4>${esc(t(`unit.${atk.faction}.${atk.role}`))} ${icon('arrow')} ${esc(t(`unit.${tgt.faction}.${tgt.role}`))}</h4>`
      + lines.map((l) => `<div>${l}</div>`).join('')
      + `<div class="note">${notes.map(esc).join(' · ')}</div>`
      + (withButtons ? `<div class="btns"><button data-act="confirm" class="primary">${esc(t('ui.attack'))}</button><button data-act="cancel" class="x" aria-label="${esc(t('ui.cancel'))}" title="${esc(t('ui.cancel'))}">${icon('x')}</button></div>` : '');
    el.hidden = false;
  }

  hidePreview() { $('preview').hidden = true; }

  // ---------- Chrome (nút, menu, game over) ----------
  bindChrome() {
    $('actions').addEventListener('click', (e) => this.onAct(e));
    $('preview').addEventListener('click', (e) => this.onAct(e));
    $('endturn').addEventListener('click', () => this.onEndTurn());
    $('movebtn').addEventListener('click', () => this.confirmMove());
    $('btn-fit').addEventListener('click', () => this.view.fit());
    const soundBtn = $('btn-sound');
    const paint = () => { soundBtn.innerHTML = icon(this.settings.muted ? 'sound-off' : 'sound'); };
    soundBtn.addEventListener('click', () => { this.audio?.setMuted(!this.settings.muted); if (!this.audio) this.settings.muted = !this.settings.muted; this.save(); paint(); });
    paint();
    $('btn-menu').addEventListener('click', () => this.openMenu());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.cancel();
      if (e.key === 'Enter' && this.pending) this.confirmAttack();
      else if (e.key === 'Enter' && this.moveTarget) this.confirmMove();
    });
    // cầm dọc vẫn chơi được; chỉ nhắc một lần
    if (window.innerHeight > window.innerWidth) setTimeout(() => this.toast(t('ui.rotate')), 1500);
  }

  onAct(e) {
    const b = e.target.closest('button[data-act]');
    if (!b || this.busy) return;
    const a = b.dataset.act;
    if (a === 'wait') this.doWait();
    else if (a === 'split') this.startSplit();
    else if (a === 'fortify') this.doFortify();
    else if (a === 'undo') this.doUndo();
    else if (a === 'movehere') this.confirmMove();
    else if (a === 'cancel') this.cancel();
    else if (a === 'confirm') this.confirmAttack();
  }

  openMenu() {
    const m = $('modal');
    const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
    const onoff = (id, on) => `<select id="${id}"><option value="1" ${on ? 'selected' : ''}>${esc(t('ui.on'))}</option><option value="0" ${on ? '' : 'selected'}>${esc(t('ui.off'))}</option></select>`;
    const field = (id, label, control) => `<div class="field"><label for="${id}">${esc(label)}</label>${control}</div>`;
    m.innerHTML = `<div class="card">
      <div class="head"><h2>${esc(t('ui.title'))}</h2><button data-m="close" class="icon" aria-label="${esc(t('ui.close'))}" title="${esc(t('ui.close'))}">${icon('x')}</button></div>
      <div class="body"><div class="cols">
        <div>
          <h3>${esc(t('ui.group.game'))}</h3>
          ${field('m-diff', t('ui.difficulty'), `<select id="m-diff">${['easy', 'tactical'].map((d) => opt(d, t('diff.' + d), this.settings.difficulty)).join('')}</select>`)}
          ${field('m-mission', t('ui.mission'), `<select id="m-mission">${MISSION_TYPES.map((k) => opt(k, t('mission.' + k), this.settings.mission || 'skirmish')).join('')}</select>`)}
          ${field('m-size', t('ui.mapSize'), `<select id="m-size">${Object.entries(MAP_SIZES).map(([k, v]) => opt(k, `${t('ui.size.' + k)} (${v.w}×${v.h})`, this.settings.mapSize || 'small')).join('')}</select>`)}
          ${field('m-seed', t('ui.seed'), `<input id="m-seed" type="number" min="0" value="${this.seed}">`)}
        </div>
        <div>
          <h3>${esc(t('ui.group.audio'))}</h3>
          ${field('m-music', t('ui.musicVol'), `<input id="m-music" type="range" min="0" max="100" value="${Math.round((this.settings.musicVol ?? 0.35) * 100)}">`)}
          ${field('m-sfx', t('ui.sfxVol'), `<input id="m-sfx" type="range" min="0" max="100" value="${Math.round((this.settings.sfxVol ?? 0.8) * 100)}">`)}
          <h3>${esc(t('ui.group.display'))}</h3>
          ${field('m-speed', t('ui.speed'), `<select id="m-speed">${Object.keys(SPEEDS).map((d) => opt(d, t('ui.speed.' + d), this.settings.speed)).join('')}</select>`)}
          ${field('m-clouds', t('ui.clouds'), onoff('m-clouds', this.settings.clouds !== false))}
          ${field('m-idle', t('ui.idle'), onoff('m-idle', this.settings.idle === true))}
          ${field('m-lang', t('ui.language'), `<select id="m-lang">${LANGS.map((c) => opt(c, langName(c), getLang())).join('')}</select>`)}
        </div>
      </div></div>
      <div class="btns">
        <button data-m="new" class="primary">${esc(t('ui.newMap'))}</button>
        <button data-m="restart">${esc(t('ui.restart'))}</button>
      </div></div>`;
    m.hidden = false;
    const apply = async () => {
      this.settings.difficulty = $('m-diff').value;
      this.settings.speed = $('m-speed').value;
      this.settings.musicVol = +$('m-music').value / 100;
      this.settings.sfxVol = +$('m-sfx').value / 100;
      this.audio?.applyVolumes();
      this.settings.idle = $('m-idle').value === '1';
      this.settings.mapSize = $('m-size').value;
      this.settings.mission = $('m-mission').value;
      this.view.setIdle(this.settings.idle);
      this.settings.clouds = $('m-clouds').value === '1';
      this.view.setClouds(this.settings.clouds);
      const lang = $('m-lang').value;
      if (lang !== getLang()) await setLang(lang);
      this.settings.lang = lang;
      this.view.speed = this.speed;
      this.save();
    };
    m.onclick = async (e) => {
      const b = e.target.closest('button[data-m]');
      if (e.target === m) { await apply(); m.hidden = true; this.refreshAll(); return; }
      if (!b) return;
      await apply();
      const act = b.dataset.m;
      m.hidden = true;
      if (act === 'new') this.newGame(Math.floor(Math.random() * 1e6));
      else if (act === 'restart') this.newGame(+$('m-seed').value || this.seed);
      else this.refreshAll();
    };
  }

  gameOver() {
    const s = this.state, m = $('modal');
    const won = s.winner === 'human';
    this.snd(won ? 'victory' : 'defeat');
    m.innerHTML = `<div class="card">
      <h2 class="${won ? 'win' : 'lose'}">${esc(t(won ? 'ui.win.title' : 'ui.lose.title'))}</h2>
      <p>${esc(t(`ui.${won ? 'win' : 'lose'}.${s.winReason}`))}</p>
      <p>${esc(t('ui.stats.turns', { n: s.turn }))} · ${esc(t('ui.seed'))}: ${this.seed}</p>
      <div class="btns">
        <button data-m="restart" class="primary">${esc(t('ui.restart'))}</button>
        <button data-m="new">${esc(t('ui.newMap'))}</button>
      </div></div>`;
    m.hidden = false;
    m.onclick = (e) => {
      const b = e.target.closest('button[data-m]');
      if (!b) return;
      m.hidden = true;
      this.newGame(b.dataset.m === 'new' ? Math.floor(Math.random() * 1e6) : this.seed);
    };
  }
}
