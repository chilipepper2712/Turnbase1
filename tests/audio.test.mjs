import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveSfx, FALLBACK } from '../src/audio.js';
import { buildIndex } from '../tools/build_audio_index.mjs';

test('resolveSfx: biến thể _N, thay thế theo chuỗi, không có gì thì rỗng', () => {
  assert.deepEqual(resolveSfx('ui_select', { ui_select: 'x' }), ['ui_select']);
  assert.deepEqual(resolveSfx('attack_melee', { attack_melee_1: 'a', attack_melee_2: 'b', attack_melee_3: 'c', attack_spear_1: 'd' }), ['attack_melee_1', 'attack_melee_2', 'attack_melee_3']);
  assert.deepEqual(resolveSfx('attack_charge', { attack_melee_1: 'a', attack_melee_2: 'b' }), ['attack_melee_1', 'attack_melee_2']);   // thay thế dùng cả biến thể
  assert.deepEqual(resolveSfx('step_horse', { step_foot_1: 'x' }), ['step_foot_1']);
  assert.deepEqual(resolveSfx('step_horse', { step_horse: 'a', step_foot_1: 'b' }), ['step_horse']);
  assert.deepEqual(resolveSfx('victory', { step_foot_1: 'x' }), []);
  assert.deepEqual(resolveSfx('attack', { attack_melee_1: 'x' }), [], 'không khớp nhầm tiền tố');
  assert.deepEqual(resolveSfx('whatever', {}), []);
});

test('FALLBACK: không có vòng lặp và mỗi tên thay thế phải là một SFX thật trong checklist', () => {
  const doc = fs.readFileSync(new URL('../docs/AUDIO.md', import.meta.url), 'utf8');
  const names = [...doc.matchAll(/^\| `([a-z_]+)` \|/gm)].map((m) => m[1]);
  assert.ok(names.length >= 25, 'checklist phải liệt kê đủ 25 SFX, thấy ' + names.length);
  for (const [k, alts] of Object.entries(FALLBACK)) {
    assert.ok(names.includes(k), k + ' phải có trong checklist');
    for (const a of alts) { assert.ok(names.includes(a), a + ' (thay thế cho ' + k + ') phải có trong checklist'); assert.notEqual(a, k); assert.ok(!(FALLBACK[a] || []).includes(k), 'vòng lặp ' + k + '<->' + a); }
  }
});

test('buildIndex: quét sfx và nhạc, ưu tiên mp3 hơn wav cùng tên, bỏ file lạ', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'aud-'));
  fs.mkdirSync(path.join(d, 'sfx')); fs.mkdirSync(path.join(d, 'music'));
  for (const f of ['sfx/a.wav', 'sfx/a.mp3', 'sfx/b.ogg', 'sfx/readme.txt', 'music/battle_1.mp3']) fs.writeFileSync(path.join(d, f), 'x');
  const idx = buildIndex(d);
  assert.deepEqual(idx.sfx, { a: 'sfx/a.mp3', b: 'sfx/b.ogg' });
  assert.deepEqual(idx.music, { battle_1: 'music/battle_1.mp3' });
});
