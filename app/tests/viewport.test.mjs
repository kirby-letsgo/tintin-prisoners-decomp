import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameViewport } from '../src/lib/viewport.ts';

test('whole pixels fit and center standard and 2× frames at phone and desktop sizes', () => {
  for (const [w, h] of [[1170, 2532], [2532, 1170], [1280, 1280], [803, 601]]) {
    for (const [sw, sh] of [[160, 144], [320, 288]]) {
      const v = frameViewport(w, h, sw, sh, 'integer');
      assert.equal(v.width % sw, 0);
      assert.equal(v.height % sh, 0);
      assert.equal(v.width / sw, v.height / sh);
      assert.ok(v.x >= 0 && v.y >= 0 && v.x + v.width <= w && v.y + v.height <= h);
      assert.ok(Math.abs(w - v.width - 2 * v.x) <= 1);
      assert.ok(Math.abs(h - v.height - 2 * v.y) <= 1);
    }
  }
});
test('fit fills one dimension without stretching or cropping', () => {
  const v = frameViewport(803, 601, 160, 144, 'fit');
  assert.equal(v.height, 601);
  assert.ok(Math.abs(v.width - v.height * 10 / 9) < 1);
  assert.ok(v.width <= 803);
});
test('tiny windows shrink the entire frame instead of cropping', () => {
  assert.deepEqual(frameViewport(80, 90, 320, 288, 'integer'),
    { x: 0, y: 9, width: 80, height: 72 });
});
