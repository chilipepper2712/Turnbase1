import { initI18n, setLang, t } from './i18n.js';
import { Assets } from './render/assets.js';
import { GameView } from './render/view.js';
import { Game } from './game.js';
import { createState } from './rules.js';
import { AudioManager } from './audio.js';
import { generateMap } from './mapgen.js';

const KEY = 'turnbase1.settings';
function loadSettings() {
  const base = { difficulty: 'tactical', speed: 'normal', lang: 'vi' };
  try { return { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return base; }
}

async function main() {
  const q = new URLSearchParams(location.search);
  const settings = loadSettings();
  if (q.get('ai')) settings.difficulty = q.get('ai');
  if (q.get('speed')) settings.speed = q.get('speed');
  if (q.get('size')) settings.mapSize = q.get('size');
  if (q.get('clouds')) settings.clouds = q.get('clouds') !== '0';
  if (q.get('idle')) settings.idle = q.get('idle') !== '0';
  if (q.get('lang')) settings.lang = q.get('lang');
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* bỏ qua */ } };

  await initI18n(settings.lang);
  document.title = t('ui.title');

  const assets = new Assets();
  await assets.init();
  const seed = q.get('seed') ? +q.get('seed') : Math.floor(Math.random() * 1e6);
  const view = new GameView(document.getElementById('stage'), assets, t);
  await view.init(createState(generateMap(seed)));
  document.getElementById('loading').classList.add('done');

  document.getElementById('movebtn').textContent = '✓ ' + t('ui.moveHere');
  const game = new Game(view, settings, save);
  const audio = new AudioManager(settings);
  game.audio = audio;
  view.snd = (n, o) => audio.play(n, o);
  window.__game = game; window.__audio = audio;       // tiện debug / test tự động
  game.newGame(seed, true);                           // bản đồ hiện ra phía sau màn mở đầu, lượt chưa bắt đầu

  // Màn mở đầu: cú bấm này vừa mở khoá âm thanh (trình duyệt yêu cầu) vừa bắt đầu ván
  const splash = document.getElementById('splash');
  document.getElementById('splash-title').textContent = t('ui.title');
  document.getElementById('splash-sub').textContent = t('ui.splash.sub');
  document.getElementById('splash-note').textContent = t('ui.splash.note');
  const startBtn = document.getElementById('splash-start');
  startBtn.textContent = '▶ ' + t('ui.start');
  splash.hidden = false;
  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    splash.classList.add('leaving');
    await audio.unlock();
    audio.startPlaylist();
    audio.play('ui_confirm');
    setTimeout(() => { splash.hidden = true; document.getElementById('hud').hidden = false; game.beginTurn(); }, 350);
  });
  if (q.get('autostart')) startBtn.click();
  if (assets.report.fallback.length) console.info('[assets] đang dùng fallback code cho:', assets.report.fallback.join(', '));
}

main().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  l.classList.remove('done');
  l.textContent = 'Lỗi: ' + e.message;
});
