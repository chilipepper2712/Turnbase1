import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TERRAIN_DECO } from '../src/render/assets.js';
import { PIXEL_GROUND } from '../src/render/pixelground.js';
import { TERRAIN } from '../src/config.js';

test('đủ sprite pixel địa hình cho mọi nhóm', () => {
  for (const [g, n] of Object.entries(TERRAIN_DECO)) {
    for (let i = 0; i < n; i++) assert.ok(fs.existsSync(`assets/terrain/${g}_${i}.png`), `${g}_${i}.png`);
  }
});

test('mọi địa hình đều có màu nền pixel', () => {
  for (const t of Object.keys(TERRAIN)) assert.ok(PIXEL_GROUND[t], t);
});
