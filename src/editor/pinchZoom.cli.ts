// ponytail: the pinch-zoom math, exposed as a small command-line
// smoke check. Pinch-zoom can't be reliably e2e-tested (Playwright's
// multi-touch API is limited; CDP-based multi-touch is brittle).
// The `e2e/phase9.spec.ts` covers the rest of the feature surface;
// this file is the unit test for the math, runnable via:
//   npx tsx src/editor/pinchZoom.cli.ts
// and asserts the round-trip on fuzzed inputs. No test framework.

import { pinchZoom } from './pinchZoom';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// Round-trip: 2x in, 0.5x out → identity.
{
  const start = 1.0;
  const d0 = 100;
  const d1 = 200;
  const d2 = 100;
  const z1 = pinchZoom(start, d0, d1);
  const z2 = pinchZoom(z1, d1, d2);
  assert(Math.abs(z2 - start) < 1e-6, `2x then 0.5x should be identity, got ${z2}`);
}

// Clamps: 0.1x ratio is below the 0.25 floor.
{
  const z = pinchZoom(1.0, 100, 10);
  assert(z === 0.25, `0.1x ratio should clamp to 0.25, got ${z}`);
}

// Clamps: 10x ratio is above the 4 ceiling.
{
  const z = pinchZoom(1.0, 100, 1000);
  assert(z === 4, `10x ratio should clamp to 4, got ${z}`);
}

// Edge case: zero initial distance.
{
  const z = pinchZoom(1.0, 0, 100);
  assert(z === 1.0, `zero initial distance should return initial, got ${z}`);
}

// Fuzzed round-trip: keep both pinches strictly within
// [0.5x, 1.5x] of the initial distance so neither direction
// hits the clamp (z0 is also fuzzed but bounded so the
// pre-clamp product is well under the 4x ceiling). For each
// z0 and r1, we assert z0 * r1 * (1/r1) === z0.
let failures = 0;
for (let i = 0; i < 1000; i++) {
  const z0 = 0.5 + Math.random() * 2;   // [0.5, 2.5]
  const d0 = 50 + Math.random() * 200;
  // r1 in [0.7, 1.3] keeps the product z0 * r1 below 4 and
  // z0 / r1 above 0.25 in the worst case.
  const r1 = 0.7 + Math.random() * 0.6;
  const d1 = d0 * r1;
  const z1 = pinchZoom(z0, d0, d1);
  const z2 = pinchZoom(z1, d1, d0);
  if (Math.abs(z2 - z0) > 1e-6) {
    console.error(`fuzz fail [r1=${r1}]: z0=${z0}, z1=${z1}, z2=${z2}`);
    failures++;
  }
}
assert(failures === 0, `fuzzed round-trip had ${failures} failures`);

console.log('pinchZoom: PASS');
