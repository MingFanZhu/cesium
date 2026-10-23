/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
const MAX_FACES = 16;
const MAX_FACE_VERTICES = 24;
const FACE_STRIDE = MAX_FACE_VERTICES * 3;
const MAX_POINTS = MAX_FACES * MAX_FACE_VERTICES;
const BOX_FACES = new Uint8Array([
  0, 4, 6, 2, 1, 3, 7, 5, 0, 1, 5, 4, 2, 6, 7, 3, 0, 2, 3, 1, 4, 5, 7, 6,
]);
const ROUNDING_FACTOR = 16 * Number.EPSILON;

/**
 * Creates bounded, reusable scratch for ranking a node's visible footprint.
 * This is a box approximation for allocation, never a visibility authority.
 * The result contains screen area fraction and representative clip-w depth.
 */
export function createSegmentedViewGeometry(view) {
  if (
    view.sceneToClipMatrix?.length !== 16 ||
    view.frustumPlanesScene?.length !== 6 ||
    !["perspective", "orthographic"].includes(view.projectionKind)
  ) {
    throw new TypeError("Segmented view geometry requires a projected view");
  }
  const matrix = Float64Array.from(view.sceneToClipMatrix);
  const planes = new Float64Array(24);
  if (!matrix.every(Number.isFinite)) {
    throw new RangeError("Segmented view matrix must be finite");
  }
  for (let plane = 0; plane < 6; plane++) {
    const source = view.frustumPlanesScene[plane];
    if (source?.length !== 4 || !source.every(Number.isFinite)) {
      throw new RangeError("Segmented frustum planes must be finite");
    }
    const norm = Math.hypot(source[0], source[1], source[2]);
    if (!(norm > 0)) {
      throw new RangeError("Segmented frustum plane normal must be nonzero");
    }
    for (let component = 0; component < 4; component++) {
      planes[plane * 4 + component] = source[component] / norm;
    }
  }
  const perspective = view.projectionKind === "perspective";
  let faces = new Float64Array(MAX_FACES * FACE_STRIDE);
  let nextFaces = new Float64Array(faces.length);
  let lengths = new Uint8Array(MAX_FACES);
  let nextLengths = new Uint8Array(MAX_FACES);
  const crossings = new Float64Array(MAX_POINTS * 3);
  const x = new Float64Array(MAX_POINTS);
  const y = new Float64Array(MAX_POINTS);
  const order = new Uint16Array(MAX_POINTS);
  const hull = new Uint16Array(2 * MAX_POINTS);

  function turn(a, b, c) {
    return (x[b] - x[a]) * (y[c] - y[a]) - (y[b] - y[a]) * (x[c] - x[a]);
  }

  function convexHull(count) {
    for (let point = 0; point < count; point++) {
      let slot = point;
      while (
        slot > 0 &&
        (x[order[slot - 1]] > x[point] ||
          (x[order[slot - 1]] === x[point] && y[order[slot - 1]] > y[point]))
      ) {
        order[slot] = order[slot - 1];
        slot--;
      }
      order[slot] = point;
    }
    let uniqueCount = 0;
    for (let slot = 0; slot < count; slot++) {
      const point = order[slot];
      if (
        uniqueCount === 0 ||
        x[point] !== x[order[uniqueCount - 1]] ||
        y[point] !== y[order[uniqueCount - 1]]
      ) {
        order[uniqueCount++] = point;
      }
    }
    if (uniqueCount < 3) {
      return 0;
    }
    let length = 0;
    for (let slot = 0; slot < uniqueCount; slot++) {
      const point = order[slot];
      while (length > 1) {
        const orientation = turn(hull[length - 2], hull[length - 1], point);
        if (!Number.isFinite(orientation)) {
          return -1;
        }
        if (orientation > 0) {
          break;
        }
        length--;
      }
      hull[length++] = point;
    }
    const lowerEnd = length + 1;
    for (let slot = uniqueCount - 2; slot >= 0; slot--) {
      const point = order[slot];
      while (length >= lowerEnd) {
        const orientation = turn(hull[length - 2], hull[length - 1], point);
        if (!Number.isFinite(orientation)) {
          return -1;
        }
        if (orientation > 0) {
          break;
        }
        length--;
      }
      hull[length++] = point;
    }
    return length - 1;
  }

  function conservative(bounds, result) {
    const depth =
      matrix[3] * (bounds[0] * 0.5 + bounds[3] * 0.5) +
      matrix[7] * (bounds[1] * 0.5 + bounds[4] * 0.5) +
      matrix[11] * (bounds[2] * 0.5 + bounds[5] * 0.5) +
      matrix[15];
    result[0] = 1;
    result[1] = perspective && Number.isFinite(depth) && depth > 0 ? depth : 1;
    return result;
  }

  function measure(bounds, result) {
    if (
      bounds?.length !== 6 ||
      !(result instanceof Float64Array) ||
      result.length < 2
    ) {
      throw new TypeError(
        "Segmented view geometry requires bounds and a result pair",
      );
    }
    for (let axis = 0; axis < 3; axis++) {
      if (
        !Number.isFinite(bounds[axis]) ||
        !Number.isFinite(bounds[axis + 3]) ||
        bounds[axis] > bounds[axis + 3]
      ) {
        throw new RangeError(
          "Segmented view bounds must be finite and ordered",
        );
      }
    }
    result[0] = 0;
    result[1] = 1;
    for (let face = 0; face < 6; face++) {
      lengths[face] = 4;
      for (let vertex = 0; vertex < 4; vertex++) {
        const mask = BOX_FACES[face * 4 + vertex];
        for (let axis = 0; axis < 3; axis++) {
          faces[face * FACE_STRIDE + vertex * 3 + axis] =
            bounds[axis + ((mask >> axis) & 1) * 3];
        }
      }
    }
    let faceCount = 6;
    for (let plane = 0; plane < 6; plane++) {
      const nx = planes[plane * 4];
      const ny = planes[plane * 4 + 1];
      const nz = planes[plane * 4 + 2];
      const offset = planes[plane * 4 + 3];
      const minX = nx * bounds[nx >= 0 ? 0 : 3];
      const minY = ny * bounds[ny >= 0 ? 1 : 4];
      const minZ = nz * bounds[nz >= 0 ? 2 : 5];
      const maxX = nx * bounds[nx >= 0 ? 3 : 0];
      const maxY = ny * bounds[ny >= 0 ? 4 : 1];
      const maxZ = nz * bounds[nz >= 0 ? 5 : 2];
      const minimumPlaneDistance = minX + minY + minZ + offset;
      const maximumPlaneDistance = maxX + maxY + maxZ + offset;
      if (
        !Number.isFinite(minimumPlaneDistance) ||
        !Number.isFinite(maximumPlaneDistance)
      ) {
        return conservative(bounds, result);
      }
      const minimumTolerance =
        ROUNDING_FACTOR *
        (Math.abs(minX) +
          Math.abs(minY) +
          Math.abs(minZ) +
          Math.abs(offset) +
          1);
      const maximumTolerance =
        ROUNDING_FACTOR *
        (Math.abs(maxX) +
          Math.abs(maxY) +
          Math.abs(maxZ) +
          Math.abs(offset) +
          1);
      if (
        !Number.isFinite(minimumTolerance) ||
        !Number.isFinite(maximumTolerance)
      ) {
        return conservative(bounds, result);
      }
      if (maximumPlaneDistance < -maximumTolerance) {
        return result;
      }
      // Most small frontier boxes are entirely on the accepted side. Their
      // original AABB support point also proves the clipped polyhedron is there.
      if (minimumPlaneDistance >= minimumTolerance) {
        continue;
      }
      let nextCount = 0;
      let crossingCount = 0;
      for (let face = 0; face < faceCount; face++) {
        let outputLength = 0;
        const inputBase = face * FACE_STRIDE;
        const outputBase = nextCount * FACE_STRIDE;
        for (let vertex = 0; vertex < lengths[face]; vertex++) {
          const a = inputBase + vertex * 3;
          const b = inputBase + ((vertex + 1) % lengths[face]) * 3;
          let da =
            nx * faces[a] + ny * faces[a + 1] + nz * faces[a + 2] + offset;
          let db =
            nx * faces[b] + ny * faces[b + 1] + nz * faces[b + 2] + offset;
          if (!Number.isFinite(da) || !Number.isFinite(db)) {
            return conservative(bounds, result);
          }
          // Treat roundoff at a boundary as inside. This cannot discard a thin
          // box merely because large scene coordinates cancel in a plane dot.
          const toleranceA =
            ROUNDING_FACTOR *
            (Math.abs(nx * faces[a]) +
              Math.abs(ny * faces[a + 1]) +
              Math.abs(nz * faces[a + 2]) +
              Math.abs(offset) +
              1);
          const toleranceB =
            ROUNDING_FACTOR *
            (Math.abs(nx * faces[b]) +
              Math.abs(ny * faces[b + 1]) +
              Math.abs(nz * faces[b + 2]) +
              Math.abs(offset) +
              1);
          if (!Number.isFinite(toleranceA) || !Number.isFinite(toleranceB)) {
            return conservative(bounds, result);
          }
          if (Math.abs(da) <= toleranceA) {
            da = 0;
          }
          if (Math.abs(db) <= toleranceB) {
            db = 0;
          }
          if (da >= 0) {
            if (outputLength === MAX_FACE_VERTICES) {
              return conservative(bounds, result);
            }
            for (let axis = 0; axis < 3; axis++) {
              nextFaces[outputBase + outputLength * 3 + axis] = faces[a + axis];
            }
            outputLength++;
          }
          if (da < 0 !== db < 0) {
            if (
              outputLength === MAX_FACE_VERTICES ||
              crossingCount === MAX_POINTS
            ) {
              return conservative(bounds, result);
            }
            const denominator = da - db;
            if (!Number.isFinite(denominator)) {
              return conservative(bounds, result);
            }
            const t = da / denominator;
            for (let axis = 0; axis < 3; axis++) {
              const component = faces[a + axis] * (1 - t) + faces[b + axis] * t;
              if (!Number.isFinite(component)) {
                return conservative(bounds, result);
              }
              nextFaces[outputBase + outputLength * 3 + axis] = component;
              crossings[crossingCount * 3 + axis] = component;
            }
            outputLength++;
            crossingCount++;
          }
        }
        if (outputLength >= 3) {
          nextLengths[nextCount++] = outputLength;
          if (nextCount === MAX_FACES) {
            return conservative(bounds, result);
          }
        }
      }
      if (crossingCount >= 3) {
        // Close the clipped volume. Without this cap a box containing the
        // frustum can incorrectly disappear after all original faces vanish.
        let ux;
        let uy;
        let uz;
        if (Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz)) {
          ux = 0;
          uy = nz;
          uz = -ny;
        } else if (Math.abs(ny) <= Math.abs(nz)) {
          ux = -nz;
          uy = 0;
          uz = nx;
        } else {
          ux = ny;
          uy = -nx;
          uz = 0;
        }
        const vx = ny * uz - nz * uy;
        const vy = nz * ux - nx * uz;
        const vz = nx * uy - ny * ux;
        for (let point = 0; point < crossingCount; point++) {
          const dx = crossings[point * 3] - crossings[0];
          const dy = crossings[point * 3 + 1] - crossings[1];
          const dz = crossings[point * 3 + 2] - crossings[2];
          x[point] = ux * dx + uy * dy + uz * dz;
          y[point] = vx * dx + vy * dy + vz * dz;
          if (!Number.isFinite(x[point]) || !Number.isFinite(y[point])) {
            return conservative(bounds, result);
          }
        }
        const capLength = convexHull(crossingCount);
        if (capLength < 0 || capLength > MAX_FACE_VERTICES) {
          return conservative(bounds, result);
        }
        if (capLength >= 3) {
          for (let vertex = 0; vertex < capLength; vertex++) {
            for (let axis = 0; axis < 3; axis++) {
              nextFaces[nextCount * FACE_STRIDE + vertex * 3 + axis] =
                crossings[hull[vertex] * 3 + axis];
            }
          }
          nextLengths[nextCount++] = capLength;
          if (nextCount === MAX_FACES) {
            return conservative(bounds, result);
          }
        }
      }
      if (nextCount === 0) {
        return result;
      }
      const previousFaces = faces;
      faces = nextFaces;
      nextFaces = previousFaces;
      const previousLengths = lengths;
      lengths = nextLengths;
      nextLengths = previousLengths;
      faceCount = nextCount;
    }
    let pointCount = 0;
    let minimumDepth = Number.POSITIVE_INFINITY;
    let maximumDepth = 0;
    for (let face = 0; face < faceCount; face++) {
      for (let vertex = 0; vertex < lengths[face]; vertex++) {
        const base = face * FACE_STRIDE + vertex * 3;
        const px = faces[base];
        const py = faces[base + 1];
        const pz = faces[base + 2];
        const w =
          matrix[3] * px + matrix[7] * py + matrix[11] * pz + matrix[15];
        const projectedX =
          (matrix[0] * px + matrix[4] * py + matrix[8] * pz + matrix[12]) / w;
        const projectedY =
          (matrix[1] * px + matrix[5] * py + matrix[9] * pz + matrix[13]) / w;
        if (
          !(w > 0) ||
          !Number.isFinite(w) ||
          !Number.isFinite(projectedX) ||
          !Number.isFinite(projectedY)
        ) {
          return conservative(bounds, result);
        }
        x[pointCount] = Math.max(-1, Math.min(1, projectedX));
        y[pointCount++] = Math.max(-1, Math.min(1, projectedY));
        minimumDepth = Math.min(minimumDepth, w);
        maximumDepth = Math.max(maximumDepth, w);
      }
    }
    const hullLength = convexHull(pointCount);
    if (hullLength < 0) {
      return conservative(bounds, result);
    }
    if (hullLength < 3) {
      return result;
    }
    let twiceArea = 0;
    for (let vertex = 1; vertex + 1 < hullLength; vertex++) {
      twiceArea += turn(hull[0], hull[vertex], hull[vertex + 1]);
    }
    if (!Number.isFinite(twiceArea)) {
      return conservative(bounds, result);
    }
    if (twiceArea <= 0) {
      return result;
    }
    result[0] = Math.min(1, twiceArea / 8);
    result[1] = perspective ? minimumDepth * 0.5 + maximumDepth * 0.5 : 1;
    return result;
  }

  return { measure };
}

/** @private */
const _SceneGISGaussianSegmentedViewGeometry = { createSegmentedViewGeometry };
export default _SceneGISGaussianSegmentedViewGeometry;
