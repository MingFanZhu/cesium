import {
  BillboardCollection,
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  Event,
  GeometryInstance,
  Matrix4,
  OrthographicFrustum,
  Pass,
  PerInstanceColorAppearance,
  PerspectiveFrustum,
  PointPrimitiveCollection,
  Primitive,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarGroundPrimitive,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarWorld,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISPlanarDepthTest", function () {
  let scene, world;
  const center = new Cartesian2(32, 32);
  const originX = 7000000;

  function render() {
    scene.renderForSpecs();
  }

  function color() {
    return Array.from(
      scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
    );
  }

  async function setup(height) {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.logarithmicDepthBuffer = false;
    scene.postProcessStages.fxaa.enabled = false;
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: originX - 16384,
          maximumX: originX + 16384,
          minimumY: -16384,
          maximumY: 16384,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.LIME,
    });
    scene._initializeWorld(world);
    scene.camera.setView({
      destination: new Cartesian3(originX, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 8,
      aspectRatio: 1,
      near: 0.1,
      far: 40,
    });
    scene.environmentEffects.enabled = false;
    if (height !== undefined) {
      world.terrainProvider = {
        tilingScheme: world.tilingScheme,
        minimumHeight: height,
        maximumHeight: height,
        maximumLevel: 0,
        errorEvent: new Event(),
        getLevelMaximumGeometricError: () => 0,
        getTileDataAvailable: () => true,
        loadTileDataAvailability: () => undefined,
        requestTileGeometry: () =>
          Promise.resolve(
            new SceneGISPlanarHeightmapTerrainData({
              buffer: new Float32Array(4).fill(height),
              width: 2,
              height: 2,
            }),
          ),
      };
    }
    await pollToPromise(() => {
      render();
      return world.tilesLoaded;
    });
  }

  function box(z, value = Color.RED, x = originX, size = 2) {
    return scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(size, size, size / 2),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(x, 0, z)),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(value),
          },
          id: `box-${z}`,
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: value.alpha < 1,
          closed: true,
        }),
      }),
    );
  }

  async function readyPrimitive(primitive) {
    await pollToPromise(() => {
      render();
      return (
        primitive.ready &&
        scene.frameState.commandList.some(
          (command) => command.owner === primitive,
        )
      );
    });
  }

  afterEach(function () {
    scene?.destroyForSpecs();
    scene = world = undefined;
  });

  [undefined, 4].forEach((height) => {
    it(`toggles terrain occlusion, visible picking and object depth over ${height === undefined ? "flat" : "heightmap"} terrain`, async function () {
      await setup(height);
      const below = box((height ?? 0) - 2);
      await readyPrimitive(below);
      expect(color()).toEqualEpsilon([0, 255, 0, 255], 1);
      expect(scene.pick(center)).toBeUndefined();
      expect(scene.pickPosition(center).z).toEqualEpsilon(height ?? 0, 0.01);
      const command = world._surface._renderCommands[0];
      const program = command.shaderProgram;
      const renderer = scene._sceneGISDeferred;
      const material = renderer._raw.getColorTexture();

      world.depthTestAgainstTerrain = false;
      render();
      expect(scene._environmentState.clearGlobeDepth).toBe(true);
      expect(scene._environmentState.useDepthPlane).toBe(false);
      expect(color()).toEqualEpsilon([255, 0, 0, 255], 1);
      expect(scene.pick(center).id).toBe(`box-${(height ?? 0) - 2}`);
      // Native PickDepth still combines terrain and ordinary scene depth.
      expect(scene.pickPosition(center).z).toEqualEpsilon(height ?? 0, 0.01);
      expect(scene.pickPosition(new Cartesian2(8, 32)).z).toEqualEpsilon(
        height ?? 0,
        0.01,
      );
      if (height !== undefined) {
        expect(
          world.getTerrainHeight(new Cartesian3(originX, 0, 0)),
        ).toEqualEpsilon(height, 0.01);
        expect(
          world.pickTerrain(scene.camera.getPickRay(center)).z,
        ).toEqualEpsilon(height, 0.01);
      }

      const front = box((height ?? 0) + 2, Color.BLUE);
      await readyPrimitive(front);
      expect(color()).toEqualEpsilon([0, 0, 255, 255], 1);
      expect(scene.pick(center).primitive).toBe(front);
      front.show = false;
      world.depthTestAgainstTerrain = true;
      render();
      expect(color()).toEqualEpsilon([0, 255, 0, 255], 1);
      expect(scene._environmentState.clearGlobeDepth).toBe(false);
      expect(world._surface._renderCommands[0]).toBe(command);
      expect(command.shaderProgram).toBe(program);
      expect(renderer._raw.getColorTexture()).toBe(material);
      const bytes = renderer.byteLength;
      for (let index = 0; index < 4; index++) {
        world.depthTestAgainstTerrain = index % 2 === 0;
        render();
      }
      expect(renderer.byteLength).toBe(bytes);
      expect(scene.context._gl.getError()).toBe(0);
      scene.destroyForSpecs();
      scene = undefined;
      expect(world.isDestroyed()).toBe(true);
      expect(material.isDestroyed()).toBe(true);
    });
  });

  [false, true].forEach((logarithmic) => {
    it(`keeps below-terrain transparency visible across ${logarithmic ? "logarithmic OIT" : "linear sorted"} frusta`, async function () {
      await setup();
      scene.logarithmicDepthBuffer = logarithmic;
      if (!logarithmic) {
        scene._view.oit._translucentMRTSupport = false;
        scene._view.oit._translucentMultipassSupport = false;
      }
      scene.camera.frustum = new PerspectiveFrustum({
        fov: Math.PI / 3,
        aspectRatio: 1,
        near: 1,
        far: 20000,
      });
      scene.camera.setView({ destination: new Cartesian3(originX, 0, 10000) });
      scene.farToNearRatio = scene.logarithmicDepthFarToNearRatio = 100;
      box(9990, Color.BLUE, originX + 2, 1);
      box(-2000, new Color(1, 0, 0, 0.5), originX, 4000);
      render();
      expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
      expect(color()).toEqualEpsilon([0, 255, 0, 255], 1);
      world.depthTestAgainstTerrain = false;
      render();
      expect(color()[0]).toBeGreaterThan(100);
      expect(color()[1]).toBeLessThan(220);
      expect(scene.pick(center).id).toBe("box--2000");
      world.depthTestAgainstTerrain = true;
      render();
      expect(color()).toEqualEpsilon([0, 255, 0, 255], 1);
      expect(scene.context._gl.getError()).toBe(0);
    });
  });

  ["point", "billboard"].forEach((kind) => {
    it(`applies terrain visibility to native ${kind} anchors`, async function () {
      await setup();
      const collection = scene.primitives.add(
        kind === "point"
          ? new PointPrimitiveCollection()
          : new BillboardCollection(),
      );
      const image = document.createElement("canvas");
      image.width = image.height = 4;
      const context = image.getContext("2d");
      context.fillStyle = "red";
      context.fillRect(0, 0, 4, 4);
      collection.add({
        id: kind,
        position: new Cartesian3(originX, 0, -2),
        color: Color.RED,
        pixelSize: 16,
        image,
        width: 16,
        height: 16,
      });
      await pollToPromise(() => {
        render();
        return (
          (kind === "point" || collection.ready) &&
          scene.frameState.commandList.some(
            (command) => command.owner === collection,
          )
        );
      });
      expect(color()).toEqualEpsilon([0, 255, 0, 255], 1);
      world.depthTestAgainstTerrain = false;
      render();
      expect(color()).toEqualEpsilon([255, 0, 0, 255], 1);
      expect(scene.pick(center).id).toBe(kind);
      if (kind === "billboard") {
        scene.camera.frustum = new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 1,
          far: 40000,
        });
        scene.camera.setView({
          destination: new Cartesian3(originX, 0, 10000),
        });
        scene.logarithmicDepthBuffer = true;
        scene.logarithmicDepthFarToNearRatio = 2;
        collection.get(0).position = new Cartesian3(originX, 0, -15000);
        render();
        expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
        expect(color()).toEqualEpsilon([255, 0, 0, 255], 1);
        expect(scene.pick(center).id).toBe(kind);
      }
      world.depthTestAgainstTerrain = true;
      render();
      expect(color()).toEqualEpsilon([0, 255, 0, 255], 1);
    });
  });

  it("retains terrain classification before the depth clear", async function () {
    await setup();
    const ground = scene.groundPrimitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometry: new SceneGISPlanarPolygonGeometry({
          positions: [
            new Cartesian3(originX - 2, -2, 0),
            new Cartesian3(originX + 2, -2, 0),
            new Cartesian3(originX + 2, 2, 0),
            new Cartesian3(originX - 2, 2, 0),
          ],
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
        },
        id: "ground",
      }),
    );
    await pollToPromise(() => {
      render();
      return (
        ground.ready &&
        scene.frameState.commandList.some(
          (command) => command.pass === Pass.TERRAIN_CLASSIFICATION,
        )
      );
    });
    expect(color()).toEqualEpsilon([0, 0, 255, 255], 1);
    world.depthTestAgainstTerrain = false;
    render();
    expect(color()).toEqualEpsilon([0, 0, 255, 255], 1);
    expect(scene.pick(center).id).toBe("ground");
    expect(scene.pickPosition(center).z).toEqualEpsilon(0, 0.01);
  });
});
