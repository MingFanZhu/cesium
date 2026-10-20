import assert from "node:assert/strict";
import test from "node:test";
import {
  cosineBasis,
  phaseEigenvalues,
  gaussLegendre,
} from "./planar-scattering-harmonics.mjs";

test("normalizes the real cosine basis and keeps distinct angular modes orthogonal", () => {
  const modes = [0, 1, 2, 3, 5, 20, 80, 152];
  const products = modes.map(() => modes.map(() => 0));
  for (const { mu, weight } of gaussLegendre(32)) {
    for (let k = 0; k < 64; k++) {
      const basis = cosineBasis(16, mu, (2 * Math.PI * (k + 0.5)) / 64);
      for (let i = 0; i < modes.length; i++) {
        for (let j = 0; j < modes.length; j++) {
          products[i][j] +=
            (basis[modes[i]] * basis[modes[j]] * weight * 2 * Math.PI) / 64;
        }
      }
    }
  }
  for (let i = 0; i < modes.length; i++) {
    for (let j = 0; j < modes.length; j++) {
      assert.ok(Math.abs(products[i][j] - (i === j ? 1 : 0)) < 1e-12);
    }
  }
});

test("matches Rayleigh and Cornette-Shanks convolution moments to independent direct integration", () => {
  const sums = Array.from({ length: 17 }, () => [0, 0]);
  const count = 65536;
  for (let i = 0; i < count; i++) {
    const mu = -1 + (2 * (i + 0.5)) / count;
    const rayleigh = (3 / (16 * Math.PI)) * (1 + mu * mu);
    const mie =
      ((3 / (8 * Math.PI)) * 0.36 * (1 + mu * mu)) /
      (2.64 * (1.64 - 1.6 * mu) ** 1.5);
    let previous = 1;
    let current = mu;
    for (let l = 0; l <= 16; l++) {
      const legendre = l === 0 ? 1 : current;
      sums[l][0] += (rayleigh * legendre * 4 * Math.PI) / count;
      sums[l][1] += (mie * legendre * 4 * Math.PI) / count;
      if (l > 0) {
        const next = ((2 * l + 1) * mu * current - l * previous) / (l + 1);
        previous = current;
        current = next;
      }
    }
  }
  for (let l = 0; l <= 16; l++) {
    const actual = phaseEigenvalues(l);
    assert.ok(Math.abs(actual.rayleigh - sums[l][0]) < 1e-6);
    assert.ok(Math.abs(actual.mie - sums[l][1]) < 2e-6);
  }
  assert.equal(phaseEigenvalues(0).rayleigh, 1);
  assert.ok(Math.abs(phaseEigenvalues(0).mie - 1) < 1e-15);
});
