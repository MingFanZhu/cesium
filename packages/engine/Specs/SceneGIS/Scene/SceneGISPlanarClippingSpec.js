import {
  Cartesian2,
  Cartesian3,
  ClippingPlane,
  ClippingPlaneCollection,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
  ContextLimits,
  Event,
  Material,
  Matrix3,
  Matrix4,
  OrthographicFrustum,
  PerspectiveFrustum,
  SceneTransforms,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
  _SceneGISPlanarClipping as SceneGISPlanarClipping,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISPlanarClipping", function () {
  let scene;
  let world;
  let origin;

  function setup(offset = 0, size = 64) {
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
      baseColor: Color.RED,
    });
    scene = createScene({ canvas: createCanvas(size, size) });
    scene._initializeWorld(world);
    scene.backgroundColor = Color.BLUE;
    scene.camera.position = new Cartesian3(offset, offset, 500);
    scene.camera.direction = new Cartesian3(0, 0, -1);
    scene.camera.up = new Cartesian3(0, 1, 0);
    scene.camera.right = new Cartesian3(1, 0, 0);
    scene.camera.frustum = new OrthographicFrustum({
      width: 256,
      aspectRatio: 1,
      near: 1,
      far: 1000,
    });
  }

  function position(x, y, z = 0) {
    return new Cartesian3(origin + x, origin + y, z);
  }

  function polygon(points) {
    return new ClippingPolygon({
      positions: points.map(([x, y]) => position(x, y)),
    });
  }

  function pixel(x, y) {
    const p = SceneTransforms.worldToWindowCoordinates(scene, position(x, y));
    return Array.from(
      scene.context.readPixels({
        x: Math.floor(p.x),
        y: 63 - Math.floor(p.y),
        width: 1,
        height: 1,
      }),
    );
  }

  function expectVisible(x, y, visible) {
    expect(pixel(x, y))
      .withContext(`at ${x}/${y}`)
      .toEqual(visible ? [255, 0, 0, 255] : [0, 0, 255, 255]);
  }

  afterEach(function () {
    if (scene && !scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
    scene = undefined;
    world = undefined;
  });

  it("uses the native collection API with atomic exclusive ownership and no default resources", function () {
    setup();
    scene.renderForSpecs();
    expect(world.clippingPlanes).toBeUndefined();
    expect(world.clippingPolygons).toBeUndefined();
    expect(world._surface._clipping).toBeUndefined();
    const first = new ClippingPlaneCollection();
    world.clippingPlanes = first;
    expect(world.clippingPlanes).toBe(first);
    world.clippingPlanes = first;
    expect(first.isDestroyed()).toBe(false);
    const occupied = new ClippingPlaneCollection();
    occupied._owner = {};
    expect(() => {
      world.clippingPlanes = occupied;
    }).toThrowDeveloperError();
    expect(world.clippingPlanes).toBe(first);
    expect(first.isDestroyed()).toBe(false);
    occupied.destroy();
    const polygons = new ClippingPolygonCollection();
    world.clippingPolygons = polygons;
    expect(() => {
      world.clippingPolygons = {};
    }).toThrowDeveloperError();
    expect(world.clippingPolygons).toBe(polygons);
    world.clippingPlanes = undefined;
    expect(first.isDestroyed()).toBe(true);
    scene.destroyForSpecs();
    expect(polygons.isDestroyed()).toBe(true);
  });

  it("renders Cesium plane intersection and union semantics without recompiling on edits", function () {
    setup();
    const planes = new ClippingPlaneCollection({
      planes: [
        new ClippingPlane(Cartesian3.UNIT_X, 0),
        new ClippingPlane(Cartesian3.UNIT_Y, 0),
      ],
    });
    world.clippingPlanes = planes;
    scene.renderForSpecs();
    expectVisible(-64, -64, false);
    expectVisible(-64, 64, true);
    expectVisible(64, -64, true);
    expectVisible(64, 64, true);
    const shader = world._surface._shaderProgram;
    planes.unionClippingRegions = true;
    scene.renderForSpecs();
    expectVisible(-64, 64, false);
    expectVisible(64, -64, false);
    expectVisible(64, 64, true);
    expect(world._surface._shaderProgram).toBe(shader);
    planes.remove(planes.get(1));
    planes.get(0).distance = 100;
    scene.renderForSpecs();
    expectVisible(-64, 64, true);
    expect(world._surface._shaderProgram).toBe(shader);
    planes.enabled = false;
    scene.renderForSpecs();
    expectVisible(-64, -64, true);
  });

  it("discards a terrain skirt coplanar with a clipping plane without fragment speckles", async function () {
    setup(0, 256);
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -64,
      maximumHeight: 0,
      maximumLevel: 0,
      errorEvent: new Event(),
      getLevelMaximumGeometricError: () => 16,
      requestTileGeometry: () =>
        Promise.resolve(
          new SceneGISPlanarHeightmapTerrainData({
            buffer: new Float32Array(65 * 65),
            width: 65,
            height: 65,
          }),
        ),
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    world.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_X, 128)],
      edgeColor: Color.YELLOW,
      edgeWidth: 2,
    });
    // Rebase to a non-zero polygon anchor, as in the combined clipping example.
    world.clippingPolygons = new ClippingPolygonCollection({
      polygons: [
        polygon([
          [70, 50],
          [80, 50],
          [80, 60],
          [70, 60],
        ]),
      ],
    });
    scene.camera.frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
      near: 1,
      far: 2000,
    });
    const direction = Cartesian3.normalize(
      new Cartesian3(132, 200, -132),
      new Cartesian3(),
    );
    const right = Cartesian3.normalize(
      Cartesian3.cross(direction, Cartesian3.UNIT_Z, new Cartesian3()),
      new Cartesian3(),
    );
    scene.camera.setView({
      destination: new Cartesian3(-260, -200, 100),
      orientation: {
        direction,
        up: Cartesian3.cross(right, direction, new Cartesian3()),
      },
    });
    await pollToPromise(() => {
      scene.renderForSpecs();
      return world.tilesLoaded;
    });
    const p = SceneTransforms.worldToWindowCoordinates(
      scene,
      new Cartesian3(-128, 0, -32),
    );
    const pixels = scene.context.readPixels({
      x: Math.floor(p.x) - 6,
      y: 255 - Math.floor(p.y) - 6,
      width: 13,
      height: 13,
    });
    let residualFragments = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 255) {
        ++residualFragments;
      }
    }
    expect(residualFragments).toBe(0);
    expect(scene.pickPosition(p)).toBeUndefined();
    expect(
      world._surface._clipping.isClipped(new Cartesian3(-128, 0, -32)),
    ).toBe(true);
    expect(
      world._surface._clipping.isClipped(new Cartesian3(-127.99, 0, -32)),
    ).toBe(false);
    world.clippingPlanes.enabled = false;
    scene.renderForSpecs();
    const uncut = scene.context.readPixels({
      x: Math.floor(p.x),
      y: 255 - Math.floor(p.y),
      width: 1,
      height: 1,
    });
    expect(Array.from(uncut)).toEqual([255, 0, 0, 255]);
  });

  it("applies modelMatrix rotation and translation in planar metres", function () {
    setup(1.0e9);
    world.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_X, 0)],
      modelMatrix: Matrix4.fromRotationTranslation(
        Matrix3.fromRotationZ(Math.PI / 2),
        position(0, 24),
      ),
    });
    scene.renderForSpecs();
    expectVisible(64, -64, false);
    expectVisible(-64, 64, true);
    const clipping = world._surface._clipping;
    expect(clipping.isClipped(position(64, -64))).toBe(true);
    expect(clipping.isClipped(position(-64, 64))).toBe(false);
  });

  it("clips concave XY polygons, unions multiple regions, and inverts them using the native API", function () {
    setup(1.0e9);
    const lShape = polygon([
      [-96, -96],
      [96, -96],
      [96, -32],
      [-32, -32],
      [-32, 96],
      [-96, 96],
    ]);
    const regions = new ClippingPolygonCollection({ polygons: [lShape] });
    world.clippingPolygons = regions;
    scene.renderForSpecs();
    expectVisible(-64, 64, false);
    expectVisible(64, -64, false);
    expectVisible(64, 64, true);
    regions.add(
      polygon([
        [32, 32],
        [32, 96],
        [96, 96],
        [96, 32],
      ]),
    );
    scene.renderForSpecs();
    expectVisible(64, 64, false);
    regions.inverse = true;
    scene.renderForSpecs();
    expectVisible(-64, 64, true);
    expectVisible(64, 64, true);
    expectVisible(0, 64, false);
    regions.removeAll();
    scene.renderForSpecs();
    expectVisible(0, 64, true);
  });

  it("publishes mutable native polygon positions only during normal renders", function () {
    setup();
    const region = polygon([
      [-96, -96],
      [-32, -96],
      [-32, 96],
      [-96, 96],
    ]);
    world.clippingPolygons = new ClippingPolygonCollection({
      polygons: [region],
    });
    scene.renderForSpecs();
    const clipping = world._surface._clipping;
    expect(clipping.isClipped(position(-64, 0))).toBe(true);
    for (const p of region.positions) {
      p.x += 128;
    }
    expect(clipping.isClipped(position(-64, 0))).toBe(true);
    expect(clipping.isClipped(position(64, 0))).toBe(false);
    const before = { ...clipping._debug };
    scene.pick(new Cartesian2(16, 32));
    expect(clipping._debug).toEqual(before);
    expect(clipping.isClipped(position(-64, 0))).toBe(true);
    scene.renderForSpecs();
    expectVisible(-64, 0, true);
    expectVisible(64, 0, false);
    expect(clipping.isClipped(position(64, 0))).toBe(true);
  });

  it("removes clipped depth in linear and logarithmic rendering and composes both collections", function () {
    setup();
    world.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_X, 0)],
    });
    world.clippingPolygons = new ClippingPolygonCollection({
      polygons: [
        polygon([
          [32, 32],
          [96, 32],
          [96, 96],
          [32, 96],
        ]),
      ],
    });
    for (const logarithmicDepthBuffer of [false, true]) {
      scene.logarithmicDepthBuffer = logarithmicDepthBuffer;
      scene.renderForSpecs();
      expectVisible(-64, 0, false);
      expectVisible(64, 64, false);
      expectVisible(64, -64, true);
      if (scene.pickPositionSupported) {
        expect(scene.pickPosition(new Cartesian2(16, 32))).toBeUndefined();
        expect(scene.pickPosition(new Cartesian2(48, 16))).toBeUndefined();
        expect(scene.pickPosition(new Cartesian2(48, 48)).z).toBeCloseTo(0, 2);
      }
    }
  });

  it("renders edge style with lighting, material and surface opacity", function () {
    setup();
    world.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_X, 0)],
      edgeColor: Color.LIME,
      edgeWidth: 4,
    });
    const material = Material.fromType("Color", { color: Color.RED });
    world.material = material;
    scene.renderForSpecs();
    expect(pixel(6, 0)).toEqual([0, 255, 0, 255]);
    world.enableLighting = true;
    world.opacity = 0.5;
    scene.renderForSpecs();
    expect(pixel(-64, 0)).toEqual([0, 0, 255, 255]);
    const edge = pixel(6, 0);
    expect(edge[1]).toBeGreaterThan(100);
    expect(edge[2]).toBeGreaterThan(100);
    world.material = undefined;
    material.destroy();
  });

  it("keeps GPU resources and uploads stable, then destroys the retained clipping texture", function () {
    setup();
    world.clippingPolygons = new ClippingPolygonCollection({
      polygons: [
        polygon([
          [-48, -48],
          [48, -48],
          [48, 48],
          [-48, 48],
        ]),
      ],
    });
    scene.renderForSpecs();
    const surface = world._surface;
    const clipping = surface._clipping;
    const before = { ...surface._debug };
    const clipBefore = { ...clipping._debug };
    const shader = surface._shaderProgram;
    for (let i = 0; i < 12; ++i) {
      scene.renderForSpecs();
    }
    expect(clipping._debug).toEqual(clipBefore);
    expect(surface._debug.createdShaders).toBe(before.createdShaders);
    expect(surface._debug.createdVertexArrays).toBe(before.createdVertexArrays);
    expect(surface._debug.createdCommands).toBe(before.createdCommands);
    world.clippingPolygons.add(
      polygon([
        [64, 64],
        [96, 64],
        [96, 96],
        [64, 96],
      ]),
    );
    scene.renderForSpecs();
    expect(surface._shaderProgram).toBe(shader);
    const texture = clipping.texture;
    scene.destroyForSpecs();
    expect(texture.isDestroyed()).toBe(true);
    expect(clipping._debug.destroyedTextures).toBe(
      clipping._debug.createdTextures,
    );
  });

  it("rejects invalid candidates while preserving the published clipping texture and queries", function () {
    setup();
    const region = polygon([
      [-48, -48],
      [48, -48],
      [48, 48],
      [-48, 48],
    ]);
    world.clippingPolygons = new ClippingPolygonCollection({
      polygons: [region],
    });
    scene.renderForSpecs();
    const clipping = world._surface._clipping;
    const before = { ...clipping._debug };
    region.positions[1].x = Number.NaN;
    expect(() => scene.renderForSpecs()).toThrowDeveloperError();
    expect(clipping._debug).toEqual(before);
    expect(clipping.isClipped(position(0, 0))).toBe(true);
    region.positions[1].x = 48;
    const swap = region.positions[1];
    region.positions[1] = region.positions[2];
    region.positions[2] = swap;
    expect(() => scene.renderForSpecs()).toThrowDeveloperError();
    expect(clipping._debug).toEqual(before);
    region.positions[2] = region.positions[1];
    region.positions[1] = swap;
    world.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_X, 0)],
      modelMatrix: Matrix4.fromScale(new Cartesian3(0, 0, 0)),
    });
    expect(() => scene.renderForSpecs()).toThrowDeveloperError();
    expect(clipping._debug).toEqual(before);
  });

  it("fails explicitly on unsupported contexts without allocating a texture", function () {
    const clipping = new SceneGISPlanarClipping({
      minimumX: -1,
      minimumY: -1,
      width: 2,
      height: 2,
    });
    const planes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_X, 0)],
    });
    expect(() =>
      clipping.update({ webgl2: false }, planes),
    ).toThrowDeveloperError();
    expect(clipping.texture).toBeUndefined();
    planes.destroy();
    clipping.destroy();
  });

  it("accounts for the clipping sampler before allocating surface resources", function () {
    setup();
    world.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_X, 0)],
    });
    const limit = ContextLimits._maximumTextureImageUnits;
    try {
      ContextLimits._maximumTextureImageUnits = 0;
      expect(() => scene.renderForSpecs()).toThrowDeveloperError();
      expect(world._surface._clipping).toBeUndefined();
      expect(world._surface._debug.createdVertexArrays).toBe(0);
    } finally {
      ContextLimits._maximumTextureImageUnits = limit;
    }
  });

  it("preserves small polygon details far from the World origin", function () {
    setup();
    const clipping = new SceneGISPlanarClipping({
      minimumX: -1.0e9,
      minimumY: -1.0e9,
      width: 2.0e9,
      height: 2.0e9,
    });
    const base = 1.0e8;
    const polygons = new ClippingPolygonCollection({
      polygons: [
        new ClippingPolygon({
          positions: [
            new Cartesian3(base, base, 0),
            new Cartesian3(base + 0.125, base, 0),
            new Cartesian3(base + 0.125, base + 0.125, 0),
            new Cartesian3(base, base + 0.125, 0),
          ],
        }),
      ],
    });
    clipping.update(scene.context, undefined, polygons);
    expect(
      clipping.isClipped(new Cartesian3(base + 0.0625, base + 0.0625, 0)),
    ).toBe(true);
    expect(
      clipping.isClipped(new Cartesian3(base - 0.0625, base + 0.0625, 0)),
    ).toBe(false);
    polygons.destroy();
    clipping.destroy();
  });
});
