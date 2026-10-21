import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  Material,
  PolylineColorAppearance,
  PolylineMaterialAppearance,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISPlanarPrimitive,
  SceneGISPlanarGroundPrimitive,
  SceneGISPlanarPolylineGeometry,
  ShowGeometryInstanceAttribute,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISPlanarPolylineMaterials", function () {
  let scene, world, materials;
  const origin = 20000000;
  function geometry(
    points = [
      [-30, 0],
      [-10, 0],
      [30, 0],
    ],
  ) {
    return new SceneGISPlanarPolylineGeometry({
      positions: points.map(
        ([x, y]) => new Cartesian3(origin + x, origin + y, 2),
      ),
      width: 16,
    });
  }
  function material(options) {
    const value = new Material(options);
    materials.push(value);
    return value;
  }
  function flow() {
    return material({
      fabric: {
        type: "PlanarPolylineUVSpec",
        uniforms: { color: Color.WHITE.clone(), seconds: 0 },
        source: `czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material m = czm_getDefaultMaterial(materialInput);
          m.diffuse = vec3(fract(materialInput.st.s + seconds * 0.25), materialInput.st.t, 0.0) * color.rgb;
          m.alpha = color.a;
          return m;
        }`,
      },
      translucent: (m) => m.uniforms.color.alpha < 1,
    });
  }
  function view(x = 0, y = 0, height = 80) {
    scene.camera.setView({
      destination: new Cartesian3(origin + x, origin + y, height),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 1000;
  }
  function pixel(x = 64, y = 64) {
    scene.renderForSpecs();
    return Array.from(scene.context.readPixels({ x, y, width: 1, height: 1 }));
  }
  function pick(x = 64, y = 64) {
    return scene.pick(new Cartesian2(x, y), 1, 1)?.id;
  }
  beforeEach(async function () {
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
    scene.msaaSamples = 1;
    scene.postProcessStages.fxaa.enabled = false;
    view();
    await pollToPromise(() => {
      scene.renderForSpecs();
      return world.tilesLoaded;
    });
  });
  afterEach(function () {
    scene.destroyForSpecs();
    for (const value of materials) {
      value.destroy();
    }
  });
  [false, true].forEach(function (ground) {
    const name = ground ? "ground" : "ordinary";
    function add(
      value,
      entries = [
        {
          geometry: geometry(),
          id: "line",
          attributes: { show: new ShowGeometryInstanceAttribute(true) },
        },
      ],
    ) {
      return scene.primitives.add(
        new (ground ? SceneGISPlanarGroundPrimitive : SceneGISPlanarPrimitive)({
          ...(ground ? { world } : {}),
          geometryInstances: entries,
          appearance:
            value instanceof PolylineColorAppearance
              ? value
              : new PolylineMaterialAppearance({ material: value }),
        }),
      );
    }
    it(`${name}: evaluates metric st, seconds and alpha without rebuilding geometry`, function () {
      const value = flow();
      const primitive = add(value);
      const initial = pixel();
      expect(initial[0]).toBeGreaterThan(120);
      expect(initial[0]).toBeLessThan(140);
      expect(initial[1]).toBeGreaterThan(120);
      expect(initial[1]).toBeLessThan(145);
      expect(pixel(64, 69)[1]).toBeGreaterThan(initial[1]);
      const va = primitive._current._va[0];
      const program = primitive._current._sp;
      value.uniforms.seconds = 1;
      expect(pixel()[0]).toBeGreaterThan(initial[0] + 50);
      expect(primitive._current._sp).toBe(program);
      value.uniforms.seconds = 0;
      value.uniforms.color.alpha = 0.5;
      const translucent = pixel();
      expect(Math.abs(translucent[0] - initial[0] / 2)).toBeLessThanOrEqual(1);
      value.uniforms.color = Color.WHITE.clone();
      expect(pixel()).toEqual(initial);
      expect(primitive._current._va[0]).toBe(va);
      expect(pick()).toBe("line");
      value.uniforms.color.alpha = 0;
      expect(pixel().slice(0, 3)).toEqual([0, 0, 0]);
      expect(pick()).not.toBe("line");
      value.uniforms.color.alpha = 1;
      primitive.getGeometryInstanceAttributes("line").show = [0];
      expect(pixel().slice(0, 3)).toEqual([0, 0, 0]);
      primitive.getGeometryInstanceAttributes("line").show = [1];
      expect(pixel()).toEqual(initial);
      view(0, 0, 160);
      expect(pixel(64, 70)[1]).toBeGreaterThan(0);
      expect(pixel(64, 74).slice(0, 3)).toEqual([0, 0, 0]);
      scene.primitives.remove(primitive);
      expect(value.isDestroyed()).toBeFalse();
    });
    it(`${name}: switches native Arrow and Dash including material coverage picking`, function () {
      const arrow = material({
        fabric: {
          type: Material.PolylineArrowType,
          uniforms: { color: Color.RED },
        },
      });
      const primitive = add(arrow);
      expect(pixel()[0]).toBeGreaterThan(200);
      expect(pick()).toBe("line");
      expect(pixel(64, 70)[0]).toBe(0);
      expect(pick(64, 58)).not.toBe("line");
      const va = primitive._current._va[0];
      const dash = material({
        fabric: {
          type: Material.PolylineDashType,
          uniforms: {
            color: Color.BLUE,
            gapColor: Color.TRANSPARENT,
            dashLength: 16,
            dashPattern: 255,
          },
        },
      });
      primitive.appearance.material = dash;
      pixel();
      let filled = 0,
        empty = 0;
      for (let x = 40; x < 88; x++) {
        const sample = pixel(x);
        if (sample[2] > 200) {
          filled++;
          expect(pick(x)).toBe("line");
        } else {
          empty++;
          expect(pick(x)).not.toBe("line");
        }
      }
      expect(filled).toBeGreaterThan(12);
      expect(empty).toBeGreaterThan(12);
      primitive.appearance.material = arrow;
      expect(pixel()[0]).toBeGreaterThan(200);
      expect(primitive._current._va[0]).toBe(va);
    });
    it(`${name}: preserves independent batch colors, show and picks`, function () {
      const primitive = add(
        new PolylineColorAppearance({ translucent: false }),
        [
          {
            geometry: geometry(),
            id: "first",
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
              show: new ShowGeometryInstanceAttribute(true),
            },
          },
          {
            geometry: geometry([
              [-30, 24],
              [30, 24],
            ]),
            id: "second",
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
              show: new ShowGeometryInstanceAttribute(true),
            },
          },
        ],
      );
      expect(pixel()[0]).toBeGreaterThan(200);
      expect(pick()).toBe("first");
      const va = primitive._current._va[0];
      primitive.getGeometryInstanceAttributes("first").color =
        ColorGeometryInstanceAttribute.toValue(Color.GREEN);
      expect(pixel()[1]).toBeGreaterThan(100);
      primitive.getGeometryInstanceAttributes("first").show = [0];
      expect(pixel().slice(0, 3)).toEqual([0, 0, 0]);
      view(0, 24);
      expect(pixel()[2]).toBeGreaterThan(200);
      expect(pick()).toBe("second");
      expect(primitive._current._va[0]).toBe(va);
    });
    it(`${name}: batches shared Fabric with independent UV origins and identifiers`, function () {
      const value = flow();
      const primitive = add(
        value,
        Array.from({ length: 128 }, (_, i) => ({
          geometry: geometry([
            [-30, i * 24],
            [-10, i * 24],
            [30, i * 24],
          ]),
          id: i,
          attributes: { show: new ShowGeometryInstanceAttribute(true) },
        })),
      );
      const first = pixel();
      expect(pick()).toBe(0);
      const current = primitive._current;
      expect(current._va.length).toBe(1);
      if (ground) {
        expect(primitive._currentCommands.colorCommands.length).toBe(1);
      }
      view(0, 24);
      expect(pixel()).toEqual(first);
      expect(pick()).toBe(1);
      value.uniforms.seconds = 1;
      expect(pixel()[0]).toBeGreaterThan(first[0] + 50);
      expect(primitive._current).toBe(current);
    });
    it(`${name}: preserves cumulative progress through a closed boundary`, function () {
      const primitive = add(flow(), [
        {
          geometry: geometry([
            [-20, -20],
            [20, -20],
            [20, 20],
            [-20, 20],
            [-20, -20],
          ]),
          id: "closed",
        },
      ]);
      const values = [];
      for (const [x, y] of [
        [0, -20],
        [20, 0],
        [0, 20],
        [-20, 0],
      ]) {
        view(x, y);
        values.push(pixel()[0]);
        expect(pick()).toBe("closed");
      }
      for (let i = 0; i < 4; ++i) {
        expect(values[i]).toBeGreaterThan(i * 64 + 20);
        expect(values[i]).toBeLessThan(i * 64 + 44);
      }
      scene.primitives.remove(primitive);
    });
  });
});
