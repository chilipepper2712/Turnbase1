import { initI18n, setLang, t } from './i18n.js';
import { Assets } from './render/assets.js';
import { GameView } from './render/view.js';
import { Game } from './game.js';
import { createState } from './rules.js';
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
  if (q.get('lang')) settings.lang = q.get('lang');
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* bỏ qua */ } };

  await initI18n(settings.lang);
  document.title = t('ui.title');

  const assets = new Assets();
  await assets.init();
  const seed = q.get('seed') ? +q.get('seed') : Math.floor(Math.random() * 1e6);
  const view = new GameView(document.getElementById('stage'), assets, t);
  await view.init(createState(generateMap(seed)));
  document.getElementById('hud').hidden = false;
  document.getElementById('loading').classList.add('done');

  const game = new Game(view, settings, save);
  window.__game = game; // tiện debug / test tự động
  game.newGame(seed);
  if (assets.report.fallback.length) console.info('[assets] đang dùng fallback code cho:', assets.report.fallback.join(', '));
}

main().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  l.classList.remove('done');
  l.textContent = 'Lỗi: ' + e.message;
});
