import {
  SceneGISGaussianSegmentedPrimitive,
  Cartesian3,
  Matrix4,
  Transforms,
  Color,
  SceneGISPlanarWorld,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  BoxGeometry,
  GeometryInstance,
  Primitive,
  PerInstanceColorAppearance,
  ColorGeometryInstanceAttribute,
  SceneTransforms,
} from "../../../index.js";
import { createFrozenFinalA4Bytes } from "./Gaussian/SceneGISGaussianSegmentedGlobalA4Fixture.js";
import { createMacroChunkRuntimeManifest } from "../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianManifest.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISGaussianSegmentedRendering", function () {
  let scene, primitive;
  afterEach(async function () {
    if (primitive && !primitive.isDestroyed()) {
      if (!scene.isDestroyed()) {
        scene.primitives.remove(primitive);
      }
      await pollToPromise(() => primitive.isDestroyed(), { timeout: 10000 });
    }
    if (scene && !scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
    scene = primitive = undefined;
  });

  function payloads() {
    const fixture = createFrozenFinalA4Bytes();
    const manifest = createMacroChunkRuntimeManifest({
      byteLength: fixture.mci.length,
      checksum: new DataView(fixture.mci.buffer).getUint32(24, true),
    });
    return new Map([
      ["scene.mcl.json", new TextEncoder().encode(JSON.stringify(manifest))],
      ["scene.mci", fixture.mci],
      ...fixture.packs,
    ]);
  }

  function options(modelMatrix) {
    const files = payloads();
    return {
      url: "https://gaussian.test/scene.mcl.json",
      modelMatrix,
      maximumSelectedSplats: 100000,
      maximumCoverageSlots: 1000,
      maximumCpuBytes: 128 * 1024 ** 2,
      maximumGpuBytes: 128 * 1024 ** 2,
      maximumCpuPageBytes: 16 * 1024 ** 2,
      replacementCpuEscrowBytes: 8 * 1024 ** 2,
      maximumGpuPageBytes: 16 * 1024 ** 2,
      replacementGpuEscrowBytes: 8 * 1024 ** 2,
      maximumSortWorkingSetBytes: 16 * 1024 ** 2,
      usePersistentCache: false,
      minimumLeafLogicalLevel: 0,
      refineErrorPixels: 1,
      coarsenErrorPixels: 0.5,
      _fetchFunction: async (request) => {
        const file = files.get(new URL(request.url).pathname.slice(1));
        if (!file) {
          throw new Error(`Unknown fixture ${request.url}`);
        }
        if (request.start !== undefined) {
          const range = file.slice(request.start, request.end + 1);
          return {
            status: 206,
            headers: {
              "content-range": `bytes ${request.start}-${request.end}/${file.length}`,
            },
            arrayBuffer: range.buffer,
          };
        }
        return { status: 200, headers: {}, arrayBuffer: file.slice().buffer };
      },
    };
  }

  [false, true].forEach((planar) => {
    it(`streams with real Workers, preserves occlusion and releases ${planar ? "planar" : "ENU"} resources`, async function () {
      scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
      scene.fog.enabled = false;
      scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
      const transform = planar
        ? Matrix4.fromTranslation(new Cartesian3(20000000, -30000000, 200))
        : Transforms.eastNorthUpToFixedFrame(
            Cartesian3.fromDegrees(0, 35, 500),
          );
      if (planar) {
        scene._initializeWorld(
          new SceneGISPlanarWorld({
            coordinateSystem: new SceneGISPlanarCoordinateSystem({
              extent: new SceneGISPlanarExtent({
                minimumX: 19999000,
                maximumX: 20001000,
                minimumY: -30001000,
                maximumY: -29999000,
              }),
            }),
            maximumLevel: 0,
          }),
        );
      }
      const point = (x, y, z) =>
        Matrix4.multiplyByPoint(
          transform,
          new Cartesian3(x, y, z),
          new Cartesian3(),
        );
      const vector = (x, y, z) =>
        Matrix4.multiplyByPointAsVector(
          transform,
          new Cartesian3(x, y, z),
          new Cartesian3(),
        );
      scene.camera.setView({
        destination: point(22, -65, 22),
        orientation: { direction: vector(0, 1, 0), up: vector(0, 0, 1) },
      });
      scene.camera.frustum.near = 0.1;
      scene.camera.frustum.far = 500;
      primitive = scene.primitives.add(
        new SceneGISGaussianSegmentedPrimitive(options(transform)),
      );
      await pollToPromise(
        () => {
          scene.renderForSpecs();
          if (primitive.error) {
            throw primitive.error;
          }
          return (
            primitive.ready &&
            primitive.statistics.mappingWorkerCompletionCount > 0
          );
        },
        { timeout: 15000 },
      );
      expect(primitive.boundingSphere).toBeDefined();
      expect(primitive.statistics.globalSortDispatchCount).toBeGreaterThan(0);
      const renderPixels = () => {
        scene.renderForSpecs();
        return scene.context.readPixels();
      };
      const withSplats = renderPixels();
      primitive.show = false;
      expect(renderPixels()).not.toEqual(withSplats);
      primitive.show = true;
      const blocker = scene.primitives.add(
        new Primitive({
          asynchronous: false,
          geometryInstances: new GeometryInstance({
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(100, 1, 100),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
            },
          }),
          modelMatrix: Matrix4.multiplyByTranslation(
            transform,
            new Cartesian3(22, -20, 22),
            new Matrix4(),
          ),
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: false,
          }),
        }),
      );
      const occluded = renderPixels();
      primitive.show = false;
      expect(renderPixels()).toEqual(occluded);
      primitive.show = true;
      blocker.show = false;
      expect(renderPixels()).not.toEqual(occluded);
      const resources = primitive._controller._pageBackend;
      const allocated = primitive.statistics.gpuAtlasAllocatedBytes;
      for (let i = 0; i < 20; i++) {
        scene.renderForSpecs();
      }
      expect(primitive._controller._pageBackend).toBe(resources);
      expect(primitive.statistics.gpuAtlasAllocatedBytes).toBe(allocated);

      // Navigation consumes native translucent depth, independently of color writes.
      if (scene.world) {
        scene.world.show = false;
      }
      const sourcePosition = point(
        11.011764526367188,
        11.011764526367188,
        11.011764526367188,
      );
      const windowPosition = SceneTransforms.worldToWindowCoordinates(
        scene,
        sourcePosition,
      );
      expect(scene.pickTranslucentDepth).toBe(false);
      renderPixels();
      expect(scene.pickPosition(windowPosition)).toBeUndefined();
      scene.pickTranslucentDepth = true;
      const colorBeforePick = renderPixels();
      const controller = primitive._controller;
      const load = spyOn(controller._loader, "update").and.callThrough();
      const select = spyOn(controller, "_observeView").and.callThrough();
      const command = controller._d3.current.command;
      const sortCount = primitive.statistics.globalSortDispatchCount;
      const hit = scene.pickPosition(windowPosition);
      expect(hit).toBeDefined();
      expect(Cartesian3.distance(hit, sourcePosition)).toBeLessThan(2);
      expect(scene.pickPositionWorldCoordinates(windowPosition)).toEqualEpsilon(
        hit,
        1e-6,
      );
      expect(load).not.toHaveBeenCalled();
      expect(select).not.toHaveBeenCalled();
      expect(primitive.statistics.globalSortDispatchCount).toBe(sortCount);
      expect(primitive.statistics.gpuAtlasAllocatedBytes).toBe(allocated);
      expect(controller._d3.current.command).toBe(command);
      expect(command.renderState.depthMask).toBe(false);
      expect(renderPixels()).toEqual(colorBeforePick);

      blocker.show = true;
      renderPixels();
      const frontHit = Matrix4.multiplyByPoint(
        Matrix4.inverseTransformation(transform, new Matrix4()),
        scene.pickPosition(windowPosition),
        new Cartesian3(),
      );
      expect(frontHit.y).toEqualEpsilon(-20.5, 0.1);
      blocker.show = false;
      primitive.show = false;
      renderPixels();
      expect(scene.pickPosition(windowPosition)).toBeUndefined();
      primitive.show = true;
      renderPixels();
      scene.useDepthPicking = false;
      expect(scene.pickPosition(windowPosition)).toBeUndefined();
      scene.useDepthPicking = true;

      const before = primitive.boundingSphere.center.clone();
      primitive.modelMatrix = Matrix4.multiplyByTranslation(
        transform,
        new Cartesian3(5, 0, 0),
        new Matrix4(),
      );
      expect(
        Cartesian3.distance(before, primitive.boundingSphere.center),
      ).toEqualEpsilon(5, 1e-6);
      expect(scene.context._gl.getError()).toBe(0);
    });
  });

  it("finishes in-flight Worker cleanup after its Scene is destroyed", async function () {
    scene = createScene({ canvas: createCanvas(32, 32), scene3DOnly: true });
    primitive = scene.primitives.add(
      new SceneGISGaussianSegmentedPrimitive(options(Matrix4.IDENTITY)),
    );
    scene.camera.setView({
      destination: new Cartesian3(22, -65, 22),
      orientation: { direction: Cartesian3.UNIT_Y, up: Cartesian3.UNIT_Z },
    });
    await pollToPromise(() => {
      scene.renderForSpecs();
      if (primitive.error) {
        throw primitive.error;
      }
      return primitive.statistics.corePreparationBatchDispatchCount > 0;
    });
    scene.destroyForSpecs();
    await pollToPromise(
      () => {
        const error =
          primitive._destroyCleanupError ??
          primitive._controller._d3?._destroyState?.error;
        if (error) {
          throw error;
        }
        return primitive.isDestroyed();
      },
      { timeout: 10000 },
    );
    expect(primitive.statistics.gpuAtlasAllocatedBytes).toBe(0);
    expect(primitive.statistics.cleanupDebtBytes).toBe(0);
  });
});
