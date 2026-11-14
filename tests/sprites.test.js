import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_ROWS, LEG_ROWS, mulberry32, TYPE_COLORS, LOOKS } from '../web/js/sprites.js';

test('les modèles de personnages font 16 colonnes et 16 rangées', () => {
  for (const [dir, rows] of Object.entries(BODY_ROWS)) {
    assert.equal(rows.length, 13, dir);
    for (const r of rows) assert.equal(r.length, 16, `${dir}: "${r}"`);
  }
  for (const frames of Object.values(LEG_ROWS)) {
    for (const legs of frames) {
      assert.equal(legs.length, 3);
      for (const r of legs) assert.equal(r.length, 16, r);
    }
  }
});

test('le hasard des sprites est reproductible', () => {
  const a = mulberry32(42); const b = mulberry32(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  assert.equal(Object.keys(TYPE_COLORS).length, 10);
  assert.equal(LOOKS.length, 8);
});
