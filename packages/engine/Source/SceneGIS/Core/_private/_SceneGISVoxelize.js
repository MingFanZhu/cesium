import Cartesian3 from "../../../Core/Cartesian3.js";
import Matrix4 from "../../../Core/Matrix4.js";
import RuntimeError from "../../../Core/RuntimeError.js";

function fillEnclosed(data, nx, ny, nz) {
  const queue = new Uint32Array(data.length);
  let head = 0;
  let tail = 0;
  function visit(index) {
    if (data[index] === 0) {
      data[index] = 3;
      queue[tail++] = index;
    }
  }
  const plane = nx * ny;
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      visit(nx * y + plane * z);
      visit(nx - 1 + nx * y + plane * z);
    }
    for (let x = 0; x < nx; x++) {
      visit(x + plane * z);
      visit(x + nx * (ny - 1) + plane * z);
    }
  }
  for (let i = 0; i < plane; i++) {
    visit(i);
    visit(i + plane * (nz - 1));
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % nx;
    const y = Math.floor(i / nx) % ny;
    const z = Math.floor(i / plane);
    if (x > 0) {
      visit(i - 1);
    }
    if (x < nx - 1) {
      visit(i + 1);
    }
    if (y > 0) {
      visit(i - nx);
    }
    if (y < ny - 1) {
      visit(i + nx);
    }
    if (z > 0) {
      visit(i - plane);
    }
    if (z < nz - 1) {
      visit(i + plane);
    }
  }
  let interior = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0) {
      data[i] = 2;
      interior++;
    } else if (data[i] === 3) {
      data[i] = 0;
    }
  }
  return interior;
}

function addAxis(axes, x, y, z, a, b, c) {
  const scale = Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  if (scale === 0) {
    return;
  }
  x /= scale;
  y /= scale;
  z /= scale;
  const p = x * a.x + y * a.y + z * a.z;
  const q = x * b.x + y * b.y + z * b.z;
  const r = x * c.x + y * c.y + z * c.z;
  const epsilon =
    32 * Number.EPSILON * Math.max(1, Math.abs(p), Math.abs(q), Math.abs(r));
  axes.push([
    x,
    y,
    z,
    Math.min(p, q, r) - epsilon,
    Math.max(p, q, r) + epsilon,
    0.5 * (Math.abs(x) + Math.abs(y) + Math.abs(z)),
  ]);
}

function overlaps(axes, x, y, z) {
  for (const axis of axes) {
    const p = axis[0] * x + axis[1] * y + axis[2] * z;
    if (p + axis[5] < axis[3] || p - axis[5] > axis[4]) {
      return false;
    }
  }
  return true;
}

/** Static worker handler. No graphics state, mesh ownership or cached results. @private */
function _SceneGISVoxelize(parameters, transferableObjects = []) {
  const started = performance.now();
  const { grid, meshes, limits, triangles } = parameters;
  const { x: nx, y: ny, z: nz } = grid.dimensions;
  const data = new Uint8Array(nx * ny * nz);
  const inverse = Matrix4.inverseTransformation(
    grid.modelMatrix,
    new Matrix4(),
  );
  const transform = new Matrix4();
  const a = new Cartesian3(),
    b = new Cartesian3(),
    c = new Cartesian3();
  const e0 = new Cartesian3(),
    e1 = new Cartesian3(),
    e2 = new Cartesian3(),
    normal = new Cartesian3();
  let candidateTests = 0;
  let surfaceCells = 0;
  for (const mesh of meshes) {
    Matrix4.multiply(inverse, mesh.modelMatrix, transform);
    const positions = mesh.positions;
    const indices = mesh.indices;
    const vertexCount = positions.length / 3;
    for (const value of positions) {
      if (!Number.isFinite(value)) {
        throw new RuntimeError("Mesh positions must be finite.");
      }
    }
    const count = indices?.length ?? vertexCount;
    for (let i = 0; i < count; i += 3) {
      const vertices = [a, b, c];
      for (let v = 0; v < 3; v++) {
        const index = indices ? indices[i + v] : i + v;
        if (index >= vertexCount) {
          throw new RuntimeError("Mesh index exceeds the position count.");
        }
        const p = vertices[v];
        Cartesian3.unpack(positions, index * 3, p);
        Matrix4.multiplyByPoint(transform, p, p);
        Cartesian3.subtract(p, grid.minimum, p);
        Cartesian3.divideByScalar(p, grid.cellSize, p);
        if (
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          !Number.isFinite(p.z)
        ) {
          throw new RuntimeError("Transformed positions must be finite.");
        }
      }
      Cartesian3.subtract(b, a, e0);
      Cartesian3.subtract(c, b, e1);
      Cartesian3.subtract(a, c, e2);
      Cartesian3.cross(e0, e1, normal);
      if (Cartesian3.magnitudeSquared(normal) === 0) {
        throw new RuntimeError(
          "Degenerate triangles are unsupported; remove them before voxelization.",
        );
      }
      const epsilon =
        32 *
        Number.EPSILON *
        Math.max(
          1,
          ...[a, b, c].flatMap((p) => [
            Math.abs(p.x),
            Math.abs(p.y),
            Math.abs(p.z),
          ]),
        );
      const loX = Math.max(0, Math.ceil(Math.min(a.x, b.x, c.x) - epsilon) - 1);
      const loY = Math.max(0, Math.ceil(Math.min(a.y, b.y, c.y) - epsilon) - 1);
      const loZ = Math.max(0, Math.ceil(Math.min(a.z, b.z, c.z) - epsilon) - 1);
      const hiX = Math.min(
        nx - 1,
        Math.floor(Math.max(a.x, b.x, c.x) + epsilon),
      );
      const hiY = Math.min(
        ny - 1,
        Math.floor(Math.max(a.y, b.y, c.y) + epsilon),
      );
      const hiZ = Math.min(
        nz - 1,
        Math.floor(Math.max(a.z, b.z, c.z) + epsilon),
      );
      if (loX > hiX || loY > hiY || loZ > hiZ) {
        continue;
      }
      candidateTests += (hiX - loX + 1) * (hiY - loY + 1) * (hiZ - loZ + 1);
      if (candidateTests > limits.maximumCandidateTests) {
        throw new RuntimeError(
          "Voxelization exceeds maximumCandidateTests; adjust the explicit budget or input.",
        );
      }
      const axes = [];
      addAxis(axes, normal.x, normal.y, normal.z, a, b, c);
      for (const edge of [e0, e1, e2]) {
        addAxis(axes, 0, edge.z, -edge.y, a, b, c);
        addAxis(axes, -edge.z, 0, edge.x, a, b, c);
        addAxis(axes, edge.y, -edge.x, 0, a, b, c);
      }
      for (let z = loZ; z <= hiZ; z++) {
        for (let y = loY; y <= hiY; y++) {
          for (let x = loX; x <= hiX; x++) {
            const index = x + nx * (y + ny * z);
            if (
              data[index] === 0 &&
              overlaps(axes, x + 0.5, y + 0.5, z + 0.5)
            ) {
              data[index] = 1;
              surfaceCells++;
            }
          }
        }
      }
    }
  }
  const interiorCells =
    grid.fillMode === "enclosed" ? fillEnclosed(data, nx, ny, nz) : 0;
  transferableObjects.push(data.buffer);
  return {
    data,
    statistics: {
      triangles,
      candidateTests,
      surfaceCells,
      interiorCells,
      computeMilliseconds: performance.now() - started,
    },
  };
}

export default _SceneGISVoxelize;
