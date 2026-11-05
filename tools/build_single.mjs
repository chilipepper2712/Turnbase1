// Đóng gói game thành MỘT file HTML (JS gộp, CSS, chuỗi ngôn ngữ, sprite data: URI, PixiJS đều nhúng sẵn).
// Dùng khi host không phục vụ tốt file phụ (vd. khung Artifact trên iOS) hoặc muốn gửi cả game như một file.
//   npm i && node tools/build_single.mjs  ->  dist/standalone.html (trang đầy đủ)  và  dist/artifact.html (không có khung html/head/body)
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { buildIndex } from './build_audio_index.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');

const res = await build({
  entryPoints: [path.join(root, 'src/main.js')], bundle: true, write: false, minify: true,
  format: 'iife', target: 'es2019',
});
const app = res.outputFiles[0].text;

const langs = {};
for (const f of fs.readdirSync(path.join(root, 'lang'))) if (f.endsWith('.json')) langs[f.slice(0, -5)] = JSON.parse(rd('lang/' + f));

const assets = {};
for (const dir of ['units', 'buildings', 'clouds']) {
  for (const f of fs.readdirSync(path.join(root, 'assets', dir))) {
    if (!f.endsWith('.png')) continue;
    assets[`assets/${dir}/${f}`] = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets', dir, f)).toString('base64');
  }
}

// Âm thanh: nhúng dạng data URI (host Artifact trên iOS không tải được file phụ)
const audioIndex = buildIndex();
const audioData = {};
let audioBytes = 0;
for (const kind of ['sfx', 'music']) {
  for (const rel of Object.values(audioIndex[kind])) {
    const buf = fs.readFileSync(path.join(root, 'assets', 'audio', rel));
    audioBytes += buf.length;
    audioData[rel] = 'data:audio/' + (rel.endsWith('.mp3') ? 'mpeg' : rel.endsWith('.wav') ? 'wav' : rel.endsWith('.ogg') ? 'ogg' : 'mp4') + ';base64,' + buf.toString('base64');
  }
}
if (audioBytes > 7 * 1024 * 1024) console.warn(`CẢNH BÁO: âm thanh ${(audioBytes / 1048576).toFixed(1)}MB (sau nhúng base64 ~${(audioBytes * 1.34 / 1048576).toFixed(1)}MB); giới hạn một trang Artifact là 16MB.`);

const idx = rd('index.html');
const body = idx.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/\s*<script src="vendor\/pixi\.min\.js"><\/script>/, '')
  .replace(/\s*<script type="module" src="src\/main\.js"><\/script>/, '');
const css = rd('style.css');
const pixi = rd('vendor/pixi.min.js');

const scripts = `
<script>window.__LANG_DATA__=${safe(JSON.stringify(langs))};window.__ASSET_DATA__=${safe(JSON.stringify(assets))};window.__AUDIO_INDEX__=${safe(JSON.stringify(audioIndex))};window.__AUDIO_DATA__=${safe(JSON.stringify(audioData))};</script>
<script>${safe(pixi)}</script>
<script>${safe(app)}</script>`;

const head = `<title>Chiến Địa Doodle</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap" rel="stylesheet">
<style>${css}</style>`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), `${head}\n${body}${scripts}\n`);
fs.writeFileSync(path.join(root, 'dist/standalone.html'),
  `<!doctype html>\n<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n${head}</head><body>${body}${scripts}</body></html>\n`);
for (const f of ['artifact', 'standalone']) console.log(f, (fs.statSync(path.join(root, `dist/${f}.html`)).size / 1024).toFixed(0) + ' KB');
