import RBush from "rbush";

function contains(a, b) {
  return (
    a.minX <= b.minX && a.minY <= b.minY && a.maxX >= b.maxX && a.maxY >= b.maxY
  );
}

function sameFootprint(a, b) {
  if (
    a.minX !== b.minX ||
    a.minY !== b.minY ||
    a.maxX !== b.maxX ||
    a.maxY !== b.maxY ||
    a.rings.length !== b.rings.length
  ) {
    return false;
  }
  // Exact ring equality is sufficient; different starting vertices or winding
  // may miss this optimization but cannot incorrectly discard a constraint.
  return a.rings.every(
    (ring, i) =>
      ring.length === b.rings[i].length &&
      ring.every(
        (point, j) =>
          point.x === b.rings[i][j].x && point.y === b.rings[i][j].y,
      ),
  );
}

function side(a, b, x, y) {
  const left = (b.x - a.x) * (y - a.y);
  const right = (b.y - a.y) * (x - a.x);
  const determinant = left - right;
  // Roundoff-sized determinants cannot prove separation. Boundary contact
  // remains a conflict rather than granting a potentially unsafe batch.
  const error = 4 * Number.EPSILON * (Math.abs(left) + Math.abs(right));
  return determinant > error ? 1 : determinant < -error ? -1 : 0;
}

function segmentIntersectsRectangle(a, b, r) {
  if (
    Math.max(a.x, b.x) < r.minX ||
    Math.min(a.x, b.x) > r.maxX ||
    Math.max(a.y, b.y) < r.minY ||
    Math.min(a.y, b.y) > r.maxY
  ) {
    return false;
  }
  // The rectangle axes and the segment normal are the separating axes.
  const first = side(a, b, r.minX, r.minY);
  return (
    first === 0 ||
    side(a, b, r.maxX, r.minY) !== first ||
    side(a, b, r.maxX, r.maxY) !== first ||
    side(a, b, r.minX, r.maxY) !== first
  );
}

function intersectsRectangle(rings, rectangle) {
  const x = rectangle.minX * 0.5 + rectangle.maxX * 0.5;
  const y = rectangle.minY * 0.5 + rectangle.maxY * 0.5;
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j];
      const b = ring[i];
      if (segmentIntersectsRectangle(a, b, rectangle)) {
        return true;
      }
      if (a.y > y !== b.y > y) {
        const direction = side(a, b, x, y);
        if (direction === 0) {
          return true;
        }
        if (direction > 0 === b.y > a.y) {
          inside = !inside;
        }
      }
    }
  }
  // With no boundary crossing, the rectangle is wholly inside or outside.
  // Even/odd parity includes holes regardless of the supplied ring winding.
  return inside;
}

function conflicts(a, b) {
  const rectangle = {
    minX: Math.max(a.minX, b.minX),
    minY: Math.max(a.minY, b.minY),
    maxX: Math.min(a.maxX, b.maxX),
    maxY: Math.min(a.maxY, b.maxY),
  };
  if (rectangle.minX >= rectangle.maxX || rectangle.minY >= rectangle.maxY) {
    return false;
  }
  // A contained footprint is always inside the other instance's extent,
  // even when it lies in a hole. A solid rectangle also occupies the overlap.
  if (
    a.solidRectangle ||
    b.solidRectangle ||
    contains(a, b) ||
    contains(b, a)
  ) {
    return true;
  }
  return (
    intersectsRectangle(a.rings, rectangle) ||
    intersectsRectangle(b.rings, rectangle)
  );
}

/**
 * Plans planar area order and the last conflicting predecessor of each range.
 * Only the returned index arrays survive candidate construction; no closed
 * volume buffers, polygon-pair graph, or spatial tree is retained by commands.
 *
 * @param {SceneGISPlanarPolygonGeometry[]} geometries The immutable input geometries.
 * @param {object[]} extents The matching world XY bounds.
 * @returns {object} The internal order and last-conflict indices in that order.
 * @private
 */
function planSceneGISPlanarGroundAreas(geometries, extents) {
  const tree = new RBush();
  const layers = [];
  const nodes = [];
  for (let i = 0; i < geometries.length; i++) {
    const geometry = geometries[i];
    const rings = geometry._getDrapeSource().rings;
    const extent = extents[i];
    const solidRectangle =
      rings.length === 1 &&
      rings[0].length === 4 &&
      rings[0].every(
        (p) =>
          (p.x === extent.minX || p.x === extent.maxX) &&
          (p.y === extent.minY || p.y === extent.maxY),
      );
    const node = {
      ...extent,
      geometry,
      rings,
      solidRectangle,
      index: i,
      layer: 0,
      predecessor: -1,
    };
    let predecessor;
    for (const earlier of tree.search(node)) {
      if (!conflicts(node, earlier)) {
        continue;
      }
      if (
        predecessor === undefined ||
        earlier.layer > predecessor.layer ||
        (earlier.layer === predecessor.layer &&
          earlier.index > predecessor.index)
      ) {
        predecessor = earlier;
      }
      // Both bounds and filled area must contain the predecessor to transfer
      // all of its future conflicts. Bbox containment alone is insufficient.
      if (
        geometry === earlier.geometry ||
        (solidRectangle && contains(node, earlier)) ||
        sameFootprint(node, earlier)
      ) {
        tree.remove(earlier);
      }
    }
    if (predecessor !== undefined) {
      node.layer = predecessor.layer + 1;
      node.predecessor = predecessor.index;
    }
    tree.insert(node);
    nodes.push(node);
    (layers[node.layer] ??= []).push(i);
  }
  const order = layers.flat();
  const positions = new Array(order.length);
  for (let i = 0; i < order.length; i++) {
    positions[order[i]] = i;
  }
  const lastConflicts = order.map((index) => {
    const previous = nodes[index].predecessor;
    return previous < 0 ? -1 : positions[previous];
  });
  return { order, lastConflicts };
}

export default planSceneGISPlanarGroundAreas;
