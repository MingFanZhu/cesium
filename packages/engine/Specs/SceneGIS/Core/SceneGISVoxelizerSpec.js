import {
  Cartesian3,
  Matrix4,
  RuntimeError,
  SceneGISVoxelizer,
  Transforms,
} from "../../../index.js";

describe("SceneGIS/Core/SceneGISVoxelizer", function () {
  let voxelizer;
  function box(minimum = 1.25, maximum = 6.75) {
    const a = minimum,
      b = maximum;
    return {
      positions: new Float64Array([
        a,
        a,
        a,
        b,
        a,
        a,
        b,
        b,
        a,
        a,
        b,
        a,
        a,
        a,
        b,
        b,
        a,
        b,
        b,
        b,
        b,
        a,
        b,
        b,
      ]),
      indices: new Uint16Array([
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
      ]),
    };
  }
  function create(options = {}) {
    voxelizer = new SceneGISVoxelizer({
      dimensions: new Cartesian3(8, 8, 8),
      cellSize: 1,
      ...options,
    });
    return voxelizer;
  }
  afterEach(function () {
    if (voxelizer && !voxelizer.isDestroyed()) {
      voxelizer.destroy();
    }
  });

  it("covers a closed cube conservatively and distinguishes its interior", async function () {
    create({ fillMode: "enclosed" });
    const mesh = box();
    const pending = voxelizer.voxelize([mesh]);
    mesh.positions.fill(NaN);
    expect(voxelizer.busy).toBe(true);
    expect(() => voxelizer.voxelize([])).toThrowDeveloperError();
    const result = await pending;
    expect(voxelizer.busy).toBe(false);
    expect(result.statistics.surfaceCells).toBe(152);
    expect(result.statistics.interiorCells).toBe(64);
    expect(result.data[0]).toBe(0);
    expect(result.data[1 + 8 * (3 + 8 * 3)]).toBe(1);
    expect(result.data[3 + 8 * (3 + 8 * 3)]).toBe(2);
    expect(mesh.indices.byteLength).toBe(72);
    const mask = SceneGISVoxelizer.createSolidMask(result);
    expect(mask.reduce((a, b) => a + b, 0)).toBe(216);
    mask.fill(0);
    expect(result.data[3 + 8 * (3 + 8 * 3)]).toBe(2);
    voxelizer.destroy();
    expect(voxelizer.isDestroyed()).toBe(true);
    expect(result.data.byteLength).toBe(512);
  });

  it("does not fill open boxes or use the domain boundary to cap clipped geometry", async function () {
    create({ fillMode: "enclosed" });
    const open = box();
    open.indices = new Uint16Array([
      ...open.indices.slice(0, 6),
      ...open.indices.slice(12),
    ]);
    const result = await voxelizer.voxelize([open]);
    expect(result.statistics.interiorCells).toBe(0);
    expect(result.data[3 + 8 * (3 + 8 * 3)]).toBe(0);
    const clipped = box(-2.25, 6.75);
    const cut = await voxelizer.voxelize([clipped]);
    expect(cut.statistics.interiorCells).toBe(0);
  });

  it("surface mode leaves interiors empty and is independent of winding and duplicate meshes", async function () {
    create();
    const mesh = box();
    const a = await voxelizer.voxelize([mesh]);
    mesh.indices.reverse();
    const b = await voxelizer.voxelize([mesh, mesh]);
    expect(a.data).toEqual(b.data);
    expect(a.statistics.surfaceCells).toBe(152);
    expect(a.statistics.interiorCells).toBe(0);
    expect(a.data[3 + 8 * (3 + 8 * 3)]).toBe(0);
  });

  it("marks both cells touched by a thin triangle on their shared face", async function () {
    create();
    const result = await voxelizer.voxelize([
      { positions: new Float32Array([1, 1.2, 1.2, 1, 1.8, 1.2, 1, 1.2, 1.8]) },
    ]);
    expect(result.statistics.surfaceCells).toBe(2);
    expect(result.data[0 + 8 * (1 + 8 * 1)]).toBe(1);
    expect(result.data[1 + 8 * (1 + 8 * 1)]).toBe(1);
  });

  it("rejects AABB-only false positives for a diagonal triangle", async function () {
    create();
    const result = await voxelizer.voxelize([
      {
        positions: new Float64Array([
          1.2, 1.2, 1.2, 5.8, 1.2, 1.2, 1.2, 5.8, 1.2,
        ]),
      },
    ]);
    expect(result.data[5 + 8 * (5 + 8 * 1)]).toBe(0);
    expect(result.data[1 + 8 * (5 + 8 * 1)]).toBe(1);
  });

  it("preserves local occupancy under ENU placement and affine mesh transforms", async function () {
    create();
    const reference = await voxelizer.voxelize([box()]);
    voxelizer.destroy();
    const placement = Transforms.eastNorthUpToFixedFrame(
      Cartesian3.fromDegrees(-74, 40.7, 100),
    );
    create({ modelMatrix: placement });
    const mesh = box(0.625, 3.375);
    mesh.modelMatrix = Matrix4.multiply(
      placement,
      Matrix4.fromUniformScale(2),
      new Matrix4(),
    );
    const result = await voxelizer.voxelize([mesh]);
    expect(result.data).toEqual(reference.data);
    expect(result.grid.modelMatrix).toEqual(placement);
  });

  it("reduces conservative volume error with a finer grid", async function () {
    create({ fillMode: "enclosed" });
    const mesh = box(1.4, 6.6);
    const coarse = await voxelizer.voxelize([mesh]);
    voxelizer.destroy();
    create({
      dimensions: new Cartesian3(32, 32, 32),
      cellSize: 0.25,
      fillMode: "enclosed",
    });
    const fine = await voxelizer.voxelize([mesh]);
    const volume = (r) =>
      (r.statistics.surfaceCells + r.statistics.interiorCells) *
      r.grid.cellSize ** 3;
    const exact = 5.2 ** 3;
    expect(volume(fine)).toBeGreaterThan(exact);
    expect(volume(fine) - exact).toBeLessThan(volume(coarse) - exact);
  });

  it("rejects invalid geometry and explicit work budgets, then remains reusable", async function () {
    create({ maximumCandidateTests: 1 });
    await expectAsync(voxelizer.voxelize([box()])).toBeRejectedWithError(
      RuntimeError,
      /maximumCandidateTests/,
    );
    const invalid = box();
    invalid.indices[0] = 99;
    await expectAsync(voxelizer.voxelize([invalid])).toBeRejectedWithError(
      RuntimeError,
      /index/,
    );
    await expectAsync(
      voxelizer.voxelize([{ positions: new Float32Array(9) }]),
    ).toBeRejectedWithError(RuntimeError, /Degenerate/);
    const empty = await voxelizer.voxelize([]);
    expect(empty.statistics.surfaceCells).toBe(0);
    expect(empty.statistics.triangles).toBe(0);
  });

  it("cancels and destroys pending jobs without detaching inputs", async function () {
    create();
    const mesh = box();
    const job = voxelizer.voxelize([mesh]);
    voxelizer.cancel();
    await expectAsync(job).toBeRejectedWithError(RuntimeError, /cancelled/);
    expect(voxelizer.busy).toBe(false);
    expect(mesh.positions.byteLength).toBe(192);
    const next = await voxelizer.voxelize([mesh]);
    expect(next.statistics.surfaceCells).toBe(152);
    const finalJob = voxelizer.voxelize([mesh]);
    voxelizer.destroy();
    await expectAsync(finalJob).toBeRejectedWithError(
      RuntimeError,
      /cancelled/,
    );
    expect(voxelizer.isDestroyed()).toBe(true);
  });

  it("validates grid, transforms and snapshot budgets before scheduling", function () {
    for (const options of [
      { cellSize: 0 },
      { dimensions: new Cartesian3(1.5, 8, 8) },
      { maximumCells: 511 },
      { fillMode: "guess" },
      { modelMatrix: Matrix4.fromUniformScale(2) },
    ]) {
      expect(() => create(options)).toThrowDeveloperError();
    }
    create({ maximumInputBytes: 1 });
    expect(() => voxelizer.voxelize([box()])).toThrowDeveloperError();
    expect(voxelizer.busy).toBe(false);
  });
});
