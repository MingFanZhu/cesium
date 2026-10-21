import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  Material,
  MaterialAppearance,
  PerInstanceColorAppearance,
  SceneGISPlanarBoxGeometry,
  SceneGISPlanarCylinderGeometry,
  SceneGISPlanarEllipsoidGeometry,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarPolylineVolumeGeometry,
  SceneGISPlanarPrimitive,
  SceneGISPlanarWallGeometry,
  ShowGeometryInstanceAttribute,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISPlanarMaterials", function () {
  let scene;
  let materials;
  const origin = 20000000;
  function polygon(x = origin, options = {}) {
    return new SceneGISPlanarPolygonGeometry({
      positions: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([dx, dy]) => new Cartesian3(x + dx, origin + dy, 5)),
      ...options,
    });
  }
  function view(x = origin, y = origin) {
    scene.camera.setView({
      destination: new Cartesian3(x, y, 7),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum.near = 0.01;
    scene.camera.frustum.far = 100;
  }
  function material(options) {
    const value = new Material(options);
    materials.push(value);
    return value;
  }
  function appearance(value, extra = {}) {
    return new MaterialAppearance({
      material: value,
      flat: true,
      translucent: true,
      ...extra,
    });
  }
  beforeEach(function () {
    scene = createScene({ scene3DOnly: true });
    materials = [];
    view();
  });
  afterEach(function () {
    scene.destroyForSpecs();
    for (const value of materials) {
      value.destroy();
    }
  });

  it("keeps color geometry unchanged and creates finite rotated material frames for caps and sides", function () {
    const top = polygon().positions;
    const geometry = polygon(origin, {
      bottomPositions: top.map((p) => new Cartesian3(p.x, p.y, 1)),
      stRotation: Math.PI / 2,
    });
    const color = geometry._createGeometry();
    expect(color.attributes.st).toBeUndefined();
    expect(color.attributes.normal).toBeUndefined();
    const raw = geometry._createGeometry(
      MaterialAppearance.MaterialSupport.ALL.vertexFormat,
    );
    expect(raw.attributes.position.values).toBeInstanceOf(Float64Array);
    for (const name of ["position", "normal", "st", "tangent", "bitangent"]) {
      expect(
        Array.from(raw.attributes[name].values).every(Number.isFinite),
      ).toBeTrue();
    }
    const positions = raw.attributes.position.values;
    const uv = raw.attributes.st.values;
    for (let i = 0; i < positions.length / 3; i++) {
      const position = Cartesian3.unpack(positions, i * 3);
      const normal = Cartesian3.unpack(raw.attributes.normal.values, i * 3);
      expect(
        Cartesian3.dot(
          Cartesian3.subtract(position, new Cartesian3(1, 1, -2), position),
          normal,
        ),
      ).toBeGreaterThan(0);
      if (raw.attributes.normal.values[i * 3 + 2] > 0.9) {
        expect(uv[i * 2]).toEqualEpsilon(1 - positions[i * 3 + 1] / 2, 1e-6);
        expect(uv[i * 2 + 1]).toEqualEpsilon(positions[i * 3] / 2, 1e-6);
      }
    }
    const collapsed = polygon(origin, { bottomPositions: top });
    expect(
      Array.from(
        collapsed._createGeometry(
          MaterialAppearance.MaterialSupport.ALL.vertexFormat,
        ).attributes.tangent.values,
      ).every(Number.isFinite),
    ).toBeTrue();
    expect(() => polygon(origin, { stRotation: NaN })).toThrowDeveloperError();
  });

  it("renders an Image material with oriented UVs and leaves the caller-owned texture alive", async function () {
    const image = document.createElement("canvas");
    image.width = 16;
    image.height = 16;
    const context = image.getContext("2d");
    context.fillStyle = "red";
    context.fillRect(0, 0, 8, 16);
    context.fillStyle = "blue";
    context.fillRect(8, 0, 8, 16);
    const value = material({ fabric: { type: "Image", uniforms: { image } } });
    const primitive = scene.primitives.add(
      new SceneGISPlanarPrimitive({
        geometry: polygon(),
        appearance: appearance(value),
        id: "image",
      }),
    );
    view(origin - 0.5);
    await pollToPromise(function () {
      scene.renderForSpecs();
      return Object.values(value._textures).some(
        (texture) => texture !== scene.context.defaultTexture,
      );
    });
    expect(scene).toRender([255, 0, 0, 255]);
    const texture = Object.values(value._textures)[0];
    view(origin + 0.5);
    expect(scene).toRender([0, 0, 255, 255]);
    expect(scene.pick(new Cartesian2())).toEqual({ primitive, id: "image" });
    scene.primitives.remove(primitive);
    expect(value.isDestroyed()).toBeFalse();
    expect(texture.isDestroyed()).toBeFalse();
  });

  it("shares custom Fabric uniforms in a large batch and preserves per-instance show and pick", function () {
    const value = material({
      fabric: {
        type: "PlanarMaterialTest",
        uniforms: { tint: Color.RED, split: 0.5 },
        source:
          "czm_material czm_getMaterial(czm_materialInput materialInput) { czm_material m = czm_getDefaultMaterial(materialInput); m.diffuse = materialInput.st.s < split ? tint.rgb : vec3(0.,0.,1.); m.alpha = tint.a; return m; }",
      },
    });
    const primitive = scene.primitives.add(
      new SceneGISPlanarPrimitive({
        geometryInstances: Array.from({ length: 128 }, (_, id) => ({
          geometry: polygon(origin + id * 3),
          id,
          attributes: { show: new ShowGeometryInstanceAttribute(true) },
        })),
        appearance: appearance(value),
      }),
    );
    view(origin - 0.5);
    expect(scene).toRender([255, 0, 0, 255]);
    const current = primitive._current;
    const va = current._va[0];
    const program = current._colorCommands[0].shaderProgram;
    value.uniforms.tint = Color.LIME;
    expect(scene).toRender([0, 255, 0, 255]);
    view(origin + 3 - 0.5);
    expect(scene.pick(new Cartesian2())).toEqual({ primitive, id: 1 });
    primitive.getGeometryInstanceAttributes(1).show = new Uint8Array([0]);
    expect(scene).toRender([0, 0, 0, 255]);
    expect(scene.pick(new Cartesian2())).toBeUndefined();
    expect(current._va.length).toBe(1);
    expect(current._colorCommands.length).toBe(1);
    expect(current._va[0]).toBe(va);
    expect(current._colorCommands[0].shaderProgram).toBe(program);
    expect(primitive._current).toBe(current);
    view(origin - 0.5);
    value.uniforms.tint = new Color(0, 1, 0, 0.5);
    scene.renderForSpecs();
    expect(current._colorCommands[0].renderState.blending.enabled).toBeTrue();
    const replacement = material({
      fabric: { type: "Color", uniforms: { color: Color.RED } },
    });
    primitive.appearance.material = replacement;
    expect(scene).toRender([255, 0, 0, 255]);
    expect(current._colorCommands[0].renderState.blending.enabled).toBeFalse();
    expect(current._va[0]).toBe(va);
  });

  it("preserves color/show attributes across color-to-material replacement and holes remain unpicked", function () {
    const geometry = polygon(origin, {
      holes: [
        [
          [-0.2, -0.2],
          [0.2, -0.2],
          [0.2, 0.2],
          [-0.2, 0.2],
        ].map(([x, y]) => new Cartesian3(origin + x, origin + y, 5)),
      ],
    });
    const primitive = scene.primitives.add(
      new SceneGISPlanarPrimitive({
        geometry,
        id: 1,
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
          show: new ShowGeometryInstanceAttribute(true),
        },
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
      }),
    );
    view(origin - 0.5);
    expect(scene).toRender([255, 0, 0, 255]);
    const old = primitive._current;
    const value = material({
      fabric: { type: "Color", uniforms: { color: Color.BLUE } },
    });
    primitive.appearance = appearance(value);
    expect(scene).toRender([0, 0, 255, 255]);
    expect(old.isDestroyed()).toBeTrue();
    expect(Array.from(primitive.getGeometryInstanceAttributes().color)).toEqual(
      [255, 0, 0, 255],
    );
    view();
    expect(scene.pick(new Cartesian2())).toBeUndefined();
  });

  it("renders all solid/route material vertex formats through the native primitive", function () {
    const center = new Cartesian3(origin, origin, 4);
    const geometries = [
      new SceneGISPlanarBoxGeometry({
        center,
        dimensions: new Cartesian3(1, 1, 2),
      }),
      new SceneGISPlanarCylinderGeometry({
        center,
        length: 2,
        topRadius: 1,
        bottomRadius: 1,
      }),
      new SceneGISPlanarEllipsoidGeometry({
        center,
        radii: new Cartesian3(1, 1, 1),
      }),
      new SceneGISPlanarWallGeometry({
        positions: [
          new Cartesian3(origin - 1, origin, 5),
          new Cartesian3(origin + 1, origin, 5),
        ],
      }),
      new SceneGISPlanarPolylineVolumeGeometry({
        polylinePositions: [
          new Cartesian3(origin - 1, origin, 4),
          new Cartesian3(origin + 1, origin, 4),
        ],
        shapePositions: [
          new Cartesian2(-1, -1),
          new Cartesian2(1, -1),
          new Cartesian2(1, 1),
          new Cartesian2(-1, 1),
        ],
      }),
    ];
    const value = material({ fabric: { type: "Checkerboard" } });
    for (const geometry of geometries) {
      const primitive = scene.primitives.add(
        new SceneGISPlanarPrimitive({
          geometry,
          id: "solid",
          appearance: appearance(value, {
            flat: false,
            materialSupport: MaterialAppearance.MaterialSupport.ALL,
          }),
        }),
      );
      scene.renderForSpecs();
      expect(primitive.ready).toBeTrue();
      expect(primitive._current._va.length).toBe(1);
      scene.primitives.remove(primitive);
    }
  });
});
