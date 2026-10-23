/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
function validateBounds(bounds, name) {
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 6 ||
    !bounds.every(Number.isFinite) ||
    bounds[0] > bounds[3] ||
    bounds[1] > bounds[4] ||
    bounds[2] > bounds[5]
  ) {
    throw new TypeError(`${name} must be a finite ordered AABB`);
  }
}

function validateProjectionView(view) {
  if (
    !Array.isArray(view.sceneToClipMatrix) ||
    view.sceneToClipMatrix.length !== 16 ||
    !view.sceneToClipMatrix.every(Number.isFinite) ||
    !Number.isSafeInteger(view.drawingBufferWidth) ||
    view.drawingBufferWidth <= 0 ||
    !Number.isSafeInteger(view.drawingBufferHeight) ||
    view.drawingBufferHeight <= 0 ||
    !["perspective", "orthographic"].includes(view.projectionKind) ||
    !matrixIsInvertible(view.sceneToClipMatrix)
  ) {
    throw new TypeError("Frozen view projection inputs are invalid");
  }
}

function matrixIsInvertible(matrix) {
  const rows = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, column) => matrix[column * 4 + row]),
  );
  let determinantScale = 1;
  for (let pivot = 0; pivot < 4; pivot++) {
    let pivotRow = pivot;
    for (let row = pivot + 1; row < 4; row++) {
      if (Math.abs(rows[row][pivot]) > Math.abs(rows[pivotRow][pivot])) {
        pivotRow = row;
      }
    }
    const pivotValue = rows[pivotRow][pivot];
    if (!Number.isFinite(pivotValue) || Math.abs(pivotValue) <= 1.0e-15) {
      return false;
    }
    if (pivotRow !== pivot) {
      [rows[pivot], rows[pivotRow]] = [rows[pivotRow], rows[pivot]];
    }
    determinantScale *= Math.abs(pivotValue);
    for (let row = pivot + 1; row < 4; row++) {
      const factor = rows[row][pivot] / rows[pivot][pivot];
      for (let column = pivot + 1; column < 4; column++) {
        rows[row][column] -= factor * rows[pivot][column];
      }
    }
  }
  return Number.isFinite(determinantScale) && determinantScale > 1.0e-30;
}

export function validateFrozenView(view) {
  if (
    view === null ||
    typeof view !== "object" ||
    Array.isArray(view) ||
    Object.keys(view).some(
      (key) =>
        ![
          "viewIdentity",
          "cameraPositionScene",
          "frustumPlanesScene",
          "sceneToClipMatrix",
          "drawingBufferWidth",
          "drawingBufferHeight",
          "projectionKind",
        ].includes(key),
    ) ||
    typeof view.viewIdentity !== "string" ||
    view.viewIdentity.length === 0 ||
    !Array.isArray(view.cameraPositionScene) ||
    view.cameraPositionScene.length !== 3 ||
    !view.cameraPositionScene.every(Number.isFinite) ||
    !Array.isArray(view.frustumPlanesScene) ||
    view.frustumPlanesScene.length !== 6 ||
    view.frustumPlanesScene.some(
      (plane) =>
        !Array.isArray(plane) ||
        plane.length !== 4 ||
        !plane.every(Number.isFinite) ||
        (plane[0] === 0 && plane[1] === 0 && plane[2] === 0),
    )
  ) {
    throw new TypeError("Frozen view is invalid");
  }
  const hasProjection = Object.prototype.hasOwnProperty.call(
    view,
    "sceneToClipMatrix",
  );
  const projectionFieldCount = [
    "sceneToClipMatrix",
    "drawingBufferWidth",
    "drawingBufferHeight",
    "projectionKind",
  ].reduce(
    (count, key) =>
      count + (Object.prototype.hasOwnProperty.call(view, key) ? 1 : 0),
    0,
  );
  if (projectionFieldCount !== 0 && projectionFieldCount !== 4) {
    throw new TypeError("Frozen view projection inputs must be complete");
  }
  if (hasProjection) {
    validateProjectionView(view);
  }
  return view;
}

export function aabbIntersectsFrustum(bounds, planes) {
  validateBounds(bounds, "strictBounds");
  for (const plane of planes) {
    const x = plane[0] >= 0 ? bounds[3] : bounds[0];
    const y = plane[1] >= 0 ? bounds[4] : bounds[1];
    const z = plane[2] >= 0 ? bounds[5] : bounds[2];
    if (plane[0] * x + plane[1] * y + plane[2] * z + plane[3] < 0) {
      return false;
    }
  }
  return true;
}

