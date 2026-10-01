import assert from 'node:assert/strict';
import test from 'node:test';
import { sixValues } from './component-smoke.mjs';

test('Button smoke matrix sets all six variant dimensions and property values', () => {
  assert.equal(sixValues.length, 6);
  for (const value of sixValues) {
    assert.deepEqual(Object.keys(value.variantProperties).sort(), ['Icon', 'Size', 'State', 'Type']);
    assert.deepEqual(Object.keys(value.properties).sort(), ['Label', 'Show Icon']);
  }
  assert.equal(new Set(sixValues.map((value) => JSON.stringify(value.variantProperties))).size, 6);
});
