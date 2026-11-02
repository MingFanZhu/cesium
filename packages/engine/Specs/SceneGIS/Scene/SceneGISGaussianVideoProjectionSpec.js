import {
  Cartesian3,
  Color,
  Globe,
  Matrix4,
  Transforms,
  SceneGISGaussianSegmentedPrimitive,
  SceneGISVideoProjection,
  SceneGISPlanarWorld,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  Primitive,
  PrimitiveCollection,
  GeometryInstance,
  BoxGeometry,
  PerInstanceColorAppearance,
  ColorGeometryInstanceAttribute,
} from "../../../index.js";
import { createFrozenFinalA4Bytes } from "./Gaussian/SceneGISGaussianSegmentedGlobalA4Fixture.js";
import { createMacroChunkRuntimeManifest } from "../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianManifest.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISGaussianVideoProjection", function () {
  let scene, primitive, projection, media, stream;
  const mediaSources = [];
  afterEach(async function () {
    const programs = Array.from(
      primitive?._controller._renderResources?._videoPrograms.values() ?? [],
    );
    const depth =
      projection && !projection.isDestroyed()
        ? projection._observer.depth
        : undefined;
    scene?.destroyForSpecs();
    if (primitive) {
      await pollToPromise(() => primitive.isDestroyed(), { timeout: 15000 });
    }
    for (const program of programs) {
      expect(program.isDestroyed()).toBe(true);
    }
    if (depth) {
      expect(depth.isDestroyed()).toBe(true);
    }
    media?.pause();
    if (media) {
      media.srcObject = null;
    }
    for (const source of mediaSources.splice(0)) {
      source.element.pause();
      source.element.srcObject = null;
      source.stream.getTracks().forEach((track) => track.stop());
    }
    scene = primitive = projection = media = stream = undefined;
  });

  function options(modelMatrix) {
    const fixture = createFrozenFinalA4Bytes();
    const manifest = createMacroChunkRuntimeManifest({
      byteLength: fixture.mci.length,
      checksum: new DataView(fixture.mci.buffer).getUint32(24, true),
    });
    const files = new Map([
      ["scene.mcl.json", new TextEncoder().encode(JSON.stringify(manifest))],
      ["scene.mci", fixture.mci],
      ...fixture.packs,
    ]);
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
      _fetchFunction: async ({ url, start, end }) => {
        const file = files.get(new URL(url).pathname.slice(1));
        const bytes =
          start === undefined ? file.slice() : file.slice(start, end + 1);
        return {
          status: start === undefined ? 200 : 206,
          headers:
            start === undefined
              ? {}
              : { "content-range": `bytes ${start}-${end}/${file.length}` },
          arrayBuffer: bytes.buffer,
        };
      },
    };
  }

  async function video(color = "blue") {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d");
    context.fillStyle = color;
    context.fillRect(0, 0, 64, 64);
    stream = canvas.captureStream(0);
    media = document.createElement("video");
    media.muted = true;
    media.srcObject = stream;
    const source = { element: media, stream };
    mediaSources.push(source);
    const presented = new Promise((resolve) =>
      media.requestVideoFrameCallback(resolve),
    );
    stream.getVideoTracks()[0].requestFrame();
    await media.play();
    await presented;
    media.pause();
    return source;
  }

  function until(condition) {
    return pollToPromise(
      () => {
        scene.renderForSpecs();
        if (primitive.error) {
          throw primitive.error;
        }
        if (projection?.error) {
          throw projection.error;
        }
        return condition();
      },
      { timeout: 20000 },
    );
  }

  function pixels() {
    scene.renderForSpecs();
    return scene.context.readPixels();
  }

  it("validates target ownership, immutable lists, threshold and active projector capacity", function () {
    scene = createScene({ canvas: createCanvas(32, 32) });
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
    scene.world.show = false;
    scene.environmentEffects.enabled = false;
    scene.rethrowRenderErrors = true;
    media = document.createElement("video");
    primitive = new SceneGISGaussianSegmentedPrimitive(
      options(Matrix4.IDENTITY),
    );
    const configuration = {
      scene,
      world: scene.world,
      video: media,
      position: new Cartesian3(0, -50, 20),
      direction: Cartesian3.UNIT_Y,
      up: Cartesian3.UNIT_Z,
      terrain: false,
      gaussianTargets: [primitive],
    };
    expect(
      () => new SceneGISVideoProjection(configuration),
    ).toThrowDeveloperError();
    scene.primitives.add(primitive);
    for (const threshold of [0, -1, 1.01, NaN]) {
      expect(
        () =>
          new SceneGISVideoProjection({
            ...configuration,
            gaussianAlphaThreshold: threshold,
          }),
      ).toThrowDeveloperError();
    }
    for (let index = 0; index < 5; index++) {
      projection = scene.postProcessStages.add(
        new SceneGISVideoProjection(configuration),
      );
    }
    expect(Object.isFrozen(projection.gaussianTargets)).toBe(true);
    expect(() => scene.renderForSpecs()).toThrowDeveloperError();
    scene.postProcessStages.remove(projection);
    projection = undefined;
    scene.primitives.destroyPrimitives = false;
    scene.primitives.remove(primitive);
    expect(() => scene.renderForSpecs()).toThrowDeveloperError();
    scene.postProcessStages.removeAll();
    scene.primitives.add(primitive);
    scene.primitives.destroyPrimitives = true;
  });

  [false, true].forEach((globe) => {
    it(`projects actual video onto owned ${globe ? "ENU" : "planar"} splats and preserves occlusion / ownership`, async function () {
      scene = createScene({ canvas: createCanvas(96, 96) });
      if (globe) {
        scene.globe = new Globe();
      } else {
        scene._initializeWorld(
          new SceneGISPlanarWorld({
            coordinateSystem: new SceneGISPlanarCoordinateSystem({
              extent: new SceneGISPlanarExtent({
                minimumX: -1000,
                maximumX: 1000,
                minimumY: -1000,
                maximumY: 1000,
              }),
            }),
            maximumLevel: 0,
          }),
        );
      }
      scene.world.show = false;
      scene.environmentEffects.enabled = false;
      scene.postProcessStages.fxaa.enabled = false;
      const transform = globe
        ? Transforms.eastNorthUpToFixedFrame(
            Cartesian3.fromDegrees(118, 32, 500),
          )
        : Matrix4.IDENTITY;
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
      const collection = scene.primitives.add(new PrimitiveCollection());
      primitive = collection.add(
        new SceneGISGaussianSegmentedPrimitive(options(transform)),
      );
      await until(() => primitive.ready);
      const atlas = primitive._controller._pageBackend;
      const blocker = scene.primitives.add(
        new Primitive({
          asynchronous: false,
          show: false,
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
            new Cartesian3(22, 60, 22),
            new Matrix4(),
          ),
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: false,
          }),
        }),
      );
      await video();
      projection = scene.postProcessStages.add(
        new SceneGISVideoProjection({
          scene,
          world: scene.world,
          video: media,
          gaussianTargets: [primitive],
          sources: [blocker],
          terrain: false,
          position: point(22, -65, 22),
          direction: vector(0, 1, 0),
          up: vector(0, 0, 1),
          distance: 500,
          horizontalAngle: Math.PI / 2,
          verticalAngle: Math.PI / 2,
          resolution: 128,
        }),
      );
      await until(() => projection.projectionReady);
      const projected = pixels();
      const uploads = projection.statistics.videoUploads;
      expect(projection.statistics.drawCalls).toBeGreaterThan(0);
      projection.enabled = false;
      const original = pixels();
      expect(projected).not.toEqual(original);
      expect(primitive._controller._pageBackend).toBe(atlas);
      expect(
        primitive._controller._renderResources.statistics.sharedShaderCount,
      ).toBe(3);
      projection.enabled = true;
      await until(() => projection.projectionReady);
      projection.opacity = 0;
      expect(pixels()).toEqual(original);
      projection.opacity = 1;
      expect(pixels()).toEqual(projected);
      expect(projection.statistics.videoUploads).toBeGreaterThanOrEqual(
        uploads,
      );
      const stableUploads = projection.statistics.videoUploads;
      const stable = pixels();
      expect(pixels()).toEqual(stable);
      expect(projection.statistics.videoUploads).toBe(stableUploads);

      const blue = { element: media, stream };
      const red = await video("red");
      const settings = {
        scene,
        world: scene.world,
        gaussianTargets: [primitive],
        terrain: false,
        position: point(22, -65, 22),
        direction: vector(0, 1, 0),
        up: vector(0, 0, 1),
        distance: 500,
        horizontalAngle: Math.PI / 2,
        verticalAngle: Math.PI / 2,
        resolution: 128,
      };
      // Construction order differs from collection order; the last collection stage wins.
      const redProjection = new SceneGISVideoProjection({
        ...settings,
        video: red.element,
      });
      const blueProjection = scene.postProcessStages.add(
        new SceneGISVideoProjection({ ...settings, video: blue.element }),
      );
      scene.postProcessStages.add(redProjection);
      await until(
        () => redProjection.projectionReady && blueProjection.projectionReady,
      );
      const redPixels = pixels();
      redProjection.enabled = false;
      await until(() => projection.projectionReady);
      expect(pixels()).not.toEqual(redPixels);
      scene.postProcessStages.remove(redProjection);
      scene.postProcessStages.remove(blueProjection);
      media = blue.element;
      stream = blue.stream;
      await until(() => projection.projectionReady);
      expect(pixels()).toEqual(projected);

      projection.setView({
        position: point(22, 90, 22),
        direction: vector(0, -1, 0),
        up: vector(0, 0, 1),
      });
      blocker.show = true;
      await until(() => projection.projectionReady);
      const blocked = pixels();
      projection.enabled = false;
      expect(pixels()).toEqual(blocked);
      expect(projection.gaussianTargets[0]).toBe(primitive);
      expect(projection.gaussianAlphaThreshold).toBe(0.3);
      blocker.show = false;
      primitive.modelMatrix = Matrix4.multiplyByTranslation(
        transform,
        new Cartesian3(2, 0, 0),
        new Matrix4(),
      );
      projection.enabled = true;
      await until(() => projection.projectionReady);
      scene.camera.setView({
        destination: point(2000, -65, 22),
        orientation: { direction: vector(0, 1, 0), up: vector(0, 0, 1) },
      });
      await until(() => projection.projectionReady);
      expect(projection.statistics.drawCalls).toBeGreaterThan(0);
      expect(primitive._controller._view.additionalViews.length).toBe(1);
      if (!globe) {
        scene.postProcessStages.remove(projection);
      }
      expect(media.paused).toBe(true);
      expect(stream.getVideoTracks()[0].readyState).toBe("live");
      expect(primitive.isDestroyed()).toBe(false);
      expect(scene.context._gl.getError()).toBe(0);
    });
  });
});
