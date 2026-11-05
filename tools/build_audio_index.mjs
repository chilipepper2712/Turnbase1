// Quét assets/audio/{sfx,music} và ghi assets/audio/index.json ({sfx:{tên:"sfx/tên.ext"}, music:{...}}).
// Chạy tay sau khi thả file: node tools/build_audio_index.mjs  (build_single tự chạy lại bước này).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const EXT = ['mp3', 'ogg', 'm4a', 'wav'];           // thứ tự ưu tiên nếu cùng tên có nhiều định dạng

export function buildIndex(dir = path.join(root, 'assets', 'audio')) {
  const out = { sfx: {}, music: {} };
  for (const kind of ['sfx', 'music']) {
    const d = path.join(dir, kind);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).sort()) {
      const m = f.match(/^(.+)\.(mp3|ogg|m4a|wav)$/i);
      if (!m) continue;
      const name = m[1], ext = m[2].toLowerCase();
      const cur = out[kind][name];
      if (!cur || EXT.indexOf(ext) < EXT.indexOf(cur.split('.').pop())) out[kind][name] = `${kind}/${f}`;
    }
  }
  return out;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const idx = buildIndex();
  fs.writeFileSync(path.join(root, 'assets', 'audio', 'index.json'), JSON.stringify(idx, null, 1));
  console.log(`index.json: ${Object.keys(idx.sfx).length} sfx, ${Object.keys(idx.music).length} nhạc`);
}