export function distanceToAabb(point, bounds) {
  validateBounds(bounds, "selectionBounds");
  let squared = 0;
  for (let axis = 0; axis < 3; axis++) {
    const delta =
      point[axis] < bounds[axis]
        ? bounds[axis] - point[axis]
        : point[axis] > bounds[axis + 3]
          ? point[axis] - bounds[axis + 3]
          : 0;
    squared += delta * delta;
  }
  return Math.sqrt(squared);
}

function pointInsideAabb(point, bounds) {
  return (
    point[0] >= bounds[0] &&
    point[0] <= bounds[3] &&
    point[1] >= bounds[1] &&
    point[1] <= bounds[4] &&
    point[2] >= bounds[2] &&
    point[2] <= bounds[5]
  );
}

function transformCorner(matrix, x, y, z) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
  ];
}

export function projectAabbMaximumExtentPixels(bounds, view) {
  validateBounds(bounds, "selectionBounds");
  validateProjectionView(view);
  if (pointInsideAabb(view.cameraPositionScene, bounds)) {
    return Object.freeze({
      projectedExtentPixels: Math.max(
        view.drawingBufferWidth,
        view.drawingBufferHeight,
      ),
      projectionStatus: "near-plane-conservative",
    });
  }
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let corner = 0; corner < 8; corner++) {
    const clip = transformCorner(
      view.sceneToClipMatrix,
      bounds[(corner & 1) === 0 ? 0 : 3],
      bounds[(corner & 2) === 0 ? 1 : 4],
      bounds[(corner & 4) === 0 ? 2 : 5],
    );
    const scale = Math.max(
      1,
      Math.abs(clip[0]),
      Math.abs(clip[1]),
      Math.abs(clip[2]),
    );
    const unsafeW = !Number.isFinite(clip[3]) || clip[3] <= 1.0e-12 * scale;
    const nearDistance = clip[2] + clip[3];
    if (
      unsafeW ||
      !Number.isFinite(nearDistance) ||
      nearDistance <= 1.0e-12 * scale
    ) {
      return Object.freeze({
        projectedExtentPixels: Math.max(
          view.drawingBufferWidth,
          view.drawingBufferHeight,
        ),
        projectionStatus: "near-plane-conservative",
      });
    }
    const ndcX = clip[0] / clip[3];
    const ndcY = clip[1] / clip[3];
    if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) {
      return Object.freeze({
        projectedExtentPixels: Math.max(
          view.drawingBufferWidth,
          view.drawingBufferHeight,
        ),
        projectionStatus: "near-plane-conservative",
      });
    }
    minimumX = Math.min(minimumX, ndcX);
    minimumY = Math.min(minimumY, ndcY);
    maximumX = Math.max(maximumX, ndcX);
    maximumY = Math.max(maximumY, ndcY);
  }
  const clippedMinimumX = Math.max(-1, minimumX);
  const clippedMaximumX = Math.min(1, maximumX);
  const clippedMinimumY = Math.max(-1, minimumY);
  const clippedMaximumY = Math.min(1, maximumY);
  if (
    clippedMinimumX >= clippedMaximumX ||
    clippedMinimumY >= clippedMaximumY
  ) {
    return Object.freeze({
      projectedExtentPixels: 0,
      projectionStatus: "outside-viewport",
    });
  }
  const widthPixels =
    ((clippedMaximumX - clippedMinimumX) * view.drawingBufferWidth) / 2;
  const heightPixels =
    ((clippedMaximumY - clippedMinimumY) * view.drawingBufferHeight) / 2;
  const projectedExtentPixels = Math.max(widthPixels, heightPixels);
  if (!Number.isFinite(projectedExtentPixels) || projectedExtentPixels < 0) {
    throw new TypeError("Projected AABB extent is invalid");
  }
  return Object.freeze({
    projectedExtentPixels,
    projectionStatus: "finite-corners",
  });
}

/** @private */
const _SceneGISGaussianViewMath = {
  validateFrozenView,
  aabbIntersectsFrustum,
  distanceToAabb,
  projectAabbMaximumExtentPixels,
};
export default _SceneGISGaussianViewMath;
