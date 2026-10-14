import {
  BoxGeometry,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  DataSourceCollection,
  DataSourceDisplay,
  DirectionalLight,
  EllipsoidPrimitive,
  EllipsoidSurfaceAppearance,
  FramebufferManager,
  GeometryInstance,
  Material,
  MaterialAppearance,
  Matrix4,
  OrthographicFrustum,
  PerInstanceColorAppearance,
  PerspectiveFrustum,
  PixelDatatype,
  Primitive,
  SceneGISLightCollection,
  SceneGISPointLight,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISSurfaceWeather,
  SceneGISScreenSpaceReflections,
  SceneGISScreenSpaceIndirectLighting,
  ShadowMode,
  ShowGeometryInstanceAttribute,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredPrimitives", function () {
  let scene, renderer, display, dataSources;
  function render() {
    scene.renderForSpecs();
  }
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.highDynamicRange = true;
    scene.msaaSamples = 1;
    scene.fog.enabled = false;
    scene.skyAtmosphere = scene.skyBox = scene.sun = scene.moon = undefined;
    scene.light = new DirectionalLight({
      direction: new Cartesian3(0, 0, -1),
      intensity: 2,
    });
    scene.camera.setView({
      destination: new Cartesian3(7000000, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: new Cartesian3(0, 1, 0),
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 8,
      aspectRatio: 1,
      near: 0.1,
      far: 30,
    });
    scene.farToNearRatio = 10000;
    scene.logarithmicDepthBuffer = false;
    renderer = scene._sceneGISDeferred;
  });
  afterEach(function () {
    display?.destroy();
    dataSources?.destroy();
    scene?.destroyForSpecs();
    scene = renderer = display = dataSources = undefined;
  });
  function sample(texture, x = 32) {
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    target.update(scene.context, 1, 1);
    const copy = scene.context.createViewportQuadCommand(
      "uniform sampler2D u_texture; uniform vec2 u_pixel; void main(){out_FragColor=texelFetch(u_texture,ivec2(u_pixel),0);}",
      {
        framebuffer: target.framebuffer,
        uniformMap: {
          u_texture: () => texture,
          u_pixel: () => new Cartesian2(x, 32),
        },
      },
    );
    try {
      copy.execute(scene.context);
      return Array.from(
        scene.context.readPixels({
          framebuffer: target.framebuffer,
          width: 1,
          height: 1,
        }),
      );
    } finally {
      copy.shaderProgram.destroy();
      target.destroy();
    }
  }
  function color(x = 32) {
    return sample(
      scene._view.sceneFramebuffer._colorFramebuffer.getColorTexture(),
      x,
    );
  }
  function box(
    appearance = new PerInstanceColorAppearance({ translucent: false }),
    x = 0,
    dimensions = new Cartesian3(2, 2, 1),
    z = 0,
  ) {
    return scene.primitives.add(
      new Primitive({
        asynchronous: false,
        shadows: ShadowMode.ENABLED,
        geometryInstances: new GeometryInstance({
          id: "box",
          geometry: BoxGeometry.fromDimensions({
            dimensions,
            vertexFormat: appearance.vertexFormat,
          }),
          modelMatrix: Matrix4.fromTranslation(
            new Cartesian3(7000000 + x, 0, z),
          ),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              new Color(0.3, 0.5, 0.7, 1),
            ),
            show: new ShowGeometryInstanceAttribute(true),
          },
        }),
        appearance,
      }),
    );
  }
  function material() {
    return new Material({
      fabric: {
        type: "SceneGISDeferredSpecPhong",
        uniforms: { color: new Color(0.3, 0.4, 0.5, 1) },
        source: `czm_material czm_getMaterial(czm_materialInput i) {
          czm_material m=czm_getDefaultMaterial(i);
          m.diffuse=color.rgb; m.alpha=color.a;
          m.emission=vec3(0.05,0.1,0.15); m.specular=0.7; m.shininess=31.25;
          m.normal=normalize(i.normalEC+vec3(0.1,0.0,0.0)); return m;
        }`,
      },
      translucent: (m) => m.uniforms.color.alpha < 1,
    });
  }

  [false, true].forEach((logDepth) => {
    it(`captures ray-cast ellipsoid material and intersection depth with log depth ${logDepth}`, function () {
      scene.camera.frustum = new PerspectiveFrustum({
        fov: Math.PI / 3,
        aspectRatio: 1,
        near: 0.1,
        far: 30,
      });
      scene.logarithmicDepthBuffer = logDepth;
      // A second native frustum exercises the material pass's explicit depth output.
      scene.farToNearRatio = scene.logarithmicDepthFarToNearRatio = 2;
      const surface = material();
      const ellipsoid = scene.primitives.add(
        new EllipsoidPrimitive({
          center: new Cartesian3(7000000, 0, 0),
          radii: new Cartesian3(2, 2, 2),
          material: surface,
        }),
      );
      render();
      expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
        [0.3, 0.4, 0.5, 1],
        0.001,
      );
      expect(sample(renderer._raw.getColorTexture(2))).toEqualEpsilon(
        [0.7, 0.7, 0.7, -2],
        0.001,
      );
      expect(sample(renderer._linearDepth)[0]).toEqualEpsilon(8, 0.03);
      expect(scene.pick(new Cartesian2(32, 32)).primitive).toBe(ellipsoid);
      expect(renderer.drawCount).toBeGreaterThan(0);
      expect(renderer.lightDrawCount).toBe(1);
      // With no direct light, ordinary Phong retains ambient and emission.
      scene.light.intensity = 0;
      render();
      expect(color()).toEqualEpsilon([0.2, 0.3, 0.4, 1], 0.002);
      ellipsoid.onlySunLighting = true;
      render();
      expect(color()).toEqualEpsilon([0.05, 0.1, 0.15, 1], 0.001);
      expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(-4);
      expect(renderer._phong).toBeUndefined();
      expect(renderer._sunPhong).toBeDefined();
      // Native transparency remains a dedicated draw and must not write this material group.
      surface.uniforms.color.alpha = 0.4;
      render();
      expect(renderer._sunPhong).toBeUndefined();
      expect(renderer.drawCount).toBe(0);
      expect(scene.pick(new Cartesian2(32, 32)).primitive).toBe(ellipsoid);
      scene.primitives.remove(ellipsoid);
      surface.destroy();
    });
  });

  it("captures instance color and keeps native edits, show, picking and flat/transparent routing", function () {
    const primitive = box();
    render();
    const albedo = sample(renderer._raw.getColorTexture(0));
    const bytes = ColorGeometryInstanceAttribute.toValue(
      new Color(0.3, 0.5, 0.7, 1),
    );
    expect(albedo).toEqualEpsilon(
      Array.from(bytes, (value, channel) =>
        channel === 3 ? 1 : Math.pow(value / 255, scene.gamma),
      ),
      0.001,
    );
    expect(color()).toEqualEpsilon(albedo, 0.002);
    scene.light.intensity = 0;
    render();
    expect(color()).toEqualEpsilon(
      [albedo[0] * 0.5, albedo[1] * 0.5, albedo[2] * 0.5, 1],
      0.002,
    );
    scene.light.intensity = 2;
    expect(renderer.groupCount).toBe(1);
    expect(renderer.drawCount).toBe(1);
    expect(renderer.lightDrawCount).toBe(1);
    expect(renderer._style).toBeUndefined();
    expect(sample(renderer._raw.getColorTexture(2))[3]).toBe(-2);
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe("box");
    const attributes = primitive.getGeometryInstanceAttributes("box");
    attributes.color = ColorGeometryInstanceAttribute.toValue(Color.RED);
    render();
    expect(color()[1]).toBeLessThan(0.001);
    attributes.show = ShowGeometryInstanceAttribute.toValue(false);
    render();
    expect(scene.pick(new Cartesian2(32, 32))).toBeUndefined();
    attributes.show = ShowGeometryInstanceAttribute.toValue(true);
    primitive.appearance = new PerInstanceColorAppearance({
      flat: true,
      translucent: false,
    });
    render();
    expect(renderer._phong).toBeUndefined();
    expect(color()).toEqualEpsilon([1, 0, 0, 1], 0.001);
    primitive.appearance = new PerInstanceColorAppearance({
      translucent: true,
    });
    attributes.color = ColorGeometryInstanceAttribute.toValue(
      new Color(0.4, 0.6, 0.8, 0.5),
    );
    render();
    expect(renderer._phong).toBeUndefined();
  });
  ["BASIC", "TEXTURED", "ALL"].forEach((support) => {
    it(`preserves ${support} Fabric material values and live uniforms`, function () {
      const appearance = new MaterialAppearance({
        material: material(),
        materialSupport: MaterialAppearance.MaterialSupport[support],
        translucent: false,
      });
      box(appearance);
      render();
      expect(sample(renderer._raw.getColorTexture(1))[3]).toBe(31.25);
      expect(
        sample(renderer._raw.getColorTexture(3)).slice(0, 3),
      ).toEqualEpsilon([0.05, 0.1, 0.15], 0.001);
      scene.light.intensity = 0;
      render();
      expect(color()).toEqualEpsilon([0.2, 0.3, 0.4, 1], 0.002);
      appearance.material.uniforms.color = new Color(0.1, 0.8, 0.2, 1);
      render();
      expect(color()).toEqualEpsilon([0.1, 0.5, 0.25, 1], 0.002);
      expect(sample(renderer._raw.getColorTexture(0))).toEqualEpsilon(
        [0.1, 0.8, 0.2, 1],
        0.001,
      );
      expect(renderer.groupCount).toBe(1);
      appearance.material.uniforms.color.alpha = 0.5;
      render();
      expect(renderer._phong).toBeUndefined();
    });
  });
  it("qualifies native ellipsoid surface appearance without qualifying custom outer shaders", function () {
    const primitive = box(
      new EllipsoidSurfaceAppearance({
        material: material(),
        translucent: false,
      }),
    );
    render();
    expect(renderer.groupCount).toBe(1);
    primitive.appearance = new PerInstanceColorAppearance({
      translucent: false,
      fragmentShaderSource: "void main(){out_FragColor=vec4(0.2,0.4,0.6,1.0);}",
    });
    render();
    expect(renderer._phong).toBeUndefined();
    expect(renderer._hasPassthrough).toBe(true);
    expect(color()).toEqualEpsilon([0.2, 0.4, 0.6, 1], 0.001);
  });
  it("shares one Phong lighting group and the punctual-light table with current-frame AO", function () {
    box();
    box(undefined, 2.5);
    const lights = new SceneGISLightCollection({ scene });
    lights.add(
      new SceneGISPointLight({
        position: new Cartesian3(7000000, 0, 3),
        color: Color.ORANGE,
        intensity: 3,
        range: 10,
      }),
    );
    scene.postProcessStages.ambientOcclusion.enabled = true;
    const effects = [
      new SceneGISScreenSpaceReflections({ scene, enabled: true }),
      new SceneGISScreenSpaceIndirectLighting({ scene, enabled: true }),
    ];
    render();
    expect(renderer.drawCount).toBe(2);
    expect(renderer.groupCount).toBe(1);
    expect(renderer.lightDrawCount).toBe(1);
    const lit = color();
    lights.get(0).show = false;
    render();
    expect(lit[0]).toBeGreaterThan(color()[0] + 0.01);
    effects.forEach((effect) => effect.destroy());
  });
  it("preserves direct-only shadows and evaluates weather once before capture", function () {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: 6999968,
          maximumX: 7000032,
          minimumY: -32,
          maximumY: 32,
        }),
      }),
      maximumLevel: 0,
    });
    scene._initializeWorld(world);
    // This shadow fixture controls its primary light explicitly.
    scene.environmentEffects.enabled = false;
    world.show = false;
    box(
      new MaterialAppearance({ material: material(), translucent: false }),
      0,
      new Cartesian3(8, 8, 0.1),
    );
    box(undefined, -1.5, new Cartesian3(1, 1, 1), 3);
    scene.light.direction = new Cartesian3(1, 0, -1);
    scene.shadowMap.maximumDistance = 30;
    scene.shadowMap.size = 1024;
    scene.shadowMap.darkness = 0;
    render();
    const lit = color(43);
    scene.shadowMap.enabled = true;
    render();
    const shadowed = color(43);
    expect(lit[0]).toBeGreaterThan(shadowed[0] + 0.01);
    expect(sample(renderer._raw.getColorTexture(3), 43)[3]).toBeLessThan(0.2);
    expect(color(43)[0]).toBeGreaterThan(0.19);
    const weather = new SceneGISSurfaceWeather({ scene, enabled: true });
    weather.wetness = 1;
    render();
    const wet = sample(renderer._raw.getColorTexture(0));
    weather.snowCoverage = 1;
    render();
    const snow = sample(renderer._raw.getColorTexture(0));
    expect(snow[0]).toBeGreaterThan(wet[0]);
    expect(sample(renderer._raw.getColorTexture(3)).slice(0, 3)).toEqualEpsilon(
      [0.05, 0.1, 0.15],
      0.001,
    );
  });
  it("keeps actual Entity static and dynamic geometry batches and picking", async function () {
    dataSources = new DataSourceCollection();
    display = new DataSourceDisplay({
      scene,
      dataSourceCollection: dataSources,
    });
    let size = 2;
    const entity = display.defaultDataSource.entities.add({
      position: new Cartesian3(7000000, 0, 0),
      box: { dimensions: new Cartesian3(2, 2, 2), material: Color.CYAN },
    });
    const update = async () =>
      pollToPromise(
        () => {
          const ready = display.update(scene.lastRenderTime);
          render();
          return ready;
        },
        { timeout: 30000 },
      );
    render();
    await update();
    render();
    expect(renderer._phong).toBeDefined();
    expect(color()).toEqualEpsilon([0, 1, 1, 1], 0.002);
    expect(scene.pick(new Cartesian2(32, 32)).id).toBe(entity);
    entity.box.material = Color.RED;
    await update();
    render();
    expect(color()[1]).toBeLessThan(0.001);
    entity.box.dimensions = new CallbackProperty(
      () => new Cartesian3(size, size, size),
      false,
    );
    size = 3;
    await update();
    render();
    expect(renderer._phong).toBeDefined();
    const opaque = scene.frameState.commandList.find(
      (command) =>
        command.owner?.appearance instanceof PerInstanceColorAppearance,
    );
    expect(opaque.renderState.blending.enabled).toBe(false);
    expect(opaque.renderState.depthMask).toBe(true);
    entity.box.material = new Color(1, 0, 0, 0.4);
    await update();
    render();
    expect(renderer._phong).toBeUndefined();
    entity.box.material = Color.CYAN;
    await update();
    render();
    expect(renderer._phong).toBeDefined();
    entity.show = false;
    await update();
    expect(scene.pick(new Cartesian2(32, 32))).toBeUndefined();
  });
  it("releases the shared lighting program after removal and on scene destruction", function () {
    const primitive = box();
    render();
    const group = renderer._phong;
    const destroy = spyOn(
      group.command.shaderProgram,
      "destroy",
    ).and.callThrough();
    scene.primitives.remove(primitive);
    render();
    expect(destroy).toHaveBeenCalled();
    expect(renderer._phong).toBeUndefined();
    box();
    render();
    const raw = renderer._raw.getColorTexture();
    const phong = renderer._phong.command.shaderProgram;
    const release = jasmine.isSpy(phong.destroy)
      ? phong.destroy
      : spyOn(phong, "destroy").and.callThrough();
    release.calls.reset();
    scene.destroyForSpecs();
    scene = undefined;
    expect(release).toHaveBeenCalled();
    expect(raw.isDestroyed()).toBe(true);
  });
});
