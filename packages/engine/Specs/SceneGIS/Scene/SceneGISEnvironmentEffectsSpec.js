import {
  BoxGeometry,
  BoundingRectangle,
  Cartesian3,
  ClearCommand,
  Color,
  ColorGeometryInstanceAttribute,
  Ellipsoid,
  Framebuffer,
  GeometryInstance,
  Globe,
  JulianDate,
  Matrix4,
  PassState,
  PerInstanceColorAppearance,
  PixelDatatype,
  PixelFormat,
  Primitive,
  Resource,
  SceneGISEnvironmentEffects,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarEnvironment,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  Texture,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";
import Buffer from "../../../Source/Renderer/Buffer.js";
import ShaderProgram from "../../../Source/Renderer/ShaderProgram.js";
import SceneGISEnvironmentEffectsRenderer from "../../../Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js";
import aerialFragmentSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsAerialFS.js";
import atmosphereSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.js";
import backgroundFragmentSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsBackgroundFS.js";
import heightFogSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISExponentialHeightFog.js";

describe("SceneGIS/Scene/SceneGISEnvironmentEffects", function () {
  let scene;
  let effects;
  let environment;

  function createWorld() {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -1000000.0,
          minimumY: -1000000.0,
          maximumX: 1000000.0,
          maximumY: 1000000.0,
        }),
      }),
      maximumLevel: 0,
    });
  }

  function hideNativeEnvironment(targetScene) {
    if (targetScene.skyAtmosphere) {
      targetScene.skyAtmosphere.show = false;
    }
    if (targetScene.skyBox) {
      targetScene.skyBox.show = false;
    }
    if (targetScene.sun) {
      targetScene.sun.show = false;
    }
    if (targetScene.moon) {
      targetScene.moon.show = false;
    }
    targetScene.sunBloom = false;
    targetScene.fog.enabled = false;
    if (targetScene.globe) {
      targetScene.globe.showGroundAtmosphere = false;
    }
  }

  function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise(function (resolvePromise, rejectPromise) {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  function connectGlobeWithDeferredAssets() {
    scene = createScene();
    scene.globe = new Globe(Ellipsoid.WGS84);
    hideNativeEnvironment(scene);
    scene.highDynamicRange = true;
    const requests = [createDeferred(), createDeferred(), createDeferred()];
    let requestIndex = 0;
    spyOn(Resource, "fetchArrayBuffer").and.callFake(function () {
      return requests[requestIndex++].promise;
    });
    effects = new SceneGISEnvironmentEffects({
      mode: "globe",
      enabled: true,
      showHeightFog: false,
    });
    effects.connectedCallback({});
    return requests;
  }

  function connectPlanar() {
    scene = createScene({ scene3DOnly: true });
    const world = createWorld();
    scene._initializeWorld(world);
    hideNativeEnvironment(scene);
    scene.highDynamicRange = true;
    environment = new SceneGISPlanarEnvironment({
      world,
      showAtmosphere: false,
      showSun: false,
      showMoon: false,
      sunDirection: new Cartesian3(1.0, 0.0, 1.0),
      moonDirection: new Cartesian3(-1.0, 0.0, 1.0),
    });
    environment.connectedCallback({});
    environment.firstUpdate(scene, scene.frameState.time);
    effects = new SceneGISEnvironmentEffects({
      mode: "planar",
      world,
      enabled: true,
      showHeightFog: false,
    });
    effects.connectedCallback({});
    return world;
  }

  async function publishPlanarResources() {
    effects.firstUpdate(scene, scene.frameState.time);
    await pollToPromise(function () {
      effects.update(scene, scene.frameState.time);
      return effects.ready;
    });
  }

  function createLutBuffers() {
    return {
      transmittance: new ArrayBuffer(256 * 64 * 4 * 2),
      scattering: new ArrayBuffer(256 * 128 * 32 * 4 * 2),
      irradiance: new ArrayBuffer(64 * 16 * 4 * 2),
    };
  }

  function readCenterPixel() {
    return Array.from(scene.context.readPixels({ width: 1, height: 1 }));
  }

  function readFramePixels() {
    return Array.from(
      scene.context.readPixels({
        width: scene.context.drawingBufferWidth,
        height: scene.context.drawingBufferHeight,
      }),
    );
  }

  function maximumRgbDelta(left, right) {
    let maximum = 0;
    for (let index = 0; index < left.length; index += 4) {
      maximum = Math.max(
        maximum,
        Math.abs(left[index] - right[index]) +
          Math.abs(left[index + 1] - right[index + 1]) +
          Math.abs(left[index + 2] - right[index + 2]),
      );
    }
    return maximum;
  }

  function rgbEnergy(pixel) {
    return pixel[0] + pixel[1] + pixel[2];
  }

  function decodeFloat16(bits) {
    const sign = bits & 0x8000 ? -1.0 : 1.0;
    const exponent = (bits >>> 10) & 0x1f;
    const fraction = bits & 0x3ff;
    if (exponent === 0) {
      return sign * Math.pow(2.0, -14.0) * (fraction / 1024.0);
    }
    if (exponent === 0x1f) {
      return fraction === 0 ? sign * Infinity : Number.NaN;
    }
    return sign * Math.pow(2.0, exponent - 15.0) * (1.0 + fraction / 1024.0);
  }

  function expectFiniteHdrStorage(pixel) {
    for (let channel = 0; channel < 3; channel++) {
      expect(Number.isFinite(pixel[channel])).toBe(true);
      expect(Math.abs(pixel[channel])).toBeLessThanOrEqual(65504.0);
    }
  }

  function renderBackgroundHalfFloat() {
    const colorTexture = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [colorTexture],
      destroyAttachments: false,
    });
    const passState = new PassState(scene.context);
    passState.framebuffer = framebuffer;
    passState.viewport = new BoundingRectangle(0, 0, 1, 1);
    const command = effects._pipeline._resources.backgroundCommand;

    try {
      command.framebuffer = framebuffer;
      effects._pipeline.renderBackground(scene.frameState, passState);
      return Array.from(
        scene.context.readPixels({ framebuffer, width: 1, height: 1 }),
        decodeFloat16,
      );
    } finally {
      command.framebuffer = undefined;
      framebuffer.destroy();
      colorTexture.destroy();
    }
  }

  afterEach(function () {
    if (effects?._element) {
      effects.disconnectedCallback(effects._element);
    }
    if (environment?._element) {
      environment.disconnectedCallback(environment._element);
    }
    if (scene && !scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
    scene = undefined;
    effects = undefined;
    environment = undefined;
  });

  it("validates the frozen constructor contract", function () {
    const world = createWorld();
    expect(function () {
      return new SceneGISEnvironmentEffects({});
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISEnvironmentEffects({ mode: "earth" });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISEnvironmentEffects({ mode: "globe", world });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISEnvironmentEffects({ mode: "planar" });
    }).toThrowDeveloperError();
    for (const property of ["backgroundRadianceScale", "aerialRadianceScale"]) {
      for (const value of [-1.0, 64.1, Number.NaN, Infinity]) {
        expect(function () {
          return new SceneGISEnvironmentEffects({
            mode: "globe",
            [property]: value,
          });
        }).toThrowDeveloperError();
      }
    }
    const fogRanges = {
      heightFogDensity: [0.0, 0.001],
      heightFogHeightFalloff: [0.0, 0.001],
      heightFogBaseHeight: [-60000.0, 60000.0],
      heightFogStartDistance: [0.0, 300000.0],
      heightFogMaximumOpacity: [0.0, 1.0],
      heightFogInscatteringScale: [0.0, 64.0],
      heightFogDirectionalInscatteringScale: [0.0, 64.0],
      heightFogDirectionalInscatteringExponent: [1.0, 128.0],
    };
    for (const [property, range] of Object.entries(fogRanges)) {
      for (const value of [
        range[0] - 1.0,
        range[1] + 1.0,
        Number.NaN,
        Infinity,
      ]) {
        expect(function () {
          return new SceneGISEnvironmentEffects({
            mode: "globe",
            [property]: value,
          });
        }).toThrowDeveloperError();
      }
    }

    effects = new SceneGISEnvironmentEffects({ mode: "globe" });
    expect(effects.mode).toBe("globe");
    expect(effects.world).toBeUndefined();
    expect(effects.enabled).toBe(false);
    expect(effects.showAtmosphere).toBe(true);
    expect(effects.showAerialPerspective).toBe(true);
    expect(effects.showHeightFog).toBe(true);
    expect(effects.backgroundRadianceScale).toBe(10.0);
    expect(effects.aerialRadianceScale).toBe(1.0);
    expect(effects.heightFogDensity).toBe(0.000008);
    expect(effects.heightFogHeightFalloff).toBe(0.0002);
    expect(effects.heightFogBaseHeight).toBe(0.0);
    expect(effects.heightFogStartDistance).toBe(250.0);
    expect(effects.heightFogMaximumOpacity).toBe(0.7);
    expect(effects.heightFogInscatteringScale).toBe(0.35);
    expect(effects.heightFogDirectionalInscatteringScale).toBe(0.15);
    expect(effects.heightFogDirectionalInscatteringExponent).toBe(8.0);
    expect("radianceScale" in effects).toBe(false);
    expect(effects.ready).toBe(false);
    expect(effects.errorEvent).toBeDefined();

    effects = new SceneGISEnvironmentEffects({
      mode: "globe",
      backgroundRadianceScale: 3.0,
      aerialRadianceScale: 0.5,
      showHeightFog: false,
      heightFogDensity: 0.0001,
      heightFogHeightFalloff: 0.0,
      heightFogBaseHeight: 100.0,
      heightFogStartDistance: 500.0,
      heightFogMaximumOpacity: 0.5,
      heightFogInscatteringScale: 0.7,
      heightFogDirectionalInscatteringScale: 0.3,
      heightFogDirectionalInscatteringExponent: 16.0,
    });
    expect(effects.backgroundRadianceScale).toBe(3.0);
    expect(effects.aerialRadianceScale).toBe(0.5);
    expect(effects.showHeightFog).toBe(false);
    expect(effects.heightFogDensity).toBe(0.0001);
    expect(effects.heightFogHeightFalloff).toBe(0.0);
    expect(effects.heightFogBaseHeight).toBe(100.0);
    expect(effects.heightFogStartDistance).toBe(500.0);
    expect(effects.heightFogMaximumOpacity).toBe(0.5);
    expect(effects.heightFogInscatteringScale).toBe(0.7);
    expect(effects.heightFogDirectionalInscatteringScale).toBe(0.3);
    expect(effects.heightFogDirectionalInscatteringExponent).toBe(16.0);
    world.destroy();
  });

  it("keeps default disabled registration mutation-free", function () {
    scene = createScene();
    effects = new SceneGISEnvironmentEffects({ mode: "globe" });
    const fetch = spyOn(Resource, "fetchArrayBuffer").and.callThrough();
    const requestRender = spyOn(scene, "requestRender").and.callThrough();

    effects.connectedCallback({});

    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
    expect(effects.ready).toBe(false);
  });

  it("provides read-only capability preflight", function () {
    scene = createScene();
    const fetch = spyOn(Resource, "fetchArrayBuffer").and.callThrough();
    const requestRender = spyOn(scene, "requestRender").and.callThrough();

    expect(typeof SceneGISEnvironmentEffects.isSupported(scene)).toBe(
      "boolean",
    );
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();
    expect(function () {
      SceneGISEnvironmentEffects.isSupported({});
    }).toThrowDeveloperError();
  });

  it("fails deterministic Globe conflicts before attachment or fetch", function () {
    scene = createScene();
    scene.globe = new Globe(Ellipsoid.WGS84);
    scene.highDynamicRange = true;
    effects = new SceneGISEnvironmentEffects({
      mode: "globe",
      enabled: true,
    });
    effects.connectedCallback({});
    const fetch = spyOn(Resource, "fetchArrayBuffer").and.callThrough();

    expect(function () {
      effects.firstUpdate(scene, scene.frameState.time);
    }).toThrowDeveloperError();
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails deterministic planar native conflicts before attachment", function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    scene.fog.enabled = true;

    expect(function () {
      effects.firstUpdate(scene, scene.frameState.time);
    }).toThrowDeveloperError();
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
    expect(effects._pipeline).toBeUndefined();
    scene.fog.enabled = false;
  });

  it("publishes planar Texture3D resources, toggles warm, and re-registers", async function () {
    const fetchArrayBuffer = Resource.fetchArrayBuffer;
    const fetch = spyOn(Resource, "fetchArrayBuffer").and.callFake(
      function (url) {
        return fetchArrayBuffer(url);
      },
    );
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }

    await publishPlanarResources();
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const call of fetch.calls.all()) {
      expect(String(call.args[0])).toContain(
        "Assets/SceneGIS/Environment/PlanarEarth/",
      );
      expect(String(call.args[0])).not.toContain("BrunetonEarth");
    }
    expect(effects.ready).toBe(true);
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBe(effects._pipeline);
    const resources = effects._pipeline._resources;
    expect(resources.transmittanceTexture.sizeInBytes).toBe(131072);
    expect(resources.scatteringTexture.width).toBe(256);
    expect(resources.scatteringTexture.height).toBe(128);
    expect(resources.scatteringTexture.depth).toBe(32);
    expect(resources.scatteringTexture.sizeInBytes).toBe(8388608);
    expect(resources.irradianceTexture.sizeInBytes).toBe(8192);
    expect(resources.vertexArray).toBeDefined();
    expect(resources.backgroundProgram).toBeDefined();
    expect(resources.aerialProgram).toBeDefined();
    expect(resources.aerialLogDepthProgram).toBeDefined();
    expect(resources.aerialLogDepthProgram).not.toBe(resources.aerialProgram);
    const destroyAerialProgram = spyOn(
      resources.aerialProgram,
      "destroy",
    ).and.callThrough();
    const destroyAerialLogDepthProgram = spyOn(
      resources.aerialLogDepthProgram,
      "destroy",
    ).and.callThrough();

    effects.enabled = false;
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
    expect(effects.ready).toBe(true);
    effects.enabled = true;
    effects.update(scene, scene.frameState.time);
    expect(effects._pipeline._resources).toBe(resources);

    const element = effects._element;
    effects.disconnectedCallback(element);
    expect(effects.ready).toBe(false);
    expect(resources.vertexArray.isDestroyed()).toBe(true);
    expect(resources.transmittanceTexture.isDestroyed()).toBe(true);
    expect(resources.scatteringTexture.isDestroyed()).toBe(true);
    expect(resources.irradianceTexture.isDestroyed()).toBe(true);
    expect(destroyAerialProgram).toHaveBeenCalledTimes(1);
    expect(destroyAerialLogDepthProgram).toHaveBeenCalledTimes(1);
    effects.connectedCallback(element);
    await publishPlanarResources();
  });

  it("keeps both hidden at zero work and allocates aerial HDR only on demand", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    effects.showAtmosphere = false;
    effects.showAerialPerspective = false;
    effects.firstUpdate(scene, scene.frameState.time);
    effects.update(scene, scene.frameState.time);
    expect(effects.ready).toBe(false);
    expect(effects._pipeline._resources).toBeUndefined();

    effects.showAtmosphere = true;
    await pollToPromise(function () {
      effects.update(scene, scene.frameState.time);
      return effects.ready;
    });
    scene.renderForSpecs();
    expect(effects._pipeline._resources.aerialFramebuffer).toBeUndefined();

    effects.showAerialPerspective = true;
    scene.renderForSpecs();
    const firstAerialFramebuffer =
      effects._pipeline._resources.aerialFramebuffer;
    expect(firstAerialFramebuffer).toBeDefined();
    const firstFramebuffer = firstAerialFramebuffer.framebuffer;
    scene.canvas.width += 1;
    scene.canvas.height += 1;
    scene.renderForSpecs();
    expect(effects._pipeline._resources.aerialFramebuffer).not.toBe(
      firstAerialFramebuffer,
    );
    expect(firstFramebuffer.isDestroyed()).toBe(true);
  });

  it("keys the aerial pass viewport to an input-sized texture", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    const command = effects._pipeline._resources.aerialCommand;
    const execute = spyOn(command, "execute");
    const input = scene.context.defaultTexture;
    scene.canvas.width = 4;
    scene.canvas.height = 3;

    effects._pipeline.executeHdr(scene.context, input, input, input);

    expect(input.width).not.toBe(scene.context.drawingBufferWidth);
    const passState = execute.calls.mostRecent().args[1];
    expect(passState.viewport.x).toBe(0);
    expect(passState.viewport.y).toBe(0);
    expect(passState.viewport.width).toBe(input.width);
    expect(passState.viewport.height).toBe(input.height);
    expect(
      effects._pipeline._resources.aerialFramebuffer.getColorTexture(0).width,
    ).toBe(input.width);
  });

  it("selects precompiled linear and log-depth aerial variants without resource churn", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    const resources = effects._pipeline._resources;
    const command = resources.aerialCommand;
    const input = scene.context.defaultTexture;
    const fetch = spyOn(Resource, "fetchArrayBuffer");
    const compile = spyOn(ShaderProgram, "fromCache");

    scene.frameState.useLogDepth = false;
    effects._pipeline.executeHdr(scene.context, input, input, input);
    expect(command.shaderProgram).toBe(resources.aerialProgram);

    scene.frameState.useLogDepth = true;
    effects._pipeline.executeHdr(scene.context, input, input, input);
    expect(command.shaderProgram).toBe(resources.aerialLogDepthProgram);

    scene.frameState.useLogDepth = false;
    effects._pipeline.executeHdr(scene.context, input, input, input);
    expect(command.shaderProgram).toBe(resources.aerialProgram);
    expect(effects._pipeline._resources).toBe(resources);
    expect(fetch).not.toHaveBeenCalled();
    expect(compile).not.toHaveBeenCalled();
  });

  it("updates both radiance scales as independent warm uniforms only", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    const resources = effects._pipeline._resources;
    const requestRender = spyOn(scene, "requestRender").and.callThrough();
    const fetch = spyOn(Resource, "fetchArrayBuffer");
    const compile = spyOn(ShaderProgram, "fromCache");

    requestRender.calls.reset();
    for (const entry of [
      {
        property: "backgroundRadianceScale",
        uniform: "u_backgroundRadianceScale",
      },
      {
        property: "aerialRadianceScale",
        uniform: "u_aerialRadianceScale",
      },
    ]) {
      for (const scale of [0.0, 1.0, 2.0, 64.0]) {
        effects[entry.property] = scale;
        expect(effects._pipeline._uniformMap[entry.uniform]()).toBe(scale);
      }
    }

    expect(requestRender).toHaveBeenCalledTimes(8);
    expect(fetch).not.toHaveBeenCalled();
    expect(compile).not.toHaveBeenCalled();
    expect(effects._pipeline._resources).toBe(resources);
    expect(resources.aerialProgram.isDestroyed()).toBe(false);
    expect(resources.aerialLogDepthProgram.isDestroyed()).toBe(false);
    function setCalibrationScale(property, value) {
      effects[property] = value;
    }
    for (const property of ["backgroundRadianceScale", "aerialRadianceScale"]) {
      for (const value of [-1.0, 64.1, Number.NaN, Infinity]) {
        expect(
          setCalibrationScale.bind(undefined, property, value),
        ).toThrowDeveloperError();
      }
    }
  });

  it("updates all height-fog controls as warm uniforms only", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    const resources = effects._pipeline._resources;
    const requestRender = spyOn(scene, "requestRender").and.callThrough();
    const fetch = spyOn(Resource, "fetchArrayBuffer");
    const compile = spyOn(ShaderProgram, "fromCache");
    const entries = [
      ["heightFogDensity", "u_heightFogDensity", 0.00008],
      ["heightFogHeightFalloff", "u_heightFogHeightFalloff", 0.0001],
      ["heightFogBaseHeight", "u_heightFogBaseHeight", 500.0],
      ["heightFogStartDistance", "u_heightFogStartDistance", 1000.0],
      ["heightFogMaximumOpacity", "u_heightFogMaximumOpacity", 0.5],
      ["heightFogInscatteringScale", "u_heightFogInscatteringScale", 0.7],
      [
        "heightFogDirectionalInscatteringScale",
        "u_heightFogDirectionalInscatteringScale",
        0.4,
      ],
      [
        "heightFogDirectionalInscatteringExponent",
        "u_heightFogDirectionalInscatteringExponent",
        16.0,
      ],
    ];

    requestRender.calls.reset();
    effects.showHeightFog = true;
    for (const [property, uniform, value] of entries) {
      effects[property] = value;
      expect(effects._pipeline._uniformMap[uniform]()).toBe(value);
    }
    expect(effects._pipeline._uniformMap.u_showHeightFog()).toBe(true);
    expect(requestRender).toHaveBeenCalledTimes(9);
    expect(fetch).not.toHaveBeenCalled();
    expect(compile).not.toHaveBeenCalled();
    expect(effects._pipeline._resources).toBe(resources);

    requestRender.calls.reset();
    effects.showHeightFog = true;
    for (const [property, , value] of entries) {
      effects[property] = value;
    }
    expect(requestRender).not.toHaveBeenCalled();

    effects.enabled = false;
    requestRender.calls.reset();
    effects.heightFogDensity = 0.00009;
    effects.showHeightFog = false;
    expect(requestRender).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(compile).not.toHaveBeenCalled();
    expect(effects._pipeline._resources).toBe(resources);
  });

  it("keeps height fog bounded, atmosphere-aware, and calibration-isolated in shader source", function () {
    expect(heightFogSource).toContain(
      "SCENEGIS_HEIGHT_FOG_GLOBE_SAMPLE_COUNT = 16",
    );
    expect(heightFogSource).toContain("for (int i = 0; i < 8; ++i)");
    expect(heightFogSource).toContain("sceneGISHeightFogPlanarOpticalDepth");
    expect(heightFogSource).toContain(
      "sceneGISHeightFogExponentialIntegralRatio",
    );
    expect(heightFogSource).toContain("absoluteX < 1.0e-2");
    expect(heightFogSource).not.toContain("startDensity - endDensity");
    expect(heightFogSource).not.toContain("abs(viewDirection.z) <= 1.0e-7");
    expect(heightFogSource).toContain("sceneGISHeightFogGlobeOpticalDepth");
    expect(heightFogSource).toContain("GetTransmittanceToSun");
    expect(heightFogSource).toContain("sceneGISPlanarSegmentTransmittance");
    expect(heightFogSource).toContain("sceneGISHeightFogAmbientSource");
    expect(heightFogSource).toContain("sceneGISHeightFogDirectionalSource");
    expect(heightFogSource).toContain("SCENEGIS_SOLAR_IRRADIANCE * scattering");
    expect(heightFogSource).not.toContain("sceneGISHeightFogChromaticity");
    expect(heightFogSource).toContain(
      "segmentStart + SCENEGIS_HEIGHT_FOG_MAX_DISTANCE",
    );
    expect(heightFogSource).not.toContain("backgroundRadianceScale");
    expect(heightFogSource).not.toContain("aerialRadianceScale");
    expect(backgroundFragmentSource).toContain(
      "sceneGISApplyExponentialHeightFog",
    );
    expect(aerialFragmentSource).toContain("sceneGISApplyExponentialHeightFog");
    expect(aerialFragmentSource.indexOf("u_aerialRadianceScale")).toBeLessThan(
      aerialFragmentSource.indexOf("sceneGISApplyExponentialHeightFog"),
    );
    expect(
      aerialFragmentSource.indexOf("sceneGISApplyExponentialHeightFog"),
    ).toBeLessThan(
      aerialFragmentSource.indexOf(
        "sceneGISGuardHdrStorage(sceneLinearRadiance)",
      ),
    );
  });

  it("keeps the planar analytic fog integral stable in shader-equivalent float32 arithmetic", function () {
    const f32 = Math.fround;

    function referenceIntegral(
      startHeight,
      vertical,
      distance,
      density,
      falloff,
    ) {
      const startDensity = density * Math.exp(-falloff * startHeight);
      const x = falloff * vertical * distance;
      const ratio = x === 0.0 ? 1.0 : -Math.expm1(-x) / x;
      return Math.min(startDensity * distance * ratio, 80.0);
    }

    function shaderRatio(value) {
      const x = f32(value);
      if (Math.abs(x) < 1.0e-2) {
        const xSquared = f32(x * x);
        return f32(
          f32(f32(1.0 - f32(0.5 * x)) + f32(xSquared / 6.0)) -
            f32(f32(xSquared * x) / 24.0),
        );
      }
      if (x > 0.0) {
        return f32(f32(1.0 - f32(Math.exp(-Math.min(x, 80.0)))) / x);
      }
      return f32(f32(f32(Math.exp(Math.min(-x, 80.0))) - 1.0) / f32(-x));
    }

    function shaderIntegral(startHeight, vertical, distance, density, falloff) {
      const localDistance = f32(distance);
      const localFalloff = f32(falloff);
      const localDensity = f32(density);
      const exponent = Math.max(
        -80.0,
        Math.min(80.0, f32(-f32(localFalloff * f32(startHeight)))),
      );
      const startDensity = f32(localDensity * f32(Math.exp(exponent)));
      if (localFalloff <= 1.0e-10) {
        return Math.min(f32(startDensity * localDistance), 80.0);
      }
      const x = f32(f32(localFalloff * f32(vertical)) * localDistance);
      const scaledDistance = f32(localDistance * shaderRatio(x));
      if (startDensity >= f32(80.0 / Math.max(scaledDistance, 1.0e-30))) {
        return 80.0;
      }
      return f32(startDensity * scaledDistance);
    }

    const cases = [];
    for (const density of [0.000008, 0.001]) {
      for (const distance of [250.0, 1000.0]) {
        for (const vertical of [-1.01e-7, -0.99e-7, 0.0, 0.99e-7, 1.01e-7]) {
          cases.push({ density, distance, vertical, falloff: 0.0002 });
        }
      }
    }
    cases.push({
      density: 0.001,
      distance: 1000.0,
      vertical: 1.01e-7,
      falloff: 0.0,
    });

    for (const testCase of cases) {
      const actual = shaderIntegral(
        1000.0,
        testCase.vertical,
        testCase.distance,
        testCase.density,
        testCase.falloff,
      );
      const expected = referenceIntegral(
        1000.0,
        testCase.vertical,
        testCase.distance,
        testCase.density,
        testCase.falloff,
      );
      expect(Number.isFinite(actual)).toBe(true);
      expect(actual).toBeGreaterThan(0.0);
      expect(Math.abs(actual - expected) / expected).toBeLessThan(2.0e-6);
    }

    for (const distance of [250.0, 1000.0]) {
      const below = shaderIntegral(1000.0, 0.99e-7, distance, 0.001, 0.0002);
      const above = shaderIntegral(1000.0, 1.01e-7, distance, 0.001, 0.0002);
      expect(Math.abs(above - below) / Math.max(above, below)).toBeLessThan(
        1.0e-6,
      );
    }
  });

  it("keeps the fixed-reference fog source bounded and preserves Sun transmittance magnitude", function () {
    const solarIrradiance = [1.474, 1.8504, 1.91198];
    const rayleigh = [5.802e-6, 1.3558e-5, 3.31e-5];
    const mieScattering = [3.996e-6, 3.996e-6, 3.996e-6];
    const scattering = rayleigh.map(
      (component, index) => component + mieScattering[index],
    );
    const ambientReference = solarIrradiance.map(
      (component, index) => component * scattering[index],
    );
    const ambientDenominator = Math.max(...ambientReference);
    const directionalDenominator = Math.max(...solarIrradiance);

    function sources(transmittance) {
      const sunColor = solarIrradiance.map(
        (component) => component * transmittance,
      );
      return {
        ambient: sunColor.map(
          (component, index) =>
            (component * scattering[index]) / ambientDenominator,
        ),
        directional: sunColor.map(
          (component) => component / directionalDenominator,
        ),
      };
    }

    const unattenuated = sources(1.0);
    expect(Math.max(...unattenuated.ambient)).toBeLessThanOrEqual(1.0);
    expect(Math.max(...unattenuated.directional)).toBeLessThanOrEqual(1.0);
    expect(Math.max(...unattenuated.ambient)).toBeCloseTo(1.0, 14);
    expect(Math.max(...unattenuated.directional)).toBeCloseTo(1.0, 14);

    const attenuated = sources(0.25);
    expect(Math.max(...attenuated.ambient)).toBeCloseTo(0.25, 14);
    expect(Math.max(...attenuated.directional)).toBeCloseTo(0.25, 14);
    expect(Math.max(...attenuated.ambient)).toBeLessThan(
      Math.max(...unattenuated.ambient),
    );
    expect(Math.max(...attenuated.directional)).toBeLessThan(
      Math.max(...unattenuated.directional),
    );

    const occluded = sources(0.0);
    expect(occluded.ambient).toEqual([0.0, 0.0, 0.0]);
    expect(occluded.directional).toEqual([0.0, 0.0, 0.0]);
  });

  it("keeps the corrected default near fog unsaturated, strengthens distance, and honors the opacity cap", function () {
    const density = 0.000008;
    const startDistance = 250.0;
    const maximumOpacity = 0.7;
    function fogAmount(distance) {
      const opticalDepth = density * Math.max(distance - startDistance, 0.0);
      return Math.min(1.0 - Math.exp(-opticalDepth), maximumOpacity);
    }

    const near = fogAmount(105000.0);
    const far = fogAmount(300000.0);
    const beyondCap = fogAmount(1000000.0);
    expect(near).toBeGreaterThan(0.0);
    expect(near).toBeLessThan(maximumOpacity);
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThanOrEqual(maximumOpacity);
    expect(beyondCap).toBe(maximumOpacity);
  });

  it("matches planar analytic and Globe 16-sample fog integrals to CPU references", function () {
    const density = 0.00004;
    const falloff = 0.0002;
    const bottomRadius = 6360000.0;
    const nodes = [
      0.0950125098, 0.2816035508, 0.4580167777, 0.6178762444, 0.7554044083,
      0.8656312024, 0.9445750231, 0.9894009349,
    ];
    const weights = [
      0.1894506105, 0.182603415, 0.1691565194, 0.1495959888, 0.1246289713,
      0.0951585117, 0.0622535239, 0.0271524594,
    ];

    function planarIntegral(startHeight, vertical, distance, localFalloff) {
      const startDensity = density * Math.exp(-localFalloff * startHeight);
      const x = localFalloff * vertical * distance;
      const ratio = x === 0.0 ? 1.0 : -Math.expm1(-x) / x;
      return startDensity * distance * ratio;
    }

    expect(planarIntegral(1000.0, 0.0, 50000.0, falloff)).toBeCloseTo(
      density * Math.exp(-falloff * 1000.0) * 50000.0,
      12,
    );
    expect(planarIntegral(1000.0, 1.0, 59000.0, 0.0)).toBeCloseTo(
      density * 59000.0,
      12,
    );
    const shallow = [50000.0, 150000.0, 300000.0].map((distance) =>
      planarIntegral(1000.0, 0.001, distance, falloff),
    );
    expect(shallow[1]).toBeGreaterThan(shallow[0]);
    expect(shallow[2]).toBeGreaterThan(shallow[1]);

    function globeDensity(origin, direction, distance) {
      const x = origin[0] + direction[0] * distance;
      const y = origin[1] + direction[1] * distance;
      const z = origin[2] + direction[2] * distance;
      const height = Math.sqrt(x * x + y * y + z * z) - bottomRadius;
      return density * Math.exp(-falloff * height);
    }

    function gaussIntegral(origin, direction, start, end) {
      const midpoint = 0.5 * (start + end);
      const halfLength = 0.5 * (end - start);
      let sum = 0.0;
      for (let i = 0; i < nodes.length; i++) {
        const offset = halfLength * nodes[i];
        sum +=
          weights[i] *
          (globeDensity(origin, direction, midpoint - offset) +
            globeDensity(origin, direction, midpoint + offset));
      }
      return halfLength * sum;
    }

    function simpson(origin, direction, start, end, tolerance, depth) {
      function value(distance) {
        return globeDensity(origin, direction, distance);
      }
      function recurse(
        left,
        right,
        leftValue,
        middleValue,
        rightValue,
        whole,
        localTolerance,
        remaining,
      ) {
        const middle = 0.5 * (left + right);
        const leftMiddle = 0.5 * (left + middle);
        const rightMiddle = 0.5 * (middle + right);
        const leftMiddleValue = value(leftMiddle);
        const rightMiddleValue = value(rightMiddle);
        const leftArea =
          ((middle - left) / 6.0) *
          (leftValue + 4.0 * leftMiddleValue + middleValue);
        const rightArea =
          ((right - middle) / 6.0) *
          (middleValue + 4.0 * rightMiddleValue + rightValue);
        const delta = leftArea + rightArea - whole;
        if (remaining === 0 || Math.abs(delta) <= 15.0 * localTolerance) {
          return leftArea + rightArea + delta / 15.0;
        }
        return (
          recurse(
            left,
            middle,
            leftValue,
            leftMiddleValue,
            middleValue,
            leftArea,
            localTolerance * 0.5,
            remaining - 1,
          ) +
          recurse(
            middle,
            right,
            middleValue,
            rightMiddleValue,
            rightValue,
            rightArea,
            localTolerance * 0.5,
            remaining - 1,
          )
        );
      }
      const middle = 0.5 * (start + end);
      const leftValue = value(start);
      const middleValue = value(middle);
      const rightValue = value(end);
      const whole =
        ((end - start) / 6.0) * (leftValue + 4.0 * middleValue + rightValue);
      return recurse(
        start,
        end,
        leftValue,
        middleValue,
        rightValue,
        whole,
        tolerance,
        depth,
      );
    }

    for (const testCase of [
      {
        origin: [0.0, 0.0, bottomRadius + 100.0],
        direction: [1.0, 0.0, 0.0],
        end: 300000.0,
      },
      {
        origin: [0.0, 0.0, bottomRadius + 10000.0],
        direction: [0.6, 0.0, 0.8],
        end: 50000.0,
      },
      {
        origin: [0.0, 0.0, bottomRadius + 60000.0],
        direction: [0.4, 0.0, -Math.sqrt(0.84)],
        end: 65000.0,
      },
    ]) {
      const actual = gaussIntegral(
        testCase.origin,
        testCase.direction,
        0.0,
        testCase.end,
      );
      const reference = simpson(
        testCase.origin,
        testCase.direction,
        0.0,
        testCase.end,
        1.0e-10,
        20,
      );
      const relativeError = Math.abs(actual - reference) / reference;
      const fogAmountError = Math.abs(
        1.0 - Math.exp(-actual) - (1.0 - Math.exp(-reference)),
      );
      expect(relativeError).toBeLessThanOrEqual(0.02);
      expect(fogAmountError).toBeLessThanOrEqual(0.005);
    }
  });

  it("keeps orthographic origins and untruncated slab entry before the medium cap", function () {
    expect(backgroundFragmentSource).toContain(
      "u_cameraRight * plane.x + u_cameraUp * plane.y",
    );
    expect(backgroundFragmentSource).toContain(
      "u_altitude + dot(worldOriginOffset, u_vertical)",
    );
    expect(aerialFragmentSource).toContain(
      "float distanceToPoint = u_perspective ? length(eye.xyz) : max(-eye.z, 0.0)",
    );
    expect(aerialFragmentSource).toContain(": normalize(u_cameraDirection)");
    expect(backgroundFragmentSource).toContain(
      "physicalRadiance * u_backgroundRadianceScale",
    );
    expect(aerialFragmentSource).toContain(
      "inputColor.rgb * transmittance + radiance * u_aerialRadianceScale",
    );
    expect(backgroundFragmentSource).not.toContain("u_aerialRadianceScale");
    expect(aerialFragmentSource).not.toContain("u_backgroundRadianceScale");
    expect(backgroundFragmentSource).not.toContain("u_radianceScale");
    expect(aerialFragmentSource).not.toContain("u_radianceScale");
    expect(atmosphereSource).toContain("SCENEGIS_HDR_MAX = 65504.0");
    expect(backgroundFragmentSource).toContain(
      "sceneGISGuardHdrStorage(sceneLinearRadiance)",
    );
    expect(aerialFragmentSource).toContain(
      "sceneGISGuardHdrStorage(sceneLinearRadiance)",
    );
    expect(atmosphereSource).toContain("SCENEGIS_SOLAR_IRRADIANCE /");
    expect(atmosphereSource).toContain(
      "czm_pi * SCENEGIS_SUN_ANGULAR_RADIUS * SCENEGIS_SUN_ANGULAR_RADIUS",
    );
    expect(atmosphereSource).not.toContain("* 20.0");
    expect(atmosphereSource).toContain("sceneGISPlanarSlabSegment");
    expect(atmosphereSource).toContain(
      "float distanceLimit = max(maximumDistance, 0.0)",
    );
    expect(atmosphereSource).toContain(
      "segmentEnd = min(segmentEnd, segmentStart + SCENEGIS_PLANAR_MAX_DISTANCE)",
    );
    expect(atmosphereSource).toContain(
      "startRadiance - transmittance * endRadiance",
    );
    expect(atmosphereSource).toContain("sceneGISPlanarSegmentTransmittance");
    expect(atmosphereSource).toContain("segmentEnd - segmentStart");
    expect(atmosphereSource).not.toContain(
      "startTransmittance / max(endTransmittance",
    );
    expect(atmosphereSource).toContain("sceneGISPlanarScatteringToBoundary");
    expect(atmosphereSource).not.toContain("SCENEGIS_PLANAR_VIEW_SAMPLES");
    expect(atmosphereSource).not.toContain("clamp(altitude");
  });

  it("guards Sun-aligned Globe background radiance in raw RGBA16F storage", async function () {
    scene = createScene({ orderIndependentTranslucency: false });
    scene.globe = new Globe(Ellipsoid.WGS84);
    hideNativeEnvironment(scene);
    scene.highDynamicRange = true;
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    effects = new SceneGISEnvironmentEffects({
      mode: "globe",
      enabled: true,
    });
    effects.connectedCallback({});
    const time = JulianDate.fromIso8601("2026-06-21T16:00:00Z");
    effects.firstUpdate(scene, time);
    await pollToPromise(function () {
      effects.update(scene, time);
      return effects.ready;
    });

    const destination = Cartesian3.fromDegrees(-75.0, 40.0, 2000.0);
    scene.camera.setView({ destination });
    scene.renderForSpecs(time);
    const sunDirection = Cartesian3.clone(
      scene.context.uniformState.sunDirectionWC,
    );
    const radial = Cartesian3.normalize(destination, new Cartesian3());
    expect(Cartesian3.dot(radial, sunDirection)).toBeGreaterThan(0.0);
    const right = Cartesian3.normalize(
      Cartesian3.cross(sunDirection, radial, new Cartesian3()),
      new Cartesian3(),
    );
    const up = Cartesian3.normalize(
      Cartesian3.cross(right, sunDirection, new Cartesian3()),
      new Cartesian3(),
    );
    scene.camera.setView({
      destination,
      orientation: { direction: sunDirection, up },
    });
    scene.renderForSpecs(time);
    expect(
      Cartesian3.dot(
        effects._pipeline._frame.cameraDirection,
        effects._pipeline._sunDirection,
      ),
    ).toBeGreaterThan(0.99999);

    effects.backgroundRadianceScale = 10.0;
    effects.aerialRadianceScale = 0.0;
    const aerialZero = renderBackgroundHalfFloat();
    effects.aerialRadianceScale = 64.0;
    expect(renderBackgroundHalfFloat()).toEqual(aerialZero);

    for (const scale of [10.0, 64.0]) {
      effects.backgroundRadianceScale = scale;
      const pixel = renderBackgroundHalfFloat();
      expectFiniteHdrStorage(pixel);
      expect(Math.max(pixel[0], pixel[1], pixel[2])).toBe(65504.0);
    }
  });

  it("guards Sun-aligned Planar background radiance in raw RGBA16F storage", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    const sunDirection = Cartesian3.normalize(
      new Cartesian3(0.4, 0.2, 0.89),
      new Cartesian3(),
    );
    environment.sunDirection = sunDirection;
    environment.update(scene, scene.frameState.time);
    const right = Cartesian3.normalize(
      Cartesian3.cross(sunDirection, Cartesian3.UNIT_Z, new Cartesian3()),
      new Cartesian3(),
    );
    const up = Cartesian3.normalize(
      Cartesian3.cross(right, sunDirection, new Cartesian3()),
      new Cartesian3(),
    );
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 1000.0),
      orientation: { direction: sunDirection, up },
    });
    scene.renderForSpecs();
    expect(
      Cartesian3.dot(
        effects._pipeline._frame.cameraDirection,
        effects._pipeline._sunDirection,
      ),
    ).toBeGreaterThan(0.99999);

    effects.backgroundRadianceScale = 10.0;
    effects.aerialRadianceScale = 0.0;
    const aerialZero = renderBackgroundHalfFloat();
    effects.aerialRadianceScale = 64.0;
    expect(renderBackgroundHalfFloat()).toEqual(aerialZero);

    for (const scale of [10.0, 64.0]) {
      effects.backgroundRadianceScale = scale;
      const pixel = renderBackgroundHalfFloat();
      expectFiniteHdrStorage(pixel);
      expect(Math.max(pixel[0], pixel[1], pixel[2])).toBe(65504.0);
    }
  });

  it("destroys a candidate vertex buffer when VertexArray construction fails", function () {
    scene = createScene();
    const expectedError = new Error("injected vertex array failure");
    let destroyed = false;
    const candidateBuffer = {
      vertexArrayDestroyable: true,
      isDestroyed: function () {
        return destroyed;
      },
      destroy: jasmine
        .createSpy("destroyCandidateBuffer")
        .and.callFake(function () {
          destroyed = true;
        }),
      _getBuffer: function () {
        throw expectedError;
      },
    };
    spyOn(Buffer, "createVertexBuffer").and.returnValue(candidateBuffer);
    const renderer = new SceneGISEnvironmentEffectsRenderer({
      mode: "planar",
      owner: {},
    });

    expect(function () {
      renderer.publishResources(scene.context, createLutBuffers());
    }).toThrow(expectedError);
    expect(candidateBuffer.destroy).toHaveBeenCalledTimes(1);
    expect(renderer._resources).toBeUndefined();
    renderer.destroy();
  });

  it("releases a shader cache reference when eager compilation fails", function () {
    scene = createScene();
    scene.renderForSpecs();
    const expectedError = new Error("injected shader compilation failure");
    let destroyed = false;
    const candidateProgram = {
      _bind: function () {
        throw expectedError;
      },
      isDestroyed: function () {
        return destroyed;
      },
      destroy: jasmine
        .createSpy("destroyCandidateProgram")
        .and.callFake(function () {
          destroyed = true;
        }),
    };
    spyOn(ShaderProgram, "fromCache").and.returnValue(candidateProgram);
    const renderer = new SceneGISEnvironmentEffectsRenderer({
      mode: "planar",
      owner: {},
    });

    expect(function () {
      renderer.publishResources(scene.context, createLutBuffers());
    }).toThrow(expectedError);
    expect(candidateProgram.destroy).toHaveBeenCalledTimes(1);
    expect(renderer._resources).toBeUndefined();
    renderer.destroy();
  });

  it("destroys both candidate aerial programs when log-depth compilation fails", function () {
    scene = createScene();
    scene.renderForSpecs();
    const expectedError = new Error("injected log-depth compilation failure");
    const candidates = [0, 1, 2].map(function (index) {
      let destroyed = false;
      return {
        _bind: function () {
          if (index === 2) {
            throw expectedError;
          }
        },
        isDestroyed: function () {
          return destroyed;
        },
        destroy: jasmine
          .createSpy(`destroyCandidateProgram${index}`)
          .and.callFake(function () {
            destroyed = true;
          }),
      };
    });
    let index = 0;
    spyOn(ShaderProgram, "fromCache").and.callFake(function () {
      return candidates[index++];
    });
    const renderer = new SceneGISEnvironmentEffectsRenderer({
      mode: "planar",
      owner: {},
    });

    expect(function () {
      renderer.publishResources(scene.context, createLutBuffers());
    }).toThrow(expectedError);
    expect(candidates[0].destroy).toHaveBeenCalledTimes(1);
    expect(candidates[1].destroy).toHaveBeenCalledTimes(1);
    expect(candidates[2].destroy).toHaveBeenCalledTimes(1);
    expect(renderer._resources).toBeUndefined();
    renderer.destroy();
  });

  it("renders the planar day-night, height, orthographic, and underground matrix", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    const poses = [
      {
        name: "ground day",
        position: new Cartesian3(0.0, -20000.0, 100.0),
        sun: new Cartesian3(0.5, 0.2, 0.84),
      },
      {
        name: "air night",
        position: new Cartesian3(0.0, -50000.0, 30000.0),
        sun: new Cartesian3(-0.8, 0.0, -0.2),
      },
      {
        name: "outside slab sunset",
        position: new Cartesian3(0.0, -100000.0, 120000.0),
        sun: new Cartesian3(0.9, 0.0, 0.1),
      },
    ];
    const backgroundExecute = spyOn(
      effects._pipeline._resources.backgroundCommand,
      "execute",
    ).and.callThrough();
    const poseStates = {};
    for (const pose of poses) {
      scene.camera.setView({
        destination: pose.position,
        orientation: {
          direction: new Cartesian3(0.0, 0.8, -0.6),
          up: new Cartesian3(0.0, 0.6, 0.8),
        },
      });
      environment.sunDirection = Cartesian3.normalize(
        pose.sun,
        new Cartesian3(),
      );
      environment.update(scene, scene.frameState.time);
      scene.renderForSpecs();
      poseStates[pose.name] = {
        altitude: effects._pipeline._frame.altitude,
        sunZ: effects._pipeline._sunDirection.z,
        pixel: readCenterPixel(),
      };
    }
    expect(backgroundExecute).toHaveBeenCalledTimes(3);
    expect(poseStates["ground day"].altitude).toBe(100.0);
    expect(poseStates["ground day"].sunZ).toBeGreaterThan(0.0);
    expect(poseStates["air night"].altitude).toBe(30000.0);
    expect(poseStates["air night"].sunZ).toBeLessThan(0.0);
    expect(poseStates["outside slab sunset"].altitude).toBe(120000.0);
    expect(poseStates["outside slab sunset"].sunZ).toBeGreaterThan(0.0);
    expect(rgbEnergy(poseStates["ground day"].pixel)).toBeGreaterThan(0);
    expect(rgbEnergy(poseStates["outside slab sunset"].pixel)).toBeGreaterThan(
      0,
    );

    scene.camera.switchToOrthographicFrustum();
    scene.camera.frustum.width = 60000.0;
    scene.camera.setView({
      destination: new Cartesian3(0.0, -50000.0, 30000.0),
      orientation: {
        direction: Cartesian3.UNIT_Y,
        up: Cartesian3.UNIT_Z,
      },
    });
    environment.sunDirection = Cartesian3.normalize(
      new Cartesian3(0.5, 0.2, 0.84),
      new Cartesian3(),
    );
    environment.update(scene, scene.frameState.time);
    scene.canvas.width = 4;
    scene.canvas.height = 4;
    scene.renderForSpecs();
    expect(effects._pipeline._uniformMap.u_perspective()).toBe(false);
    expect(effects._pipeline._frustum.z).not.toBe(effects._pipeline._frustum.w);
    expect(
      Cartesian3.dot(
        effects._pipeline._frame.cameraUp,
        effects._pipeline._frame.vertical,
      ),
    ).toBeGreaterThan(0.99);

    scene.camera.switchToPerspectiveFrustum();
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 1000.0),
      orientation: {
        direction: Cartesian3.UNIT_Z,
        up: Cartesian3.UNIT_Y,
      },
    });
    for (const logarithmicDepth of [false, true]) {
      scene.logarithmicDepthBuffer = logarithmicDepth;
      effects.showAerialPerspective = false;
      scene.renderForSpecs();
      const clearDepthWithoutAerial = Array.from(
        scene.context.readPixels({ width: 1, height: 1 }),
      );
      effects.showAerialPerspective = true;
      scene.renderForSpecs();
      expect(
        Array.from(scene.context.readPixels({ width: 1, height: 1 })),
      ).toEqual(clearDepthWithoutAerial);
    }

    backgroundExecute.calls.reset();
    const aerial = spyOn(
      effects._pipeline._resources.aerialCommand,
      "execute",
    ).and.callThrough();
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, -10.0),
      orientation: {
        direction: Cartesian3.UNIT_Y,
        up: Cartesian3.UNIT_Z,
      },
    });
    scene.renderForSpecs();
    expect(backgroundExecute).not.toHaveBeenCalled();
    expect(aerial).not.toHaveBeenCalled();
  });

  it("proves outside-slab intersecting and nonintersecting identity pixels in both projections", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    effects.showAerialPerspective = false;
    environment.sunDirection = Cartesian3.normalize(
      new Cartesian3(0.4, 0.2, 0.89),
      new Cartesian3(),
    );
    environment.update(scene, scene.frameState.time);
    scene.canvas.width = 8;
    scene.canvas.height = 8;
    const colorTexture = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
    });
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [colorTexture],
      destroyAttachments: false,
    });
    const passState = new PassState(scene.context);
    passState.framebuffer = framebuffer;
    passState.viewport = new BoundingRectangle(0, 0, 1, 1);
    const clear = new ClearCommand({
      color: new Color(0.2, 0.4, 0.6, 1.0),
      framebuffer,
    });
    const identityPixel = [51, 102, 153, 255];

    function renderBackgroundPixel() {
      scene.renderForSpecs();
      clear.execute(scene.context);
      effects._pipeline._resources.backgroundCommand.framebuffer = framebuffer;
      effects._pipeline.renderBackground(scene.frameState, passState);
      return Array.from(
        scene.context.readPixels({ framebuffer, width: 1, height: 1 }),
      );
    }

    try {
      for (const orthographic of [false, true]) {
        environment.sunDirection = Cartesian3.normalize(
          new Cartesian3(0.4, 0.2, 0.89),
          new Cartesian3(),
        );
        environment.update(scene, scene.frameState.time);
        if (orthographic) {
          scene.camera.switchToOrthographicFrustum();
          scene.camera.frustum.width = 10000.0;
        } else {
          scene.camera.switchToPerspectiveFrustum();
        }
        scene.camera.setView({
          destination: new Cartesian3(0.0, -100000.0, 120000.0),
          orientation: {
            direction: Cartesian3.normalize(
              new Cartesian3(0.0, 0.98, -0.2),
              new Cartesian3(),
            ),
            up: Cartesian3.UNIT_Z,
          },
        });
        const intersecting = renderBackgroundPixel();
        expect(effects._pipeline._frame.altitude).toBe(120000.0);
        expect(
          Cartesian3.dot(
            effects._pipeline._frame.cameraDirection,
            effects._pipeline._frame.vertical,
          ),
        ).toBeLessThan(-0.19);
        expect(effects._pipeline._sunDirection.z).toBeGreaterThan(0.8);
        expect(
          Cartesian3.dot(
            effects._pipeline._frame.cameraDirection,
            effects._pipeline._sunDirection,
          ),
        ).toBeGreaterThan(-0.1);
        expect(intersecting).not.toEqual(identityPixel);
        expect(rgbEnergy(intersecting)).toBeGreaterThan(0);

        const lightingPixels = [];
        for (const sun of [
          new Cartesian3(0.4, 0.2, 0.89),
          new Cartesian3(0.99, 0.0, 0.03),
          new Cartesian3(0.4, 0.2, -0.89),
        ]) {
          environment.sunDirection = Cartesian3.normalize(
            sun,
            new Cartesian3(),
          );
          environment.update(scene, scene.frameState.time);
          lightingPixels.push(renderBackgroundPixel());
        }
        expect(lightingPixels[0]).not.toEqual(lightingPixels[2]);
        expect(lightingPixels[1]).not.toEqual(lightingPixels[2]);

        scene.camera.setView({
          destination: new Cartesian3(0.0, -100000.0, 120000.0),
          orientation: {
            direction: Cartesian3.UNIT_Y,
            up: Cartesian3.UNIT_Z,
          },
        });
        expect(renderBackgroundPixel()).toEqual(identityPixel);
      }
    } finally {
      effects._pipeline._resources.backgroundCommand.framebuffer = undefined;
      framebuffer.destroy();
      colorTexture.destroy();
    }
  });

  it("proves planar aerial near-far and day-sunset-night pixel deltas", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    effects.showAtmosphere = false;
    scene.logarithmicDepthBuffer = false;
    scene.camera.switchToOrthographicFrustum();
    scene.camera.frustum.width = 1000.0;
    scene.camera.frustum.near = 1.0;
    scene.camera.frustum.far = 100000.0;
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 30000.0),
      orientation: {
        direction: Cartesian3.negate(Cartesian3.UNIT_Z, new Cartesian3()),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.renderForSpecs();
    scene.context.uniformState.updateCamera(scene.camera);
    scene.context.uniformState.updateFrustum(scene.camera.frustum);

    const inputTexture = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      source: {
        arrayBufferView: new Uint8Array([128, 112, 96, 255]),
      },
    });
    const depthTexture = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.DEPTH_COMPONENT,
      pixelDatatype: PixelDatatype.UNSIGNED_INT,
    });
    const depthColorTexture = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
    });
    const depthFramebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [depthColorTexture],
      depthTexture,
      destroyAttachments: false,
    });
    const depthClear = new ClearCommand({
      color: Color.BLACK,
      depth: 1.0,
      framebuffer: depthFramebuffer,
    });

    function depthForDistance(distance) {
      const near = scene.camera.frustum.near;
      const far = scene.camera.frustum.far;
      return (distance - near) / (far - near);
    }

    function renderAerial(distance) {
      depthClear.depth =
        distance === undefined ? 1.0 : depthForDistance(distance);
      depthClear.execute(scene.context);
      effects._pipeline.executeHdr(
        scene.context,
        inputTexture,
        depthTexture,
        scene.context.defaultTexture,
      );
      return Array.from(
        scene.context.readPixels({
          framebuffer:
            effects._pipeline._resources.aerialFramebuffer.framebuffer,
          width: 1,
          height: 1,
        }),
        decodeFloat16,
      );
    }

    try {
      const nearPixel = renderAerial(5000.0);
      const farPixel = renderAerial(29000.0);
      const inputPixel = [128 / 255, 112 / 255, 96 / 255, 1.0];
      expect(nearPixel).not.toEqual(inputPixel);
      expect(farPixel).not.toEqual(inputPixel);
      const nearDelta = rgbEnergy(
        nearPixel.map((value, index) => Math.abs(value - inputPixel[index])),
      );
      const farDelta = rgbEnergy(
        farPixel.map((value, index) => Math.abs(value - inputPixel[index])),
      );
      expect(farDelta).toBeGreaterThan(nearDelta);

      const scaled = [];
      for (const scale of [0.0, 1.0, 2.0]) {
        effects.aerialRadianceScale = scale;
        scaled.push(renderAerial(29000.0));
      }
      effects.aerialRadianceScale = 0.0;
      expect(renderAerial(29000.0)).toEqual(scaled[0]);
      let scaledChannels = 0;
      for (let channel = 0; channel < 3; channel++) {
        const firstRadiance = scaled[1][channel] - scaled[0][channel];
        const secondRadiance = scaled[2][channel] - scaled[0][channel];
        scaledChannels += Math.abs(firstRadiance) > 1.0e-5 ? 1 : 0;
        expect(Math.abs(secondRadiance - firstRadiance * 2.0)).toBeLessThan(
          0.005,
        );
      }
      expect(scaledChannels).toBeGreaterThan(0);

      effects.aerialRadianceScale = 1.0;
      effects.backgroundRadianceScale = 0.0;
      const backgroundZero = renderAerial(29000.0);
      effects.backgroundRadianceScale = 64.0;
      expect(renderAerial(29000.0)).toEqual(backgroundZero);

      effects.aerialRadianceScale = 64.0;
      expectFiniteHdrStorage(renderAerial(29000.0));
      effects.aerialRadianceScale = 1.0;

      const lightingPixels = [];
      for (const sun of [
        new Cartesian3(0.4, 0.2, 0.89),
        new Cartesian3(0.99, 0.0, 0.03),
        new Cartesian3(0.4, 0.2, -0.89),
      ]) {
        environment.sunDirection = Cartesian3.normalize(sun, new Cartesian3());
        environment.update(scene, scene.frameState.time);
        lightingPixels.push(renderAerial(29000.0));
      }
      expect(lightingPixels[0]).not.toEqual(lightingPixels[1]);
      expect(lightingPixels[1]).not.toEqual(lightingPixels[2]);

      effects.showAerialPerspective = false;
      effects.showHeightFog = true;
      environment.sunDirection = Cartesian3.normalize(
        new Cartesian3(0.4, 0.2, 0.89),
        new Cartesian3(),
      );
      environment.update(scene, scene.frameState.time);
      effects.backgroundRadianceScale = 0.0;
      effects.aerialRadianceScale = 0.0;
      const fogOnly = renderAerial(29000.0);
      const clearFog = renderAerial(undefined);
      expect(fogOnly).not.toEqual(clearFog);
      expect(fogOnly[3]).toBe(clearFog[3]);

      effects.backgroundRadianceScale = 64.0;
      effects.aerialRadianceScale = 64.0;
      expect(renderAerial(29000.0)).toEqual(fogOnly);

      effects.heightFogInscatteringScale = 64.0;
      effects.heightFogDirectionalInscatteringScale = 64.0;
      expectFiniteHdrStorage(renderAerial(29000.0));
    } finally {
      depthFramebuffer.destroy();
      depthColorTexture.destroy();
      depthTexture.destroy();
      inputTexture.destroy();
    }
  });

  it("proves horizontal shallow and high-outside planar aerial pixels in both projections", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    effects.showAtmosphere = false;
    scene.logarithmicDepthBuffer = false;
    scene.canvas.width = 8;
    scene.canvas.height = 8;
    environment.sunDirection = Cartesian3.normalize(
      new Cartesian3(0.4, 0.2, 0.89),
      new Cartesian3(),
    );
    environment.update(scene, scene.frameState.time);

    const inputTexture = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      source: {
        arrayBufferView: new Uint8Array([128, 112, 96, 255]),
      },
    });
    const depthTexture = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.DEPTH_COMPONENT,
      pixelDatatype: PixelDatatype.UNSIGNED_INT,
    });
    const depthColorTexture = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
    });
    const depthFramebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [depthColorTexture],
      depthTexture,
      destroyAttachments: false,
    });
    const depthClear = new ClearCommand({
      color: Color.BLACK,
      depth: 1.0,
      framebuffer: depthFramebuffer,
    });

    function configureCamera(orthographic, position, direction) {
      if (orthographic) {
        scene.camera.switchToOrthographicFrustum();
        scene.camera.frustum.width = 1000.0;
      } else {
        scene.camera.switchToPerspectiveFrustum();
      }
      scene.camera.frustum.near = 1.0;
      scene.camera.frustum.far = 1000000.0;
      scene.camera.setView({
        destination: position,
        orientation: {
          direction,
          up: Cartesian3.UNIT_Z,
        },
      });
      scene.renderForSpecs();
      scene.context.uniformState.updateCamera(scene.camera);
      scene.context.uniformState.updateFrustum(scene.camera.frustum);
    }

    function depthForDistance(distance, orthographic) {
      const near = scene.camera.frustum.near;
      const far = scene.camera.frustum.far;
      return orthographic
        ? (distance - near) / (far - near)
        : (far * (distance - near)) / (distance * (far - near));
    }

    function renderAerial(distance, orthographic) {
      depthClear.depth =
        distance === undefined ? 1.0 : depthForDistance(distance, orthographic);
      depthClear.execute(scene.context);
      effects._pipeline.executeHdr(
        scene.context,
        inputTexture,
        depthTexture,
        scene.context.defaultTexture,
      );
      return Array.from(
        scene.context.readPixels({
          framebuffer:
            effects._pipeline._resources.aerialFramebuffer.framebuffer,
          width: 1,
          height: 1,
        }),
        decodeFloat16,
      );
    }

    function deltaEnergy(pixel, identity) {
      return rgbEnergy(
        pixel.map((value, index) => Math.abs(value - identity[index])),
      );
    }

    try {
      const distances = [50000.0, 150000.0, 300000.0];
      for (const orthographic of [false, true]) {
        configureCamera(
          orthographic,
          new Cartesian3(0.0, 0.0, 1000.0),
          Cartesian3.UNIT_Y,
        );
        const horizontalIdentity = renderAerial(undefined, orthographic);
        const horizontalDeltas = distances.map((distance) =>
          deltaEnergy(renderAerial(distance, orthographic), horizontalIdentity),
        );
        expect(horizontalDeltas[0]).toBeGreaterThan(0.0);
        expect(horizontalDeltas[1]).toBeGreaterThan(horizontalDeltas[0]);
        expect(horizontalDeltas[2]).toBeGreaterThan(horizontalDeltas[1]);

        configureCamera(
          orthographic,
          new Cartesian3(0.0, 0.0, 30000.0),
          Cartesian3.normalize(
            new Cartesian3(0.0, Math.sqrt(1.0 - 0.05 * 0.05), 0.05),
            new Cartesian3(),
          ),
        );
        const shallowIdentity = renderAerial(undefined, orthographic);
        const shallowDeltas = distances.map((distance) =>
          deltaEnergy(renderAerial(distance, orthographic), shallowIdentity),
        );
        expect(shallowDeltas[0]).toBeGreaterThan(0.0);
        expect(shallowDeltas[1]).toBeGreaterThan(shallowDeltas[0]);
        expect(shallowDeltas[2]).toBeGreaterThan(shallowDeltas[1]);

        configureCamera(
          orthographic,
          new Cartesian3(0.0, -100000.0, 120000.0),
          Cartesian3.normalize(
            new Cartesian3(0.0, 0.98, -0.2),
            new Cartesian3(),
          ),
        );
        const beforeSlab = renderAerial(250000.0, orthographic);
        const insideSlab = renderAerial(450000.0, orthographic);
        expect(effects._pipeline._frame.altitude).toBe(120000.0);
        expect(insideSlab).not.toEqual(beforeSlab);
        expect(deltaEnergy(insideSlab, beforeSlab)).toBeGreaterThan(0.0);

        effects.showAerialPerspective = false;
        effects.showHeightFog = true;
        const fogClear = renderAerial(undefined, orthographic);
        expect(renderAerial(250000.0, orthographic)).toEqual(fogClear);
        const fogInsideSlab = renderAerial(450000.0, orthographic);
        expect(fogInsideSlab).not.toEqual(fogClear);
        expect(deltaEnergy(fogInsideSlab, fogClear)).toBeGreaterThan(0.0);

        configureCamera(
          orthographic,
          new Cartesian3(0.0, -100000.0, 120000.0),
          Cartesian3.UNIT_Y,
        );
        const nonintersectingClear = renderAerial(undefined, orthographic);
        expect(renderAerial(450000.0, orthographic)).toEqual(
          nonintersectingClear,
        );
        effects.showHeightFog = false;
        effects.showAerialPerspective = true;
      }
    } finally {
      depthFramebuffer.destroy();
      depthColorTexture.destroy();
      depthTexture.destroy();
      inputTexture.destroy();
    }
  });

  it("renders real opaque planar depth through linear and log aerial variants", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    effects.showAtmosphere = false;
    effects.aerialRadianceScale = 10.0;
    environment.sunDirection = Cartesian3.normalize(
      new Cartesian3(0.4, 0.2, 0.89),
      new Cartesian3(),
    );
    environment.update(scene, scene.frameState.time);
    scene.canvas.width = 64;
    scene.canvas.height = 64;
    scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(150000.0, 150000.0, 100000.0),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          modelMatrix: Matrix4.fromTranslation(
            new Cartesian3(0.0, 650000.0, 0.0),
            new Matrix4(),
          ),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
          closed: true,
        }),
        asynchronous: false,
      }),
    );

    const direction = Cartesian3.normalize(
      new Cartesian3(0.0, 1.0, -0.2),
      new Cartesian3(),
    );
    const up = Cartesian3.normalize(
      new Cartesian3(0.0, 0.2, 1.0),
      new Cartesian3(),
    );
    for (const projection of ["perspective", "orthographic"]) {
      if (projection === "perspective") {
        scene.camera.switchToPerspectiveFrustum();
      } else {
        scene.camera.switchToOrthographicFrustum();
        scene.camera.frustum.width = 200000.0;
      }
      scene.camera.setView({
        destination: new Cartesian3(0.0, 0.0, 120000.0),
        orientation: { direction, up },
      });
      for (const logarithmicDepth of [false, true]) {
        scene.logarithmicDepthBuffer = logarithmicDepth;
        effects.showAerialPerspective = false;
        scene.render();
        const identity = readFramePixels();
        effects.showAerialPerspective = true;
        scene.render();
        const aerial = readFramePixels();
        effects.showAerialPerspective = false;
        effects.showHeightFog = true;
        scene.render();
        const fogOnly = readFramePixels();
        const actualLogDepth = scene.frameState.useLogDepth;
        if (projection === "perspective" && logarithmicDepth) {
          expect(maximumRgbDelta(aerial, identity))
            .withContext("perspective integrated log depth")
            .toBeGreaterThan(0);
          expect(maximumRgbDelta(fogOnly, identity))
            .withContext("perspective integrated log-depth fog")
            .toBeGreaterThan(0);
        }
        expect(effects._pipeline._resources.aerialCommand.shaderProgram).toBe(
          actualLogDepth
            ? effects._pipeline._resources.aerialLogDepthProgram
            : effects._pipeline._resources.aerialProgram,
        );
        effects.showHeightFog = false;
      }
    }
  });

  it("fails closed once on a late planar native conflict and retries explicitly", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const errors = [];
    effects.errorEvent.addEventListener(function (controller, error) {
      errors.push({ controller, error });
    });
    await publishPlanarResources();
    scene.fog.enabled = true;

    effects.update(scene, scene.frameState.time);
    effects.update(scene, scene.frameState.time);
    expect(errors.length).toBe(1);
    expect(errors[0].controller).toBe(effects);
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();

    scene.fog.enabled = false;
    effects.enabled = false;
    effects.enabled = true;
    effects.update(scene, scene.frameState.time);
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBe(effects._pipeline);
    expect(effects.ready).toBe(true);
  });

  it("fails closed once when a Globe asset request fails", async function () {
    scene = createScene();
    scene.globe = new Globe(Ellipsoid.WGS84);
    hideNativeEnvironment(scene);
    scene.highDynamicRange = true;
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const expectedError = new Error("injected LUT fetch failure");
    spyOn(Resource, "fetchArrayBuffer").and.returnValue(
      Promise.reject(expectedError),
    );
    const errors = [];
    effects = new SceneGISEnvironmentEffects({
      mode: "globe",
      enabled: true,
    });
    effects.errorEvent.addEventListener(function (controller, error) {
      errors.push({ controller, error });
    });
    effects.connectedCallback({});
    effects.firstUpdate(scene, scene.frameState.time);

    await pollToPromise(function () {
      return errors.length === 1;
    });
    effects.update(scene, scene.frameState.time);
    expect(errors.length).toBe(1);
    expect(errors[0].controller).toBe(effects);
    expect(errors[0].error).toBe(expectedError);
    expect(effects.ready).toBe(false);
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
  });

  it("isolates late Globe asset promises after disconnect", async function () {
    scene = createScene();
    scene.globe = new Globe(Ellipsoid.WGS84);
    hideNativeEnvironment(scene);
    scene.highDynamicRange = true;
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const requests = [createDeferred(), createDeferred(), createDeferred()];
    let requestIndex = 0;
    spyOn(Resource, "fetchArrayBuffer").and.callFake(function () {
      return requests[requestIndex++].promise;
    });
    effects = new SceneGISEnvironmentEffects({
      mode: "globe",
      enabled: true,
    });
    const element = {};
    effects.connectedCallback(element);
    effects.firstUpdate(scene, scene.frameState.time);
    const detachedPipeline = effects._pipeline;
    effects.disconnectedCallback(element);

    requests.forEach(function (request) {
      request.resolve(new ArrayBuffer(0));
    });
    await Promise.all(requests.map((request) => request.promise));
    await Promise.resolve();

    expect(detachedPipeline.isDestroyed()).toBe(true);
    expect(effects._pipeline).toBeUndefined();
    expect(effects.ready).toBe(false);
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
  });

  it("ignores late Globe resolve and reject without requesting after disable", async function () {
    const requests = connectGlobeWithDeferredAssets();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const requestRender = spyOn(scene, "requestRender").and.callThrough();
    effects.firstUpdate(scene, scene.frameState.time);
    effects.enabled = false;
    requestRender.calls.reset();

    requests[0].reject(new Error("late disabled rejection"));
    requests[1].resolve(new ArrayBuffer(0));
    requests[2].resolve(new ArrayBuffer(0));
    await Promise.allSettled(requests.map((request) => request.promise));
    await Promise.resolve();

    expect(requestRender).not.toHaveBeenCalled();
    expect(effects._pendingBuffers).toBeUndefined();
    expect(effects.ready).toBe(false);
  });

  it("drops late Globe buffers after a conflict latches the generation", async function () {
    const requests = connectGlobeWithDeferredAssets();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const requestRender = spyOn(scene, "requestRender").and.callThrough();
    const errors = [];
    effects.errorEvent.addEventListener(function (controller, error) {
      errors.push({ controller, error });
    });
    effects.firstUpdate(scene, scene.frameState.time);
    scene.sun = { show: true };
    effects.update(scene, scene.frameState.time);
    expect(errors.length).toBe(1);
    requestRender.calls.reset();

    requests.forEach(function (request) {
      request.resolve(new ArrayBuffer(1024));
    });
    await Promise.all(requests.map((request) => request.promise));
    await Promise.resolve();

    expect(effects._pendingBuffers).toBeUndefined();
    expect(requestRender).not.toHaveBeenCalled();
    expect(effects.ready).toBe(false);
    scene.sun = undefined;
  });

  it("preserves foreign A1 authority during disconnect", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    const resources = effects._pipeline._resources;
    const foreign = { destroy: jasmine.createSpy("destroyForeign") };
    scene._sceneGISEnvironmentEffectsPipeline = foreign;

    effects.disconnectedCallback(effects._element);

    expect(scene._sceneGISEnvironmentEffectsPipeline).toBe(foreign);
    expect(foreign.destroy).not.toHaveBeenCalled();
    expect(resources.vertexArray.isDestroyed()).toBe(true);
  });

  it("loads exact Globe assets and publishes the height/time/projection render matrix", async function () {
    scene = createScene({ orderIndependentTranslucency: false });
    scene.globe = new Globe(Ellipsoid.WGS84);
    hideNativeEnvironment(scene);
    scene.highDynamicRange = true;
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(-75.0, 40.0, 2000.0),
      orientation: {
        direction: Cartesian3.negate(
          Cartesian3.normalize(
            Cartesian3.fromDegrees(-75.0, 40.0, 2000.0),
            new Cartesian3(),
          ),
          new Cartesian3(),
        ),
        up: Cartesian3.UNIT_Z,
      },
    });
    effects = new SceneGISEnvironmentEffects({
      mode: "globe",
      enabled: true,
    });
    effects.connectedCallback({});
    effects.firstUpdate(scene, scene.frameState.time);

    await pollToPromise(function () {
      effects.update(scene, scene.frameState.time);
      return effects.ready;
    });
    expect(effects._pipeline._resources.transmittanceTexture.sizeInBytes).toBe(
      131072,
    );
    expect(effects._pipeline._resources.scatteringTexture.sizeInBytes).toBe(
      8388608,
    );
    expect(effects._pipeline._resources.irradianceTexture.sizeInBytes).toBe(
      8192,
    );
    const times = [
      JulianDate.fromIso8601("2026-06-21T04:00:00Z"),
      JulianDate.fromIso8601("2026-06-21T16:00:00Z"),
    ];
    const backgroundExecute = spyOn(
      effects._pipeline._resources.backgroundCommand,
      "execute",
    ).and.callThrough();
    const aerialExecute = spyOn(
      effects._pipeline._resources.aerialCommand,
      "execute",
    ).and.callThrough();
    const matrixSunDirections = [];
    for (const altitude of [1.0, 30000.0, 10000000.0]) {
      const destination = Cartesian3.fromDegrees(-75.0, 40.0, altitude);
      scene.camera.setView({
        destination,
        orientation: {
          direction: Cartesian3.negate(
            Cartesian3.normalize(destination, new Cartesian3()),
            new Cartesian3(),
          ),
          up: Cartesian3.UNIT_Z,
        },
      });
      for (const time of times) {
        scene.renderForSpecs(time);
        expect(effects._pipeline._frame.altitude).toEqualEpsilon(
          altitude,
          1.0e-5,
        );
        expect(effects._pipeline._perspective).toBe(true);
        matrixSunDirections.push(
          Cartesian3.clone(effects._pipeline._sunDirection),
        );
      }
    }
    expect(backgroundExecute).toHaveBeenCalledTimes(6);
    expect(aerialExecute).toHaveBeenCalledTimes(6);
    expect(matrixSunDirections[0]).not.toEqual(matrixSunDirections[1]);
    scene.camera.switchToOrthographicFrustum();
    scene.renderForSpecs(times[0]);
    expect(effects._pipeline._perspective).toBe(false);
    expect(backgroundExecute).toHaveBeenCalledTimes(7);
    expect(aerialExecute).toHaveBeenCalledTimes(7);
  });
});
