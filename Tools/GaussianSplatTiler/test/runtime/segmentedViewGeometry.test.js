import assert from "node:assert/strict";
import nodeTest from "node:test";

import { createSegmentedViewGeometry } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedViewGeometry.js";

const test = globalThis.it ?? nodeTest;

function projectedView(orthographic = false, angle = 0) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const scale = orthographic ? 0.5 : 1;
  const matrix = [
    scale * c,
    scale * s,
    0,
    0,
    -scale * s,
    scale * c,
    0,
    0,
    0,
    0,
    orthographic ? -2 / 9 : -11 / 9,
    orthographic ? 0 : -1,
    0,
    0,
    orthographic ? -11 / 9 : -20 / 9,
    orthographic ? 1 : 0,
  ];
  const planes = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      planes.push(
        [0, 1, 2, 3].map(
          (column) => matrix[column * 4 + 3] + sign * matrix[column * 4 + axis],
        ),
      );
    }
  }
  return {
    sceneToClipMatrix: matrix,
    frustumPlanesScene: planes,
    projectionKind: orthographic ? "orthographic" : "perspective",
  };
}

function close(actual, expected, message = "") {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${message}: ${actual} != ${expected}`,
  );
}

test("measures the clipped footprint and visible depth of a perspective box", () => {
  const geometry = createSegmentedViewGeometry(projectedView());
  const result = new Float64Array(2);
  assert.equal(geometry.measure([-1, -1, -4, 1, 1, -2], result), result);
  close(result[0], 0.25);
  close(result[1], 3);
});

test("caps near-plane intersections when the camera is inside the box", () => {
  const geometry = createSegmentedViewGeometry(projectedView());
  const result = geometry.measure(
    [-0.5, -0.5, -2, 0.5, 0.5, 0.5],
    new Float64Array(2),
  );
  close(result[0], 0.25);
  close(result[1], 1.5);
});

test("retains the complete frustum when all original box faces are clipped away", () => {
  const result = createSegmentedViewGeometry(projectedView()).measure(
    [-100, -100, -100, 100, 100, 100],
    new Float64Array(2),
  );
  close(result[0], 1);
  close(result[1], 5.5);
});

test("keeps visible flat and thin geometry while empty or edge-on boxes have zero area", () => {
  const geometry = createSegmentedViewGeometry(projectedView());
  const result = new Float64Array(2);
  geometry.measure([-1, -1, -2, 1, 1, -2], result);
  close(result[0], 0.25);
  close(result[1], 2);
  geometry.measure([-1, -1e-12, -4, 1, 1e-12, -2], result);
  assert.ok(result[0] > 0 && result[0] < 1e-10);
  for (const bounds of [
    [-1, 0, -4, 1, 0, -2],
    [20, -1, -5, 21, 1, -4],
    [-1, -1, 1, 1, 1, 2],
    [0, 0, -2, 0, 0, -2],
  ]) {
    assert.deepEqual([...geometry.measure(bounds, result)], [0, 1]);
  }
});

test("does not discard a visible box whose center is outside the screen", () => {
  const result = createSegmentedViewGeometry(projectedView()).measure(
    [1.5, -1, -3, 8, 1, -2],
    new Float64Array(2),
  );
  assert.ok(result[0] > 0 && result[0] < 1);
  assert.ok(result[1] >= 2 && result[1] <= 3);
});

test("screen rotation preserves an unclipped footprint and orthographic depth does not affect allocation scale", () => {
  const bounds = [-1, -1, -4, 1, 1, -2];
  const result = new Float64Array(2);
  createSegmentedViewGeometry(projectedView(false, Math.PI / 4)).measure(
    bounds,
    result,
  );
  close(result[0], 0.25);
  close(result[1], 3);
  const geometry = createSegmentedViewGeometry(projectedView(true));
  geometry.measure(bounds, result);
  close(result[0], 0.25);
  close(result[1], 1);
  geometry.measure([-1, -1, -8, 1, 1, -6], result);
  close(result[0], 0.25);
  close(result[1], 1);
  geometry.measure([-100, -100, -100, 100, 100, 100], result);
  close(result[0], 1);
  close(result[1], 1);
});

test("scratch reuse stays deterministic after empty, enclosing and uncertain numeric boxes", () => {
  const geometry = createSegmentedViewGeometry(projectedView());
  const result = new Float64Array(2);
  for (let iteration = 0; iteration < 3; iteration++) {
    geometry.measure([-1e308, -1e308, -1e308, 1e308, 1e308, 1e308], result);
    assert.equal(result[0], 1);
    assert.ok(Number.isFinite(result[1]) && result[1] > 0);
    geometry.measure([20, -1, -5, 21, 1, -4], result);
    assert.deepEqual([...result], [0, 1]);
    geometry.measure([-100, -100, -100, 100, 100, 100], result);
    close(result[0], 1);
    geometry.measure([-1, -1, -4, 1, 1, -2], result);
    close(result[0], 0.25);
    close(result[1], 3);
  }
  assert.throws(
    () => geometry.measure([0, 0, 0, -1, 1, 1], result),
    RangeError,
  );
});

// An independent, deliberately slower oracle enumerates intersections of three
// half-spaces. It is confined to small synthetic tests, not the runtime helper.
function intersectionOracle(bounds, view) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const planes = view.frustumPlanesScene.map((p) => {
    const norm = Math.hypot(...p.slice(0, 3));
    return p.map((v) => v / norm);
  });
  for (let axis = 0; axis < 3; axis++) {
    const lower = [0, 0, 0, -bounds[axis]];
    const upper = [0, 0, 0, bounds[axis + 3]];
    lower[axis] = 1;
    upper[axis] = -1;
    planes.push(lower, upper);
  }
  const points = [];
  const depths = [];
  const m = view.sceneToClipMatrix;
  for (let i = 0; i < planes.length; i++) {
    for (let j = 0; j < i; j++) {
      for (let k = 0; k < j; k++) {
        const a = planes[i];
        const b = planes[j];
        const c = planes[k];
        const bc = cross(b, c);
        const ca = cross(c, a);
        const ab = cross(a, b);
        const determinant = dot(a, bc);
        if (Math.abs(determinant) < 1e-12) {
          continue;
        }
        const point = [0, 1, 2].map(
          (axis) =>
            (-a[3] * bc[axis] - b[3] * ca[axis] - c[3] * ab[axis]) /
            determinant,
        );
        if (!planes.every((p) => dot(p, point) + p[3] >= -1e-8)) {
          continue;
        }
        const projected = [0, 1, 3].map(
          (row) =>
            m[row] * point[0] +
            m[4 + row] * point[1] +
            m[8 + row] * point[2] +
            m[12 + row],
        );
        if (projected[2] <= 0) {
          continue;
        }
        points.push([projected[0] / projected[2], projected[1] / projected[2]]);
        depths.push(projected[2]);
      }
    }
  }
  if (points.length < 3) {
    return [0, 1];
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (a, b, c) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const lower = [];
  const upper = [];
  for (const point of points) {
    while (lower.length > 1 && turn(lower.at(-2), lower.at(-1), point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  for (const point of points.toReversed()) {
    while (upper.length > 1 && turn(upper.at(-2), upper.at(-1), point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  const polygon = lower.slice(0, -1).concat(upper.slice(0, -1));
  const area =
    Math.abs(
      polygon.reduce((sum, point, i) => {
        const next = polygon[(i + 1) % polygon.length];
        return sum + point[0] * next[1] - point[1] * next[0];
      }, 0),
    ) / 8;
  return [
    Math.min(1, area),
    view.projectionKind === "orthographic"
      ? 1
      : (Math.min(...depths) + Math.max(...depths)) / 2,
  ];
}

test("bounded polygon clipping agrees with independent half-space intersections", () => {
  for (const view of [
    projectedView(),
    projectedView(false, 0.37),
    projectedView(true, 0.29),
  ]) {
    const geometry = createSegmentedViewGeometry(view);
    for (let sample = 0; sample < 36; sample++) {
      const x = (sample % 6) * 1.3 - 3.5;
      const y = Math.floor(sample / 6) * 1.1 - 3.1;
      const z = -0.5 - (sample % 4) * 2.1;
      const bounds = [x, y, z - 2.4, x + 2.2, y + 1.7, z + 0.5];
      const expected = intersectionOracle(bounds, view);
      const result = geometry.measure(bounds, new Float64Array(2));
      close(result[0], expected[0], `sample ${sample} area`);
      close(result[1], expected[1], `sample ${sample} depth`);
    }
  }
});
