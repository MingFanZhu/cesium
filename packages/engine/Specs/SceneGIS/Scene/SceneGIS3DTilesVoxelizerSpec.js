import {
  Axis,
  Cartesian3,
  Cesium3DTileset,
  Matrix4,
  PrimitiveCollection,
  RuntimeError,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGIS3DTilesVoxelizer,
  Transforms,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGIS3DTilesVoxelizer", function () {
  let scene;
  let urls;
  let tileset;
  let job;
  function jsonUrl(value) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value)], { type: "application/json" }),
    );
    urls.push(url);
    return url;
  }
  function geometry(options = {}) {
    const positions = new Float32Array([
      1.25, 1.25, 1.25, 6.75, 1.25, 1.25, 6.75, 6.75, 1.25, 1.25, 6.75, 1.25,
      1.25, 1.25, 6.75, 6.75, 1.25, 6.75, 6.75, 6.75, 6.75, 1.25, 6.75, 6.75,
    ]);
    const indices = new Uint16Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2,
      3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]);
    const instancePositions = new Float32Array([0, 0, 0, 8, 0, 0]);
    const buffer = new Uint8Array(
      positions.byteLength + indices.byteLength + instancePositions.byteLength,
    );
    buffer.set(new Uint8Array(positions.buffer));
    buffer.set(new Uint8Array(indices.buffer), positions.byteLength);
    buffer.set(
      new Uint8Array(instancePositions.buffer),
      positions.byteLength + indices.byteLength,
    );
    const gltf = {
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0 },
              indices: 1,
              mode: options.mode ?? 4,
            },
          ],
        },
      ],
      buffers: [
        {
          uri: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...buffer))}`,
          byteLength: buffer.length,
        },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        {
          buffer: 0,
          byteOffset: positions.byteLength,
          byteLength: indices.byteLength,
        },
        {
          buffer: 0,
          byteOffset: positions.byteLength + indices.byteLength,
          byteLength: instancePositions.byteLength,
        },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 8,
          type: "VEC3",
          min: [1.25, 1.25, 1.25],
          max: [6.75, 6.75, 6.75],
        },
        { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" },
        { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" },
      ],
    };
    if (options.instances) {
      gltf.extensionsUsed = ["EXT_mesh_gpu_instancing"];
      gltf.nodes[0].extensions = {
        EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 2 } },
      };
    }
    if (options.translation) {
      gltf.nodes[0].translation = options.translation;
    }
    return jsonUrl(gltf);
  }
  function tile(uri, x = 0, error = 0) {
    return {
      boundingVolume: { box: [4, 4, 4, 4, 0, 0, 0, 4, 0, 0, 0, 4] },
      geometricError: error,
      transform: Matrix4.toArray(
        Matrix4.fromTranslation(new Cartesian3(x, 0, 0)),
      ),
      content: { uri },
    };
  }
  function document(root) {
    return {
      asset: { version: "1.1" },
      geometricError: 100,
      root: { refine: "REPLACE", ...root },
    };
  }
  async function load(root, placement = Matrix4.IDENTITY) {
    tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(jsonUrl(document(root)), {
        show: false,
        modelMatrix: placement,
        modelUpAxis: Axis.Z,
        modelForwardAxis: Axis.X,
        environmentMapOptions: { enabled: false },
      }),
    );
    return tileset;
  }
  function start(options = {}) {
    job = scene.primitives.add(
      new SceneGIS3DTilesVoxelizer({
        scene,
        tileset,
        maximumGeometricError: 0,
        grid: {
          dimensions: new Cartesian3(32, 8, 8),
          cellSize: 1,
          fillMode: "enclosed",
        },
        ...options,
      }),
    );
    return job;
  }
  async function finish() {
    let result,
      error,
      done = false;
    job.resultPromise.then(
      (r) => {
        result = r;
        done = true;
      },
      (e) => {
        error = e;
        done = true;
      },
    );
    await pollToPromise(
      () => {
        scene.renderForSpecs();
        return done;
      },
      { timeout: 15000 },
    ).catch((failure) => {
      failure.message += `; job=${job.status}, progress=${JSON.stringify(job.progress)}`;
      throw failure;
    });
    if (error) {
      throw error;
    }
    return result;
  }
  beforeEach(function () {
    urls = [];
    scene = createScene();
    scene.camera.position = new Cartesian3(1e7, 0, 0);
    scene.camera.direction = new Cartesian3(1, 0, 0);
    scene.camera.up = new Cartesian3(0, 0, 1);
    scene.camera.right = new Cartesian3(0, -1, 0);
  });
  afterEach(function () {
    scene.destroyForSpecs();
    for (const url of urls) {
      URL.revokeObjectURL(url);
    }
  });

  function nest() {
    scene.primitives.destroyPrimitives = false;
    scene.primitives.remove(tileset);
    scene.primitives.destroyPrimitives = true;
    const parent = scene.primitives.add(new PrimitiveCollection());
    const layer = parent.add(new PrimitiveCollection());
    layer.add(tileset);
    return { parent, layer };
  }
  [false, true].forEach(function (planar) {
    it(`loads nested native sources without reparenting in ${planar ? "Planar" : "Globe"}`, async function () {
      if (planar) {
        scene._initializeWorld(
          new SceneGISPlanarWorld({
            coordinateSystem: new SceneGISPlanarCoordinateSystem({
              extent: new SceneGISPlanarExtent({
                minimumX: -100,
                maximumX: 100,
                minimumY: -100,
                maximumY: 100,
              }),
            }),
            maximumLevel: 0,
          }),
        );
      }
      const placement = planar
        ? Matrix4.IDENTITY
        : Transforms.eastNorthUpToFixedFrame(
            Cartesian3.fromDegrees(-74, 40, 100),
          );
      await load(tile(geometry()), placement);
      const { parent, layer } = nest();
      start({
        grid: {
          dimensions: new Cartesian3(32, 8, 8),
          cellSize: 1,
          fillMode: "enclosed",
          modelMatrix: placement,
        },
      });
      const result = await finish();
      expect(result.statistics.surfaceCells).toBe(152);
      expect(result.statistics.interiorCells).toBe(64);
      expect(scene.primitives.contains(tileset)).toBeFalse();
      expect(layer.length).toBe(1);
      expect(layer.get(0)).toBe(tileset);
      scene.primitives.remove(job);
      expect(tileset.isDestroyed()).toBeFalse();
      expect(parent.contains(layer)).toBeTrue();
    });
  });
  it("rejects unmounted, cross-Scene and non-native sources", async function () {
    await load(tile(geometry()));
    const other = createScene();
    try {
      expect(() => start({ scene: other })).toThrowDeveloperError();
      expect(() =>
        start({ tileset: new PrimitiveCollection() }),
      ).toThrowDeveloperError();
      scene.primitives.destroyPrimitives = false;
      scene.primitives.remove(tileset);
      scene.primitives.destroyPrimitives = true;
      expect(() => start()).toThrowDeveloperError();
      other.primitives.add(tileset);
      expect(() => start()).toThrowDeveloperError();
    } finally {
      other.destroyForSpecs();
    }
  });
  ["source", "ancestor", "destroy"].forEach(function (action) {
    it(`rejects nested source ${action} before snapshot completion`, async function () {
      await load(tile(geometry()));
      const { parent, layer } = nest();
      start();
      if (action === "source") {
        layer.destroyPrimitives = false;
        layer.remove(tileset);
      } else {
        scene.primitives.destroyPrimitives = action === "destroy";
        scene.primitives.remove(parent);
        scene.primitives.destroyPrimitives = true;
      }
      try {
        await expectAsync(finish()).toBeRejectedWithError(
          RuntimeError,
          /removed or destroyed/,
        );
      } finally {
        if (!parent.isDestroyed()) {
          if (scene.primitives.contains(parent)) {
            scene.primitives.remove(parent);
          } else {
            parent.destroy();
          }
        }
        if (!tileset.isDestroyed()) {
          tileset.destroy();
        }
      }
    });
  });

  it("actively loads an offscreen region, preserves camera and publishes independent occupancy", async function () {
    scene.requestRenderMode = true;
    await load(tile(geometry()));
    scene.renderForSpecs();
    expect(tileset.root.contentUnloaded).toBe(true);
    const camera = Cartesian3.clone(scene.camera.position);
    start();
    const result = await finish();
    expect(result.source.complete).toBe(true);
    expect(result.source.tiles.length).toBe(1);
    expect(result.statistics.surfaceCells).toBe(152);
    expect(result.statistics.interiorCells).toBe(64);
    expect(result.statistics.triangles).toBe(12);
    expect(scene.camera.position).toEqual(camera);
    expect(job.status).toBe("complete");
    expect(job.progress.capturedTiles).toBe(1);
    expect(scene.primitives.remove(job)).toBe(true);
    expect(tileset.isDestroyed()).toBe(false);
    scene.primitives.remove(tileset);
    expect(result.data[3 + 32 * (3 + 8 * 3)]).toBe(2);
  });

  it("selects REPLACE children at target error, retaining parents only for ADD", async function () {
    for (const refine of ["REPLACE", "ADD"]) {
      const root = tile(geometry(), 0, 10);
      root.refine = refine;
      root.boundingVolume.box = [12, 4, 4, 12, 0, 0, 0, 4, 0, 0, 0, 4];
      root.children = [tile(geometry(), 8), tile(geometry(), 16)];
      await load(root);
      start();
      const result = await finish();
      expect(result.source.tiles.length).toBe(refine === "ADD" ? 3 : 2);
      expect(result.data[3 + 32 * (3 + 8 * 3)]).toBe(refine === "ADD" ? 2 : 0);
      expect(result.data[11 + 32 * (3 + 8 * 3)]).toBe(2);
      expect(result.data[19 + 32 * (3 + 8 * 3)]).toBe(2);
      scene.primitives.remove(job);
      scene.primitives.remove(tileset);
    }
  });

  it("uses explicit coarse source precision and does not load replacement children unnecessarily", async function () {
    const root = tile(geometry(), 0, 10);
    root.boundingVolume.box = [12, 4, 4, 12, 0, 0, 0, 4, 0, 0, 0, 4];
    root.children = [tile(geometry(), 8), tile(geometry(), 16)];
    await load(root);
    start({ maximumGeometricError: 10 });
    const result = await finish();
    expect(result.source.tiles.length).toBe(1);
    expect(tileset.root.children[0].contentUnloaded).toBe(true);
    expect(result.data[3 + 32 * (3 + 8 * 3)]).toBe(2);
    expect(result.data[11 + 32 * (3 + 8 * 3)]).toBe(0);
  });

  it("traverses empty/external containers and excludes tiles outside the grid region", async function () {
    const external = jsonUrl(document(tile(geometry(), 0, 0)));
    const root = {
      boundingVolume: { box: [54, 4, 4, 54, 0, 0, 0, 4, 0, 0, 0, 4] },
      geometricError: 100,
      children: [tile(external, 0, 100), tile(geometry(), 100)],
    };
    await load(root);
    start();
    const result = await finish();
    expect(result.source.tiles.length).toBe(1);
    expect(result.statistics.interiorCells).toBe(64);
    expect(tileset.root.children[1].contentUnloaded).toBe(true);
  });

  it("reads GPU instance transforms in the same ENU grid", async function () {
    const placement = Transforms.eastNorthUpToFixedFrame(
      Cartesian3.fromDegrees(-74, 40.7, 30),
    );
    const root = tile(geometry({ instances: true, translation: [0, 0, 0] }));
    root.boundingVolume.box = [8, 4, 4, 8, 0, 0, 0, 4, 0, 0, 0, 4];
    await load(root, placement);
    start({
      grid: {
        dimensions: new Cartesian3(32, 8, 8),
        cellSize: 1,
        fillMode: "enclosed",
        modelMatrix: placement,
      },
    });
    const result = await finish();
    expect(result.statistics.triangles).toBe(24);
    expect(result.statistics.interiorCells).toBe(128);
    expect(result.data[11 + 32 * (3 + 8 * 3)]).toBe(2);
  });

  it("rejects unsupported topology and insufficient terminal precision", async function () {
    await load(tile(geometry({ mode: 0 })));
    start();
    await expectAsync(finish()).toBeRejectedWithError(
      RuntimeError,
      /TRIANGLES/,
    );
    scene.primitives.remove(job);
    scene.primitives.remove(tileset);
    await load(tile(geometry(), 0, 20));
    start();
    await expectAsync(finish()).toBeRejectedWithError(
      RuntimeError,
      /maximumGeometricError/,
    );
  });

  it("rejects missing content rather than producing empty occupancy", async function () {
    await load(tile("/Data/does-not-exist-voxel.glb"));
    tileset.tileFailed.addEventListener(() => {});
    start();
    await expectAsync(finish()).toBeRejectedWithError(
      RuntimeError,
      /failed to load/,
    );
    expect(job.status).toBe("failed");
  });

  it("rejects source placement changes and supports cancellation without destroying the source", async function () {
    await load(tile(geometry()));
    start();
    tileset.modelMatrix = Matrix4.fromTranslation(new Cartesian3(1, 0, 0));
    await expectAsync(finish()).toBeRejectedWithError(
      RuntimeError,
      /unchanged source/,
    );
    scene.primitives.remove(job);
    start();
    const cancelled = job.resultPromise;
    scene.primitives.remove(job);
    await expectAsync(cancelled).toBeRejectedWithError(
      RuntimeError,
      /cancelled/,
    );
    expect(tileset.isDestroyed()).toBe(false);
    expect(job.isDestroyed()).toBe(true);
  });

  it("reads native i3dm and nested composite content without replacing the native decoder", async function () {
    for (const path of [
      "Instanced/InstancedWithTransform/tileset.json",
      "Composite/CompositeOfComposite/tileset.json",
      "MultipleContents/MultipleContents/tileset_1.1.json",
    ]) {
      tileset = scene.primitives.add(
        await Cesium3DTileset.fromUrl(`./Data/Cesium3DTiles/${path}`, {
          show: false,
        }),
      );
      const placement = Transforms.eastNorthUpToFixedFrame(
        tileset.boundingSphere.center,
      );
      start({
        grid: {
          minimum: new Cartesian3(-200, -200, -100),
          dimensions: new Cartesian3(80, 80, 64),
          cellSize: 5,
          modelMatrix: placement,
        },
      });
      const result = await finish();
      expect(result.source.complete).toBe(true);
      expect(result.statistics.triangles).toBeGreaterThan(12);
      expect(result.statistics.surfaceCells).toBeGreaterThan(0);
      scene.primitives.remove(job);
      scene.primitives.remove(tileset);
    }
  });

  it("loads native implicit subtrees before publishing complete coverage", async function () {
    tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(
        "./Data/Cesium3DTiles/Implicit/ImplicitTileset/tileset_1.1.json",
        { show: false },
      ),
    );
    const placement = Transforms.eastNorthUpToFixedFrame(
      tileset.boundingSphere.center,
    );
    start({
      maximumGeometricError: 35,
      grid: {
        minimum: new Cartesian3(-300, -300, -100),
        dimensions: new Cartesian3(120, 120, 64),
        cellSize: 5,
        modelMatrix: placement,
      },
    });
    const result = await finish();
    expect(result.source.complete).toBe(true);
    expect(result.source.tiles.length).toBeGreaterThan(1);
    expect(result.statistics.surfaceCells).toBeGreaterThan(0);
  });

  it("reads native Draco-decoded geometry", async function () {
    const uri = new URL(
      "./Data/Models/glTF-2.0/BoxWithTangents/glTF-Draco/BoxWithTangents.gltf",
      window.location.href,
    ).href;
    await load(tile(uri));
    start({
      grid: {
        minimum: new Cartesian3(-2, -2, -2),
        dimensions: new Cartesian3(8, 8, 8),
        cellSize: 0.5,
      },
    });
    const result = await finish();
    expect(result.statistics.triangles).toBe(12);
    expect(result.statistics.surfaceCells).toBeGreaterThan(0);
  });

  it("enforces selected-tile and snapshot budgets without reducing requested precision", async function () {
    const root = {
      boundingVolume: { box: [8, 4, 4, 8, 0, 0, 0, 4, 0, 0, 0, 4] },
      geometricError: 10,
      children: [tile(geometry()), tile(geometry(), 8)],
    };
    await load(root);
    start({ maximumTiles: 1 });
    await expectAsync(finish()).toBeRejectedWithError(
      RuntimeError,
      /maximumTiles/,
    );
    scene.primitives.remove(job);
    start({
      grid: {
        dimensions: new Cartesian3(32, 8, 8),
        cellSize: 1,
        maximumInputBytes: 1,
      },
    });
    await expectAsync(finish()).toBeRejectedWithError(
      RuntimeError,
      /maximumInputBytes/,
    );
  });

  it("can release the source after the independent Worker snapshot starts", async function () {
    await load(tile(geometry()));
    start();
    await pollToPromise(() => {
      scene.renderForSpecs();
      return job.status === "voxelizing";
    });
    scene.primitives.remove(tileset);
    const result = await finish();
    expect(result.statistics.interiorCells).toBe(64);
    expect(result.source.complete).toBe(true);
  });
});
