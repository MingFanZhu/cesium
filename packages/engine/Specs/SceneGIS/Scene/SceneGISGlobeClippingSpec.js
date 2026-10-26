import {
  Cartesian3,
  Cartesian2,
  Math as CesiumMath,
  CustomHeightmapTerrainProvider,
  Framebuffer,
  GeographicTilingScheme,
  OrthographicFrustum,
  PixelDatatype,
  PixelFormat,
  SceneTransforms,
  Texture,
  BoundingSphere,
  ClippingPlane,
  ClippingPlaneCollection,
  ClippingPolygon,
  ClippingPolygonCollection,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryInstance,
  Globe,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive,
  PrimitiveType,
  Transforms,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";
import globeClipping from "../../../Source/Shaders/SceneGIS/SceneGISGlobeClipping.js";

describe("SceneGIS/Scene/SceneGISGlobeClipping", function () {
  let scene;
  let frame;
  const size = 256;
  const corners = [
    [-40, -110],
    [40, -110],
    [40, 110],
    [-40, 110],
  ];

  function point(x, y, z = 0) {
    return Matrix4.multiplyByPoint(
      frame,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }

  function look(position, target) {
    const destination = point(...position);
    const direction = Cartesian3.normalize(
      Cartesian3.subtract(point(...target), destination, new Cartesian3()),
      new Cartesian3(),
    );
    const vertical = Matrix4.multiplyByPointAsVector(
      frame,
      Cartesian3.UNIT_Z,
      new Cartesian3(),
    );
    const right = Cartesian3.normalize(
      Cartesian3.cross(direction, vertical, new Cartesian3()),
      new Cartesian3(),
    );
    const up = Cartesian3.cross(right, direction, new Cartesian3());
    scene.camera.setView({ destination, orientation: { direction, up } });
  }

  function polygons(points = [corners], inverse = false) {
    return new ClippingPolygonCollection({
      inverse,
      polygons: points.map(
        (ring) =>
          new ClippingPolygon({ positions: ring.map(([x, y]) => point(x, y)) }),
      ),
    });
  }

  function planes() {
    return new ClippingPlaneCollection({
      modelMatrix: frame,
      planes: [
        new ClippingPlane(Cartesian3.UNIT_X, -40),
        new ClippingPlane(
          Cartesian3.negate(Cartesian3.UNIT_X, new Cartesian3()),
          -40,
        ),
        new ClippingPlane(Cartesian3.UNIT_Y, -110),
        new ClippingPlane(
          Cartesian3.negate(Cartesian3.UNIT_Y, new Cartesian3()),
          -110,
        ),
      ],
    });
  }

  async function renderLoaded() {
    await pollToPromise(
      () => {
        scene.renderForSpecs();
        return (
          scene.globe.tilesLoaded &&
          scene.globe._surface._tilesToRender.length > 0
        );
      },
      { timeout: 30000 },
    );
    return scene.context.readPixels();
  }

  function edge(pixels, row) {
    for (let x = 0; x < size; x++) {
      const i = (row * size + x) * 4;
      if (pixels[i + 1] > 200 && pixels[i] < 80 && pixels[i + 2] < 80) {
        return x;
      }
    }
    return size;
  }

  function overhead(x, y, width) {
    scene.camera.setView({
      destination: point(x, y, 500),
      orientation: {
        direction: Matrix4.multiplyByPointAsVector(
          frame,
          new Cartesian3(0, 0, -1),
          new Cartesian3(),
        ),
        up: Matrix4.multiplyByPointAsVector(
          frame,
          Cartesian3.UNIT_Y,
          new Cartesian3(),
        ),
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width,
      aspectRatio: 1,
      near: 1,
      far: 2000,
    });
  }

  function expectTerrain(x, y, visible, height = 0) {
    const windowPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      point(x, y, height),
    );
    const pixels = scene.context.readPixels({
      x: Math.floor(windowPosition.x),
      y: size - 1 - Math.floor(windowPosition.y),
      width: 1,
      height: 1,
    });
    expect(pixels[1] > 200 && pixels[0] < 80 && pixels[2] < 80)
      .withContext(`terrain at ${x}, ${y}`)
      .toBe(visible);
  }

  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(size, size) });
    scene.globe = new Globe();
    scene.environmentEffects.enabled = false;
    scene.globe.baseColor = Color.LIME;
    scene.globe.showGroundAtmosphere = false;
    scene.globe.depthTestAgainstTerrain = true;
    scene.backgroundColor = Color.BLUE;
    scene.fog.enabled = false;
    scene.screenSpaceCameraController.enableCollisionDetection = false;
    frame = Transforms.eastNorthUpToFixedFrame(
      Cartesian3.fromDegrees(118.78, 32.04),
    );
    look([38, -5, 5], [40, 20, -2]);
    const positions = [];
    const indices = [];
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      const offset = positions.length / 3;
      positions.push(...a, 0, ...b, 0, ...b, -30, ...a, -30);
      indices.push(
        offset,
        offset + 1,
        offset + 2,
        offset,
        offset + 2,
        offset + 3,
      );
    }
    scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          modelMatrix: frame,
          geometry: new Geometry({
            attributes: {
              position: new GeometryAttribute({
                componentDatatype: ComponentDatatype.DOUBLE,
                componentsPerAttribute: 3,
                values: new Float64Array(positions),
              }),
            },
            indices: new Uint16Array(indices),
            primitiveType: PrimitiveType.TRIANGLES,
            boundingSphere: BoundingSphere.fromVertices(positions),
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
          closed: false,
        }),
      }),
    );
  });

  afterEach(function () {
    scene.destroyForSpecs();
  });

  it("matches an ENU wall boundary with skirts enabled across camera and terrain LOD changes", async function () {
    const polygonCollection = polygons();
    scene.globe.clippingPolygons = polygonCollection;
    const textureReferences = [];
    const maximumLevels = [];
    for (const [position, target, error] of [
      [[38, -5, 5], [40, 20, -2], 2],
      [[37, 8, 6], [40, 35, -2], 8],
    ]) {
      look(position, target);
      scene.globe.maximumScreenSpaceError = error;
      scene.globe.showSkirts = true;
      polygonCollection.enabled = true;
      if (scene.globe.clippingPlanes) {
        scene.globe.clippingPlanes.enabled = false;
      }
      const actual = await renderLoaded();
      maximumLevels.push(
        Math.max(
          ...scene.globe._surface._tilesToRender.map((tile) => tile.level),
        ),
      );
      textureReferences.push(polygonCollection.clippingTexture);
      polygonCollection.enabled = false;
      scene.globe.clippingPlanes = planes();
      scene.globe.showSkirts = false;
      const reference = await renderLoaded();
      let compared = 0;
      let maximumError = 0;
      for (let row = 8; row < size - 8; row++) {
        const expected = edge(reference, row);
        if (expected > 4 && expected < size - 4) {
          maximumError = Math.max(
            maximumError,
            Math.abs(edge(actual, row) - expected),
          );
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(100);
      expect(maximumError)
        .withContext(`camera ${position}, SSE ${error}`)
        .toBeLessThanOrEqual(2);
    }
    expect(textureReferences[0]).toBe(textureReferences[1]);
    expect(maximumLevels[0]).not.toBe(maximumLevels[1]);
    scene.globe.clippingPolygons = undefined;
    expect(polygonCollection.isDestroyed()).toBe(true);
    expect(textureReferences[0].isDestroyed()).toBe(true);
  });

  it("retains angular low components through the GPU compiler", function () {
    const context = scene.context;
    const texture = new Texture({
      context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
    });
    const framebuffer = new Framebuffer({ context, colorTextures: [texture] });
    const position = point(40, 20);
    const high = new Cartesian3(
      Math.fround(position.x),
      Math.fround(position.y),
      Math.fround(position.z),
    );
    const low = Cartesian3.subtract(position, high, new Cartesian3());
    const command = context.createViewportQuadCommand(
      `#define CLIPPING_POLYGON_REGIONS_LENGTH 1\n${globeClipping}
      uniform vec3 high; uniform vec3 low;
      void main() {
        vec2 x = vec2(high.x, low.x);
        vec2 y = vec2(high.y, low.y);
        vec2 z = vec2(high.z, low.z);
        vec2 xy = sceneGISClipSqrt(sceneGISClipSum(sceneGISClipProduct(x,x), sceneGISClipProduct(y,y)));
        out_FragColor = vec4(sceneGISClipAtan(xy,z),sceneGISClipAtan(x,y));
      }`,
      {
        framebuffer,
        uniformMap: {
          high: () => high,
          low: () => low,
          u_sceneGISClippingRound: () => 1,
        },
      },
    );
    try {
      command.execute(context);
      const result = context.readPixels({ framebuffer, width: 1, height: 1 });
      const latitude = CesiumMath.fastApproximateAtan2(
        Math.hypot(position.x, position.y),
        position.z,
      );
      const longitude = CesiumMath.fastApproximateAtan2(position.x, position.y);
      expect(Math.abs(result[0] + result[1] - latitude) * 6378137).toBeLessThan(
        0.001,
      );
      expect(
        Math.abs(result[2] + result[3] - longitude) * 6378137,
      ).toBeLessThan(0.001);
    } finally {
      command.shaderProgram.destroy();
      framebuffer.destroy();
    }
  });

  it("preserves concave polygons, independent spherical regions and inverse clipping", async function () {
    scene.primitives.removeAll();
    const concave = [
      [-80, -80],
      [80, -80],
      [80, 0],
      [0, 0],
      [0, 80],
      [-80, 80],
    ];
    const remote = corners.map(([x, y]) => [x + 2000, y]);
    const collection = polygons([concave, remote]);
    scene.globe.clippingPolygons = collection;
    overhead(0, 0, 240);
    await renderLoaded();
    expect(collection.extentsCount).toBe(2);
    expectTerrain(-40, 40, false);
    expectTerrain(40, 40, true);
    expectTerrain(40, -40, false);
    collection.inverse = true;
    await renderLoaded();
    expectTerrain(-40, 40, true);
    expectTerrain(40, 40, false);
    overhead(2000, 0, 240);
    await renderLoaded();
    expectTerrain(2000, 0, true);
    expectTerrain(2060, 0, false);
  });

  it("clips non-flat ellipsoidal terrain within ten centimeters without changing its height", async function () {
    scene.primitives.removeAll();
    const tilingScheme = new GeographicTilingScheme();
    const latitude = CesiumMath.toRadians(32.04);
    scene.terrainProvider = new CustomHeightmapTerrainProvider({
      width: 16,
      height: 16,
      tilingScheme,
      callback(x, y, level) {
        const rectangle = tilingScheme.tileXYToRectangle(x, y, level);
        const data = new Float32Array(16 * 16);
        for (let row = 0; row < 16; row++) {
          const lat =
            rectangle.north + ((rectangle.south - rectangle.north) * row) / 15;
          const height =
            20 + Math.max(-10, Math.min(10, 50000 * (lat - latitude)));
          data.fill(height, row * 16, (row + 1) * 16);
        }
        return data;
      },
    });
    scene.globe.clippingPolygons = polygons();
    overhead(40, 0, 4);
    await renderLoaded();
    expectTerrain(39.9, 0, false, 20);
    expectTerrain(40.1, 0, true, 20);
    const hit = scene.pickPosition(new Cartesian2(192, 128));
    const local = Matrix4.multiplyByPoint(
      Matrix4.inverseTransformation(frame, new Matrix4()),
      hit,
      new Cartesian3(),
    );
    expect(local.z).toBeGreaterThan(19.9);
    expect(local.z).toBeLessThan(20.1);
  });
});
