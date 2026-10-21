import {
  Cartesian2,
  Cartesian3,
  Color,
  DirectionalLight,
  Event,
  Material,
  MaterialAppearance,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarGroundPrimitive,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarWorld,
  ShowGeometryInstanceAttribute,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISPlanarGroundMaterials", function () {
  let scene, world, materials;
  const origin = 20000000;
  function geometry(x = 0, options = {}) {
    return new SceneGISPlanarPolygonGeometry({
      positions: [
        [-30, -30],
        [30, -30],
        [30, 30],
        [-30, 30],
      ].map(([a, b]) => new Cartesian3(origin + x + a, origin + b, 0)),
      ...options,
    });
  }
  function material(options) {
    const result = new Material(options);
    materials.push(result);
    return result;
  }
  function add(value, instances, extra = {}) {
    return scene.primitives.add(
      new SceneGISPlanarGroundPrimitive({
        world,
        geometryInstances: instances,
        appearance: new MaterialAppearance({
          material: value,
          flat: true,
          ...extra,
        }),
      }),
    );
  }
  function view(pitch = Math.PI / 2, x = 0) {
    const direction = new Cartesian3(0, Math.cos(pitch), -Math.sin(pitch));
    scene.camera.setView({
      destination: new Cartesian3(
        origin + x,
        origin - 80 * Math.cos(pitch),
        80 * Math.sin(pitch),
      ),
      orientation: {
        direction,
        up: new Cartesian3(0, Math.sin(pitch), Math.cos(pitch)),
      },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 1000;
  }
  function pixel() {
    scene.renderForSpecs();
    return Array.from(
      scene.context.readPixels({ x: 64, y: 64, width: 1, height: 1 }),
    );
  }
  function ready() {
    return pollToPromise(() => {
      scene.renderForSpecs();
      return world.tilesLoaded;
    });
  }
  beforeEach(function () {
    materials = [];
    scene = createScene({ canvas: createCanvas(128, 128), scene3DOnly: true });
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: origin - 512,
          minimumY: origin - 512,
          maximumX: origin + 512,
          maximumY: origin + 512,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.BLACK,
    });
    scene._initializeWorld(world);
    scene.environmentEffects.enabled = false;
    scene.gamma = 1;
    scene.light = new DirectionalLight({ direction: new Cartesian3(0, 0, -1) });
    scene.msaaSamples = 1;
    scene.postProcessStages.fxaa.enabled = false;
    view();
  });
  afterEach(function () {
    scene.destroyForSpecs();
    for (const value of materials) {
      value.destroy();
    }
  });
  it("renders image coordinates and keeps footprint picking for transparent pixels", async function () {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 8, 16);
    ctx.fillStyle = "blue";
    ctx.fillRect(8, 0, 8, 16);
    const value = material({
      fabric: { type: Material.ImageType, uniforms: { image: canvas } },
    });
    const primitive = add(value, [{ geometry: geometry(), id: "image" }]);
    await ready();
    await pollToPromise(() => {
      scene.renderForSpecs();
      return Object.values(value._textures).some(
        (t) => t !== scene.context.defaultTexture,
      );
    });
    view(Math.PI / 2, -12);
    expect(pixel()[0]).toBeGreaterThan(200);
    view(Math.PI / 2, 12);
    expect(pixel()[2]).toBeGreaterThan(200);
    const va = primitive._current._va[0];
    value.uniforms.color.alpha = 0;
    expect(pixel().slice(0, 3)).toEqual([0, 0, 0]);
    expect(scene.pick(new Cartesian2(64, 64)).id).toBe("image");
    expect(primitive._current._va[0]).toBe(va);
    scene.primitives.remove(primitive);
    expect(value.isDestroyed()).toBeFalse();
  });
  it("merges disjoint material ranges but preserves overlap order, alpha, show, and picks", async function () {
    const value = material({
      fabric: {
        type: "PlanarGroundUV",
        uniforms: { alpha: 0.5 },
        source:
          "czm_material czm_getMaterial(czm_materialInput materialInput) { czm_material m=czm_getDefaultMaterial(materialInput); m.diffuse=vec3(materialInput.st.x,0.0,1.0-materialInput.st.x); m.alpha=alpha; return m; }",
      },
    });
    const entries = Array.from({ length: 128 }, (_, i) => ({
      geometry: geometry(i * 80),
      id: i,
      attributes: { show: new ShowGeometryInstanceAttribute(true) },
    }));
    const primitive = add(value, entries);
    await ready();
    expect(primitive._currentCommands.colorCommands.length).toBe(1);
    const va = primitive._current._va[0];
    const first = pixel();
    value.uniforms.alpha = 1;
    expect(pixel()[0]).toBeGreaterThan(first[0]);
    expect(primitive._current._va[0]).toBe(va);
    expect(scene.pick(new Cartesian2(64, 64)).id).toBe(0);
    primitive.getGeometryInstanceAttributes(0).show = [0];
    expect(pixel().slice(0, 3)).toEqual([0, 0, 0]);
    scene.primitives.remove(primitive);
    value.uniforms.alpha = 0.5;
    const overlap = [
      { geometry: geometry(-10), id: "first" },
      { geometry: geometry(10), id: "second" },
    ];
    const batch = add(value, overlap);
    const combined = pixel();
    expect(batch._currentCommands.colorCommands.length).toBe(2);
    expect(scene.pick(new Cartesian2(64, 64)).id).toBe("second");
    scene.primitives.remove(batch);
    for (const entry of overlap) {
      add(value, [entry]);
    }
    expect(pixel()).toEqual(combined);
  });
  it("reconstructs lit material frames over sloped terrain at low angles without rebuilding volumes", async function () {
    const value = material({
      fabric: {
        type: Material.CheckerboardType,
        uniforms: { lightColor: Color.WHITE, darkColor: Color.YELLOW },
      },
    });
    const primitive = add(
      value,
      [{ geometry: geometry(0, { stRotation: Math.PI / 3 }), id: "terrain" }],
      { flat: false, materialSupport: MaterialAppearance.MaterialSupport.ALL },
    );
    await ready();
    const va = primitive._current._va[0];
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 0,
      maximumHeight: 10,
      maximumLevel: 0,
      errorEvent: new Event(),
      getLevelMaximumGeometricError: () => 1,
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
      requestTileGeometry: () =>
        Promise.resolve(
          new SceneGISPlanarHeightmapTerrainData({
            buffer: new Float32Array([0, 10, 0, 10]),
            width: 2,
            height: 2,
          }),
        ),
    };
    await ready();
    for (const angle of [60, 30, 10]) {
      view((angle * Math.PI) / 180);
      expect(pixel().some((v, i) => i < 3 && v > 0)).toBeTrue();
      expect(scene.pick(new Cartesian2(64, 64)).id).toBe("terrain");
      expect(primitive._current._va[0]).toBe(va);
    }
    primitive.appearance.material = material({
      fabric: { type: Material.ColorType, uniforms: { color: Color.RED } },
    });
    pixel();
    expect(primitive._current._va[0]).toBe(va);
    const invalid = material({
      fabric: {
        source:
          "czm_material czm_getMaterial(czm_materialInput materialInput) { discard; return czm_getDefaultMaterial(materialInput); }",
      },
    });
    expect(() =>
      add(invalid, [{ geometry: geometry(), id: "discard" }]),
    ).toThrowDeveloperError();
  });
});
