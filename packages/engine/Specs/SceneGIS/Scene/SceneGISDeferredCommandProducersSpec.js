import {
  BlendOption,
  BoundingRectangle,
  BufferPointCollection,
  BufferPointMaterial,
  BufferPolygonCollection,
  BufferPolygonMaterial,
  BufferPolylineCollection,
  BufferPolylineMaterial,
  BoxGeometry,
  Cartesian2,
  Cartesian3,
  ClearCommand,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  Cesium3DTileStyle,
  CubeMapPanorama,
  DirectionalLight,
  GeometryInstance,
  Globe,
  HeadingPitchRange,
  Matrix4,
  Material,
  Model,
  OrthographicFrustum,
  PerspectiveFrustum,
  Pass,
  PerInstanceColorAppearance,
  PointPrimitiveCollection,
  PointCloud,
  PolylineCollection,
  PostProcessStage,
  Primitive,
  ViewportQuad,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import Cesium3DTilesTester from "../../../../../Specs/Cesium3DTilesTester.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

function pointBuffer() {
  let json = JSON.stringify({
    POINTS_LENGTH: 1,
    POSITION: { byteOffset: 0 },
    NORMAL: { byteOffset: 12 },
    CONSTANT_RGBA: [128, 128, 128, 255],
  });
  json = json.padEnd(Math.ceil(json.length / 4) * 4, " ");
  const buffer = new ArrayBuffer(28 + json.length + 24);
  const bytes = new Uint8Array(buffer);
  bytes.set([112, 110, 116, 115]);
  const header = new DataView(buffer);
  header.setUint32(4, 1, true);
  header.setUint32(8, buffer.byteLength, true);
  header.setUint32(12, json.length, true);
  header.setUint32(16, 24, true);
  bytes.set(new TextEncoder().encode(json), 28);
  new Float32Array(buffer, 28 + json.length, 6).set([0, 0, 1, 0, 0, 1]);
  return buffer;
}

describe("SceneGIS/Scene/SceneGISDeferredCommandProducers", function () {
  let scene;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(32, 32), scene3DOnly: true });
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.camera.setView({
      destination: new Cartesian3(7000000, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: new Cartesian3(0, 1, 0),
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 4,
      aspectRatio: 1,
      near: 0.1,
      far: 30,
    });
  });
  afterEach(function () {
    scene.destroyForSpecs();
  });

  it("keeps skip-LOD clears with inverse material stencil and retains backface depth", async function () {
    scene.light = new DirectionalLight({ direction: new Cartesian3(0, 0, -1) });
    scene.camera.frustum = new PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: 1,
    });
    scene.camera.lookAt(
      Cartesian3.fromRadians(-1.31968, 0.698874),
      new HeadingPitchRange(0, -1.57, 200),
    );
    const tileset = await Cesium3DTilesTester.loadTileset(
      scene,
      "./Data/Cesium3DTiles/Tilesets/TilesetReplacement3/tileset.json",
      { skipLevelOfDetail: true, maximumScreenSpaceError: 1 },
    );
    for (let i = 0; i < 3; ++i) {
      tileset.root.children[0].children[0].children[i].unloadContent();
    }
    scene.renderForSpecs();
    expect(tileset.hasMixedContent).toBe(true);
    const clear = tileset._stencilClearCommand;
    expect(clear instanceof ClearCommand).toBe(true);
    const execute = clear.execute;
    let framebuffer;
    spyOn(clear, "execute").and.callFake(function (context, passState) {
      framebuffer = passState.framebuffer;
      return execute.call(this, context, passState);
    });
    scene.invertClassification = true;
    scene.invertClassificationColor = new Color(1, 1, 1, 0.5);
    scene.debugShowCommands = true;
    scene.renderForSpecs();
    const renderer = scene._sceneGISDeferred;
    expect(framebuffer).toBe(renderer._inverse.framebuffer);
    expect(renderer.drawCount).toBe(3);
    expect(renderer.debugTintDrawCount).toBe(2);
    expect(
      scene.context
        .readPixels({ width: 32, height: 32 })
        .some((value, i) => i % 4 !== 3 && value > 0),
    ).toBe(true);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("renders classification Model wireframe through the opaque material path", async function () {
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
        classificationType: ClassificationType.TERRAIN,
        enableDebugWireframe: true,
        debugWireframe: true,
      }),
    );
    await pollToPromise(() => {
      scene.renderForSpecs();
      return model.ready;
    });
    scene.renderForSpecs();
    expect(scene._sceneGISDeferred.drawCount).toBe(1);
    expect(
      scene.context
        .readPixels({ width: 32, height: 32 })
        .some((v, i) => i % 4 !== 3 && v > 0),
    ).toBe(true);
    model.debugWireframe = false;
    scene.renderForSpecs();
    expect(scene._sceneGISDeferred.drawCount).toBe(0);
    expect(scene._sceneGISDeferred.classificationDrawCount).toBeGreaterThan(0);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("drapes native vector tile clamped polylines over deferred terrain and retains picking", async function () {
    scene.globe = new Globe();
    scene.globe.baseColor = Color.BLUE;
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(0, 0, 5),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    await pollToPromise(() => {
      scene.renderForSpecs();
      return scene.globe.tilesLoaded;
    });
    const tileset = await Cesium3DTilesTester.loadTileset(
      scene,
      "./Data/Cesium3DTiles/Vector/VectorTilePolylines/tileset.json",
      { classificationType: ClassificationType.TERRAIN },
    );
    scene.renderForSpecs();
    expect(scene._sceneGISDeferred.classificationDrawCount).toBeGreaterThan(0);
    const visible = scene.context.readPixels({
      x: 16,
      y: 16,
      width: 1,
      height: 1,
    });
    expect(scene.pick(new Cartesian2(16, 16)).primitive).toBe(tileset);
    tileset.show = false;
    scene.renderForSpecs();
    expect(
      scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
    ).not.toEqual(visible);
    expect(scene.context._gl.getError()).toBe(0);
  });

  const bufferTypes = [
    [BufferPointCollection, BufferPointMaterial, { position: Cartesian3.ZERO }],
    [
      BufferPolylineCollection,
      BufferPolylineMaterial,
      { positions: new Float64Array([-1, 0, 0, 1, 0, 0]) },
    ],
    [
      BufferPolygonCollection,
      BufferPolygonMaterial,
      {
        positions: new Float64Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
        triangles: new Uint16Array([0, 1, 2]),
      },
    ],
  ];
  bufferTypes.forEach(([Collection, Material, geometry]) => {
    it(`composites ${Collection.name} in linear color and respects opaque depth`, function () {
      const opaque = scene.primitives.add(
        new Collection({
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
          blendOption: BlendOption.OPAQUE,
          allowPicking: true,
        }),
      );
      const translucent = scene.primitives.add(
        new Collection({
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 1)),
          blendOption: BlendOption.TRANSLUCENT,
          allowPicking: true,
        }),
      );
      opaque.add({
        ...geometry,
        material: new Material({ color: Color.BLUE, size: 16, width: 16 }),
      });
      translucent.add({
        ...geometry,
        material: new Material({
          color: new Color(0, 0.5, 0, 0.5),
          size: 16,
          width: 16,
        }),
      });
      scene.renderForSpecs();
      const pixel = () =>
        scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 });
      // Alpha composition occurs before display gamma, also when display HDR is off.
      expect(pixel()).toEqualEpsilon(
        [
          0,
          Math.round(255 * 0.5 * Math.pow(0.5, 1 / scene.gamma)),
          Math.round(255 * Math.pow(0.5, 1 / scene.gamma)),
          255,
        ],
        2,
      );
      expect(scene._sceneGISDeferred.drawCount).toBe(1);
      expect(scene.pick(new Cartesian2(16, 16))).toBeDefined();
      const front = scene.primitives.add(
        new Collection({
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 2)),
          blendOption: BlendOption.OPAQUE,
        }),
      );
      front.add({
        ...geometry,
        material: new Material({ color: Color.BLUE, size: 16, width: 16 }),
      });
      scene.renderForSpecs();
      expect(pixel()).toEqualEpsilon([0, 0, 255, 255], 1);
      scene.primitives.removeAll();
      // Buffer collections release GPU resources while retaining reusable CPU storage.
      expect(opaque._renderContext).toBeUndefined();
      expect(translucent._renderContext).toBeUndefined();
      expect(front._renderContext).toBeUndefined();
      expect(scene.context._gl.getError()).toBe(0);
    });
  });

  it("filters commands without retaining their previous deferred material", function () {
    const points = scene.primitives.add(
      new PointPrimitiveCollection({ blendOption: BlendOption.OPAQUE }),
    );
    points.add({
      position: new Cartesian3(7000000, 0, 0),
      pixelSize: 16,
      color: Color.RED,
    });
    scene.renderForSpecs();
    expect(scene._sceneGISDeferred.drawCount).toBe(1);
    scene.debugCommandFilter = (command) => command.owner !== points;
    scene.renderForSpecs();
    expect(scene._sceneGISDeferred.drawCount).toBe(0);
    expect(
      scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
    ).toEqual([0, 0, 0, 255]);
    scene.debugCommandFilter = undefined;
    scene.renderForSpecs();
    expect(scene._sceneGISDeferred.drawCount).toBe(1);
  });

  it("retains native polyline material transitions, transparent depth and picking", function () {
    const lines = scene.primitives.add(new PolylineCollection());
    const positions = (z) => [
      new Cartesian3(6999999, 0, z),
      new Cartesian3(7000001, 0, z),
    ];
    const back = lines.add({
      positions: positions(0),
      width: 12,
      material: Material.fromType("Color", { color: Color.BLUE }),
      id: "back",
    });
    const front = lines.add({
      positions: positions(1),
      width: 12,
      material: Material.fromType("Color", {
        color: new Color(1, 0, 0, 0.5),
      }),
      id: "front",
    });
    const pixel = () =>
      scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 });
    scene.renderForSpecs();
    expect(scene._sceneGISDeferred.drawCount).toBe(1);
    expect(pixel()[0]).toBeGreaterThan(100);
    expect(pixel()[2]).toBeGreaterThan(100);
    expect(scene.pick(new Cartesian2(16, 16)).id).toBe("front");
    back.positions = positions(2);
    scene.renderForSpecs();
    expect(pixel()).toEqual([0, 0, 255, 255]);
    expect(scene.pick(new Cartesian2(16, 16)).id).toBe("back");
    back.positions = positions(0);
    front.material.uniforms.color = Color.RED;
    scene.renderForSpecs();
    expect(scene._sceneGISDeferred.drawCount).toBe(2);
    expect(pixel()).toEqual([255, 0, 0, 255]);
    scene.primitives.remove(lines);
    scene.renderForSpecs();
    expect(lines.isDestroyed()).toBe(true);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("post-processes deferred color before the final viewport overlay", function () {
    const points = scene.primitives.add(
      new PointPrimitiveCollection({ blendOption: BlendOption.OPAQUE }),
    );
    points.add({
      position: new Cartesian3(7000000, 0, 0),
      pixelSize: 16,
      color: Color.BLUE,
      id: "surface",
    });
    const stage = scene.postProcessStages.add(
      new PostProcessStage({
        fragmentShader:
          "uniform sampler2D colorTexture; in vec2 v_textureCoordinates; void main() { vec4 c = texture(colorTexture, v_textureCoordinates); out_FragColor = vec4(c.b, 0.0, 0.0, c.a); }",
      }),
    );
    const pixel = () =>
      scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 });
    scene.renderForSpecs();
    expect(pixel()).toEqual([255, 0, 0, 255]);
    expect(scene._sceneGISDeferred.drawCount).toBe(1);
    expect(scene.postProcessStages.getOutputTexture(stage.name)).toBe(
      stage.outputTexture,
    );
    stage.enabled = false;
    scene.renderForSpecs();
    expect(pixel()).toEqual([0, 0, 255, 255]);
    stage.enabled = true;
    const quad = scene.primitives.add(
      new ViewportQuad(
        new BoundingRectangle(0, 0, 32, 32),
        Material.fromType("Color", { color: Color.GREEN }),
      ),
    );
    scene.renderForSpecs();
    expect(pixel()).toEqual([0, 128, 0, 255]);
    expect(scene._sceneGISDeferred.drawCount).toBe(1);
    expect(scene.pick(new Cartesian2(16, 16)).id).toBe("surface");
    scene.primitives.remove(quad);
    scene.postProcessStages.remove(stage);
    scene.renderForSpecs();
    expect(pixel()).toEqual([0, 0, 255, 255]);
    expect(quad.isDestroyed()).toBe(true);
    expect(stage.isDestroyed()).toBe(true);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("composes an explicit panorama behind deferred surfaces and releases it", function () {
    const face = createCanvas(1, 1);
    const paint = face.getContext("2d");
    paint.fillStyle = "red";
    paint.fillRect(0, 0, 1, 1);
    const sources = Object.fromEntries(
      [
        "positiveX",
        "negativeX",
        "positiveY",
        "negativeY",
        "positiveZ",
        "negativeZ",
      ].map((name) => [name, face]),
    );
    const panorama = scene.primitives.add(new CubeMapPanorama({ sources }));
    const points = scene.primitives.add(
      new PointPrimitiveCollection({ blendOption: BlendOption.OPAQUE }),
    );
    points.add({
      position: new Cartesian3(7000000, 0, 0),
      pixelSize: 8,
      color: Color.BLUE,
    });
    scene.renderForSpecs();
    expect(
      scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
    ).toEqual([0, 0, 255, 255]);
    expect(
      scene.context.readPixels({ x: 1, y: 1, width: 1, height: 1 }),
    ).toEqual([255, 0, 0, 255]);
    expect(scene._sceneGISDeferred.drawCount).toBe(1);
    scene.primitives.remove(panorama);
    scene.renderForSpecs();
    expect(panorama.isDestroyed()).toBe(true);
    expect(scene.frameState.panoramaCommandList.length).toBe(0);
    expect(scene.context._gl.getError()).toBe(0);
    face.remove();
  });

  it("separates independent point material from light and preserves alpha, style and picking", function () {
    const pickId = scene.context.createPickId({ id: "dynamic-point" });
    const cloud = scene.primitives.add(
      new PointCloud({
        arrayBuffer: pointBuffer(),
        pickIdLoaded: () => "u_pickColor",
        fragmentShaderLoaded: (source) =>
          `uniform vec4 u_pickColor;\n${source}`,
        uniformMapLoaded: (uniforms) => ({
          ...uniforms,
          u_pickColor: () => pickId.color,
        }),
      }),
    );
    cloud.modelMatrix = Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0));
    cloud.style = new Cesium3DTileStyle({ pointSize: 16 });
    scene.light = new DirectionalLight({
      direction: new Cartesian3(0, 0, -1),
      color: Color.RED,
    });
    const pixel = (framebuffer) =>
      Array.from(
        scene.context.readPixels({
          framebuffer,
          x: 16,
          y: 16,
          width: 1,
          height: 1,
        }),
      );
    scene.renderForSpecs();
    const renderer = scene._sceneGISDeferred;
    const material = pixel(renderer._raw.framebuffer);
    const red = pixel();
    expect(renderer._point).toBeDefined();
    expect(renderer.drawCount).toBe(1);
    // HALF_FLOAT readPixels returns the stored half bits, including unlit color.
    expect(material[0]).toBeGreaterThan(0);
    expect(material[1]).toBe(material[0]);
    expect(material[2]).toBe(material[0]);
    expect(red[0]).toBeGreaterThan(40);
    expect(red[2]).toBe(0);
    scene.light.color = Color.BLUE;
    scene.renderForSpecs();
    expect(pixel(renderer._raw.framebuffer)).toEqual(material);
    expect(pixel()[0]).toBe(0);
    expect(pixel()[2]).toBeGreaterThan(40);
    expect(scene.pick(new Cartesian2(16, 16)).id).toBe("dynamic-point");
    cloud.normalShading = false;
    scene.renderForSpecs();
    expect(renderer._point).toBeUndefined();
    expect(pixel()[0]).toEqualEpsilon(pixel()[2], 1);
    cloud.normalShading = true;
    cloud.style = new Cesium3DTileStyle({
      pointSize: 16,
      color: "color('white', 0.5)",
    });
    scene.renderForSpecs();
    expect(cloud._drawCommand.pass).toBe(Pass.TRANSLUCENT);
    expect(renderer.drawCount).toBe(0);
    expect(pixel()[2]).toBeGreaterThan(40);
    expect(pixel()[0]).toBe(0);
    cloud.style = new Cesium3DTileStyle({ pointSize: 16, show: false });
    scene.renderForSpecs();
    expect(scene.pick(new Cartesian2(16, 16))).toBeUndefined();
    scene.primitives.remove(cloud);
    scene.renderForSpecs();
    expect(cloud.isDestroyed()).toBe(true);
    expect(renderer._point).toBeUndefined();
    expect(scene.context._gl.getError()).toBe(0);
    pickId.destroy();
  });

  [BlendOption.TRANSLUCENT, BlendOption.OPAQUE_AND_TRANSLUCENT].forEach(
    (blendOption) => {
      it(`routes point collection alpha through forward transparency with blend option ${blendOption}`, function () {
        const background = scene.primitives.add(
          new Primitive({
            asynchronous: false,
            geometryInstances: new GeometryInstance({
              geometry: BoxGeometry.fromDimensions({
                dimensions: new Cartesian3(3, 3, 0.2),
                vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
              }),
              attributes: {
                color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
              },
              id: "background",
            }),
            modelMatrix: Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0)),
            appearance: new PerInstanceColorAppearance({
              flat: true,
              translucent: false,
            }),
          }),
        );
        const points = scene.primitives.add(
          new PointPrimitiveCollection({ blendOption }),
        );
        const point = points.add({
          position: new Cartesian3(7000000, 0, 1),
          pixelSize: 16,
          color: new Color(1, 0, 0, 0.5),
          id: "point",
        });
        scene.renderForSpecs();
        const commands = scene.frameState.commandList.filter(
          (c) => c.owner === points,
        );
        expect(commands.filter((c) => c.pass === Pass.TRANSLUCENT).length).toBe(
          1,
        );
        expect(scene._environmentState.useOIT).toBe(true);
        const color = scene.context.readPixels({
          x: 16,
          y: 16,
          width: 1,
          height: 1,
        });
        expect(color[0]).toBeGreaterThan(50);
        expect(color[2]).toBeGreaterThan(50);
        expect(scene._sceneGISDeferred.drawCount).toBe(
          blendOption === BlendOption.TRANSLUCENT ? 1 : 2,
        );
        expect(scene.pick(new Cartesian2(16, 16)).primitive).toBe(point);
        background.modelMatrix = Matrix4.fromTranslation(
          new Cartesian3(7000000, 0, 2),
        );
        scene.renderForSpecs();
        expect(
          scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
        ).toEqualEpsilon([0, 0, 255, 255], 1);
        expect(scene.pick(new Cartesian2(16, 16)).id).toBe("background");
        scene.primitives.remove(points);
        scene.renderForSpecs();
        expect(points.isDestroyed()).toBe(true);
        expect(scene.context._gl.getError()).toBe(0);
      });
    },
  );
});
