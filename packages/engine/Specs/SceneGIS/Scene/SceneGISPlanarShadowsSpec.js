import {
  Cartesian3,
  Cartesian4,
  ClippingPlane,
  ClippingPlaneCollection,
  Color,
  ColorGeometryInstanceAttribute,
  DirectionalLight,
  EntityCollection,
  JulianDate,
  Matrix4,
  OrthographicFrustum,
  PerspectiveFrustum,
  PerInstanceColorAppearance,
  SceneGISPlanarBoxGeometry,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarPrimitive,
  SceneGISPlanarWorld,
  SceneTransforms,
  Event,
  Model,
  SceneGISPlanarHeightmapTerrainData,
  ShadowMode,
  _SceneGISPlanarSolidVisualizer as SceneGISPlanarSolidVisualizer,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISPlanarShadows", function () {
  let scene;
  let world;
  let box;
  let visualizer;
  let origin;
  function setup(offset = 0, orthographic = false) {
    origin = offset;
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: offset - 128,
          minimumY: offset - 128,
          maximumX: offset + 128,
          maximumY: offset + 128,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.WHITE,
    });
    scene = createScene({ canvas: createCanvas(128, 128), scene3DOnly: true });
    scene._initializeWorld(world);
    scene.camera.setView({
      destination: new Cartesian3(offset + 5, offset, 40),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum = orthographic
      ? new OrthographicFrustum({
          width: 40,
          aspectRatio: 1,
          near: 1,
          far: 200,
        })
      : new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 1,
          far: 200,
        });
    scene.light = new DirectionalLight({ direction: new Cartesian3(1, 0, -1) });
    scene.shadowMap.enabled = true;
    scene.shadowMap.size = 512;
    scene.shadowMap.maximumDistance = 150;
    scene.shadowMap.darkness = 0.2;
    box = scene.primitives.add(
      new SceneGISPlanarPrimitive({
        geometry: new SceneGISPlanarBoxGeometry({
          center: new Cartesian3(offset, offset, 4),
          dimensions: new Cartesian3(4, 4, 8),
        }),
        appearance: new PerInstanceColorAppearance({
          flat: false,
          closed: true,
          translucent: false,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
        },
        shadows: ShadowMode.ENABLED,
        id: "box",
      }),
    );
  }
  function render() {
    scene.renderForSpecs();
  }
  function pixel(x, y, z = 0) {
    const p = SceneTransforms.worldToWindowCoordinates(
      scene,
      new Cartesian3(origin + x, origin + y, z),
    );
    return Array.from(
      scene.context.readPixels({
        x: Math.floor(p.x),
        y: 127 - Math.floor(p.y),
        width: 1,
        height: 1,
      }),
    );
  }
  afterEach(function () {
    visualizer?.destroy();
    visualizer = undefined;
    scene?.destroyForSpecs();
    scene = undefined;
  });

  [false, true].forEach(function (orthographic) {
    it(`casts real primitive shadows on the planar surface (${orthographic ? "orthographic" : "perspective"})`, function () {
      setup(0, orthographic);
      render();
      expect(pixel(6, 0)[0]).toBeLessThan(120);
      expect(pixel(6, 8)[0]).toBeGreaterThan(240);
      expect(scene.shadowMap._passes.length).toBe(4);
      const command = world._surface._renderCommands[0];
      const va = command.vertexArray;
      const texture = scene.shadowMap._shadowMapTexture;
      world.shadows = ShadowMode.DISABLED;
      render();
      expect(pixel(6, 0)[0]).toBeGreaterThan(240);
      world.shadows = ShadowMode.RECEIVE_ONLY;
      box.shadows = ShadowMode.RECEIVE_ONLY;
      render();
      expect(pixel(6, 0)[0]).toBeGreaterThan(240);
      box.shadows = ShadowMode.CAST_ONLY;
      render();
      expect(pixel(6, 0)[0]).toBeLessThan(120);
      scene.shadowMap.softShadows = true;
      render();
      expect(pixel(6, 0)[0]).toBeLessThan(120);
      expect(world._surface._renderCommands[0]).toBe(command);
      expect(command.vertexArray).toBe(va);
      expect(scene.shadowMap._shadowMapTexture).toBe(texture);
      scene.shadowMap.enabled = false;
      render();
      expect(pixel(6, 0)[0]).toBeGreaterThan(240);
      scene.shadowMap.enabled = true;
      render();
      expect(pixel(6, 0)[0]).toBeLessThan(120);
      scene.destroyForSpecs();
      scene = undefined;
      expect(texture.isDestroyed()).toBe(true);
    });
  });

  it("uses fixed +Z visibility at large projected coordinates", function () {
    setup(20000000);
    render();
    expect(scene.shadowMap.outOfView).toBe(false);
    expect(pixel(6, 0)[0]).toBeLessThan(120);
    scene.light.direction = Cartesian3.normalize(
      new Cartesian3(-1, 0, 0.2),
      new Cartesian3(),
    );
    render();
    expect(scene.shadowMap.outOfView).toBe(true);
    expect(pixel(6, 0)[0]).toBeGreaterThan(240);
  });

  it("avoids self-shadow acne on a lit building face with soft cascades", function () {
    setup(0, true);
    scene.shadowMap.softShadows = true;
    render();
    const shadowed = [];
    for (const x of [-1, 0, 1]) {
      for (const y of [-1, 0, 1]) {
        shadowed.push(pixel(x, y, 8)[0]);
      }
    }
    scene.shadowMap.enabled = false;
    render();
    let i = 0;
    for (const x of [-1, 0, 1]) {
      for (const y of [-1, 0, 1]) {
        expect(shadowed[i++]).toEqualEpsilon(pixel(x, y, 8)[0], 3);
      }
    }
  });

  it("casts native glTF model shadows onto terrain", async function () {
    setup();
    box.show = false;
    const model = await Model.fromGltfAsync({
      url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
      modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, 4)),
      scale: 8,
      shadows: ShadowMode.ENABLED,
    });
    scene.primitives.add(model);
    await pollToPromise(() => {
      render();
      return model.ready;
    });
    // Model raises ready after rendering and submits commands on the next frame.
    render();
    expect(pixel(6, 0)[0]).toBeLessThan(120);
    model.shadows = ShadowMode.DISABLED;
    render();
    expect(pixel(6, 0)[0]).toBeGreaterThan(240);
  });

  it("shadows the surface contribution without darkening the revealed background", function () {
    setup();
    scene.backgroundColor = Color.BLUE;
    render();
    const opaque = pixel(6, 0);
    world.opacity = 0;
    render();
    expect(pixel(6, 0)).toEqual([0, 0, 255, 255]);
    world.opacity = 0.5;
    render();
    const half = pixel(6, 0);
    expect(half[0]).toEqualEpsilon(opaque[0] * 0.5, 2);
    expect(half[2]).toEqualEpsilon(opaque[2] * 0.5 + 127.5, 2);
  });

  it("casts heightmap terrain onto primitives and removes clipped terrain from the shadow map", async function () {
    setup(0, true);
    box.show = false;
    world.shadows = ShadowMode.ENABLED;
    world.enableLighting = true;
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 0,
      maximumHeight: 0,
      maximumLevel: 0,
      errorEvent: new Event(),
      getLevelMaximumGeometricError: () => 16,
      requestTileGeometry: () =>
        Promise.resolve(
          new SceneGISPlanarHeightmapTerrainData({
            buffer: new Float32Array(17 * 17),
            width: 17,
            height: 17,
          }),
        ),
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    scene.primitives.add(
      new SceneGISPlanarPrimitive({
        geometry: new SceneGISPlanarBoxGeometry({
          center: new Cartesian3(134, 0, -16.5),
          dimensions: new Cartesian3(24, 24, 1),
        }),
        appearance: new PerInstanceColorAppearance({
          flat: false,
          closed: true,
          translucent: false,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
        },
        shadows: ShadowMode.RECEIVE_ONLY,
        id: "floor",
      }),
    );
    scene.camera.position.x = 134;
    await pollToPromise(() => {
      render();
      return world.tilesLoaded;
    });
    const dark = pixel(134, 0, -16)[0];
    world.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(new Cartesian3(-1, 0, 0), 0)],
    });
    render();
    const lit = pixel(134, 0, -16)[0];
    expect(lit - dark).toBeGreaterThan(60);
    world.clippingPlanes.enabled = false;
    render();
    expect(pixel(134, 0, -16)[0]).toEqualEpsilon(dark, 3);
  });

  it("keeps split distances, cascade scale and world texel grids stable while the camera moves", function () {
    setup(1000000);
    render();
    const shadow = scene.shadowMap;
    const splits = shadow._cascadeSplits.map((split) =>
      Cartesian4.clone(split),
    );
    const widths = shadow._passes.map(
      (pass) => pass.camera.frustum.right - pass.camera.frustum.left,
    );
    const point = new Cartesian3(origin + 6, origin, 0);
    const before = shadow._passes.map((pass) =>
      Matrix4.multiplyByPoint(
        pass.camera.getViewProjection(),
        point,
        new Cartesian3(),
      ),
    );
    scene.camera.moveRight(0.13);
    render();
    shadow._passes.forEach(function (pass, i) {
      const after = Matrix4.multiplyByPoint(
        pass.camera.getViewProjection(),
        point,
        new Cartesian3(),
      );
      const dx = (after.x - before[i].x) * pass.passState.viewport.width;
      const dy = (after.y - before[i].y) * pass.passState.viewport.height;
      expect(dx).toEqualEpsilon(Math.round(dx), 1e-6);
      expect(dy).toEqualEpsilon(Math.round(dy), 1e-6);
      expect(
        pass.camera.frustum.right - pass.camera.frustum.left,
      ).toEqualEpsilon(widths[i], 1e-9);
    });
    scene.camera.lookRight(0.2);
    render();
    shadow._passes.forEach(function (pass, i) {
      expect(
        pass.camera.frustum.right - pass.camera.frustum.left,
      ).toEqualEpsilon(widths[i], 1e-9);
    });
    expect(shadow._cascadeSplits).toEqual(splits);
  });

  it("honors dynamic Entity box shadows without recreating geometry", function () {
    setup();
    box.show = false;
    const entities = new EntityCollection();
    const entity = entities.add({
      position: new Cartesian3(0, 0, 4),
      box: {
        dimensions: new Cartesian3(4, 4, 8),
        material: Color.RED,
        shadows: ShadowMode.ENABLED,
      },
    });
    visualizer = new SceneGISPlanarSolidVisualizer(world, scene, entities);
    const time = JulianDate.now();
    visualizer.update(time);
    render();
    expect(pixel(6, 0)[0]).toBeLessThan(120);
    const primitive = visualizer._items.get(entity.id).owners.box.fillPrimitive;
    const native = primitive._current;
    entity.box.shadows = ShadowMode.DISABLED;
    visualizer.update(time);
    render();
    expect(pixel(6, 0)[0]).toBeGreaterThan(240);
    expect(primitive._current).toBe(native);
    expect(() => {
      world.shadows = 7;
    }).toThrowDeveloperError();
    expect(() => {
      primitive.shadows = true;
    }).toThrowDeveloperError();
  });
});
