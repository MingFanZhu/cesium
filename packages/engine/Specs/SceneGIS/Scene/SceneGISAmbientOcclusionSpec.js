import {
  Cartesian3,
  Cartesian2,
  ClippingPlane,
  ClippingPlaneCollection,
  Color,
  ColorGeometryInstanceAttribute,
  CustomShader,
  UniformType,
  DirectionalLight,
  Globe,
  ImageBasedLighting,
  Matrix4,
  Model,
  OrthographicFrustum,
  PerInstanceColorAppearance,
  Resource,
  SceneGISPlanarBoxGeometry,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarPrimitive,
  SceneGISPlanarWorld,
  SceneTransforms,
  ShadowMode,
  Transforms,
  Primitive,
  GeometryInstance,
  BoxGeometry,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISAmbientOcclusion", function () {
  let scene;
  let world;
  let ao;
  let box;
  function setup(orthographic = false) {
    scene = createScene({ canvas: createCanvas(128, 128), scene3DOnly: true });
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -50,
          minimumY: -50,
          maximumX: 50,
          maximumY: 50,
        }),
      }),
      maximumLevel: 0,
      enableLighting: true,
      baseColor: Color.WHITE,
    });
    scene._initializeWorld(world);
    scene.camera.setView({
      destination: new Cartesian3(0, -20, 24),
      orientation: {
        direction: new Cartesian3(0, 20, -24),
        up: Cartesian3.UNIT_Z,
      },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 200;
    if (orthographic) {
      scene.camera.frustum = new OrthographicFrustum({
        width: 32,
        aspectRatio: 1,
        near: 0.1,
        far: 200,
      });
    }
    scene.light = new DirectionalLight({
      direction: new Cartesian3(0.5, 0.5, -1),
    });
    box = scene.primitives.add(
      new SceneGISPlanarPrimitive({
        id: "ao-box",
        geometry: new SceneGISPlanarBoxGeometry({
          center: new Cartesian3(0, 0, 3),
          dimensions: new Cartesian3(6, 6, 6),
        }),
        appearance: new PerInstanceColorAppearance({
          flat: false,
          closed: true,
          translucent: false,
        }),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
        },
        shadows: ShadowMode.ENABLED,
      }),
    );
    ao = scene.postProcessStages.ambientOcclusion;
    ao.uniforms.lengthCap = 5;
    ao.uniforms.directionCount = 8;
    ao.uniforms.stepCount = 8;
    ao.enabled = true;
  }
  function render() {
    scene.renderForSpecs();
  }
  function pixel(x, y, z = 0) {
    const p = SceneTransforms.worldToWindowCoordinates(
      scene,
      new Cartesian3(x, y, z),
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
    scene?.destroyForSpecs();
    scene = undefined;
  });
  it("uses main HDR depth without extra indexed geometry and preserves shared-target lifecycle", function () {
    setup();
    scene.highDynamicRange = true;
    scene.msaaSamples = 1;
    render();
    const state = ao._sceneGISAmbientOcclusion;
    expect(state.mainPass).toBe(true);
    expect(state.raw.getDepthStencilTexture()).toBeUndefined();
    expect(state.main.framebuffer.numberOfColorAttachments).toBe(2);
    expect(state.rawDepth).toBeUndefined();
    const geometry = new Set(
      scene.frameState.commandList.map((c) => c.vertexArray),
    );
    const draws = spyOn(scene.context, "draw").and.callThrough();
    const geometryDrawCount = () =>
      draws.calls.allArgs().filter(([c]) => geometry.has(c.vertexArray)).length;
    render();
    const count = geometryDrawCount();
    expect(count).toBeGreaterThan(0);
    expect(state.prepassDraws).toBe(0);
    const shaded = pixel(0, -3.5)[0];
    ao.enabled = false;
    draws.calls.reset();
    render();
    expect(geometryDrawCount()).toBe(count);
    expect(pixel(0, -3.5)[0]).toBeGreaterThan(shaded);
    ao.enabled = true;
    render();
    expect(pixel(0, -3.5)[0]).toEqual(shaded);
    ao.uniforms.ambientOcclusionOnly = true;
    render();
    expect(pixel(0, -3.5)[0]).toBeLessThan(230);
    const exposed = pixel(10, -4)[0];
    box.show = false;
    render();
    expect(pixel(0, -3.5)[0]).toEqualEpsilon(exposed, 1);
    const oldTarget = state.main.indirect.getColorTexture();
    scene.canvas.width = 160;
    render();
    expect(oldTarget.isDestroyed()).toBe(true);
    const target = state.main.indirect.getColorTexture();
    scene.destroyForSpecs();
    scene = undefined;
    expect(target.isDestroyed()).toBe(true);
  });
  it("keeps ordinary material occlusion unchanged when classification is enabled", function () {
    setup();
    scene.highDynamicRange = true;
    scene.msaaSamples = 1;
    render();
    const state = ao._sceneGISAmbientOcclusion;
    expect(state.mainPass).toBe(true);
    const main = scene.context.readPixels();
    scene.invertClassification = true;
    render();
    expect(state.mainPass).toBe(true);
    expect(state.prepassDraws).toBe(0);
    const reference = scene.context.readPixels();
    let difference = 0;
    for (let i = 0; i < main.length; ++i) {
      difference = Math.max(difference, Math.abs(main[i] - reference[i]));
    }
    expect(difference).toBeLessThanOrEqual(2);
  });
  [false, true].forEach(function (orthographic) {
    it(`occludes contacts and conserves exposed planes (${orthographic ? "orthographic" : "perspective"})`, function () {
      setup(orthographic);
      render();
      ao.uniforms.ambientOcclusionOnly = true;
      render();
      expect(pixel(0, -3.5)[0]).toBeLessThan(230);
      expect(pixel(10, -4)[0]).toBeGreaterThan(249);
      expect(pixel(0, 0, 6)[0]).toBeGreaterThan(249);
      box.show = false;
      render();
      expect(pixel(0, -3.5)[0]).toBeGreaterThan(249);
    });
  });
  it("reuses targets, preserves unlit surfaces and releases resized resources", function () {
    setup();
    world.enableLighting = false;
    render();
    const unlit = pixel(0, -3.5);
    const state = ao._sceneGISAmbientOcclusion;
    const target = state.filtered.getColorTexture();
    ao.enabled = false;
    render();
    expect(pixel(0, -3.5)).toEqual(unlit);
    ao.enabled = true;
    render();
    expect(state.filtered.getColorTexture()).toBe(target);
    scene.canvas.width = 160;
    render();
    expect(target.isDestroyed()).toBe(true);
    const resized = state.filtered.getColorTexture();
    scene.destroyForSpecs();
    scene = undefined;
    expect(resized.isDestroyed()).toBe(true);
  });
  it("combines with native cascaded shadows and excludes picking", function () {
    setup();
    scene.shadowMap.enabled = true;
    scene.shadowMap.size = 256;
    render();
    const contact = pixel(0, -3.5)[0];
    ao.enabled = false;
    render();
    expect(pixel(0, -3.5)[0]).toBeGreaterThan(contact);
    ao.enabled = true;
    render();
    const state = ao._sceneGISAmbientOcclusion;
    const spy = spyOn(state.estimateCommand, "execute").and.callThrough();
    scene.pick({ x: 64, y: 64 });
    expect(spy).not.toHaveBeenCalled();
  });
  it("reuses deferred AO shaders when only Planar lighting values change", function () {
    setup();
    render();
    const lookup = spyOn(
      scene.context.shaderCache,
      "getDerivedShaderProgram",
    ).and.callThrough();
    const aoLookups = () =>
      lookup.calls
        .allArgs()
        .filter((args) => args[1].startsWith("sceneGIS_lighting_"));
    render();
    expect(aoLookups().length).toBe(0);
    const shaded = pixel(0, -3.5);
    world.enableLighting = false;
    render();
    expect(aoLookups().length).toBe(0);
    expect(pixel(0, -3.5)).not.toEqual(shaded);
    lookup.calls.reset();
    render();
    expect(aoLookups().length).toBe(0);
  });
  it("validates the documented radius contract", function () {
    setup();
    ao.uniforms.lengthCap = 0;
    expect(render).toThrowDeveloperError();
  });
  it("evaluates native uniform callbacks on the current frame", function () {
    setup();
    let radius = 5;
    ao.uniforms.lengthCap = () => radius;
    ao.uniforms.ambientOcclusionOnly = () => true;
    render();
    render();
    expect(pixel(0, -3.5)[0]).toBeLessThan(230);
    radius = 0.01;
    render();
    expect(pixel(0, -3.5)[0]).toBeGreaterThan(249);
  });
  it("validates the optional direction layout and releases it on resize, disable and destroy", function () {
    setup();
    expect(ao.uniforms.directionalOcclusion).toBe(false);
    ao.uniforms.directionalOcclusion = "invalid";
    expect(render).toThrowDeveloperError();
    let directional = true;
    ao.uniforms.directionalOcclusion = () => directional;
    render();
    const state = ao._sceneGISAmbientOcclusion;
    const moment = state.estimate.getColorTexture(1);
    const filtered = state.filtered.getColorTexture();
    render();
    expect(state.estimatePasses).toBe(1);
    expect(state.estimate.getColorTexture(1)).toBe(moment);
    scene.canvas.width = 160;
    render();
    expect(moment.isDestroyed()).toBe(true);
    expect(filtered.isDestroyed()).toBe(true);
    const resized = state.estimate.getColorTexture(1);
    directional = false;
    render();
    expect(resized.isDestroyed()).toBe(true);
    expect(state.directionalReady).toBe(false);
    directional = true;
    render();
    const disabled = state.filtered.getColorTexture();
    ao.enabled = false;
    render();
    expect(disabled.isDestroyed()).toBe(true);
    ao.enabled = true;
    render();
    const destroyed = state.estimate.getColorTexture(1);
    scene.destroyForSpecs();
    scene = undefined;
    expect(destroyed.isDestroyed()).toBe(true);
  });
  it("preserves direct light and uses the ambient fraction on terrain", function () {
    setup();
    render();
    const shaded = pixel(0, -3.5)[0];
    ao.uniforms.ambientOcclusionOnly = true;
    render();
    const visibility = pixel(0, -3.5)[0] / 255;
    ao.enabled = false;
    render();
    const exposed = pixel(0, -3.5)[0];
    const expected = exposed - 255 * 0.3 * (1 - visibility);
    expect(shaded).toEqualEpsilon(expected, 3);
    expect(shaded).toBeGreaterThan(exposed * visibility + 10);
    ao.uniforms.ambientOcclusionOnly = false;
    ao.uniforms.intensity = 0;
    ao.enabled = true;
    render();
    expect(pixel(0, -3.5)[0]).toEqual(exposed);
  });
  it("merges linear depth ranges and reacts to clipping and motion in the same frame", function () {
    setup();
    scene.logarithmicDepthBuffer = false;
    scene.farToNearRatio = 1.3;
    ao.uniforms.ambientOcclusionOnly = true;
    render();
    render();
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    expect(pixel(0, -3.5)[0]).toBeLessThan(230);
    world.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_Z, -1)],
    });
    render();
    expect(pixel(0, -3.5)[0]).toBeGreaterThan(249);
    world.clippingPlanes = undefined;
    box.show = false;
    scene.camera.moveRight(2);
    render();
    expect(pixel(0, -3.5)[0]).toBeGreaterThan(249);
  });
  [false, true].forEach(function (directional) {
    it(`occludes model IBL but preserves direct and emissive HDR radiance (directional=${directional})`, async function () {
      setup();
      ao.uniforms.directionalOcclusion = directional;
      box.show = false;
      scene.highDynamicRange = true;
      const customShader = new CustomShader({
        uniforms: {
          u_emission: {
            type: UniformType.VEC3,
            value: new Cartesian3(2, 1, 0.5),
          },
          u_discard: { type: UniformType.BOOL, value: false },
        },
        fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        material.diffuse = vec3(0.5);
        if (u_discard) { discard; }
        material.roughness = 1.0;
        material.emissive = u_emission;
      }`,
      });
      const ibl = new ImageBasedLighting({
        imageBasedLightingFactor: Cartesian2.ZERO,
      });
      const model = await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, 3)),
        scale: 6,
        imageBasedLighting: ibl,
        customShader,
      });
      scene.primitives.add(model);
      const lookup = spyOn(
        scene.context.shaderCache,
        "getDerivedShaderProgram",
      ).and.callThrough();
      await pollToPromise(() => {
        render();
        return model.ready;
      });
      render();
      const emissive = pixel(0, -3, 0.5);
      const directionLookups = () =>
        lookup.calls
          .allArgs()
          .filter(
            (args) => args[1] === "sceneGIS_directional_environment_occlusion",
          );
      const resolved = new Set(directionLookups().map((args) => args[0]));
      expect(resolved.size > 0).toBe(directional);
      lookup.calls.reset();
      render();
      // Native asynchronous IBL readiness may introduce a new source program.
      expect(directionLookups().every((args) => !resolved.has(args[0]))).toBe(
        true,
      );
      expect(emissive.slice(0, 3).some((c) => c > 0)).toBe(true);
      ao.enabled = false;
      render();
      expect(pixel(0, -3, 0.5)).toEqualEpsilon(emissive, 1);
      customShader.setUniform("u_emission", Cartesian3.ZERO);
      scene.light.color = Color.BLACK;
      ibl.sphericalHarmonicCoefficients = Array.from({ length: 9 }, (_, i) =>
        i === 0 ? new Cartesian3(2, 2, 2) : new Cartesian3(),
      );
      ibl.imageBasedLightingFactor = new Cartesian2(1, 0);
      render();
      const openIBL = pixel(0, -3, 0.5)[0];
      ao.enabled = true;
      render();
      const occluded = pixel(0, -3, 0.5)[0];
      expect(openIBL).toBeGreaterThan(occluded + 5);
      ao.uniforms.directionalOcclusion = !directional;
      render();
      expect(pixel(0, -3, 0.5)[0]).toEqualEpsilon(occluded, 1);
      ao.uniforms.directionalOcclusion = directional;
      expect(ao._sceneGISAmbientOcclusion.mainPass).toBe(true);
      expect(ao._sceneGISAmbientOcclusion.prepassDraws).toBe(0);
      ao.uniforms.ambientOcclusionOnly = true;
      render();
      const contact = pixel(0, -3.5)[0];
      customShader.setUniform("u_discard", true);
      render();
      expect(pixel(0, -3.5)[0]).toBeGreaterThan(contact + 5);
      customShader.setUniform("u_discard", false);
      scene.highDynamicRange = false;
      ao.uniforms.ambientOcclusionOnly = true;
      render();
      expect(ao._sceneGISAmbientOcclusion.prepassDraws).toBe(0);
      expect(pixel(0, -3.5)[0]).toBeLessThan(230);
      customShader.setUniform("u_discard", true);
      render();
      expect(pixel(0, -3.5)[0]).toBeGreaterThan(249);
      scene.primitives.remove(model);
      customShader.destroy();
      ibl.destroy();
    });
  });
  it("preserves native alpha-mask and moving model clipping coverage in shared deferred depth", async function () {
    setup();
    ao.uniforms.directionalOcclusion = true;
    box.show = false;
    ao.uniforms.ambientOcclusionOnly = true;
    const basePath = "./Data/Models/glTF-2.0/BoxCutout/glTF/";
    const gltf = await Resource.fetchJson(`${basePath}BoxCutout.gltf`);
    for (const material of gltf.materials) {
      material.alphaMode = "MASK";
    }
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        gltf,
        basePath,
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, 3)),
        scale: 6,
        clippingPlanes: new ClippingPlaneCollection({
          planes: [new ClippingPlane(Cartesian3.UNIT_X, 0)],
        }),
      }),
    );
    await pollToPromise(() => {
      render();
      return model.ready;
    });
    render();
    const state = ao._sceneGISAmbientOcclusion;
    const command = scene.frameState.commandList.find((c) => c.owner === model);
    expect(command.shaderProgram.fragmentShaderSource.defines).toContain(
      "ALPHA_MODE_MASK",
    );
    const clipped = scene.context.readPixels();
    model.clippingPlanes.get(0).distance = 2;
    render();
    const moved = scene.context.readPixels();
    expect(moved).not.toEqual(clipped);
    expect(moved.some((value, index) => index % 4 === 0 && value < 230)).toBe(
      true,
    );
    expect(state.prepassDraws).toBe(0);
    expect(state.sourceDepth).toBe(scene._sceneGISDeferred._linearDepth);
  });
  it("occludes local Globe contacts and conserves sky", async function () {
    scene = createScene({ canvas: createCanvas(128, 128), scene3DOnly: true });
    scene.globe = new Globe();
    scene.globe.baseColor = Color.WHITE;
    scene.globe.enableLighting = true;
    scene.globe.showGroundAtmosphere = false;
    scene.globe.maximumScreenSpaceError = 1000;
    scene.fog.enabled = false;
    const frame = Transforms.eastNorthUpToFixedFrame(
      Cartesian3.fromDegrees(0, 0),
    );
    function local(x, y, z) {
      return Matrix4.multiplyByPoint(
        frame,
        new Cartesian3(x, y, z),
        new Cartesian3(),
      );
    }
    scene.camera.setView({
      destination: local(0, -25, 25),
      orientation: {
        direction: Matrix4.multiplyByPointAsVector(
          frame,
          new Cartesian3(0, 1, -1),
          new Cartesian3(),
        ),
        up: Matrix4.multiplyByPointAsVector(
          frame,
          Cartesian3.UNIT_Z,
          new Cartesian3(),
        ),
      },
    });
    scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(6, 6, 6),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.multiplyByTranslation(
            frame,
            new Cartesian3(0, 0, 3),
            new Matrix4(),
          ),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          closed: true,
          translucent: false,
        }),
        asynchronous: false,
      }),
    );
    ao = scene.postProcessStages.ambientOcclusion;
    ao.uniforms.lengthCap = 5;
    ao.uniforms.ambientOcclusionOnly = true;
    ao.enabled = true;
    await pollToPromise(() => {
      render();
      return scene.globe.tilesLoaded;
    });
    render();
    const p = SceneTransforms.worldToWindowCoordinates(
      scene,
      local(0, -3.5, 0),
    );
    const contact = scene.context.readPixels({
      x: Math.floor(p.x),
      y: 127 - Math.floor(p.y),
      width: 1,
      height: 1,
    });
    expect(contact[0]).toBeLessThan(235);
    scene.highDynamicRange = true;
    scene.globe.depthTestAgainstTerrain = true;
    render();
    expect(ao._sceneGISAmbientOcclusion.mainPass).toBe(true);
    expect(ao._sceneGISAmbientOcclusion.prepassDraws).toBe(0);
    scene.highDynamicRange = false;
    // AO sky identity is independent of the final solar white-point transform.
    scene.environmentEffects.whiteBalance = false;
    scene.camera.setView({
      destination: local(0, -25, 25),
      orientation: {
        direction: Matrix4.multiplyByPointAsVector(
          frame,
          Cartesian3.UNIT_Z,
          new Cartesian3(),
        ),
        up: Matrix4.multiplyByPointAsVector(
          frame,
          Cartesian3.UNIT_Y,
          new Cartesian3(),
        ),
      },
    });
    render();
    const sky = scene.context.readPixels({
      x: 64,
      y: 120,
      width: 1,
      height: 1,
    });
    expect(sky[0]).toBe(255);
  });
});
