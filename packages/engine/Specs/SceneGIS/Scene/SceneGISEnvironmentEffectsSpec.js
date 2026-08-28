import {
  BoxGeometry,
  BoundingRectangle,
  Cartesian2,
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
  Math as CesiumMath,
  PassState,
  PerInstanceColorAppearance,
  PixelDatatype,
  PixelFormat,
  Primitive,
  Resource,
  Sampler,
  SceneGISEnvironmentEffects,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarEnvironment,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  Texture,
  TextureMagnificationFilter,
  Transforms,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";
import Buffer from "../../../Source/Renderer/Buffer.js";
import ShaderProgram from "../../../Source/Renderer/ShaderProgram.js";
import ShaderSource from "../../../Source/Renderer/ShaderSource.js";
import TextureWrap from "../../../Source/Renderer/TextureWrap.js";
import Texture3D from "../../../Source/Renderer/Texture3D.js";
import TextureMinificationFilter from "../../../Source/Renderer/TextureMinificationFilter.js";
import SceneGISEnvironmentEffectsRenderer, {
  createEnvironmentEffectsProgramForSpecs,
} from "../../../Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js";
import aerialFragmentSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsAerialFS.js";
import atmosphereSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.js";
import brunetonCommonSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonCommon.js";
import brunetonDefinitionsSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonDefinitions.js";
import brunetonRuntimeSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonRuntime.js";
import backgroundFragmentSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsBackgroundFS.js";
import cloudFragmentSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudFS.js";
import cloudResolveFragmentSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.js";
import cloudShadowSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadows.js";
import globeSurfaceLightingSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeSurfaceLighting.js";
import heightFogSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISExponentialHeightFog.js";
import globeCloudSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeClouds.js";
import cloudSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.js";

const cloudReplaySentinelFragmentSource = `
precision highp float;
layout (location = 0) out vec4 out_FragData_0;
layout (location = 1) out vec4 out_FragData_1;
void main()
{
    out_FragData_0 = vec4(0.125, 0.25, 0.5, 0.75);
    out_FragData_1 = vec4(0.0625, 0.1875, 0.375, 1.0);
}`;

const cloudLightingComponentFragmentSource = `
precision highp float;
layout (location = 0) out vec4 out_FragData_0;
layout (location = 1) out vec4 out_FragData_1;
uniform sampler2D u_transmittanceTexture;
uniform sampler2D u_irradianceTexture;
uniform float u_baseHeight;
uniform float u_cloudBaseHeight;
uniform float u_cloudThickness;
uniform int u_cloudPreset;
void main()
{
    vec3 sunDirection = vec3(0.0, 0.0, 1.0);
    vec3 sampleLocal = vec3(
        0.0,
        0.0,
        u_baseHeight + u_cloudBaseHeight +
            SCENEGIS_CLOUD_PROBE_HEIGHT_FRACTION * u_cloudThickness);
    vec3 atmosphereSun = sceneGISCloudSunIncident(
        u_transmittanceTexture, sampleLocal, sunDirection);
    float viewCosine = SCENEGIS_CLOUD_PROBE_VIEW_COSINE;
    vec3 localRayDirection = vec3(
        sqrt(max(1.0 - viewCosine * viewCosine, 0.0)),
        0.0,
        viewCosine);
    vec3 solarScattering;
    vec3 skySource;
    float localPowder;
    vec3 totalSource;
    sceneGISCloudLightingComponents(
        u_irradianceTexture,
        sampleLocal,
        localRayDirection,
        sunDirection,
        atmosphereSun,
        SCENEGIS_CLOUD_PROBE_OPTICAL_DEPTH,
        SCENEGIS_CLOUD_PROBE_HEIGHT_GRADIENT,
        SCENEGIS_CLOUD_PROBE_LOCAL_EXTINCTION,
        solarScattering,
        skySource,
        localPowder,
        totalSource);
    #ifdef SCENEGIS_CLOUD_PROBE_TOTAL
    out_FragData_0 = vec4(totalSource, 1.0);
    out_FragData_1 = vec4(solarScattering + skySource, 1.0);
    #elif defined(SCENEGIS_CLOUD_PROBE_INCIDENT)
    out_FragData_0 = vec4(atmosphereSun, 1.0);
    out_FragData_1 = vec4(sceneGISCloudSkyIrradiance(
        u_irradianceTexture,
        sampleLocal,
        sunDirection,
        atmosphereSun), 1.0);
    #else
    out_FragData_0 = vec4(solarScattering, localPowder);
    out_FragData_1 = vec4(skySource, 1.0);
    #endif
}`;

const globeCloudReferenceFragmentSource = `
precision highp float;
layout (location = 0) out vec4 out_FragData_0;
layout (location = 1) out vec4 out_FragData_1;
uniform sampler2D u_transmittanceTexture;
uniform sampler2D u_irradianceTexture;
uniform sampler3D u_cloudShapeTexture;
uniform sampler3D u_cloudDetailTexture;
uniform sampler2D u_cloudWeatherTexture;
uniform sampler3D u_cloudTurbulenceTexture;
uniform float u_cloudBaseHeight;
uniform float u_cloudThickness;
uniform float u_cloudCoverage;
uniform float u_cloudDensity;
uniform int u_cloudPreset;
void main()
{
    float heightFraction = 0.5;
    vec3 sampleLocal = vec3(
        0.0,
        0.0,
        u_cloudBaseHeight + heightFraction * u_cloudThickness);
    vec3 globePosition = vec3(
        SCENEGIS_BOTTOM_RADIUS + sampleLocal.z,
        0.0,
        0.0);
    float heightGradient;
    float density = sceneGISGlobeCloudDensitySample(
        u_cloudShapeTexture,
        u_cloudDetailTexture,
        u_cloudWeatherTexture,
        u_cloudTurbulenceTexture,
        globePosition,
        vec3(0.0),
        vec2(0.0),
        u_cloudBaseHeight,
        u_cloudThickness,
        u_cloudCoverage,
        u_cloudPreset,
        0.0,
        100.0,
        heightGradient);
    float opticalDepth = density * u_cloudDensity * 1000.0;
    float transmittance = exp(-opticalDepth);
    vec3 sunDirection = vec3(0.0, 0.0, 1.0);
    vec3 sunIncident = sceneGISCloudSunIncident(
        u_transmittanceTexture,
        sampleLocal,
        sunDirection);
    vec3 solar;
    vec3 sky;
    float powder;
    vec3 total;
    sceneGISCloudLightingComponents(
        u_irradianceTexture,
        sampleLocal,
        vec3(1.0, 0.0, 0.0),
        sunDirection,
        sunIncident,
        opticalDepth,
        heightGradient,
        density * u_cloudDensity,
        solar,
        sky,
        powder,
        total);
    #ifdef SCENEGIS_GLOBE_REFERENCE_COMPONENTS
    out_FragData_0 = vec4(solar, powder);
    out_FragData_1 = vec4(sky, heightGradient);
    #else
    float opacity = 1.0 - transmittance;
    out_FragData_0 = vec4(
        density,
        opticalDepth,
        transmittance,
        heightGradient);
    out_FragData_1 = vec4(total * opacity, opacity);
    #endif
}`;

const globeCloudCoordinateFragmentSource = `
precision highp float;
layout (location = 0) out vec4 out_FragData_0;
layout (location = 1) out vec4 out_FragData_1;
void main()
{
    vec3 direction = vec3(
        SCENEGIS_GLOBE_COORDINATE_X,
        SCENEGIS_GLOBE_COORDINATE_Y,
        SCENEGIS_GLOBE_COORDINATE_Z);
    vec2 uv = sceneGISGlobeCloudCubeSphereUv(direction);
    out_FragData_0 = vec4(uv, fract(uv * 100.0));
    out_FragData_1 = vec4(0.0);
}`;

const cloudAngularPhaseFragmentSource = `
precision highp float;
layout (location = 0) out vec4 out_FragData_0;
layout (location = 1) out vec4 out_FragData_1;
uniform vec2 u_cloudBufferDimensions;
void main()
{
    float cosineTheta = -1.0 +
        2.0 * gl_FragCoord.x / u_cloudBufferDimensions.x;
    float phase = sceneGISCloudDualPhase(
        cosineTheta, SCENEGIS_CLOUD_PROBE_PHASE_ATTENUATION);
    vec4 phaseReport = vec4(
        phase,
        sceneGISCloudDualPhase(
            -1.0, SCENEGIS_CLOUD_PROBE_PHASE_ATTENUATION),
        sceneGISCloudDualPhase(
            0.0, SCENEGIS_CLOUD_PROBE_PHASE_ATTENUATION),
        sceneGISCloudDualPhase(
            1.0, SCENEGIS_CLOUD_PROBE_PHASE_ATTENUATION));
    out_FragData_0 = phaseReport;
    out_FragData_1 = phaseReport;
}`;

const cloudReplayRayFragmentSource = `
precision highp float;
precision highp sampler3D;
layout (location = 0) out vec4 out_FragData_0;
layout (location = 1) out vec4 out_FragData_1;
uniform sampler2D u_depthTexture;
uniform sampler3D u_cloudStbnTexture;
uniform bool u_perspective;
uniform vec4 u_frustum;
uniform vec3 u_cameraDirection;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform vec3 u_east;
uniform vec3 u_north;
uniform vec3 u_vertical;
uniform float u_altitude;
uniform float u_baseHeight;
uniform float u_cloudBaseHeight;
uniform float u_cloudThickness;
uniform int u_cloudPreset;
uniform float u_cloudStbnSlice;
uniform vec2 u_cloudBufferDimensions;
void main()
{
    vec2 cloudPixel = gl_FragCoord.xy;
    vec2 cloudCoordinates = cloudPixel / u_cloudBufferDimensions;
    vec2 plane = mix(u_frustum.xz, u_frustum.yw, cloudCoordinates);
    vec3 eyeOffset = u_cameraRight * plane.x + u_cameraUp * plane.y;
    vec3 worldOriginOffset = u_perspective ? vec3(0.0) : eyeOffset;
    vec3 worldRayDirection = u_perspective
        ? normalize(u_cameraDirection + eyeOffset)
        : normalize(u_cameraDirection);
    vec3 localRayOrigin = vec3(
        dot(worldOriginOffset, u_east),
        dot(worldOriginOffset, u_north),
        u_altitude + dot(worldOriginOffset, u_vertical));
    vec3 localRayDirection = normalize(vec3(
        dot(worldRayDirection, u_east),
        dot(worldRayDirection, u_north),
        dot(worldRayDirection, u_vertical)));
    float supportBaseHeight;
    float supportThickness;
    sceneGISCloudPresetSupport(
        u_cloudPreset,
        u_baseHeight + u_cloudBaseHeight,
        u_cloudThickness,
        supportBaseHeight,
        supportThickness);
    float segmentStart;
    float segmentEnd;
    bool hit = sceneGISCloudSegment(
        localRayOrigin,
        localRayDirection,
        SCENEGIS_PLANAR_BACKGROUND_DISTANCE,
        supportBaseHeight,
        supportThickness,
        segmentStart,
        segmentEnd);
    vec2 fullPixel =
        cloudCoordinates * vec2(textureSize(u_depthTexture, 0));
    ivec3 stbnSize = textureSize(u_cloudStbnTexture, 0);
    ivec2 stbnPixel = ivec2(mod(floor(fullPixel), vec2(stbnSize.xy)));
    int stbnSlice = clamp(
        int(floor(u_cloudStbnSlice * float(stbnSize.z))),
        0,
        stbnSize.z - 1);
    float dither = texelFetch(
        u_cloudStbnTexture,
        ivec3(stbnPixel, stbnSlice),
        0).r;
    out_FragData_0 = vec4(localRayDirection * 0.5 + 0.5, dither);
    out_FragData_1 = hit
        ? vec4(
            segmentStart / SCENEGIS_CLOUD_DISTANCE_ENCODING,
            segmentEnd / SCENEGIS_CLOUD_DISTANCE_ENCODING,
            (segmentEnd - segmentStart) /
                SCENEGIS_CLOUD_DISTANCE_ENCODING,
            1.0)
        : vec4(0.0);
}`;

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
      targetScene.globe.enableLighting = false;
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
    const requests = Array.from({ length: 8 }, createDeferred);
    let requestIndex = 0;
    spyOn(Resource, "fetchArrayBuffer").and.callFake(function () {
      return requests[requestIndex++].promise;
    });
    effects = new SceneGISEnvironmentEffects({
      mode: "globe",
      enabled: true,
      showHeightFog: false,
      showClouds: false,
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
      showClouds: false,
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
      cloudShape: new ArrayBuffer(128 * 128 * 128 * 4),
      cloudDetail: new ArrayBuffer(64 * 64 * 64 * 4),
      cloudWeather: new ArrayBuffer(256 * 256 * 4),
      cloudTurbulence: new ArrayBuffer(64 * 64 * 64 * 4),
      cloudStbn: new ArrayBuffer(128 * 128 * 64),
    };
  }

  function createThinCloudBuffers() {
    const buffers = createLutBuffers();
    const shape = new Uint8Array(buffers.cloudShape);
    for (let z = 0; z < 128; z++) {
      for (let y = 0; y < 128; y++) {
        if (y % 20 >= 8) {
          continue;
        }
        for (let x = 0; x < 128; x++) {
          shape.fill(
            255,
            ((z * 128 + y) * 128 + x) * 4,
            ((z * 128 + y) * 128 + x + 1) * 4,
          );
        }
      }
    }
    new Uint8Array(buffers.cloudDetail).fill(255);
    new Uint8Array(buffers.cloudWeather).fill(255);
    new Uint8Array(buffers.cloudTurbulence).fill(128);
    return buffers;
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

  function encodeFloat16(value) {
    const clamped = Math.min(Math.max(value, -65504.0), 65504.0);
    const float = new Float32Array([clamped]);
    const bits = new Uint32Array(float.buffer)[0];
    const sign = (bits >>> 16) & 0x8000;
    let exponent = ((bits >>> 23) & 0xff) - 127 + 15;
    let mantissa = bits & 0x7fffff;
    if (exponent <= 0) {
      if (exponent < -10) {
        return sign;
      }
      mantissa = (mantissa | 0x800000) >>> (1 - exponent);
      return sign | ((mantissa + 0x1000) >>> 13);
    }
    if (exponent >= 31) {
      return sign | 0x7bff;
    }
    mantissa += 0x1000;
    if (mantissa & 0x800000) {
      mantissa = 0;
      exponent++;
    }
    return sign | (Math.min(exponent, 30) << 10) | (mantissa >>> 13);
  }

  function copyConstantHalfTexture(texture, value) {
    const values = new Uint16Array(texture.width * texture.height * 4);
    const encoded = value.map(encodeFloat16);
    for (let index = 0; index < values.length; index += 4) {
      values.set(encoded, index);
    }
    texture.copyFrom({
      source: {
        width: texture.width,
        height: texture.height,
        arrayBufferView: values,
      },
    });
  }

  function expectFiniteHdrStorage(pixel) {
    for (let channel = 0; channel < 3; channel++) {
      expect(Number.isFinite(pixel[channel])).toBe(true);
      expect(Math.abs(pixel[channel])).toBeLessThanOrEqual(65504.0);
    }
  }

  function readHalfTexturePixel(texture, x, y) {
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [texture],
      destroyAttachments: false,
    });
    try {
      return Array.from(
        scene.context.readPixels({ framebuffer, x, y, width: 1, height: 1 }),
        decodeFloat16,
      );
    } finally {
      framebuffer.destroy();
    }
  }

  function readHalfTexturePixels(texture) {
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [texture],
      destroyAttachments: false,
    });
    try {
      const values = Array.from(
        scene.context.readPixels({
          framebuffer,
          x: 0,
          y: 0,
          width: texture.width,
          height: texture.height,
        }),
        decodeFloat16,
      );
      const pixels = [];
      for (let offset = 0; offset < values.length; offset += 4) {
        pixels.push(values.slice(offset, offset + 4));
      }
      return pixels;
    } finally {
      framebuffer.destroy();
    }
  }

  function readHalfTextureRawBits(texture) {
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [texture],
      destroyAttachments: false,
    });
    try {
      return Uint16Array.from(
        scene.context.readPixels({
          framebuffer,
          width: texture.width,
          height: texture.height,
        }),
      );
    } finally {
      framebuffer.destroy();
    }
  }

  function executeHalfFloatQuad(sources, options = {}) {
    const width = options.width ?? 1;
    const texture = new Texture({
      context: scene.context,
      width,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [texture],
      destroyAttachments: false,
    });
    const passState = new PassState(scene.context);
    passState.framebuffer = framebuffer;
    passState.viewport = new BoundingRectangle(0, 0, width, 1);
    const command = scene.context.createViewportQuadCommand(
      new ShaderSource({
        defines: options.defines ?? [],
        sources,
      }),
      {
        uniformMap: options.uniformMap ?? {},
        framebuffer,
      },
    );
    try {
      command.execute(scene.context, passState);
      return readHalfTexturePixels(texture);
    } finally {
      command.shaderProgram.destroy();
      framebuffer.destroy();
      texture.destroy();
    }
  }

  function readCloudMrtRawBits() {
    const framebuffer = effects._pipeline._resources.cloudFramebuffer;
    return {
      color: readHalfTextureRawBits(framebuffer.getColorTexture(0)),
      distance: readHalfTextureRawBits(framebuffer.getColorTexture(1)),
    };
  }

  function readTexture3DMip(texture, lod, size) {
    const output = new Texture({
      context: scene.context,
      width: size,
      height: size * size,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
    });
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [output],
      destroyAttachments: false,
    });
    const passState = new PassState(scene.context);
    passState.framebuffer = framebuffer;
    passState.viewport = new BoundingRectangle(0, 0, size, size * size);
    const command = scene.context.createViewportQuadCommand(
      `precision highp float;
      precision highp sampler3D;
      uniform sampler3D u_texture;
      uniform float u_lod;
      uniform int u_size;
      void main() {
        ivec2 pixel = ivec2(gl_FragCoord.xy);
        int y = pixel.y % u_size;
        int z = pixel.y / u_size;
        vec3 coordinate =
          (vec3(float(pixel.x), float(y), float(z)) + 0.5) /
          float(u_size);
        float value = textureLod(u_texture, coordinate, u_lod).r;
        out_FragColor = vec4(value, value, value, 1.0);
      }`,
      {
        uniformMap: {
          u_texture: () => texture,
          u_lod: () => lod,
          u_size: () => size,
        },
        framebuffer,
      },
    );
    try {
      command.execute(scene.context, passState);
      const pixels = scene.context.readPixels({
        framebuffer,
        width: size,
        height: size * size,
      });
      return Array.from(
        { length: size * size * size },
        (_, index) => pixels[index * 4],
      );
    } finally {
      command.shaderProgram.destroy();
      framebuffer.destroy();
      output.destroy();
    }
  }

  function readResolvedDepthEvidence(depthTexture, useLogDepth) {
    const output = new Texture({
      context: scene.context,
      width: depthTexture.width,
      height: depthTexture.height,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [output],
      destroyAttachments: false,
    });
    const passState = new PassState(scene.context);
    passState.framebuffer = framebuffer;
    passState.viewport = new BoundingRectangle(
      0,
      0,
      depthTexture.width,
      depthTexture.height,
    );
    const fragmentShaderSource = new ShaderSource({
      defines: useLogDepth ? ["LOG_DEPTH", "LOG_DEPTH_READ_ONLY"] : [],
      sources: [
        `precision highp float;
      in vec2 v_textureCoordinates;
      uniform sampler2D u_depthTexture;
      void main() {
        float rawDepth = texture(u_depthTexture, v_textureCoordinates).r;
        float resolvedDepth = czm_readDepth(
          u_depthTexture, v_textureCoordinates);
        bool clearDepth = rawDepth == 0.0 || rawDepth == 1.0;
        float distanceToGeometry = 0.0;
        if (!clearDepth) {
          vec4 eye = czm_windowToEyeCoordinates(
            vec4(gl_FragCoord.xy, resolvedDepth, 1.0));
          eye /= eye.w;
          distanceToGeometry = length(eye.xyz);
        }
        out_FragColor = vec4(
          (1.0 - rawDepth) * 1.0e7,
          (1.0 - resolvedDepth) * 1.0e7,
          distanceToGeometry / 1.0e6,
          clearDepth ? 0.0 : 1.0);
      }`,
      ],
    });
    const command = scene.context.createViewportQuadCommand(
      fragmentShaderSource,
      {
        uniformMap: {
          u_depthTexture: () => depthTexture,
        },
        framebuffer,
      },
    );
    try {
      command.execute(scene.context, passState);
      return readHalfTexturePixels(output);
    } finally {
      command.shaderProgram.destroy();
      framebuffer.destroy();
      output.destroy();
    }
  }

  function readDirectDepthEvidence(depthTexture, useLogDepth) {
    const output = new Texture({
      context: scene.context,
      width: depthTexture.width,
      height: depthTexture.height,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [output],
      destroyAttachments: false,
    });
    const passState = new PassState(scene.context);
    passState.framebuffer = framebuffer;
    passState.viewport = new BoundingRectangle(
      0,
      0,
      depthTexture.width,
      depthTexture.height,
    );
    const fragmentShaderSource = new ShaderSource({
      defines: useLogDepth ? ["LOG_DEPTH", "LOG_DEPTH_READ_ONLY"] : [],
      sources: [
        `precision highp float;
      in vec2 v_textureCoordinates;
      uniform sampler2D u_depthTexture;
      void main() {
        float rawDepth = texture(u_depthTexture, v_textureCoordinates).r;
        float resolvedDepth = czm_readDepth(
          u_depthTexture, v_textureCoordinates);
        bool clearDepth = rawDepth == 0.0 || rawDepth == 1.0;
        float distanceToGeometry = 0.0;
        if (!clearDepth) {
          vec4 eye = czm_windowToEyeCoordinates(
            vec4(gl_FragCoord.xy, resolvedDepth, 1.0));
          eye /= eye.w;
          distanceToGeometry = length(eye.xyz);
        }
        out_FragColor = vec4(
          rawDepth,
          resolvedDepth,
          distanceToGeometry / 1.0e6,
          clearDepth ? 0.0 : 1.0);
      }`,
      ],
    });
    const command = scene.context.createViewportQuadCommand(
      fragmentShaderSource,
      {
        uniformMap: {
          u_depthTexture: () => depthTexture,
        },
        framebuffer,
      },
    );
    try {
      command.execute(scene.context, passState);
      return readHalfTexturePixels(output);
    } finally {
      command.shaderProgram.destroy();
      framebuffer.destroy();
      output.destroy();
    }
  }

  function createCloudReplayTarget(width, height) {
    const color = new Texture({
      context: scene.context,
      width,
      height,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    const distance = new Texture({
      context: scene.context,
      width,
      height,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [color, distance],
      destroyAttachments: false,
    });
    return {
      framebuffer,
      read() {
        return {
          color: readHalfTextureRawBits(color),
          distance: readHalfTextureRawBits(distance),
        };
      },
      destroy() {
        framebuffer.destroy();
        color.destroy();
        distance.destroy();
      },
    };
  }

  function expectCloudReplayStagesExact(
    globe,
    renderDepth,
    depthTexture,
    context,
  ) {
    const resources = effects._pipeline._resources;
    const command = resources.cloudCommand;
    const originalLinear = resources.cloudProgram;
    const originalLogarithmic = resources.cloudLogDepthProgram;
    const definitions = scene.frameState.useLogDepth
      ? ["LOG_DEPTH", "LOG_DEPTH_READ_ONLY"]
      : [];
    const stages = [
      {
        name: "sentinel",
        source: cloudReplaySentinelFragmentSource,
        defines: definitions,
      },
      {
        name: "ray",
        source: cloudReplayRayFragmentSource,
        defines: definitions,
      },
      {
        name: "density",
        source: cloudFragmentSource,
        defines: [...definitions, "SCENEGIS_CLOUD_REPLAY_DENSITY_ONLY"],
      },
      {
        name: "full",
        program: scene.frameState.useLogDepth
          ? originalLogarithmic
          : originalLinear,
      },
    ];
    try {
      for (const stage of stages) {
        const ownsProgram = !stage.program;
        const program =
          stage.program ??
          createEnvironmentEffectsProgramForSpecs(
            scene.context,
            stage.source,
            globe,
            stage.defines,
          );
        let targetA;
        let targetB;
        let ownerFramebuffer;
        try {
          resources.cloudProgram = program;
          resources.cloudLogDepthProgram = program;
          effects._pipeline.invalidateCloudHistory("spec-replay-stage");
          renderDepth(1.0);
          const ownerA = readCloudMrtRawBits();
          renderDepth(1.0);
          const ownerB = readCloudMrtRawBits();
          expect(ownerB.color)
            .withContext(`${context}/${stage.name}/owner/color`)
            .toEqual(ownerA.color);
          expect(ownerB.distance)
            .withContext(`${context}/${stage.name}/owner/distance`)
            .toEqual(ownerA.distance);

          ownerFramebuffer = command.framebuffer;
          const width = resources.cloudFramebuffer.getColorTexture(0).width;
          const height = resources.cloudFramebuffer.getColorTexture(0).height;
          targetA = createCloudReplayTarget(width, height);
          targetB = createCloudReplayTarget(width, height);
          effects._pipeline._depthTexture = depthTexture;
          command.framebuffer = targetA.framebuffer;
          command.execute(scene.context, effects._pipeline._cloudPassState);
          const independentA = targetA.read();
          command.framebuffer = targetB.framebuffer;
          command.execute(scene.context, effects._pipeline._cloudPassState);
          const independentB = targetB.read();
          effects._pipeline._depthTexture = undefined;
          command.framebuffer = ownerFramebuffer;
          expect(independentB.color)
            .withContext(`${context}/${stage.name}/independent/color`)
            .toEqual(independentA.color);
          expect(independentB.distance)
            .withContext(`${context}/${stage.name}/independent/distance`)
            .toEqual(independentA.distance);
        } finally {
          command.framebuffer = ownerFramebuffer;
          effects._pipeline._depthTexture = undefined;
          targetA?.destroy();
          targetB?.destroy();
          if (ownsProgram) {
            program.destroy();
          }
        }
      }
    } finally {
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
    }
  }

  function installSolidCloudTestTextures() {
    const resources = effects._pipeline._resources;
    const fillVolume = function (texture) {
      texture.copyFrom({
        source: {
          width: texture.width,
          height: texture.height,
          depth: texture.depth,
          arrayBufferView: new Uint8Array(
            texture.width * texture.height * texture.depth * 4,
          ).fill(255),
        },
      });
      texture.generateMipmap();
    };
    fillVolume(resources.cloudShapeTexture);
    installSolidCloudOccupancy();
    fillVolume(resources.cloudDetailTexture);
    fillVolume(resources.cloudTurbulenceTexture);
    resources.cloudWeatherTexture.copyFrom({
      source: {
        width: resources.cloudWeatherTexture.width,
        height: resources.cloudWeatherTexture.height,
        arrayBufferView: new Uint8Array(
          resources.cloudWeatherTexture.width *
            resources.cloudWeatherTexture.height *
            4,
        ).fill(255),
      },
    });
    resources.cloudStbnTexture.copyFrom({
      source: {
        width: resources.cloudStbnTexture.width,
        height: resources.cloudStbnTexture.height,
        depth: resources.cloudStbnTexture.depth,
        arrayBufferView: new Uint8Array(
          resources.cloudStbnTexture.width *
            resources.cloudStbnTexture.height *
            resources.cloudStbnTexture.depth,
        ),
      },
    });
  }

  function installSolidCloudOccupancy() {
    const texture = effects._pipeline._resources.cloudOccupancyTexture;
    texture.copyFrom({
      source: {
        width: texture.width,
        height: texture.height,
        depth: texture.depth,
        arrayBufferView: new Uint8Array(
          texture.width * texture.height * texture.depth,
        ).fill(255),
      },
    });
    // A constant base remains the same under averaging, so this test-only
    // replacement updates every allocated level without raw GL access.
    texture.generateMipmap();
  }

  function installControlledAtmosphereTextures(
    mode,
    incidents = { sun: [0.8, 0.7, 0.6], sky: [0.1, 0.12, 0.16] },
  ) {
    const resources = effects._pipeline._resources;
    const sunIncident = incidents.sun;
    const skyIncident = incidents.sky;
    const solar = [1.474, 1.8504, 1.91198];
    copyConstantHalfTexture(resources.transmittanceTexture, [
      ...sunIncident,
      1.0,
    ]);
    const irradiance = skyIncident.map(function (value, channel) {
      const direct = mode === "planar" ? sunIncident[channel] : 0.0;
      return solar[channel] * (value + direct);
    });
    copyConstantHalfTexture(resources.irradianceTexture, [...irradiance, 1.0]);
    return { sunIncident, skyIncident };
  }

  function installFixedCloudStbn() {
    const texture = effects._pipeline._resources.cloudStbnTexture;
    texture.copyFrom({
      source: {
        width: texture.width,
        height: texture.height,
        depth: texture.depth,
        arrayBufferView: new Uint8Array(
          texture.width * texture.height * texture.depth,
        ),
      },
    });
  }

  function installCloudWeatherRamp() {
    const texture = effects._pipeline._resources.cloudWeatherTexture;
    const values = new Uint8Array(texture.width * texture.height * 4);
    for (let y = 0; y < texture.height; y++) {
      for (let x = 0; x < texture.width; x++) {
        const value = Math.round((255.0 * x) / (texture.width - 1));
        values.fill(
          value,
          (y * texture.width + x) * 4,
          (y * texture.width + x + 1) * 4,
        );
      }
    }
    texture.copyFrom({
      source: {
        width: texture.width,
        height: texture.height,
        arrayBufferView: values,
      },
    });
  }

  function installControlledCloudTestTextures(mode, ramp = false) {
    const resources = effects._pipeline._resources;
    const fillVolume = function (texture, kind) {
      const values = new Uint8Array(
        texture.width * texture.height * texture.depth * 4,
      );
      for (let z = 0; z < texture.depth; z++) {
        for (let y = 0; y < texture.height; y++) {
          for (let x = 0; x < texture.width; x++) {
            const offset = ((z * texture.height + y) * texture.width + x) * 4;
            const value = ramp
              ? Math.round(96 + (159 * x) / Math.max(texture.width - 1, 1))
              : kind === "turbulence"
                ? 128
                : 255;
            values.fill(value, offset, offset + 4);
          }
        }
      }
      texture.copyFrom({
        source: {
          width: texture.width,
          height: texture.height,
          depth: texture.depth,
          arrayBufferView: values,
        },
      });
      texture.generateMipmap();
    };
    fillVolume(resources.cloudShapeTexture, "shape");
    installSolidCloudOccupancy();
    fillVolume(resources.cloudDetailTexture, "detail");
    fillVolume(resources.cloudTurbulenceTexture, "turbulence");
    const weather = new Uint8Array(
      resources.cloudWeatherTexture.width *
        resources.cloudWeatherTexture.height *
        4,
    );
    for (let y = 0; y < resources.cloudWeatherTexture.height; y++) {
      for (let x = 0; x < resources.cloudWeatherTexture.width; x++) {
        const value = ramp
          ? Math.round(
              96 +
                (159 * x) /
                  Math.max(resources.cloudWeatherTexture.width - 1, 1),
            )
          : 255;
        weather.fill(
          value,
          (y * resources.cloudWeatherTexture.width + x) * 4,
          (y * resources.cloudWeatherTexture.width + x + 1) * 4,
        );
      }
    }
    resources.cloudWeatherTexture.copyFrom({
      source: {
        width: resources.cloudWeatherTexture.width,
        height: resources.cloudWeatherTexture.height,
        arrayBufferView: weather,
      },
    });
    resources.cloudStbnTexture.copyFrom({
      source: {
        width: resources.cloudStbnTexture.width,
        height: resources.cloudStbnTexture.height,
        depth: resources.cloudStbnTexture.depth,
        arrayBufferView: new Uint8Array(
          resources.cloudStbnTexture.width *
            resources.cloudStbnTexture.height *
            resources.cloudStbnTexture.depth,
        ),
      },
    });
    return installControlledAtmosphereTextures(mode);
  }

  async function connectControlledCloudMode(mode, beforeFirstUpdate) {
    if (mode === "planar") {
      connectPlanar();
      environment.sunDirection = Cartesian3.UNIT_Z;
      effects.showAtmosphere = false;
      effects.showAerialPerspective = false;
      effects.showHeightFog = false;
      effects.showClouds = true;
      effects.cloudCoverage = 1.0;
      effects.cloudDensity = 0.001;
      await publishPlanarResources();
      return;
    }
    scene = createScene({ orderIndependentTranslucency: false });
    scene.globe = new Globe(Ellipsoid.WGS84);
    hideNativeEnvironment(scene);
    scene.highDynamicRange = true;
    effects = new SceneGISEnvironmentEffects({
      mode: "globe",
      enabled: true,
      showAtmosphere: false,
      showAerialPerspective: false,
      showHeightFog: false,
      showClouds: true,
      cloudCoverage: 1.0,
      cloudDensity: 0.001,
    });
    effects.connectedCallback({});
    if (typeof beforeFirstUpdate === "function") {
      beforeFirstUpdate();
    }
    effects.firstUpdate(scene, scene.frameState.time);
    await pollToPromise(function () {
      effects.update(scene, scene.frameState.time);
      return effects.ready;
    });
  }

  function disconnectControlledCloudMode() {
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
  }

  function renderControlledCloudSample(
    mode,
    materialPhase,
    orthographic,
    logarithmicDepth,
    localDirection = Cartesian3.UNIT_Z,
    farDistance = 20000.0,
  ) {
    const phase =
      typeof materialPhase === "number"
        ? { x: materialPhase, y: 0.0 }
        : materialPhase;
    const longitude = CesiumMath.toDegrees(phase.x / 6360000.0);
    const latitude = CesiumMath.toDegrees(phase.y / 6360000.0);
    const normalizedLocalDirection = Cartesian3.normalize(
      localDirection,
      new Cartesian3(),
    );
    const localRight = Cartesian3.cross(
      normalizedLocalDirection,
      Cartesian3.UNIT_Z,
      new Cartesian3(),
    );
    if (Cartesian3.magnitudeSquared(localRight) < 1.0e-8) {
      Cartesian3.clone(Cartesian3.UNIT_X, localRight);
    } else {
      Cartesian3.normalize(localRight, localRight);
    }
    const localUp = Cartesian3.normalize(
      Cartesian3.cross(localRight, normalizedLocalDirection, new Cartesian3()),
      new Cartesian3(),
    );
    if (mode === "globe") {
      const destination = Cartesian3.fromDegrees(longitude, latitude, 1000.0);
      const frame = Transforms.eastNorthUpToFixedFrame(destination);
      const direction = Cartesian3.normalize(
        Matrix4.multiplyByPointAsVector(
          frame,
          normalizedLocalDirection,
          new Cartesian3(),
        ),
        new Cartesian3(),
      );
      const up = Cartesian3.normalize(
        Matrix4.multiplyByPointAsVector(frame, localUp, new Cartesian3()),
        new Cartesian3(),
      );
      scene.camera.setView({ destination, orientation: { direction, up } });
    } else {
      scene.camera.setView({
        destination: new Cartesian3(phase.x, phase.y, 1000.0),
        orientation: {
          direction: normalizedLocalDirection,
          up: localUp,
        },
      });
    }
    if (orthographic) {
      scene.camera.switchToOrthographicFrustum();
      scene.camera.frustum.width = 8000.0;
    } else {
      scene.camera.switchToPerspectiveFrustum();
    }
    scene.camera.frustum.near = 1.0;
    scene.camera.frustum.far = farDistance;
    scene.logarithmicDepthBuffer = logarithmicDepth;
    effects._pipeline._uniformMap.u_sunDirection = () =>
      effects._pipeline._frame.vertical;
    scene.renderForSpecs();
    effects._pipeline.invalidateCloudHistory();
    const liveFramebuffer = effects._pipeline._resources.cloudFramebuffer;
    const liveWidth = liveFramebuffer.getColorTexture(0).width;
    const liveHeight = liveFramebuffer.getColorTexture(0).height;
    const liveX = Math.floor(liveFramebuffer.getColorTexture(0).width * 0.5);
    const liveY = Math.floor(liveFramebuffer.getColorTexture(0).height * 0.5);
    const liveColor = readHalfTexturePixel(
      liveFramebuffer.getColorTexture(0),
      liveX,
      liveY,
    );
    const liveDistances = readHalfTexturePixel(
      liveFramebuffer.getColorTexture(1),
      liveX,
      liveY,
    );
    const liveColors = readHalfTexturePixels(
      liveFramebuffer.getColorTexture(0),
    );
    const liveDistancePixels = readHalfTexturePixels(
      liveFramebuffer.getColorTexture(1),
    );
    const liveRaw = readCloudMrtRawBits();
    const inputTexture = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      source: { arrayBufferView: new Uint8Array(4) },
    });
    const depthTexture = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.DEPTH_COMPONENT,
      pixelDatatype: PixelDatatype.UNSIGNED_INT,
    });
    const depthColor = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
    });
    const depthFramebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [depthColor],
      depthTexture,
      destroyAttachments: false,
    });
    const clear = new ClearCommand({
      color: Color.BLACK,
      depth: 1.0,
      framebuffer: depthFramebuffer,
    });
    try {
      clear.execute(scene.context);
      effects._pipeline.executeHdr(
        scene.context,
        inputTexture,
        depthTexture,
        scene.context.defaultTexture,
      );
      const framebuffer = effects._pipeline._resources.cloudFramebuffer;
      return {
        liveWidth,
        liveHeight,
        liveColor,
        liveDistances,
        liveSamples: liveColors.map((color, index) => ({
          color,
          distances: liveDistancePixels[index],
        })),
        liveRaw,
        color: readHalfTexturePixel(framebuffer.getColorTexture(0), 0, 0),
        distances: readHalfTexturePixel(framebuffer.getColorTexture(1), 0, 0),
      };
    } finally {
      depthFramebuffer.destroy();
      depthColor.destroy();
      depthTexture.destroy();
      inputTexture.destroy();
    }
  }

  function renderCloudLightingComponentProbe(
    mode,
    sample,
    cloudLibrarySource = cloudSource,
  ) {
    const resources = effects._pipeline._resources;
    const originalLinear = resources.cloudProgram;
    const originalLogarithmic = resources.cloudLogDepthProgram;
    const definitions = [
      `SCENEGIS_CLOUD_PROBE_HEIGHT_FRACTION ${sample.heightFraction}`,
      `SCENEGIS_CLOUD_PROBE_OPTICAL_DEPTH ${sample.opticalDepth}`,
      `SCENEGIS_CLOUD_PROBE_VIEW_COSINE ${sample.viewCosine}`,
      `SCENEGIS_CLOUD_PROBE_HEIGHT_GRADIENT ${sample.heightGradient}`,
      `SCENEGIS_CLOUD_PROBE_LOCAL_EXTINCTION ${sample.localExtinction}`,
    ];
    const directProgram = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      cloudLightingComponentFragmentSource,
      mode === "globe",
      definitions,
      cloudLibrarySource,
    );
    const totalProgram = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      cloudLightingComponentFragmentSource,
      mode === "globe",
      [...definitions, "SCENEGIS_CLOUD_PROBE_TOTAL"],
      cloudLibrarySource,
    );
    const incidentProgram = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      cloudLightingComponentFragmentSource,
      mode === "globe",
      [...definitions, "SCENEGIS_CLOUD_PROBE_INCIDENT"],
      cloudLibrarySource,
    );
    try {
      resources.cloudProgram = directProgram;
      resources.cloudLogDepthProgram = directProgram;
      const directResult = renderControlledCloudSample(mode, 0.0, false, false);
      resources.cloudProgram = totalProgram;
      resources.cloudLogDepthProgram = totalProgram;
      const totalResult = renderControlledCloudSample(mode, 0.0, false, false);
      resources.cloudProgram = incidentProgram;
      resources.cloudLogDepthProgram = incidentProgram;
      const incidentResult = renderControlledCloudSample(
        mode,
        0.0,
        false,
        false,
      );
      return {
        solar: directResult.color.slice(0, 3),
        powder: directResult.color[3],
        sky: directResult.distances.slice(0, 3),
        total: totalResult.color.slice(0, 3),
        unpowdered: totalResult.distances.slice(0, 3),
        sunIncident: incidentResult.color.slice(0, 3),
        skyIncident: incidentResult.distances.slice(0, 3),
      };
    } finally {
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
      directProgram.destroy();
      totalProgram.destroy();
      incidentProgram.destroy();
    }
  }

  function renderGlobeCloudReferenceProbe(components) {
    const resources = effects._pipeline._resources;
    const originalLinear = resources.cloudProgram;
    const originalLogarithmic = resources.cloudLogDepthProgram;
    const program = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      globeCloudReferenceFragmentSource,
      true,
      components ? ["SCENEGIS_GLOBE_REFERENCE_COMPONENTS"] : [],
    );
    try {
      resources.cloudProgram = program;
      resources.cloudLogDepthProgram = program;
      const rendered = renderControlledCloudSample("globe", 0.0, false, false);
      return {
        color: rendered.color,
        distance: rendered.distances,
      };
    } finally {
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
      program.destroy();
    }
  }

  function renderGlobeCloudCoordinateProbe(
    direction,
    globeCloudLibrarySource = globeCloudSource,
  ) {
    const resources = effects._pipeline._resources;
    const originalLinear = resources.cloudProgram;
    const originalLogarithmic = resources.cloudLogDepthProgram;
    const definitions = [
      `SCENEGIS_GLOBE_COORDINATE_X ${direction.x}`,
      `SCENEGIS_GLOBE_COORDINATE_Y ${direction.y}`,
      `SCENEGIS_GLOBE_COORDINATE_Z ${direction.z}`,
    ];
    const program = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      globeCloudCoordinateFragmentSource,
      true,
      definitions,
      cloudSource,
      globeCloudLibrarySource,
    );
    try {
      resources.cloudProgram = program;
      resources.cloudLogDepthProgram = program;
      const coordinate = renderControlledCloudSample(
        "globe",
        0.0,
        false,
        false,
      );
      return {
        uv: coordinate.color.slice(0, 2),
        periodic: coordinate.color.slice(2, 4),
      };
    } finally {
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
      program.destroy();
    }
  }

  function renderCloudAngularPhaseProbe(
    mode,
    phaseAttenuation = "1.0",
    cloudLibrarySource = cloudSource,
  ) {
    const resources = effects._pipeline._resources;
    const originalLinear = resources.cloudProgram;
    const originalLogarithmic = resources.cloudLogDepthProgram;
    const program = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      cloudAngularPhaseFragmentSource,
      mode === "globe",
      [`SCENEGIS_CLOUD_PROBE_PHASE_ATTENUATION ${phaseAttenuation}`],
      cloudLibrarySource,
    );
    try {
      resources.cloudProgram = program;
      resources.cloudLogDepthProgram = program;
      const rendered = renderControlledCloudSample(mode, 0.0, false, false);
      const width = rendered.liveWidth;
      const phases = rendered.liveSamples
        .slice(0, width)
        .map((sample) => sample.color[0]);
      return {
        integral:
          (4.0 * Math.PI * phases.reduce((sum, phase) => sum + phase, 0.0)) /
          width,
        minimum: Math.min(...phases),
        maximum: Math.max(...phases),
        backward: rendered.liveSamples[0].color[1],
        side: rendered.liveSamples[0].color[2],
        forward: rendered.liveSamples[0].color[3],
        sampleCount: width,
      };
    } finally {
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
      program.destroy();
    }
  }

  function computeLiveCloudRay(x, y, width, height, perspective) {
    const frame = effects._pipeline._frame;
    const frustum = scene.camera.frustum;
    const ndcX = ((x + 0.5) / width) * 2.0 - 1.0;
    const ndcY = ((y + 0.5) / height) * 2.0 - 1.0;
    let origin = Cartesian3.clone(frame.cameraPosition);
    let direction;
    if (perspective) {
      const halfHeight = Math.tan(frustum.fovy * 0.5) * frustum.near;
      const halfWidth = halfHeight * frustum.aspectRatio;
      direction = Cartesian3.normalize(
        Cartesian3.add(
          frame.cameraDirection,
          Cartesian3.add(
            Cartesian3.multiplyByScalar(
              frame.cameraRight,
              (ndcX * halfWidth) / frustum.near,
              new Cartesian3(),
            ),
            Cartesian3.multiplyByScalar(
              frame.cameraUp,
              (ndcY * halfHeight) / frustum.near,
              new Cartesian3(),
            ),
            new Cartesian3(),
          ),
          new Cartesian3(),
        ),
        new Cartesian3(),
      );
    } else {
      const halfWidth = frustum.width * 0.5;
      const halfHeight = halfWidth / frustum.aspectRatio;
      const offset = Cartesian3.add(
        Cartesian3.multiplyByScalar(
          frame.cameraRight,
          ndcX * halfWidth,
          new Cartesian3(),
        ),
        Cartesian3.multiplyByScalar(
          frame.cameraUp,
          ndcY * halfHeight,
          new Cartesian3(),
        ),
        new Cartesian3(),
      );
      origin = Cartesian3.add(origin, offset, origin);
      direction = Cartesian3.clone(frame.cameraDirection);
    }
    const originOffset = Cartesian3.subtract(
      origin,
      frame.cameraPosition,
      new Cartesian3(),
    );
    return {
      origin: new Cartesian3(
        Cartesian3.dot(originOffset, frame.east),
        Cartesian3.dot(originOffset, frame.north),
        frame.altitude + Cartesian3.dot(originOffset, frame.vertical),
      ),
      direction: Cartesian3.normalize(
        new Cartesian3(
          Cartesian3.dot(direction, frame.east),
          Cartesian3.dot(direction, frame.north),
          Cartesian3.dot(direction, frame.vertical),
        ),
        new Cartesian3(),
      ),
    };
  }

  function computeCloudSegment(mode, ray) {
    const maximumDistance = 5000000.0;
    const bottom = 1500.0;
    const top = 6000.0;
    let start;
    let end;
    if (mode === "planar") {
      if (Math.abs(ray.direction.z) < 1.0e-7) {
        if (ray.origin.z < bottom || ray.origin.z > top) {
          return undefined;
        }
        start = 0.0;
        end = maximumDistance;
      } else {
        const first = (bottom - ray.origin.z) / ray.direction.z;
        const second = (top - ray.origin.z) / ray.direction.z;
        start = Math.max(Math.min(first, second), 0.0);
        end = Math.min(Math.max(first, second), maximumDistance);
      }
    } else {
      const virtualOrigin = new Cartesian3(
        ray.origin.x,
        ray.origin.y,
        6360000.0 + ray.origin.z,
      );
      const sphereInterval = function (radius) {
        const projected = Cartesian3.dot(virtualOrigin, ray.direction);
        const discriminant =
          projected * projected -
          Cartesian3.dot(virtualOrigin, virtualOrigin) +
          radius * radius;
        if (discriminant < 0.0) {
          return undefined;
        }
        const root = Math.sqrt(Math.max(discriminant, 0.0));
        const interval = [-projected - root, -projected + root];
        return interval[1] > 0.0 ? interval : undefined;
      };
      const outer = sphereInterval(6360000.0 + top);
      if (!outer) {
        return undefined;
      }
      start = Math.max(outer[0], 0.0);
      end = Math.min(outer[1], maximumDistance);
      const inner = sphereInterval(6360000.0 + bottom);
      if (inner) {
        if (Cartesian3.magnitude(virtualOrigin) < 6360000.0 + bottom) {
          start = Math.max(start, inner[1]);
        } else if (inner[0] > start) {
          end = Math.min(end, inner[0]);
        }
      }
    }
    end = Math.min(end, start + 300000.0);
    return end > start ? { start, end } : undefined;
  }

  function expectRawCloudSamplesMatchLiveSegments(
    samples,
    mode,
    perspective,
    requireEveryHit = true,
  ) {
    const width = 4;
    const height = 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sample = samples[y * width + x];
        const ray = computeLiveCloudRay(x, y, width, height, perspective);
        const segment = computeCloudSegment(mode, ray);
        expect(segment)
          .withContext(
            `${mode} ${perspective ? "perspective" : "orthographic"} ${x},${y}`,
          )
          .toBeDefined();
        const stepLength = (segment.end - segment.start) / 48.0;
        const front = sample.distances[1] * 1000000.0;
        const mean = sample.distances[0] * 1000000.0;
        if (!requireEveryHit && sample.distances[3] <= 0.5) {
          continue;
        }
        expect(sample.distances[3]).toBeGreaterThan(0.5);
        expect(front).toBeGreaterThanOrEqual(segment.start - 8.0);
        expect(front).toBeLessThanOrEqual(
          segment.start + 135.0 + stepLength * 1.5 + 8.0,
        );
        expect(mean).toBeGreaterThanOrEqual(front - 8.0);
        expect(mean).toBeLessThanOrEqual(segment.end + 8.0);
        if (x === width - 1 && y === height - 1) {
          const legacyRay = computeLiveCloudRay(
            (x + 0.5) * 2.0 - 0.5,
            (y + 0.5) * 2.0 - 0.5,
            width,
            height,
            perspective,
          );
          const legacySegment = computeCloudSegment(mode, legacyRay);
          if (legacySegment) {
            const legacyStep = (legacySegment.end - legacySegment.start) / 48.0;
            const legacyLower = legacySegment.start - 8.0;
            const legacyUpper = legacySegment.start + legacyStep * 1.5 + 8.0;
            expect(front < legacyLower || front > legacyUpper).toBe(true);
          }
        }
      }
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
    for (const property of [
      "backgroundRadianceScale",
      "aerialRadianceScale",
      "surfaceRadianceScale",
    ]) {
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
      cloudCoverage: [0.0, 1.0],
      cloudDensity: [0.0, 0.01],
      cloudBaseHeight: [-500.0, 20000.0],
      cloudThickness: [0.0, 20000.0],
      cloudWindDirection: [-Math.PI, Math.PI],
      cloudWindSpeed: [0.0, 200.0],
      cloudTime: [-1000000000.0, 1000000000.0],
      cloudRadianceScale: [0.0, 64.0],
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
    for (const cloudQuality of ["", "ultra", 1, undefined]) {
      if (cloudQuality === undefined) {
        continue;
      }
      expect(function () {
        return new SceneGISEnvironmentEffects({
          mode: "globe",
          cloudQuality,
        });
      }).toThrowDeveloperError();
    }
    for (const cloudPreset of ["", "storm", 1]) {
      expect(function () {
        return new SceneGISEnvironmentEffects({ mode: "globe", cloudPreset });
      }).toThrowDeveloperError();
    }

    effects = new SceneGISEnvironmentEffects({ mode: "globe" });
    expect(effects.mode).toBe("globe");
    expect(effects.world).toBeUndefined();
    expect(effects.enabled).toBe(false);
    expect(effects.showAtmosphere).toBe(true);
    expect(effects.showAerialPerspective).toBe(true);
    expect(effects.showHeightFog).toBe(true);
    expect(effects.showClouds).toBe(true);
    expect(effects.showCloudShadows).toBe(true);
    expect(effects.showCrepuscularRays).toBe(true);
    expect(effects.cloudQuality).toBe("medium");
    expect(effects.cloudPreset).toBe("cumulus");
    expect(effects.cloudCoverage).toBe(0.45);
    expect(effects.cloudDensity).toBe(0.001);
    expect(effects.cloudBaseHeight).toBe(1500.0);
    expect(effects.cloudThickness).toBe(4500.0);
    expect(effects.cloudWindDirection).toBe(0.785398);
    expect(effects.cloudWindSpeed).toBe(20.0);
    expect(effects.cloudTime).toBe(0.0);
    expect(effects.cloudRadianceScale).toBe(48.0);
    expect(effects.backgroundRadianceScale).toBe(10.0);
    expect(effects.aerialRadianceScale).toBe(1.0);
    expect(effects.surfaceRadianceScale).toBe(10.0);
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
      surfaceRadianceScale: 4.0,
      showHeightFog: false,
      heightFogDensity: 0.0001,
      heightFogHeightFalloff: 0.0,
      heightFogBaseHeight: 100.0,
      heightFogStartDistance: 500.0,
      heightFogMaximumOpacity: 0.5,
      heightFogInscatteringScale: 0.7,
      heightFogDirectionalInscatteringScale: 0.3,
      heightFogDirectionalInscatteringExponent: 16.0,
      showClouds: false,
      showCloudShadows: false,
      showCrepuscularRays: false,
      cloudQuality: "high",
      cloudCoverage: 0.6,
      cloudDensity: 0.002,
      cloudBaseHeight: 2000.0,
      cloudThickness: 5000.0,
      cloudWindDirection: -0.5,
      cloudWindSpeed: 30.0,
      cloudTime: -50.0,
      cloudRadianceScale: 2.0,
    });
    expect(effects.backgroundRadianceScale).toBe(3.0);
    expect(effects.aerialRadianceScale).toBe(0.5);
    expect(effects.surfaceRadianceScale).toBe(4.0);
    expect(effects.showHeightFog).toBe(false);
    expect(effects.heightFogDensity).toBe(0.0001);
    expect(effects.heightFogHeightFalloff).toBe(0.0);
    expect(effects.heightFogBaseHeight).toBe(100.0);
    expect(effects.heightFogStartDistance).toBe(500.0);
    expect(effects.heightFogMaximumOpacity).toBe(0.5);
    expect(effects.heightFogInscatteringScale).toBe(0.7);
    expect(effects.heightFogDirectionalInscatteringScale).toBe(0.3);
    expect(effects.heightFogDirectionalInscatteringExponent).toBe(16.0);
    expect(effects.showClouds).toBe(false);
    expect(effects.showCloudShadows).toBe(false);
    expect(effects.showCrepuscularRays).toBe(false);
    expect(effects.cloudQuality).toBe("high");
    expect(effects.cloudCoverage).toBe(0.6);
    expect(effects.cloudDensity).toBe(0.002);
    expect(effects.cloudBaseHeight).toBe(2000.0);
    expect(effects.cloudThickness).toBe(5000.0);
    expect(effects.cloudWindDirection).toBe(-0.5);
    expect(effects.cloudWindSpeed).toBe(30.0);
    expect(effects.cloudTime).toBe(-50.0);
    expect(effects.cloudRadianceScale).toBe(2.0);
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

  it("round-trips the packed cloud shadow length on the actual GPU", function () {
    scene = createScene();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const pixels = executeHalfFloatQuad(
      [
        cloudShadowSource,
        `precision highp float;
        void main() {
          int sampleIndex = int(gl_FragCoord.x);
          bool valid = sampleIndex != 0;
          float shadowLength = sampleIndex < 2
            ? 0.0
            : (sampleIndex == 2 ? 100000.0 : 250000.0);
          float packed = sceneGISEncodeCloudShadowLength(
            valid, shadowLength);
          bool decodedValid;
          float decodedLength;
          sceneGISDecodeCloudShadowLength(
            packed, decodedValid, decodedLength);
          out_FragColor = vec4(
            packed,
            decodedLength / SCENEGIS_CLOUD_SHADOW_MAX_LENGTH,
            decodedValid ? 1.0 : 0.0,
            0.75);
        }`,
      ],
      { width: 4 },
    );
    expect(pixels[0][0]).toBe(0.0);
    expect(pixels[1][0]).toBe(1.0);
    expect(pixels[0][1]).toBe(0.0);
    expect(pixels[1][1]).toBe(0.0);
    expect(pixels[2][1]).toEqualEpsilon(0.5, 0.001);
    expect(pixels[3][1]).toBe(1.0);
    expect(pixels[0][2]).toBe(0.0);
    expect(pixels[1][2]).toBe(1.0);
    expect(pixels[2][2]).toBe(1.0);
    expect(pixels[3][2]).toBe(1.0);
    for (const pixel of pixels) {
      expect(pixel[3]).toBe(0.75);
    }
  });

  it("marches raw progressive Globe shadow length outside cloud support on the actual GPU", function () {
    scene = createScene();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const atlasSize = 16;
    const atlasValues = new Uint16Array(atlasSize * atlasSize * 4);
    for (let offset = 0; offset < atlasValues.length; offset += 4) {
      atlasValues[offset] = encodeFloat16(0.0);
      atlasValues[offset + 1] = encodeFloat16(1.0);
      atlasValues[offset + 2] = encodeFloat16(0.0);
      atlasValues[offset + 3] = encodeFloat16(0.0);
    }
    for (let y = 0; y < atlasSize; y++) {
      for (let x = 0; x < atlasSize; x++) {
        if (x !== 2 && x !== 5) {
          atlasValues[(y * atlasSize + x) * 4 + 2] = encodeFloat16(4.0);
        }
      }
    }
    const atlas = new Texture({
      context: scene.context,
      width: atlasSize,
      height: atlasSize,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.NEAREST,
        magnificationFilter: TextureMagnificationFilter.NEAREST,
      }),
      source: {
        width: atlasSize,
        height: atlasSize,
        arrayBufferView: atlasValues,
      },
    });
    const filteredUniformMutationSource = cloudSource.replace(
      `    float shadowLength = 0.0;
    float intervalStart = shadowSegmentStart;
    float intervalLength = 50.0;
    for (int step = 0;
         step < SCENEGIS_CLOUD_SHADOW_VIEW_MAX_STEPS;
         ++step) {
        if (intervalStart >= shadowSegmentEnd) {
            break;
        }
        float intervalEnd = min(
            intervalStart + intervalLength,
            shadowSegmentEnd);
        float actualIntervalLength = intervalEnd - intervalStart;
        float viewDistance = intervalStart + actualIntervalLength * 0.5;
        vec3 midpoint =
            localRayOrigin + localRayDirection * viewDistance;
        float opticalDepth = sceneGISCloudShadowRawOpticalDepth(
            midpoint,
            viewDistance);
        shadowLength +=
            (1.0 - exp(-min(opticalDepth, 80.0))) *
            actualIntervalLength;
        intervalStart = intervalEnd;
        intervalLength *= 1.01;
    }`,
      `    float shadowLength = 0.0;
    float intervalLength =
        (shadowSegmentEnd - shadowSegmentStart) / 64.0;
    for (int step = 0; step < 64; ++step) {
        float viewDistance =
            shadowSegmentStart + (float(step) + 0.5) * intervalLength;
        vec3 midpoint =
            localRayOrigin + localRayDirection * viewDistance;
        float opticalDepth = sceneGISCloudShadowOpticalDepth(
            midpoint,
            viewDistance);
        shadowLength +=
            (1.0 - exp(-min(opticalDepth, 80.0))) * intervalLength;
    }`,
    );
    expect(filteredUniformMutationSource).not.toBe(cloudSource);
    const fragment = `precision highp float;
      void main() {
        vec3 origin = vec3(0.0, 0.0, 20000.0);
        vec3 direction = vec3(0.0, 0.0, 1.0);
        float cloudStart;
        float cloudEnd;
        bool cloudHit = sceneGISCloudSegment(
          origin, direction, 10000.0, 1500.0, 4500.0,
          cloudStart, cloudEnd);
        float shadowStart;
        float shadowEnd;
        bool shadowHit = sceneGISCloudShadowViewSegment(
          origin, direction, 10000.0, shadowStart, shadowEnd);
        float shadowLength = sceneGISCloudShadowViewLength(
          origin, direction, 10000.0);
        float rawOpticalDepth = sceneGISCloudShadowRawOpticalDepth(
          origin + direction * 25.0, 25.0);
        out_FragColor = vec4(
          shadowLength / SCENEGIS_CLOUD_SHADOW_MAX_LENGTH,
          shadowHit ? 1.0 : 0.0,
          rawOpticalDepth / 4.0,
          cloudHit ? 1.0 : 0.0);
      }`;
    const matrices = [
      Matrix4.fromScale(Cartesian3.ZERO, new Matrix4()),
      Matrix4.clone(Matrix4.IDENTITY),
      Matrix4.clone(Matrix4.IDENTITY),
    ];
    const intervals = [
      new Cartesian2(0.0, 10000.0),
      new Cartesian2(0.0, 0.0),
      new Cartesian2(0.0, 0.0),
    ];
    const render = (librarySource) =>
      executeHalfFloatQuad(
        [
          brunetonDefinitionsSource,
          brunetonCommonSource,
          brunetonRuntimeSource,
          atmosphereSource,
          cloudShadowSource,
          globeCloudSource,
          librarySource,
          fragment,
        ],
        {
          defines: [
            "SCENEGIS_GLOBE",
            "COMBINED_SCATTERING_TEXTURES",
            "TRANSMITTANCE_TEXTURE_WIDTH 256",
            "TRANSMITTANCE_TEXTURE_HEIGHT 64",
            "SCATTERING_TEXTURE_R_SIZE 32",
            "SCATTERING_TEXTURE_MU_SIZE 128",
            "SCATTERING_TEXTURE_MU_S_SIZE 32",
            "SCATTERING_TEXTURE_NU_SIZE 8",
            "IRRADIANCE_TEXTURE_WIDTH 64",
            "IRRADIANCE_TEXTURE_HEIGHT 16",
          ],
          uniformMap: {
            u_sceneGISCloudShadowAtlas: () => atlas,
            u_sceneGISCloudShadowMatrices: () => matrices,
            u_sceneGISCloudShadowIntervals: () => intervals,
            u_sceneGISCloudShadowCascadeCount: () => 1,
            u_sceneGISShowCrepuscularRays: () => true,
            u_sceneGISShadowSunDirection: () => Cartesian3.UNIT_Z,
            u_sceneGISShadowCloudTop: () => 30000.0,
          },
        },
      )[0];
    try {
      const actual = render(cloudSource);
      const filteredUniformMutation = render(filteredUniformMutationSource);
      let cpuIntervalStart = 0.0;
      let cpuIntervalLength = 50.0;
      let expectedLength = 0.0;
      for (let step = 0; step < 384 && cpuIntervalStart < 10000.0; step++) {
        const intervalEnd = Math.min(
          cpuIntervalStart + cpuIntervalLength,
          10000.0,
        );
        expectedLength +=
          (1.0 - Math.exp(-4.0)) * (intervalEnd - cpuIntervalStart);
        cpuIntervalStart = intervalEnd;
        cpuIntervalLength *= 1.01;
      }
      expect(cpuIntervalStart).toBe(10000.0);
      expect(actual[0]).toEqualEpsilon(expectedLength / 200000.0, 0.0002);
      expect(actual[1]).toBe(1.0);
      expect(actual[2]).toBe(1.0);
      expect(filteredUniformMutation[0]).toBeLessThan(actual[0] * 0.9);
      expect(filteredUniformMutation[1]).toBe(1.0);
      expect(filteredUniformMutation[2]).toBe(1.0);
      expect(actual[3]).toBe(0.0);
      expect(filteredUniformMutation[3]).toBe(0.0);
    } finally {
      atlas.destroy();
    }
  });

  it("renders the full clear-depth Globe fog medium with physical directional Sun on the actual GPU", async function () {
    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const resources = effects._pipeline._resources;
    const makeTexture = (values) =>
      new Texture({
        context: scene.context,
        width: 1,
        height: 1,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        source: {
          width: 1,
          height: 1,
          arrayBufferView: new Uint16Array(values.map(encodeFloat16)),
        },
      });
    const transmittanceTexture = new Texture({
      context: scene.context,
      width: 1,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      source: {
        width: 1,
        height: 1,
        arrayBufferView: new Uint16Array([
          encodeFloat16(1.0),
          encodeFloat16(1.0),
          encodeFloat16(1.0),
          encodeFloat16(1.0),
        ]),
      },
    });
    const noSunTransmittanceTexture = makeTexture([0.0, 0.0, 0.0, 1.0]);
    const irradianceTexture = resources.irradianceTexture;
    const colorTexture = makeTexture([0.05, 0.05, 0.05, 1.0]);
    const depthTexture = makeTexture([1.0, 0.0, 0.0, 1.0]);
    const finiteDepthTexture = makeTexture([0.5, 0.0, 0.0, 1.0]);
    const cloudColorTexture = makeTexture([0.0, 0.0, 0.0, 1.0]);
    const selectedCloudColorTexture = makeTexture([0.0, 0.0, 0.0, 0.1]);
    const cloudDistanceZeroTexture = makeTexture([0.0, 0.0, 0.0, 0.0]);
    const shadowLength = 20000.0;
    const shadowCode = Math.round((shadowLength / 200000.0) * 1023.0);
    const cloudDistanceShadowTexture = makeTexture([
      0.0,
      0.0,
      0.0,
      shadowCode / 2048.0,
    ]);
    const cloudDistanceAt = (meanDistance, frontDistance) =>
      makeTexture([
        meanDistance / 2000000.0,
        frontDistance / 2000000.0,
        5000.0 / 2000000.0,
        1.0,
      ]);
    const cloudMeanFourFrontOneTexture = cloudDistanceAt(4000.0, 1000.0);
    const cloudMeanEightFrontOneTexture = cloudDistanceAt(8000.0, 1000.0);
    const cloudMeanFourFrontFarTexture = cloudDistanceAt(4000.0, 100000.0);
    const deltaOnlyAerialSource = aerialFragmentSource
      .replace(
        `if (isClearDepth && !u_showClouds
        #ifdef SCENEGIS_GLOBE
        && !u_showHeightFog
        #endif
        )`,
        `if (isClearDepth && !u_showClouds)`,
      )
      .replace(
        `    if (isClearDepth && u_showHeightFog) {
        sceneLinearRadiance = sceneGISApplyExponentialHeightFog(
            u_transmittanceTexture,
            sceneLinearRadiance,
            rayOrigin,
            viewDirection,
            sunDirection,
            distanceToPoint,
            shadowLength,
            u_heightFogDensity,
            u_heightFogHeightFalloff,
            u_heightFogBaseHeight,
            u_heightFogStartDistance,
            u_heightFogMaximumOpacity,
            u_backgroundRadianceScale,
            u_heightFogInscatteringScale,
            u_heightFogDirectionalInscatteringScale,
            u_heightFogDirectionalInscatteringExponent);
    }`,
        `    if (isClearDepth && u_showHeightFog && shadowLength > 0.0) {
        vec3 clearFogBase = sceneLinearRadiance;
        vec3 shadowedFog = sceneGISApplyExponentialHeightFog(
            u_transmittanceTexture,
            clearFogBase,
            rayOrigin,
            viewDirection,
            sunDirection,
            distanceToPoint,
            shadowLength,
            u_heightFogDensity,
            u_heightFogHeightFalloff,
            u_heightFogBaseHeight,
            u_heightFogStartDistance,
            u_heightFogMaximumOpacity,
            u_backgroundRadianceScale,
            u_heightFogInscatteringScale,
            u_heightFogDirectionalInscatteringScale,
            u_heightFogDirectionalInscatteringExponent);
        vec3 unshadowedFog = sceneGISApplyExponentialHeightFog(
            u_transmittanceTexture,
            clearFogBase,
            rayOrigin,
            viewDirection,
            sunDirection,
            distanceToPoint,
            0.0,
            u_heightFogDensity,
            u_heightFogHeightFalloff,
            u_heightFogBaseHeight,
            u_heightFogStartDistance,
            u_heightFogMaximumOpacity,
            u_backgroundRadianceScale,
            u_heightFogInscatteringScale,
            u_heightFogDirectionalInscatteringScale,
            u_heightFogDirectionalInscatteringExponent);
        sceneLinearRadiance += shadowedFog - unshadowedFog;
    }`,
      );
    expect(deltaOnlyAerialSource).not.toBe(aerialFragmentSource);
    const normalizedSunFogSource = heightFogSource.replace(
      `    #ifdef SCENEGIS_GLOBE
    return numerator;
    #else
    float denominator = sceneGISHeightFogMaxComponent(
        SCENEGIS_SOLAR_IRRADIANCE);
    return numerator / max(denominator, 1.0e-8);
    #endif`,
      `    float denominator = sceneGISHeightFogMaxComponent(
        SCENEGIS_SOLAR_IRRADIANCE);
    return numerator / max(denominator, 1.0e-8);`,
    );
    expect(normalizedSunFogSource).not.toBe(heightFogSource);
    const finitePointAerialSource = aerialFragmentSource
      .replace(
        `vec3 clearRadiance = sceneGISGlobeSkyRadiance(
            u_transmittanceTexture,
            u_scatteringTexture,
            rayOrigin,
            viewDirection,
            sunDirection,
            shadowLength,
            clearTransmittance);`,
        `vec3 clearRadiance = sceneGISGlobeSkyRadianceToPoint(
            u_transmittanceTexture,
            u_scatteringTexture,
            rayOrigin,
            viewDirection,
            sunDirection,
            distanceToPoint,
            shadowLength,
            clearTransmittance);`,
      )
      .replace(
        `vec3 unshadowedRadiance = sceneGISGlobeSkyRadiance(
            u_transmittanceTexture,
            u_scatteringTexture,
            rayOrigin,
            viewDirection,
            sunDirection,
            0.0,
            unshadowedTransmittance);`,
        `vec3 unshadowedRadiance = sceneGISGlobeSkyRadianceToPoint(
            u_transmittanceTexture,
            u_scatteringTexture,
            rayOrigin,
            viewDirection,
            sunDirection,
            distanceToPoint,
            0.0,
            unshadowedTransmittance);`,
      );
    expect(finitePointAerialSource).not.toBe(aerialFragmentSource);
    const defines = [
      "SCENEGIS_GLOBE",
      "COMBINED_SCATTERING_TEXTURES",
      "TRANSMITTANCE_TEXTURE_WIDTH 256",
      "TRANSMITTANCE_TEXTURE_HEIGHT 64",
      "SCATTERING_TEXTURE_R_SIZE 32",
      "SCATTERING_TEXTURE_MU_SIZE 128",
      "SCATTERING_TEXTURE_MU_S_SIZE 32",
      "SCATTERING_TEXTURE_NU_SIZE 8",
      "IRRADIANCE_TEXTURE_WIDTH 64",
      "IRRADIANCE_TEXTURE_HEIGHT 16",
    ];
    const renderAerial = ({
      aerialSource = aerialFragmentSource,
      fogSource = heightFogSource,
      lengthTexture = cloudDistanceZeroTexture,
      sampledDepthTexture = depthTexture,
      sampledCloudColorTexture = cloudColorTexture,
      showClouds = true,
      cloudCoverage = 0.65,
      showAerialPerspective = false,
      showHeightFog = true,
      ambientScale = 0.0,
      directionalScale = 1.0,
      backgroundScale = 10.0,
    } = {}) =>
      executeHalfFloatQuad(
        [
          brunetonDefinitionsSource,
          brunetonCommonSource,
          brunetonRuntimeSource,
          atmosphereSource,
          cloudShadowSource,
          fogSource,
          globeCloudSource,
          cloudSource,
          aerialSource,
        ],
        {
          defines,
          uniformMap: {
            u_colorTexture: () => colorTexture,
            u_depthTexture: () => sampledDepthTexture,
            u_perspective: () => false,
            u_cameraDirection: () => Cartesian3.UNIT_Z,
            u_cameraRight: () => Cartesian3.UNIT_X,
            u_cameraUp: () => Cartesian3.UNIT_Y,
            u_east: () => Cartesian3.UNIT_X,
            u_north: () => Cartesian3.UNIT_Y,
            u_vertical: () => Cartesian3.UNIT_Z,
            u_sunDirection: () => Cartesian3.UNIT_Z,
            u_altitude: () => 1000.0,
            u_aerialRadianceScale: () => 1.0,
            u_backgroundRadianceScale: () => backgroundScale,
            u_showAerialPerspective: () => showAerialPerspective,
            u_showHeightFog: () => showHeightFog,
            u_showClouds: () => showClouds,
            u_heightFogDensity: () => 0.001,
            u_heightFogHeightFalloff: () => 0.00002,
            u_heightFogBaseHeight: () => 0.0,
            u_heightFogStartDistance: () => 0.0,
            u_heightFogMaximumOpacity: () => 1.0,
            u_heightFogInscatteringScale: () => ambientScale,
            u_heightFogDirectionalInscatteringScale: () => directionalScale,
            u_heightFogDirectionalInscatteringExponent: () => 1.0,
            u_transmittanceTexture: () => transmittanceTexture,
            u_scatteringTexture: () => resources.scatteringTexture,
            u_irradianceTexture: () => irradianceTexture,
            u_cloudColorTexture: () => sampledCloudColorTexture,
            u_cloudDistanceTexture: () => lengthTexture,
            u_cloudCoverage: () => cloudCoverage,
            u_sceneGISShowCrepuscularRays: () => true,
            u_sceneGISShadowCloudTop: () => 6000.0,
          },
        },
      )[0];
    const hazeFragment = `precision highp float;
      uniform sampler2D u_transmittanceTexture;
      uniform sampler2D u_irradianceTexture;
      uniform float u_testShadowLength;
      void main() {
        vec3 cameraPosition = vec3(0.0, 0.0, 1000.0);
        vec3 direction = vec3(0.0, 0.0, 1.0);
        vec3 intervalOrigin = cameraPosition + direction * 100.0;
        float rayDistance = sceneGISGlobeCloudHazeRayDistance(
          intervalOrigin, direction, 10000.0);
        out_FragColor = sceneGISGlobeCloudHaze(
          u_transmittanceTexture,
          u_irradianceTexture,
          cameraPosition,
          direction,
          direction,
          rayDistance,
          u_testShadowLength,
          0.65);
      }`;
    const renderHaze = (sunTexture, testShadowLength) =>
      executeHalfFloatQuad(
        [
          brunetonDefinitionsSource,
          brunetonCommonSource,
          brunetonRuntimeSource,
          atmosphereSource,
          cloudShadowSource,
          globeCloudSource,
          cloudSource,
          hazeFragment,
        ],
        {
          defines,
          uniformMap: {
            u_transmittanceTexture: () => sunTexture,
            u_irradianceTexture: () => resources.irradianceTexture,
            u_testShadowLength: () => testShadowLength,
            u_sceneGISShadowCloudTop: () => 6000.0,
          },
        },
      )[0];
    const irradianceFragment = `precision highp float;
      uniform sampler2D u_transmittanceTexture;
      uniform sampler2D u_irradianceTexture;
      void main() {
        AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
        vec3 skyIrradiance;
        vec3 sunIrradiance = GetSunAndSkyScalarIrradiance(
          atmosphere,
          u_transmittanceTexture,
          u_irradianceTexture,
          vec3(0.0, 0.0, SCENEGIS_BOTTOM_RADIUS + 1000.0) * 0.001,
          vec3(0.0, 0.0, 1.0),
          skyIrradiance);
        out_FragColor = gl_FragCoord.x < 1.5
          ? vec4(sunIrradiance, 1.0)
          : vec4(skyIrradiance, 1.0);
      }`;
    const sampledIrradiance = executeHalfFloatQuad(
      [
        brunetonDefinitionsSource,
        brunetonCommonSource,
        brunetonRuntimeSource,
        atmosphereSource,
        irradianceFragment,
      ],
      {
        width: 2,
        defines,
        uniformMap: {
          u_transmittanceTexture: () => resources.transmittanceTexture,
          u_irradianceTexture: () => resources.irradianceTexture,
        },
      },
    );
    const skyWrapperFragment = `precision highp float;
      uniform sampler2D u_transmittanceTexture;
      uniform sampler3D u_scatteringTexture;
      void main() {
        vec3 zeroTransmittance;
        vec3 shadowedTransmittance;
        vec3 zeroRadiance = sceneGISGlobeSkyRadiance(
          u_transmittanceTexture,
          u_scatteringTexture,
          vec3(0.0, 0.0, 1000.0),
          vec3(0.0, 0.0, 1.0),
          vec3(0.0, 0.0, 1.0),
          0.0,
          zeroTransmittance);
        vec3 shadowedRadiance = sceneGISGlobeSkyRadiance(
          u_transmittanceTexture,
          u_scatteringTexture,
          vec3(0.0, 0.0, 1000.0),
          vec3(0.0, 0.0, 1.0),
          vec3(0.0, 0.0, 1.0),
          20000.0,
          shadowedTransmittance);
        vec3 difference = abs(shadowedRadiance - zeroRadiance);
        out_FragColor = vec4(
          difference,
          max(difference.r, max(difference.g, difference.b)));
      }`;
    const skyDifference = executeHalfFloatQuad(
      [
        brunetonDefinitionsSource,
        brunetonCommonSource,
        brunetonRuntimeSource,
        atmosphereSource,
        skyWrapperFragment,
      ],
      {
        defines,
        uniformMap: {
          u_transmittanceTexture: () => transmittanceTexture,
          u_scatteringTexture: () => resources.scatteringTexture,
        },
      },
    )[0];
    try {
      const clearZero = renderAerial({ showClouds: false });
      const clearShadowed = renderAerial({
        lengthTexture: cloudDistanceShadowTexture,
      });
      const ambientZero = renderAerial({
        showClouds: false,
        cloudCoverage: 0.0,
        ambientScale: 1.0,
        directionalScale: 0.0,
      });
      const ambientShadowed = renderAerial({
        lengthTexture: cloudDistanceShadowTexture,
        cloudCoverage: 0.0,
        ambientScale: 1.0,
        directionalScale: 0.0,
      });
      const deltaOnlyZero = renderAerial({
        aerialSource: deltaOnlyAerialSource,
        showClouds: false,
      });
      const normalizedSunZero = renderAerial({
        fogSource: normalizedSunFogSource,
        showClouds: false,
      });
      const infiniteSkyShadowed = renderAerial({
        lengthTexture: cloudDistanceShadowTexture,
        showAerialPerspective: true,
        showHeightFog: false,
      });
      const finitePointSkyShadowed = renderAerial({
        aerialSource: finitePointAerialSource,
        lengthTexture: cloudDistanceShadowTexture,
        showAerialPerspective: true,
        showHeightFog: false,
      });
      const hazeZero = renderHaze(resources.transmittanceTexture, 0.0);
      const hazeShadowed = renderHaze(resources.transmittanceTexture, 2500.0);
      const ambientHazeZero = renderHaze(noSunTransmittanceTexture, 0.0);
      const ambientHazeShadowed = renderHaze(noSunTransmittanceTexture, 2500.0);
      const integratedHazeZero = renderAerial({
        showAerialPerspective: false,
        showHeightFog: false,
      });
      const integratedHazeShadowed = renderAerial({
        lengthTexture: cloudDistanceShadowTexture,
        showAerialPerspective: false,
        showHeightFog: false,
      });
      const finiteNoCloud = renderAerial({
        sampledDepthTexture: finiteDepthTexture,
        showAerialPerspective: false,
        showHeightFog: false,
      });
      const frontOneMeanFour = renderAerial({
        lengthTexture: cloudMeanFourFrontOneTexture,
        sampledCloudColorTexture: selectedCloudColorTexture,
        showAerialPerspective: false,
        showHeightFog: false,
      });
      const frontOneMeanEight = renderAerial({
        lengthTexture: cloudMeanEightFrontOneTexture,
        sampledCloudColorTexture: selectedCloudColorTexture,
        showAerialPerspective: false,
        showHeightFog: false,
      });
      const frontFarMeanFour = renderAerial({
        lengthTexture: cloudMeanFourFrontFarTexture,
        sampledCloudColorTexture: selectedCloudColorTexture,
        showAerialPerspective: false,
        showHeightFog: false,
      });
      const fogDomainZero = renderAerial({
        showClouds: false,
        backgroundScale: 0.0,
      });
      const fogDomainOne = renderAerial({
        showClouds: false,
        backgroundScale: 1.0,
      });
      const fogDomainTen = renderAerial({
        showClouds: false,
        backgroundScale: 10.0,
      });
      expect(clearZero[0]).toBeGreaterThan(0.05);
      for (let channel = 0; channel < 3; channel++) {
        expect(deltaOnlyZero[channel]).toEqualEpsilon(0.05, 0.001);
        expect(clearShadowed[channel]).toBeLessThan(clearZero[channel]);
        expect(ambientShadowed[channel]).toBe(ambientZero[channel]);
      }
      expect(clearZero[0]).toBeGreaterThan(normalizedSunZero[0]);
      expect(skyDifference.every(Number.isFinite)).toBe(true);
      expect(skyDifference[3]).toBeGreaterThan(0.0);
      expect(infiniteSkyShadowed.every(Number.isFinite)).toBe(true);
      expect(
        Math.max(
          ...infiniteSkyShadowed
            .slice(0, 3)
            .map((value) => Math.abs(value - 0.05)),
        ),
      ).toBeGreaterThan(0.0);
      expect(
        Math.max(
          ...finitePointSkyShadowed
            .slice(0, 3)
            .map((value, channel) => Math.abs(value - 0.05)),
        ),
      ).toBeLessThan(skyDifference[3]);
      const hazeDensity = 3.0e-5 * Math.exp(-1.0);
      const hazeAngle = 1.0;
      const hazeExponent = hazeAngle * 1.0e-3;
      const hazeLinearTerm = hazeDensity / 1.0e-3 / hazeAngle;
      const hazeExpTerm = 1.0 - Math.exp(-4900.0 * hazeExponent);
      const hazeShadowExpTerm = 1.0 - Math.exp(-2500.0 * hazeExponent);
      const hazeOpticalDepth = hazeExpTerm * hazeLinearTerm;
      const hazeDirectionalOpticalDepth =
        (hazeExpTerm - hazeShadowExpTerm) * hazeLinearTerm;
      const hazeOpacity = 1.0 - Math.exp(-hazeOpticalDepth);
      const hazeDirectionalOpacity =
        1.0 - Math.exp(-hazeDirectionalOpticalDepth);
      const hazeCosineTheta = 1.0;
      const henyeyGreensteinAtCosine = (anisotropy) =>
        (1.0 - anisotropy * anisotropy) /
        (4.0 * Math.PI) /
        Math.pow(
          1.0 + anisotropy * anisotropy - 2.0 * anisotropy * hazeCosineTheta,
          1.5,
        );
      const hazePhase =
        0.5 * (henyeyGreensteinAtCosine(0.7) + henyeyGreensteinAtCosine(-0.2));
      const solarIrradiance = sampledIrradiance[0];
      const skyIrradiance = sampledIrradiance[1];
      for (let channel = 0; channel < 3; channel++) {
        const expectedShadowedHaze =
          (solarIrradiance[channel] * hazePhase * hazeDirectionalOpacity +
            (skyIrradiance[channel] / (4.0 * Math.PI)) * hazeOpacity) *
          (0.9 / 1.4);
        expect(hazeShadowed[channel]).toEqualEpsilon(
          expectedShadowedHaze,
          0.004,
        );
        expect(hazeShadowed[channel]).toBeLessThan(hazeZero[channel]);
        expect(ambientHazeShadowed[channel]).toBe(ambientHazeZero[channel]);
        expect(integratedHazeZero[channel]).not.toBe(0.05);
        expect(integratedHazeShadowed[channel]).toBeLessThan(
          integratedHazeZero[channel],
        );
        expect(finiteNoCloud[channel]).toEqualEpsilon(0.05, 0.001);
        expect(frontOneMeanFour[channel]).toEqualEpsilon(
          frontOneMeanEight[channel],
          0.001,
        );
        expect(frontFarMeanFour[channel]).not.toBe(frontOneMeanFour[channel]);
        expect(fogDomainTen[channel] - fogDomainZero[channel]).toEqualEpsilon(
          10.0 * (fogDomainOne[channel] - fogDomainZero[channel]),
          0.02,
        );
      }
      expect(hazeZero.every(Number.isFinite)).toBe(true);
      expect(hazeShadowed.every(Number.isFinite)).toBe(true);
      expect(hazeZero[3]).toEqualEpsilon(hazeOpacity, 0.001);
      expect(hazeShadowed[3]).toBe(hazeZero[3]);
      expect(ambientHazeShadowed[3]).toBe(ambientHazeZero[3]);
      expect(heightFogSource).toContain("segmentStart + clampedShadowLength");
    } finally {
      transmittanceTexture.destroy();
      noSunTransmittanceTexture.destroy();
      colorTexture.destroy();
      depthTexture.destroy();
      finiteDepthTexture.destroy();
      cloudColorTexture.destroy();
      selectedCloudColorTexture.destroy();
      cloudDistanceZeroTexture.destroy();
      cloudDistanceShadowTexture.destroy();
      cloudMeanFourFrontOneTexture.destroy();
      cloudMeanEightFrontOneTexture.destroy();
      cloudMeanFourFrontFarTexture.destroy();
    }
  });

  it("decodes known Beer extinction continuously across a cascade overlap on the actual GPU", function () {
    scene = createScene();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const atlasValues = new Uint16Array(4 * 4 * 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const cascade = x < 2 ? 0 : 1;
        const values = [
          10.0 / 200000.0,
          cascade === 0 ? 0.001 : 0.002,
          10.0,
          0.0,
        ];
        const offset = (y * 4 + x) * 4;
        for (let channel = 0; channel < 4; channel++) {
          atlasValues[offset + channel] = encodeFloat16(values[channel]);
        }
      }
    }
    const atlas = new Texture({
      context: scene.context,
      width: 4,
      height: 4,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      source: {
        width: 4,
        height: 4,
        arrayBufferView: atlasValues,
      },
    });
    const matrices = [
      Matrix4.clone(Matrix4.IDENTITY),
      Matrix4.clone(Matrix4.IDENTITY),
      Matrix4.clone(Matrix4.IDENTITY),
    ];
    const intervals = [
      new Cartesian2(0.0, 100.0),
      new Cartesian2(100.0, 200.0),
      new Cartesian2(0.0, 0.0),
    ];
    try {
      const pixel = executeHalfFloatQuad(
        [
          cloudShadowSource,
          `precision highp float;
          void main() {
            vec3 position = vec3(0.0);
            float beforeOverlap = sceneGISCloudShadowOpticalDepth(
              position, 90.0);
            float overlapMiddle = sceneGISCloudShadowOpticalDepth(
              position, 97.5);
            float split = sceneGISCloudShadowOpticalDepth(position, 100.0);
            out_FragColor = vec4(
              beforeOverlap,
              overlapMiddle,
              split,
              exp(-split));
          }`,
        ],
        {
          uniformMap: {
            u_sceneGISCloudShadowAtlas: () => atlas,
            u_sceneGISCloudShadowMatrices: () => matrices,
            u_sceneGISCloudShadowIntervals: () => intervals,
            u_sceneGISCloudShadowCascadeCount: () => 2,
            u_sceneGISShadowSunDirection: () => Cartesian3.UNIT_Z,
            u_sceneGISShadowCloudTop: () => 1010.0,
          },
        },
      )[0];
      expect(pixel[0]).toEqualEpsilon(1.0, 0.002);
      expect(pixel[1]).toEqualEpsilon(
        -Math.log((Math.exp(-1.0) + Math.exp(-2.0)) * 0.5),
        0.003,
      );
      expect(pixel[2]).toEqualEpsilon(2.0, 0.004);
      expect(pixel[3]).toEqualEpsilon(Math.exp(-2.0), 0.001);
    } finally {
      atlas.destroy();
    }
  });

  it("filters Globe cloud shadows in Beer space without crossing atlas tiles on the actual GPU", function () {
    scene = createScene();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const atlasValues = new Uint16Array(8 * 8 * 4);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const inFirstTile = x < 4;
        const opticalDepth = inFirstTile ? (x < 2 ? 0.0 : 4.0) : 80.0;
        const values = [0.0, 1.0, opticalDepth, 0.0];
        const offset = (y * 8 + x) * 4;
        for (let channel = 0; channel < 4; channel++) {
          atlasValues[offset + channel] = encodeFloat16(values[channel]);
        }
      }
    }
    const atlas = new Texture({
      context: scene.context,
      width: 8,
      height: 8,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      source: {
        width: 8,
        height: 8,
        arrayBufferView: atlasValues,
      },
    });
    try {
      const pixels = executeHalfFloatQuad(
        [
          cloudShadowSource,
          `precision highp float;
          void main() {
            float x = gl_FragCoord.x < 1.5
              ? -0.25
              : (gl_FragCoord.x < 2.5 ? 0.0 :
                (gl_FragCoord.x < 3.5 ? 0.25 : 1.0));
            float opticalDepth = sceneGISCloudShadowCascadeOpticalDepth(
              vec3(x, 0.0, 0.0), 0);
            out_FragColor = vec4(
              opticalDepth,
              exp(-opticalDepth),
              0.0,
              1.0);
          }`,
        ],
        {
          width: 4,
          uniformMap: {
            u_sceneGISCloudShadowAtlas: () => atlas,
            u_sceneGISCloudShadowMatrices: () => [
              Matrix4.IDENTITY,
              Matrix4.IDENTITY,
              Matrix4.IDENTITY,
            ],
            u_sceneGISShadowSunDirection: () => Cartesian3.UNIT_Z,
            u_sceneGISShadowCloudTop: () => 100.0,
          },
        },
      );
      expect(pixels[0][1]).toBeGreaterThan(pixels[1][1]);
      expect(pixels[1][1]).toBeGreaterThan(pixels[2][1]);
      expect(pixels[3][0]).toEqualEpsilon(4.0, 0.01);
      expect(pixels[3][1]).toEqualEpsilon(Math.exp(-4.0), 0.001);
    } finally {
      atlas.destroy();
    }
  });

  it("marches controlled cloud density into the bounded Beer atlas on the actual GPU", async function () {
    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    installSolidCloudTestTextures();
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(0.0, 0.0, 10000.0),
      orientation: {
        heading: 0.0,
        pitch: CesiumMath.toRadians(-35.0),
        roll: 0.0,
      },
    });
    effects.cloudQuality = "low";
    effects.cloudPreset = "cumulus";
    effects.cloudCoverage = 1.0;
    effects.cloudDensity = 0.0001;
    effects.update(scene, scene.frameState.time);
    const shadow = effects._pipeline._globeShadowResources;
    const execute = spyOn(shadow.command, "execute").and.callThrough();
    scene.renderForSpecs();
    expect(execute).toHaveBeenCalledTimes(2);
    const texture = shadow.framebuffer.getColorTexture(0);
    const atlasPixels = readHalfTexturePixels(texture);
    let firstIndex = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const index = y * texture.width + x;
        if (atlasPixels[index][2] > atlasPixels[firstIndex][2]) {
          firstIndex = index;
        }
      }
    }
    const first = atlasPixels[firstIndex];
    expect(first.every(Number.isFinite)).toBe(true);
    expect(first[0]).toBeGreaterThanOrEqual(0.0);
    expect(first[0]).toBeLessThanOrEqual(1.0);
    expect(first[1]).toBeGreaterThan(0.0);
    expect(first[2]).toBeGreaterThan(0.0);
    expect(first[2]).toBeLessThanOrEqual(80.0);
    expect(first[3]).toBeGreaterThanOrEqual(0.0);
    expect(first[3]).toBeLessThanOrEqual(80.0);

    const atlasU = ((firstIndex % texture.width) + 0.5) / texture.width;
    const atlasV =
      (Math.floor(firstIndex / texture.width) + 0.5) / texture.height;
    const receiverMatrix = Matrix4.fromTranslation(
      new Cartesian3(4.0 * atlasU - 1.0, 4.0 * atlasV - 1.0, 0.0),
    );
    const receiverPixel = executeHalfFloatQuad(
      [
        cloudShadowSource,
        `precision highp float;
        void main() {
          float opticalDepth = sceneGISCloudShadowCascadeOpticalDepth(
            vec3(0.0), 0);
          out_FragColor = vec4(
            opticalDepth,
            exp(-opticalDepth),
            0.0,
            1.0);
        }`,
      ],
      {
        uniformMap: {
          u_sceneGISCloudShadowAtlas: () => texture,
          u_sceneGISCloudShadowMatrices: () => [
            receiverMatrix,
            Matrix4.IDENTITY,
            Matrix4.IDENTITY,
          ],
          u_sceneGISShadowSunDirection: () => Cartesian3.UNIT_Z,
          u_sceneGISShadowCloudTop: () => 200000.0,
        },
      },
    )[0];
    expect(receiverPixel[0]).toBeGreaterThan(0.0);
    expect(receiverPixel[1]).toBeLessThan(1.0);

    effects.cloudDensity = 0.0002;
    effects.update(scene, scene.frameState.time);
    execute.calls.reset();
    scene.renderForSpecs();
    expect(execute).toHaveBeenCalledTimes(2);
    const second = readHalfTexturePixel(
      texture,
      firstIndex % texture.width,
      Math.floor(firstIndex / texture.width),
    );
    expect(second.every(Number.isFinite)).toBe(true);
    expect(second[1] / first[1]).toEqualEpsilon(2.0, 0.03);
    expect(second[2] / first[2]).toEqualEpsilon(2.0, 0.03);
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

  it("rejects native Globe lighting before any A5 resource mutation", function () {
    scene = createScene();
    scene.globe = new Globe(Ellipsoid.WGS84);
    hideNativeEnvironment(scene);
    scene.globe.enableLighting = true;
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
    expect(scene.frameState._sceneGISGlobeLighting).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps Globe shadow toggles warm and releases the exact atlas lifecycle", async function () {
    const fetchArrayBuffer = Resource.fetchArrayBuffer;
    let acquiredBeforeResourceRequest = false;
    await connectControlledCloudMode("globe", function () {
      spyOn(Resource, "fetchArrayBuffer").and.callFake(function (...args) {
        acquiredBeforeResourceRequest =
          scene.globe.depthTestAgainstTerrain === true;
        return fetchArrayBuffer.apply(Resource, args);
      });
    });
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    expect(acquiredBeforeResourceRequest).toBe(true);
    expect(scene.globe.depthTestAgainstTerrain).toBe(true);
    const pipeline = effects._pipeline;
    const mediumShadow = pipeline._globeShadowResources;
    const texture = mediumShadow.framebuffer.getColorTexture(0);
    expect(texture.width).toBe(1024);
    expect(texture.height).toBe(1024);
    expect(texture.width * texture.height * 4 * 2).toBe(8388608);
    expect(pipeline._shadowCascadeCount).toBe(3);
    expect(pipeline._uniformMap.u_sceneGISShadowSteps()).toBe(50);
    effects.cloudQuality = "low";
    effects.update(scene, scene.frameState.time);
    const lowShadow = pipeline._globeShadowResources;
    const lowTexture = lowShadow.framebuffer.getColorTexture(0);
    expect(lowShadow).not.toBe(mediumShadow);
    expect(lowTexture.width).toBe(512);
    expect(lowTexture.height).toBe(512);
    expect(lowTexture.width * lowTexture.height * 4 * 2).toBe(2097152);
    expect(pipeline._shadowCascadeCount).toBe(2);
    expect(pipeline._uniformMap.u_sceneGISShadowSteps()).toBe(25);
    effects.cloudQuality = "high";
    effects.update(scene, scene.frameState.time);
    const shadow = pipeline._globeShadowResources;
    const highTexture = shadow.framebuffer.getColorTexture(0);
    expect(shadow).not.toBe(mediumShadow);
    expect(shadow).not.toBe(lowShadow);
    expect(highTexture.width).toBe(1536);
    expect(highTexture.height).toBe(1536);
    expect(highTexture.width * highTexture.height * 4 * 2).toBe(18874368);
    expect(pipeline._shadowCascadeCount).toBe(3);
    expect(pipeline._uniformMap.u_sceneGISShadowSteps()).toBe(50);
    const requestRender = spyOn(scene, "requestRender").and.callThrough();

    effects.showCloudShadows = false;
    effects.showCrepuscularRays = false;
    effects.update(scene, scene.frameState.time);
    expect(pipeline._globeShadowResources).toBe(shadow);
    expect(scene.frameState._sceneGISGlobeLighting.showCloudShadows).toBe(
      false,
    );
    expect(scene.frameState._sceneGISGlobeLighting.showCrepuscularRays).toBe(
      false,
    );
    effects.surfaceRadianceScale = 4.0;
    effects.update(scene, scene.frameState.time);
    expect(pipeline._globeShadowResources).toBe(shadow);
    expect(pipeline._uniformMap.u_surfaceRadianceScale()).toBe(4.0);
    expect(scene.frameState._sceneGISGlobeLighting.surfaceRadianceScale).toBe(
      4.0,
    );
    expect(requestRender).toHaveBeenCalledTimes(3);

    requestRender.calls.reset();
    effects.showCloudShadows = false;
    effects.showCrepuscularRays = false;
    effects.surfaceRadianceScale = 4.0;
    expect(requestRender).not.toHaveBeenCalled();

    effects.showCloudShadows = true;
    effects.showCrepuscularRays = true;
    effects.showClouds = false;
    effects.update(scene, scene.frameState.time);
    expect(scene.frameState._sceneGISGlobeLighting.showCloudShadows).toBe(
      false,
    );
    expect(scene.frameState._sceneGISGlobeLighting.showCrepuscularRays).toBe(
      false,
    );

    effects.enabled = false;
    expect(pipeline._globeShadowResources).toBeUndefined();
    expect(scene.frameState._sceneGISGlobeLighting).toBeUndefined();
    expect(scene.globe.depthTestAgainstTerrain).toBe(false);

    scene.globe.depthTestAgainstTerrain = true;
    effects.enabled = true;
    effects.update(scene, scene.frameState.time);
    expect(scene.globe.depthTestAgainstTerrain).toBe(true);
    effects.enabled = false;
    expect(scene.globe.depthTestAgainstTerrain).toBe(true);

    scene.globe.depthTestAgainstTerrain = false;
    effects.enabled = true;
    effects.update(scene, scene.frameState.time);
    expect(scene.globe.depthTestAgainstTerrain).toBe(true);
    const errors = [];
    effects.errorEvent.addEventListener(function (controller, error) {
      errors.push({ controller, error });
    });
    scene.globe.depthTestAgainstTerrain = false;
    effects.update(scene, scene.frameState.time);
    expect(errors.length).toBe(1);
    expect(errors[0].controller).toBe(effects);
    expect(errors[0].error.message).toContain("depthTestAgainstTerrain");
    expect(scene.globe.depthTestAgainstTerrain).toBe(false);

    effects.enabled = false;
    effects.enabled = true;
    effects.update(scene, scene.frameState.time);
    expect(scene.globe.depthTestAgainstTerrain).toBe(true);
    effects.disconnectedCallback(effects._element);
    expect(scene.globe.depthTestAgainstTerrain).toBe(false);
  });

  it("compiles the frame-local Globe surface variant and restores the native variant", async function () {
    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(15.0, 45.0, 12000.0),
      orientation: {
        heading: 0.0,
        pitch: CesiumMath.toRadians(-45.0),
        roll: 0.0,
      },
    });
    const shaderSet = scene.globe._surfaceShaderSet;
    const getShaderProgram = spyOn(
      shaderSet,
      "getShaderProgram",
    ).and.callThrough();
    let surfaceShaders;
    await pollToPromise(function () {
      scene.renderForSpecs();
      surfaceShaders = Object.values(shaderSet._shadersByTexturesFlags).flatMap(
        (byFlags) => Object.values(byFlags ?? {}),
      );
      return surfaceShaders.length > 0;
    });
    const sceneGISVariant = surfaceShaders.find(
      (surfaceShader) =>
        Math.floor(surfaceShader.flags / 0x400000000) % 2 === 1,
    );
    expect(sceneGISVariant)
      .withContext(
        JSON.stringify(
          surfaceShaders.map((surfaceShader) => surfaceShader.flags),
        ),
      )
      .toBeDefined();
    const defines = sceneGISVariant.shaderProgram._fragmentShaderSource.defines;
    expect(defines).toContain("SCENEGIS_GLOBE_SURFACE_LIGHTING");
    expect(defines).toContain("SCENEGIS_GLOBE");
    expect(defines).not.toContain("SCENEGIS_GLOBE_SURFACE_TERRAIN_NORMAL");

    const geodeticOptions = getShaderProgram.calls.mostRecent().args[0];
    const terrainProgram = shaderSet.getShaderProgram({
      ...geodeticOptions,
      hasVertexNormals: true,
    });
    terrainProgram._bind();
    expect(terrainProgram._fragmentShaderSource.defines).toContain(
      "SCENEGIS_GLOBE_SURFACE_TERRAIN_NORMAL",
    );
    expect(terrainProgram._vertexShaderSource.defines).toContain(
      "GENERATE_POSITION_AND_NORMAL",
    );

    effects.enabled = false;
    scene.renderForSpecs();
    const allSurfaceShaders = Object.values(
      shaderSet._shadersByTexturesFlags,
    ).flatMap((byFlags) => Object.values(byFlags ?? {}));
    expect(
      allSurfaceShaders.some(
        (surfaceShader) =>
          Math.floor(surfaceShader.flags / 0x400000000) % 2 === 0,
      ),
    ).toBe(true);
    expect(scene.frameState._sceneGISGlobeLighting).toBeUndefined();
  });

  it("scales Globe surface radiance and matches aerial extinction endpoints on the actual GPU", async function () {
    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const resources = effects._pipeline._resources;
    const surfacePosition = Cartesian3.fromDegrees(15.0, 45.0, 0.0);
    const vertical = Ellipsoid.WGS84.geodeticSurfaceNormal(
      surfacePosition,
      new Cartesian3(),
    );
    const eastNorthUp = Transforms.eastNorthUpToFixedFrame(surfacePosition);
    const east = Matrix4.getColumn(eastNorthUp, 0, new Cartesian3());
    const north = Matrix4.getColumn(eastNorthUp, 1, new Cartesian3());
    const renderSurface = function (scale) {
      effects.surfaceRadianceScale = scale;
      return executeHalfFloatQuad(
        [
          brunetonDefinitionsSource,
          brunetonCommonSource,
          brunetonRuntimeSource,
          atmosphereSource,
          cloudShadowSource,
          globeSurfaceLightingSource,
          `precision highp float;
          void main() {
            vec3 radiance = sceneGISGlobeSurfaceLighting(
              vec3(0.5),
              u_sceneGISShadowSurfacePosition,
              u_sceneGISShadowVertical);
            out_FragColor = vec4(radiance, 1.0);
          }`,
        ],
        {
          defines: [
            "SCENEGIS_GLOBE",
            "COMBINED_SCATTERING_TEXTURES",
            "TRANSMITTANCE_TEXTURE_WIDTH 256",
            "TRANSMITTANCE_TEXTURE_HEIGHT 64",
            "SCATTERING_TEXTURE_R_SIZE 32",
            "SCATTERING_TEXTURE_MU_SIZE 128",
            "SCATTERING_TEXTURE_MU_S_SIZE 32",
            "SCATTERING_TEXTURE_NU_SIZE 8",
            "IRRADIANCE_TEXTURE_WIDTH 64",
            "IRRADIANCE_TEXTURE_HEIGHT 16",
          ],
          uniformMap: {
            u_sceneGISTransmittanceTexture: () =>
              resources.transmittanceTexture,
            u_sceneGISIrradianceTexture: () => resources.irradianceTexture,
            u_surfaceRadianceScale: () => effects.surfaceRadianceScale,
            u_sceneGISShowCloudShadows: () => false,
            u_sceneGISShowCrepuscularRays: () => false,
            u_sceneGISCloudShadowAtlas: () =>
              effects._pipeline._globeShadowResources.framebuffer.getColorTexture(
                0,
              ),
            u_sceneGISCloudShadowMatrices: () =>
              effects._pipeline._shadowMatrices,
            u_sceneGISCloudShadowIntervals: () =>
              effects._pipeline._shadowIntervals,
            u_sceneGISCloudShadowCascadeCount: () =>
              effects._pipeline._shadowCascadeCount,
            u_sceneGISShadowSurfacePosition: () => surfacePosition,
            u_sceneGISShadowEast: () => east,
            u_sceneGISShadowNorth: () => north,
            u_sceneGISShadowVertical: () => vertical,
            u_sceneGISShadowSunDirection: () => Cartesian3.UNIT_Z,
            u_sceneGISShadowCameraPosition: () => surfacePosition,
            u_sceneGISShadowCloudTop: () => 6000.0,
          },
        },
      )[0];
    };
    const surfaceZero = renderSurface(0.0);
    const surfaceOne = renderSurface(1.0);
    const surfaceTen = renderSurface(10.0);
    expect(surfaceZero.slice(0, 3)).toEqual([0.0, 0.0, 0.0]);
    let positiveChannels = 0;
    for (let channel = 0; channel < 3; channel++) {
      if (surfaceOne[channel] > 0.0) {
        positiveChannels++;
        expect(surfaceTen[channel] / surfaceOne[channel]).toEqualEpsilon(
          10.0,
          0.03,
        );
      }
      expect(Number.isFinite(surfaceTen[channel])).toBe(true);
      expect(surfaceTen[channel]).toBeLessThan(65504.0);
    }
    expect(positiveChannels).toBeGreaterThan(0);

    const helperStart = aerialFragmentSource.indexOf(
      "float sceneGISGlobeAtmosphereRadianceScale",
    );
    const helperEnd = aerialFragmentSource.indexOf("void main()", helperStart);
    const aerialDomain = executeHalfFloatQuad(
      [
        `precision highp float;
        uniform float u_backgroundRadianceScale;
        uniform float u_aerialRadianceScale;
        uniform float u_surfaceRadianceScale;`,
        aerialFragmentSource.slice(helperStart, helperEnd),
        `void main() {
          vec3 transmittance = vec3(0.35);
          float sharedScale = sceneGISGlobeAtmosphereRadianceScale();
          float rejectedScale = mix(
            u_aerialRadianceScale,
            u_surfaceRadianceScale,
            1.0 - max(
              transmittance.r,
              max(transmittance.g, transmittance.b)));
          out_FragColor = vec4(
            sharedScale,
            rejectedScale,
            transmittance.r,
            1.0);
        }`,
      ],
      {
        defines: ["SCENEGIS_GLOBE"],
        uniformMap: {
          u_backgroundRadianceScale: () => 4.0,
          u_aerialRadianceScale: () => 1.5,
          u_surfaceRadianceScale: () => 10.0,
        },
      },
    )[0];
    expect(aerialDomain[0]).toEqualEpsilon(6.0, 0.004);
    expect(aerialDomain[1]).toEqualEpsilon(7.025, 0.01);
    expect(aerialDomain[2]).toEqualEpsilon(0.35, 0.001);
    expect(aerialDomain[0]).not.toEqualEpsilon(aerialDomain[1], 0.01);
    expect(aerialFragmentSource).not.toContain(
      "sceneGISGlobeEffectiveAerialScale",
    );
    expect(aerialFragmentSource).not.toContain("u_surfaceRadianceScale");
  });

  it("uses the WGS84 geodetic fallback normal at mid latitude on the actual GPU", function () {
    scene = createScene();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const helperEnd = globeSurfaceLightingSource.indexOf(
      "vec3 sceneGISGlobeSurfaceLighting",
    );
    const helperSource = globeSurfaceLightingSource.slice(0, helperEnd);
    const surfacePosition = Cartesian3.fromDegrees(15.0, 45.0, 0.0);
    const expected = Ellipsoid.WGS84.geodeticSurfaceNormal(
      surfacePosition,
      new Cartesian3(),
    );
    const pixel = executeHalfFloatQuad(
      [
        helperSource,
        `precision highp float;
        uniform vec3 u_testSurfacePosition;
        void main() {
          vec3 normal = sceneGISGlobeGeodeticSurfaceNormal(
            u_testSurfacePosition);
          out_FragColor = vec4(
            normal * 0.5 + 0.5,
            normal.z == 0.0 ? 0.0 : normal.x / normal.z);
        }`,
      ],
      {
        uniformMap: {
          u_testSurfacePosition: () => surfacePosition,
        },
      },
    )[0];
    expect(pixel[0]).toEqualEpsilon(expected.x * 0.5 + 0.5, 0.001);
    expect(pixel[1]).toEqualEpsilon(expected.y * 0.5 + 0.5, 0.001);
    expect(pixel[2]).toEqualEpsilon(expected.z * 0.5 + 0.5, 0.001);
    expect(pixel[3]).toEqualEpsilon(expected.x / expected.z, 0.001);
    expect(pixel[3]).not.toEqualEpsilon(
      surfacePosition.x / surfacePosition.z,
      0.001,
    );
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
    expect(fetch).toHaveBeenCalledTimes(8);
    const assetUrls = fetch.calls.all().map((call) => String(call.args[0]));
    for (const url of assetUrls.slice(0, 3)) {
      expect(url).toContain("Assets/SceneGIS/Environment/PlanarEarth/");
      expect(url).not.toContain("BrunetonEarth");
    }
    for (const url of assetUrls.slice(3)) {
      expect(url).toContain("Assets/SceneGIS/Environment/CloudCore/");
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
    expect(resources.cloudProgram).toBeDefined();
    expect(resources.cloudLogDepthProgram).toBeDefined();
    expect(resources.cloudLogDepthProgram).not.toBe(resources.cloudProgram);
    expect(resources.cloudResolveProgram).toBeDefined();
    expect(resources.cloudResolveLogDepthProgram).toBeDefined();
    expect(resources.cloudShapeTexture.sizeInBytes).toBe(9586980);
    expect(resources.cloudOccupancyTexture.sizeInBytes).toBe(2396745);
    expect(resources.cloudDetailTexture.sizeInBytes).toBe(1198372);
    expect(resources.cloudWeatherTexture.sizeInBytes).toBe(262144);
    expect(resources.cloudTurbulenceTexture.sizeInBytes).toBe(1198372);
    expect(resources.cloudStbnTexture.sizeInBytes).toBe(1048576);
    for (const texture of [
      resources.cloudShapeTexture,
      resources.cloudDetailTexture,
      resources.cloudTurbulenceTexture,
    ]) {
      expect(texture.sampler.wrapS).toBe(TextureWrap.REPEAT);
      expect(texture.sampler.wrapT).toBe(TextureWrap.REPEAT);
      expect(texture.sampler.wrapR).toBe(TextureWrap.REPEAT);
      expect(texture.sampler.minificationFilter).toBe(
        TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
      );
    }
    expect(resources.cloudOccupancyTexture.sampler.wrapS).toBe(
      TextureWrap.REPEAT,
    );
    expect(resources.cloudOccupancyTexture.sampler.wrapT).toBe(
      TextureWrap.REPEAT,
    );
    expect(resources.cloudOccupancyTexture.sampler.wrapR).toBe(
      TextureWrap.REPEAT,
    );
    expect(resources.cloudOccupancyTexture.sampler.minificationFilter).toBe(
      TextureMinificationFilter.NEAREST_MIPMAP_NEAREST,
    );
    expect(resources.cloudStbnTexture.sampler.wrapR).toBe(TextureWrap.REPEAT);
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
    expect(resources.cloudShapeTexture.isDestroyed()).toBe(true);
    expect(resources.cloudOccupancyTexture.isDestroyed()).toBe(true);
    expect(resources.cloudDetailTexture.isDestroyed()).toBe(true);
    expect(resources.cloudWeatherTexture.isDestroyed()).toBe(true);
    expect(resources.cloudTurbulenceTexture.isDestroyed()).toBe(true);
    expect(resources.cloudStbnTexture.isDestroyed()).toBe(true);
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

  it("reconstructs immutable linear and log depth exactly across both worlds", async function () {
    const inputPixelBits = Uint16Array.from(
      [0.25, 0.5, 0.75, 1.0],
      encodeFloat16,
    );
    for (const mode of ["planar", "globe"]) {
      await connectControlledCloudMode(mode);
      if (!SceneGISEnvironmentEffects.isSupported(scene)) {
        disconnectControlledCloudMode();
        return;
      }
      effects.showClouds = false;
      effects.showHeightFog = false;
      effects.showAerialPerspective = true;
      effects.update(scene, scene.frameState.time);
      scene.canvas.width = 4;
      scene.canvas.height = 1;
      scene.camera.switchToPerspectiveFrustum();
      scene.camera.frustum.near = 1.0;
      scene.camera.frustum.far = 1000000.0;
      if (mode === "planar") {
        scene.camera.setView({
          destination: new Cartesian3(0.0, 0.0, 1000.0),
          orientation: {
            direction: Cartesian3.UNIT_Y,
            up: Cartesian3.UNIT_Z,
          },
        });
      } else {
        const destination = Cartesian3.fromDegrees(0.0, 0.0, 1000.0);
        const frame = Transforms.eastNorthUpToFixedFrame(destination);
        scene.camera.setView({
          destination,
          orientation: {
            direction: Matrix4.multiplyByPointAsVector(
              frame,
              Cartesian3.UNIT_Y,
              new Cartesian3(),
            ),
            up: Matrix4.multiplyByPointAsVector(
              frame,
              Cartesian3.UNIT_Z,
              new Cartesian3(),
            ),
          },
        });
      }
      scene.renderForSpecs();
      scene.context.uniformState.updateCamera(scene.camera);
      scene.context.uniformState.updateFrustum(scene.camera.frustum);

      const inputValues = new Uint16Array(4 * 4);
      for (let pixel = 0; pixel < 4; pixel++) {
        inputValues.set(inputPixelBits, pixel * 4);
      }
      const inputTexture = new Texture({
        context: scene.context,
        width: 4,
        height: 1,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        source: { arrayBufferView: inputValues },
      });
      const depthTexture = new Texture({
        context: scene.context,
        width: 4,
        height: 1,
        pixelFormat: PixelFormat.DEPTH_COMPONENT,
        pixelDatatype: PixelDatatype.UNSIGNED_INT,
      });
      const depthColor = new Texture({
        context: scene.context,
        width: 4,
        height: 1,
      });
      const depthFramebuffer = new Framebuffer({
        context: scene.context,
        colorTextures: [depthColor],
        depthTexture,
        destroyAttachments: false,
      });
      const depthPassState = new PassState(scene.context);
      depthPassState.framebuffer = depthFramebuffer;
      try {
        for (const [column, depth] of [0.0, 0.25, 0.75, 1.0].entries()) {
          depthPassState.scissorTest = {
            enabled: true,
            rectangle: new BoundingRectangle(column, 0, 1, 1),
          };
          new ClearCommand({
            depth,
            framebuffer: depthFramebuffer,
          }).execute(scene.context, depthPassState);
        }
        const results = { linear: [], log: [] };
        for (const useLogDepth of [false, true, false, true]) {
          scene.frameState.useLogDepth = useLogDepth;
          const evidence = readDirectDepthEvidence(depthTexture, useLogDepth);
          const output = effects._pipeline.executeHdr(
            scene.context,
            inputTexture,
            depthTexture,
            scene.context.defaultTexture,
          );
          const outputBits = readHalfTextureRawBits(output);
          const resources = effects._pipeline._resources;
          const selectedProgram = resources.aerialCommand.shaderProgram;
          const expectedProgram = useLogDepth
            ? resources.aerialLogDepthProgram
            : resources.aerialProgram;
          expect(selectedProgram).withContext(mode).toBe(expectedProgram);
          const shaderText = selectedProgram._fragmentShaderText;
          if (useLogDepth) {
            expect(shaderText).toContain("#define LOG_DEPTH");
            expect(shaderText).toContain("#define LOG_DEPTH_READ_ONLY");
          } else {
            expect(shaderText).not.toContain("#define LOG_DEPTH");
            expect(shaderText).not.toContain("#define LOG_DEPTH_READ_ONLY");
          }
          expect(evidence[0][3]).withContext(`${mode} clear zero`).toBe(0.0);
          expect(evidence[3][3]).withContext(`${mode} clear one`).toBe(0.0);
          expect(Array.from(outputBits.slice(0, 4)))
            .withContext(`${mode} clear zero identity`)
            .toEqual(Array.from(inputPixelBits));
          expect(Array.from(outputBits.slice(12, 16)))
            .withContext(`${mode} clear one identity`)
            .toEqual(Array.from(inputPixelBits));
          for (const index of [1, 2]) {
            expect(evidence[index][3])
              .withContext(`${mode} finite ${index}`)
              .toBe(1.0);
            expect(Number.isFinite(evidence[index][2])).toBe(true);
            expect(evidence[index][2]).toBeGreaterThan(0.0);
          }
          expect(evidence[2][2])
            .withContext(`${mode} ordered logarithmicDepth=${useLogDepth}`)
            .toBeGreaterThan(evidence[1][2]);
          if (useLogDepth) {
            expect(evidence[1][1]).not.toBe(evidence[1][0]);
            expect(evidence[2][1]).not.toBe(evidence[2][0]);
          } else {
            expect(evidence[1][1]).toBe(evidence[1][0]);
            expect(evidence[2][1]).toBe(evidence[2][0]);
          }
          results[useLogDepth ? "log" : "linear"].push(outputBits);
        }
        expect(results.linear[1])
          .withContext(`${mode} linear order independence`)
          .toEqual(results.linear[0]);
        expect(results.log[1])
          .withContext(`${mode} log order independence`)
          .toEqual(results.log[0]);
      } finally {
        depthFramebuffer.destroy();
        depthColor.destroy();
        depthTexture.destroy();
        inputTexture.destroy();
        disconnectControlledCloudMode();
      }
    }
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

  it("updates all cloud controls warmly without resource regeneration", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    const resources = effects._pipeline._resources;
    const requestRender = spyOn(scene, "requestRender").and.callThrough();
    const fetch = spyOn(Resource, "fetchArrayBuffer");
    const compile = spyOn(ShaderProgram, "fromCache");
    const updates = [
      ["cloudCoverage", 0.7],
      ["cloudDensity", 0.002],
      ["cloudBaseHeight", 2500.0],
      ["cloudThickness", 6000.0],
      ["cloudWindDirection", -0.25],
      ["cloudWindSpeed", 35.0],
      ["cloudTime", -100.0],
      ["cloudRadianceScale", 2.0],
    ];

    requestRender.calls.reset();
    effects.showClouds = true;
    effects.cloudQuality = "high";
    effects.cloudPreset = "mixed";
    for (const [property, value] of updates) {
      effects[property] = value;
      expect(effects[property]).toBe(value);
    }
    expect(effects._pipeline._uniformMap.u_cloudPreset()).toBe(3);
    expect(requestRender).toHaveBeenCalledTimes(11);
    expect(fetch).not.toHaveBeenCalled();
    expect(compile).not.toHaveBeenCalled();
    expect(effects._pipeline._resources).toBe(resources);

    requestRender.calls.reset();
    effects.showClouds = true;
    effects.cloudQuality = "high";
    effects.cloudPreset = "mixed";
    for (const [property, value] of updates) {
      effects[property] = value;
    }
    expect(requestRender).not.toHaveBeenCalled();
  });

  it("executes one lazy cloud MRT and resizes only for quality", async function () {
    const world = connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    effects.showAtmosphere = false;
    effects.showAerialPerspective = false;
    effects.showHeightFog = false;
    effects.showClouds = true;
    effects.cloudCoverage = 1.0;
    scene.camera.setView({
      destination: new Cartesian3(0.0, -10000.0, 1000.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.95, 0.3122499),
        up: new Cartesian3(0.0, -0.3122499, 0.95),
      },
    });
    environment.sunDirection = Cartesian3.normalize(
      new Cartesian3(0.4, 0.2, 0.9),
      new Cartesian3(),
    );
    environment.update(scene, scene.frameState.time);
    await publishPlanarResources();
    const resources = effects._pipeline._resources;
    installSolidCloudTestTextures();
    expect(resources.cloudFramebuffer).toBeUndefined();
    const cloudExecute = spyOn(
      resources.cloudCommand,
      "execute",
    ).and.callThrough();
    const aerialExecute = spyOn(
      resources.aerialCommand,
      "execute",
    ).and.callThrough();
    const resolveHistoryValidity = [];
    const originalResolveExecute = resources.cloudResolveCommand.execute;
    const resolveExecute = spyOn(
      resources.cloudResolveCommand,
      "execute",
    ).and.callFake(function () {
      resolveHistoryValidity.push(effects._pipeline._cloudHistoryValid);
      return originalResolveExecute.apply(this, arguments);
    });

    scene.renderForSpecs();
    const mediumFramebuffer = resources.cloudFramebuffer;
    expect(mediumFramebuffer).toBeDefined();
    expect(mediumFramebuffer.getColorTexture(0).width).toBe(
      Math.ceil(scene.context.drawingBufferWidth * 0.5),
    );
    expect(mediumFramebuffer.getColorTexture(0).pixelDatatype).toBe(
      PixelDatatype.HALF_FLOAT,
    );
    expect(mediumFramebuffer.getColorTexture(1)).toBeDefined();
    expect(cloudExecute).toHaveBeenCalledTimes(1);
    expect(resolveExecute).toHaveBeenCalledTimes(1);
    expect(resolveHistoryValidity).toEqual([false]);
    expect(aerialExecute).toHaveBeenCalledTimes(1);
    expect(resources.cloudHistoryFramebuffer0).toBeDefined();
    expect(resources.cloudHistoryFramebuffer1).toBeDefined();
    expect(effects._pipeline._cloudHistoryValid).toBe(true);
    expect(resources.cloudCommand.shaderProgram).toBe(
      scene.frameState.useLogDepth
        ? resources.cloudLogDepthProgram
        : resources.cloudProgram,
    );
    function readCloudAttachment(texture) {
      const framebuffer = new Framebuffer({
        context: scene.context,
        colorTextures: [texture],
        destroyAttachments: false,
      });
      try {
        return Array.from(
          scene.context.readPixels({
            framebuffer,
            x: Math.floor(texture.width * 0.5),
            y: Math.floor(texture.height * 0.5),
            width: 1,
            height: 1,
          }),
          decodeFloat16,
        );
      } finally {
        framebuffer.destroy();
      }
    }
    const cloudColor = readCloudAttachment(
      mediumFramebuffer.getColorTexture(0),
    );
    const cloudDistances = readCloudAttachment(
      mediumFramebuffer.getColorTexture(1),
    );
    expectFiniteHdrStorage(cloudColor);
    expect(cloudColor[3]).toBeGreaterThanOrEqual(0.0);
    expect(cloudColor[3]).toBeLessThan(1.0);
    expect(cloudDistances[3]).toBe(1.0);
    expect(cloudDistances[3]).toBeGreaterThanOrEqual(0.0);
    expect(cloudDistances[3]).toBeLessThanOrEqual(1.0);

    scene.renderForSpecs();
    expect(resolveHistoryValidity.at(-1)).toBe(true);

    environment.sunDirection = Cartesian3.normalize(
      new Cartesian3(-0.4, -0.2, -0.9),
      new Cartesian3(),
    );
    environment.update(scene, scene.frameState.time);
    scene.renderForSpecs();
    expect(resolveHistoryValidity.at(-1)).toBe(false);
    const nightCloudColor = readCloudAttachment(
      mediumFramebuffer.getColorTexture(0),
    );
    expectFiniteHdrStorage(nightCloudColor);
    expect(nightCloudColor[3]).toBeLessThan(1.0);
    expect(rgbEnergy(nightCloudColor)).toBeLessThan(rgbEnergy(cloudColor));
    environment.sunDirection = Cartesian3.normalize(
      new Cartesian3(0.4, 0.2, 0.9),
      new Cartesian3(),
    );
    environment.update(scene, scene.frameState.time);

    const initialUseLogDepth = scene.logarithmicDepthBuffer;
    scene.logarithmicDepthBuffer = !initialUseLogDepth;
    scene.renderForSpecs();
    expect(resolveHistoryValidity.at(-1)).toBe(false);
    expect(resources.cloudCommand.shaderProgram).toBe(
      scene.frameState.useLogDepth
        ? resources.cloudLogDepthProgram
        : resources.cloudProgram,
    );
    expect(resources.cloudFramebuffer).toBe(mediumFramebuffer);
    expect(resources.cloudResolveCommand.shaderProgram).toBe(
      scene.frameState.useLogDepth
        ? resources.cloudResolveLogDepthProgram
        : resources.cloudResolveProgram,
    );
    scene.logarithmicDepthBuffer = initialUseLogDepth;

    const destroyMedium = spyOn(mediumFramebuffer, "destroy").and.callThrough();
    effects.cloudQuality = "low";
    scene.canvas.width = 4;
    scene.canvas.height = 4;
    scene.renderForSpecs();
    expect(resolveHistoryValidity.at(-1)).toBe(false);
    expect(effects._pipeline._cloudHistoryValid).toBe(true);
    const lowFramebuffer = resources.cloudFramebuffer;
    expect(lowFramebuffer).not.toBe(mediumFramebuffer);
    expect(lowFramebuffer.getColorTexture(0).width).toBe(
      Math.ceil(scene.context.drawingBufferWidth * 0.375),
    );
    expect(effects._pipeline._uniformMap.u_cloudPrimarySteps()).toBe(32);
    expect(effects._pipeline._uniformMap.u_cloudSunSteps()).toBe(2);
    expect(effects._pipeline._uniformMap.u_cloudUseDetail()).toBe(false);
    expect(destroyMedium).toHaveBeenCalledTimes(1);
    const destroyLow = spyOn(lowFramebuffer, "destroy").and.callThrough();
    effects.cloudQuality = "high";
    scene.renderForSpecs();
    expect(resources.cloudFramebuffer).not.toBe(lowFramebuffer);
    expect(resources.cloudFramebuffer.getColorTexture(0).width).toBe(
      Math.ceil(scene.context.drawingBufferWidth * 0.75),
    );
    expect(effects._pipeline._uniformMap.u_cloudPrimarySteps()).toBe(64);
    expect(effects._pipeline._uniformMap.u_cloudSunSteps()).toBe(4);
    expect(effects._pipeline._uniformMap.u_cloudUseDetail()).toBe(true);
    expect(destroyLow).toHaveBeenCalledTimes(1);
    expect(cloudExecute).toHaveBeenCalledTimes(6);
    expect(resolveExecute).toHaveBeenCalledTimes(6);
    expect(aerialExecute).toHaveBeenCalledTimes(6);
    expect(world.isDestroyed()).toBe(false);
  });

  it("invalidates cloud history for every warm discontinuity", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    effects.showAtmosphere = false;
    effects.showAerialPerspective = false;
    effects.showHeightFog = false;
    effects.showClouds = true;
    effects.cloudCoverage = 1.0;
    scene.camera.setView({
      destination: new Cartesian3(0.0, -10000.0, 1000.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.95, 0.3122499),
        up: new Cartesian3(0.0, -0.3122499, 0.95),
      },
    });
    await publishPlanarResources();
    const observed = [];
    const weights = [];
    const command = effects._pipeline._resources.cloudResolveCommand;
    const execute = command.execute;
    spyOn(command, "execute").and.callFake(function () {
      observed.push(effects._pipeline._cloudHistoryValid);
      weights.push(effects._pipeline._cloudHistoryWeight);
      return execute.apply(this, arguments);
    });

    scene.renderForSpecs();
    scene.renderForSpecs();
    effects.cloudTime = 0.5;
    scene.renderForSpecs();
    effects.cloudTime = 2.0;
    scene.renderForSpecs();
    effects.cloudPreset = "stratus";
    scene.renderForSpecs();
    scene.logarithmicDepthBuffer = !scene.logarithmicDepthBuffer;
    scene.renderForSpecs();
    scene.camera.moveRight(1.0);
    scene.renderForSpecs();
    effects.cloudRadianceScale = 2.0;
    scene.renderForSpecs();
    scene.camera.frustum.fov *= 0.95;
    scene.renderForSpecs();
    effects.showClouds = false;
    expect(effects._pipeline._cloudHistoryValid).toBe(false);
    expect(effects._pipeline._cloudHistoryDiagnostics.resetReason).toBe(
      "show-clouds",
    );
    effects.showClouds = true;
    scene.renderForSpecs();
    effects.enabled = false;
    expect(effects._pipeline._cloudHistoryValid).toBe(false);
    expect(effects._pipeline._cloudHistoryDiagnostics.resetReason).toBe(
      "disable",
    );

    expect(observed).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    expect(weights).toEqual([
      0.0, 0.82, 0.82, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
    ]);
  });

  it("isolates cloud radiance scale transitions from temporal history", async function () {
    expect(cloudResolveFragmentSource).toContain(
      "if (!u_cloudHistoryValid || u_cloudHistoryWeight <= 0.0)",
    );
    expect(cloudResolveFragmentSource).not.toContain(
      "u_cloudHistoryStationary",
    );
    expect(cloudResolveFragmentSource).toContain(
      "sceneGISCloudDeterministicExp2Negative",
    );
    expect(cloudResolveFragmentSource).not.toContain("exp2(");
    expect(cloudResolveFragmentSource).toContain(
      "out_FragData_0 = spatialColor",
    );
    expect(cloudResolveFragmentSource).toContain(
      "abs(historyDistance.x - spatialDistance.x)",
    );
    expect(cloudResolveFragmentSource).toContain(
      "abs(historyDistance.y - spatialDistance.y)",
    );
    expect(cloudResolveFragmentSource).toContain("spatialDistance.a > 0.5");
    expect(cloudResolveFragmentSource).toContain(
      "abs(historyColor.a - spatialColor.a)",
    );
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    effects.showAtmosphere = false;
    effects.showAerialPerspective = false;
    effects.showHeightFog = false;
    effects.showClouds = true;
    effects.cloudCoverage = 1.0;
    scene.camera.setView({
      destination: new Cartesian3(0.0, -10000.0, 1000.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.95, 0.3122499),
        up: new Cartesian3(0.0, -0.3122499, 0.95),
      },
    });
    await publishPlanarResources();
    const validity = [];
    const resolveCommand = effects._pipeline._resources.cloudResolveCommand;
    const execute = resolveCommand.execute;
    spyOn(resolveCommand, "execute").and.callFake(function () {
      validity.push(effects._pipeline._cloudHistoryValid);
      return execute.apply(this, arguments);
    });

    function readResolvedColor() {
      const pipeline = effects._pipeline;
      const framebufferManager =
        pipeline._cloudHistoryReadIndex === 0
          ? pipeline._resources.cloudHistoryFramebuffer0
          : pipeline._resources.cloudHistoryFramebuffer1;
      const texture = framebufferManager.getColorTexture(0);
      const framebuffer = new Framebuffer({
        context: scene.context,
        colorTextures: [texture],
        destroyAttachments: false,
      });
      try {
        return Array.from(
          scene.context.readPixels({
            framebuffer,
            width: texture.width,
            height: texture.height,
          }),
        );
      } finally {
        framebuffer.destroy();
      }
    }

    scene.renderForSpecs();
    scene.renderForSpecs();
    expect(validity).toEqual([false, true]);

    for (const scale of [0.0, 1.0, 64.0]) {
      effects.cloudRadianceScale = scale;
      scene.renderForSpecs();
      const transition = readResolvedColor();
      expect(validity.at(-1)).toBe(false);
      expect(effects._pipeline._cloudHistoryDiagnostics.resetReason).toBe(
        "history-key",
      );
      effects._pipeline.invalidateCloudHistory();
      scene.renderForSpecs();
      const spatialOnly = readResolvedColor();
      expect(validity.at(-1)).toBe(false);
      expect(transition).toEqual(spatialOnly);
      scene.renderForSpecs();
      expect(validity.at(-1)).toBe(true);
      expect(readResolvedColor()).toEqual(spatialOnly);
      expect(effects._pipeline._cloudHistoryDiagnostics.stationary).toBe(true);
      expect(effects._pipeline._cloudHistoryDiagnostics.key).toBe(
        effects._pipeline._cloudHistoryKey,
      );
      expect(effects._pipeline._cloudHistoryDiagnostics.compatibility).toBe(
        "full-attachments",
      );
      if (scale === 0.0) {
        for (let offset = 0; offset < transition.length; offset += 4) {
          expect(decodeFloat16(transition[offset])).toBe(0.0);
          expect(decodeFloat16(transition[offset + 1])).toBe(0.0);
          expect(decodeFloat16(transition[offset + 2])).toBe(0.0);
        }
      }
    }
  });

  it("calibrates only intrinsic raw cloud MRT radiance across both worlds", async function () {
    function alphaBits(color) {
      const result = [];
      for (let offset = 3; offset < color.length; offset += 4) {
        result.push(color[offset]);
      }
      return result;
    }

    function expectFiniteEncodedAttachments(capture, context) {
      for (let offset = 0; offset < capture.color.length; offset += 4) {
        const pixel = offset / 4;
        for (let channel = 0; channel < 4; channel++) {
          const value = decodeFloat16(capture.color[offset + channel]);
          expect(Number.isFinite(value))
            .withContext(`${context}/color pixel=${pixel} channel=${channel}`)
            .toBe(true);
          if (channel < 3) {
            expect(Math.abs(value))
              .withContext(
                `${context}/RGB guard pixel=${pixel} channel=${channel}`,
              )
              .toBeLessThan(65504.0);
          } else {
            expect(value)
              .withContext(`${context}/alpha lower pixel=${pixel}`)
              .toBeGreaterThanOrEqual(0.0);
            expect(value)
              .withContext(`${context}/alpha upper pixel=${pixel}`)
              .toBeLessThanOrEqual(1.0);
          }
        }
        for (let channel = 0; channel < 4; channel++) {
          const value = decodeFloat16(capture.distance[offset + channel]);
          expect(Number.isFinite(value))
            .withContext(
              `${context}/distance pixel=${pixel} channel=${channel}`,
            )
            .toBe(true);
          expect(value)
            .withContext(
              `${context}/distance lower pixel=${pixel} channel=${channel}`,
            )
            .toBeGreaterThanOrEqual(0.0);
          expect(value)
            .withContext(
              `${context}/distance upper pixel=${pixel} channel=${channel}`,
            )
            .toBeLessThanOrEqual(1.0);
          if (channel === 3) {
            expect(value === 0.0 || value === 1.0)
              .withContext(`${context}/validity pixel=${pixel}`)
              .toBe(true);
          }
        }
      }
    }

    function captureIncidentInputs() {
      const uniformMap = effects._pipeline._uniformMap;
      const sunDirection = uniformMap.u_sunDirection();
      return {
        transmittance: uniformMap.u_transmittanceTexture(),
        scattering: uniformMap.u_scatteringTexture(),
        irradiance: uniformMap.u_irradianceTexture(),
        sunDirection: [sunDirection.x, sunDirection.y, sunDirection.z],
      };
    }

    function expectIncidentInputsUnchanged(before, context) {
      const after = captureIncidentInputs();
      expect(after.transmittance)
        .withContext(`${context}/transmittance`)
        .toBe(before.transmittance);
      expect(after.scattering)
        .withContext(`${context}/scattering`)
        .toBe(before.scattering);
      expect(after.irradiance)
        .withContext(`${context}/irradiance`)
        .toBe(before.irradiance);
      expect(after.sunDirection)
        .withContext(`${context}/sun direction`)
        .toEqual(before.sunDirection);
    }

    for (const mode of ["planar", "globe"]) {
      await connectControlledCloudMode(mode);
      if (!SceneGISEnvironmentEffects.isSupported(scene)) {
        disconnectControlledCloudMode();
        return;
      }
      installControlledCloudTestTextures(mode, false);
      scene.canvas.width = 8;
      scene.canvas.height = 4;
      try {
        for (const logarithmicDepth of [false, true]) {
          const captures = {};
          renderControlledCloudSample(mode, 0.0, false, logarithmicDepth);
          const incidentInputs = captureIncidentInputs();
          const backgroundScale = effects.backgroundRadianceScale;
          const aerialScale = effects.aerialRadianceScale;
          for (const scale of [0.0, 1.0, 48.0]) {
            effects.cloudRadianceScale = scale;
            const sample = renderControlledCloudSample(
              mode,
              0.0,
              false,
              logarithmicDepth,
            );
            const resources = effects._pipeline._resources;
            expect(resources.cloudCommand.shaderProgram)
              .withContext(`${mode}/${logarithmicDepth}/program`)
              .toBe(
                scene.frameState.useLogDepth
                  ? resources.cloudLogDepthProgram
                  : resources.cloudProgram,
              );
            captures[scale] = sample.liveRaw;
            expectIncidentInputsUnchanged(
              incidentInputs,
              `${mode}/${logarithmicDepth}/scale=${scale}`,
            );
            expect(effects.backgroundRadianceScale).toBe(backgroundScale);
            expect(effects.aerialRadianceScale).toBe(aerialScale);
          }

          const zero = captures[0.0];
          const reference = captures[1.0];
          const calibrated = captures[48.0];
          for (const scale of [0.0, 1.0, 48.0]) {
            expectFiniteEncodedAttachments(
              captures[scale],
              `${mode}/${logarithmicDepth}/scale=${scale}`,
            );
          }
          expect(alphaBits(zero.color))
            .withContext(`${mode}/${logarithmicDepth}/zero alpha`)
            .toEqual(alphaBits(reference.color));
          expect(alphaBits(calibrated.color))
            .withContext(`${mode}/${logarithmicDepth}/calibrated alpha`)
            .toEqual(alphaBits(reference.color));
          expect(zero.distance)
            .withContext(`${mode}/${logarithmicDepth}/zero distances`)
            .toEqual(reference.distance);
          expect(calibrated.distance)
            .withContext(`${mode}/${logarithmicDepth}/calibrated distances`)
            .toEqual(reference.distance);

          let activeChannels = 0;
          for (let offset = 0; offset < reference.color.length; offset += 4) {
            for (let channel = 0; channel < 3; channel++) {
              const zeroValue = decodeFloat16(zero.color[offset + channel]);
              const referenceValue = decodeFloat16(
                reference.color[offset + channel],
              );
              const calibratedValue = decodeFloat16(
                calibrated.color[offset + channel],
              );
              const context = `${mode}/${logarithmicDepth}/pixel=${
                offset / 4
              }/channel=${channel}`;
              expect(zeroValue).withContext(`${context}/zero`).toBe(0.0);
              expect(Number.isFinite(referenceValue))
                .withContext(`${context}/reference finite`)
                .toBe(true);
              expect(Number.isFinite(calibratedValue))
                .withContext(`${context}/calibrated finite`)
                .toBe(true);
              expect(Math.abs(calibratedValue))
                .withContext(`${context}/RGBA16F guard`)
                .toBeLessThan(65504.0);
              if (referenceValue !== 0.0) {
                activeChannels++;
                const expected = referenceValue * 48.0;
                const tolerance = Math.max(0.00025, Math.abs(expected) * 0.005);
                expect(Math.abs(calibratedValue - expected))
                  .withContext(`${context}/48x`)
                  .toBeLessThanOrEqual(tolerance);
              } else {
                expect(calibratedValue)
                  .withContext(`${context}/inactive`)
                  .toBe(0.0);
              }
            }
          }
          expect(activeChannels)
            .withContext(`${mode}/${logarithmicDepth}/active channels`)
            .toBeGreaterThan(0);

          effects.cloudRadianceScale = 48.0;
          const isolatedBaseline = renderControlledCloudSample(
            mode,
            0.0,
            false,
            logarithmicDepth,
          ).liveRaw;
          const isolatedInputs = captureIncidentInputs();
          effects.backgroundRadianceScale = 3.0;
          effects.aerialRadianceScale = 0.5;
          const isolatedCalibration = renderControlledCloudSample(
            mode,
            0.0,
            false,
            logarithmicDepth,
          ).liveRaw;
          expect(isolatedCalibration.color)
            .withContext(`${mode}/${logarithmicDepth}/calibration isolation`)
            .toEqual(isolatedBaseline.color);
          expect(isolatedCalibration.distance)
            .withContext(`${mode}/${logarithmicDepth}/distance isolation`)
            .toEqual(isolatedBaseline.distance);
          expectIncidentInputsUnchanged(
            isolatedInputs,
            `${mode}/${logarithmicDepth}/public calibration isolation`,
          );
          expect(effects.cloudRadianceScale).toBe(48.0);
          expect(effects.backgroundRadianceScale).toBe(3.0);
          expect(effects.aerialRadianceScale).toBe(0.5);
          effects.backgroundRadianceScale = backgroundScale;
          effects.aerialRadianceScale = aerialScale;
        }
      } finally {
        disconnectControlledCloudMode();
      }
    }
  });

  it("matches reference-audited cloud lighting on the actual GPU", async function () {
    function henyeyGreenstein(anisotropy, cosineTheta) {
      const anisotropySquared = anisotropy * anisotropy;
      return (
        (1.0 - anisotropySquared) /
        (4.0 * Math.PI) /
        Math.pow(
          Math.max(
            1.0 +
              anisotropySquared -
              2.0 * anisotropy * Math.min(Math.max(cosineTheta, -1.0), 1.0),
            1.0e-4,
          ),
          1.5,
        )
      );
    }

    function dualPhase(cosineTheta, phaseAttenuation) {
      return (
        0.5 *
        (henyeyGreenstein(0.7 * phaseAttenuation, cosineTheta) +
          henyeyGreenstein(-0.2 * phaseAttenuation, cosineTheta))
      );
    }

    function solarScattering(sun, opticalDepth, cosineTheta) {
      const result = [0.0, 0.0, 0.0];
      let contribution = 1.0;
      let extinctionAttenuation = 1.0;
      let phaseAttenuation = 1.0;
      for (let octave = 0; octave < 8; octave++) {
        const weight =
          contribution *
          Math.exp(-opticalDepth * extinctionAttenuation) *
          dualPhase(cosineTheta, phaseAttenuation);
        for (let channel = 0; channel < 3; channel++) {
          result[channel] += sun[channel] * weight;
        }
        contribution *= 0.5;
        extinctionAttenuation *= 0.5;
        phaseAttenuation *= 0.5;
      }
      return result;
    }

    function lightingReference(incident, sample) {
      const solar = solarScattering(
        incident.sun,
        sample.opticalDepth,
        sample.viewCosine,
      );
      const sky = incident.sky.map(
        (value) => value * sample.heightGradient * (1.0 / (4.0 * Math.PI)),
      );
      const powder = 1.0 - 0.8 * Math.exp(-sample.localExtinction * 150.0);
      const total = solar.map(
        (value, channel) => (value + sky[channel]) * powder,
      );
      return { solar, sky, powder, total };
    }

    function expectVectorNear(actual, expected, context) {
      for (let channel = 0; channel < 3; channel++) {
        expect(Math.abs(actual[channel] - expected[channel]))
          .withContext(`${context}/${channel}`)
          .toBeLessThanOrEqual(
            Math.max(0.002, Math.abs(expected[channel]) * 0.003),
          );
      }
    }

    const reports = {};
    const combinedIncident = {
      sun: [0.8, 0.7, 0.6],
      sky: [0.1, 0.12, 0.16],
    };
    const samples = [
      {
        name: "backwardTop",
        heightFraction: "1.0",
        heightGradient: "1.0",
        opticalDepth: "0.15",
        viewCosine: "-1.0",
        localExtinction: "0.00001",
      },
      {
        name: "sideTop",
        heightFraction: "1.0",
        heightGradient: "1.0",
        opticalDepth: "0.15",
        viewCosine: "0.0",
        localExtinction: "0.0001",
      },
      {
        name: "forwardTop",
        heightFraction: "1.0",
        heightGradient: "1.0",
        opticalDepth: "0.15",
        viewCosine: "1.0",
        localExtinction: "0.001",
      },
      {
        name: "sideMiddle",
        heightFraction: "0.5",
        heightGradient: "0.75",
        opticalDepth: "1.2",
        viewCosine: "0.0",
        localExtinction: "0.001",
      },
      {
        name: "sideUnderside",
        heightFraction: "0.0",
        heightGradient: "0.5",
        opticalDepth: "4.0",
        viewCosine: "0.0",
        localExtinction: "0.01",
      },
      {
        name: "powderLow",
        heightFraction: "0.5",
        heightGradient: "0.75",
        opticalDepth: "1.2",
        viewCosine: "0.0",
        localExtinction: "0.00001",
      },
      {
        name: "powderMiddleLow",
        heightFraction: "0.5",
        heightGradient: "0.75",
        opticalDepth: "1.2",
        viewCosine: "0.0",
        localExtinction: "0.0001",
      },
      {
        name: "powderHigh",
        heightFraction: "0.5",
        heightGradient: "0.75",
        opticalDepth: "1.2",
        viewCosine: "0.0",
        localExtinction: "0.01",
      },
    ];

    for (const mode of ["planar", "globe"]) {
      await connectControlledCloudMode(mode);
      if (!SceneGISEnvironmentEffects.isSupported(scene)) {
        disconnectControlledCloudMode();
        return;
      }
      scene.canvas.width = 512;
      scene.canvas.height = 4;
      effects.cloudPreset = "cumulus";
      installControlledCloudTestTextures(mode, false);

      const angular = {};
      for (const phaseAttenuation of ["1.0", "0.5", "0.25", "0.125"]) {
        const result = renderCloudAngularPhaseProbe(mode, phaseAttenuation);
        angular[phaseAttenuation] = result;
        expect(Number.isFinite(result.integral))
          .withContext(`${mode}/phase/${phaseAttenuation}`)
          .toBe(true);
        expect(Math.abs(result.integral - 1.0))
          .withContext(`${mode}/phase integral/${phaseAttenuation}`)
          .toBeLessThanOrEqual(0.01);
        expect(result.minimum)
          .withContext(`${mode}/phase nonnegative/${phaseAttenuation}`)
          .toBeGreaterThanOrEqual(0.0);
      }
      expect(angular["1.0"].forward)
        .withContext(`${mode}/dual-HG forward peak`)
        .toBeGreaterThan(angular["1.0"].side);
      expect(angular["1.0"].backward)
        .withContext(`${mode}/dual-HG backward lobe`)
        .toBeGreaterThan(angular["1.0"].side);

      installControlledAtmosphereTextures(mode, combinedIncident);
      const componentMatrix = {};
      for (const sample of samples) {
        const gpu = renderCloudLightingComponentProbe(mode, sample);
        const cpu = lightingReference(
          combinedIncident,
          Object.fromEntries(
            Object.entries(sample).map(([key, value]) => [
              key,
              key === "name" ? value : Number(value),
            ]),
          ),
        );
        componentMatrix[sample.name] = gpu;
        expectVectorNear(gpu.solar, cpu.solar, `${mode}/${sample.name}/solar`);
        expectVectorNear(gpu.sky, cpu.sky, `${mode}/${sample.name}/sky`);
        expect(Math.abs(gpu.powder - cpu.powder))
          .withContext(`${mode}/${sample.name}/powder`)
          .toBeLessThanOrEqual(0.002);
        expectVectorNear(gpu.total, cpu.total, `${mode}/${sample.name}/total`);
        expectVectorNear(
          gpu.unpowdered,
          gpu.solar.map((value, channel) => value + gpu.sky[channel]),
          `${mode}/${sample.name}/component sum`,
        );
      }

      const powderValues = [
        componentMatrix.powderLow.powder,
        componentMatrix.powderMiddleLow.powder,
        componentMatrix.forwardTop.powder,
        componentMatrix.powderHigh.powder,
      ];
      expect(powderValues[0])
        .withContext(`${mode}/powder baseline`)
        .toBeGreaterThanOrEqual(0.2);
      expect(powderValues.at(-1))
        .withContext(`${mode}/powder dense limit`)
        .toBeGreaterThan(0.8);
      for (let index = 1; index < powderValues.length; index++) {
        expect(powderValues[index])
          .withContext(`${mode}/powder monotone/${index}`)
          .toBeGreaterThan(powderValues[index - 1]);
      }

      const separationSample = samples.find(
        (sample) => sample.name === "sideMiddle",
      );
      const incidents = {
        sunOnly: { sun: combinedIncident.sun, sky: [0.0, 0.0, 0.0] },
        skyOnly: { sun: [0.0, 0.0, 0.0], sky: combinedIncident.sky },
        combined: combinedIncident,
      };
      const separated = {};
      for (const [name, incident] of Object.entries(incidents)) {
        installControlledAtmosphereTextures(mode, incident);
        separated[name] = renderCloudLightingComponentProbe(
          mode,
          separationSample,
        );
      }
      expectVectorNear(
        separated.combined.solar,
        separated.sunOnly.solar,
        `${mode}/incident solar separation`,
      );
      expectVectorNear(
        separated.combined.sky,
        separated.skyOnly.sky,
        `${mode}/incident sky separation`,
      );
      expect(separated.sunOnly.sky.every((value) => value <= 0.001))
        .withContext(`${mode}/sun-only sky zero`)
        .toBe(true);
      expect(separated.skyOnly.solar.every((value) => value <= 0.001))
        .withContext(`${mode}/sky-only solar zero`)
        .toBe(true);

      const overfilledSkySource = cloudSource.replace(
        "skyIrradiance *\n        (1.0 / (4.0 * czm_pi)) * heightGradient",
        "skyIrradiance / czm_pi",
      );
      const isotropicHigherOrdersSource = cloudSource.replace(
        "sceneGISCloudDualPhase(cosineTheta, phaseAttenuation);",
        "(octave == 0 ? sceneGISCloudDualPhase(cosineTheta, phaseAttenuation) : (1.0 / (4.0 * czm_pi)));",
      );
      const sunPathPowderSource = cloudSource.replace(
        "localPowder = sceneGISCloudLocalPowder(localExtinction);",
        "localPowder = 1.0 + (1.0 - exp(-sunOpticalDepth));",
      );
      for (const [name, mutation] of Object.entries({
        overfilledSkySource,
        isotropicHigherOrdersSource,
        sunPathPowderSource,
      })) {
        expect(mutation).withContext(`${name}/applied`).not.toBe(cloudSource);
      }

      installControlledAtmosphereTextures(mode, combinedIncident);
      const overfilledSky = renderCloudLightingComponentProbe(
        mode,
        separationSample,
        overfilledSkySource,
      );
      expect(overfilledSky.sky[1])
        .withContext(`${mode}/overfilled sky mutation rejected`)
        .toBeGreaterThan(componentMatrix.sideMiddle.sky[1] * 4.0);
      const isotropicHigherOrders = renderCloudLightingComponentProbe(
        mode,
        samples.find((sample) => sample.name === "forwardTop"),
        isotropicHigherOrdersSource,
      );
      expect(
        Math.abs(
          isotropicHigherOrders.solar[1] - componentMatrix.forwardTop.solar[1],
        ),
      )
        .withContext(`${mode}/isotropic higher orders mutation rejected`)
        .toBeGreaterThan(0.01);
      const sunPathPowder = renderCloudLightingComponentProbe(
        mode,
        separationSample,
        sunPathPowderSource,
      );
      expect(sunPathPowder.powder)
        .withContext(`${mode}/Sun-path powder mutation rejected`)
        .toBeGreaterThan(1.0);

      installControlledAtmosphereTextures(mode, combinedIncident);
      const product = renderControlledCloudSample(mode, 0.0, false, false);
      const opacity = 1.0 - product.liveColor[3];
      reports[mode] = {
        angular,
        componentMatrix,
        separated,
        mutations: {
          overfilledSky,
          isotropicHigherOrders,
          sunPathPowder,
        },
        densityIntegral: -Math.log(product.liveColor[3]) / 0.001,
        cloudMrtSource: product.liveColor
          .slice(0, 3)
          .map((value) => value / Math.max(opacity, 1.0e-8)),
      };
      disconnectControlledCloudMode();
    }

    for (const [mode, report] of Object.entries(reports)) {
      expect(Number.isFinite(report.densityIntegral))
        .withContext(`${mode}/integrated density finite`)
        .toBe(true);
      expect(report.densityIntegral)
        .withContext(`${mode}/integrated density nonnegative`)
        .toBeGreaterThanOrEqual(0.0);
      expect(report.cloudMrtSource.every(Number.isFinite))
        .withContext(`${mode}/integrated source finite`)
        .toBe(true);
    }
  });
  it("matches the reference-derived Globe cloud core on the actual GPU", async function () {
    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      disconnectControlledCloudMode();
      return;
    }
    try {
      effects.cloudPreset = "cumulus";
      effects.cloudCoverage = 1.0;
      effects.cloudDensity = 0.001;
      installControlledCloudTestTextures("globe", false);
      const integrated = renderGlobeCloudReferenceProbe(false);
      const components = renderGlobeCloudReferenceProbe(true);

      const density = 0.625;
      const heightGradient = 0.75;
      const opticalDepth = density * effects.cloudDensity * 1000.0;
      const transmittance = Math.exp(-opticalDepth);
      const opacity = 1.0 - transmittance;
      const sunIncident = [0.8, 0.7, 0.6];
      const skyIncident = [0.1, 0.12, 0.16];
      const henyeyGreenstein = function (anisotropy, cosineTheta) {
        const anisotropySquared = anisotropy * anisotropy;
        return (
          (1.0 - anisotropySquared) /
          (4.0 * Math.PI) /
          Math.pow(
            1.0 + anisotropySquared - 2.0 * anisotropy * cosineTheta,
            1.5,
          )
        );
      };
      const solar = [0.0, 0.0, 0.0];
      let contribution = 1.0;
      let extinctionAttenuation = 1.0;
      let phaseAttenuation = 1.0;
      for (let octave = 0; octave < 8; octave++) {
        const phase =
          0.5 *
          (henyeyGreenstein(0.7 * phaseAttenuation, 0.0) +
            henyeyGreenstein(-0.2 * phaseAttenuation, 0.0));
        const weight =
          contribution *
          Math.exp(-opticalDepth * extinctionAttenuation) *
          phase;
        for (let channel = 0; channel < 3; channel++) {
          solar[channel] += sunIncident[channel] * weight;
        }
        contribution *= 0.5;
        extinctionAttenuation *= 0.5;
        phaseAttenuation *= 0.5;
      }
      const sky = skyIncident.map(
        (value) => value * heightGradient * (1.0 / (4.0 * Math.PI)),
      );
      const powder =
        1.0 - 0.8 * Math.exp(-density * effects.cloudDensity * 150.0);
      const premultiplied = solar.map(
        (value, channel) => (value + sky[channel]) * powder * opacity,
      );
      const expectNear = function (actual, expected, context) {
        expect(Math.abs(actual - expected))
          .withContext(context)
          .toBeLessThanOrEqual(Math.max(0.002, Math.abs(expected) * 0.004));
      };

      expectNear(integrated.color[0], density, "density");
      expectNear(integrated.color[1], opticalDepth, "optical depth");
      expectNear(integrated.color[2], transmittance, "transmittance");
      expectNear(integrated.color[3], heightGradient, "height gradient");
      expectNear(integrated.distance[3], opacity, "integrated opacity");
      expectNear(components.color[3], powder, "local powder");
      expectNear(components.distance[3], heightGradient, "component gradient");
      for (let channel = 0; channel < 3; channel++) {
        expectNear(
          components.color[channel],
          solar[channel],
          `solar/${channel}`,
        );
        expectNear(
          components.distance[channel],
          sky[channel],
          `sky/${channel}`,
        );
        expectNear(
          integrated.distance[channel],
          premultiplied[channel],
          `premultiplied radiance/${channel}`,
        );
      }
    } finally {
      disconnectControlledCloudMode();
    }
  });
  it("separates Globe cloud macro frequency, LOD, and radiance calibration on the actual GPU", async function () {
    const replaceCalibration = function (macroScale, lodScale) {
      const source = globeCloudSource
        .replace(
          /const float SCENEGIS_GLOBE_CLOUD_MACRO_SCALE = [0-9.]+;/,
          `const float SCENEGIS_GLOBE_CLOUD_MACRO_SCALE = ${macroScale};`,
        )
        .replace(
          /const float SCENEGIS_GLOBE_CLOUD_LOD_SCALE = [0-9.]+;/,
          `const float SCENEGIS_GLOBE_CLOUD_LOD_SCALE = ${lodScale};`,
        );
      expect(source).toContain(
        `const float SCENEGIS_GLOBE_CLOUD_MACRO_SCALE = ${macroScale};`,
      );
      expect(source).toContain(
        `const float SCENEGIS_GLOBE_CLOUD_LOD_SCALE = ${lodScale};`,
      );
      return source;
    };
    const percentile = function (values, fraction) {
      if (values.length === 0) {
        return 0.0;
      }
      const sorted = values.slice().sort((left, right) => left - right);
      return sorted[Math.floor((sorted.length - 1) * fraction)];
    };
    const summarize = function (rendered) {
      const width = rendered.liveWidth;
      const height = rendered.liveHeight;
      const activeMask = new Uint8Array(width * height);
      const sourceLuminance = new Float64Array(width * height);
      const opacityValues = [];
      const rawLuminance = [];
      let maximumRgb = 0.0;
      let meanSource = [0.0, 0.0, 0.0];
      let sourceWeight = 0.0;
      for (let index = 0; index < rendered.liveSamples.length; index++) {
        const color = rendered.liveSamples[index].color;
        const opacity = 1.0 - color[3];
        opacityValues.push(opacity);
        for (let channel = 0; channel < 3; channel++) {
          maximumRgb = Math.max(maximumRgb, Math.abs(color[channel]));
        }
        if (opacity <= 0.25) {
          continue;
        }
        activeMask[index] = 1;
        const source = color.slice(0, 3).map((value) => value / opacity);
        const rawY =
          0.2126 * source[0] + 0.7152 * source[1] + 0.0722 * source[2];
        sourceLuminance[index] = rawY;
        rawLuminance.push(rawY);
        for (let channel = 0; channel < 3; channel++) {
          meanSource[channel] += source[channel] * opacity;
        }
        sourceWeight += opacity;
      }
      let interiorPixels = 0;
      let gradientEnergy = 0.0;
      let laplacianEnergy = 0.0;
      let highPassEnergy = 0.0;
      for (let y = 1; y + 1 < height; y++) {
        for (let x = 1; x + 1 < width; x++) {
          const index = y * width + x;
          let interior = true;
          let neighborhood = 0.0;
          for (let offsetY = -1; offsetY <= 1; offsetY++) {
            for (let offsetX = -1; offsetX <= 1; offsetX++) {
              const neighbor = index + offsetY * width + offsetX;
              interior &&= activeMask[neighbor] !== 0;
              neighborhood += sourceLuminance[neighbor];
            }
          }
          if (!interior) {
            continue;
          }
          const center = sourceLuminance[index];
          const left = sourceLuminance[index - 1];
          const right = sourceLuminance[index + 1];
          const down = sourceLuminance[index - width];
          const up = sourceLuminance[index + width];
          gradientEnergy +=
            0.5 * (Math.abs(right - left) + Math.abs(up - down));
          laplacianEnergy += Math.abs(4.0 * center - left - right - down - up);
          highPassEnergy += Math.abs(center - neighborhood / 9.0);
          interiorPixels++;
        }
      }
      let transitions = 0;
      let edges = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          if (x + 1 < width) {
            transitions += activeMask[index] !== activeMask[index + 1] ? 1 : 0;
            edges++;
          }
          if (y + 1 < height) {
            transitions +=
              activeMask[index] !== activeMask[index + width] ? 1 : 0;
            edges++;
          }
        }
      }
      const visited = new Uint8Array(activeMask.length);
      const componentAreas = [];
      for (let start = 0; start < activeMask.length; start++) {
        if (activeMask[start] === 0 || visited[start] !== 0) {
          continue;
        }
        const queue = [start];
        visited[start] = 1;
        let area = 0;
        while (queue.length > 0) {
          const index = queue.pop();
          area++;
          const x = index % width;
          const y = Math.floor(index / width);
          for (const adjacent of [
            x > 0 ? index - 1 : -1,
            x + 1 < width ? index + 1 : -1,
            y > 0 ? index - width : -1,
            y + 1 < height ? index + width : -1,
          ]) {
            if (
              adjacent >= 0 &&
              activeMask[adjacent] !== 0 &&
              visited[adjacent] === 0
            ) {
              visited[adjacent] = 1;
              queue.push(adjacent);
            }
          }
        }
        componentAreas.push(area);
      }
      const activePixels = activeMask.reduce((sum, value) => sum + value, 0);
      const largestBody =
        componentAreas.length > 0 ? Math.max(...componentAreas) : 0;
      meanSource = meanSource.map(
        (value) => value / Math.max(sourceWeight, 1.0e-8),
      );
      const x =
        0.4124564 * meanSource[0] +
        0.3575761 * meanSource[1] +
        0.1804375 * meanSource[2];
      const y =
        0.2126729 * meanSource[0] +
        0.7151522 * meanSource[1] +
        0.072175 * meanSource[2];
      const z =
        0.0193339 * meanSource[0] +
        0.119192 * meanSource[1] +
        0.9503041 * meanSource[2];
      const xyz = x + y + z;
      return {
        activePixels,
        opacity: [0.1, 0.5, 0.9].map((fraction) =>
          percentile(opacityValues, fraction),
        ),
        transitionDensity: transitions / Math.max(edges, 1),
        connectedBodies: componentAreas.length,
        largestBodyFraction: largestBody / Math.max(activePixels, 1),
        rawY: [0.1, 0.5, 0.9].map((fraction) =>
          percentile(rawLuminance, fraction),
        ),
        interiorPixels,
        interiorGradientEnergy: gradientEnergy / Math.max(interiorPixels, 1),
        interiorLaplacianEnergy: laplacianEnergy / Math.max(interiorPixels, 1),
        interiorHighPassEnergy: highPassEnergy / Math.max(interiorPixels, 1),
        d65Distance: Math.hypot(
          x / Math.max(xyz, 1.0e-8) - 0.3127,
          y / Math.max(xyz, 1.0e-8) - 0.329,
        ),
        maximumRgb,
      };
    };

    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      disconnectControlledCloudMode();
      return;
    }
    const resources = effects._pipeline._resources;
    const originalLinear = resources.cloudProgram;
    const originalLogarithmic = resources.cloudLogDepthProgram;
    const programs = [];
    const createCalibrationProgram = function (macroScale, lodScale) {
      const program = createEnvironmentEffectsProgramForSpecs(
        scene.context,
        cloudFragmentSource,
        true,
        [],
        cloudSource,
        replaceCalibration(macroScale, lodScale),
      );
      programs.push(program);
      return program;
    };
    const phase = {
      x: CesiumMath.toRadians(15.0) * 6360000.0,
      y: CesiumMath.toRadians(45.0) * 6360000.0,
    };
    const direction = Cartesian3.normalize(
      new Cartesian3(0.1, 0.98, 0.18),
      new Cartesian3(),
    );
    const render = function (program, radianceScale) {
      resources.cloudProgram = program;
      resources.cloudLogDepthProgram = program;
      effects.cloudRadianceScale = radianceScale;
      effects._pipeline.invalidateCloudHistory("spec-a4-ar-030-sweep");
      return summarize(
        renderControlledCloudSample(
          "globe",
          phase,
          false,
          false,
          direction,
          100000.0,
        ),
      );
    };
    try {
      scene.canvas.width = 64;
      scene.canvas.height = 32;
      effects.cloudQuality = "high";
      effects.cloudPreset = "cumulus";
      effects.cloudCoverage = 0.45;
      effects.cloudDensity = 0.001;
      effects.cloudTime = 0.0;
      installFixedCloudStbn();
      const candidateProgram = createCalibrationProgram("0.25", "0.5");
      const macro = {};
      for (const scale of [1.0, 0.5, 0.25]) {
        macro[scale] = render(
          createCalibrationProgram(scale.toFixed(2), "0.5"),
          1.0,
        );
      }
      const lod = {};
      for (const scale of [1.0, 0.5, 0.35]) {
        lod[scale] = render(
          createCalibrationProgram("0.25", scale.toFixed(2)),
          1.0,
        );
      }
      const radiance = {};
      for (const scale of [0, 1, 48]) {
        radiance[scale] = render(candidateProgram, scale);
      }
      const report = { macro, lod, radiance };
      expect(macro[0.25].transitionDensity)
        .withContext("reference-frequency macro transition density")
        .toBeGreaterThan(macro[1].transitionDensity * 1.25);
      expect(lod[0.5].interiorPixels)
        .withContext(`LOD interior support ${JSON.stringify(report)}`)
        .toBeGreaterThan(32);
      expect(lod[0.5].interiorGradientEnergy)
        .withContext(`LOD interior gradient ${JSON.stringify(report)}`)
        .toBeGreaterThan(lod[1].interiorGradientEnergy * 1.05);
      expect(lod[0.5].interiorLaplacianEnergy)
        .withContext(`LOD interior Laplacian ${JSON.stringify(report)}`)
        .toBeGreaterThan(lod[1].interiorLaplacianEnergy * 1.05);
      expect(lod[0.5].interiorHighPassEnergy)
        .withContext(`LOD interior high-pass ${JSON.stringify(report)}`)
        .toBeGreaterThan(lod[1].interiorHighPassEnergy * 1.05);
      expect(
        Math.abs(
          lod[0.35].interiorHighPassEnergy - lod[1].interiorHighPassEnergy,
        ),
      )
        .withContext("compiled LOD 0.35 diagnostic exercised distinct samples")
        .toBeGreaterThan(0.00001);
      for (const scale of [48]) {
        expect(radiance[scale].activePixels).toBe(radiance[1].activePixels);
        expect(radiance[scale].opacity).toEqual(radiance[1].opacity);
        expect(radiance[scale].transitionDensity).toBe(
          radiance[1].transitionDensity,
        );
        expect(radiance[scale].connectedBodies).toBe(
          radiance[1].connectedBodies,
        );
        expect(radiance[scale].largestBodyFraction).toBe(
          radiance[1].largestBodyFraction,
        );
        expect(Math.abs(radiance[scale].d65Distance - radiance[1].d65Distance))
          .withContext(`radiance ${scale} chroma isolation`)
          .toBeLessThan(0.00002);
        for (let percentileIndex = 0; percentileIndex < 3; percentileIndex++) {
          expect(
            Math.abs(
              radiance[scale].rawY[percentileIndex] /
                radiance[1].rawY[percentileIndex] -
                scale,
            ),
          )
            .withContext(`radiance ${scale} raw linearity/${percentileIndex}`)
            .toBeLessThan(0.025);
        }
        expect(radiance[scale].maximumRgb).toBeLessThan(65504.0);
      }
      expect(radiance[0].rawY).toEqual([0.0, 0.0, 0.0]);
      expect(report.macro[0.25].d65Distance).toBeLessThan(0.02);
    } finally {
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
      for (const program of programs) {
        program.destroy();
      }
      disconnectControlledCloudMode();
    }
  });
  it("matches reference cube-face ties on the actual GPU", async function () {
    function referenceUv(direction) {
      const magnitude = Math.hypot(direction.x, direction.y, direction.z);
      const normal = {
        x: direction.x / magnitude,
        y: direction.y / magnitude,
        z: direction.z / magnitude,
      };
      const absolute = {
        x: Math.abs(normal.x),
        y: Math.abs(normal.y),
        z: Math.abs(normal.z),
      };
      const maximum = Math.max(absolute.x, absolute.y, absolute.z);
      const cube = {
        x: normal.x / maximum,
        y: normal.y / maximum,
        z: normal.z / maximum,
      };
      let face;
      if (absolute.y >= absolute.x && absolute.y >= absolute.z) {
        face =
          cube.y > 0.0
            ? { x: -normal.x, y: normal.z }
            : { x: normal.x, y: normal.z };
      } else if (absolute.x >= absolute.y && absolute.x >= absolute.z) {
        face =
          cube.x > 0.0
            ? { x: normal.y, y: normal.z }
            : { x: -normal.y, y: normal.z };
      } else {
        face =
          cube.z > 0.0
            ? { x: normal.x, y: normal.y }
            : { x: normal.x, y: -normal.y };
      }
      const squaredX = face.x * face.x;
      const squaredY = face.y * face.y;
      const q = -2.0 * squaredX + 2.0 * squaredY - 3.0;
      let x = Math.sqrt(
        Math.max(
          1.5 +
            squaredX -
            squaredY -
            0.5 * Math.sqrt(Math.max(-24.0 * squaredX + q * q, 0.0)),
          0.0,
        ),
      );
      x *= face.x > 0.0 ? 1.0 : -1.0;
      const y =
        Math.sqrt(Math.max(6.0 / Math.max(3.0 - x * x, 1.0e-4), 0.0)) * face.y;
      return [(x + 1.0) * 0.5, (y + 1.0) * 0.5];
    }

    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      disconnectControlledCloudMode();
      return;
    }
    try {
      installControlledCloudTestTextures("globe", false);
      const epsilon = 0.00001;
      const boundaries = [
        {
          name: "xy",
          tie: new Cartesian3(1.0, 1.0, 0.0),
          lower: new Cartesian3(1.0 + epsilon, 1.0, 0.0),
          upper: new Cartesian3(1.0, 1.0 + epsilon, 0.0),
        },
        {
          name: "yz",
          tie: new Cartesian3(0.0, 1.0, 1.0),
          lower: new Cartesian3(0.0, 1.0 + epsilon, 1.0),
          upper: new Cartesian3(0.0, 1.0, 1.0 + epsilon),
        },
        {
          name: "xz",
          tie: new Cartesian3(1.0, 0.0, 1.0),
          lower: new Cartesian3(1.0 + epsilon, 0.0, 1.0),
          upper: new Cartesian3(1.0, 0.0, 1.0 + epsilon),
        },
      ];
      const strictTieSource = globeCloudSource
        .replace(
          "absoluteNormal.y >= absoluteNormal.x &&\n        absoluteNormal.y >= absoluteNormal.z",
          "all(greaterThan(absoluteNormal.yy, absoluteNormal.xz))",
        )
        .replace(
          "absoluteNormal.x >= absoluteNormal.y &&\n        absoluteNormal.x >= absoluteNormal.z",
          "all(greaterThan(absoluteNormal.xx, absoluteNormal.yz))",
        );
      expect(strictTieSource).not.toBe(globeCloudSource);
      const circularDistance = (left, right) => {
        const difference = Math.abs(left - right);
        return Math.min(difference, 1.0 - difference);
      };
      let maximumMutationDelta = 0.0;
      for (const boundary of boundaries) {
        const probes = {};
        for (const key of ["tie", "lower", "upper"]) {
          const direction = boundary[key];
          const probe = renderGlobeCloudCoordinateProbe(direction);
          probes[key] = probe;
          const expected = referenceUv(direction);
          for (let channel = 0; channel < 2; channel++) {
            expect(Math.abs(probe.uv[channel] - expected[channel]))
              .withContext(`${boundary.name}/${key}/uv/${channel}`)
              .toBeLessThanOrEqual(0.002);
          }
        }
        for (const adjacent of [probes.lower, probes.upper]) {
          for (let channel = 0; channel < 2; channel++) {
            expect(
              circularDistance(
                adjacent.periodic[channel],
                probes.tie.periodic[channel],
              ),
            )
              .withContext(`${boundary.name}/periodic/${channel}`)
              .toBeLessThanOrEqual(0.01);
          }
        }
        const mutation = renderGlobeCloudCoordinateProbe(
          boundary.tie,
          strictTieSource,
        );
        maximumMutationDelta = Math.max(
          maximumMutationDelta,
          Math.hypot(
            mutation.uv[0] - probes.tie.uv[0],
            mutation.uv[1] - probes.tie.uv[1],
          ),
        );
      }
      expect(maximumMutationDelta)
        .withContext("strict tie mutation rejected by boundary matrix")
        .toBeGreaterThan(0.1);
    } finally {
      disconnectControlledCloudMode();
    }
  });
  it("matches integrated mid-latitude Globe reference coordinates on the actual GPU", async function () {
    const exhaustiveCloudSource = cloudSource.replace(
      "if (occupancy <= 1.0e-5) {",
      "if (false) {",
    );
    const geocentricCloudSource = cloudSource
      .replace(
        "sceneGISGlobeCloudSurfaceAnchor(vertical)",
        "normalize(surfacePosition - ellipsoidCenter) * SCENEGIS_BOTTOM_RADIUS",
      )
      .replace(
        "sceneGISGlobeCloudSurfaceAnchor(\n                worldVertical)",
        "normalize(surfacePosition - ellipsoidCenter) * SCENEGIS_BOTTOM_RADIUS",
      );
    expect(exhaustiveCloudSource).not.toBe(cloudSource);
    expect(geocentricCloudSource).not.toBe(cloudSource);
    expect(
      geocentricCloudSource.match(
        /normalize\(surfacePosition - ellipsoidCenter\)/g,
      ).length,
    ).toBe(2);

    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      disconnectControlledCloudMode();
      return;
    }
    const resources = effects._pipeline._resources;
    const originalLinear = resources.cloudProgram;
    const originalLogarithmic = resources.cloudLogDepthProgram;
    const createPair = function (librarySource) {
      return {
        linear: createEnvironmentEffectsProgramForSpecs(
          scene.context,
          cloudFragmentSource,
          true,
          [],
          librarySource,
        ),
        logarithmic: createEnvironmentEffectsProgramForSpecs(
          scene.context,
          cloudFragmentSource,
          true,
          ["LOG_DEPTH", "LOG_DEPTH_READ_ONLY"],
          librarySource,
        ),
      };
    };
    const exhaustivePrograms = createPair(exhaustiveCloudSource);
    const geocentricPrograms = createPair(geocentricCloudSource);
    try {
      scene.canvas.width = 64;
      scene.canvas.height = 32;
      effects.cloudQuality = "high";
      effects.cloudPreset = "cumulus";
      effects.cloudCoverage = 0.45;
      effects.cloudDensity = 0.001;
      installControlledCloudTestTextures("globe", true);
      installControlledAtmosphereTextures("globe");
      const bottomRadius = 6360000.0;
      const phase = {
        x: CesiumMath.toRadians(15.0) * bottomRadius,
        y: CesiumMath.toRadians(45.0) * bottomRadius,
      };
      const localDirection = Cartesian3.normalize(
        new Cartesian3(0.15, 0.25, 0.956),
        new Cartesian3(),
      );
      let maximumMutationDelta = 0;
      for (const logarithmicDepth of [false, true]) {
        resources.cloudProgram = originalLinear;
        resources.cloudLogDepthProgram = originalLogarithmic;
        const accelerated = renderControlledCloudSample(
          "globe",
          phase,
          false,
          logarithmicDepth,
          localDirection,
        );
        const surface = effects._pipeline._frame.surfacePosition;
        const liveNormal = effects._pipeline._frame.vertical;
        const ellipsoidNormal = Ellipsoid.WGS84.geodeticSurfaceNormal(
          surface,
          new Cartesian3(),
        );
        expect(Cartesian3.equalsEpsilon(liveNormal, ellipsoidNormal, 1.0e-12))
          .withContext(`live geodetic normal/${logarithmicDepth}`)
          .toBe(true);
        const referenceAnchor = Cartesian3.multiplyByScalar(
          ellipsoidNormal,
          bottomRadius,
          new Cartesian3(),
        );
        const referenceCenter = Cartesian3.subtract(
          surface,
          referenceAnchor,
          new Cartesian3(),
        );
        const correctedAnchor = Cartesian3.negate(
          referenceCenter,
          new Cartesian3(),
        );
        Cartesian3.add(correctedAnchor, surface, correctedAnchor);
        expect(
          Cartesian3.distance(referenceAnchor, correctedAnchor),
        ).toBeLessThanOrEqual(1.0e-6);
        const geocentricAnchor = Cartesian3.multiplyByScalar(
          Cartesian3.normalize(surface, new Cartesian3()),
          bottomRadius,
          new Cartesian3(),
        );
        expect(Cartesian3.distance(referenceAnchor, geocentricAnchor))
          .withContext(`45-degree geocentric error/${logarithmicDepth}`)
          .toBeGreaterThan(20000.0);

        resources.cloudProgram = exhaustivePrograms.linear;
        resources.cloudLogDepthProgram = exhaustivePrograms.logarithmic;
        const exhaustive = renderControlledCloudSample(
          "globe",
          phase,
          false,
          logarithmicDepth,
          localDirection,
        );
        expect(accelerated.liveRaw.color)
          .withContext(`accelerated/exhaustive color/${logarithmicDepth}`)
          .toEqual(exhaustive.liveRaw.color);
        expect(accelerated.liveRaw.distance)
          .withContext(`accelerated/exhaustive distance/${logarithmicDepth}`)
          .toEqual(exhaustive.liveRaw.distance);

        resources.cloudProgram = geocentricPrograms.linear;
        resources.cloudLogDepthProgram = geocentricPrograms.logarithmic;
        const geocentric = renderControlledCloudSample(
          "globe",
          phase,
          false,
          logarithmicDepth,
          localDirection,
        );
        for (let index = 0; index < accelerated.liveRaw.color.length; index++) {
          maximumMutationDelta = Math.max(
            maximumMutationDelta,
            Math.abs(
              accelerated.liveRaw.color[index] -
                geocentric.liveRaw.color[index],
            ),
          );
        }
        const active = accelerated.liveSamples.filter(
          ({ distances }) => distances[3] > 0.5,
        );
        const clear = accelerated.liveSamples.filter(
          ({ color, distances }) =>
            distances[3] === 0.0 &&
            color[0] === 0.0 &&
            color[1] === 0.0 &&
            color[2] === 0.0 &&
            color[3] === 1.0,
        );
        expect(active.length)
          .withContext(`mid-latitude active/${logarithmicDepth}`)
          .toBeGreaterThan(0);
        expect(clear.length)
          .withContext(`mid-latitude exact clear/${logarithmicDepth}`)
          .toBeGreaterThan(0);
        for (const { color, distances } of accelerated.liveSamples) {
          expect(color.every(Number.isFinite)).toBe(true);
          expect(distances.every(Number.isFinite)).toBe(true);
        }
      }
      expect(maximumMutationDelta)
        .withContext("geocentric anchor mutation rejected")
        .toBeGreaterThan(0);
    } finally {
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
      exhaustivePrograms.linear.destroy();
      exhaustivePrograms.logarithmic.destroy();
      geocentricPrograms.linear.destroy();
      geocentricPrograms.logarithmic.destroy();
      disconnectControlledCloudMode();
    }
  });
  it("keeps compiled Globe and frozen Planar cloud material valid under controlled incidents", async function () {
    for (const mode of ["planar", "globe"]) {
      await connectControlledCloudMode(mode);
      if (!SceneGISEnvironmentEffects.isSupported(scene)) {
        disconnectControlledCloudMode();
        return;
      }
      for (const ramp of [false, true]) {
        installControlledCloudTestTextures(mode, ramp);
        const phaseMeters = ramp ? 175500.0 : 0.0;
        for (const orthographic of [false, true]) {
          for (const logarithmicDepth of [false, true]) {
            const sample = renderControlledCloudSample(
              mode,
              phaseMeters,
              orthographic,
              logarithmicDepth,
            );
            const context = `${mode}/${ramp ? "ramp" : "constant"}/${
              orthographic ? "orthographic" : "perspective"
            }/${logarithmicDepth ? "log" : "linear"}`;
            expect(sample.liveDistances[3])
              .withContext(`${context}/live`)
              .toBeGreaterThan(0.5);
            expect(sample.liveColor[3])
              .withContext(`${context}/live`)
              .toBeLessThan(1.0);
            expect(sample.distances[3])
              .withContext(context)
              .toBeGreaterThan(0.5);
            expect(sample.color[3]).withContext(context).toBeGreaterThan(0.0);
            expect(sample.color[3]).withContext(context).toBeLessThan(1.0);
            expectFiniteHdrStorage(sample.color);
            const transmittance = sample.liveColor[3];
            const opticalDepth = -Math.log(transmittance);
            const opacity = 1.0 - transmittance;
            const sourceRgb = sample.liveColor
              .slice(0, 3)
              .map((value) => value / Math.max(opacity, 1.0e-8));
            const frontDistance = sample.liveDistances[1] * 1000000.0;
            const meanDistance = sample.liveDistances[0] * 1000000.0;
            expect(frontDistance)
              .withContext(context)
              .toBeGreaterThanOrEqual(490.0);
            expect(frontDistance).withContext(context).toBeLessThan(1000.0);
            expect(meanDistance)
              .withContext(context)
              .toBeGreaterThan(frontDistance);
            expect(meanDistance).withContext(context).toBeLessThan(5005.0);
            expect(opticalDepth).withContext(context).toBeGreaterThan(0.0);
            expect(sourceRgb.every(Number.isFinite))
              .withContext(`${context}/source finite`)
              .toBe(true);
          }
        }
      }
      disconnectControlledCloudMode();
    }
  });

  it("keeps compiled coverage monotonic and isolates material density from extinction", async function () {
    for (const mode of ["planar", "globe"]) {
      await connectControlledCloudMode(mode);
      if (!SceneGISEnvironmentEffects.isSupported(scene)) {
        disconnectControlledCloudMode();
        return;
      }
      installControlledCloudTestTextures(mode, false);
      installCloudWeatherRamp();
      const phase = { x: 120000.0, y: 60000.0 };
      const opacities = [];
      for (const coverage of [0.0, 0.25, 0.45, 0.75, 1.0]) {
        effects.cloudCoverage = coverage;
        const sample = renderControlledCloudSample(mode, phase, false, false);
        if (coverage === 0.0) {
          expect(sample.color).withContext(mode).toEqual([0.0, 0.0, 0.0, 1.0]);
          expect(sample.distances)
            .withContext(mode)
            .toEqual([0.0, 0.0, 0.0, 0.0]);
        }
        opacities.push(1.0 - sample.color[3]);
      }
      for (let index = 1; index < opacities.length; index++) {
        expect(opacities[index])
          .withContext(`${mode} coverage index ${index}`)
          .toBeGreaterThanOrEqual(opacities[index - 1]);
      }
      expect(opacities[3]).withContext(mode).toBeGreaterThan(opacities[2]);
      expect(opacities[4]).withContext(mode).toBeGreaterThan(0.0);

      effects.cloudCoverage = 1.0;
      const densityIntegrals = [];
      const frontDistances = [];
      for (const density of [0.0001, 0.0002, 0.0004]) {
        effects.cloudDensity = density;
        const sample = renderControlledCloudSample(mode, phase, false, false);
        densityIntegrals.push(-Math.log(sample.color[3]) / density);
        frontDistances.push(sample.distances[1] * 1000000.0);
      }
      const densityMinimum = Math.min(...densityIntegrals);
      const densityMaximum = Math.max(...densityIntegrals);
      expect((densityMaximum - densityMinimum) / densityMaximum)
        .withContext(`${mode} ${JSON.stringify(densityIntegrals)}`)
        .toBeLessThanOrEqual(0.02);
      expect(Math.max(...frontDistances) - Math.min(...frontDistances))
        .withContext(`${mode} ${JSON.stringify(frontDistances)}`)
        .toBeLessThanOrEqual(24.0);
      disconnectControlledCloudMode();
    }
  });

  it("preserves thin sub-cell support with the conservative occupancy hierarchy", async function () {
    const shallowDirection = new Cartesian3(0.0, 0.998987, 0.044999);
    const reports = {};
    for (const mode of ["planar", "globe"]) {
      await connectControlledCloudMode(mode);
      if (!SceneGISEnvironmentEffects.isSupported(scene)) {
        disconnectControlledCloudMode();
        return;
      }
      effects.cloudQuality = "high";
      effects.cloudPreset = "cumulus";
      effects.cloudCoverage = 1.0;
      effects.cloudDensity = 0.001;
      effects._pipeline.publishResources(
        scene.context,
        createThinCloudBuffers(),
      );
      installControlledAtmosphereTextures(mode);
      scene.canvas.width = 64;
      scene.canvas.height = 32;
      const sample = renderControlledCloudSample(
        mode,
        { x: 0.0, y: 0.0 },
        false,
        false,
        shallowDirection,
      );
      const strongestSample = sample.liveSamples.reduce(
        (strongest, current) =>
          current.color[3] < strongest.color[3] ? current : strongest,
        sample.liveSamples[0],
      );
      const transmittance = strongestSample.color[3];
      const segment = computeCloudSegment(mode, {
        origin: new Cartesian3(0.0, 0.0, 1000.0),
        direction: Cartesian3.normalize(shallowDirection, new Cartesian3()),
      });
      const coarseStep = (segment.end - segment.start) / 64.0;
      const intervalFineSteps = Math.min(
        4,
        Math.max(1, Math.ceil(coarseStep / 450.0)),
      );
      reports[mode] = {
        segmentLength: segment.end - segment.start,
        coarseStep,
        intervalFineSteps,
        legacyCenterHits: Array.from({ length: 64 }, (_, step) => {
          const distance = segment.start + (step + 0.5) * coarseStep;
          const voxelPhase =
            ((((distance * shallowDirection.y) / (10000.0 / 128.0)) % 20.0) +
              20.0) %
            20.0;
          return voxelPhase < 8.0;
        }).filter(Boolean).length,
        transmittance,
        activeSamples: sample.liveSamples.filter(
          ({ distances }) => distances[3] > 0.5,
        ).length,
        front: strongestSample.distances[1] * 1000000.0,
        mean: strongestSample.distances[0] * 1000000.0,
      };
      expect(coarseStep).withContext(mode).toBeGreaterThan(900.0);
      expect(intervalFineSteps).withContext(mode).toBeGreaterThanOrEqual(3);
      expect(reports[mode].activeSamples)
        .withContext(JSON.stringify(reports[mode]))
        .toBeGreaterThan(0);
      expect(transmittance).withContext(mode).toBeGreaterThan(0.0);
      expect(transmittance).withContext(mode).toBeLessThan(1.0);
      expect(reports[mode].front).withContext(mode).toBeGreaterThan(0.0);
      expect(reports[mode].mean)
        .withContext(mode)
        .toBeGreaterThanOrEqual(reports[mode].front);
      disconnectControlledCloudMode();
    }
    expect(reports.planar.legacyCenterHits).toBe(0);
    // The legacy center-density authority sampled only the gap in every
    // Planar coarse interval. Even its footprint average was bounded by the
    // 625/1562.5 m duty ratio, below cumulus' 0.56 shape threshold.
    expect(8.0 / 20.0).toBeLessThan(0.56);
  });

  it("uploads conservative occupancy mips and matches exhaustive density support", async function () {
    const exhaustiveCloudSource = cloudSource.replace(
      "if (occupancy <= 1.0e-5) {",
      "if (false) {",
    );
    expect(exhaustiveCloudSource).not.toBe(cloudSource);
    const shallowDirection = new Cartesian3(0.0, 0.998987, 0.044999);
    for (const mode of ["planar", "globe"]) {
      await connectControlledCloudMode(mode);
      if (!SceneGISEnvironmentEffects.isSupported(scene)) {
        disconnectControlledCloudMode();
        return;
      }

      const uploadedLevels = [];
      for (const lod of [5, 6, 7]) {
        const size = 1 << (7 - lod);
        uploadedLevels.push(
          readTexture3DMip(
            effects._pipeline._resources.cloudOccupancyTexture,
            lod,
            size,
          ),
        );
      }
      for (let level = 0; level < uploadedLevels.length; level++) {
        expect(Math.min(...uploadedLevels[level]))
          .withContext(`${mode} occupancy LOD ${level + 5}`)
          .toBeGreaterThan(0);
      }
      for (let level = 0; level < uploadedLevels.length - 1; level++) {
        const children = uploadedLevels[level];
        const parents = uploadedLevels[level + 1];
        const childSize = 1 << (2 - level);
        const parentSize = childSize / 2;
        for (let z = 0; z < childSize; z++) {
          for (let y = 0; y < childSize; y++) {
            for (let x = 0; x < childSize; x++) {
              const child = children[(z * childSize + y) * childSize + x];
              const parent =
                parents[
                  (Math.floor(z / 2) * parentSize + Math.floor(y / 2)) *
                    parentSize +
                    Math.floor(x / 2)
                ];
              expect(parent)
                .withContext(
                  `${mode} occupancy LOD ${level + 6} parent of ${x},${y},${z}`,
                )
                .toBeGreaterThanOrEqual(child);
            }
          }
        }
      }

      effects.cloudQuality = "high";
      effects.cloudPreset = "cumulus";
      effects.cloudCoverage = 1.0;
      effects.cloudDensity = 0.001;
      effects._pipeline.publishResources(
        scene.context,
        createThinCloudBuffers(),
      );
      installControlledAtmosphereTextures(mode);
      scene.canvas.width = 64;
      scene.canvas.height = 32;
      const phase = { x: 0.0, y: 0.0 };
      const product = renderControlledCloudSample(
        mode,
        phase,
        false,
        false,
        shallowDirection,
      );
      const resources = effects._pipeline._resources;
      const originalLinear = resources.cloudProgram;
      const originalLogarithmic = resources.cloudLogDepthProgram;
      const exhaustiveProgram = createEnvironmentEffectsProgramForSpecs(
        scene.context,
        cloudFragmentSource,
        mode === "globe",
        [],
        exhaustiveCloudSource,
      );
      try {
        resources.cloudProgram = exhaustiveProgram;
        resources.cloudLogDepthProgram = exhaustiveProgram;
        const exhaustive = renderControlledCloudSample(
          mode,
          phase,
          false,
          false,
          shallowDirection,
        );
        expect(product.liveRaw.color)
          .withContext(`${mode} occupancy color versus exhaustive density`)
          .toEqual(exhaustive.liveRaw.color);
        expect(product.liveRaw.distance)
          .withContext(`${mode} occupancy distance versus exhaustive density`)
          .toEqual(exhaustive.liveRaw.distance);
        let supportedPixels = 0;
        for (let index = 0; index < exhaustive.liveSamples.length; index++) {
          const reference = exhaustive.liveSamples[index];
          if (reference.distances[3] <= 0.5) {
            continue;
          }
          supportedPixels++;
          const accelerated = product.liveSamples[index];
          expect(accelerated.distances[3])
            .withContext(`${mode} support pixel ${index}`)
            .toBeGreaterThan(0.5);
          expect(accelerated.distances[1])
            .withContext(`${mode} front pixel ${index}`)
            .toBeGreaterThan(0.0);
          expect(accelerated.color[3])
            .withContext(`${mode} transmittance pixel ${index}`)
            .toBeLessThan(1.0);
        }
        expect(supportedPixels).withContext(mode).toBeGreaterThan(0);
      } finally {
        resources.cloudProgram = originalLinear;
        resources.cloudLogDepthProgram = originalLogarithmic;
        exhaustiveProgram.destroy();
        disconnectControlledCloudMode();
      }
    }
  });

  it("replays sixteen compiled real-asset material phases in Globe and frozen Planar", async function () {
    const localDirection = new Cartesian3(0.0, 0.94, 0.342);
    const phases = [];
    for (const y of [0.0, 60000.0, 120000.0, 180000.0]) {
      for (const x of [0.0, 60000.0, 120000.0, 180000.0]) {
        phases.push({ x, y });
      }
    }
    const results = { globe: [], planar: [] };
    for (const mode of ["planar", "globe"]) {
      await connectControlledCloudMode(mode);
      if (!SceneGISEnvironmentEffects.isSupported(scene)) {
        disconnectControlledCloudMode();
        return;
      }
      scene.canvas.width = 96;
      scene.canvas.height = 64;
      effects.cloudCoverage = 0.45;
      installFixedCloudStbn();
      const liveAtmospherePhase = { x: 90000.0, y: 30000.0 };
      const liveAtmosphereA = renderControlledCloudSample(
        mode,
        liveAtmospherePhase,
        false,
        false,
        localDirection,
      );
      const liveAtmosphereB = renderControlledCloudSample(
        mode,
        liveAtmospherePhase,
        false,
        false,
        localDirection,
      );
      expect(liveAtmosphereB.liveRaw.color)
        .withContext(`${mode} real assets + live A2 atmosphere color`)
        .toEqual(liveAtmosphereA.liveRaw.color);
      expect(liveAtmosphereB.liveRaw.distance)
        .withContext(`${mode} real assets + live A2 atmosphere distance`)
        .toEqual(liveAtmosphereA.liveRaw.distance);
      installControlledAtmosphereTextures(mode);
      for (const phase of phases) {
        const sample = renderControlledCloudSample(
          mode,
          phase,
          false,
          false,
          localDirection,
        );
        const replay = renderControlledCloudSample(
          mode,
          phase,
          false,
          false,
          localDirection,
        );
        expect(replay.liveRaw.color)
          .withContext(`${mode} real-asset color phase=${phase.x},${phase.y}`)
          .toEqual(sample.liveRaw.color);
        expect(replay.liveRaw.distance)
          .withContext(
            `${mode} real-asset distance phase=${phase.x},${phase.y}`,
          )
          .toEqual(sample.liveRaw.distance);
        results[mode].push(
          sample.liveSamples.map(({ color, distances }) => {
            const transmittance = color[3];
            const opacity = 1.0 - transmittance;
            return {
              active: distances[3] > 0.5,
              opacity,
              radianceRgb: color.slice(0, 3),
              densityIntegral:
                -Math.log(Math.max(transmittance, 1.0e-8)) / 0.001,
              sourceRgb: color
                .slice(0, 3)
                .map((value) => value / Math.max(opacity, 1.0e-8)),
              frontDistance: distances[1] * 1000000.0,
              meanDistance: distances[0] * 1000000.0,
            };
          }),
        );
      }
      disconnectControlledCloudMode();
    }

    let activePhases = 0;
    const activeSamples = { planar: [], globe: [] };
    for (let index = 0; index < phases.length; index++) {
      const planarSamples = results.planar[index];
      const globeSamples = results.globe[index];
      const phaseContext = `phase=${phases[index].x},${phases[index].y}`;
      expect(globeSamples.length)
        .withContext(phaseContext)
        .toBe(planarSamples.length);
      let phaseActive = false;
      for (let pixel = 0; pixel < planarSamples.length; pixel++) {
        for (const mode of ["planar", "globe"]) {
          const sample = results[mode][index][pixel];
          if (!sample.active) {
            continue;
          }
          phaseActive = true;
          const context = `${phaseContext}/pixel=${pixel}/${mode}`;
          expect(sample.densityIntegral)
            .withContext(context)
            .toBeGreaterThan(0.0);
          expect(sample.frontDistance)
            .withContext(context)
            .toBeGreaterThanOrEqual(500.0);
          expect(sample.meanDistance)
            .withContext(context)
            .toBeGreaterThanOrEqual(sample.frontDistance);
          expect(sample.meanDistance)
            .withContext(context)
            .toBeLessThanOrEqual(100000.0);
          activeSamples[mode].push(sample);
        }
      }
      if (phaseActive) {
        activePhases++;
      }
    }
    expect(activePhases).toBeGreaterThanOrEqual(4);
    expect(activePhases).toBeLessThanOrEqual(16);
    expect(activeSamples.planar.length).toBeGreaterThan(0);
    expect(activeSamples.globe.length).toBeGreaterThan(0);
    const mean = (values) =>
      values.reduce((sum, value) => sum + value, 0.0) / values.length;
    const distribution = function (mode) {
      const samples = activeSamples[mode];
      const totalOpacity = samples.reduce(
        (sum, sample) => sum + sample.opacity,
        0.0,
      );
      const sourceRgb = [0, 1, 2].map(
        (channel) =>
          samples.reduce(
            (sum, sample) => sum + sample.radianceRgb[channel],
            0.0,
          ) / Math.max(totalOpacity, 1.0e-8),
      );
      return {
        densityIntegral: mean(samples.map((sample) => sample.densityIntegral)),
        sourceRgb,
        frontDistance: mean(samples.map((sample) => sample.frontDistance)),
        meanDistance: mean(samples.map((sample) => sample.meanDistance)),
      };
    };
    const planarDistribution = distribution("planar");
    const globeDistribution = distribution("globe");
    for (const [mode, distribution] of Object.entries({
      planar: planarDistribution,
      globe: globeDistribution,
    })) {
      expect(distribution.densityIntegral)
        .withContext(`${mode}/real-asset density`)
        .toBeGreaterThan(0.0);
      expect(distribution.sourceRgb.every(Number.isFinite))
        .withContext(`${mode}/real-asset source`)
        .toBe(true);
      expect(distribution.frontDistance)
        .withContext(`${mode}/real-asset front`)
        .toBeGreaterThan(0.0);
      expect(distribution.meanDistance)
        .withContext(`${mode}/real-asset mean`)
        .toBeGreaterThanOrEqual(distribution.frontDistance);
    }
  });

  it("reports bounded conservative cloud sampling across both worlds and every preset", async function () {
    const localDirection = new Cartesian3(0.0, 0.94, 0.342);
    const phases = [
      { x: 0.0, y: 0.0 },
      { x: 60000.0, y: 120000.0 },
      { x: 120000.0, y: 60000.0 },
      { x: 180000.0, y: 180000.0 },
    ];
    const presets = ["cumulus", "stratus", "cirrus", "mixed"];
    const reports = {};

    for (const mode of ["planar", "globe"]) {
      await connectControlledCloudMode(mode);
      if (!SceneGISEnvironmentEffects.isSupported(scene)) {
        disconnectControlledCloudMode();
        return;
      }
      scene.canvas.width = 32;
      scene.canvas.height = 16;
      effects.cloudCoverage = 0.45;
      effects.cloudQuality = "high";
      installControlledAtmosphereTextures(mode);
      installFixedCloudStbn();
      const resources = effects._pipeline._resources;
      const originalLinear = resources.cloudProgram;
      const originalLogarithmic = resources.cloudLogDepthProgram;
      const diagnosticLinear = createEnvironmentEffectsProgramForSpecs(
        scene.context,
        cloudFragmentSource,
        mode === "globe",
        ["SCENEGIS_CLOUD_SAMPLING_DIAGNOSTICS"],
      );
      const diagnosticLogarithmic = createEnvironmentEffectsProgramForSpecs(
        scene.context,
        cloudFragmentSource,
        mode === "globe",
        [
          "LOG_DEPTH",
          "LOG_DEPTH_READ_ONLY",
          "SCENEGIS_CLOUD_SAMPLING_DIAGNOSTICS",
        ],
      );
      resources.cloudProgram = diagnosticLinear;
      resources.cloudLogDepthProgram = diagnosticLogarithmic;
      reports[mode] = {};
      try {
        for (const preset of presets) {
          effects.cloudPreset = preset;
          const samples = [];
          for (let index = 0; index < phases.length; index++) {
            const rendered = renderControlledCloudSample(
              mode,
              phases[index],
              index % 2 === 1,
              index >= 2,
              localDirection,
            );
            samples.push(
              ...rendered.liveSamples
                .map(({ color }) => color)
                .filter((value) => value[0] > 0.0),
            );
          }
          const summary = samples.reduce(
            (result, value) => {
              result.rays++;
              result.coarse += value[0];
              result.fine += value[1];
              result.skipped += value[2];
              result.earlyOut += value[3] > 0.5 ? 1 : 0;
              return result;
            },
            { rays: 0, coarse: 0, fine: 0, skipped: 0, earlyOut: 0 },
          );
          reports[mode][preset] = summary;
          const context = JSON.stringify({ mode, preset, summary });
          expect(summary.rays).withContext(context).toBeGreaterThan(0);
          expect(summary.coarse)
            .withContext(context)
            .toBeLessThanOrEqual(summary.rays * 64);
          expect(summary.fine).withContext(context).toBeGreaterThan(0);
          expect(summary.fine)
            .withContext(context)
            .toBeLessThanOrEqual((summary.coarse - summary.skipped) * 4);
          expect(summary.skipped)
            .withContext(context)
            .toBeLessThan(summary.coarse);
          expect(summary.earlyOut)
            .withContext(context)
            .toBeLessThanOrEqual(summary.rays);
        }
        expect(
          Object.values(reports[mode]).reduce(
            (sum, value) => sum + value.skipped,
            0,
          ),
        )
          .withContext(JSON.stringify(reports[mode]))
          .toBeGreaterThan(0);
      } finally {
        resources.cloudProgram = originalLinear;
        resources.cloudLogDepthProgram = originalLogarithmic;
        diagnosticLinear.destroy();
        diagnosticLogarithmic.destroy();
        disconnectControlledCloudMode();
      }
    }
  });

  it("matches the real A2 atmosphere adapters under controlled cloud material", async function () {
    const results = {};
    const localDirection = new Cartesian3(0.0, 0.94, 0.342);
    for (const mode of ["planar", "globe"]) {
      await connectControlledCloudMode(mode);
      if (!SceneGISEnvironmentEffects.isSupported(scene)) {
        disconnectControlledCloudMode();
        return;
      }
      effects.cloudCoverage = 1.0;
      installControlledCloudTestTextures(mode, false);
      const sample = renderControlledCloudSample(
        mode,
        { x: 60000.0, y: 0.0 },
        false,
        false,
        localDirection,
      );
      const transmittance = sample.liveColor[3];
      const opacity = 1.0 - transmittance;
      results[mode] = {
        transmittance,
        densityIntegral:
          -Math.log(Math.max(transmittance, 1.0e-8)) / effects.cloudDensity,
        sourceRgb: sample.liveColor
          .slice(0, 3)
          .map((value) => value / Math.max(opacity, 1.0e-8)),
        frontDistance: sample.liveDistances[1] * 1000000.0,
        meanDistance: sample.liveDistances[0] * 1000000.0,
      };
      expect(sample.distances[3]).withContext(mode).toBeGreaterThan(0.5);
      disconnectControlledCloudMode();
    }

    const report = JSON.stringify(results);
    for (const [mode, result] of Object.entries(results)) {
      expect(result.densityIntegral)
        .withContext(`${mode}/${report}`)
        .toBeGreaterThan(0.0);
      expect(result.sourceRgb.every(Number.isFinite))
        .withContext(`${mode}/${report}`)
        .toBe(true);
    }
    expect(results.planar.frontDistance)
      .withContext(report)
      .toBeGreaterThanOrEqual(500.0);
    expect(results.globe.frontDistance)
      .withContext(report)
      .toBeGreaterThanOrEqual(500.0);
    expect(results.planar.meanDistance)
      .withContext(report)
      .toBeGreaterThanOrEqual(results.planar.frontDistance);
    expect(results.globe.meanDistance)
      .withContext(report)
      .toBeGreaterThanOrEqual(results.globe.frontDistance);
  });

  it("renders off-center planar cloud MRT through both frusta and depth variants", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    effects.showAtmosphere = false;
    effects.showAerialPerspective = false;
    effects.showHeightFog = false;
    effects.showClouds = true;
    effects.cloudCoverage = 1.0;
    effects.cloudDensity = 0.003;
    scene.canvas.width = 16;
    scene.canvas.height = 8;
    await publishPlanarResources();
    installSolidCloudTestTextures();

    const inputTexture = new Texture({
      context: scene.context,
      width: 8,
      height: 4,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      source: { arrayBufferView: new Uint8Array(8 * 4 * 4) },
    });
    const depthTexture = new Texture({
      context: scene.context,
      width: 8,
      height: 4,
      pixelFormat: PixelFormat.DEPTH_COMPONENT,
      pixelDatatype: PixelDatatype.UNSIGNED_INT,
    });
    const depthColor = new Texture({
      context: scene.context,
      width: 8,
      height: 4,
    });
    const depthFramebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [depthColor],
      depthTexture,
      destroyAttachments: false,
    });
    const clear = new ClearCommand({
      color: Color.BLACK,
      depth: 1.0,
      framebuffer: depthFramebuffer,
    });

    function renderDepth(rawDepth) {
      clear.depth = rawDepth;
      clear.execute(scene.context);
      effects._pipeline.executeHdr(
        scene.context,
        inputTexture,
        depthTexture,
        scene.context.defaultTexture,
      );
      const framebuffer = effects._pipeline._resources.cloudFramebuffer;
      const color = framebuffer.getColorTexture(0);
      const distances = framebuffer.getColorTexture(1);
      expect(color.width).toBe(4);
      expect(color.height).toBe(2);
      const samples = [];
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 4; x++) {
          samples.push({
            color: readHalfTexturePixel(color, x, y),
            distances: readHalfTexturePixel(distances, x, y),
          });
        }
      }
      return samples;
    }

    try {
      for (const orthographic of [false, true]) {
        if (orthographic) {
          scene.camera.switchToOrthographicFrustum();
          scene.camera.frustum.width = 8000.0;
        } else {
          scene.camera.switchToPerspectiveFrustum();
        }
        scene.camera.frustum.near = 1.0;
        scene.camera.frustum.far = 20000.0;
        const direction = Cartesian3.normalize(
          new Cartesian3(0.2, 0.3, 0.9327),
          new Cartesian3(),
        );
        const right = Cartesian3.normalize(
          Cartesian3.cross(direction, Cartesian3.UNIT_Z, new Cartesian3()),
          new Cartesian3(),
        );
        const up = Cartesian3.normalize(
          Cartesian3.cross(right, direction, new Cartesian3()),
          new Cartesian3(),
        );
        scene.camera.setView({
          destination: new Cartesian3(0.0, 0.0, 1000.0),
          orientation: { direction, up },
        });
        for (const logarithmicDepth of [false, true]) {
          scene.logarithmicDepthBuffer = logarithmicDepth;
          scene.renderForSpecs();
          for (const preset of ["cumulus", "stratus", "cirrus", "mixed"]) {
            effects.cloudPreset = preset;
            expectCloudReplayStagesExact(
              false,
              renderDepth,
              depthTexture,
              `planar/orthographic=${orthographic}/log=${logarithmicDepth}/preset=${preset}`,
            );
          }
          effects.cloudPreset = "cumulus";
          const near = renderDepth(0.001);
          const nearThresholdGeometry = renderDepth(5.0e-8);
          const far = renderDepth(0.9999);
          const farRaw = readCloudMrtRawBits();
          renderDepth(0.9999);
          const farReplayRaw = readCloudMrtRawBits();
          expect(farReplayRaw.color)
            .withContext(
              `planar owner MRT color orthographic=${orthographic} log=${logarithmicDepth}`,
            )
            .toEqual(farRaw.color);
          expect(farReplayRaw.distance)
            .withContext(
              `planar owner MRT distance orthographic=${orthographic} log=${logarithmicDepth}`,
            )
            .toEqual(farRaw.distance);
          const farThresholdGeometry = renderDepth(1.0 - 2.0e-7);
          const clearDepth = renderDepth(1.0);
          const reverseClearDepth = renderDepth(0.0);
          expect(reverseClearDepth).toEqual(clearDepth);
          expectRawCloudSamplesMatchLiveSegments(
            far,
            "planar",
            !orthographic,
            false,
          );
          expectRawCloudSamplesMatchLiveSegments(
            clearDepth,
            "planar",
            !orthographic,
          );
          const visibleSamples = [...far, ...clearDepth];
          for (const sample of visibleSamples) {
            expectFiniteHdrStorage(sample.color);
          }
          const cloudHits = visibleSamples.filter(
            (sample) => sample.distances[3] > 0.5,
          );
          expect(cloudHits.length)
            .withContext(
              `orthographic=${orthographic} logarithmicDepth=${logarithmicDepth}`,
            )
            .toBeGreaterThan(0);
          for (const sample of cloudHits) {
            expect(sample.distances[0]).toBeGreaterThanOrEqual(
              sample.distances[1],
            );
            expect(sample.color[3]).toBeLessThan(1.0);
          }
          for (const sample of near) {
            expect(sample.distances).toEqual([0.0, 0.0, 0.0, 0.0]);
            expect(sample.color).toEqual([0.0, 0.0, 0.0, 1.0]);
          }
          for (const sample of nearThresholdGeometry) {
            expect(sample.distances).toEqual([0.0, 0.0, 0.0, 0.0]);
            expect(sample.color).toEqual([0.0, 0.0, 0.0, 1.0]);
          }
          expect(
            farThresholdGeometry.some((sample) => sample.distances[3] > 0.5),
          )
            .withContext(
              `finite far geometry orthographic=${orthographic} logarithmicDepth=${logarithmicDepth}`,
            )
            .toBe(true);
          expect(effects._pipeline._resources.cloudCommand.shaderProgram).toBe(
            scene.frameState.useLogDepth
              ? effects._pipeline._resources.cloudLogDepthProgram
              : effects._pipeline._resources.cloudProgram,
          );
        }
      }
    } finally {
      depthFramebuffer.destroy();
      depthColor.destroy();
      depthTexture.destroy();
      inputTexture.destroy();
    }
  });

  it("renders off-center Globe shell MRT through both frusta and depth variants", async function () {
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
      showAtmosphere: false,
      showAerialPerspective: false,
      showHeightFog: false,
      showClouds: true,
      cloudCoverage: 1.0,
      cloudDensity: 0.003,
    });
    effects.connectedCallback({});
    effects.firstUpdate(scene, scene.frameState.time);
    await pollToPromise(function () {
      effects.update(scene, scene.frameState.time);
      return effects.ready;
    });
    scene.canvas.width = 16;
    scene.canvas.height = 8;
    installSolidCloudTestTextures();

    const inputTexture = new Texture({
      context: scene.context,
      width: 8,
      height: 4,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      source: { arrayBufferView: new Uint8Array(8 * 4 * 4) },
    });
    const depthTexture = new Texture({
      context: scene.context,
      width: 8,
      height: 4,
      pixelFormat: PixelFormat.DEPTH_COMPONENT,
      pixelDatatype: PixelDatatype.UNSIGNED_INT,
    });
    const depthColor = new Texture({
      context: scene.context,
      width: 8,
      height: 4,
    });
    const depthFramebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [depthColor],
      depthTexture,
      destroyAttachments: false,
    });
    const clear = new ClearCommand({
      color: Color.BLACK,
      depth: 1.0,
      framebuffer: depthFramebuffer,
    });

    function renderDepth(rawDepth) {
      clear.depth = rawDepth;
      clear.execute(scene.context);
      effects._pipeline.executeHdr(
        scene.context,
        inputTexture,
        depthTexture,
        scene.context.defaultTexture,
      );
      const framebuffer = effects._pipeline._resources.cloudFramebuffer;
      const samples = [];
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 4; x++) {
          samples.push({
            color: readHalfTexturePixel(framebuffer.getColorTexture(0), x, y),
            distances: readHalfTexturePixel(
              framebuffer.getColorTexture(1),
              x,
              y,
            ),
          });
        }
      }
      return samples;
    }

    try {
      const destination = Cartesian3.fromDegrees(-75.0, 40.0, 1000.0);
      const localDirection = Cartesian3.normalize(
        new Cartesian3(0.3, 0.4, 0.866),
        new Cartesian3(),
      );
      const localRight = Cartesian3.normalize(
        Cartesian3.cross(localDirection, Cartesian3.UNIT_Z, new Cartesian3()),
        new Cartesian3(),
      );
      const localUp = Cartesian3.normalize(
        Cartesian3.cross(localRight, localDirection, new Cartesian3()),
        new Cartesian3(),
      );
      const localFrame = Transforms.eastNorthUpToFixedFrame(destination);
      const globeDirection = Cartesian3.normalize(
        Matrix4.multiplyByPointAsVector(
          localFrame,
          localDirection,
          new Cartesian3(),
        ),
        new Cartesian3(),
      );
      const globeUp = Cartesian3.normalize(
        Matrix4.multiplyByPointAsVector(localFrame, localUp, new Cartesian3()),
        new Cartesian3(),
      );
      for (const orthographic of [false, true]) {
        if (orthographic) {
          scene.camera.switchToOrthographicFrustum();
          scene.camera.frustum.width = 8000.0;
        } else {
          scene.camera.switchToPerspectiveFrustum();
        }
        scene.camera.frustum.near = 1.0;
        scene.camera.frustum.far = 20000.0;
        scene.camera.setView({
          destination,
          orientation: { direction: globeDirection, up: globeUp },
        });
        for (const logarithmicDepth of [false, true]) {
          scene.logarithmicDepthBuffer = logarithmicDepth;
          scene.renderForSpecs();
          for (const preset of ["cumulus", "stratus", "cirrus", "mixed"]) {
            effects.cloudPreset = preset;
            expectCloudReplayStagesExact(
              true,
              renderDepth,
              depthTexture,
              `globe/orthographic=${orthographic}/log=${logarithmicDepth}/preset=${preset}`,
            );
          }
          effects.cloudPreset = "cumulus";
          const near = renderDepth(0.001);
          const nearThresholdGeometry = renderDepth(5.0e-8);
          const far = renderDepth(0.9999);
          const farRaw = readCloudMrtRawBits();
          renderDepth(0.9999);
          const farReplayRaw = readCloudMrtRawBits();
          expect(farReplayRaw.color)
            .withContext(
              `globe owner MRT color orthographic=${orthographic} log=${logarithmicDepth}`,
            )
            .toEqual(farRaw.color);
          expect(farReplayRaw.distance)
            .withContext(
              `globe owner MRT distance orthographic=${orthographic} log=${logarithmicDepth}`,
            )
            .toEqual(farRaw.distance);
          const farThresholdGeometry = renderDepth(1.0 - 2.0e-7);
          const clearDepth = renderDepth(1.0);
          const reverseClearDepth = renderDepth(0.0);
          expect(reverseClearDepth).toEqual(clearDepth);
          expectRawCloudSamplesMatchLiveSegments(
            far,
            "globe",
            !orthographic,
            false,
          );
          expectRawCloudSamplesMatchLiveSegments(
            clearDepth,
            "globe",
            !orthographic,
          );
          const visibleSamples = [...far, ...clearDepth];
          for (const sample of visibleSamples) {
            expectFiniteHdrStorage(sample.color);
          }
          const cloudHits = visibleSamples.filter(
            (sample) => sample.distances[3] > 0.5,
          );
          expect(cloudHits.length)
            .withContext(
              `orthographic=${orthographic} logarithmicDepth=${logarithmicDepth}`,
            )
            .toBeGreaterThan(0);
          for (const sample of cloudHits) {
            expect(sample.distances[0]).toBeGreaterThanOrEqual(
              sample.distances[1],
            );
            expect(sample.color[3]).toBeLessThan(1.0);
          }
          for (const sample of near) {
            expect(sample.distances).toEqual([0.0, 0.0, 0.0, 0.0]);
            expect(sample.color).toEqual([0.0, 0.0, 0.0, 1.0]);
          }
          for (const sample of nearThresholdGeometry) {
            expect(sample.distances).toEqual([0.0, 0.0, 0.0, 0.0]);
            expect(sample.color).toEqual([0.0, 0.0, 0.0, 1.0]);
          }
          expect(
            farThresholdGeometry.some((sample) => sample.distances[3] > 0.5),
          )
            .withContext(
              `finite far geometry orthographic=${orthographic} logarithmicDepth=${logarithmicDepth}`,
            )
            .toBe(true);
          expect(effects._pipeline._resources.cloudCommand.shaderProgram).toBe(
            scene.frameState.useLogDepth
              ? effects._pipeline._resources.cloudLogDepthProgram
              : effects._pipeline._resources.cloudProgram,
          );
        }
      }
    } finally {
      depthFramebuffer.destroy();
      depthColor.destroy();
      depthTexture.destroy();
      inputTexture.destroy();
    }
  });

  it("retains the last-good cloud MRT when a quality resize fails", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    effects.showAtmosphere = false;
    effects.showAerialPerspective = false;
    effects.showHeightFog = false;
    effects.showClouds = true;
    effects.cloudCoverage = 1.0;
    scene.camera.setView({
      destination: new Cartesian3(0.0, -10000.0, 1000.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.95, 0.3122499),
        up: new Cartesian3(0.0, -0.3122499, 0.95),
      },
    });
    await publishPlanarResources();
    scene.renderForSpecs();
    const resources = effects._pipeline._resources;
    const lastGood = resources.cloudFramebuffer;
    const managerPrototype = Object.getPrototypeOf(lastGood);
    const destroyLastGood = spyOn(lastGood, "destroy").and.callThrough();
    const expectedError = new Error("injected cloud framebuffer failure");
    spyOn(managerPrototype, "update").and.throwError(expectedError);
    effects.cloudQuality = "high";
    scene.canvas.width = 4;
    scene.canvas.height = 4;

    expect(function () {
      scene.renderForSpecs();
    }).toThrow(expectedError);
    expect(resources.cloudFramebuffer).toBe(lastGood);
    expect(destroyLastGood).not.toHaveBeenCalled();
  });

  it("keeps cloud loops, MRT outputs, depth clipping, and A2/A3 composition bounded", function () {
    expect(cloudSource).toContain("SCENEGIS_CLOUD_PRIMARY_MAX_STEPS = 64");
    expect(cloudSource).toContain("SCENEGIS_CLOUD_FINE_MAX_STEPS = 4");
    expect(cloudSource).toContain("SCENEGIS_CLOUD_SUN_MAX_STEPS = 4");
    expect(cloudSource).toContain("SCENEGIS_CLOUD_MAX_DISTANCE = 300000.0");
    expect(cloudSource).toContain("accumulatedTransmittance <= 0.01");
    expect(cloudSource).toContain("if (occupancy <= 1.0e-5)");
    expect(cloudSource).toContain("sceneGISCloudOccupancyBound");
    expect(cloudSource).toContain("sampler3D occupancyTexture");
    expect(cloudSource).toContain("ceil(log2(max(");
    expect(cloudSource).toContain("minimumRetainedFeature * 0.5");
    expect(cloudSource).toContain("fineStep >= intervalFineSteps");
    expect(cloudSource).toMatch(/textureLod\(\s*shapeTexture/);
    expect(cloudSource).toMatch(/textureLod\(\s*detailTexture/);
    expect(cloudSource).toMatch(/textureLod\(\s*turbulenceTexture/);
    expect(cloudSource).toMatch(/textureLod\(\s*weatherTexture/);
    expect(cloudSource.match(/float radialDelta =/g).length).toBe(1);
    expect(globeCloudSource).toContain(
      "length(globePosition) - SCENEGIS_BOTTOM_RADIUS",
    );
    expect(cloudSource).not.toContain(") -\n        SCENEGIS_BOTTOM_RADIUS");
    expect(cloudSource).toContain("distance * rayAngularFootprint");
    expect(cloudSource).toContain("1.0 - stepTransmittance");
    expect(cloudSource).toContain("sampler2D weatherTexture");
    expect(cloudSource).toContain("SCENEGIS_CLOUD_VISIBLE_START = 60000.0");
    expect(cloudSource).toContain("SCENEGIS_CLOUD_VISIBLE_END = 100000.0");
    expect(cloudSource).toContain("SCENEGIS_CLOUD_WEATHER_SCALE = 240000.0");
    expect(cloudSource).toContain("sceneGISCloudLayerDescriptor");
    expect(cloudSource).toContain("sceneGISCloudPresetSupport");
    expect(
      cloudSource.match(/supportBaseHeight,/g).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      cloudSource.match(/supportThickness,/g).length,
    ).toBeGreaterThanOrEqual(2);
    expect(cloudSource).toContain("localCoverage");
    expect(cloudSource).toContain("octave < 8");
    expect(cloudSource).toContain("sceneGISCloudSolarScattering");
    expect(cloudSource).not.toContain("threshold = 1.11 - cloudCoverage");
    expect(cloudFragmentSource).toContain("layout (location = 1) out vec4");
    expect(cloudFragmentSource).toContain("u_cloudOccupancyTexture");
    expect(cloudFragmentSource).toContain("distanceToGeometry");
    expect(cloudFragmentSource).toContain("vec2 cloudPixel = gl_FragCoord.xy");
    expect(cloudFragmentSource).toContain(
      "vec2 cloudCoordinates = cloudPixel / u_cloudBufferDimensions",
    );
    expect(cloudFragmentSource).toContain("if (!isClearDepth)");
    expect(cloudSource).toContain("return rawDepth == 0.0 || rawDepth == 1.0");
    expect(cloudSource).not.toContain("resolvedDepth == 0.0");
    expect(cloudFragmentSource).toContain(
      "sceneGISIsClearResolvedDepth(rawDepth)",
    );
    expect(cloudFragmentSource).toContain(
      "vec4(fullPixel, resolvedDepth, 1.0)",
    );
    expect(cloudFragmentSource).toContain("ivec2 stbnPixel");
    expect(cloudFragmentSource).toMatch(/texelFetch\(\s*u_cloudStbnTexture/);
    expect(cloudFragmentSource).not.toContain("LOG_DEPTH");
    expect(cloudResolveFragmentSource).toContain(
      "float resolvedDepth = czm_readDepth(u_depthTexture, v_textureCoordinates)",
    );
    expect(cloudResolveFragmentSource).toContain(
      "sceneGISIsClearResolvedDepth(rawDepth)",
    );
    expect(cloudResolveFragmentSource).toContain("float sceneDistance = 1.0");
    expect(cloudResolveFragmentSource).toContain("if (!isClearDepth)");
    expect(cloudResolveFragmentSource).toContain(
      "vec4(gl_FragCoord.xy, resolvedDepth, 1.0)",
    );
    expect(cloudResolveFragmentSource).toContain("distanceWeightSum");
    expect(cloudResolveFragmentSource).toContain(
      "spatialDistance.a = step(1.0e-6, distanceWeightSum)",
    );
    expect(aerialFragmentSource).toContain("sceneGISSelectCloudSample");
    expect(aerialFragmentSource).toContain(
      "sceneGISIsClearResolvedDepth(rawDepth)",
    );
    expect(aerialFragmentSource).toContain(
      "vec4(gl_FragCoord.xy, resolvedDepth, 1.0)",
    );
    expect(aerialFragmentSource).toContain("fwidth(frontDelta)");
    const cloudSelectionSource = aerialFragmentSource.slice(
      aerialFragmentSource.indexOf("bool sceneGISSelectCloudSample"),
      aerialFragmentSource.indexOf("void main()"),
    );
    expect(cloudSelectionSource.indexOf("fwidth(frontDelta)"))
      .withContext("derivative precedes invalid-distance branch")
      .toBeLessThan(cloudSelectionSource.indexOf("if (!cloudValid)"));
    expect(cloudSelectionSource.indexOf("fwidth(frontDelta)"))
      .withContext("derivative precedes clear-depth branch")
      .toBeLessThan(cloudSelectionSource.indexOf("if (!clearDepth)"));
    expect(cloudSelectionSource.indexOf("fwidth(frontDelta)"))
      .withContext("derivative precedes first early return")
      .toBeLessThan(cloudSelectionSource.indexOf("return false"));
    expect(aerialFragmentSource).toContain(
      "cloudColor.a = mix(1.0, cloudColor.a, visibility)",
    );
    expect(aerialFragmentSource).not.toContain("distances.y + 0.00025");
    for (const source of [
      aerialFragmentSource,
      cloudFragmentSource,
      cloudResolveFragmentSource,
    ]) {
      expect(source).not.toContain("rawDepth <= 1.0e-7");
      expect(source).not.toContain("1.0 - 5.0e-7");
    }
    expect(aerialFragmentSource).toContain(
      "sceneLinearRadiance * cloudColor.a + cloudOptical",
    );
    expect(aerialFragmentSource).toContain("cloudOptical / cloudOpacity");
    expect(cloudSource).not.toContain("backgroundRadianceScale");
    expect(cloudSource).not.toContain("aerialRadianceScale");
    expect(cloudSource).not.toContain("heightFogInscatteringScale");
  });

  it("keeps every cloud preset layer inside its marched support union", function () {
    const descriptors = {
      cumulus: [[0.0, 1.0]],
      stratus: [[500.0, 0.4]],
      cirrus: [[6500.0, 0.32]],
      mixed: [
        [0.0, 0.85],
        [4200.0, 0.34],
        [7800.0, 0.24],
      ],
    };
    function support(preset, base, thickness) {
      const layers = descriptors[preset];
      return [
        Math.min(...layers.map(([offset]) => base + offset)),
        Math.max(
          ...layers.map(([offset, scale]) => base + offset + thickness * scale),
        ),
      ];
    }
    expect(support("cumulus", 1500.0, 4500.0)).toEqual([1500.0, 6000.0]);
    expect(support("stratus", 1500.0, 4500.0)).toEqual([2000.0, 3800.0]);
    expect(support("cirrus", 1500.0, 4500.0)).toEqual([8000.0, 9440.0]);
    expect(support("mixed", 1500.0, 4500.0)).toEqual([1500.0, 10380.0]);
  });

  it("matches bounded cloud support and energy-conserving segment references", function () {
    function planarSegment(originZ, directionZ, maximumDistance, base, top) {
      if (Math.abs(directionZ) < 1.0e-7) {
        return originZ >= base && originZ <= top
          ? [0.0, Math.min(maximumDistance, 100000.0)]
          : undefined;
      }
      const first = (base - originZ) / directionZ;
      const second = (top - originZ) / directionZ;
      const start = Math.max(Math.min(first, second), 0.0);
      const end = Math.min(
        Math.max(first, second),
        maximumDistance,
        start + 300000.0,
        start + 100000.0,
      );
      return end > start ? [start, end] : undefined;
    }
    expect(planarSegment(1000.0, 1.0, 10000.0, 1500.0, 6000.0)).toEqual([
      500.0, 5000.0,
    ]);
    expect(planarSegment(3000.0, 0.0, 500000.0, 1500.0, 6000.0)).toEqual([
      0.0, 100000.0,
    ]);
    expect(planarSegment(120000.0, -0.2, 1000000.0, 1500.0, 6000.0)).toEqual([
      570000.0, 592500.0,
    ]);
    expect(
      planarSegment(120000.0, 0.2, 1000000.0, 1500.0, 6000.0),
    ).toBeUndefined();

    let transmittance = 1.0;
    let radiance = 0.0;
    let weightedDistance = 0.0;
    let weight = 0.0;
    let front;
    const extinction = 0.001;
    const sourceRadiance = 2.5;
    const stepLength = 250.0;
    for (let step = 0; step < 16; step++) {
      const stepTransmittance = Math.exp(-extinction * stepLength);
      const opacityContribution = transmittance * (1.0 - stepTransmittance);
      front ??= (step + 0.5) * stepLength;
      radiance += opacityContribution * sourceRadiance;
      transmittance *= stepTransmittance;
      weightedDistance += opacityContribution * (step + 0.5) * stepLength;
      weight += opacityContribution;
    }
    expect(transmittance).toEqualEpsilon(Math.exp(-4.0), 1.0e-14);
    expect(radiance).toEqualEpsilon(
      sourceRadiance * (1.0 - Math.exp(-4.0)),
      1.0e-14,
    );
    expect(weightedDistance / weight).toBeGreaterThan(front);
    expect(weightedDistance / weight).toBeLessThan(4000.0);
  });

  it("matches the source-backed CloudCore coverage, type, and erosion remap", function () {
    function smoothstep(minimum, maximum, value) {
      const normalized = Math.min(
        Math.max((value - minimum) / (maximum - minimum), 0.0),
        1.0,
      );
      return normalized * normalized * (3.0 - 2.0 * normalized);
    }

    function densitySample({
      shape,
      columnCoverage,
      cloudCoverage,
      cloudType,
      weatherDensity,
      heightFraction,
      erosion,
      useDetail,
    }) {
      const lowerTransition = 0.04 * (1.0 - cloudType) + 0.14 * cloudType;
      const upperTransition = 0.58 * (1.0 - cloudType) + 0.82 * cloudType;
      const heightProfile =
        smoothstep(0.0, lowerTransition, heightFraction) *
        (1.0 - smoothstep(upperTransition, 1.0, heightFraction));
      const lowFrequencyFbm =
        shape[1] * 0.625 + shape[2] * 0.25 + shape[3] * 0.125;
      const worleyErosionFloor = (1.0 - lowFrequencyFbm) * 0.15;
      const baseShape = Math.min(
        Math.max(
          (shape[0] - worleyErosionFloor) /
            Math.max(1.0 - worleyErosionFloor, 1.0e-3),
          0.0,
        ),
        1.0,
      );
      const coverageCenter = 1.0 - cloudCoverage * cloudCoverage;
      const coverageWidth = 0.04 * (1.0 - cloudCoverage) + 0.08 * cloudCoverage;
      const localCoverage =
        cloudCoverage <= 0.0
          ? 0.0
          : smoothstep(
              coverageCenter - coverageWidth,
              coverageCenter + coverageWidth,
              columnCoverage,
            );
      const shapeLower = 0.65 * (1.0 - localCoverage) + 0.35 * localCoverage;
      const shapeUpper = 0.82 * (1.0 - localCoverage) + 0.58 * localCoverage;
      const shapeSignal = smoothstep(shapeLower, shapeUpper, baseShape);
      let density =
        shapeSignal *
        localCoverage *
        heightProfile *
        (0.3 * (1.0 - weatherDensity) + weatherDensity);
      if (density <= 1.0e-4 || !useDetail) {
        return Math.min(Math.max(density, 0.0), 1.0);
      }
      const erosionStrength =
        0.28 * (1.0 - heightFraction) + 0.12 * heightFraction;
      density =
        (density - (1.0 - erosion) * erosionStrength) /
        Math.max(1.0 - erosionStrength, 1.0e-3);
      return Math.min(Math.max(density, 0.0), 1.0);
    }

    const sample = {
      shape: [0.95, 0.9, 0.8, 0.7],
      columnCoverage: 0.92,
      cloudCoverage: 0.45,
      cloudType: 0.6,
      weatherDensity: 0.7,
      heightFraction: 0.5,
      erosion: 0.85,
      useDetail: true,
    };
    const baseline = densitySample(sample);
    expect(baseline).toBeGreaterThan(0.0);
    expect(baseline).toBeLessThanOrEqual(1.0);
    expect(densitySample({ ...sample, cloudCoverage: 0.0 })).toBeLessThan(
      baseline,
    );
    expect(densitySample({ ...sample, shape: [0.2, 0.1, 0.1, 0.1] })).toBe(0.0);
    expect(densitySample({ ...sample, heightFraction: 0.0 })).toBe(0.0);
    expect(densitySample({ ...sample, heightFraction: 1.0 })).toBe(0.0);
    expect(densitySample({ ...sample, erosion: 0.2 })).toBeLessThan(baseline);
    expect(baseline).toBeGreaterThan(
      densitySample({ ...sample, useDetail: false }),
    );
  });

  it("freezes preset morphology, quality detail, and lighting contrast", function () {
    expect(cloudSource).toContain("sceneGISCloudMorphologyParameters");
    expect(cloudSource).toContain("sceneGISCloudDetailErosion");
    expect(cloudSource).not.toContain("sceneGISCloudLightingParameters");
    expect(cloudSource).toContain("vec4(10000.0, 900.0, 0.56, 0.16)");
    expect(cloudSource).toContain("vec4(22000.0, 2800.0, 0.48, 0.18)");
    expect(cloudSource).toContain("vec4(30000.0, 900.0, 0.48, 0.16)");
    expect(cloudSource).toContain("sceneGISCloudMorphologyAnisotropy");
    expect(cloudSource).toContain(
      "primarySteps >= SCENEGIS_CLOUD_PRIMARY_MAX_STEPS ? 1.0 : 0.15",
    );
    expect(cloudSource).toContain(
      "float qualityDetailScale = detailStrength > 0.9 ? 0.5 : 3.0",
    );
    expect(cloudResolveFragmentSource).toContain(
      "float spatialSharpness = lowDimensions.x / max(fullDimensions.x, 1.0) > 0.6",
    );
    expect(cloudSource).toContain("sceneGISCloudLightingComponents");
    expect(cloudSource).toContain("sceneGISCloudDualPhase");
    expect(cloudSource).toContain(
      "solarScattering = sceneGISCloudSolarScattering",
    );
    expect(cloudSource).toContain("(1.0 / (4.0 * czm_pi)) * heightGradient");
    expect(cloudSource).toContain(
      "totalSource = (solarScattering + skySource) * localPowder",
    );
  });

  it("matches off-center Perspective and Orthographic cloud support for both worlds", function () {
    const bottomRadius = 6360000.0;
    const cloudBase = 1500.0;
    const cloudTop = 6000.0;

    function normalize(vector) {
      const length = Math.hypot(...vector);
      return vector.map((component) => component / length);
    }

    function offCenterRay(uv, orthographic) {
      const ndc = [uv[0] * 2.0 - 1.0, uv[1] * 2.0 - 1.0];
      return orthographic
        ? {
            origin: [ndc[0] * 4000.0, ndc[1] * 2000.0, 0.0],
            direction: [0.0, 0.0, 1.0],
          }
        : {
            origin: [0.0, 0.0, 0.0],
            direction: normalize([ndc[0], ndc[1] * 0.5, 1.0]),
          };
    }

    function planarSegment(origin, direction, maximumDistance) {
      if (Math.abs(direction[2]) < 1.0e-12) {
        return undefined;
      }
      const first = (cloudBase - origin[2]) / direction[2];
      const second = (cloudTop - origin[2]) / direction[2];
      const start = Math.max(Math.min(first, second), 0.0);
      const end = Math.min(Math.max(first, second), maximumDistance);
      return end > start ? [start, end] : undefined;
    }

    function sphereInterval(origin, direction, radius) {
      const projected = origin.reduce(
        (sum, component, index) => sum + component * direction[index],
        0.0,
      );
      const radiusSquared = origin.reduce(
        (sum, component) => sum + component * component,
        0.0,
      );
      const discriminant =
        projected * projected - radiusSquared + radius * radius;
      if (discriminant < 0.0) {
        return undefined;
      }
      const root = Math.sqrt(discriminant);
      return [-projected - root, -projected + root];
    }

    function globeSegment(height, direction, maximumDistance) {
      const origin = [0.0, 0.0, bottomRadius + height];
      const outer = sphereInterval(origin, direction, bottomRadius + cloudTop);
      if (!outer || outer[1] <= 0.0) {
        return undefined;
      }
      let start = Math.max(outer[0], 0.0);
      let end = Math.min(outer[1], maximumDistance);
      const inner = sphereInterval(origin, direction, bottomRadius + cloudBase);
      if (inner) {
        if (bottomRadius + height < bottomRadius + cloudBase) {
          start = Math.max(start, inner[1]);
        } else if (inner[0] > start) {
          end = Math.min(end, inner[0]);
        }
      }
      return end > start ? [start, end] : undefined;
    }

    for (const orthographic of [false, true]) {
      const left = offCenterRay([0.2, 0.65], orthographic);
      const right = offCenterRay([0.8, 0.65], orthographic);
      if (orthographic) {
        expect(left.origin).not.toEqual(right.origin);
        expect(left.direction).toEqual(right.direction);
      } else {
        expect(left.origin).toEqual(right.origin);
        expect(left.direction).not.toEqual(right.direction);
      }
      for (const ray of [left, right]) {
        const segment = planarSegment(ray.origin, ray.direction, 300000.0);
        expect(segment).toBeDefined();
        expect(segment[0]).toBeGreaterThanOrEqual(0.0);
        expect(segment[1]).toBeGreaterThan(segment[0]);
      }
    }

    const outward = [0.0, 0.0, 1.0];
    const inward = [0.0, 0.0, -1.0];
    expect(globeSegment(0.0, outward, 300000.0)).toEqual([1500.0, 6000.0]);
    expect(globeSegment(3000.0, outward, 300000.0)).toEqual([0.0, 3000.0]);
    const above = globeSegment(10000.0, inward, 300000.0);
    expect(above[0]).toEqualEpsilon(4000.0, 1.0e-8);
    expect(above[1]).toEqualEpsilon(8500.0, 1.0e-8);
    expect(globeSegment(120000.0, [1.0, 0.0, 0.0], 300000.0)).toBeUndefined();
    const spaceIntersect = globeSegment(120000.0, inward, 300000.0);
    expect(spaceIntersect[0]).toEqualEpsilon(114000.0, 1.0e-8);
    expect(spaceIntersect[1]).toEqualEpsilon(118500.0, 1.0e-8);

    for (const segmentFunction of [
      (maximum) => planarSegment([0.0, 0.0, 1000.0], outward, maximum),
      (maximum) => globeSegment(1000.0, outward, maximum),
    ]) {
      expect(segmentFunction(250.0)).toBeUndefined();
      const far = segmentFunction(10000.0);
      expect(far[1]).toBeGreaterThan(far[0]);
    }
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
      "u_perspective ? length(eye.xyz) : max(-eye.z, 0.0)",
    );
    expect(aerialFragmentSource).toContain(": normalize(u_cameraDirection)");
    expect(backgroundFragmentSource).toContain(
      "physicalRadiance * u_backgroundRadianceScale",
    );
    expect(aerialFragmentSource).toContain(
      "inputColor.rgb * transmittance + radiance * u_aerialRadianceScale",
    );
    expect(backgroundFragmentSource).not.toContain("u_aerialRadianceScale");
    expect(aerialFragmentSource).toContain(
      "u_backgroundRadianceScale * u_aerialRadianceScale",
    );
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

  it("destroys every candidate program when cloud log-depth compilation fails", function () {
    scene = createScene();
    scene.renderForSpecs();
    const expectedError = new Error("injected cloud compilation failure");
    const candidates = Array.from({ length: 5 }, function (_, index) {
      let destroyed = false;
      return {
        _bind: function () {
          if (index === 4) {
            throw expectedError;
          }
        },
        isDestroyed: function () {
          return destroyed;
        },
        destroy: jasmine
          .createSpy(`destroyCloudCandidateProgram${index}`)
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
    for (const candidate of candidates) {
      expect(candidate.destroy).toHaveBeenCalledTimes(1);
    }
    expect(renderer._resources).toBeUndefined();
    renderer.destroy();
  });

  it("destroys every candidate program when resolve log-depth compilation fails", function () {
    scene = createScene();
    scene.renderForSpecs();
    const expectedError = new Error("injected resolve compilation failure");
    const candidates = Array.from({ length: 7 }, function (_, index) {
      let destroyed = false;
      return {
        _bind: function () {
          if (index === 6) {
            throw expectedError;
          }
        },
        isDestroyed: function () {
          return destroyed;
        },
        destroy: jasmine
          .createSpy(`destroyResolveCandidateProgram${index}`)
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
    for (const candidate of candidates) {
      expect(candidate.destroy).toHaveBeenCalledTimes(1);
    }
    expect(renderer._resources).toBeUndefined();
    renderer.destroy();
  });

  it("destroys candidate 3D textures when cloud mip generation fails", async function () {
    connectPlanar();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    await publishPlanarResources();
    const publishedResources = effects._pipeline._resources;
    const publishedResourceValues = Object.values(publishedResources).filter(
      (resource) => typeof resource?.isDestroyed === "function",
    );
    const expectedError = new Error("injected cloud mipmap failure");
    const runtimeTexture3DPrototype = Object.getPrototypeOf(
      publishedResources.cloudShapeTexture,
    );
    // The subject is imported through packages/engine/index.js, while this Spec's
    // deep-source import is a distinct module identity in the browser bundle.
    // Guard the injection authority so a wrong-prototype spy cannot silently turn
    // this failure test into successful publication.
    expect(runtimeTexture3DPrototype).not.toBe(Texture3D.prototype);
    const wrongModuleMipmap = spyOn(
      Texture3D.prototype,
      "generateMipmap",
    ).and.callThrough();
    const runtimeMipmap = spyOn(
      runtimeTexture3DPrototype,
      "generateMipmap",
    ).and.throwError(expectedError);
    const texture3DDestroy = spyOn(
      runtimeTexture3DPrototype,
      "destroy",
    ).and.callThrough();
    const texture2DDestroy = spyOn(
      Object.getPrototypeOf(publishedResources.transmittanceTexture),
      "destroy",
    ).and.callThrough();
    const programDestroy = spyOn(
      Object.getPrototypeOf(publishedResources.backgroundProgram),
      "destroy",
    ).and.callThrough();
    const vertexArrayDestroy = spyOn(
      Object.getPrototypeOf(publishedResources.vertexArray),
      "destroy",
    ).and.callThrough();
    const publishedVertexBuffer =
      publishedResources.vertexArray._attributes[0].vertexBuffer;
    const vertexBufferDestroy = spyOn(
      Object.getPrototypeOf(publishedVertexBuffer),
      "destroy",
    ).and.callThrough();

    expect(function () {
      effects._pipeline.publishResources(scene.context, createLutBuffers());
    }).toThrow(expectedError);
    expect(runtimeMipmap).toHaveBeenCalledTimes(1);
    expect(wrongModuleMipmap).not.toHaveBeenCalled();
    expect(texture3DDestroy).toHaveBeenCalledTimes(2);
    expect(texture2DDestroy).toHaveBeenCalledTimes(2);
    expect(programDestroy).toHaveBeenCalledTimes(7);
    expect(vertexArrayDestroy).toHaveBeenCalledTimes(1);
    expect(vertexBufferDestroy).toHaveBeenCalledTimes(1);
    expect(effects._pipeline._resources).toBe(publishedResources);
    for (const resource of publishedResourceValues) {
      expect(resource.isDestroyed()).withContext(resource._id).toBe(false);
    }
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
    effects.showClouds = false;
    effects.update(scene, scene.frameState.time);
    expect(effects._pipeline._showClouds).toBe(false);
    expect(effects._pipeline._uniformMap.u_showClouds()).toBe(false);
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 1000.0),
      orientation: {
        direction: Cartesian3.UNIT_Z,
        up: Cartesian3.UNIT_Y,
      },
    });
    let capturedColorTexture;
    let capturedDepthTexture;
    const executeHdr = effects._pipeline.executeHdr;
    effects._pipeline.executeHdr = function (
      context,
      colorTexture,
      depthTexture,
      idTexture,
    ) {
      capturedColorTexture = colorTexture;
      capturedDepthTexture = depthTexture;
      return executeHdr.call(
        this,
        context,
        colorTexture,
        depthTexture,
        idTexture,
      );
    };
    for (const logarithmicDepth of [false, true]) {
      scene.logarithmicDepthBuffer = logarithmicDepth;
      scene.renderForSpecs();
      effects.showAerialPerspective = false;
      scene.renderForSpecs();
      scene.renderForSpecs();
      const clearDepthWithoutAerial = Array.from(
        scene.context.readPixels({ width: 1, height: 1 }),
      );
      const disabledInputColor = readHalfTexturePixel(
        capturedColorTexture,
        0,
        0,
      );
      const disabledDepthEvidence = readResolvedDepthEvidence(
        capturedDepthTexture,
        scene.frameState.useLogDepth,
      )[0];
      effects.showAerialPerspective = true;
      scene.renderForSpecs();
      scene.renderForSpecs();
      const clearDepthWithAerial = Array.from(
        scene.context.readPixels({ width: 1, height: 1 }),
      );
      const enabledInputColor = readHalfTexturePixel(
        capturedColorTexture,
        0,
        0,
      );
      const enabledDepthEvidence = readResolvedDepthEvidence(
        capturedDepthTexture,
        scene.frameState.useLogDepth,
      )[0];
      const selectedProgram =
        effects._pipeline._resources.aerialCommand.shaderProgram;
      const diagnostic = {
        logarithmicDepth,
        useLogDepth: scene.frameState.useLogDepth,
        selectedProgram:
          selectedProgram === effects._pipeline._resources.aerialLogDepthProgram
            ? "log"
            : selectedProgram === effects._pipeline._resources.aerialProgram
              ? "linear"
              : "foreign",
        showClouds: effects._pipeline._uniformMap.u_showClouds(),
        showAerialPerspective:
          effects._pipeline._uniformMap.u_showAerialPerspective(),
        disabledDepthEvidence,
        enabledDepthEvidence,
        disabledInputColor,
        enabledInputColor,
        inputPixel: clearDepthWithoutAerial,
        outputPixel: clearDepthWithAerial,
      };
      expect(clearDepthWithAerial)
        .withContext(JSON.stringify(diagnostic))
        .toEqual(clearDepthWithoutAerial);
    }
    effects._pipeline.executeHdr = executeHdr;

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
    let capturedDepthTexture;
    const executeHdr = effects._pipeline.executeHdr;
    effects._pipeline.executeHdr = function (
      context,
      colorTexture,
      depthTexture,
      idTexture,
    ) {
      capturedDepthTexture = depthTexture;
      return executeHdr.call(
        this,
        context,
        colorTexture,
        depthTexture,
        idTexture,
      );
    };
    const depthPrimitive = scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(150000.0, 150000.0, 100000.0),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              Color.fromBytes(80, 96, 112, 255),
            ),
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
    try {
      for (const projection of ["perspective", "orthographic"]) {
        if (projection === "perspective") {
          scene.camera.switchToPerspectiveFrustum();
        } else {
          scene.camera.switchToOrthographicFrustum();
          scene.camera.frustum.width = 200000.0;
        }
        scene.camera.frustum.near = projection === "perspective" ? 0.5 : 1.0;
        scene.camera.frustum.far = 1000000.0;
        scene.camera.setView({
          destination: new Cartesian3(0.0, 0.0, 120000.0),
          orientation: { direction, up },
        });
        for (const logarithmicDepth of [false, true]) {
          depthPrimitive.modelMatrix = Matrix4.fromTranslation(
            new Cartesian3(
              0.0,
              projection === "perspective" && logarithmicDepth
                ? 650000.0
                : 120000.0,
              0.0,
            ),
            new Matrix4(),
          );
          scene.logarithmicDepthBuffer = logarithmicDepth;
          effects.showAerialPerspective = false;
          scene.render();
          const identity = readFramePixels();
          const depthEvidence = readResolvedDepthEvidence(
            capturedDepthTexture,
            scene.frameState.useLogDepth,
          );
          const geometryDepth = depthEvidence.filter((pixel) => pixel[3] > 0.5);
          const depthReport = JSON.stringify({
            rawZero: depthEvidence.filter((pixel) => pixel[0] > 60000.0).length,
            rawOne: depthEvidence.filter((pixel) => pixel[0] === 0.0).length,
            finite: geometryDepth.length,
          });
          if (projection === "perspective" && logarithmicDepth) {
            expect(geometryDepth.length)
              .withContext(
                `${projection} logarithmicDepth=${logarithmicDepth} geometry depth ${depthReport}`,
              )
              .toBeGreaterThan(16);
          }
          for (const pixel of geometryDepth) {
            expect(Number.isFinite(pixel[2])).toBe(true);
            expect(pixel[2]).toBeGreaterThan(0.0);
          }
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
    } finally {
      effects._pipeline.executeHdr = executeHdr;
    }
  });

  it("renders every far opaque Globe pixel through linear and log aerial variants", async function () {
    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    effects.showClouds = false;
    effects.showAtmosphere = false;
    effects.showAerialPerspective = false;
    effects.showHeightFog = false;
    effects.aerialRadianceScale = 10.0;
    scene.globe.show = false;
    scene.canvas.width = 64;
    scene.canvas.height = 64;
    let capturedDepthTexture;
    const executeHdr = effects._pipeline.executeHdr;
    effects._pipeline.executeHdr = function (
      context,
      colorTexture,
      depthTexture,
      idTexture,
    ) {
      capturedDepthTexture = depthTexture;
      return executeHdr.call(
        this,
        context,
        colorTexture,
        depthTexture,
        idTexture,
      );
    };

    const anchor = Cartesian3.fromDegrees(-75.0, 40.0, 0.0);
    const localFrame = Transforms.eastNorthUpToFixedFrame(anchor);
    const modelMatrix = Matrix4.multiply(
      localFrame,
      Matrix4.fromTranslation(
        new Cartesian3(0.0, 250000.0, 0.0),
        new Matrix4(),
      ),
      new Matrix4(),
    );
    scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(120000.0, 50000.0, 120000.0),
            vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
          }),
          modelMatrix,
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(
              Color.fromBytes(80, 96, 112, 255),
            ),
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

    const localDirection = Cartesian3.normalize(
      new Cartesian3(0.0, 0.9, -0.43),
      new Cartesian3(),
    );
    const localUp = Cartesian3.normalize(
      new Cartesian3(0.0, 0.43, 0.9),
      new Cartesian3(),
    );
    const direction = Cartesian3.normalize(
      Matrix4.multiplyByPointAsVector(
        localFrame,
        localDirection,
        new Cartesian3(),
      ),
      new Cartesian3(),
    );
    const up = Cartesian3.normalize(
      Matrix4.multiplyByPointAsVector(localFrame, localUp, new Cartesian3()),
      new Cartesian3(),
    );
    scene.camera.switchToPerspectiveFrustum();
    scene.camera.frustum.near = 1.0;
    scene.camera.frustum.far = 1000000.0;
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(-75.0, 40.0, 120000.0),
      orientation: { direction, up },
    });

    try {
      for (const logarithmicDepth of [false, true]) {
        scene.logarithmicDepthBuffer = logarithmicDepth;
        scene.render();
        const identity = readFramePixels();
        const depthEvidence = readResolvedDepthEvidence(
          capturedDepthTexture,
          scene.frameState.useLogDepth,
        );
        const geometryDepth = depthEvidence.filter((pixel) => pixel[3] > 0.5);
        expect(geometryDepth.length)
          .withContext(`globe logarithmicDepth=${logarithmicDepth} depth`)
          .toBeGreaterThan(16);
        for (const pixel of geometryDepth) {
          expect(Number.isFinite(pixel[2])).toBe(true);
          expect(pixel[2]).toBeGreaterThan(0.0);
        }
        effects.showAerialPerspective = true;
        scene.render();
        const aerial = readFramePixels();
        effects.showAerialPerspective = false;
        effects.showHeightFog = true;
        scene.render();
        const fogOnly = readFramePixels();
        const context = `globe logarithmicDepth=${logarithmicDepth}`;
        expect(maximumRgbDelta(aerial, identity))
          .withContext(`${context} aerial`)
          .toBeGreaterThan(0);
        expect(maximumRgbDelta(fogOnly, identity))
          .withContext(`${context} fog`)
          .toBeGreaterThan(0);
        expect(effects._pipeline._resources.aerialCommand.shaderProgram).toBe(
          scene.frameState.useLogDepth
            ? effects._pipeline._resources.aerialLogDepthProgram
            : effects._pipeline._resources.aerialProgram,
        );
        effects.showHeightFog = false;
      }
    } finally {
      effects._pipeline.executeHdr = executeHdr;
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
    const requests = Array.from({ length: 8 }, createDeferred);
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
    requests.slice(1).forEach(function (request) {
      request.resolve(new ArrayBuffer(0));
    });
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
