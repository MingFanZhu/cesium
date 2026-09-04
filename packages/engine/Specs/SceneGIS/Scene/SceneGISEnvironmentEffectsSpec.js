import {
  BoxGeometry,
  BoundingRectangle,
  Cartesian2,
  Cartesian3,
  ClearCommand,
  Color,
  ColorGeometryInstanceAttribute,
  DirectionalLight,
  Ellipsoid,
  Framebuffer,
  GeometryInstance,
  Globe,
  JulianDate,
  Matrix3,
  Matrix4,
  Math as CesiumMath,
  Model,
  Moon,
  PassState,
  PerInstanceColorAppearance,
  PixelDatatype,
  PixelFormat,
  Primitive,
  Resource,
  Sampler,
  SceneTransforms,
  SceneGISEnvironmentEffects,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarEnvironment,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  ShadowMode,
  Texture,
  TextureMagnificationFilter,
  Transforms,
  Simon1994PlanetaryPositions,
  SunLight,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";
import Buffer from "../../../Source/Renderer/Buffer.js";
import ShaderProgram from "../../../Source/Renderer/ShaderProgram.js";
import ShaderSource from "../../../Source/Renderer/ShaderSource.js";
import TextureWrap from "../../../Source/Renderer/TextureWrap.js";
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
import cloudShadowFragmentSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadowFS.js";
import cloudShadowSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadows.js";
import cloudShadowResolveSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadowResolveFS.js";
import globeSurfaceLightingSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeSurfaceLighting.js";
import heightFogSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISExponentialHeightFog.js";
import globeCloudSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISGlobeClouds.js";
import cloudSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISVolumetricClouds.js";

const globeShapeDetailLodMutationSource = globeCloudSource
  .replace(
    /float shape = texture\([\s\S]*?SCENEGIS_GLOBE_CLOUD_SHAPE_SCALE\)\.r;/,
    `float shape = textureLod(
        shapeTexture,
        shapePosition / SCENEGIS_GLOBE_CLOUD_SHAPE_SCALE,
        materialMipLevel + 2.0).r;`,
  )
  .replace(
    /float detail = texture\([\s\S]*?SCENEGIS_GLOBE_CLOUD_DETAIL_SCALE\)\.r;/,
    `float detail = textureLod(
            detailTexture,
            (globePosition + turbulence) / SCENEGIS_GLOBE_CLOUD_DETAIL_SCALE,
            materialMipLevel + 2.0).r;`,
  );

const cloudShadowTestSource = `
const float SCENEGIS_BOTTOM_RADIUS = 6360000.0;
${cloudShadowSource}`;

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
    #ifdef SCENEGIS_READABLE_NIGHT_PROBE
    vec3 sunDirection = vec3(-1.0, 0.0, 0.0);
    #else
    vec3 sunDirection = vec3(0.0, 0.0, 1.0);
    #endif
    vec3 actualSunDirection = sunDirection;
    vec3 primaryLightDirection = sunDirection;
    vec3 primaryLightScale = vec3(1.0);
    #ifdef SCENEGIS_PRIMARY_MOON_PROBE
    actualSunDirection = vec3(0.0, 0.0, -1.0);
    primaryLightDirection = vec3(0.0, 0.0, 1.0);
    primaryLightScale = vec3(
        0.12 / 1.474,
        0.16 / 1.8504,
        0.22 / 1.91198);
    #endif
    #ifdef SCENEGIS_ZERO_PRIMARY_LIGHT_PROBE
    primaryLightScale = vec3(0.0);
    #endif
    vec3 sampleLocal = vec3(
        0.0,
        0.0,
        u_baseHeight + u_cloudBaseHeight +
            SCENEGIS_CLOUD_PROBE_HEIGHT_FRACTION * u_cloudThickness);
    vec3 sampleGlobePosition = vec3(
        SCENEGIS_BOTTOM_RADIUS + sampleLocal.z,
        0.0,
        0.0);
    vec3 atmosphereSun;
    vec3 skyIrradiance;
    sceneGISCloudIncidentIrradiance(
        u_transmittanceTexture,
        u_irradianceTexture,
        sampleLocal,
        sampleGlobePosition,
        actualSunDirection,
        primaryLightDirection,
        primaryLightScale,
        atmosphereSun,
        skyIrradiance);
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
        u_transmittanceTexture,
        u_irradianceTexture,
        sampleLocal,
        sampleGlobePosition,
        localRayDirection,
        primaryLightDirection,
        primaryLightDirection,
        actualSunDirection,
        primaryLightScale,
        atmosphereSun,
        skyIrradiance,
        SCENEGIS_CLOUD_PROBE_OPTICAL_DEPTH,
        80.0,
        1.0,
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
    out_FragData_1 = vec4(skyIrradiance, 1.0);
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
uniform sampler2D u_cloudTurbulenceTexture;
uniform float u_cloudBaseHeight;
uniform float u_cloudThickness;
uniform float u_cloudCoverage;
uniform float u_cloudDensity;
uniform int u_cloudPreset;
#ifndef SCENEGIS_GLOBE_REFERENCE_HEIGHT_OFFSET
#define SCENEGIS_GLOBE_REFERENCE_HEIGHT_OFFSET 800.0
#endif
void main()
{
    vec3 sampleLocal = vec3(
        0.0,
        0.0,
        u_cloudBaseHeight + SCENEGIS_GLOBE_REFERENCE_HEIGHT_OFFSET);
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
        0.0,
        0.5,
        heightGradient);
    float opticalDepth = density * u_cloudDensity;
    float transmittance = exp(-opticalDepth);
    vec3 sunDirection = vec3(0.0, 0.0, 1.0);
    #ifdef SCENEGIS_GLOBE_REFERENCE_SECONDARY
    float coveredDistance;
    float secondaryOpticalDepth = sceneGISGlobeCloudLocalSunOpticalDepth(
        u_cloudShapeTexture,
        u_cloudDetailTexture,
        u_cloudWeatherTexture,
        u_cloudTurbulenceTexture,
        sampleLocal,
        vec3(SCENEGIS_BOTTOM_RADIUS, 0.0, 0.0),
        vec3(0.0, 1.0, 0.0),
        vec3(0.0, 0.0, 1.0),
        vec3(1.0, 0.0, 0.0),
        vec3(0.0),
        vec3(SCENEGIS_BOTTOM_RADIUS),
        vec2(0.0),
        sunDirection,
        vec2(0.0),
        u_cloudBaseHeight,
        u_cloudThickness,
        u_cloudCoverage,
        u_cloudDensity,
        u_cloudPreset,
        4,
        0.0,
        0.0,
        0.5,
        coveredDistance);
    out_FragData_0 = vec4(
        secondaryOpticalDepth,
        coveredDistance,
        exp(-secondaryOpticalDepth),
        1.0);
    out_FragData_1 = vec4(0.0);
    return;
    #endif
    vec3 sunIncident;
    vec3 skyIrradiance;
    sceneGISCloudIncidentIrradiance(
        u_transmittanceTexture,
        u_irradianceTexture,
        sampleLocal,
        globePosition,
        sunDirection,
        sunDirection,
        vec3(1.0),
        sunIncident,
        skyIrradiance);
    vec3 solar;
    vec3 sky;
    float powder;
    vec3 total;
    sceneGISCloudLightingComponents(
        u_transmittanceTexture,
        u_irradianceTexture,
        sampleLocal,
        globePosition,
        vec3(1.0, 0.0, 0.0),
        sunDirection,
        sunDirection,
        sunDirection,
        vec3(1.0),
        sunIncident,
        skyIrradiance,
        opticalDepth,
        0.25,
        u_cloudCoverage,
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

  function connectGlobeWithDeferredAssets(reusePendingRequests = false) {
    scene = createScene();
    scene.globe = new Globe(Ellipsoid.WGS84);
    hideNativeEnvironment(scene);
    scene.highDynamicRange = true;
    const requests = Array.from({ length: 8 }, createDeferred);
    let requestIndex = 0;
    spyOn(Resource, "fetchArrayBuffer").and.callFake(function () {
      const request = requests[requestIndex++];
      if (request !== undefined) {
        return request.promise;
      }
      return reusePendingRequests
        ? requests[requestIndex % requests.length].promise
        : request.promise;
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

  function createLutBuffers(mode = "planar") {
    const globe = mode === "globe";
    return {
      transmittance: new ArrayBuffer(256 * 64 * 4 * 2),
      scattering: new ArrayBuffer(256 * 128 * 32 * 4 * 2),
      irradiance: new ArrayBuffer(64 * 16 * 4 * 2),
      cloudShape: new ArrayBuffer(128 * 128 * 128 * (globe ? 1 : 4)),
      cloudDetail: new ArrayBuffer(
        (globe ? 32 * 32 * 32 : 64 * 64 * 64) * (globe ? 1 : 4),
      ),
      cloudWeather: new ArrayBuffer((globe ? 512 * 512 : 256 * 256) * 4),
      cloudTurbulence: new ArrayBuffer(
        globe ? 128 * 128 * 4 : 64 * 64 * 64 * 4,
      ),
      cloudStbn: new ArrayBuffer(128 * 128 * 64),
    };
  }

  function createThinCloudBuffers(mode) {
    const buffers = createLutBuffers(mode);
    const channels = mode === "globe" ? 1 : 4;
    const shape = new Uint8Array(buffers.cloudShape);
    for (let z = 0; z < 128; z++) {
      for (let y = 0; y < 128; y++) {
        if (y % 20 >= 8) {
          continue;
        }
        for (let x = 0; x < 128; x++) {
          const offset = ((z * 128 + y) * 128 + x) * channels;
          shape.fill(255, offset, offset + channels);
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
    const height = options.height ?? 1;
    const texture = new Texture({
      context: scene.context,
      width,
      height,
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
    passState.viewport = new BoundingRectangle(0, 0, width, height);
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
    const fillTexture = function (texture, kind) {
      const depth = texture.depth ?? 1;
      const channels = texture.pixelFormat === PixelFormat.RED ? 1 : 4;
      const values = new Uint8Array(
        texture.width * texture.height * depth * channels,
      );
      for (let z = 0; z < depth; z++) {
        for (let y = 0; y < texture.height; y++) {
          for (let x = 0; x < texture.width; x++) {
            const offset =
              ((z * texture.height + y) * texture.width + x) * channels;
            const value = ramp
              ? Math.round(96 + (159 * x) / Math.max(texture.width - 1, 1))
              : kind === "turbulence"
                ? 128
                : 255;
            values.fill(value, offset, offset + channels);
          }
        }
      }
      const source = {
        width: texture.width,
        height: texture.height,
        arrayBufferView: values,
      };
      if (texture.depth !== undefined) {
        source.depth = texture.depth;
      }
      texture.copyFrom({
        source,
      });
      texture.generateMipmap();
    };
    fillTexture(resources.cloudShapeTexture, "shape");
    installSolidCloudOccupancy();
    fillTexture(resources.cloudDetailTexture, "detail");
    fillTexture(resources.cloudTurbulenceTexture, "turbulence");
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

  function installMipSensitiveGlobeCloudTextures() {
    const resources = effects._pipeline._resources;
    const fillVolume = function (texture, blockSize, invert) {
      const values = new Uint8Array(
        texture.width * texture.height * texture.depth,
      );
      for (let z = 0; z < texture.depth; z++) {
        for (let y = 0; y < texture.height; y++) {
          for (let x = 0; x < texture.width; x++) {
            const high =
              (Math.floor(x / blockSize) +
                Math.floor(y / blockSize) +
                Math.floor(z / blockSize)) %
                2 ===
              0;
            values[(z * texture.height + y) * texture.width + x] =
              high !== invert ? 255 : 32;
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
    fillVolume(resources.cloudShapeTexture, 4, false);
    fillVolume(resources.cloudDetailTexture, 2, true);
    installSolidCloudOccupancy();
    installCloudWeatherRamp();
    installFixedCloudStbn();
  }

  function createMipWitnessTexture(mipmapped, invert) {
    const resources = effects._pipeline._resources;
    const size = 8;
    const base = new Uint8Array(size * size * size * 4);
    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const high =
            (Math.floor(x / 2) + Math.floor(y / 2) + Math.floor(z / 2)) % 2 ===
            0;
          const value = high !== invert ? 255 : 32;
          base.fill(
            value,
            ((z * size + y) * size + x) * 4,
            ((z * size + y) * size + x + 1) * 4,
          );
        }
      }
    }
    const mipLevels = [];
    for (const levelSize of [4, 2, 1]) {
      mipLevels.push(
        new Uint8Array(levelSize * levelSize * levelSize * 4).fill(96),
      );
    }
    const RuntimeTexture3D = resources.cloudShapeTexture.constructor;
    return new RuntimeTexture3D({
      context: scene.context,
      width: size,
      height: size,
      depth: size,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      source: mipmapped
        ? { arrayBufferView: base, mipLevels }
        : { arrayBufferView: base },
      sampler: new Sampler({
        wrapS: TextureWrap.REPEAT,
        wrapT: TextureWrap.REPEAT,
        wrapR: TextureWrap.REPEAT,
        minificationFilter: mipmapped
          ? TextureMinificationFilter.LINEAR_MIPMAP_LINEAR
          : TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR,
      }),
      flipY: false,
    });
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
      // Keep the controlled fixture's historical 1500-6000 m shell explicit.
      // The product Globe default follows the pinned reference at 750 m.
      cloudBaseHeight: 1500.0,
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
    cameraHeight = 1000.0,
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
      const destination = Cartesian3.fromDegrees(
        longitude,
        latitude,
        cameraHeight,
      );
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
        destination: new Cartesian3(phase.x, phase.y, cameraHeight),
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
    effects._pipeline._uniformMap.u_primaryLightDirection = () =>
      effects._pipeline._frame.vertical;
    effects._pipeline._uniformMap.u_primaryLightScale = () => Cartesian3.ONE;
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
      ...(sample.readableNight ? ["SCENEGIS_READABLE_NIGHT_PROBE"] : []),
      ...(sample.primaryMoon ? ["SCENEGIS_PRIMARY_MOON_PROBE"] : []),
      ...(sample.zeroPrimaryLight ? ["SCENEGIS_ZERO_PRIMARY_LIGHT_PROBE"] : []),
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

  function renderGlobeCloudReferenceProbe(
    components,
    heightOffset = 800.0,
    globeCloudLibrarySource = globeCloudSource,
    cloudLibrarySource = cloudSource,
    secondary = false,
  ) {
    const resources = effects._pipeline._resources;
    const originalLinear = resources.cloudProgram;
    const originalLogarithmic = resources.cloudLogDepthProgram;
    const program = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      globeCloudReferenceFragmentSource,
      true,
      [
        ...(components ? ["SCENEGIS_GLOBE_REFERENCE_COMPONENTS"] : []),
        ...(secondary ? ["SCENEGIS_GLOBE_REFERENCE_SECONDARY"] : []),
        `SCENEGIS_GLOBE_REFERENCE_HEIGHT_OFFSET ${heightOffset.toFixed(1)}`,
      ],
      cloudLibrarySource,
      globeCloudLibrarySource,
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
      "bloomIntensity",
      "lensFlareIntensity",
      "moonlightIntensity",
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
      cloudDensity: [0.0, 64.0],
      cloudBaseHeight: [-500.0, 20000.0],
      cloudThickness: [0.0, 20000.0],
      cloudWindDirection: [-Math.PI, Math.PI],
      cloudWindSpeed: [0.0, 200.0],
      cloudTime: [-1000000000.0, 1000000000.0],
      cloudRadianceScale: [0.0, 64.0],
      bloomThreshold: [0.0, 65504.0],
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
    expect(effects.showBloom).toBe(true);
    expect(effects.showLensFlare).toBe(true);
    expect(effects.showMoonlight).toBe(true);
    expect(effects.showMoonShadows).toBe(true);
    expect(effects.moonlightIntensity).toBe(1.0);
    expect(effects.cloudQuality).toBe("high");
    expect(effects.cloudPreset).toBe("cumulus");
    expect(effects.cloudCoverage).toBe(0.3);
    expect(effects.cloudDensity).toBe(1.0);
    expect(effects.cloudBaseHeight).toBe(750.0);
    expect(effects.cloudThickness).toBe(4500.0);
    expect(effects.cloudWindDirection).toBe(0.785398);
    expect(effects.cloudWindSpeed).toBe(20.0);
    expect(effects.cloudTime).toBe(0.0);
    expect(effects.cloudRadianceScale).toBe(1.0);
    expect(effects.backgroundRadianceScale).toBe(4.0);
    expect(effects.aerialRadianceScale).toBe(1.0);
    expect(effects.surfaceRadianceScale).toBe(10.0);
    expect(effects.bloomThreshold).toBe(10.0);
    expect(effects.bloomIntensity).toBe(0.05);
    expect(effects.lensFlareIntensity).toBe(5.0);
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
      showBloom: false,
      showLensFlare: false,
      showMoonlight: false,
      showMoonShadows: false,
      moonlightIntensity: 2.0,
      bloomThreshold: 12.0,
      bloomIntensity: 0.1,
      lensFlareIntensity: 2.0,
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
    expect(effects.showBloom).toBe(false);
    expect(effects.showLensFlare).toBe(false);
    expect(effects.showMoonlight).toBe(false);
    expect(effects.showMoonShadows).toBe(false);
    expect(effects.moonlightIntensity).toBe(2.0);
    expect(effects.bloomThreshold).toBe(12.0);
    expect(effects.bloomIntensity).toBe(0.1);
    expect(effects.lensFlareIntensity).toBe(2.0);
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
        cloudShadowTestSource,
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
            globeRayOrigin + globeRayDirection * viewDistance;
        float opticalDepth = sceneGISCloudShadowRawOpticalDepth(
            midpoint,
            viewDistance * viewProjection);
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
            globeRayOrigin + globeRayDirection * viewDistance;
        float opticalDepth = sceneGISCloudShadowOpticalDepth(
            midpoint,
            viewDistance * viewProjection);
        shadowLength +=
            (1.0 - exp(-min(opticalDepth, 80.0))) * intervalLength;
    }`,
    );
    expect(filteredUniformMutationSource).not.toBe(cloudSource);
    const fragment = `precision highp float;
      void main() {
        vec3 origin = vec3(0.0, 0.0, 20000.0);
        vec3 direction = vec3(0.0, 0.0, 1.0);
        vec3 globeOrigin = vec3(SCENEGIS_BOTTOM_RADIUS + 20000.0, 0.0, 0.0);
        vec3 globeDirection = vec3(1.0, 0.0, 0.0);
        float cloudStart;
        float cloudEnd;
        bool cloudHit = sceneGISCloudSegment(
          origin, direction, 10000.0, 1500.0, 4500.0,
          cloudStart, cloudEnd);
        float shadowStart;
        float shadowEnd;
        bool shadowHit = sceneGISCloudShadowViewSegment(
          globeOrigin, globeDirection, 10000.0, shadowStart, shadowEnd);
        float shadowLength = sceneGISCloudShadowViewLength(
          origin,
          direction,
          vec3(SCENEGIS_BOTTOM_RADIUS, 0.0, 0.0),
          vec3(0.0, 1.0, 0.0),
          vec3(0.0, 0.0, 1.0),
          vec3(1.0, 0.0, 0.0),
          vec3(0.0),
          vec3(SCENEGIS_BOTTOM_RADIUS),
          globeDirection,
          10000.0);
        float rawOpticalDepth = sceneGISCloudShadowRawOpticalDepth(
          globeOrigin + globeDirection * 25.0, 25.0);
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
      0.5,
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
    const doubleWeightedHazeAerialSource = aerialFragmentSource.replace(
      `        sceneLinearRadiance =
            sceneLinearRadiance * (1.0 - cloudHaze.a) +
            cloudHaze.rgb * globeAtmosphereRadianceScale;`,
      `        sceneLinearRadiance = mix(
            sceneLinearRadiance,
            cloudHaze.rgb * globeAtmosphereRadianceScale,
            cloudHaze.a);`,
    );
    expect(doubleWeightedHazeAerialSource).not.toBe(aerialFragmentSource);
    const unscaledHazeAerialSource = aerialFragmentSource.replace(
      "cloudHaze.rgb * globeAtmosphereRadianceScale",
      "cloudHaze.rgb",
    );
    expect(unscaledHazeAerialSource).not.toBe(aerialFragmentSource);
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
            u_frustum: () => ({ x: -1.0, y: 1.0, z: -1.0, w: 1.0 }),
            u_hasCurrentGlobeDepth: () => true,
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
      const doubleWeightedIntegratedHazeZero = renderAerial({
        aerialSource: doubleWeightedHazeAerialSource,
        showAerialPerspective: false,
        showHeightFog: false,
      });
      const unscaledIntegratedHazeZero = renderAerial({
        aerialSource: unscaledHazeAerialSource,
        showAerialPerspective: false,
        showHeightFog: false,
      });
      const hazeDomainZero = renderAerial({
        showAerialPerspective: false,
        showHeightFog: false,
        backgroundScale: 0.0,
      });
      const hazeDomainOne = renderAerial({
        showAerialPerspective: false,
        showHeightFog: false,
        backgroundScale: 1.0,
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
        expect(integratedHazeZero[channel]).toBeGreaterThan(
          doubleWeightedIntegratedHazeZero[channel],
        );
        expect(integratedHazeZero[channel]).toBeGreaterThan(
          unscaledIntegratedHazeZero[channel],
        );
        expect(
          integratedHazeZero[channel] - hazeDomainZero[channel],
        ).toEqualEpsilon(
          10.0 * (hazeDomainOne[channel] - hazeDomainZero[channel]),
          0.02,
        );
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

  it("fades producer-covered Beer cascades in transmittance space on the actual GPU", function () {
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
    const globeSurface = new Cartesian3(6360000.0, 0.0, 0.0);
    const globeSurfaceToOrigin = Matrix4.fromTranslation(
      Cartesian3.negate(globeSurface, new Cartesian3()),
    );
    const matrices = [
      Matrix4.clone(globeSurfaceToOrigin),
      Matrix4.clone(globeSurfaceToOrigin),
      Matrix4.clone(globeSurfaceToOrigin),
    ];
    const intervals = [
      new Cartesian2(0.0, 100.0),
      new Cartesian2(100.0, 200.0),
      new Cartesian2(0.0, 0.0),
    ];
    const hardCascadeLibrary = cloudShadowSource.replace(
      /void sceneGISCloudShadowCascadeTransition\([\s\S]*?\n\}/,
      `void sceneGISCloudShadowCascadeTransition(
    float viewDistance,
    out int firstCascade,
    out int secondCascade,
    out float secondWeight)
{
    firstCascade = sceneGISCloudShadowCascade(viewDistance);
    secondCascade = -1;
    secondWeight = 0.0;
}`,
    );
    expect(hardCascadeLibrary).not.toBe(cloudShadowSource);
    const hardCascadeTestSource = `
const float SCENEGIS_BOTTOM_RADIUS = 6360000.0;
${hardCascadeLibrary}`;
    const distances = [90.0, 99.9, 100.1, 110.0];
    const fadeHalfWidth = 12.5;
    const expectedOpticalDepth = function (viewDistance) {
      const weight = CesiumMath.clamp(
        (viewDistance - (100.0 - fadeHalfWidth)) / (2.0 * fadeHalfWidth),
        0.0,
        1.0,
      );
      return -Math.log(
        (1.0 - weight) * Math.exp(-1.0) + weight * Math.exp(-2.0),
      );
    };
    const fragmentSource = `precision highp float;
          void main() {
            vec3 position = vec3(6360000.0, 0.0, 0.0);
            out_FragColor = vec4(
              sceneGISCloudShadowOpticalDepth(position, 90.0),
              sceneGISCloudShadowOpticalDepth(position, 99.9),
              sceneGISCloudShadowOpticalDepth(position, 100.1),
              sceneGISCloudShadowOpticalDepth(position, 110.0));
          }`;
    try {
      const uniformMap = {
        u_sceneGISCloudShadowAtlas: () => atlas,
        u_sceneGISCloudShadowMatrices: () => matrices,
        u_sceneGISCloudShadowIntervals: () => intervals,
        u_sceneGISCloudShadowCascadeCount: () => 2,
        u_sceneGISShadowSunDirection: () => Cartesian3.UNIT_X,
        u_sceneGISShadowCloudTop: () => 1010.0,
      };
      const pixel = executeHalfFloatQuad(
        [cloudShadowTestSource, fragmentSource],
        { uniformMap },
      )[0];
      const hardCascadePixel = executeHalfFloatQuad(
        [hardCascadeTestSource, fragmentSource],
        { uniformMap },
      )[0];
      for (let channel = 0; channel < distances.length; channel++) {
        expect(pixel[channel]).toEqualEpsilon(
          expectedOpticalDepth(distances[channel]),
          0.004,
        );
      }
      expect(pixel[2] - pixel[1]).toBeLessThan(0.01);
      expect(hardCascadePixel[2] - hardCascadePixel[1]).toBeGreaterThan(0.9);
    } finally {
      atlas.destroy();
    }
  });

  it("filters Globe cloud shadows in Beer space without crossing atlas tiles on the actual GPU", function () {
    scene = createScene();
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const atlasValues = new Uint16Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const inFirstTile = x < 8;
        const opticalDepth = inFirstTile ? (x < 4 ? 0.0 : 4.0) : 80.0;
        const values = [
          0.0,
          1.0,
          opticalDepth,
          opticalDepth > 0.0 && opticalDepth < 80.0 ? 0.5 : 0.0,
        ];
        const offset = (y * 16 + x) * 4;
        for (let channel = 0; channel < 4; channel++) {
          atlasValues[offset + channel] = encodeFloat16(values[channel]);
        }
      }
    }
    const atlas = new Texture({
      context: scene.context,
      width: 16,
      height: 16,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      source: {
        width: 16,
        height: 16,
        arrayBufferView: atlasValues,
      },
    });
    try {
      const pixels = executeHalfFloatQuad(
        [
          cloudShadowTestSource,
          `precision highp float;
          void main() {
            float x = gl_FragCoord.x < 1.5
              ? -0.75
              : (gl_FragCoord.x < 2.5 ? -0.4375 :
                (gl_FragCoord.x < 3.5 ? 0.0 :
                  (gl_FragCoord.x < 4.5 ? 0.4375 : 1.0)));
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
          width: 5,
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
      expect(pixels[0][1]).toEqualEpsilon(1.0, 0.001);
      expect(pixels[1][1]).toBeLessThan(1.0);
      expect(pixels[1][1]).toBeGreaterThan(pixels[2][1]);
      expect(pixels[2][1]).toBeGreaterThan(pixels[3][1]);
      expect(pixels[4][0]).toEqualEpsilon(4.5, 0.01);
      expect(pixels[4][1]).toEqualEpsilon(Math.exp(-4.5), 0.001);

      const globalSunHeightMutationSource = cloudShadowTestSource.replace(
        `float localSunElevation = dot(
        normalize(globePosition),
        normalize(u_sceneGISShadowSunDirection));`,
        "float localSunElevation = u_sceneGISShadowSunDirection.z;",
      );
      expect(globalSunHeightMutationSource).not.toBe(cloudShadowTestSource);
      const receiverElevationFragment = `precision highp float;
          void main() {
            vec3 highReceiver = vec3(0.0, 0.0, 1.0);
            vec3 lowReceiver = vec3(0.0, 1.0, 0.0);
            out_FragColor = vec4(
              sceneGISCloudBodyShadowCascadeOpticalDepth(
                highReceiver, 0, 0.0),
              sceneGISCloudBodyShadowCascadeOpticalDepth(
                lowReceiver, 0, 0.0),
              dot(normalize(highReceiver),
                normalize(u_sceneGISShadowSunDirection)),
              dot(normalize(lowReceiver),
                normalize(u_sceneGISShadowSunDirection)));
          }`;
      const receiverElevationUniformMap = {
        u_sceneGISCloudShadowAtlas: () => atlas,
        u_sceneGISCloudShadowMatrices: () => [
          Matrix4.IDENTITY,
          Matrix4.IDENTITY,
          Matrix4.IDENTITY,
        ],
        u_sceneGISShadowSunDirection: () =>
          Cartesian3.normalize(
            new Cartesian3(0.9799, 0.0, 0.2),
            new Cartesian3(),
          ),
        u_sceneGISShadowCloudTop: () => 100.0,
      };
      const receiverElevationPixel = executeHalfFloatQuad(
        [cloudShadowTestSource, receiverElevationFragment],
        { uniformMap: receiverElevationUniformMap },
      )[0];
      const globalSunHeightMutationPixel = executeHalfFloatQuad(
        [globalSunHeightMutationSource, receiverElevationFragment],
        { uniformMap: receiverElevationUniformMap },
      )[0];
      expect(receiverElevationPixel[2]).toBeGreaterThan(0.1);
      expect(receiverElevationPixel[3]).toBeLessThan(0.1);
      expect(receiverElevationPixel[0])
        .withContext("ordinary local Sun elevation selects raw BSM")
        .not.toBe(receiverElevationPixel[1]);
      expect(globalSunHeightMutationPixel[0])
        .withContext("global Sun-z mutation ignores receiver normal")
        .toBe(globalSunHeightMutationPixel[1]);

      const sunDirection = Cartesian3.normalize(
        new Cartesian3(0.9799, 0.0, 0.2),
        new Cartesian3(),
      );
      const bottomRadius = 6360000.0;
      const cloudTop = 6000.0;
      const globePosition = new Cartesian3(bottomRadius, 100000.0, 0.0);
      const projected = Cartesian3.dot(globePosition, sunDirection);
      const virtualRadiusSquared = Cartesian3.magnitudeSquared(globePosition);
      const topRadius = bottomRadius + cloudTop;
      const exactDistance =
        -projected +
        Math.sqrt(
          projected * projected - virtualRadiusSquared + topRadius * topRadius,
        );
      const planarDistance = cloudTop / sunDirection.z;
      const distancePixel = executeHalfFloatQuad(
        [
          cloudShadowTestSource,
          `precision highp float;
          void main() {
            vec3 position = vec3(6360000.0, 100000.0, 0.0);
            float exactDistance = sceneGISCloudShadowDistanceToTop(position);
            float planarDistance = u_sceneGISShadowCloudTop /
              max(u_sceneGISShadowSunDirection.z, 1.0e-3);
            out_FragColor = vec4(
              exactDistance,
              planarDistance,
              planarDistance - exactDistance,
              1.0) / 10000.0;
          }`,
        ],
        {
          uniformMap: {
            u_sceneGISShadowSunDirection: () => sunDirection,
            u_sceneGISShadowCloudTop: () => cloudTop,
          },
        },
      )[0];
      expect(distancePixel[0]).toEqualEpsilon(exactDistance / 10000.0, 0.004);
      expect(distancePixel[1]).toEqualEpsilon(planarDistance / 10000.0, 0.004);
      expect(distancePixel[2]).toBeGreaterThan(0.1);
    } finally {
      atlas.destroy();
    }
  });

  it("marches controlled cloud density into the bounded Beer atlas on the actual GPU", async function () {
    await connectControlledCloudMode("globe", function () {
      const callerMoon = new Moon();
      callerMoon.textureUrl = "caller-owned-moon.webp";
      scene.moon = callerMoon;
    });
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    scene.canvas.width = 64;
    scene.canvas.height = 64;
    installMipSensitiveGlobeCloudTextures();
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
    effects.cloudDensity = 0.001;
    scene.frameState.time = JulianDate.fromIso8601("2026-06-21T10:30:00Z");
    effects._pipeline._celestialFrameNumber = undefined;
    effects.update(scene, scene.frameState.time);
    const shadow = effects._pipeline._globeShadowResources;
    const execute = spyOn(shadow.command, "execute").and.callThrough();
    const resolve = spyOn(shadow.resolveCommand, "execute").and.callThrough();
    scene.renderForSpecs();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(shadow.historyValid).toBe(true);
    const texture = shadow.outputFramebuffer.getColorTexture(0);
    const atlasPixels = readHalfTexturePixels(texture);
    let firstIndex = -1;
    let firstX = -1;
    let firstY = -1;
    let closestCenterDistance = Number.POSITIVE_INFINITY;
    for (let y = 0; y < shadow.resolution; y++) {
      for (let x = 0; x < shadow.resolution; x++) {
        const index = y * texture.width + x;
        const centerDistance =
          (x + 0.5 - shadow.resolution * 0.5) ** 2 +
          (y + 0.5 - shadow.resolution * 0.5) ** 2;
        if (
          atlasPixels[index][2] > 0.0 &&
          centerDistance < closestCenterDistance
        ) {
          firstIndex = index;
          firstX = x;
          firstY = y;
          closestCenterDistance = centerDistance;
        }
      }
    }
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    const first = atlasPixels[firstIndex];
    expect(first.every(Number.isFinite)).toBe(true);
    expect(first[0]).toBeGreaterThanOrEqual(0.0);
    expect(first[0]).toBeLessThanOrEqual(1.0);
    expect(first[1]).toBeGreaterThan(0.0);
    expect(first[2]).toBeGreaterThan(0.0);
    expect(first[2]).toBeLessThanOrEqual(80.0);
    expect(first[3]).toBeGreaterThanOrEqual(0.0);
    expect(first[3]).toBeLessThanOrEqual(80.0);

    const shadowLayerAuthoritySource = globeCloudSource.match(
      /vec4 sceneGISGlobeCloudLayerDescriptor[\s\S]*?void sceneGISGlobeCloudShadowPresetSupport\([\s\S]*?\n\}/,
    )[0];
    const shadowSupports = executeHalfFloatQuad(
      [
        shadowLayerAuthoritySource,
        `precision highp float;
        void main() {
          int preset = int(gl_FragCoord.x - 0.5);
          float supportBase;
          float supportThickness;
          sceneGISGlobeCloudShadowPresetSupport(
            preset, 1500.0, 4500.0, supportBase, supportThickness);
          out_FragColor = vec4(
            supportBase,
            supportBase + supportThickness,
            supportThickness,
            float(supportThickness > 0.0));
        }`,
      ],
      { width: 4 },
    );
    expect(shadowSupports).toEqual([
      [1500.0, 2950.0, 1450.0, 1.0],
      [1750.0, 2950.0, 1200.0, 1.0],
      [1500.0, 1500.0, 0.0, 0.0],
      [1500.0, 2950.0, 1450.0, 1.0],
    ]);

    const temporalWidth = 4;
    const temporalHeight = 4;
    const createTemporalTexture = function (values, sampler) {
      const encoded = new Uint16Array(values.length);
      for (let index = 0; index < values.length; index++) {
        encoded[index] = encodeFloat16(values[index]);
      }
      return new Texture({
        context: scene.context,
        width: temporalWidth,
        height: temporalHeight,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        sampler,
        source: {
          width: temporalWidth,
          height: temporalHeight,
          arrayBufferView: encoded,
        },
      });
    };
    const currentValues = [];
    const depthVelocityValues = [];
    const historyValues = [];
    for (let pixel = 0; pixel < temporalWidth * temporalHeight; pixel++) {
      const x = pixel % temporalWidth;
      currentValues.push(1.0 + x, 0.25, 0.5, 0.0);
      depthVelocityValues.push(0.1, -0.5, 0.0, 1.0);
      historyValues.push(1.0 + x, 0.25, 0.5, 0.0);
    }
    const currentTexture = createTemporalTexture(currentValues);
    const depthVelocityTexture = createTemporalTexture(depthVelocityValues);
    const historyTexture = createTemporalTexture(
      historyValues,
      new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR,
      }),
    );
    const temporalUniformMap = {
      u_sceneGISCloudShadowCurrentTexture: () => currentTexture,
      u_sceneGISCloudShadowDepthVelocityTexture: () => depthVelocityTexture,
      u_sceneGISCloudShadowHistoryTexture: () => historyTexture,
      u_sceneGISCloudShadowResolution: () => 2.0,
      u_sceneGISCloudShadowCascadeCount: () => 1,
      u_sceneGISCloudShadowHistoryValid: () => true,
    };
    const nonTemporalMutationSource = cloudShadowResolveSource.replace(
      "out_FragColor = mix(history, current, 0.01);",
      "out_FragColor = current;",
    );
    expect(nonTemporalMutationSource).not.toBe(cloudShadowResolveSource);
    const temporalPixels = executeHalfFloatQuad([cloudShadowResolveSource], {
      width: temporalWidth,
      height: temporalHeight,
      uniformMap: temporalUniformMap,
    });
    const nonTemporalPixels = executeHalfFloatQuad(
      [nonTemporalMutationSource],
      {
        width: temporalWidth,
        height: temporalHeight,
        uniformMap: temporalUniformMap,
      },
    );
    const sameUvHistoryMutationSource = cloudShadowResolveSource.replace(
      `vec2 previousLocalUv = currentLocalUv -
        closest.gb / u_sceneGISCloudShadowResolution;`,
      "vec2 previousLocalUv = currentLocalUv;",
    );
    expect(sameUvHistoryMutationSource).not.toBe(cloudShadowResolveSource);
    const sameUvHistoryMutationPixels = executeHalfFloatQuad(
      [sameUvHistoryMutationSource],
      {
        width: temporalWidth,
        height: temporalHeight,
        uniformMap: temporalUniformMap,
      },
    );
    expect(temporalPixels[0][0])
      .withContext("reprojected neighborhood-clipped BSM history")
      .toBeGreaterThan(nonTemporalPixels[0][0]);
    expect(nonTemporalPixels[0][0]).toBe(1.0);
    expect(temporalPixels[2]).toEqual(nonTemporalPixels[2]);
    expect(
      sameUvHistoryMutationPixels.some(
        (pixel, index) => pixel[0] !== temporalPixels[index][0],
      ),
    )
      .withContext("same-UV BSM history mutation")
      .toBe(true);
    const publishedValues = temporalPixels.flat();
    const publishedHistoryTexture = createTemporalTexture(
      publishedValues,
      new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR,
      }),
    );
    temporalUniformMap.u_sceneGISCloudShadowHistoryTexture = () =>
      publishedHistoryTexture;
    const secondPublication = executeHalfFloatQuad([cloudShadowResolveSource], {
      width: temporalWidth,
      height: temporalHeight,
      uniformMap: temporalUniformMap,
    });
    expect(secondPublication[0][0]).toBeGreaterThan(nonTemporalPixels[0][0]);
    temporalUniformMap.u_sceneGISCloudShadowHistoryValid = () => false;
    const cutPublication = executeHalfFloatQuad([cloudShadowResolveSource], {
      width: temporalWidth,
      height: temporalHeight,
      uniformMap: temporalUniformMap,
    });
    expect(cutPublication).toEqual(nonTemporalPixels);

    const tileCurrentValues = [];
    const tileDepthVelocityValues = [];
    const tileHistoryValues = [];
    for (let pixel = 0; pixel < temporalWidth * temporalHeight; pixel++) {
      const x = pixel % temporalWidth;
      // Texture source rows are flipped by the renderer upload path. Repeat
      // the controlled horizontal tile boundary in both atlas rows so the
      // resolve assertion is independent of framebuffer row orientation.
      const firstTile = x < 2;
      tileCurrentValues.push(firstTile && x === 1 ? 80.0 : 0.0, 0.0, 0.0, 0.0);
      tileDepthVelocityValues.push(
        firstTile ? (x === 1 ? 0.01 : 0.1) : 1.0,
        firstTile && x === 1 ? -0.25 : 0.0,
        0.0,
        firstTile ? 1.0 : 0.0,
      );
      tileHistoryValues.push(firstTile ? 8.0 : 40.0, 0.0, 0.0, 0.0);
    }
    const tileCurrentTexture = createTemporalTexture(tileCurrentValues);
    const tileDepthVelocityTexture = createTemporalTexture(
      tileDepthVelocityValues,
    );
    const tileHistoryTexture = createTemporalTexture(
      tileHistoryValues,
      new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR,
      }),
    );
    const tileUniformMap = {
      ...temporalUniformMap,
      u_sceneGISCloudShadowCurrentTexture: () => tileCurrentTexture,
      u_sceneGISCloudShadowDepthVelocityTexture: () => tileDepthVelocityTexture,
      u_sceneGISCloudShadowHistoryTexture: () => tileHistoryTexture,
      u_sceneGISCloudShadowHistoryValid: () => true,
    };
    const tileCurrentPixels = readHalfTexturePixels(tileCurrentTexture);
    const tileDepthVelocityPixels = readHalfTexturePixels(
      tileDepthVelocityTexture,
    );
    expect(tileCurrentPixels[1][0]).toBe(80.0);
    expect(tileDepthVelocityPixels[1][3]).toBe(1.0);
    const unclampedTileMutation = cloudShadowResolveSource.replace(
      / {4}vec2 tileHalfTexel =[\s\S]*?vec2\(1\.0\) - tileHalfTexel\);\n/,
      "",
    );
    expect(unclampedTileMutation).not.toBe(cloudShadowResolveSource);
    const tileIsolated = executeHalfFloatQuad([cloudShadowResolveSource], {
      width: temporalWidth,
      height: temporalHeight,
      uniformMap: tileUniformMap,
    });
    const tileBleedMutation = executeHalfFloatQuad([unclampedTileMutation], {
      width: temporalWidth,
      height: temporalHeight,
      uniformMap: tileUniformMap,
    });
    expect(tileIsolated[1][0])
      .withContext(
        `history remains inside the selected atlas tile: ${JSON.stringify({
          isolated: tileIsolated[1],
          mutation: tileBleedMutation[1],
          current: tileCurrentPixels[1],
          depthVelocity: tileDepthVelocityPixels[1],
        })}`,
      )
      .toBeLessThan(tileBleedMutation[1][0]);
    currentTexture.destroy();
    depthVelocityTexture.destroy();
    historyTexture.destroy();
    publishedHistoryTexture.destroy();
    tileCurrentTexture.destroy();
    tileDepthVelocityTexture.destroy();
    tileHistoryTexture.destroy();

    const virtualCameraPosition = function () {
      const cameraPosition = effects._pipeline._frame.cameraPosition;
      const surface = Ellipsoid.WGS84.scaleToGeodeticSurface(
        cameraPosition,
        new Cartesian3(),
      );
      const normal = Ellipsoid.WGS84.geodeticSurfaceNormal(
        surface,
        new Cartesian3(),
      );
      const height = Cartesian3.dot(
        Cartesian3.subtract(cameraPosition, surface, new Cartesian3()),
        normal,
      );
      return Cartesian3.multiplyByScalar(
        normal,
        6360000.0 + height,
        new Cartesian3(),
      );
    };
    const receiverClipX = ((firstX + 0.5) / shadow.resolution) * 2.0 - 1.0;
    const receiverClipY = ((firstY + 0.5) / shadow.resolution) * 2.0 - 1.0;
    const producerRayOrigin = Matrix4.multiplyByPoint(
      effects._pipeline._shadowInverseMatrices[0],
      new Cartesian3(receiverClipX, receiverClipY, -1.0),
      new Cartesian3(),
    );
    const producerRayDirection = effects._pipeline._shadowRayDirectionWorld;
    const receiverQuadraticB =
      2.0 * Cartesian3.dot(producerRayOrigin, producerRayDirection);
    const receiverQuadraticC =
      Cartesian3.magnitudeSquared(producerRayOrigin) - 6360000.0 ** 2;
    const receiverDiscriminant =
      receiverQuadraticB * receiverQuadraticB - 4.0 * receiverQuadraticC;
    expect(receiverDiscriminant).toBeGreaterThanOrEqual(0.0);
    const receiverGroundDistance =
      (-receiverQuadraticB - Math.sqrt(receiverDiscriminant)) * 0.5;
    expect(receiverGroundDistance).toBeGreaterThan(0.0);
    const fixedReceiver = Cartesian3.add(
      producerRayOrigin,
      Cartesian3.multiplyByScalar(
        producerRayDirection,
        receiverGroundDistance,
        new Cartesian3(),
      ),
      new Cartesian3(),
    );
    const projectedReceiver = Matrix4.multiplyByPoint(
      effects._pipeline._shadowMatrices[0],
      fixedReceiver,
      new Cartesian3(),
    );
    expect(Math.abs(projectedReceiver.x)).toBeLessThanOrEqual(1.0);
    expect(Math.abs(projectedReceiver.y)).toBeLessThanOrEqual(1.0);
    const receiverViewDepth = function () {
      return Math.max(
        Cartesian3.dot(
          Cartesian3.subtract(
            fixedReceiver,
            virtualCameraPosition(),
            new Cartesian3(),
          ),
          effects._pipeline._frame.cameraDirection,
        ),
        0.0,
      );
    };
    const receiverFragmentSource = `precision highp float;
        uniform vec3 u_testReceiver;
        uniform float u_testViewDepth;
        uniform float u_testMutationViewDepth;
        uniform float u_testMutationEuclideanDepth;
        void main() {
          float opticalDepth = sceneGISCloudShadowOpticalDepth(
            u_testReceiver, u_testViewDepth);
          out_FragColor = vec4(
            opticalDepth,
            exp(-opticalDepth),
            float(sceneGISCloudShadowCascade(u_testViewDepth)),
            float(sceneGISCloudShadowCascade(u_testMutationEuclideanDepth)));
        }`;
    let receiverAtlasTexture = shadow.outputFramebuffer.getColorTexture(0);
    let receiverCloudTop =
      effects._pipeline._uniformMap.u_sceneGISShadowCloudTop();
    const receiverOverride = { value: undefined };
    const receiverViewDepthOverride = { value: undefined };
    const receiverUniformMap = {
      u_sceneGISCloudShadowAtlas: () => receiverAtlasTexture,
      u_sceneGISCloudShadowMatrices: () => effects._pipeline._shadowMatrices,
      u_sceneGISCloudShadowIntervals: () => effects._pipeline._shadowIntervals,
      u_sceneGISCloudShadowCascadeCount: () =>
        effects._pipeline._shadowCascadeCount,
      u_sceneGISShadowSunDirection: () =>
        effects._pipeline._primaryLightDirection,
      u_sceneGISPrimaryLightDirection: () =>
        effects._pipeline._primaryLightDirection,
      u_sceneGISActualSunDirection: () => effects._pipeline._sunDirection,
      u_sceneGISPrimaryLightScale: () => Cartesian3.ONE,
      u_sceneGISShadowCloudTop: () => receiverCloudTop,
      u_testReceiver: () => receiverOverride.value ?? fixedReceiver,
      u_testViewDepth: () =>
        receiverViewDepthOverride.value !== undefined
          ? receiverViewDepthOverride.value()
          : receiverViewDepth(),
      u_testMutationViewDepth: () =>
        effects._pipeline._shadowIntervals[0].y * 0.9,
      u_testMutationEuclideanDepth: () =>
        effects._pipeline._shadowIntervals[0].y * 1.8,
    };
    const receiverPixel = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverFragmentSource],
      {
        uniformMap: receiverUniformMap,
      },
    )[0];
    expect(receiverPixel.slice(0, 2).every(Number.isFinite)).toBe(true);
    expect(receiverPixel[2]).toBe(
      effects._pipeline._uniformMap.u_sceneGISCloudShadowCascadeCount() > 1 &&
        receiverViewDepth() > effects._pipeline._shadowIntervals[0].y
        ? 1.0
        : 0.0,
    );
    expect(receiverPixel[3])
      .withContext("Euclidean cascade selection mutation")
      .not.toBe(receiverPixel[2]);
    const originalReceiverOpticalDepth = receiverPixel[0];
    expect(originalReceiverOpticalDepth).toBeGreaterThan(0.0);
    const receiverWindow = SceneTransforms.worldToWindowCoordinates(
      scene,
      fixedReceiver,
      new Cartesian2(),
    );
    expect(receiverWindow.x).toBeGreaterThanOrEqual(0.0);
    expect(receiverWindow.x).toBeLessThanOrEqual(scene.canvas.clientWidth);
    expect(receiverWindow.y).toBeGreaterThanOrEqual(0.0);
    expect(receiverWindow.y).toBeLessThanOrEqual(scene.canvas.clientHeight);
    receiverAtlasTexture = shadow.currentFramebuffer.getColorTexture(0);
    const producerReceiverPixel = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverFragmentSource],
      { uniformMap: receiverUniformMap },
    )[0];
    receiverAtlasTexture = shadow.outputFramebuffer.getColorTexture(0);
    expect(producerReceiverPixel[0])
      .withContext("current-frame BSM producer reaches the fixed receiver")
      .toBeGreaterThan(0.0);
    const surfaceReceiverFragment = `precision highp float;
        uniform vec3 u_testReceiverEcef;
        uniform vec3 u_testReceiverNormal;
        void main() {
          out_FragColor = vec4(sceneGISGlobeSurfaceLighting(
            vec3(0.5),
            u_testReceiverEcef,
            u_testReceiverNormal), 1.0);
        }`;
    const surfaceReceiverDefines = [
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
    const surfaceReceiverUniformMap = {
      ...receiverUniformMap,
      u_sceneGISTransmittanceTexture: () =>
        effects._pipeline._resources.transmittanceTexture,
      u_sceneGISIrradianceTexture: () =>
        effects._pipeline._resources.irradianceTexture,
      u_sceneGISShowCloudShadows: () => true,
      u_surfaceRadianceScale: () => effects.surfaceRadianceScale,
      u_testReceiverEcef: () => surfaceReceiverEcef,
      u_testReceiverNormal: () => surfaceReceiverNormal,
    };
    const fixedReceiverNormal = Cartesian3.normalize(
      fixedReceiver,
      new Cartesian3(),
    );
    let surfaceReceiverEcef = Cartesian3.fromRadians(
      Math.atan2(fixedReceiverNormal.y, fixedReceiverNormal.x),
      Math.asin(fixedReceiverNormal.z),
      Cartesian3.magnitude(fixedReceiver) - 6360000.0,
      Ellipsoid.WGS84,
      new Cartesian3(),
    );
    let surfaceReceiverNormal = Ellipsoid.WGS84.geodeticSurfaceNormal(
      surfaceReceiverEcef,
      new Cartesian3(),
    );
    const renderSurfaceReceiver = function () {
      return executeHalfFloatQuad(
        [
          brunetonDefinitionsSource,
          brunetonCommonSource,
          brunetonRuntimeSource,
          atmosphereSource,
          cloudShadowSource,
          globeSurfaceLightingSource,
          surfaceReceiverFragment,
        ],
        {
          defines: surfaceReceiverDefines,
          uniformMap: surfaceReceiverUniformMap,
        },
      )[0];
    };
    receiverAtlasTexture = shadow.outputFramebuffer.getColorTexture(0);
    const originalSurfaceReceiver = renderSurfaceReceiver();
    const legacyReceiverCloudTop =
      effects._pipeline._frame.baseHeight +
      effects.cloudBaseHeight +
      effects.cloudThickness;
    receiverCloudTop = legacyReceiverCloudTop;
    const legacyOriginalReceiver = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverFragmentSource],
      { uniformMap: receiverUniformMap },
    )[0];
    const legacyOriginalSurfaceReceiver = renderSurfaceReceiver();
    receiverCloudTop = effects._pipeline._shadowCloudSupport.y;
    const wrongReceiverFragmentSource = receiverFragmentSource.replace(
      "u_testReceiver, u_testViewDepth",
      "u_testReceiver + vec3(50000.0, 0.0, 0.0), u_testViewDepth",
    );
    expect(wrongReceiverFragmentSource).not.toBe(receiverFragmentSource);
    const wrongReceiverPixel = executeHalfFloatQuad(
      [cloudShadowTestSource, wrongReceiverFragmentSource],
      { uniformMap: receiverUniformMap },
    )[0];
    expect(Math.abs(wrongReceiverPixel[0] - originalReceiverOpticalDepth))
      .withContext("wrong receiver ECEF coordinate mutation")
      .toBeGreaterThan(0.001);

    const transitionNearDepth = effects._pipeline._shadowIntervals[0].y * 0.5;
    const transitionFarDepth = effects._pipeline._shadowIntervals[0].y * 1.8;
    const transitionDirection = Cartesian3.clone(
      effects._pipeline._frame.cameraDirection,
      new Cartesian3(),
    );
    const setReceiverViewDepth = function (viewDepth) {
      const destination = Cartesian3.subtract(
        fixedReceiver,
        Cartesian3.multiplyByScalar(
          transitionDirection,
          viewDepth,
          new Cartesian3(),
        ),
        new Cartesian3(),
      );
      const surfaceNormal = Ellipsoid.WGS84.geodeticSurfaceNormal(
        destination,
        new Cartesian3(),
      );
      let right = Cartesian3.cross(
        transitionDirection,
        surfaceNormal,
        new Cartesian3(),
      );
      if (Cartesian3.magnitudeSquared(right) < CesiumMath.EPSILON12) {
        right = Cartesian3.clone(Cartesian3.UNIT_X, right);
      } else {
        Cartesian3.normalize(right, right);
      }
      const up = Cartesian3.normalize(
        Cartesian3.cross(right, transitionDirection, new Cartesian3()),
        new Cartesian3(),
      );
      scene.camera.setView({
        destination,
        orientation: {
          direction: transitionDirection,
          up,
        },
      });
      effects.update(scene, scene.frameState.time);
      scene.renderForSpecs();
    };
    for (const cascade of [0, 1]) {
      const transitionClip = Matrix4.multiplyByPoint(
        effects._pipeline._shadowMatrices[cascade],
        fixedReceiver,
        new Cartesian3(),
      );
      expect(Math.abs(transitionClip.x))
        .withContext(`cascade ${cascade} producer-covered transition x`)
        .toBeLessThanOrEqual(1.0);
      expect(Math.abs(transitionClip.y))
        .withContext(`cascade ${cascade} producer-covered transition y`)
        .toBeLessThanOrEqual(1.0);
    }
    setReceiverViewDepth(transitionNearDepth);
    const transitionNearPixel = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverFragmentSource],
      { uniformMap: receiverUniformMap },
    )[0];
    setReceiverViewDepth(transitionFarDepth);
    const transitionFarPixel = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverFragmentSource],
      { uniformMap: receiverUniformMap },
    )[0];
    expect(transitionNearPixel[2]).toBe(0.0);
    expect(transitionFarPixel[2]).toBe(1.0);
    const transitionTexelFootprint =
      (2.0 * effects._pipeline._shadowHalfSizes[1].x) / shadow.resolution;
    const receiverRadius = Cartesian3.magnitude(fixedReceiver);
    const shadowTopRadius =
      effects._pipeline._uniformMap.u_sceneGISShadowCloudTop();
    const shadowRayDirection = effects._pipeline._primaryLightDirection;
    const shadowB = Cartesian3.dot(fixedReceiver, shadowRayDirection);
    const shadowC = receiverRadius * receiverRadius - shadowTopRadius ** 2;
    const shadowDistanceToTop = Math.max(
      -shadowB + Math.sqrt(Math.max(shadowB * shadowB - shadowC, 0.0)),
      0.0,
    );
    const structuredShadowStep = CesiumMath.clamp(
      shadowDistanceToTop / 25.0,
      100.0,
      1000.0,
    );
    const transitionTolerance =
      effects.cloudDensity * (transitionTexelFootprint + structuredShadowStep) +
      Math.max(Math.abs(transitionNearPixel[0]), 1.0) / 1024.0;
    const fixedReceiverAtlasTolerance = transitionTolerance;
    expect(transitionFarPixel[0])
      .withContext("producer-covered cascade transition Beer OD")
      .toEqualEpsilon(transitionNearPixel[0], transitionTolerance);
    scene.camera.lookRight(CesiumMath.toRadians(15.0));
    effects.update(scene, scene.frameState.time);
    expect(shadow.historyValid).toBe(true);
    scene.renderForSpecs();
    expect(shadow.historyReadIndex).toBe(shadow.historyWriteIndex);
    const rotatedReceiverPixel = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverFragmentSource],
      { uniformMap: receiverUniformMap },
    )[0];
    expect(rotatedReceiverPixel[0]).toEqualEpsilon(
      originalReceiverOpticalDepth,
      fixedReceiverAtlasTolerance,
    );

    const previousOrbitDirection = Cartesian3.clone(
      effects._pipeline._frame.cameraDirection,
      new Cartesian3(),
    );
    const orbitDestination = Cartesian3.add(
      effects._pipeline._frame.cameraPosition,
      Cartesian3.multiplyByScalar(
        effects._pipeline._frame.cameraRight,
        1000.0,
        new Cartesian3(),
      ),
      new Cartesian3(),
    );
    const orbitDirection = Cartesian3.normalize(
      Cartesian3.subtract(fixedReceiver, orbitDestination, new Cartesian3()),
      new Cartesian3(),
    );
    const orbitSurfaceNormal = Ellipsoid.WGS84.geodeticSurfaceNormal(
      orbitDestination,
      new Cartesian3(),
    );
    const orbitRight = Cartesian3.normalize(
      Cartesian3.cross(orbitDirection, orbitSurfaceNormal, new Cartesian3()),
      new Cartesian3(),
    );
    const orbitUp = Cartesian3.normalize(
      Cartesian3.cross(orbitRight, orbitDirection, new Cartesian3()),
      new Cartesian3(),
    );
    scene.camera.setView({
      destination: orbitDestination,
      orientation: {
        direction: orbitDirection,
        up: orbitUp,
      },
    });
    effects.update(scene, scene.frameState.time);
    expect(
      Cartesian3.dot(
        previousOrbitDirection,
        effects._pipeline._frame.cameraDirection,
      ),
    )
      .withContext("substantial rotation exceeds the former global cut")
      .toBeLessThan(0.984807753);
    expect(shadow.historyValid)
      .withContext("ECEF reprojection remains available through rotation")
      .toBe(true);
    const previousReceiverClip = Matrix4.multiplyByPoint(
      effects._pipeline._shadowPreviousMatrices[0],
      fixedReceiver,
      new Cartesian3(),
    );
    const currentReceiverClip = Matrix4.multiplyByPoint(
      effects._pipeline._shadowMatrices[0],
      fixedReceiver,
      new Cartesian3(),
    );
    const previousReceiverTexel = Math.floor(
      (previousReceiverClip.x * 0.5 + 0.5) * shadow.resolution,
    );
    const currentReceiverTexel = Math.floor(
      (currentReceiverClip.x * 0.5 + 0.5) * shadow.resolution,
    );
    expect(Math.abs(previousReceiverClip.x)).toBeLessThanOrEqual(1.0);
    expect(Math.abs(currentReceiverClip.x)).toBeLessThanOrEqual(1.0);
    expect(currentReceiverTexel)
      .withContext("fixed ECEF receiver crosses atlas texels")
      .not.toBe(previousReceiverTexel);
    scene.renderForSpecs();
    const orbitedReceiverWindow = SceneTransforms.worldToWindowCoordinates(
      scene,
      fixedReceiver,
      new Cartesian2(),
    );
    expect(orbitedReceiverWindow.x).toBeGreaterThanOrEqual(0.0);
    expect(orbitedReceiverWindow.x).toBeLessThanOrEqual(
      scene.canvas.clientWidth,
    );
    expect(orbitedReceiverWindow.y).toBeGreaterThanOrEqual(0.0);
    expect(orbitedReceiverWindow.y).toBeLessThanOrEqual(
      scene.canvas.clientHeight,
    );
    const orbitedReceiverPixel = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverFragmentSource],
      { uniformMap: receiverUniformMap },
    )[0];
    receiverAtlasTexture = shadow.currentFramebuffer.getColorTexture(0);
    const orbitedRawReceiverPixel = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverFragmentSource],
      { uniformMap: receiverUniformMap },
    )[0];
    receiverAtlasTexture = shadow.outputFramebuffer.getColorTexture(0);
    const orbitedSurfaceReceiver = renderSurfaceReceiver();
    receiverCloudTop = legacyReceiverCloudTop;
    const legacyOrbitedReceiver = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverFragmentSource],
      { uniformMap: receiverUniformMap },
    )[0];
    const legacyOrbitedSurfaceReceiver = renderSurfaceReceiver();
    receiverCloudTop = effects._pipeline._shadowCloudSupport.y;
    const receiverTexelFootprint =
      (2.0 * effects._pipeline._shadowHalfSizes[0].x) / shadow.resolution;
    const receiverBinary16Tolerance =
      Math.max(Math.abs(originalReceiverOpticalDepth), 1.0) / 1024.0;
    const receiverOpticalDepthTolerance =
      effects.cloudDensity * (receiverTexelFootprint + structuredShadowStep) +
      receiverBinary16Tolerance;
    expect(orbitedReceiverPixel[0]).toEqualEpsilon(
      rotatedReceiverPixel[0],
      receiverOpticalDepthTolerance,
    );
    const pitchWitness = {
      raw: [producerReceiverPixel[0], orbitedRawReceiverPixel[0]],
      resolved: [originalReceiverOpticalDepth, orbitedReceiverPixel[0]],
      surface: [originalSurfaceReceiver, orbitedSurfaceReceiver],
      legacyResolved: [legacyOriginalReceiver[0], legacyOrbitedReceiver[0]],
      legacySurface: [
        legacyOriginalSurfaceReceiver,
        legacyOrbitedSurfaceReceiver,
      ],
      window: [receiverWindow, orbitedReceiverWindow],
    };
    expect(Math.abs(orbitedRawReceiverPixel[0] - producerReceiverPixel[0]))
      .withContext(
        `fixed-ECEF raw BSM pitch witness ${JSON.stringify(pitchWitness)}`,
      )
      .toBeLessThanOrEqual(receiverOpticalDepthTolerance);
    expect(Math.abs(orbitedReceiverPixel[0] - originalReceiverOpticalDepth))
      .withContext(
        `fixed-ECEF resolved BSM pitch witness ${JSON.stringify(pitchWitness)}`,
      )
      .toBeLessThanOrEqual(receiverOpticalDepthTolerance);
    expect(
      [...originalSurfaceReceiver, ...orbitedSurfaceReceiver].every(
        Number.isFinite,
      ),
    )
      .withContext(`finite surface witness ${JSON.stringify(pitchWitness)}`)
      .toBe(true);

    scene.camera.moveRight(30000.0);
    effects.update(scene, scene.frameState.time);
    expect(shadow.historyValid)
      .withContext("camera cut rejects BSM history before sampling")
      .toBe(false);
    scene.renderForSpecs();

    effects.cloudCoverage = 0.75;
    effects.update(scene, scene.frameState.time);
    expect(shadow.historyValid)
      .withContext("BSM material changes invalidate history")
      .toBe(false);

    const structuredScheduleFragment = `precision highp float;
        void main() {
          float period = sceneGISCloudShadowStructuredSamplePeriod(
            100000.0, 50);
          float distance = sceneGISCloudShadowTemporalRayDistance(
            750.0, 1200.0, 0.25);
          out_FragColor = vec4(period, distance, 0.0, 1.0);
        }`;
    const legacyStructuredShadowSource = cloudShadowTestSource
      .replace(
        /float sceneGISCloudShadowStructuredSamplePeriod\([\s\S]*?\n\}/,
        `float sceneGISCloudShadowStructuredSamplePeriod(
    float maximumRayDistance,
    int iterations)
{
    return maximumRayDistance / float(max(iterations, 1));
}`,
      )
      .replace(
        /float sceneGISCloudShadowTemporalRayDistance\([\s\S]*?\n\}/,
        `float sceneGISCloudShadowTemporalRayDistance(
    float structuredDistance,
    float stepSize,
    float jitter)
{
    return structuredDistance;
}`,
      );
    expect(legacyStructuredShadowSource).not.toBe(cloudShadowTestSource);
    const structuredSchedule = executeHalfFloatQuad(
      [cloudShadowTestSource, structuredScheduleFragment],
      {},
    )[0];
    const legacyStructuredSchedule = executeHalfFloatQuad(
      [legacyStructuredShadowSource, structuredScheduleFragment],
      {},
    )[0];
    expect(structuredSchedule[0]).toBe(1000.0);
    expect(structuredSchedule[1]).toBe(450.0);
    expect(legacyStructuredSchedule[0]).toBe(2000.0);
    expect(legacyStructuredSchedule[1]).toBe(750.0);

    const wrongProducerCoordinateSource = cloudShadowFragmentSource.replace(
      / {12}globePosition,\n {12}globeOffset,\n {12}u_cloudOffset,/,
      `            globePosition + vec3(50000.0, 0.0, 0.0),
            globeOffset,
            u_cloudOffset,`,
    );
    const legacyStructuredProducerSource = cloudShadowFragmentSource
      .replace(
        /float samplePeriod = sceneGISCloudShadowStructuredSamplePeriod\([\s\S]*?u_sceneGISShadowSteps\);/,
        `float samplePeriod = segmentLength /
        float(max(u_sceneGISShadowSteps, 1));`,
      )
      .replace(
        /stepOffset = sceneGISCloudShadowTemporalRayDistance\([\s\S]*?jitter\);/,
        "stepOffset = stepOffset;",
      );
    const allVisualLayersGlobeSource = globeCloudSource.replace(
      /bool sceneGISGlobeCloudLayerCastsShadow\([\s\S]*?\n\}/,
      `bool sceneGISGlobeCloudLayerCastsShadow(int preset, int layer)
{
    return true;
}`,
    );
    expect(wrongProducerCoordinateSource).not.toBe(cloudShadowFragmentSource);
    expect(legacyStructuredProducerSource).not.toBe(cloudShadowFragmentSource);
    expect(allVisualLayersGlobeSource).not.toBe(globeCloudSource);
    expect(globeShapeDetailLodMutationSource).not.toBe(globeCloudSource);
    const wrongProducerCoordinateProgram =
      createEnvironmentEffectsProgramForSpecs(
        scene.context,
        wrongProducerCoordinateSource,
        true,
      );
    const legacyStructuredProducerProgram =
      createEnvironmentEffectsProgramForSpecs(
        scene.context,
        legacyStructuredProducerSource,
        true,
      );
    const shapeDetailLodProducerProgram =
      createEnvironmentEffectsProgramForSpecs(
        scene.context,
        cloudShadowFragmentSource,
        true,
        undefined,
        cloudSource,
        globeShapeDetailLodMutationSource,
      );
    const allVisualLayersProducerProgram =
      createEnvironmentEffectsProgramForSpecs(
        scene.context,
        cloudShadowFragmentSource,
        true,
        undefined,
        cloudSource,
        allVisualLayersGlobeSource,
      );
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(0.0, 0.0, 10000.0),
      orientation: {
        heading: 0.0,
        pitch: CesiumMath.toRadians(-35.0),
        roll: 0.0,
      },
    });
    effects.cloudPreset = "cumulus";
    effects.cloudCoverage = 1.0;
    effects.cloudDensity = 0.001;
    effects.update(scene, scene.frameState.time);
    scene.renderForSpecs();
    const productWorldShadowProgram = shadow.command.shaderProgram;
    const originalShapeTexture = effects._pipeline._resources.cloudShapeTexture;
    const originalDetailTexture =
      effects._pipeline._resources.cloudDetailTexture;
    const mippedShapeTexture = createMipWitnessTexture(true, false);
    const mippedDetailTexture = createMipWitnessTexture(true, true);
    const renderCurrentShadow = function (
      program,
      shapeTexture,
      detailTexture,
    ) {
      shadow.command.shaderProgram = program;
      effects._pipeline._resources.cloudShapeTexture = shapeTexture;
      effects._pipeline._resources.cloudDetailTexture = detailTexture;
      shadow.clearCommand.framebuffer = shadow.currentFramebuffer.framebuffer;
      shadow.clearCommand.execute(
        scene.context,
        effects._pipeline._shadowPassState,
      );
      shadow.command.framebuffer = shadow.currentFramebuffer.framebuffer;
      const viewport = effects._pipeline._shadowPassState.viewport;
      for (
        let cascade = 0;
        cascade < effects._pipeline._shadowCascadeCount;
        cascade++
      ) {
        effects._pipeline._shadowCascadeIndex = cascade;
        viewport.x = (cascade % 2) * shadow.resolution;
        viewport.y = Math.floor(cascade / 2) * shadow.resolution;
        viewport.width = shadow.resolution;
        viewport.height = shadow.resolution;
        shadow.command.execute(
          scene.context,
          effects._pipeline._shadowPassState,
        );
      }
      return readHalfTextureRawBits(
        shadow.currentFramebuffer.getColorTexture(0),
      );
    };
    const productWorldShadow = renderCurrentShadow(
      productWorldShadowProgram,
      mippedShapeTexture,
      mippedDetailTexture,
    );
    const wrongProducerWorldShadow = renderCurrentShadow(
      wrongProducerCoordinateProgram,
      mippedShapeTexture,
      mippedDetailTexture,
    );
    const legacyStructuredWorldShadow = renderCurrentShadow(
      legacyStructuredProducerProgram,
      mippedShapeTexture,
      mippedDetailTexture,
    );
    const mippedShapeDetailWorldShadow = renderCurrentShadow(
      shapeDetailLodProducerProgram,
      mippedShapeTexture,
      mippedDetailTexture,
    );
    effects.cloudPreset = "mixed";
    effects.cloudCoverage = 1.0;
    effects.update(scene, scene.frameState.time);
    scene.renderForSpecs();
    const expectedShadowBottom =
      effects._pipeline._frame.baseHeight + effects.cloudBaseHeight;
    const expectedShadowTop = expectedShadowBottom + 1450.0;
    expect(effects._pipeline._shadowCloudSupport.x).toBe(expectedShadowBottom);
    expect(effects._pipeline._shadowCloudSupport.y).toBe(expectedShadowTop);
    expect(effects._pipeline._globeLightingRecord.cloudTop).toBe(
      expectedShadowTop,
    );
    const mixedLowOnlyShadow = renderCurrentShadow(
      productWorldShadowProgram,
      mippedShapeTexture,
      mippedDetailTexture,
    );
    const mixedAllVisualLayersShadow = renderCurrentShadow(
      allVisualLayersProducerProgram,
      mippedShapeTexture,
      mippedDetailTexture,
    );
    expect(
      mixedAllVisualLayersShadow.some(
        (value, index) => value !== mixedLowOnlyShadow[index],
      ),
    )
      .withContext("mixed BSM excludes the visual-only high layer")
      .toBe(true);
    renderCurrentShadow(
      productWorldShadowProgram,
      mippedShapeTexture,
      mippedDetailTexture,
    );
    receiverAtlasTexture = shadow.currentFramebuffer.getColorTexture(0);
    receiverCloudTop = expectedShadowTop;
    const mixedReceiver = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverFragmentSource],
      { uniformMap: receiverUniformMap },
    )[0];
    receiverCloudTop = expectedShadowBottom + effects.cloudThickness;
    const legacyTopReceiver = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverFragmentSource],
      { uniformMap: receiverUniformMap },
    )[0];
    const receiverTopDistanceFragment = `precision highp float;
        uniform vec3 u_testReceiver;
        void main() {
          float distanceToTop = sceneGISCloudShadowDistanceToTop(
            u_testReceiver);
          out_FragColor = vec4(distanceToTop, 0.0, 0.0, 1.0);
        }`;
    receiverCloudTop = expectedShadowTop;
    const mixedTopDistance = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverTopDistanceFragment],
      { uniformMap: receiverUniformMap },
    )[0];
    receiverCloudTop = expectedShadowBottom + effects.cloudThickness;
    const legacyTopDistance = executeHalfFloatQuad(
      [cloudShadowTestSource, receiverTopDistanceFragment],
      { uniformMap: receiverUniformMap },
    )[0];
    expect(legacyTopDistance[0])
      .withContext(
        `legacy base-plus-thickness receiver top ${JSON.stringify({ mixedReceiver, legacyTopReceiver })}`,
      )
      .toBeGreaterThan(mixedTopDistance[0]);
    receiverCloudTop = expectedShadowTop;
    receiverAtlasTexture = shadow.outputFramebuffer.getColorTexture(0);
    effects.cloudPreset = "cirrus";
    effects.update(scene, scene.frameState.time);
    expect(effects._pipeline._shadowCloudCasterActive).toBe(false);
    expect(effects._pipeline._globeLightingRecord.showCloudShadows).toBe(false);
    expect(effects._pipeline._globeLightingRecord.showCrepuscularRays).toBe(
      false,
    );
    const cirrusShadow = renderCurrentShadow(
      productWorldShadowProgram,
      mippedShapeTexture,
      mippedDetailTexture,
    );
    expect(cirrusShadow.every((value, index) => index % 4 === 0 || value === 0))
      .withContext("cirrus-only preset has no BSM caster support")
      .toBe(true);
    expect(
      wrongProducerWorldShadow.some(
        (value, index) => value !== productWorldShadow[index],
      ),
    )
      .withContext("wrong producer ECEF coordinate mutation")
      .toBe(true);
    expect(
      legacyStructuredWorldShadow.some(
        (value, index) => value !== productWorldShadow[index],
      ),
    )
      .withContext("legacy uniform/no-offset structured march mutation")
      .toBe(true);
    expect(
      mippedShapeDetailWorldShadow.some(
        (value, index) => value !== productWorldShadow[index],
      ),
    )
      .withContext("BSM producer rejects shape/detail cascade LOD")
      .toBe(true);
    renderCurrentShadow(
      productWorldShadowProgram,
      mippedShapeTexture,
      mippedDetailTexture,
    );
    shadow.command.shaderProgram = productWorldShadowProgram;
    effects._pipeline._resources.cloudShapeTexture = originalShapeTexture;
    effects._pipeline._resources.cloudDetailTexture = originalDetailTexture;
    mippedShapeTexture.destroy();
    mippedDetailTexture.destroy();
    wrongProducerCoordinateProgram.destroy();
    legacyStructuredProducerProgram.destroy();
    shapeDetailLodProducerProgram.destroy();
    allVisualLayersProducerProgram.destroy();

    scene.camera.setView({
      destination: Cartesian3.fromDegrees(0.0, 0.0, 10000.0),
      orientation: {
        heading: 0.0,
        pitch: CesiumMath.toRadians(-35.0),
        roll: 0.0,
      },
    });
    effects.update(scene, scene.frameState.time);
    scene.renderForSpecs();
    installCloudWeatherRamp();
    const stbnTexture = effects._pipeline._resources.cloudStbnTexture;
    const stbnValues = new Uint8Array(
      stbnTexture.width * stbnTexture.height * stbnTexture.depth,
    );
    for (let z = 0; z < stbnTexture.depth; z++) {
      const sliceOffset = z * stbnTexture.width * stbnTexture.height;
      for (let y = 0; y < stbnTexture.height; y++) {
        for (let x = 0; x < stbnTexture.width; x++) {
          stbnValues[sliceOffset + y * stbnTexture.width + x] =
            z % 2 === 0 ? 120 : 136;
        }
      }
    }
    stbnTexture.copyFrom({
      source: {
        width: stbnTexture.width,
        height: stbnTexture.height,
        depth: stbnTexture.depth,
        arrayBufferView: stbnValues,
      },
    });
    const miniColorTexture = new Texture({
      context: scene.context,
      width: 4,
      height: 4,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    const miniDepthVelocityTexture = new Texture({
      context: scene.context,
      width: 4,
      height: 4,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
    });
    const miniFramebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [miniColorTexture, miniDepthVelocityTexture],
      destroyAttachments: false,
    });
    const miniPassState = new PassState(scene.context);
    miniPassState.viewport = new BoundingRectangle(0, 0, 4, 4);
    const originalShadowFramebuffer = shadow.command.framebuffer;
    const originalShadowStepsUniform =
      effects._pipeline._uniformMap.u_sceneGISShadowSteps;
    const originalShadowResolutionUniform =
      effects._pipeline._uniformMap.u_sceneGISCloudShadowResolution;
    const originalShadowInverseMatricesUniform =
      effects._pipeline._uniformMap.u_sceneGISCloudShadowInverseMatrices;
    const originalShadowPreviousMatricesUniform =
      effects._pipeline._uniformMap.u_sceneGISCloudShadowPreviousMatrices;
    const originalStbnSliceUniform =
      effects._pipeline._uniformMap.u_cloudStbnSlice;
    let controlledStbnSlice = 0.5 / stbnTexture.depth;
    effects._pipeline._uniformMap.u_sceneGISShadowSteps = () => 25;
    effects._pipeline._uniformMap.u_sceneGISCloudShadowResolution = () => 2.0;
    const miniClipTransform = Matrix4.fromRowMajorArray([
      0.001, 0.0, 0.0, 0.0, 0.0, 0.001, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0,
      0.0, 1.0,
    ]);
    const miniInverseMatrix = Matrix4.multiply(
      effects._pipeline._shadowInverseMatrices[0],
      miniClipTransform,
      new Matrix4(),
    );
    const miniMatrix = Matrix4.inverse(miniInverseMatrix, new Matrix4());
    const miniInverseMatrices = [
      miniInverseMatrix,
      miniInverseMatrix,
      miniInverseMatrix,
    ];
    const miniMatrices = [miniMatrix, miniMatrix, miniMatrix];
    effects._pipeline._uniformMap.u_sceneGISCloudShadowInverseMatrices = () =>
      miniInverseMatrices;
    effects._pipeline._uniformMap.u_sceneGISCloudShadowPreviousMatrices = () =>
      miniMatrices;
    effects._pipeline._uniformMap.u_cloudStbnSlice = () => controlledStbnSlice;
    effects._pipeline._shadowCascadeIndex = 0;
    shadow.command.framebuffer = miniFramebuffer;
    const controlledStbnSource = cloudShadowFragmentSource.replace(
      / {8}float normalizedDensity = sceneGISGlobeCloudShadowDensitySample\([\s\S]*? {12}unusedHeightGradient\);/,
      `        float normalizedDensity = jitter *
            (0.75 + 0.25 * v_textureCoordinates.x);`,
    );
    const controlledStbnProducerSource = controlledStbnSource.replace(
      /vec3 sceneGISCloudShadowRayOrigin\([\s\S]*?\n\}/,
      `vec3 sceneGISCloudShadowRayOrigin(
          float originRadius,
          vec2 gridCoordinate,
          int cascadeIndex)
      {
          vec2 clip = v_textureCoordinates * 2.0 - 1.0;
          vec4 reconstructed =
              u_sceneGISCloudShadowInverseMatrices[
                  u_sceneGISShadowCascadeIndex] *
              vec4(clip, -1.0, 1.0);
          return reconstructed.xyz / reconstructed.w;
      }`,
    );
    expect(controlledStbnProducerSource).not.toBe(cloudShadowFragmentSource);
    const productShadowProgram = shadow.command.shaderProgram;
    const controlledStbnProgram = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      controlledStbnProducerSource,
      true,
    );
    shadow.command.shaderProgram = controlledStbnProgram;
    shadow.command.execute(scene.context, miniPassState);
    const stationaryRawFirst = readHalfTextureRawBits(miniColorTexture);
    controlledStbnSlice = 1.5 / stbnTexture.depth;
    shadow.command.execute(scene.context, miniPassState);
    const stationaryRawSecond = readHalfTextureRawBits(miniColorTexture);
    expect(
      stationaryRawSecond.some(
        (value, index) => value !== stationaryRawFirst[index],
      ),
    )
      .withContext("frame-sliced STBN changes stationary raw Beer samples")
      .toBe(true);

    const stationaryCurrentTexture = new Texture({
      context: scene.context,
      width: 4,
      height: 4,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      source: {
        width: 4,
        height: 4,
        arrayBufferView: stationaryRawSecond,
      },
    });
    const stationaryDepthVelocityTexture = new Texture({
      context: scene.context,
      width: 4,
      height: 4,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      source: {
        width: 4,
        height: 4,
        arrayBufferView: readHalfTextureRawBits(miniDepthVelocityTexture),
      },
    });
    const stationaryHistoryTexture = new Texture({
      context: scene.context,
      width: 4,
      height: 4,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.HALF_FLOAT,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR,
      }),
      source: {
        width: 4,
        height: 4,
        arrayBufferView: stationaryRawFirst,
      },
    });
    const stationaryCurrentPixels = readHalfTexturePixels(
      stationaryCurrentTexture,
    );
    const stationaryResolvedSecond = executeHalfFloatQuad(
      [cloudShadowResolveSource],
      {
        width: 4,
        height: 4,
        uniformMap: {
          u_sceneGISCloudShadowCurrentTexture: () => stationaryCurrentTexture,
          u_sceneGISCloudShadowDepthVelocityTexture: () =>
            stationaryDepthVelocityTexture,
          u_sceneGISCloudShadowHistoryTexture: () => stationaryHistoryTexture,
          u_sceneGISCloudShadowResolution: () => 2.0,
          u_sceneGISCloudShadowCascadeCount: () => 3,
          u_sceneGISCloudShadowHistoryValid: () => true,
        },
      },
    );
    expect(
      stationaryResolvedSecond.some((value, index) =>
        value.some(
          (channel, channelIndex) =>
            channel !== stationaryCurrentPixels[index][channelIndex],
        ),
      ),
    )
      .withContext("stationary resolve accumulates prior Beer history")
      .toBe(true);
    for (const value of stationaryResolvedSecond.flat()) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0.0);
      expect(value).toBeLessThanOrEqual(80.0);
    }

    const fixedSliceSource = controlledStbnProducerSource.replace(
      / {4}int stbnSlice = clamp\([\s\S]*?stbnSize\.z - 1\);/,
      "    int stbnSlice = 0;",
    );
    expect(fixedSliceSource).not.toBe(cloudShadowFragmentSource);
    const fixedSliceProgram = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      fixedSliceSource,
      true,
    );
    shadow.command.shaderProgram = fixedSliceProgram;
    controlledStbnSlice = 0.5 / stbnTexture.depth;
    shadow.command.execute(scene.context, miniPassState);
    const fixedSliceRawFirst = readHalfTextureRawBits(miniColorTexture);
    controlledStbnSlice = 1.5 / stbnTexture.depth;
    shadow.command.execute(scene.context, miniPassState);
    const fixedSliceRawSecond = readHalfTextureRawBits(miniColorTexture);
    expect(fixedSliceRawSecond)
      .withContext("fixed-slice mutation preserves one blocky raw phase")
      .toEqual(fixedSliceRawFirst);
    shadow.command.shaderProgram = productShadowProgram;
    fixedSliceProgram.destroy();
    controlledStbnProgram.destroy();
    shadow.command.framebuffer = originalShadowFramebuffer;
    effects._pipeline._uniformMap.u_sceneGISShadowSteps =
      originalShadowStepsUniform;
    effects._pipeline._uniformMap.u_sceneGISCloudShadowResolution =
      originalShadowResolutionUniform;
    effects._pipeline._uniformMap.u_sceneGISCloudShadowInverseMatrices =
      originalShadowInverseMatricesUniform;
    effects._pipeline._uniformMap.u_sceneGISCloudShadowPreviousMatrices =
      originalShadowPreviousMatricesUniform;
    effects._pipeline._uniformMap.u_cloudStbnSlice = originalStbnSliceUniform;
    miniFramebuffer.destroy();
    miniColorTexture.destroy();
    miniDepthVelocityTexture.destroy();
    stationaryCurrentTexture.destroy();
    stationaryDepthVelocityTexture.destroy();
    stationaryHistoryTexture.destroy();

    const ownerGroundReceiver = Cartesian3.multiplyByScalar(
      Ellipsoid.WGS84.geodeticSurfaceNormal(
        new Cartesian3(
          4352476.185340091,
          1172518.5091243372,
          4497274.005433526,
        ),
        new Cartesian3(),
      ),
      6360000.0,
      new Cartesian3(),
    );
    const ownerCameras = [
      {
        position: new Cartesian3(
          4354436.818278835,
          1173922.5375887349,
          4500681.013014186,
        ),
        direction: new Cartesian3(
          -0.4697143765025789,
          -0.33636706887560774,
          -0.8162264388531076,
        ),
        up: new Cartesian3(
          0.8240153603511509,
          -0.49883762549448873,
          -0.2686255931522222,
        ),
      },
      {
        position: new Cartesian3(
          4353915.805284615,
          1174256.8444827723,
          4500794.221288271,
        ),
        direction: new Cartesian3(
          -0.34387918563737385,
          -0.4162576921133372,
          -0.8417105437392685,
        ),
        up: new Cartesian3(
          0.8776368090046363,
          -0.46123052445872564,
          -0.13046085538462696,
        ),
      },
    ];
    const mappedFrustumGeometry = function (camera, near, far) {
      void camera.frustum.projectionMatrix;
      const frustum = camera.frustum.offCenterFrustum ?? camera.frustum;
      const corners = [];
      for (const distance of [near, far]) {
        const scale = distance / frustum.near;
        for (const horizontal of [
          frustum.left * scale,
          frustum.right * scale,
        ]) {
          for (const vertical of [
            frustum.bottom * scale,
            frustum.top * scale,
          ]) {
            const corner = Cartesian3.add(
              camera.positionWC,
              Cartesian3.multiplyByScalar(
                camera.directionWC,
                distance,
                new Cartesian3(),
              ),
              new Cartesian3(),
            );
            Cartesian3.add(
              corner,
              Cartesian3.multiplyByScalar(
                camera.rightWC,
                horizontal,
                new Cartesian3(),
              ),
              corner,
            );
            Cartesian3.add(
              corner,
              Cartesian3.multiplyByScalar(
                camera.upWC,
                vertical,
                new Cartesian3(),
              ),
              corner,
            );
            const normal = Ellipsoid.WGS84.geodeticSurfaceNormal(
              corner,
              new Cartesian3(),
            );
            const surface = Ellipsoid.WGS84.scaleToGeodeticSurface(
              corner,
              new Cartesian3(),
            );
            const height = Cartesian3.dot(
              Cartesian3.subtract(corner, surface, new Cartesian3()),
              normal,
            );
            corners.push(
              Cartesian3.multiplyByScalar(
                normal,
                6360000.0 + height,
                new Cartesian3(),
              ),
            );
          }
        }
      }
      const center = new Cartesian3();
      for (const corner of corners) {
        Cartesian3.add(center, corner, center);
      }
      Cartesian3.multiplyByScalar(center, 1.0 / corners.length, center);
      let radiusSquared = 0.0;
      for (const corner of corners) {
        radiusSquared = Math.max(
          radiusSquared,
          Cartesian3.distanceSquared(corner, center),
        );
      }
      return {
        center,
        corners,
        radius: Math.sqrt(radiusSquared) * 1.05,
      };
    };
    const texelPhase = function (coordinate) {
      return coordinate - Math.floor(coordinate);
    };
    const shadowGridPhase = function (radius, resolution) {
      const texelSize = (2.0 * radius) / resolution;
      return [
        texelPhase(
          Cartesian3.dot(
            ownerGroundReceiver,
            effects._pipeline._shadowLightRightWorld,
          ) / texelSize,
        ),
        texelPhase(
          Cartesian3.dot(
            ownerGroundReceiver,
            effects._pipeline._shadowLightUpWorld,
          ) / texelSize,
        ),
      ];
    };
    const virtualGroundToEcef = function (position) {
      const normal = Cartesian3.normalize(position, new Cartesian3());
      return Cartesian3.fromRadians(
        Math.atan2(normal.y, normal.x),
        Math.asin(normal.z),
        Cartesian3.magnitude(position) - 6360000.0,
        Ellipsoid.WGS84,
        new Cartesian3(),
      );
    };
    const setOwnerCamera = function (camera, time) {
      const celestialTimeChanged = !JulianDate.equals(
        scene.frameState.time,
        time,
      );
      scene.camera.setView({
        destination: camera.position,
        orientation: {
          direction: camera.direction,
          up: camera.up,
        },
      });
      scene.frameState.time = time;
      if (celestialTimeChanged) {
        effects._pipeline._celestialFrameNumber = undefined;
      }
      effects.update(scene, time);
      scene.context.uniformState.updateCamera(scene.camera);
    };
    const producerBounds = function (cascade) {
      const interval = effects._pipeline._shadowIntervals[cascade];
      const near = effects._pipeline._shadowNear;
      const far = effects._pipeline._shadowFar;
      const fade = function (split) {
        return 0.25 * (split / far) ** 2 * (far - near);
      };
      return {
        near: Math.max(near, interval.x - fade(interval.x)),
        far: Math.min(far, interval.y + fade(interval.y)),
      };
    };
    const buildLegacyShadowMatrix = function (geometry, resolution) {
      const right = effects._pipeline._shadowLightRightWorld;
      const up = effects._pipeline._shadowLightUpWorld;
      const ray = effects._pipeline._shadowRayDirectionWorld;
      const texel = (2.0 * geometry.radius) / resolution;
      const snappedX =
        Math.round(Cartesian3.dot(geometry.center, right) / texel) * texel;
      const snappedY =
        Math.round(Cartesian3.dot(geometry.center, up) / texel) * texel;
      const centerDepth = Cartesian3.dot(geometry.center, ray);
      const center = Cartesian3.add(
        Cartesian3.multiplyByScalar(right, snappedX, new Cartesian3()),
        Cartesian3.multiplyByScalar(up, snappedY, new Cartesian3()),
        new Cartesian3(),
      );
      Cartesian3.add(
        center,
        Cartesian3.multiplyByScalar(ray, centerDepth, new Cartesian3()),
        center,
      );
      return Matrix4.fromRowMajorArray([
        right.x / geometry.radius,
        right.y / geometry.radius,
        right.z / geometry.radius,
        -Cartesian3.dot(right, center) / geometry.radius,
        up.x / geometry.radius,
        up.y / geometry.radius,
        up.z / geometry.radius,
        -Cartesian3.dot(up, center) / geometry.radius,
        ray.x / 200000.0,
        ray.y / 200000.0,
        ray.z / 200000.0,
        -Cartesian3.dot(ray, center) / 200000.0,
        0.0,
        0.0,
        0.0,
        1.0,
      ]);
    };
    effects.cloudQuality = "high";
    effects.cloudPreset = "mixed";
    effects.cloudCoverage = 0.24;
    effects.cloudDensity = 4.39;
    effects.cloudTime = 0.0;
    installFixedCloudStbn();
    const ownerTime = JulianDate.fromIso8601("2026-06-21T10:30:00Z");
    setOwnerCamera(ownerCameras[0], ownerTime);
    const ownerShadow = effects._pipeline._globeShadowResources;
    const receiverTexel =
      (2.0 * effects._pipeline._shadowHalfSizes[0].x) / ownerShadow.resolution;
    const ownerReceivers = [-4.0, 0.0, 4.0].map((offset) =>
      Cartesian3.multiplyByScalar(
        Cartesian3.normalize(
          Cartesian3.add(
            ownerGroundReceiver,
            Cartesian3.multiplyByScalar(
              effects._pipeline._shadowLightRightWorld,
              offset * receiverTexel,
              new Cartesian3(),
            ),
            new Cartesian3(),
          ),
          new Cartesian3(),
        ),
        6360000.0,
        new Cartesian3(),
      ),
    );
    receiverViewDepthOverride.value = function () {
      return Math.max(
        Cartesian3.dot(
          Cartesian3.subtract(
            receiverOverride.value,
            virtualCameraPosition(),
            new Cartesian3(),
          ),
          effects._pipeline._frame.cameraDirection,
        ),
        0.0,
      );
    };
    const sampleOwnerReceivers = function () {
      return ownerReceivers.map((receiver) => {
        receiverOverride.value = receiver;
        surfaceReceiverEcef = virtualGroundToEcef(receiver);
        surfaceReceiverNormal = Ellipsoid.WGS84.geodeticSurfaceNormal(
          surfaceReceiverEcef,
          new Cartesian3(),
        );
        receiverAtlasTexture =
          ownerShadow.currentFramebuffer.getColorTexture(0);
        const raw = executeHalfFloatQuad(
          [cloudShadowTestSource, receiverFragmentSource],
          { uniformMap: receiverUniformMap },
        )[0];
        receiverAtlasTexture = ownerShadow.outputFramebuffer.getColorTexture(0);
        const resolved = executeHalfFloatQuad(
          [cloudShadowTestSource, receiverFragmentSource],
          { uniformMap: receiverUniformMap },
        )[0];
        return {
          raw,
          resolved,
          surface: renderSurfaceReceiver(),
        };
      });
    };
    const producerResidualSource = cloudShadowFragmentSource.replace(
      /void main\(\)\n\{[\s\S]*\}\s*$/,
      `uniform vec3 u_testFixedAnchor;
      uniform vec2 u_testFixedLightPlane;
      uniform vec2 u_testFixedGridCoordinate;
      void main()
      {
          vec3 rayDirection = normalize(u_sceneGISShadowRayDirection);
          float supportBaseHeight;
          float supportThickness;
          sceneGISGlobeCloudShadowPresetSupport(
              u_cloudPreset,
              u_baseHeight + u_cloudBaseHeight,
              u_cloudThickness,
              supportBaseHeight,
              supportThickness);
          int cascadeIndex;
          vec2 gridCoordinate = sceneGISCloudShadowGridCoordinate(
              cascadeIndex);
          vec3 rayOrigin = sceneGISCloudShadowRayOrigin(
              SCENEGIS_BOTTOM_RADIUS + supportBaseHeight + supportThickness,
              gridCoordinate,
              cascadeIndex);
          float topNear;
          float topFar;
          sceneGISCloudSphereInterval(
              rayOrigin,
              rayDirection,
              SCENEGIS_BOTTOM_RADIUS + supportBaseHeight + supportThickness,
              topNear,
              topFar);
          float segmentStart = max(topNear, 0.0);
          float bottomNear;
          float bottomFar;
          float segmentEnd = min(topFar, SCENEGIS_CLOUD_SHADOW_MAX_LENGTH);
          if (sceneGISCloudSphereInterval(
                  rayOrigin,
                  rayDirection,
                  SCENEGIS_BOTTOM_RADIUS + supportBaseHeight,
                  bottomNear,
                  bottomFar) && bottomNear > segmentStart) {
              segmentEnd = min(segmentEnd, bottomNear);
          }
          vec3 segmentOriginWorld = rayOrigin + rayDirection * segmentStart;
          float samplePeriod = sceneGISCloudShadowStructuredSamplePeriod(
              segmentEnd - segmentStart,
              u_sceneGISShadowSteps);
          vec3 structureNormal = sceneGISShadowStructureNormal(
              rayDirection,
              0.0);
          float stepOffset;
          float stepSize;
          sceneGISShadowStructuredPlanes(
              structureNormal,
              segmentOriginWorld,
              rayDirection,
              samplePeriod,
              stepOffset,
              stepSize);
          vec3 anchorResidual = segmentOriginWorld - u_testFixedAnchor;
          float resolution = u_sceneGISCloudShadowResolution;
          vec2 halfSize =
              u_sceneGISShadowHalfSizes[cascadeIndex];
          float footprint = 2.0 * halfSize.x / max(resolution, 1.0);
          vec2 lightPlane = gridCoordinate * footprint;
          out_FragData_0 = vec4(
              gridCoordinate - u_testFixedGridCoordinate,
              (lightPlane - u_testFixedLightPlane) / 1000.0);
          out_FragData_1 = vec4(
              dot(anchorResidual, rayDirection) / 1000.0,
              stepOffset / max(stepSize, 1.0),
              stepSize / 1000.0,
              1.0);
      }`,
    );
    const fixedDensitySource = cloudShadowFragmentSource.replace(
      /void main\(\)\n\{[\s\S]*\}\s*$/,
      `uniform vec3 u_testDensityPosition;
      void main()
      {
          vec3 globeOffset = sceneGISGlobeCloudOffset(
              u_testDensityPosition,
              u_cloudOffset);
          float heightGradient;
          float density = sceneGISGlobeCloudShadowDensitySample(
              u_cloudShapeTexture,
              u_cloudDetailTexture,
              u_cloudWeatherTexture,
              u_cloudTurbulenceTexture,
              u_testDensityPosition,
              globeOffset,
              u_cloudOffset,
              u_baseHeight + u_cloudBaseHeight,
              u_cloudThickness,
              u_cloudCoverage,
              u_cloudPreset,
              u_cloudUseDetail ? 1.0 : 0.0,
              0.0,
              0.0,
              heightGradient);
          out_FragData_0 = vec4(density, heightGradient, 0.0, 1.0);
          out_FragData_1 = vec4(0.0);
      }`,
    );
    expect(producerResidualSource).not.toBe(cloudShadowFragmentSource);
    expect(fixedDensitySource).not.toBe(cloudShadowFragmentSource);
    const analyticDensitySource = cloudShadowFragmentSource.replace(
      / {8}float normalizedDensity = sceneGISGlobeCloudShadowDensitySample\([\s\S]*? {12}unusedHeightGradient\);/,
      `        float normalizedDensity = 0.5 + 0.5 * sin(
            dot(globePosition, vec3(0.37, 0.53, 0.77)) * 0.01);`,
    );
    expect(analyticDensitySource).not.toBe(cloudShadowFragmentSource);
    const inverseRayFunction = `vec3 sceneGISCloudShadowRayOrigin(
        float originRadius,
        vec2 gridCoordinate,
        int cascadeIndex)
    {
        vec2 clip = v_textureCoordinates * 2.0 - 1.0;
        vec4 reconstructed =
            u_sceneGISCloudShadowInverseMatrices[
                cascadeIndex] *
            vec4(clip, -1.0, 1.0);
        return reconstructed.xyz / reconstructed.w + vec3(500.0, 0.0, 0.0);
    }`;
    const inverseRayResidualSource = producerResidualSource.replace(
      /vec3 sceneGISCloudShadowRayOrigin\([\s\S]*?\n\}/,
      inverseRayFunction,
    );
    expect(inverseRayResidualSource).not.toBe(producerResidualSource);
    const inverseAnalyticDensitySource = analyticDensitySource.replace(
      /vec3 sceneGISCloudShadowRayOrigin\([\s\S]*?\n\}/,
      inverseRayFunction,
    );
    expect(inverseAnalyticDensitySource).not.toBe(analyticDensitySource);
    const shadowTexelWitness = function (receiver) {
      const matrix = effects._pipeline._shadowMatrices[0];
      const inverse = effects._pipeline._shadowInverseMatrices[0];
      const clip = Matrix4.multiplyByPoint(matrix, receiver, new Cartesian3());
      const pixelX = Math.floor((clip.x * 0.5 + 0.5) * ownerShadow.resolution);
      const pixelY = Math.floor((clip.y * 0.5 + 0.5) * ownerShadow.resolution);
      const texelClip = new Cartesian3(
        ((pixelX + 0.5) / ownerShadow.resolution) * 2.0 - 1.0,
        ((pixelY + 0.5) / ownerShadow.resolution) * 2.0 - 1.0,
        -1.0,
      );
      const rayOrigin = Matrix4.multiplyByPoint(
        inverse,
        texelClip,
        new Cartesian3(),
      );
      return {
        clip: [clip.x, clip.y],
        pixel: [pixelX, pixelY],
        rayPlane: [
          Cartesian3.dot(rayOrigin, effects._pipeline._shadowLightRightWorld),
          Cartesian3.dot(rayOrigin, effects._pipeline._shadowLightUpWorld),
        ],
      };
    };
    const fixedLightPlane = new Cartesian2(
      Cartesian3.dot(
        ownerReceivers[0],
        effects._pipeline._shadowLightRightWorld,
      ),
      Cartesian3.dot(ownerReceivers[0], effects._pipeline._shadowLightUpWorld),
    );
    const fixedGridCoordinate = new Cartesian2(6418.5, 26021.5);
    const fixedDensityPosition = Cartesian3.multiplyByScalar(
      Cartesian3.normalize(ownerReceivers[0], new Cartesian3()),
      6360000.0 +
        effects._pipeline._uniformMap.u_cloudBaseHeight() +
        effects._pipeline._uniformMap.u_cloudThickness() * 0.5,
      new Cartesian3(),
    );
    effects._pipeline._uniformMap.u_testFixedAnchor = () => ownerReceivers[0];
    effects._pipeline._uniformMap.u_testFixedLightPlane = () => fixedLightPlane;
    effects._pipeline._uniformMap.u_testFixedGridCoordinate = () =>
      fixedGridCoordinate;
    effects._pipeline._uniformMap.u_testDensityPosition = () =>
      fixedDensityPosition;
    const producerResidualProgram = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      producerResidualSource,
      true,
    );
    const fixedDensityProgram = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      fixedDensitySource,
      true,
    );
    const inverseRayResidualProgram = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      inverseRayResidualSource,
      true,
    );
    const analyticDensityProgram = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      analyticDensitySource,
      true,
    );
    const inverseAnalyticDensityProgram =
      createEnvironmentEffectsProgramForSpecs(
        scene.context,
        inverseAnalyticDensitySource,
        true,
      );
    const ownerProductShadowProgram = ownerShadow.command.shaderProgram;
    const runProducerProbe = function (program) {
      const values = [];
      ownerShadow.historyValid = false;
      effects._pipeline._shadowHistorySnapshot.valid = false;
      ownerShadow.command.shaderProgram = program;
      for (const ownerCamera of ownerCameras) {
        setOwnerCamera(ownerCamera, ownerTime);
        ownerShadow.historyValid = false;
        effects._pipeline._shadowHistorySnapshot.valid = false;
        effects._pipeline.renderBackground(
          scene.frameState,
          new PassState(scene.context),
        );
        const texel = shadowTexelWitness(ownerReceivers[0]);
        const index =
          texel.pixel[1] *
            ownerShadow.currentFramebuffer.getColorTexture(0).width +
          texel.pixel[0];
        values.push({
          color: readHalfTexturePixels(
            ownerShadow.currentFramebuffer.getColorTexture(0),
          )[index],
          auxiliary: readHalfTexturePixels(
            ownerShadow.currentFramebuffer.getColorTexture(1),
          )[index],
        });
      }
      ownerShadow.command.shaderProgram = ownerProductShadowProgram;
      return values;
    };
    const runOwnerPair = function (
      legacyRadiusMutation,
      producerProgram = ownerProductShadowProgram,
    ) {
      const witness = [];
      ownerShadow.command.shaderProgram = producerProgram;
      effects._pipeline._shadowHistorySnapshot.valid = false;
      ownerShadow.historyValid = false;
      for (
        let cameraIndex = 0;
        cameraIndex < ownerCameras.length;
        cameraIndex++
      ) {
        const ownerCamera = ownerCameras[cameraIndex];
        setOwnerCamera(ownerCamera, ownerTime);
        if (cameraIndex === 0) {
          effects._pipeline._shadowHistorySnapshot.valid = false;
          ownerShadow.historyValid = false;
        }
        const coverage = [];
        const legacyRadii = [];
        for (
          let cascade = 0;
          cascade < effects._pipeline._shadowCascadeCount;
          cascade++
        ) {
          const bounds = producerBounds(cascade);
          const geometry = mappedFrustumGeometry(
            scene.camera,
            bounds.near,
            bounds.far,
          );
          let maximumClip = 0.0;
          for (const corner of geometry.corners) {
            const clip = Matrix4.multiplyByPoint(
              effects._pipeline._shadowMatrices[cascade],
              corner,
              new Cartesian3(),
            );
            maximumClip = Math.max(
              maximumClip,
              Math.abs(clip.x),
              Math.abs(clip.y),
            );
          }
          coverage.push(maximumClip);
          legacyRadii.push(geometry.radius);
          if (legacyRadiusMutation && cascade === 0) {
            const legacyMatrix = buildLegacyShadowMatrix(
              geometry,
              ownerShadow.resolution,
            );
            Matrix4.clone(
              legacyMatrix,
              effects._pipeline._shadowMatrices[cascade],
            );
            Matrix4.inverse(
              legacyMatrix,
              effects._pipeline._shadowInverseMatrices[cascade],
            );
            effects._pipeline._shadowHalfSizes[cascade].x = geometry.radius;
            effects._pipeline._shadowHalfSizes[cascade].y = geometry.radius;
            if (!ownerShadow.historyValid) {
              Matrix4.clone(
                legacyMatrix,
                effects._pipeline._shadowPreviousMatrices[cascade],
              );
            }
          }
        }
        const productRadius = effects._pipeline._shadowHalfSizes[0].x;
        const productPhase = shadowGridPhase(
          productRadius,
          ownerShadow.resolution,
        );
        const historyValidBeforeRender = ownerShadow.historyValid;
        effects._pipeline.renderBackground(
          scene.frameState,
          new PassState(scene.context),
        );
        const texels = ownerReceivers.map(shadowTexelWitness);
        const rawPixels = readHalfTexturePixels(
          ownerShadow.currentFramebuffer.getColorTexture(0),
        );
        const displacementPixels = readHalfTexturePixels(
          ownerShadow.currentFramebuffer.getColorTexture(1),
        );
        const atlasWidth = ownerShadow.resolution * 2;
        witness.push({
          historyValidBeforeRender,
          coverage,
          radius: productRadius,
          legacyRadius: legacyRadii[0],
          phase: productPhase,
          rayDirection: Cartesian3.clone(
            effects._pipeline._shadowRayDirectionWorld,
          ),
          texels,
          rawTexel: texels.map(
            (texel) => rawPixels[texel.pixel[1] * atlasWidth + texel.pixel[0]],
          ),
          displacement: texels.map((texel) => {
            const value =
              displacementPixels[texel.pixel[1] * atlasWidth + texel.pixel[0]];
            return [value[1], value[2]];
          }),
          samples: sampleOwnerReceivers(),
        });
      }
      ownerShadow.command.shaderProgram = ownerProductShadowProgram;
      return witness;
    };
    const ownerWitness = runOwnerPair(false);
    const legacyOwnerWitness = runOwnerPair(true);
    const analyticDensityWitness = runOwnerPair(false, analyticDensityProgram);
    const inverseAnalyticDensityWitness = runOwnerPair(
      false,
      inverseAnalyticDensityProgram,
    );
    const producerResiduals = runProducerProbe(producerResidualProgram);
    const fixedDensity = runProducerProbe(fixedDensityProgram);
    const inverseRayResiduals = runProducerProbe(inverseRayResidualProgram);
    const unconditionalRoundSource = cloudShadowFragmentSource.replace(
      "if (u_sceneGISCloudShadowGridLatticeCompatible && all(equal(",
      "if (all(equal(",
    );
    expect(unconditionalRoundSource).not.toBe(cloudShadowFragmentSource);
    const unconditionalRoundProgram = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      unconditionalRoundSource,
      true,
    );
    const originalFov = scene.camera.frustum.fov;
    const runScaleTransition = function (program) {
      scene.camera.frustum.fov = originalFov;
      setOwnerCamera(ownerCameras[0], ownerTime);
      effects._pipeline._shadowHistorySnapshot.valid = false;
      ownerShadow.historyValid = false;
      ownerShadow.command.shaderProgram = ownerProductShadowProgram;
      effects._pipeline.renderBackground(
        scene.frameState,
        new PassState(scene.context),
      );
      const previousRadius = effects._pipeline._shadowHalfSizes[0].x;
      scene.camera.frustum.fov = originalFov * 1.1;
      effects.update(scene, ownerTime);
      scene.context.uniformState.updateCamera(scene.camera);
      const currentRadius = effects._pipeline._shadowHalfSizes[0].x;
      const historyValidBeforeRender = ownerShadow.historyValid;
      const gridLatticeCompatible =
        effects._pipeline._uniformMap.u_sceneGISCloudShadowGridLatticeCompatible();
      ownerShadow.command.shaderProgram = program;
      effects._pipeline.renderBackground(
        scene.frameState,
        new PassState(scene.context),
      );
      const texels = ownerReceivers.map(shadowTexelWitness);
      const atlasWidth = ownerShadow.resolution * 2;
      const displacementPixels = readHalfTexturePixels(
        ownerShadow.currentFramebuffer.getColorTexture(1),
      );
      return {
        previousRadius,
        currentRadius,
        historyValidBeforeRender,
        gridLatticeCompatible,
        displacement: texels.map((texel) => {
          const value =
            displacementPixels[texel.pixel[1] * atlasWidth + texel.pixel[0]];
          return [value[1], value[2]];
        }),
        samples: sampleOwnerReceivers(),
      };
    };
    const scaleTransitionWitness = runScaleTransition(
      ownerProductShadowProgram,
    );
    const unconditionalRoundWitness = runScaleTransition(
      unconditionalRoundProgram,
    );
    const sunTransitionTime = JulianDate.addSeconds(
      ownerTime,
      30.0,
      new JulianDate(),
    );
    const runSunTransition = function (program) {
      scene.camera.frustum.fov = originalFov;
      setOwnerCamera(ownerCameras[0], ownerTime);
      effects._pipeline._shadowHistorySnapshot.valid = false;
      ownerShadow.historyValid = false;
      ownerShadow.command.shaderProgram = ownerProductShadowProgram;
      effects._pipeline.renderBackground(
        scene.frameState,
        new PassState(scene.context),
      );
      const previousRadius = effects._pipeline._shadowHalfSizes[0].x;
      const previousSunDirection = Cartesian3.clone(
        effects._pipeline._primaryLightDirection,
      );
      setOwnerCamera(ownerCameras[0], sunTransitionTime);
      const currentRadius = effects._pipeline._shadowHalfSizes[0].x;
      const currentSunDirection = Cartesian3.clone(
        effects._pipeline._primaryLightDirection,
      );
      const historyValidBeforeRender = ownerShadow.historyValid;
      const gridLatticeCompatible =
        effects._pipeline._uniformMap.u_sceneGISCloudShadowGridLatticeCompatible();
      ownerShadow.command.shaderProgram = program;
      effects._pipeline.renderBackground(
        scene.frameState,
        new PassState(scene.context),
      );
      const texels = ownerReceivers.map(shadowTexelWitness);
      const atlasWidth = ownerShadow.resolution * 2;
      const displacementPixels = readHalfTexturePixels(
        ownerShadow.currentFramebuffer.getColorTexture(1),
      );
      return {
        previousRadius,
        currentRadius,
        sunDot: Cartesian3.dot(previousSunDirection, currentSunDirection),
        historyValidBeforeRender,
        gridLatticeCompatible,
        displacement: texels.map((texel) => {
          const value =
            displacementPixels[texel.pixel[1] * atlasWidth + texel.pixel[0]];
          return [value[1], value[2]];
        }),
      };
    };
    const sunTransitionWitness = runSunTransition(ownerProductShadowProgram);
    const unconditionalSunRoundWitness = runSunTransition(
      unconditionalRoundProgram,
    );

    const inflatedOriginSource = cloudShadowFragmentSource.replace(
      `SCENEGIS_BOTTOM_RADIUS + supportBaseHeight + supportThickness,
        gridCoordinate,`,
      `SCENEGIS_BOTTOM_RADIUS + supportBaseHeight + supportThickness +
        u_sceneGISShadowRayOffset * 0.5,
        gridCoordinate,`,
    );
    expect(inflatedOriginSource).not.toBe(cloudShadowFragmentSource);
    const inflatedOriginProgram = createEnvironmentEffectsProgramForSpecs(
      scene.context,
      inflatedOriginSource,
      true,
    );
    const fixedOwnerUp = Ellipsoid.WGS84.geodeticSurfaceNormal(
      Cartesian3.fromDegrees(15.0, 45.0, 0.0),
      new Cartesian3(),
    );
    const shadowLengthCode = function (packedAlpha) {
      return Math.round(
        (packedAlpha >= 0.5 ? 1.0 - packedAlpha : packedAlpha) * 2048.0,
      );
    };
    const runLowAngleEndpoint = function (time, program, collectConsumers) {
      setOwnerCamera(ownerCameras[0], time);
      ownerShadow.command.shaderProgram = program;
      effects._pipeline._shadowHistorySnapshot.valid = false;
      ownerShadow.historyValid = false;
      scene.renderForSpecs(time);
      const rawTexture = ownerShadow.currentFramebuffer.getColorTexture(0);
      const rawBits = readHalfTextureRawBits(rawTexture);
      let positiveCount = 0;
      let maximumOpticalDepth = 0.0;
      let maximumX = -1;
      let maximumY = -1;
      for (let y = 0; y < ownerShadow.resolution; y++) {
        for (let x = 0; x < ownerShadow.resolution; x++) {
          const offset = (y * rawTexture.width + x) * 4;
          const opticalDepth = decodeFloat16(rawBits[offset + 2]);
          if (opticalDepth > 0.0) {
            positiveCount++;
          }
          if (opticalDepth > maximumOpticalDepth) {
            maximumOpticalDepth = opticalDepth;
            maximumX = x;
            maximumY = y;
          }
        }
      }
      const result = {
        elevation: CesiumMath.toDegrees(
          Math.asin(
            CesiumMath.clamp(
              Cartesian3.dot(
                effects._pipeline._primaryLightDirection,
                fixedOwnerUp,
              ),
              -1.0,
              1.0,
            ),
          ),
        ),
        positiveCount,
        maximumOpticalDepth,
        receiverOpticalDepth: 0.0,
        maximumShadowLengthCode: 0,
      };
      if (!collectConsumers || maximumX < 0) {
        return result;
      }

      const gridCoordinate = new Cartesian2(
        effects._pipeline._shadowGridCenters[0].x +
          maximumX +
          0.5 -
          ownerShadow.resolution * 0.5,
        effects._pipeline._shadowGridCenters[0].y +
          maximumY +
          0.5 -
          ownerShadow.resolution * 0.5,
      );
      const halfSize = effects._pipeline._shadowHalfSizes[0];
      const footprint = (2.0 * halfSize.x) / ownerShadow.resolution;
      const lightPlane = Cartesian3.add(
        Cartesian3.multiplyByScalar(
          effects._pipeline._shadowLightRightWorld,
          gridCoordinate.x * footprint,
          new Cartesian3(),
        ),
        Cartesian3.multiplyByScalar(
          effects._pipeline._shadowLightUpWorld,
          gridCoordinate.y * footprint,
          new Cartesian3(),
        ),
        new Cartesian3(),
      );
      const cloudTopRadius =
        6360000.0 + effects._pipeline._shadowCloudSupport.y;
      const rayDirection = effects._pipeline._shadowRayDirectionWorld;
      const rayOrigin = Cartesian3.add(
        lightPlane,
        Cartesian3.multiplyByScalar(
          rayDirection,
          -Math.sqrt(
            Math.max(
              cloudTopRadius * cloudTopRadius -
                Cartesian3.magnitudeSquared(lightPlane),
              0.0,
            ),
          ),
          new Cartesian3(),
        ),
        new Cartesian3(),
      );
      const groundQuadraticB = 2.0 * Cartesian3.dot(rayOrigin, rayDirection);
      const groundQuadraticC =
        Cartesian3.magnitudeSquared(rayOrigin) - 6360000.0 ** 2;
      const groundDistance =
        (-groundQuadraticB -
          Math.sqrt(
            groundQuadraticB * groundQuadraticB - 4.0 * groundQuadraticC,
          )) *
        0.5;
      receiverOverride.value = Cartesian3.add(
        rayOrigin,
        Cartesian3.multiplyByScalar(
          rayDirection,
          groundDistance,
          new Cartesian3(),
        ),
        new Cartesian3(),
      );
      surfaceReceiverEcef = virtualGroundToEcef(receiverOverride.value);
      surfaceReceiverNormal = Ellipsoid.WGS84.geodeticSurfaceNormal(
        surfaceReceiverEcef,
        new Cartesian3(),
      );
      receiverAtlasTexture = ownerShadow.outputFramebuffer.getColorTexture(0);
      result.receiverOpticalDepth = executeHalfFloatQuad(
        [cloudShadowTestSource, receiverFragmentSource],
        { uniformMap: receiverUniformMap },
      )[0][0];

      const cloudDistances = readHalfTexturePixels(
        effects._pipeline._resources.cloudFramebuffer.getColorTexture(1),
      );
      for (const distance of cloudDistances) {
        result.maximumShadowLengthCode = Math.max(
          result.maximumShadowLengthCode,
          shadowLengthCode(distance[3]),
        );
      }
      return result;
    };
    const lowSunTime = JulianDate.fromIso8601("2026-06-21T16:00:00Z");
    const moonEndpointTime = JulianDate.fromIso8601("2026-07-02T00:00:00Z");
    const lowSunEndpoint = runLowAngleEndpoint(
      lowSunTime,
      ownerProductShadowProgram,
      true,
    );
    const inflatedLowSunMutation = runLowAngleEndpoint(
      lowSunTime,
      inflatedOriginProgram,
      false,
    );
    const moonEndpoint = runLowAngleEndpoint(
      moonEndpointTime,
      ownerProductShadowProgram,
      true,
    );
    expect(lowSunEndpoint.elevation).toEqualEpsilon(27.019736617450597, 1.0e-9);
    expect(lowSunEndpoint.positiveCount).toBeGreaterThan(0);
    expect(lowSunEndpoint.maximumOpticalDepth).toBeGreaterThan(0.0);
    expect(lowSunEndpoint.receiverOpticalDepth).toBeGreaterThan(0.0);
    expect(lowSunEndpoint.maximumShadowLengthCode).toBeGreaterThan(0);
    expect(inflatedLowSunMutation.positiveCount)
      .withContext("inflated pre-cloud origin exhausts the 200 km ray budget")
      .toBe(0);
    expect(moonEndpoint.elevation).toEqualEpsilon(21.467, 0.01);
    expect(moonEndpoint.positiveCount).toBeGreaterThan(0);
    expect(moonEndpoint.maximumOpticalDepth).toBeGreaterThan(0.0);
    expect(moonEndpoint.receiverOpticalDepth).toBeGreaterThan(0.0);
    expect(moonEndpoint.maximumShadowLengthCode).toBeGreaterThan(0);
    inflatedOriginProgram.destroy();

    scene.camera.frustum.fov = originalFov;
    setOwnerCamera(ownerCameras[0], ownerTime);
    ownerShadow.command.shaderProgram = ownerProductShadowProgram;
    unconditionalRoundProgram.destroy();
    producerResidualProgram.destroy();
    fixedDensityProgram.destroy();
    inverseRayResidualProgram.destroy();
    analyticDensityProgram.destroy();
    inverseAnalyticDensityProgram.destroy();
    expect(producerResiduals[1])
      .withContext(
        `stable light-grid producer residuals ${JSON.stringify(producerResiduals)}`,
      )
      .toEqual(producerResiduals[0]);
    expect(fixedDensity[1])
      .withContext(
        `fixed-position density authority ${JSON.stringify(fixedDensity)}`,
      )
      .toEqual(fixedDensity[0]);
    expect(inverseRayResiduals[1].auxiliary[1])
      .withContext(
        `camera-derived inverse mutation ${JSON.stringify(inverseRayResiduals)}`,
      )
      .not.toBe(inverseRayResiduals[0].auxiliary[1]);
    expect(analyticDensityWitness[1].rawTexel)
      .withContext(
        `world-fixed analytic density march ${JSON.stringify(analyticDensityWitness)}`,
      )
      .toEqual(analyticDensityWitness[0].rawTexel);
    expect(inverseAnalyticDensityWitness[1].rawTexel)
      .withContext(
        `inverse analytic density mutation ${JSON.stringify(inverseAnalyticDensityWitness)}`,
      )
      .not.toEqual(inverseAnalyticDensityWitness[0].rawTexel);
    const ownerContext = JSON.stringify({ ownerWitness, legacyOwnerWitness });
    expect(ownerWitness[0].historyValidBeforeRender).toBe(false);
    expect(ownerWitness[1].historyValidBeforeRender).toBe(true);
    expect(ownerWitness[1].radius)
      .withContext(`pose-invariant cascade radius ${ownerContext}`)
      .toEqualEpsilon(ownerWitness[0].radius, 1.0e-7);
    for (const displacement of ownerWitness[1].displacement) {
      expect(displacement[0]).toBe(Math.round(displacement[0]));
      expect(displacement[1]).toBe(Math.round(displacement[1]));
    }
    expect(scaleTransitionWitness.historyValidBeforeRender).toBe(true);
    expect(scaleTransitionWitness.gridLatticeCompatible).toBe(false);
    expect(scaleTransitionWitness.currentRadius).not.toBe(
      scaleTransitionWitness.previousRadius,
    );
    expect(
      scaleTransitionWitness.displacement.some((displacement) =>
        displacement.some(
          (component) => Math.abs(component - Math.round(component)) > 0.001,
        ),
      ),
    )
      .withContext(
        `fractional scale-changing BSM reprojection ${JSON.stringify(scaleTransitionWitness)}`,
      )
      .toBe(true);
    expect(
      unconditionalRoundWitness.displacement.every((displacement) =>
        displacement.every((component) => component === Math.round(component)),
      ),
    ).toBe(true);
    expect(unconditionalRoundWitness.displacement)
      .withContext("unconditional-round scale mutation")
      .not.toEqual(scaleTransitionWitness.displacement);
    expect(sunTransitionWitness.historyValidBeforeRender).toBe(true);
    expect(sunTransitionWitness.sunDot).toBeGreaterThanOrEqual(0.99999);
    expect(sunTransitionWitness.currentRadius).toBe(
      sunTransitionWitness.previousRadius,
    );
    expect(sunTransitionWitness.gridLatticeCompatible).toBe(false);
    expect(
      sunTransitionWitness.displacement.some((displacement) =>
        displacement.some(
          (component) => Math.abs(component - Math.round(component)) > 0.001,
        ),
      ),
    )
      .withContext(
        `fractional Sun-rotated BSM reprojection ${JSON.stringify(sunTransitionWitness)}`,
      )
      .toBe(true);
    expect(
      unconditionalSunRoundWitness.displacement.every((displacement) =>
        displacement.every((component) => component === Math.round(component)),
      ),
    ).toBe(true);
    expect(unconditionalSunRoundWitness.displacement)
      .withContext("unconditional-round Sun-basis mutation")
      .not.toEqual(sunTransitionWitness.displacement);
    for (const witness of ownerWitness) {
      for (const maximumClip of witness.coverage) {
        expect(maximumClip)
          .withContext(`analytic radius producer coverage ${ownerContext}`)
          .toBeLessThanOrEqual(1.0);
      }
    }
    const rawContrast =
      Math.max(...ownerWitness[0].samples.map((sample) => sample.raw[0])) -
      Math.min(...ownerWitness[0].samples.map((sample) => sample.raw[0]));
    expect(rawContrast)
      .withContext(`nontrivial fixed-world shadow contrast ${ownerContext}`)
      .toBeGreaterThan(0.02);
    const productPhaseError = Math.max(
      ...ownerWitness[1].phase.map((value, axis) =>
        Math.abs(value - ownerWitness[0].phase[axis]),
      ),
    );
    const producerStep = Math.min(
      1000.0,
      Math.max(
        100.0,
        (effects._pipeline._shadowCloudSupport.y -
          effects._pipeline._shadowCloudSupport.x) /
          effects._pipeline._uniformMap.u_sceneGISShadowSteps(),
      ),
    );
    const spatialFraction = (productPhaseError * receiverTexel) / producerStep;
    const stageDeltas = {
      raw: [],
      resolved: [],
      surface: [],
    };
    const legacyStageDeltas = {
      raw: [],
      resolved: [],
      surface: [],
    };
    for (let sample = 0; sample < ownerReceivers.length; sample++) {
      for (const stage of ["raw", "resolved", "surface"]) {
        const channels = stage === "surface" ? 3 : 1;
        for (let channel = 0; channel < channels; channel++) {
          const first = ownerWitness[0].samples[sample][stage][channel];
          const second = ownerWitness[1].samples[sample][stage][channel];
          const binary16Tolerance =
            (2.0 * Math.max(Math.abs(first), Math.abs(second), 1.0)) / 1024.0;
          const tolerance =
            binary16Tolerance +
            spatialFraction * Math.max(Math.abs(first), Math.abs(second), 1.0) +
            (stage === "resolved"
              ? Math.max(Math.abs(first), Math.abs(second), 1.0) / 128.0
              : 0.0);
          const delta = Math.abs(second - first);
          stageDeltas[stage].push(delta);
          expect(delta)
            .withContext(
              `${stage} fixed-world A/B invariance tolerance=${tolerance} ${ownerContext}`,
            )
            .toBeLessThanOrEqual(tolerance);
          const legacyFirst =
            legacyOwnerWitness[0].samples[sample][stage][channel];
          const legacySecond =
            legacyOwnerWitness[1].samples[sample][stage][channel];
          legacyStageDeltas[stage].push(Math.abs(legacySecond - legacyFirst));
        }
      }
    }
    for (const stage of ["raw", "resolved", "surface"]) {
      expect(Math.max(...legacyStageDeltas[stage]))
        .withContext(
          `mapped-radius ${stage} mutation must fail ${JSON.stringify({ stageDeltas, legacyStageDeltas, ownerContext })}`,
        )
        .toBeGreaterThan(Math.max(...stageDeltas[stage]) + 0.002);
    }
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

  it("accepts caller-owned Globe Moon while other conflicts fail before attachment or fetch", function () {
    connectGlobeWithDeferredAssets();
    const moon = {
      show: true,
      isDestroyed: function () {
        return false;
      },
      destroy: function () {
        return undefined;
      },
    };
    scene.moon = moon;
    const conflictCases = [
      {
        enable: () => (scene.skyAtmosphere = { show: true }),
        disable: () => (scene.skyAtmosphere = undefined),
      },
      {
        enable: () => (scene.skyBox = { show: true }),
        disable: () => (scene.skyBox = undefined),
      },
      {
        enable: () => (scene.sun = { show: true }),
        disable: () => (scene.sun = undefined),
      },
      {
        enable: () => (scene.sunBloom = true),
        disable: () => (scene.sunBloom = false),
      },
      {
        enable: () => (scene.fog.enabled = true),
        disable: () => (scene.fog.enabled = false),
      },
      {
        enable: () => (scene.globe.showGroundAtmosphere = true),
        disable: () => (scene.globe.showGroundAtmosphere = false),
      },
    ];
    const firstUpdate = function () {
      effects.firstUpdate(scene, scene.frameState.time);
    };

    for (const conflict of conflictCases) {
      conflict.enable();
      expect(firstUpdate).toThrowDeveloperError();
      expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
      expect(effects._pipeline).toBeUndefined();
      expect(Resource.fetchArrayBuffer).not.toHaveBeenCalled();
      conflict.disable();
    }

    expect(firstUpdate).not.toThrow();
    expect(Resource.fetchArrayBuffer).toHaveBeenCalledTimes(8);
    expect(scene.moon).toBe(moon);
    expect(scene.moon.show).toBe(true);
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

    scene.globe.enableLighting = false;
    scene.postProcessStages.bloom.enabled = true;
    expect(function () {
      effects.firstUpdate(scene, scene.frameState.time);
    }).toThrowDeveloperError();
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
    expect(effects._pipeline).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    scene.postProcessStages.bloom.enabled = false;

    const sunLight = scene.light;
    scene.light = new DirectionalLight({
      direction: Cartesian3.UNIT_X,
    });
    expect(function () {
      effects.firstUpdate(scene, scene.frameState.time);
    }).toThrowDeveloperError();
    expect(effects._pipeline).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    scene.light = sunLight;
  });

  it("keeps Globe shadow toggles warm and releases the exact atlas lifecycle", async function () {
    const fetchArrayBuffer = Resource.fetchArrayBuffer;
    let acquiredBeforeResourceRequest = false;
    const requestedAssetUrls = [];
    await connectControlledCloudMode("globe", function () {
      scene.moon = new Moon();
      scene.moon.show = false;
      scene.moon.textureUrl = "caller-moon.webp";
      spyOn(Resource, "fetchArrayBuffer").and.callFake(function (...args) {
        acquiredBeforeResourceRequest =
          scene.globe.depthTestAgainstTerrain === true;
        requestedAssetUrls.push(String(args[0]));
        return fetchArrayBuffer.apply(Resource, args);
      });
    });
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const callerLight = effects._celestialPreviousLight;
    const callerMoonTextureUrl = effects._celestialPreviousMoonTextureUrl;
    expect(callerLight instanceof SunLight).toBe(true);
    expect(acquiredBeforeResourceRequest).toBe(true);
    expect(scene.light instanceof DirectionalLight).toBe(true);
    expect(scene.light).toBe(effects._directionalLight);
    expect(scene.moon.textureUrl).toContain(
      "Assets/SceneGIS/Environment/Moon/color_large.webp",
    );
    expect(scene.globe.depthTestAgainstTerrain).toBe(true);
    expect(requestedAssetUrls.length).toBe(8);
    expect(
      requestedAssetUrls.some((url) => url.endsWith("globe-shape.bin")),
    ).toBe(true);
    expect(
      requestedAssetUrls.some((url) => url.endsWith("globe-detail.bin")),
    ).toBe(true);
    expect(
      requestedAssetUrls.some((url) => url.endsWith("globe-weather.bin")),
    ).toBe(true);
    expect(
      requestedAssetUrls.some((url) => url.endsWith("globe-turbulence.bin")),
    ).toBe(true);
    expect(
      requestedAssetUrls.some((url) => url.endsWith("globe-stbn.bin")),
    ).toBe(true);
    expect(requestedAssetUrls.some((url) => /[/\\]shape\.bin$/.test(url))).toBe(
      false,
    );
    const pipeline = effects._pipeline;
    const cloudResources = pipeline._resources;
    expect(cloudResources.cloudShapeTexture.sizeInBytes).toBe(2097152);
    expect(cloudResources.cloudOccupancyTexture.sizeInBytes).toBe(2396745);
    expect(cloudResources.cloudDetailTexture.sizeInBytes).toBe(32768);
    expect(cloudResources.cloudWeatherTexture.sizeInBytes).toBe(1398101);
    expect(cloudResources.cloudTurbulenceTexture.sizeInBytes).toBe(87381);
    expect(cloudResources.cloudStbnTexture.sizeInBytes).toBe(1048576);
    expect(cloudResources.cloudShapeTexture.sampler.minificationFilter).toBe(
      TextureMinificationFilter.LINEAR,
    );
    expect(cloudResources.cloudDetailTexture.sampler.minificationFilter).toBe(
      TextureMinificationFilter.LINEAR,
    );
    expect(cloudResources.cloudWeatherTexture.sampler.minificationFilter).toBe(
      TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
    );
    expect(
      cloudResources.cloudTurbulenceTexture.sampler.minificationFilter,
    ).toBe(TextureMinificationFilter.LINEAR_MIPMAP_LINEAR);
    expect(pipeline._bloomResources).toBeUndefined();
    const highShadow = pipeline._globeShadowResources;
    const texture = highShadow.currentFramebuffer.getColorTexture(0);
    expect(texture.width).toBe(1536);
    expect(texture.height).toBe(1536);
    expect(texture.width * texture.height * 4 * 2).toBe(18874368);
    expect(highShadow.currentFramebuffer.getColorTexture(1).sizeInBytes).toBe(
      18874368,
    );
    expect(highShadow.historyFramebuffer0.getColorTexture(0).sizeInBytes).toBe(
      18874368,
    );
    expect(highShadow.historyFramebuffer1.getColorTexture(0).sizeInBytes).toBe(
      18874368,
    );
    expect(4 * texture.width * texture.height * 4 * 2).toBe(75497472);
    expect(highShadow.resolveProgram).toBeDefined();
    expect(highShadow.resolveCommand).toBeDefined();
    expect(pipeline._shadowCascadeCount).toBe(3);
    expect(pipeline._uniformMap.u_cloudPrimarySteps()).toBe(64);
    expect(pipeline._uniformMap.u_cloudFineSteps()).toBe(4);
    expect(pipeline._uniformMap.u_cloudSunSteps()).toBe(4);
    expect(pipeline._uniformMap.u_cloudUseDetail()).toBe(true);
    expect(pipeline._uniformMap.u_sceneGISShadowSteps()).toBe(50);
    const stablePosition = Cartesian3.fromDegrees(15.0, 45.0, 500.0);
    scene.camera.setView({
      destination: stablePosition,
      orientation: {
        heading: 0.0,
        pitch: CesiumMath.toRadians(-20.0),
        roll: 0.0,
      },
    });
    effects.update(scene, scene.frameState.time);
    function expectWorldAnchoredShadowGrid() {
      for (let cascade = 0; cascade < pipeline._shadowCascadeCount; cascade++) {
        const center = pipeline._shadowCenters[cascade];
        const texel =
          (pipeline._shadowHalfSizes[cascade].x * 2.0) /
          pipeline._globeShadowResources.resolution;
        const projectedX =
          Cartesian3.dot(center, pipeline._shadowLightRightWorld) / texel;
        const projectedY =
          Cartesian3.dot(center, pipeline._shadowLightUpWorld) / texel;
        expect(projectedX).toEqualEpsilon(Math.round(projectedX), 1.0e-6);
        expect(projectedY).toEqualEpsilon(Math.round(projectedY), 1.0e-6);
        const clipCenter = Matrix4.multiplyByPoint(
          pipeline._shadowMatrices[cascade],
          center,
          new Cartesian3(),
        );
        const reconstructedCenter = Matrix4.multiplyByPoint(
          pipeline._shadowInverseMatrices[cascade],
          clipCenter,
          new Cartesian3(),
        );
        expect(clipCenter.x).toEqualEpsilon(0.0, 1.0e-9);
        expect(clipCenter.y).toEqualEpsilon(0.0, 1.0e-9);
        expect(clipCenter.z).toEqualEpsilon(0.0, 1.0e-9);
        expect(Cartesian3.equalsEpsilon(center, reconstructedCenter, 1.0e-9))
          .withContext("full ECEF shadow forward/inverse agreement")
          .toBe(true);
      }
    }
    expectWorldAnchoredShadowGrid();
    pipeline._shadowHalfSizes.forEach(function (halfSize) {
      expect(halfSize.x).toBe(halfSize.y);
    });
    scene.camera.setView({
      destination: stablePosition,
      orientation: {
        heading: CesiumMath.PI_OVER_TWO,
        pitch: CesiumMath.toRadians(-20.0),
        roll: 0.0,
      },
    });
    effects.update(scene, scene.frameState.time);
    expectWorldAnchoredShadowGrid();
    const stableShadowRightWorld = Cartesian3.clone(
      pipeline._shadowLightRightWorld,
    );
    const stableShadowUpWorld = Cartesian3.clone(pipeline._shadowLightUpWorld);
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(20.0, 45.0, 500.0),
      orientation: {
        heading: CesiumMath.PI_OVER_TWO,
        pitch: CesiumMath.toRadians(-20.0),
        roll: 0.0,
      },
    });
    effects.update(scene, scene.frameState.time);
    expectWorldAnchoredShadowGrid();
    expect(
      Cartesian3.equalsEpsilon(
        pipeline._shadowLightRightWorld,
        stableShadowRightWorld,
        1.0e-12,
      ),
    )
      .withContext("fixed ECEF light-right basis across camera motion")
      .toBe(true);
    expect(
      Cartesian3.equalsEpsilon(
        pipeline._shadowLightUpWorld,
        stableShadowUpWorld,
        1.0e-12,
      ),
    )
      .withContext("fixed ECEF light-up basis across camera motion")
      .toBe(true);
    const resourceKeys = Object.keys(pipeline._resources).sort();
    effects.cloudQuality = "low";
    effects.update(scene, scene.frameState.time);
    const lowShadow = pipeline._globeShadowResources;
    const lowTexture = lowShadow.currentFramebuffer.getColorTexture(0);
    expect(lowShadow).not.toBe(highShadow);
    expect(lowTexture.width).toBe(512);
    expect(lowTexture.height).toBe(512);
    expect(lowTexture.width * lowTexture.height * 4 * 2).toBe(2097152);
    expect(3 * lowTexture.width * lowTexture.height * 4 * 2).toBe(6291456);
    expect(4 * lowTexture.width * lowTexture.height * 4 * 2).toBe(8388608);
    expect(pipeline._shadowCascadeCount).toBe(2);
    expect(pipeline._uniformMap.u_cloudPrimarySteps()).toBe(32);
    expect(pipeline._uniformMap.u_cloudFineSteps()).toBe(1);
    expect(pipeline._uniformMap.u_cloudSunSteps()).toBe(2);
    expect(pipeline._uniformMap.u_cloudUseDetail()).toBe(false);
    expect(pipeline._uniformMap.u_sceneGISShadowSteps()).toBe(25);
    effects.cloudQuality = "medium";
    effects.update(scene, scene.frameState.time);
    const mediumShadow = pipeline._globeShadowResources;
    const mediumTexture = mediumShadow.currentFramebuffer.getColorTexture(0);
    expect(mediumShadow).not.toBe(highShadow);
    expect(mediumShadow).not.toBe(lowShadow);
    expect(mediumTexture.width).toBe(1024);
    expect(mediumTexture.height).toBe(1024);
    expect(mediumTexture.width * mediumTexture.height * 4 * 2).toBe(8388608);
    expect(3 * mediumTexture.width * mediumTexture.height * 4 * 2).toBe(
      25165824,
    );
    expect(4 * mediumTexture.width * mediumTexture.height * 4 * 2).toBe(
      33554432,
    );
    expect(pipeline._shadowCascadeCount).toBe(3);
    expect(pipeline._uniformMap.u_cloudPrimarySteps()).toBe(64);
    expect(pipeline._uniformMap.u_cloudFineSteps()).toBe(4);
    expect(pipeline._uniformMap.u_cloudSunSteps()).toBe(3);
    expect(pipeline._uniformMap.u_cloudUseDetail()).toBe(true);
    expect(pipeline._uniformMap.u_sceneGISShadowSteps()).toBe(50);
    expect(Object.keys(pipeline._resources).sort()).toEqual(resourceKeys);
    const shadow = mediumShadow;
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

    const moonHistoryReason = pipeline._cloudHistoryDiagnostics.resetReason;
    effects.showMoonlight = false;
    effects.showMoonShadows = false;
    effects.moonlightIntensity = 2.0;
    effects.update(scene, scene.frameState.time);
    expect(requestRender).toHaveBeenCalledTimes(3);
    expect(pipeline._cloudHistoryDiagnostics.resetReason).toBe(
      moonHistoryReason,
    );
    expect(scene.light).toBe(effects._directionalLight);

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

    effects.showAerialPerspective = false;
    effects.showHeightFog = false;
    effects.showBloom = false;
    effects.showLensFlare = false;
    const input = scene.context.defaultTexture;
    const resetReason = pipeline._cloudHistoryDiagnostics.resetReason;
    expect(pipeline.executeHdr(scene.context, input, input, input)).toBe(input);
    expect(pipeline._bloomResources).toBeUndefined();
    expect(pipeline._cloudHistoryDiagnostics.resetReason).toBe(resetReason);

    effects.showBloom = true;
    const bloomOutput = pipeline.executeHdr(scene.context, input, input, input);
    const bloomResources = pipeline._bloomResources;
    const thresholdFramebuffer =
      bloomResources.thresholdFramebuffer.framebuffer;
    const blurFramebuffer = bloomResources.blurFramebuffer.framebuffer;
    const compositeFramebuffer =
      bloomResources.compositeFramebuffer.framebuffer;
    expect(bloomOutput).toBe(
      bloomResources.compositeFramebuffer.getColorTexture(0),
    );
    expect(bloomResources.thresholdFramebuffer.depthStencilTexture).toBe(
      undefined,
    );
    expect(bloomResources.blurFramebuffer.depthStencilTexture).toBeUndefined();
    expect(
      bloomResources.compositeFramebuffer.depthStencilTexture,
    ).toBeUndefined();
    expect(
      bloomResources.width * bloomResources.height * 8 +
        bloomResources.halfWidth * bloomResources.halfHeight * 16,
    ).toBe(
      8 * input.width * input.height +
        16 * Math.ceil(input.width / 2) * Math.ceil(input.height / 2),
    );
    expect(bloomResources.thresholdProgram).toBeDefined();
    expect(bloomResources.blurProgram).toBeDefined();
    expect(bloomResources.compositeProgram).toBeDefined();
    expect(bloomResources.thresholdCommand).toBeDefined();
    expect(bloomResources.horizontalBlurCommand).toBeDefined();
    expect(bloomResources.verticalBlurCommand).toBeDefined();
    expect(bloomResources.compositeCommand).toBeDefined();

    const bloomErrors = [];
    const removeBloomErrorListener = effects.errorEvent.addEventListener(
      function (controller, error) {
        bloomErrors.push({ controller, error });
      },
    );
    scene.postProcessStages.bloom.enabled = true;
    effects.update(scene, scene.frameState.time);
    expect(bloomErrors.length).toBe(1);
    expect(bloomErrors[0].error.message).toContain("post-process bloom");
    expect(pipeline._bloomResources).toBe(bloomResources);
    scene.postProcessStages.bloom.enabled = false;
    removeBloomErrorListener();

    effects.enabled = false;
    expect(pipeline._bloomResources).toBe(bloomResources);
    expect(pipeline._globeShadowResources).toBeUndefined();
    expect(scene.frameState._sceneGISGlobeLighting).toBeUndefined();
    expect(scene.globe.depthTestAgainstTerrain).toBe(false);
    expect(scene.light).toBe(callerLight);
    expect(scene.moon.textureUrl).toBe(callerMoonTextureUrl);

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
    expect(pipeline._bloomResources).toBeUndefined();
    expect(thresholdFramebuffer.isDestroyed()).toBe(true);
    expect(blurFramebuffer.isDestroyed()).toBe(true);
    expect(compositeFramebuffer.isDestroyed()).toBe(true);
  });

  it("uses one camera-independent Globe primary light and owns Moon shadow state", function () {
    connectGlobeWithDeferredAssets(true);
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const callerMoon = new Moon();
    callerMoon.textureUrl = "caller-owned-moon.webp";
    scene.moon = callerMoon;
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(15.0, 45.0, 500.0),
      orientation: {
        heading: 0.0,
        pitch: CesiumMath.toRadians(-20.0),
        roll: 0.0,
      },
    });

    const dayTime = JulianDate.fromIso8601("2026-06-21T10:30:00Z");
    effects.firstUpdate(scene, dayTime);
    const capturedMoon = scene.moon;
    const callerMoonTextureUrl = effects._celestialPreviousMoonTextureUrl;
    const callerLight = effects._celestialPreviousLight;
    const callerShadowEnabled = effects._celestialPreviousShadowMapEnabled;
    const callerGlobeShadows = effects._celestialPreviousGlobeShadows;
    const pipeline = effects._pipeline;
    const day = pipeline.getPrimaryLightState();
    expect(effects.ready).toBe(false);
    expect(pipeline._nightFactor).toBe(0.0);
    expect(day.moonContribution).toBe(0.0);
    expect(day.scale.x).toEqualEpsilon(1.0, 1.0e-12);
    expect(day.scale.y).toEqualEpsilon(1.0, 1.0e-12);
    expect(day.scale.z).toEqualEpsilon(1.0, 1.0e-12);

    const nightTime = JulianDate.fromIso8601("2026-07-02T00:00:00Z");
    effects.update(scene, nightTime);
    const nightDirection = Cartesian3.clone(
      pipeline.getPrimaryLightState().direction,
    );
    const night = pipeline.getPrimaryLightState();
    expect(pipeline._nightFactor).toBe(1.0);
    expect(night.moonContribution).toBeGreaterThan(0.0);
    expect(Cartesian3.maximumComponent(night.scale)).toBeGreaterThan(0.0);
    expect(scene.shadowMap.enabled).toBe(true);
    expect(
      Cartesian3.equalsEpsilon(
        scene.light.direction,
        Cartesian3.negate(nightDirection, new Cartesian3()),
        1.0e-12,
      ),
    ).toBe(true);

    const fixedTransform = Transforms.computeIcrfToCentralBodyFixedMatrix(
      nightTime,
      new Matrix3(),
    );
    const sunInertial =
      Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
        nightTime,
        new Cartesian3(),
      );
    const moonInertial =
      Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
        nightTime,
        new Cartesian3(),
      );
    const sunFixed = Matrix3.multiplyByVector(
      fixedTransform,
      sunInertial,
      new Cartesian3(),
    );
    const moonFixed = Matrix3.multiplyByVector(
      fixedTransform,
      moonInertial,
      new Cartesian3(),
    );
    const surfacePosition = Ellipsoid.WGS84.scaleToGeodeticSurface(
      scene.camera.positionWC,
      new Cartesian3(),
    );
    const lambertPhase = function (observer, light, moon) {
      const toObserver = Cartesian3.normalize(
        Cartesian3.subtract(observer, moon, new Cartesian3()),
        new Cartesian3(),
      );
      const toLight = Cartesian3.normalize(
        Cartesian3.subtract(light, moon, new Cartesian3()),
        new Cartesian3(),
      );
      const angle = Math.acos(
        CesiumMath.clamp(Cartesian3.dot(toObserver, toLight), -1.0, 1.0),
      );
      return (Math.sin(angle) + (Math.PI - angle) * Math.cos(angle)) / Math.PI;
    };
    const fixedPhase = lambertPhase(surfacePosition, sunFixed, moonFixed);
    const mixedFrameMutation = lambertPhase(
      surfacePosition,
      sunInertial,
      moonFixed,
    );
    const lambertEndpoint = function (angle) {
      return (Math.sin(angle) + (Math.PI - angle) * Math.cos(angle)) / Math.PI;
    };
    expect(lambertEndpoint(0.0)).toBe(1.0);
    expect(lambertEndpoint(Math.PI)).toEqualEpsilon(0.0, 1.0e-15);
    expect(fixedPhase).toEqualEpsilon(0.9326044744950956, 1.0e-12);
    expect(mixedFrameMutation).toEqualEpsilon(0.29384491398532053, 1.0e-12);
    expect(pipeline._moonPhase).toEqualEpsilon(fixedPhase, 1.0e-12);
    expect(pipeline._moonPhase).not.toEqualEpsilon(mixedFrameMutation, 1.0e-6);

    const belowHorizonTime = JulianDate.addHours(
      nightTime,
      12.0,
      new JulianDate(),
    );
    effects.update(scene, belowHorizonTime);
    expect(pipeline._moonHorizonFactor).toBe(0.0);
    expect(pipeline.getPrimaryLightState().moonContribution).toBe(0.0);
    effects.update(scene, nightTime);
    expect(pipeline._moonHorizonFactor).toBe(1.0);
    expect(pipeline.getPrimaryLightState().moonContribution).toEqualEpsilon(
      pipeline._moonPhase * effects.moonlightIntensity,
      1.0e-12,
    );

    scene.camera.setView({
      destination: scene.camera.positionWC,
      orientation: {
        heading: CesiumMath.PI_OVER_TWO,
        pitch: CesiumMath.toRadians(-45.0),
        roll: 0.0,
      },
    });
    effects.update(scene, nightTime);
    expect(
      Cartesian3.equalsEpsilon(
        pipeline.getPrimaryLightState().direction,
        nightDirection,
        1.0e-12,
      ),
    ).toBe(true);

    const lifecycleErrors = [];
    effects.errorEvent.addEventListener(function (controller, error) {
      lifecycleErrors.push({ controller, error });
    });
    capturedMoon.textureUrl = "external-moon.webp";
    effects.update(scene, nightTime);
    expect(lifecycleErrors.length).toBe(1);
    expect(lifecycleErrors[0].controller).toBe(effects);
    effects.enabled = false;
    expect(capturedMoon.textureUrl).toBe("external-moon.webp");

    capturedMoon.textureUrl = callerMoonTextureUrl;
    effects.enabled = true;
    effects.update(scene, nightTime);
    const ownedMoonTextureUrl = capturedMoon.textureUrl;
    const replacementLight = new DirectionalLight({
      direction: Cartesian3.UNIT_Y,
    });
    scene.light = replacementLight;
    effects.update(scene, nightTime);
    expect(lifecycleErrors.length).toBe(2);
    expect(lifecycleErrors[1].error.message).toContain("scene.light");
    effects.enabled = false;
    expect(scene.light).toBe(replacementLight);
    expect(capturedMoon.textureUrl).toBe(callerMoonTextureUrl);

    scene.light = callerLight;
    effects.enabled = true;
    effects.update(scene, nightTime);
    const replacementMoon = new Moon();
    replacementMoon.textureUrl = ownedMoonTextureUrl;
    scene.moon = replacementMoon;
    effects.update(scene, nightTime);
    expect(lifecycleErrors.length).toBe(3);
    expect(lifecycleErrors[2].error.message).toContain("scene.moon");
    effects.enabled = false;
    expect(scene.moon).toBe(replacementMoon);
    expect(replacementMoon.textureUrl).toBe(ownedMoonTextureUrl);
    expect(capturedMoon.textureUrl).toBe(callerMoonTextureUrl);

    scene.moon = capturedMoon;
    effects.enabled = true;
    effects.update(scene, nightTime);
    scene.shadowMap.enabled = false;
    effects.update(scene, nightTime);
    expect(lifecycleErrors.length).toBe(4);
    expect(lifecycleErrors[3].error.message).toContain("shadowMap.enabled");
    effects.enabled = false;
    expect(scene.shadowMap.enabled).toBe(false);

    scene.globe.shadows = callerGlobeShadows;
    effects.enabled = true;
    effects.update(scene, nightTime);
    scene.globe.shadows = ShadowMode.RECEIVE_ONLY;
    effects.update(scene, nightTime);
    expect(lifecycleErrors.length).toBe(5);
    expect(lifecycleErrors[4].error.message).toContain("globe.shadows");
    effects.enabled = false;
    expect(scene.globe.shadows).toBe(ShadowMode.RECEIVE_ONLY);

    scene.shadowMap.enabled = true;
    scene.globe.shadows = ShadowMode.ENABLED;
    effects.enabled = true;
    effects.update(scene, nightTime);
    expect(effects._ownsShadowMapEnabled).toBe(false);
    expect(effects._ownsGlobeShadowMode).toBe(false);
    effects.enabled = false;
    expect(scene.shadowMap.enabled).toBe(true);
    expect(scene.globe.shadows).toBe(ShadowMode.ENABLED);

    scene.shadowMap.enabled = false;
    scene.globe.shadows = callerGlobeShadows;
    effects.enabled = true;
    effects.update(scene, nightTime);
    effects.disconnectedCallback(effects._element);
    expect(scene.light).toBe(callerLight);
    expect(scene.moon).toBe(capturedMoon);
    expect(capturedMoon.textureUrl).toBe(callerMoonTextureUrl);
    expect(scene.shadowMap.enabled).toBe(callerShadowEnabled);
    expect(scene.globe.shadows).toBe(callerGlobeShadows);
  });

  it("applies Globe HDR bloom and Sun-gated lens artifacts on the actual GPU", async function () {
    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    effects.showAerialPerspective = false;
    effects.showHeightFog = false;
    effects.showClouds = false;
    effects.showBloom = false;
    effects.showLensFlare = true;
    effects.bloomThreshold = 10.0;
    effects.bloomIntensity = 0.05;
    effects.lensFlareIntensity = 64.0;
    effects.update(scene, scene.frameState.time);

    const width = 32;
    const height = 16;
    function makeTexture(valueOrCallback) {
      const values = new Uint16Array(width * height * 4);
      for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
          const value =
            typeof valueOrCallback === "function"
              ? valueOrCallback(x, y)
              : valueOrCallback;
          values.set(value.map(encodeFloat16), (y * width + x) * 4);
        }
      }
      return new Texture({
        context: scene.context,
        width,
        height,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
        source: { arrayBufferView: values },
      });
    }

    const dimmed = makeTexture([8.0, 8.0, 8.0, 0.25]);
    const clearDepth = makeTexture([1.0, 1.0, 1.0, 1.0]);
    const finiteDepth = makeTexture([0.5, 0.5, 0.5, 1.0]);
    const pipeline = effects._pipeline;
    pipeline.executeHdr(scene.context, dimmed, clearDepth, clearDepth);
    const sunDirection = Cartesian3.clone(pipeline._sunDirection);
    const referenceUp =
      Math.abs(Cartesian3.dot(sunDirection, Cartesian3.UNIT_Z)) < 0.9
        ? Cartesian3.UNIT_Z
        : Cartesian3.UNIT_Y;
    const right = Cartesian3.normalize(
      Cartesian3.cross(sunDirection, referenceUp, new Cartesian3()),
      new Cartesian3(),
    );
    const viewDirection = Cartesian3.normalize(
      Cartesian3.add(
        sunDirection,
        Cartesian3.multiplyByScalar(right, 0.35, new Cartesian3()),
        new Cartesian3(),
      ),
      new Cartesian3(),
    );
    const viewRight = Cartesian3.normalize(
      Cartesian3.cross(viewDirection, referenceUp, new Cartesian3()),
      new Cartesian3(),
    );
    const viewUp = Cartesian3.normalize(
      Cartesian3.cross(viewRight, viewDirection, new Cartesian3()),
      new Cartesian3(),
    );
    Cartesian3.clone(viewDirection, scene.camera.direction);
    Cartesian3.clone(viewUp, scene.camera.up);
    Cartesian3.clone(viewRight, scene.camera.right);
    pipeline.executeHdr(scene.context, dimmed, clearDepth, clearDepth);
    const sunUv = Cartesian2.clone(pipeline._sunViewportCoordinates);
    const sourceX = Math.min(
      width - 2,
      Math.max(0, Math.floor(sunUv.x * width)),
    );
    const sourceY = Math.min(
      height - 2,
      Math.max(0, Math.floor(sunUv.y * height)),
    );
    const bright = makeTexture((x, y) =>
      x >= sourceX && x <= sourceX + 1 && y >= sourceY && y <= sourceY + 1
        ? [4096.0, 3072.0, 2048.0, 0.25]
        : [0.0, 0.0, 0.0, 0.25],
    );

    function executeAndRead(color, depth) {
      const output = pipeline.executeHdr(scene.context, color, depth, depth);
      return readHalfTexturePixels(output);
    }

    try {
      const clearLens = executeAndRead(bright, clearDepth);
      const finiteLens = executeAndRead(bright, finiteDepth);
      const dimmedLens = executeAndRead(dimmed, clearDepth);
      const dimmedPixel = dimmedLens[0];
      expect(pipeline._sunLensVisible).toBe(true);
      const sourceUv = new Cartesian2(
        (sourceX + 1.0) / width,
        (sourceY + 1.0) / height,
      );
      const ghostOffset = -1.5;
      const ghostUv = new Cartesian2(
        (sourceUv.x - 1.0 + 0.5 * ghostOffset) / (ghostOffset - 1.0),
        (sourceUv.y - 1.0 + 0.5 * ghostOffset) / (ghostOffset - 1.0),
      );
      const ghostX = Math.round(ghostUv.x * (width - 1));
      const ghostY = Math.round(ghostUv.y * (height - 1));
      let separatedArtifactDelta = 0.0;
      for (
        let y = Math.max(0, ghostY - 1);
        y <= Math.min(height - 1, ghostY + 1);
        ++y
      ) {
        for (
          let x = Math.max(0, ghostX - 1);
          x <= Math.min(width - 1, ghostX + 1);
          ++x
        ) {
          if (Math.abs(x - sourceX) <= 1 && Math.abs(y - sourceY) <= 1) {
            continue;
          }
          const index = y * width + x;
          separatedArtifactDelta = Math.max(
            separatedArtifactDelta,
            clearLens[index][0] - finiteLens[index][0],
            clearLens[index][1] - finiteLens[index][1],
            clearLens[index][2] - finiteLens[index][2],
          );
        }
      }
      expect(separatedArtifactDelta).toBeGreaterThan(0.0);
      expect(dimmedPixel[0]).toBeCloseTo(8.0, 2);
      expect(dimmedPixel[1]).toBeCloseTo(8.0, 2);
      expect(clearLens.every((pixel) => pixel[3] === 0.25)).toBe(true);
      expect(finiteLens.every((pixel) => pixel[3] === 0.25)).toBe(true);
      clearLens.forEach(expectFiniteHdrStorage);

      effects.showLensFlare = false;
      effects.showBloom = true;
      const horizontalCommand = pipeline._bloomResources.horizontalBlurCommand;
      const verticalCommand = pipeline._bloomResources.verticalBlurCommand;
      const originalHorizontalExecute = horizontalCommand.execute;
      const originalVerticalExecute = verticalCommand.execute;
      const horizontalExecute = spyOn(
        horizontalCommand,
        "execute",
      ).and.callThrough();
      const verticalExecute = spyOn(
        verticalCommand,
        "execute",
      ).and.callThrough();
      const linearBloom = executeAndRead(bright, finiteDepth);
      expect(horizontalExecute).toHaveBeenCalledTimes(3);
      expect(verticalExecute).toHaveBeenCalledTimes(3);
      const thresholdTexture =
        pipeline._bloomResources.thresholdFramebuffer.getColorTexture(0);
      const blurTexture =
        pipeline._bloomResources.blurFramebuffer.getColorTexture(0);
      expect(thresholdTexture.sampler.minificationFilter).toBe(
        TextureMinificationFilter.LINEAR,
      );
      expect(thresholdTexture.sampler.magnificationFilter).toBe(
        TextureMagnificationFilter.LINEAR,
      );
      expect(blurTexture.sampler.minificationFilter).toBe(
        TextureMinificationFilter.LINEAR,
      );
      expect(blurTexture.sampler.magnificationFilter).toBe(
        TextureMagnificationFilter.LINEAR,
      );
      const thresholdSampler = thresholdTexture.sampler;
      const blurSampler = blurTexture.sampler;
      thresholdTexture.sampler = Sampler.NEAREST;
      blurTexture.sampler = Sampler.NEAREST;
      const nearestBloom = executeAndRead(bright, finiteDepth);
      thresholdTexture.sampler = thresholdSampler;
      blurTexture.sampler = blurSampler;
      expect(
        Math.max(
          ...linearBloom.map((pixel, index) =>
            Math.max(
              Math.abs(pixel[0] - nearestBloom[index][0]),
              Math.abs(pixel[1] - nearestBloom[index][1]),
              Math.abs(pixel[2] - nearestBloom[index][2]),
            ),
          ),
        ),
      ).toBeGreaterThan(0.0);
      expect(
        linearBloom.some(
          (pixel, index) =>
            pixel[0] > finiteLens[index][0] ||
            pixel[1] > finiteLens[index][1] ||
            pixel[2] > finiteLens[index][2],
        ),
      ).toBe(true);
      expect(linearBloom.every((pixel) => pixel[3] === 0.25)).toBe(true);
      linearBloom.forEach(expectFiniteHdrStorage);

      horizontalExecute.calls.reset();
      verticalExecute.calls.reset();
      horizontalExecute.and.callFake(function (context, passState) {
        if (horizontalExecute.calls.count() === 1) {
          originalHorizontalExecute.call(this, context, passState);
        }
      });
      verticalExecute.and.callFake(function (context, passState) {
        if (verticalExecute.calls.count() === 1) {
          originalVerticalExecute.call(this, context, passState);
        }
      });
      const singleOctaveBloom = executeAndRead(bright, finiteDepth);
      expect(horizontalExecute).toHaveBeenCalledTimes(3);
      expect(verticalExecute).toHaveBeenCalledTimes(3);
      let extendedSmoothSupport = false;
      for (let y = 1; y < height - 1 && !extendedSmoothSupport; ++y) {
        for (let x = 1; x < width - 1; ++x) {
          if (Math.abs(x - sourceX) <= 8 && Math.abs(y - sourceY) <= 8) {
            continue;
          }
          const index = y * width + x;
          const productEnergy = Math.max(...linearBloom[index].slice(0, 3));
          const formerEnergy = Math.max(
            ...singleOctaveBloom[index].slice(0, 3),
          );
          const horizontalNeighbor = Math.max(
            ...linearBloom[index + 1].slice(0, 3),
          );
          const verticalNeighbor = Math.max(
            ...linearBloom[index + width].slice(0, 3),
          );
          if (
            formerEnergy === 0.0 &&
            productEnergy > 0.0 &&
            horizontalNeighbor > 0.0 &&
            verticalNeighbor > 0.0
          ) {
            extendedSmoothSupport = true;
            break;
          }
        }
      }
      expect(extendedSmoothSupport).toBe(true);
    } finally {
      bright.destroy();
      dimmed.destroy();
      clearDepth.destroy();
      finiteDepth.destroy();
    }
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
            u_sceneGISPrimaryLightDirection: () => Cartesian3.UNIT_Z,
            u_sceneGISActualSunDirection: () => Cartesian3.UNIT_Z,
            u_sceneGISPrimaryLightScale: () => Cartesian3.ONE,
            u_sceneGISShowCloudShadows: () => false,
            u_sceneGISShowCrepuscularRays: () => false,
            u_sceneGISCloudShadowAtlas: () =>
              effects._pipeline._globeShadowResources.outputFramebuffer.getColorTexture(
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

  it("adds fixed Globe readable-night irradiance only to ambient domains on the actual GPU", async function () {
    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      return;
    }
    const resources = effects._pipeline._resources;
    const shaderDefines = [
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

    const factorPixel = executeHalfFloatQuad(
      [
        brunetonDefinitionsSource,
        brunetonCommonSource,
        brunetonRuntimeSource,
        atmosphereSource,
        `precision highp float;
        vec3 sunAtCosine(float cosineValue) {
          return vec3(
            sqrt(max(1.0 - cosineValue * cosineValue, 0.0)),
            0.0,
            cosineValue);
        }
        void main() {
          vec3 up = vec3(0.0, 0.0, 1.0);
          out_FragColor = vec4(
            sceneGISReadableNightFactor(
              up, sunAtCosine(-0.1045284633)),
            sceneGISReadableNightFactor(up, sunAtCosine(-0.15)),
            sceneGISReadableNightFactor(
              up, sunAtCosine(-0.2079116908)),
            sceneGISReadableNightFactor(up, sunAtCosine(-0.3)));
        }`,
      ],
      { defines: shaderDefines },
    )[0];
    expect(factorPixel[0]).toBe(0.0);
    expect(factorPixel[1]).toBeGreaterThan(0.0);
    expect(factorPixel[1]).toBeLessThan(1.0);
    expect(factorPixel[2]).toBe(1.0);
    expect(factorPixel[3]).toBe(1.0);

    const surfacePosition = Cartesian3.fromDegrees(15.0, 45.0, 0.0);
    const radialUp = Ellipsoid.WGS84.geodeticSurfaceNormal(
      surfacePosition,
      new Cartesian3(),
    );
    const nightSun = Cartesian3.negate(radialUp, new Cartesian3());
    const lunarPrimaryScale = new Cartesian3(
      0.12 / 1.474,
      0.16 / 1.8504,
      0.22 / 1.91198,
    );
    const zeroMatrix = Matrix4.fromScale(Cartesian3.ZERO, new Matrix4());
    const atlasValues = new Uint16Array(4 * 4 * 4);
    for (let offset = 0; offset < atlasValues.length; offset += 4) {
      atlasValues[offset] = encodeFloat16(0.0);
      atlasValues[offset + 1] = encodeFloat16(0.01);
      atlasValues[offset + 2] = encodeFloat16(40.0);
      atlasValues[offset + 3] = encodeFloat16(40.0);
    }
    const shadowAtlas = new Texture({
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
    const surfaceWithoutNight = globeSurfaceLightingSource.replace(
      `    float skyHemisphere = 0.5 *
        (1.0 + dot(globeNormal, geodeticNormal));
    skyIrradiance += sceneGISReadableNightSkyIrradiance(
        geodeticNormal,
        globeSun) * skyHemisphere;
`,
      "",
    );
    expect(surfaceWithoutNight).not.toBe(globeSurfaceLightingSource);
    function renderSurface(
      source,
      sunDirection,
      albedo,
      scale,
      showCloudShadows,
      primaryLightScale = Cartesian3.ONE,
      shadowDirection = sunDirection,
      actualSunDirection = sunDirection,
    ) {
      return executeHalfFloatQuad(
        [
          brunetonDefinitionsSource,
          brunetonCommonSource,
          brunetonRuntimeSource,
          atmosphereSource,
          cloudShadowSource,
          source,
          `precision highp float;
          uniform float u_testAlbedo;
          void main() {
            out_FragColor = vec4(sceneGISGlobeSurfaceLighting(
              vec3(u_testAlbedo),
              u_sceneGISShadowSurfacePosition,
              u_sceneGISShadowVertical), 1.0);
          }`,
        ],
        {
          defines: shaderDefines,
          uniformMap: {
            u_testAlbedo: () => albedo,
            u_sceneGISTransmittanceTexture: () =>
              resources.transmittanceTexture,
            u_sceneGISIrradianceTexture: () => resources.irradianceTexture,
            u_surfaceRadianceScale: () => scale,
            u_sceneGISPrimaryLightDirection: () => sunDirection,
            u_sceneGISActualSunDirection: () => actualSunDirection,
            u_sceneGISPrimaryLightScale: () => primaryLightScale,
            u_sceneGISShowCloudShadows: () => showCloudShadows,
            u_sceneGISShowCrepuscularRays: () => false,
            u_sceneGISCloudShadowAtlas: () => shadowAtlas,
            u_sceneGISCloudShadowMatrices: () => [
              zeroMatrix,
              zeroMatrix,
              zeroMatrix,
            ],
            u_sceneGISCloudShadowIntervals: () => [
              new Cartesian2(0.0, 10000000.0),
              new Cartesian2(0.0, 0.0),
              new Cartesian2(0.0, 0.0),
            ],
            u_sceneGISCloudShadowCascadeCount: () => 1,
            u_sceneGISShadowSurfacePosition: () => surfacePosition,
            u_sceneGISShadowEast: () => Cartesian3.UNIT_X,
            u_sceneGISShadowNorth: () => Cartesian3.UNIT_Y,
            u_sceneGISShadowVertical: () => radialUp,
            u_sceneGISShadowSunDirection: () => shadowDirection,
            u_sceneGISShadowCameraPosition: () => surfacePosition,
            u_sceneGISShadowCloudTop: () => 6000.0,
          },
        },
      )[0];
    }
    try {
      const nightSurface = renderSurface(
        globeSurfaceLightingSource,
        radialUp,
        0.5,
        10.0,
        false,
        lunarPrimaryScale,
        radialUp,
        nightSun,
      );
      const nightSurfaceShadowed = renderSurface(
        globeSurfaceLightingSource,
        radialUp,
        0.5,
        10.0,
        true,
        lunarPrimaryScale,
        radialUp,
        nightSun,
      );
      const splitDirectionMutation = renderSurface(
        globeSurfaceLightingSource,
        radialUp,
        0.5,
        10.0,
        true,
        lunarPrimaryScale,
        nightSun,
        nightSun,
      );
      const nightSurfaceHalfAlbedo = renderSurface(
        globeSurfaceLightingSource,
        radialUp,
        0.25,
        10.0,
        false,
        lunarPrimaryScale,
        radialUp,
        nightSun,
      );
      const nightSurfaceHalfScale = renderSurface(
        globeSurfaceLightingSource,
        radialUp,
        0.5,
        5.0,
        false,
        lunarPrimaryScale,
        radialUp,
        nightSun,
      );
      expectFiniteHdrStorage(nightSurface);
      expect(nightSurface[0]).toBeGreaterThan(0.0);
      expect(nightSurface[2]).toBeGreaterThan(nightSurface[1]);
      expect(nightSurface[1]).toBeGreaterThan(nightSurface[0]);
      expect(rgbEnergy(nightSurfaceShadowed)).toBeLessThan(
        rgbEnergy(nightSurface),
      );
      expect(splitDirectionMutation).not.toEqual(nightSurfaceShadowed);
      for (let channel = 0; channel < 3; channel++) {
        expect(nightSurfaceHalfAlbedo[channel]).toEqualEpsilon(
          nightSurface[channel] * 0.5,
          0.002,
        );
        expect(nightSurfaceHalfScale[channel]).toEqualEpsilon(
          nightSurface[channel] * 0.5,
          0.002,
        );
      }

      const daySurface = renderSurface(
        globeSurfaceLightingSource,
        radialUp,
        0.5,
        10.0,
        false,
      );
      const daySurfaceWithoutNight = renderSurface(
        surfaceWithoutNight,
        radialUp,
        0.5,
        10.0,
        false,
      );
      expect(daySurface).toEqual(daySurfaceWithoutNight);
    } finally {
      shadowAtlas.destroy();
    }

    const nightSample = {
      heightFraction: "0.5",
      heightGradient: "0.75",
      opticalDepth: "1.2",
      viewCosine: "0.0",
      localExtinction: "0.001",
      readableNight: true,
      primaryMoon: true,
    };
    const undersideSample = {
      ...nightSample,
      heightFraction: "0.0",
      heightGradient: "0.5",
      opticalDepth: "4.0",
      localExtinction: "0.01",
    };
    const cloudWithoutNight = cloudSource.replace(
      `    skyIrradiance = max(skyIrradiance, vec3(0.0)) +
        sceneGISReadableNightSkyIrradiance(
            normalize(globePosition),
            sunDirection);`,
      "    skyIrradiance = max(skyIrradiance, vec3(0.0));",
    );
    expect(cloudWithoutNight).not.toBe(cloudSource);
    const nightCloud = renderCloudLightingComponentProbe("globe", nightSample);
    const undersideCloud = renderCloudLightingComponentProbe(
      "globe",
      undersideSample,
    );
    const cloudMutation = renderCloudLightingComponentProbe(
      "globe",
      nightSample,
      cloudWithoutNight,
    );
    const zeroPrimaryCloud = renderCloudLightingComponentProbe("globe", {
      ...nightSample,
      zeroPrimaryLight: true,
    });
    expectFiniteHdrStorage([...nightCloud.total, 1.0]);
    expect(rgbEnergy(nightCloud.total)).toBeGreaterThan(0.0);
    expect(nightCloud.total[2]).toBeGreaterThan(nightCloud.total[0]);
    expect(rgbEnergy(nightCloud.total)).toBeGreaterThan(
      rgbEnergy(cloudMutation.total),
    );
    expect(rgbEnergy(nightCloud.solar)).toBeGreaterThan(
      rgbEnergy(zeroPrimaryCloud.solar),
    );
    expect(rgbEnergy(nightCloud.total)).not.toEqualEpsilon(
      rgbEnergy(undersideCloud.total),
      0.00025,
    );

    const fogFragment = `precision highp float;
      uniform sampler2D u_transmittanceTexture;
      uniform float u_testAmbientScale;
      uniform float u_testDirectionalScale;
      void main() {
        out_FragColor = vec4(sceneGISApplyExponentialHeightFog(
          u_transmittanceTexture,
          vec3(0.0),
          vec3(0.0),
          vec3(0.0, 1.0, 0.0),
          vec3(0.0, 0.0, -1.0),
          10000.0,
          0.0,
          3.0e-5,
          1.0e-3,
          0.0,
          0.0,
          1.0,
          1.0,
          u_testAmbientScale,
          u_testDirectionalScale,
          4.0), 1.0);
      }`;
    function renderFog(
      readableAtmosphereSource,
      globe,
      ambientScale,
      directionalScale,
    ) {
      return executeHalfFloatQuad(
        globe
          ? [
              brunetonDefinitionsSource,
              brunetonCommonSource,
              brunetonRuntimeSource,
              readableAtmosphereSource,
              heightFogSource,
              fogFragment,
            ]
          : [readableAtmosphereSource, heightFogSource, fogFragment],
        {
          defines: globe ? shaderDefines : [],
          uniformMap: {
            u_transmittanceTexture: () => resources.transmittanceTexture,
            u_testAmbientScale: () => ambientScale,
            u_testDirectionalScale: () => directionalScale,
          },
        },
      )[0];
    }
    const nightFogAmbient = renderFog(atmosphereSource, true, 1.0, 0.0);
    const nightFogDirectional = renderFog(atmosphereSource, true, 0.0, 1.0);
    expectFiniteHdrStorage(nightFogAmbient);
    expect(rgbEnergy(nightFogAmbient)).toBeGreaterThan(0.0);
    expect(nightFogAmbient[2]).toBeGreaterThan(nightFogAmbient[0]);
    expect(nightFogDirectional.slice(0, 3)).toEqual([0.0, 0.0, 0.0]);

    effects.showAtmosphere = false;
    effects.showAerialPerspective = false;
    effects.showHeightFog = false;
    effects.showClouds = false;
    effects.showBloom = false;
    effects.showLensFlare = false;
    const nativeShadowTime = JulianDate.fromIso8601("2026-07-02T00:00:00Z");
    effects.update(scene, nativeShadowTime);
    const nativeShadowMap = scene.shadowMap;
    const globeLighting = scene.frameState._sceneGISGlobeLighting;
    expect(nativeShadowMap.enabled).toBe(true);
    expect(scene.globe.shadows).toBe(ShadowMode.ENABLED);
    expect(
      Cartesian3.equals(
        effects._pipeline._uniformMap.u_sceneGISShadowSunDirection(),
        globeLighting.primaryLightDirection,
      ),
    ).toBe(true);
    expect(
      Cartesian3.dot(
        globeLighting.sunDirection,
        globeLighting.primaryLightDirection,
      ),
    ).toBeLessThan(0.999);

    const receiverOrigin = Cartesian3.fromDegrees(15.0, 45.0, 20.0);
    const receiverFrame = Transforms.eastNorthUpToFixedFrame(receiverOrigin);
    const receiverUp = Matrix4.getColumn(receiverFrame, 2, new Cartesian3());
    const receiverNorth = Matrix4.getColumn(receiverFrame, 1, new Cartesian3());
    const casterOrigin = Cartesian3.add(
      receiverOrigin,
      Cartesian3.multiplyByScalar(receiverUp, 150.0, new Cartesian3()),
      new Cartesian3(),
    );
    const casterFrame = Transforms.eastNorthUpToFixedFrame(casterOrigin);
    const casterModelMatrix = Matrix4.multiplyByUniformScale(
      casterFrame,
      50.0,
      new Matrix4(),
    );
    const receiver = scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(800.0, 800.0, 5.0),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: receiverFrame,
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          translucent: false,
          closed: true,
        }),
        asynchronous: false,
        shadows: ShadowMode.ENABLED,
      }),
    );
    const caster = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        modelMatrix: casterModelMatrix,
        shadows: ShadowMode.ENABLED,
      }),
    );
    const lightDirection = Cartesian3.normalize(
      scene.light.direction,
      new Cartesian3(),
    );
    const shadowDistance =
      -Cartesian3.dot(
        Cartesian3.subtract(casterOrigin, receiverOrigin, new Cartesian3()),
        receiverUp,
      ) / Cartesian3.dot(lightDirection, receiverUp);
    const shadowReceiver = Cartesian3.add(
      casterOrigin,
      Cartesian3.multiplyByScalar(
        lightDirection,
        shadowDistance,
        new Cartesian3(),
      ),
      new Cartesian3(),
    );
    const cameraPosition = Cartesian3.add(
      shadowReceiver,
      Cartesian3.multiplyByScalar(receiverUp, 1000.0, new Cartesian3()),
      new Cartesian3(),
    );
    const setShadowCamera = function (position, cameraUp) {
      scene.camera.setView({
        destination: position,
        orientation: {
          direction: Cartesian3.normalize(
            Cartesian3.subtract(shadowReceiver, position, new Cartesian3()),
            new Cartesian3(),
          ),
          up: cameraUp,
        },
      });
    };
    setShadowCamera(cameraPosition, receiverNorth);
    await pollToPromise(function () {
      scene.renderForSpecs(nativeShadowTime);
      return caster.ready && receiver.ready;
    });
    const renderNativeShadow = function () {
      let result;
      expect({
        scene,
        time: nativeShadowTime,
        primeShadowMap: true,
      }).toRenderAndCall(function (rgba) {
        result = rgba;
      });
      return result;
    };
    caster.shadows = ShadowMode.DISABLED;
    const unshadowedReceiver = renderNativeShadow();
    caster.shadows = ShadowMode.ENABLED;
    const shadowedReceiver = renderNativeShadow();
    expect(shadowedReceiver).not.toEqual(unshadowedReceiver);
    expect(scene.shadowMap).toBe(nativeShadowMap);
    expect(receiver.shadows).toBe(ShadowMode.ENABLED);
    expect(caster.shadows).toBe(ShadowMode.ENABLED);
    const receiverEast = Matrix4.getColumn(receiverFrame, 0, new Cartesian3());
    const firstCameraPosition = Cartesian3.clone(scene.camera.positionWC);
    const firstCameraDirection = Cartesian3.clone(scene.camera.directionWC);
    const offsetCameraPosition = Cartesian3.add(
      cameraPosition,
      Cartesian3.multiplyByScalar(receiverEast, 250.0, new Cartesian3()),
      new Cartesian3(),
    );
    setShadowCamera(offsetCameraPosition, receiverNorth);
    expect(scene.camera.positionWC).not.toEqual(firstCameraPosition);
    expect(scene.camera.directionWC).not.toEqual(firstCameraDirection);
    caster.shadows = ShadowMode.DISABLED;
    const movedUnshadowedReceiver = renderNativeShadow();
    caster.shadows = ShadowMode.ENABLED;
    const movedShadowedReceiver = renderNativeShadow();
    expect(movedShadowedReceiver).not.toEqual(movedUnshadowedReceiver);
    expect(scene.shadowMap).toBe(nativeShadowMap);
    const primaryBeforeTimeChange = Cartesian3.clone(
      effects._pipeline._primaryLightDirection,
    );
    effects.update(
      scene,
      JulianDate.addHours(nativeShadowTime, 1.0, new JulianDate()),
    );
    expect(scene.shadowMap).toBe(nativeShadowMap);
    expect(effects._pipeline._primaryLightDirection).not.toEqual(
      primaryBeforeTimeChange,
    );

    const planarMutationSource = atmosphereSource.replace(
      "vec3(0.020, 0.036, 0.060)",
      "vec3(64000.0)",
    );
    expect(planarMutationSource).not.toBe(atmosphereSource);
    const planarFog = renderFog(atmosphereSource, false, 1.0, 1.0);
    const planarFogMutation = renderFog(planarMutationSource, false, 1.0, 1.0);
    expect(planarFogMutation).toEqual(planarFog);
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
    scene.moon = {
      show: true,
      isDestroyed: function () {
        return false;
      },
      destroy: function () {
        return undefined;
      },
    };

    expect(function () {
      effects.firstUpdate(scene, scene.frameState.time);
    }).toThrowDeveloperError();
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
    expect(effects._pipeline).toBeUndefined();
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
      "sceneGISCloudHistoryCoordinates",
    );
    expect(cloudResolveFragmentSource).toContain(
      "u_cloudPreviousCameraPosition",
    );
    expect(cloudResolveFragmentSource).toContain("spatialDistance.a > 0.5");
    expect(cloudResolveFragmentSource).toContain(
      "abs(clippedHistoryColor.a - spatialColor.a)",
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
        "structured-compatibility",
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
      expect(effects._pipeline._cloudHistoryDiagnostics.mode).toBe(
        "exact-stationary-spatial-only",
      );
      expect(effects._pipeline._cloudHistoryDiagnostics.compatibility).toBe(
        "structured-full-attachments",
      );
      if (scale === 0.0) {
        for (let offset = 0; offset < transition.length; offset += 4) {
          expect(decodeFloat16(transition[offset])).toBe(0.0);
          expect(decodeFloat16(transition[offset + 1])).toBe(0.0);
          expect(decodeFloat16(transition[offset + 2])).toBe(0.0);
        }
      }
    }

    disconnectControlledCloudMode();
    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      disconnectControlledCloudMode();
      return;
    }
    scene.canvas.width = 16;
    scene.canvas.height = 8;
    installSolidCloudTestTextures();
    effects.cloudTime = 0.0;
    const previousDestination = Cartesian3.fromDegrees(15.0, 45.0, 6000.0);
    const previousDirection = Cartesian3.normalize(
      Cartesian3.negate(previousDestination, new Cartesian3()),
      new Cartesian3(),
    );
    const previousRight = Cartesian3.normalize(
      Cartesian3.cross(previousDirection, Cartesian3.UNIT_Z, new Cartesian3()),
      new Cartesian3(),
    );
    const previousUp = Cartesian3.normalize(
      Cartesian3.cross(previousRight, previousDirection, new Cartesian3()),
      new Cartesian3(),
    );
    const fixedTime = JulianDate.fromIso8601("2026-06-21T10:30:00Z");
    const resources = effects._pipeline._resources;
    const productCloud = resources.cloudProgram;
    const productCloudLogarithmic = resources.cloudLogDepthProgram;
    const productResolve = resources.cloudResolveProgram;
    const productResolveLogarithmic = resources.cloudResolveLogDepthProgram;

    function historyManager() {
      return effects._pipeline._cloudHistoryReadIndex === 0
        ? resources.cloudHistoryFramebuffer0
        : resources.cloudHistoryFramebuffer1;
    }

    function readResolvedPixel() {
      const manager = historyManager();
      const texture = manager.getColorTexture(0);
      const x = Math.floor(texture.width * 0.5);
      const y = Math.floor(texture.height * 0.5);
      return {
        x,
        y,
        color: readHalfTexturePixel(texture, x, y),
        distance: readHalfTexturePixel(manager.getColorTexture(1), x, y),
      };
    }

    function copyHistory(colorForPixel, distanceForPixel) {
      const manager = historyManager();
      for (let attachment = 0; attachment < 2; attachment++) {
        const texture = manager.getColorTexture(attachment);
        const values = new Uint16Array(texture.width * texture.height * 4);
        for (let y = 0; y < texture.height; y++) {
          for (let x = 0; x < texture.width; x++) {
            const value =
              attachment === 0
                ? colorForPixel(x, y, texture.width, texture.height)
                : distanceForPixel(x, y, texture.width, texture.height);
            const offset = (y * texture.width + x) * 4;
            values[offset] = encodeFloat16(value[0]);
            values[offset + 1] = encodeFloat16(value[1]);
            values[offset + 2] = encodeFloat16(value[2]);
            values[offset + 3] = encodeFloat16(value[3]);
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
    }

    function cloudSentinelProgram(colorStatement, distance) {
      const source = cloudReplaySentinelFragmentSource
        .replace(
          "out_FragData_0 = vec4(0.125, 0.25, 0.5, 0.75);",
          colorStatement,
        )
        .replace(
          "vec4(0.0625, 0.1875, 0.375, 1.0)",
          `vec4(${distance.join(", ")})`,
        );
      return createEnvironmentEffectsProgramForSpecs(
        scene.context,
        source,
        true,
      );
    }

    function resetPreviousCamera(orthographic) {
      if (orthographic) {
        scene.camera.switchToOrthographicFrustum();
        scene.camera.frustum.width = 10000.0;
      } else {
        scene.camera.switchToPerspectiveFrustum();
      }
      scene.camera.setView({
        destination: previousDestination,
        orientation: { direction: previousDirection, up: previousUp },
      });
      effects.cloudTime = 0.0;
      effects._pipeline.invalidateCloudHistory("spec-semantic-history");
      scene.renderForSpecs(fixedTime);
    }

    function beginPerspectiveMotion() {
      scene.camera.moveRight(100.0);
      scene.camera.lookRight(0.1);
      effects.cloudTime = 0.25;
    }

    const activePrograms = [];
    try {
      resetPreviousCamera(false);
      const stationarySlice = effects._pipeline._uniformMap.u_cloudStbnSlice();
      const stationaryReadIndex = effects._pipeline._cloudHistoryReadIndex;
      scene.renderForSpecs(fixedTime);
      expect(effects._pipeline._uniformMap.u_cloudStbnSlice()).not.toBe(
        stationarySlice,
      );
      expect(effects._pipeline._cloudHistoryReadIndex).not.toBe(
        stationaryReadIndex,
      );
      expect(effects._pipeline._cloudHistoryDiagnostics.stationary).toBe(true);
      expect(effects._pipeline._cloudHistoryDiagnostics.mode).toBe(
        "exact-stationary-temporal",
      );
      expect(effects._pipeline._cloudHistoryDiagnostics.weight).toBe(0.9);

      const currentProgram = cloudSentinelProgram(
        "float stripe = step(1.0, mod(floor(gl_FragCoord.x), 2.0)); out_FragData_0 = vec4(mix(vec3(0.125), vec3(0.25), stripe), 0.75);",
        [0.025, 0.0245, 1.0, 1.0],
      );
      activePrograms.push(currentProgram);
      resources.cloudProgram = currentProgram;
      resources.cloudLogDepthProgram = currentProgram;
      resetPreviousCamera(false);
      beginPerspectiveMotion();
      const probeSource = cloudResolveFragmentSource.replace(
        "historyWeight *= reprojectedPositionValid ? 1.0 : 0.0;",
        "vec3 probePreviousOrigin; vec3 probePreviousDirection; sceneGISCloudResolveRay(historyCoordinates, u_cloudPreviousPerspective, u_cloudPreviousFrustum, vec3(0.0), u_cloudPreviousCameraDirection, u_cloudPreviousCameraRight, u_cloudPreviousCameraUp, probePreviousOrigin, probePreviousDirection); vec3 probeSemanticDistances = vec3(dot(currentMeanAnchor - probePreviousOrigin, probePreviousDirection), dot(currentFrontAnchor - probePreviousOrigin, probePreviousDirection), dot(currentSceneAnchor - probePreviousOrigin, probePreviousDirection)) / SCENEGIS_CLOUD_DISTANCE_ENCODING; out_FragData_0 = vec4(historyCoordinates, probeSemanticDistances.xy); out_FragData_1 = vec4(probeSemanticDistances.z, reprojectedPositionValid ? 1.0 : 0.0, v_textureCoordinates); return;",
      );
      expect(probeSource).not.toBe(cloudResolveFragmentSource);
      const probeProgram = createEnvironmentEffectsProgramForSpecs(
        scene.context,
        probeSource,
        true,
      );
      activePrograms.push(probeProgram);
      resources.cloudResolveProgram = probeProgram;
      resources.cloudResolveLogDepthProgram = probeProgram;
      scene.renderForSpecs(fixedTime);
      const probe = readResolvedPixel();
      expect(probe.color[0]).toBeGreaterThan(0.0);
      expect(probe.color[0]).toBeLessThan(1.0);
      expect(probe.color[1]).toBeGreaterThan(0.0);
      expect(probe.color[1]).toBeLessThan(1.0);
      expect(Math.abs(probe.color[0] - probe.distance[2])).toBeGreaterThan(
        1.0e-4,
      );
      expect(probe.color[2]).toBeGreaterThan(0.0);
      expect(probe.color[3]).toBeGreaterThan(0.0);
      expect(probe.distance[1]).toBe(1.0);
      const semanticDistances = [
        probe.color[2],
        probe.color[3],
        probe.distance[0],
      ];
      const historyDistanceTexture = historyManager().getColorTexture(1);
      const projectedTexelX = Math.min(
        historyDistanceTexture.width - 1,
        Math.floor(probe.color[0] * historyDistanceTexture.width),
      );
      const currentTexelX = Math.min(
        historyDistanceTexture.width - 1,
        Math.floor(probe.distance[2] * historyDistanceTexture.width),
      );
      expect(projectedTexelX).not.toBe(currentTexelX);
      const projectedTexelCenter =
        (projectedTexelX + 0.5) / historyDistanceTexture.width;
      function semanticDistanceForPixel(x, width, packedAlpha) {
        const coordinate = (x + 0.5) / width;
        const delta = coordinate - projectedTexelCenter;
        return [
          semanticDistances[0] + 0.002 * delta,
          semanticDistances[1] - 0.002 * delta,
          semanticDistances[2],
          packedAlpha,
        ];
      }
      expect(
        Math.abs(
          semanticDistanceForPixel(
            projectedTexelX,
            historyDistanceTexture.width,
            1.0,
          )[0] -
            semanticDistanceForPixel(
              currentTexelX,
              historyDistanceTexture.width,
              1.0,
            )[0],
        ) * 200000.0,
      ).toBeGreaterThan(16.0);

      resources.cloudResolveProgram = productResolve;
      resources.cloudResolveLogDepthProgram = productResolveLogarithmic;
      resetPreviousCamera(false);
      beginPerspectiveMotion();
      copyHistory(
        function () {
          return [0.5, 0.5, 0.5, 0.75];
        },
        function (x, y, width) {
          return semanticDistanceForPixel(x, width, 0.75);
        },
      );
      scene.renderForSpecs(fixedTime);
      expect(effects._pipeline._cloudHistoryDiagnostics.mode).toBe(
        "continuous-reprojected",
      );
      const clampedHistory = readResolvedPixel();
      expect(clampedHistory.color[0]).toBeLessThanOrEqual(0.2501);
      expect(clampedHistory.color[1]).toBeLessThanOrEqual(0.2501);
      expect(clampedHistory.color[2]).toBeLessThanOrEqual(0.2501);
      expect(clampedHistory.distance[3]).toBe(1.0);
      expect(clampedHistory.distance[0]).toEqualEpsilon(0.025, 0.0001);
      expect(clampedHistory.distance[1]).toEqualEpsilon(0.0245, 0.0001);
      expect(clampedHistory.distance[2]).toBe(1.0);

      const secondCurrentProgram = cloudSentinelProgram(
        "float stripe = step(1.0, mod(floor(gl_FragCoord.x), 2.0)); out_FragData_0 = vec4(mix(vec3(0.15), vec3(0.275), stripe), 0.75);",
        [0.025, 0.0245, 1.0, 1.0],
      );
      activePrograms.push(secondCurrentProgram);
      resources.cloudProgram = secondCurrentProgram;
      resources.cloudLogDepthProgram = secondCurrentProgram;
      scene.camera.moveRight(100.0);
      scene.camera.lookRight(0.1);
      effects.cloudTime = 0.26;
      scene.renderForSpecs(fixedTime);
      expect(effects._pipeline._cloudHistoryDiagnostics.mode).toBe(
        "continuous-reprojected",
      );
      const secondTransition = readResolvedPixel();
      expect(secondTransition.distance[0]).toEqualEpsilon(0.025, 0.0001);
      expect(secondTransition.distance[1]).toEqualEpsilon(0.0245, 0.0001);
      expect(secondTransition.distance[2]).toBe(1.0);

      effects._pipeline.invalidateCloudHistory("spec-spatial-baseline");
      scene.renderForSpecs(fixedTime);
      const spatialOnly = readResolvedPixel();
      expect(secondTransition.color).not.toEqual(spatialOnly.color);

      resetPreviousCamera(false);
      beginPerspectiveMotion();
      copyHistory(
        function (x, y, width) {
          const value = 0.125 + (0.125 * x) / Math.max(width - 1, 1);
          return [value, value, value, 0.75];
        },
        function (x, y, width) {
          return semanticDistanceForPixel(x, width, 1.0);
        },
      );
      scene.renderForSpecs(fixedTime);
      const reprojected = readResolvedPixel();

      const sameUvSource = cloudResolveFragmentSource.replace(
        /(reprojectedPositionValid = sceneGISCloudHistoryCoordinates\([\s\S]*?currentSceneAnchor\);)/,
        "$1 historyCoordinates = v_textureCoordinates;",
      );
      expect(sameUvSource).not.toBe(cloudResolveFragmentSource);
      const sameUvProgram = createEnvironmentEffectsProgramForSpecs(
        scene.context,
        sameUvSource,
        true,
      );
      activePrograms.push(sameUvProgram);
      resetPreviousCamera(false);
      beginPerspectiveMotion();
      copyHistory(
        function (x, y, width) {
          const value = 0.125 + (0.125 * x) / Math.max(width - 1, 1);
          return [value, value, value, 0.75];
        },
        function (x, y, width) {
          return semanticDistanceForPixel(x, width, 1.0);
        },
      );
      resources.cloudResolveProgram = sameUvProgram;
      resources.cloudResolveLogDepthProgram = sameUvProgram;
      scene.renderForSpecs(fixedTime);
      expect(readResolvedPixel().color).not.toEqual(reprojected.color);

      resources.cloudResolveProgram = productResolve;
      resources.cloudResolveLogDepthProgram = productResolveLogarithmic;
      resetPreviousCamera(false);
      scene.camera.moveRight(30000.0);
      scene.renderForSpecs(fixedTime);
      expect(effects._pipeline._cloudHistoryDiagnostics.mode).toBe(
        "camera-cut-spatial-only",
      );
      expect(effects._pipeline._cloudHistoryDiagnostics.resetReason).toBe(
        "camera-translation",
      );

      const invalidProgram = cloudSentinelProgram(
        "out_FragData_0 = vec4(0.0);",
        [0.0, 0.0, 0.0, 102.0 / 2048.0],
      );
      activePrograms.push(invalidProgram);
      resources.cloudProgram = invalidProgram;
      resources.cloudLogDepthProgram = invalidProgram;
      resetPreviousCamera(true);
      copyHistory(
        function () {
          return [0.0, 0.0, 0.0, 1.0];
        },
        function (x) {
          return [0.0, 0.0, 1.0, (100.0 + (x % 5)) / 2048.0];
        },
      );
      scene.camera.moveRight(500.0);
      scene.renderForSpecs(fixedTime);
      const orthographicProduct = readResolvedPixel();

      resetPreviousCamera(true);
      copyHistory(
        function () {
          return [0.0, 0.0, 0.0, 1.0];
        },
        function (x) {
          return [0.0, 0.0, 1.0, (100.0 + (x % 5)) / 2048.0];
        },
      );
      resources.cloudResolveProgram = sameUvProgram;
      resources.cloudResolveLogDepthProgram = sameUvProgram;
      scene.camera.moveRight(500.0);
      scene.renderForSpecs(fixedTime);
      expect(readResolvedPixel().distance).not.toEqual(
        orthographicProduct.distance,
      );

      resources.cloudResolveProgram = productResolve;
      resources.cloudResolveLogDepthProgram = productResolveLogarithmic;
      resetPreviousCamera(true);
      copyHistory(
        function () {
          return [0.0, 0.0, 0.0, 1.0];
        },
        function () {
          return [0.0, 0.0, 0.25, 100.0 / 2048.0];
        },
      );
      scene.camera.moveRight(500.0);
      scene.renderForSpecs(fixedTime);
      expect(Math.round(readResolvedPixel().distance[3] * 2048.0)).toBe(102);
    } finally {
      resources.cloudProgram = productCloud;
      resources.cloudLogDepthProgram = productCloudLogarithmic;
      resources.cloudResolveProgram = productResolve;
      resources.cloudResolveLogDepthProgram = productResolveLogarithmic;
      for (const program of activePrograms) {
        program.destroy();
      }
      disconnectControlledCloudMode();
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
          for (
            let offset = 0;
            offset < isolatedBaseline.color.length;
            offset += 4
          ) {
            for (let channel = 0; channel < 3; channel++) {
              const baselineValue = decodeFloat16(
                isolatedBaseline.color[offset + channel],
              );
              const calibratedValue = decodeFloat16(
                isolatedCalibration.color[offset + channel],
              );
              const expected =
                mode === "globe"
                  ? baselineValue * (3.0 / backgroundScale)
                  : baselineValue;
              expect(Math.abs(calibratedValue - expected))
                .withContext(
                  `${mode}/${logarithmicDepth}/background domain pixel=${
                    offset / 4
                  } channel=${channel}`,
                )
                .toBeLessThanOrEqual(
                  Math.max(0.00025, Math.abs(expected) * 0.005),
                );
            }
          }
          expect(alphaBits(isolatedCalibration.color)).toEqual(
            alphaBits(isolatedBaseline.color),
          );
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

    // Globe physical A2 Sun/sky/ground units are covered by the adjacent
    // reference-derived core fixture. Keep this normalized-unit matrix as the
    // frozen Planar authority.
    for (const mode of ["planar"]) {
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
    const uniformHeightCoverageSource = globeCloudSource.replace(
      /float sceneGISGlobeCloudShapeAltering\([\s\S]*?\n\}/,
      `float sceneGISGlobeCloudShapeAltering(
    float heightFraction,
    float bias)
{
    return 1.0;
}`,
    );
    const normalizedCoefficientSource = uniformHeightCoverageSource.replace(
      "density * densityScales *",
      "density * clamp(densityScales / 0.2, 0.0, 1.0) *",
    );
    const customSecondaryScheduleSource = cloudSource.replace(
      "int referenceSunSteps = sunSteps >= 3 ? 2 : 1;",
      "int referenceSunSteps = sunSteps;",
    );
    expect(uniformHeightCoverageSource).not.toBe(globeCloudSource);
    expect(normalizedCoefficientSource).not.toBe(uniformHeightCoverageSource);
    expect(customSecondaryScheduleSource).not.toBe(cloudSource);
    await connectControlledCloudMode("globe");
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      disconnectControlledCloudMode();
      return;
    }
    try {
      effects.cloudPreset = "cumulus";
      effects.cloudCoverage = 1.0;
      effects.cloudDensity = 1.0;
      scene.canvas.width = 64;
      scene.canvas.height = 32;
      const resources = effects._pipeline._resources;
      const originalLinear = resources.cloudProgram;
      const originalLogarithmic = resources.cloudLogDepthProgram;
      const localSunAsGlobeMutationSource = cloudFragmentSource.replace(
        "        globeSunDirection,\n        primaryLightScale,",
        "        localSunDirection,\n        primaryLightScale,",
      );
      expect(localSunAsGlobeMutationSource).not.toBe(cloudFragmentSource);
      const localSunAsGlobeMutationProgram =
        createEnvironmentEffectsProgramForSpecs(
          scene.context,
          localSunAsGlobeMutationSource,
          true,
        );
      effects.cloudPreset = "mixed";
      effects.cloudCoverage = 0.4;
      effects.cloudDensity = 0.5;
      effects.cloudTime = 0.0;
      effects.cloudRadianceScale = 2.0;
      effects.backgroundRadianceScale = 4.0;
      effects.showCloudShadows = false;
      effects.showCrepuscularRays = false;
      renderControlledCloudSample(
        "globe",
        { x: 150000.0, y: 80000.0 },
        false,
        false,
        Cartesian3.normalize(new Cartesian3(0.15, 0.1, -1.0), new Cartesian3()),
        200000.0,
        8000.0,
      );
      const baseEast = Cartesian3.clone(
        effects._pipeline._frame.east,
        new Cartesian3(),
      );
      const baseNorth = Cartesian3.clone(
        effects._pipeline._frame.north,
        new Cartesian3(),
      );
      const baseVertical = Cartesian3.clone(
        effects._pipeline._frame.vertical,
        new Cartesian3(),
      );
      const rotatedEast = Cartesian3.clone(baseNorth, new Cartesian3());
      const rotatedNorth = Cartesian3.negate(baseEast, new Cartesian3());
      let testEast = baseEast;
      let testNorth = baseNorth;
      const originalEastUniform = effects._pipeline._uniformMap.u_east;
      const originalNorthUniform = effects._pipeline._uniformMap.u_north;
      const originalVerticalUniform = effects._pipeline._uniformMap.u_vertical;
      const originalSunUniform = effects._pipeline._uniformMap.u_sunDirection;
      const originalStbnSliceUniform =
        effects._pipeline._uniformMap.u_cloudStbnSlice;
      effects._pipeline._uniformMap.u_east = () => testEast;
      effects._pipeline._uniformMap.u_north = () => testNorth;
      effects._pipeline._uniformMap.u_vertical = () => baseVertical;
      let testGlobeSun = baseVertical;
      effects._pipeline._uniformMap.u_sunDirection = () => testGlobeSun;
      effects._pipeline._uniformMap.u_cloudStbnSlice = () => 0.5 / 64.0;
      const renderSunFrameAuthority = function (program, east, north) {
        resources.cloudProgram = program;
        resources.cloudLogDepthProgram = program;
        testEast = east;
        testNorth = north;
        effects._pipeline.invalidateCloudHistory();
        scene.renderForSpecs();
        return readCloudMrtRawBits();
      };
      for (const elevationDegrees of [47.046, 2.175]) {
        const elevation = CesiumMath.toRadians(elevationDegrees);
        testGlobeSun = Cartesian3.normalize(
          Cartesian3.add(
            Cartesian3.multiplyByScalar(
              baseNorth,
              Math.cos(elevation),
              new Cartesian3(),
            ),
            Cartesian3.multiplyByScalar(
              baseVertical,
              Math.sin(elevation),
              new Cartesian3(),
            ),
            new Cartesian3(),
          ),
          new Cartesian3(),
        );
        const productBase = renderSunFrameAuthority(
          originalLinear,
          baseEast,
          baseNorth,
        );
        const productRotated = renderSunFrameAuthority(
          originalLinear,
          rotatedEast,
          rotatedNorth,
        );
        expect(
          productRotated.color.every((value, index) => {
            const rotated = decodeFloat16(value);
            const baseline = decodeFloat16(productBase.color[index]);
            return (
              Math.abs(rotated - baseline) <=
              Math.max(0.002, Math.abs(baseline) * 0.02)
            );
          }),
        )
          .withContext(
            `ECEF incident Sun is invariant to ENU presentation at ${elevationDegrees} degrees`,
          )
          .toBe(true);
        expect(
          productRotated.distance.every(
            (value, index) => value === productBase.distance[index],
          ),
        ).toBe(true);
        const mutationRotated = renderSunFrameAuthority(
          localSunAsGlobeMutationProgram,
          rotatedEast,
          rotatedNorth,
        );
        expect(
          mutationRotated.color.some(
            (value, index) => value !== productRotated.color[index],
          ),
        )
          .withContext(
            `local ENU Sun interpreted as ECEF mutation at ${elevationDegrees} degrees`,
          )
          .toBe(true);
      }
      effects._pipeline._uniformMap.u_east = originalEastUniform;
      effects._pipeline._uniformMap.u_north = originalNorthUniform;
      effects._pipeline._uniformMap.u_vertical = originalVerticalUniform;
      effects._pipeline._uniformMap.u_sunDirection = originalSunUniform;
      effects._pipeline._uniformMap.u_cloudStbnSlice = originalStbnSliceUniform;
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
      localSunAsGlobeMutationProgram.destroy();
      effects.showCloudShadows = true;
      effects.showCrepuscularRays = true;
      effects.cloudDensity = 1.0;
      const entryMutationSource = globeCloudSource.replace(
        "return exp2(mipLevel);",
        "return 1.0;",
      );
      expect(entryMutationSource).not.toBe(globeCloudSource);
      const entryMutationProgram = createEnvironmentEffectsProgramForSpecs(
        scene.context,
        cloudFragmentSource,
        true,
        undefined,
        cloudSource,
        entryMutationSource,
      );
      const highAltitudeDirection = Cartesian3.normalize(
        new Cartesian3(0.15, 0.2, -0.968),
        new Cartesian3(),
      );
      effects.cloudPreset = "mixed";
      effects.cloudCoverage = 0.3;
      effects.cloudQuality = "high";
      const productHighAltitude = renderControlledCloudSample(
        "globe",
        { x: 120000.0, y: 60000.0 },
        false,
        false,
        highAltitudeDirection,
        300000.0,
        100000.0,
      );
      resources.cloudProgram = entryMutationProgram;
      resources.cloudLogDepthProgram = entryMutationProgram;
      const distanceOnlyHighAltitude = renderControlledCloudSample(
        "globe",
        { x: 120000.0, y: 60000.0 },
        false,
        false,
        highAltitudeDirection,
        300000.0,
        100000.0,
      );
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
      entryMutationProgram.destroy();
      expect(
        productHighAltitude.liveRaw.color.some(
          (value, index) =>
            value !== distanceOnlyHighAltitude.liveRaw.color[index],
        ),
      )
        .withContext("production high-altitude entry-footprint mutation")
        .toBe(true);

      effects.cloudPreset = "cumulus";
      effects.cloudCoverage = 1.0;
      installControlledCloudTestTextures("globe", false);
      const footprintIncidentFragment = `precision highp float;
        uniform sampler2D u_transmittanceTexture;
        uniform sampler2D u_irradianceTexture;
        void main() {
          vec3 globePosition = normalize(vec3(
            1.0,
            (gl_FragCoord.x - 0.5) * 0.02,
            0.1)) * (SCENEGIS_BOTTOM_RADIUS + 2000.0);
          vec3 sunDirection = normalize(vec3(0.8, 0.1, 0.6));
          float actualFootprint = sceneGISGlobeCloudEntryTexelsPerPixel(
            globePosition,
            vec2(9.0, 3.0),
            vec2(17.0, 5.0),
            100000.0,
            6250.0);
          vec3 actualSun;
          vec3 actualSky;
          sceneGISCloudIncidentIrradiance(
            u_transmittanceTexture,
            u_irradianceTexture,
            vec3(0.0, 0.0, 2000.0),
            globePosition,
            sunDirection,
            sunDirection,
            vec3(1.0),
            actualSun,
            actualSky);
          AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
          vec3 expectedSky;
          vec3 expectedSun = GetSunAndSkyScalarIrradiance(
            atmosphere,
            u_transmittanceTexture,
            u_irradianceTexture,
            globePosition * 0.001,
            sunDirection,
            expectedSky);
          float incidentError = max(
            max(abs(actualSun.r - expectedSun.r),
                abs(actualSun.g - expectedSun.g)),
            max(abs(actualSun.b - expectedSun.b),
                max(abs(actualSky.r - expectedSky.r),
                    max(abs(actualSky.g - expectedSky.g),
                        abs(actualSky.b - expectedSky.b)))));
          vec3 ground = sceneGISGlobeCloudGroundSource(
            u_transmittanceTexture,
            u_irradianceTexture,
            globePosition,
            sunDirection,
            sunDirection,
            vec3(1.0),
            1.0,
            0.25);
          vec3 surfaceNormal = normalize(globePosition);
          float height = length(globePosition) - SCENEGIS_BOTTOM_RADIUS;
          vec3 groundPoint =
            (globePosition - surfaceNormal * height) * 0.001;
          vec3 expectedGroundSky;
          vec3 expectedGroundSun = GetSunAndSkyIrradiance(
            atmosphere,
            u_transmittanceTexture,
            u_irradianceTexture,
            groundPoint,
            surfaceNormal,
            sunDirection,
            expectedGroundSky);
          vec3 expectedGround = 0.3 / czm_pi *
            (expectedGroundSky + (1.0 - 1.0) * expectedGroundSun) *
            exp(-0.25) * (1.0 / (4.0 * czm_pi));
          float groundError = max(
            abs(ground.r - expectedGround.r),
            max(abs(ground.g - expectedGround.g),
                abs(ground.b - expectedGround.b)));
          out_FragColor = vec4(
            actualFootprint,
            incidentError,
            groundError,
            1.0);
        }`;
      const normalizedIncidentMutationSource = cloudSource.replace(
        "vec3 point = globePosition * 0.001;",
        "vec3 point = globePosition * 0.001; sunIrradiance = vec3(1.0); skyIrradiance = vec3(0.0); return;",
      );
      expect(entryMutationSource).not.toBe(globeCloudSource);
      expect(normalizedIncidentMutationSource).not.toBe(cloudSource);
      const renderFootprintIncident = function (globeLibrary, cloudLibrary) {
        return executeHalfFloatQuad(
          [
            brunetonDefinitionsSource,
            brunetonCommonSource,
            brunetonRuntimeSource,
            atmosphereSource,
            cloudShadowSource,
            globeLibrary,
            cloudLibrary,
            footprintIncidentFragment,
          ],
          {
            width: 9,
            height: 3,
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
              u_transmittanceTexture: () =>
                effects._pipeline._resources.transmittanceTexture,
              u_irradianceTexture: () =>
                effects._pipeline._resources.irradianceTexture,
            },
          },
        );
      };
      const footprintIncident = renderFootprintIncident(
        globeCloudSource,
        cloudSource,
      );
      const entryMutation = renderFootprintIncident(
        entryMutationSource,
        cloudSource,
      );
      const incidentMutation = renderFootprintIncident(
        globeCloudSource,
        normalizedIncidentMutationSource,
      );
      const cubeSphereUv = function (x) {
        const length = Math.hypot(1.0, x * 0.02, 0.1);
        const faceX = (x * 0.02) / length;
        const faceY = 0.1 / length;
        const squaredX = faceX * faceX;
        const squaredY = faceY * faceY;
        const q = -2.0 * squaredX + 2.0 * squaredY - 3.0;
        let mappedX = Math.sqrt(
          Math.max(
            1.5 +
              squaredX -
              squaredY -
              0.5 * Math.sqrt(Math.max(-24.0 * squaredX + q * q, 0.0)),
            0.0,
          ),
        );
        mappedX *= faceX > 0.0 ? 1.0 : -1.0;
        const mappedY =
          Math.sqrt(
            Math.max(6.0 / Math.max(3.0 - mappedX * mappedX, 1.0e-4), 0.0),
          ) * faceY;
        return [(mappedX * 0.5 + 0.5) * 2000.0, (mappedY * 0.5 + 0.5) * 800.0];
      };
      const referenceFootprints = [];
      for (let x = 0; x < 8; x += 2) {
        const firstUv = cubeSphereUv(x);
        const secondUv = cubeSphereUv(x + 1);
        const derivativeX = [
          (secondUv[0] - firstUv[0]) * 1.8,
          (secondUv[1] - firstUv[1]) * 1.8,
        ];
        const maximumDeltaSquared =
          (derivativeX[0] * derivativeX[0] + derivativeX[1] * derivativeX[1]) *
          0.1;
        const referenceMip =
          Math.max(0.0, 0.5 * Math.log2(Math.max(1.0, maximumDeltaSquared))) *
          0.25;
        const footprint = 2 ** referenceMip;
        referenceFootprints.push(footprint, footprint);
      }
      for (let index = 0; index < footprintIncident.length; index++) {
        const x = index % 9;
        if (x === 8) {
          continue;
        }
        const pixel = footprintIncident[index];
        expect(pixel[0])
          .withContext(`independent quarter-rate footprint pixel ${index}`)
          .toEqualEpsilon(referenceFootprints[x], 0.01);
        expect(pixel[1]).toEqualEpsilon(0.0, 0.002);
        expect(pixel[2]).toEqualEpsilon(0.0, 0.002);
      }
      expect(
        entryMutation.some((pixel, index) => {
          const x = index % 9;
          return x < 8 && Math.abs(pixel[0] - referenceFootprints[x]) > 0.01;
        }),
      )
        .withContext("distance-only entry-footprint mutation")
        .toBe(true);
      expect(incidentMutation.some((pixel) => pixel[1] > 0.01))
        .withContext("normalized incident-source mutation")
        .toBe(true);

      expect(globeShapeDetailLodMutationSource).not.toBe(globeCloudSource);
      const mippedShapeTexture = createMipWitnessTexture(true, false);
      const mippedDetailTexture = createMipWitnessTexture(true, true);
      const originalShapeTexture = resources.cloudShapeTexture;
      const originalDetailTexture = resources.cloudDetailTexture;
      effects.cloudPreset = "mixed";
      effects.cloudCoverage = 1.0;
      effects.cloudQuality = "high";
      resources.cloudShapeTexture = mippedShapeTexture;
      resources.cloudDetailTexture = mippedDetailTexture;
      const productSamplingVisible = renderControlledCloudSample(
        "globe",
        { x: 120000.0, y: 60000.0 },
        false,
        false,
        highAltitudeDirection,
        300000.0,
        100000.0,
      );
      const shapeDetailLodMutationProgram =
        createEnvironmentEffectsProgramForSpecs(
          scene.context,
          cloudFragmentSource,
          true,
          undefined,
          cloudSource,
          globeShapeDetailLodMutationSource,
        );
      resources.cloudShapeTexture = mippedShapeTexture;
      resources.cloudDetailTexture = mippedDetailTexture;
      resources.cloudProgram = shapeDetailLodMutationProgram;
      resources.cloudLogDepthProgram = shapeDetailLodMutationProgram;
      const mippedVisible = renderControlledCloudSample(
        "globe",
        { x: 120000.0, y: 60000.0 },
        false,
        false,
        highAltitudeDirection,
        300000.0,
        100000.0,
      );
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
      resources.cloudShapeTexture = originalShapeTexture;
      resources.cloudDetailTexture = originalDetailTexture;
      shapeDetailLodMutationProgram.destroy();
      mippedShapeTexture.destroy();
      mippedDetailTexture.destroy();
      expect(
        productSamplingVisible.liveRaw.color.some(
          (value, index) => value !== mippedVisible.liveRaw.color[index],
        ),
      )
        .withContext("visible CloudFS rejects shape/detail material LOD")
        .toBe(true);
      installControlledCloudTestTextures("globe", false);
      const integrated = renderGlobeCloudReferenceProbe(false);
      const components = renderGlobeCloudReferenceProbe(true);
      const secondary = renderGlobeCloudReferenceProbe(
        false,
        800.0,
        globeCloudSource,
        cloudSource,
        true,
      );
      const customSecondary = renderGlobeCloudReferenceProbe(
        false,
        800.0,
        globeCloudSource,
        customSecondaryScheduleSource,
        true,
      );

      const referenceLayerHeightFraction = 550.0 / 1200.0;
      const density = 0.2 * (0.75 * referenceLayerHeightFraction + 0.25);
      const heightGradient = 0.5 + 0.5 * referenceLayerHeightFraction;
      const opticalDepth = density * effects.cloudDensity;
      const transmittance = Math.exp(-opticalDepth);
      const opacity = 1.0 - transmittance;
      const powder =
        1.0 - 0.8 * Math.exp(-density * effects.cloudDensity * 150.0);
      const expectNear = function (actual, expected, context) {
        expect(Math.abs(actual - expected))
          .withContext(context)
          .toBeLessThanOrEqual(Math.max(0.002, Math.abs(expected) * 0.004));
      };

      const overlapHeight = 550.0;
      const firstHeightFraction = overlapHeight / 650.0;
      const secondHeightFraction = (overlapHeight - 250.0) / 1200.0;
      const firstDensity = 0.2 * (0.75 * firstHeightFraction + 0.25);
      const secondDensity = 0.2 * (0.75 * secondHeightFraction + 0.25);
      const overlapDensity = firstDensity + secondDensity;
      const overlapGradient =
        (firstDensity * (0.5 + 0.5 * firstHeightFraction) +
          secondDensity * (0.5 + 0.5 * secondHeightFraction)) /
        overlapDensity;
      const overlap = renderGlobeCloudReferenceProbe(
        false,
        overlapHeight,
        uniformHeightCoverageSource,
      );
      const normalizedCoefficient = renderGlobeCloudReferenceProbe(
        false,
        overlapHeight,
        normalizedCoefficientSource,
      );
      const densityAtSecondaryDistance = function (distance) {
        const heightFraction = (550.0 + distance) / 1200.0;
        return 0.2 * (0.75 * heightFraction + 0.25);
      };
      const referenceSecondaryOpticalDepth =
        densityAtSecondaryDistance(25.0) * 50.0 +
        densityAtSecondaryDistance(75.0) * 100.0;

      expectNear(integrated.color[0], density, "density");
      expectNear(integrated.color[1], opticalDepth, "optical depth");
      expectNear(integrated.color[2], transmittance, "transmittance");
      expectNear(integrated.color[3], heightGradient, "height gradient");
      expectNear(integrated.distance[3], opacity, "integrated opacity");
      expectNear(components.color[3], powder, "local powder");
      expectNear(components.distance[3], heightGradient, "component gradient");
      expectNear(overlap.color[0], overlapDensity, "overlapping layer density");
      expectNear(
        overlap.color[1],
        overlapDensity * effects.cloudDensity,
        "overlapping layer optical depth",
      );
      expectNear(
        overlap.color[3],
        overlapGradient,
        "overlapping layer height gradient",
      );
      expect(normalizedCoefficient.color[0])
        .withContext("normalized 0.005-era coefficient mutation")
        .toBeGreaterThan(overlap.color[0] * 4.0);
      expectNear(
        secondary.color[0],
        referenceSecondaryOpticalDepth,
        "reference 50 + 100 metre Sun schedule",
      );
      expectNear(secondary.color[1], 75.0, "reference Sun covered distance");
      expect(customSecondary.color[0])
        .withContext("pre-A8 custom secondary schedule mutation")
        .toBeGreaterThan(secondary.color[0] * 2.0);
      for (let channel = 0; channel < 3; channel++) {
        expect(Number.isFinite(components.color[channel])).toBe(true);
        expect(Number.isFinite(components.distance[channel])).toBe(true);
        expect(Number.isFinite(integrated.distance[channel])).toBe(true);
        expect(components.color[channel]).toBeGreaterThanOrEqual(0.0);
        expect(components.distance[channel]).toBeGreaterThanOrEqual(0.0);
        expect(integrated.distance[channel]).toBeGreaterThanOrEqual(0.0);
      }
    } finally {
      disconnectControlledCloudMode();
    }
  });
  it("uses pinned Globe reference textures and isolates radiance calibration on the actual GPU", async function () {
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
        width,
        height,
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
    const phase = {
      x: CesiumMath.toRadians(15.0) * 6360000.0,
      y: CesiumMath.toRadians(45.0) * 6360000.0,
    };
    const direction = Cartesian3.normalize(
      new Cartesian3(0.1, 0.98, 0.18),
      new Cartesian3(),
    );
    const render = function (radianceScale) {
      effects.cloudRadianceScale = radianceScale;
      effects._pipeline.invalidateCloudHistory("spec-a8-ar-010-reference");
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
      effects.cloudDensity = 1.0;
      effects.cloudTime = 0.0;
      installFixedCloudStbn();
      const radiance = {};
      for (const scale of [0, 1, 48]) {
        radiance[scale] = render(scale);
      }
      const reference = radiance[1];
      expect(reference.width).toBe(scene.context.drawingBufferWidth);
      expect(reference.height).toBe(scene.context.drawingBufferHeight);
      expect(resources.cloudShapeTexture.width).toBe(128);
      expect(resources.cloudShapeTexture.depth).toBe(128);
      expect(resources.cloudShapeTexture.pixelFormat).toBe(PixelFormat.RED);
      expect(resources.cloudDetailTexture.width).toBe(32);
      expect(resources.cloudDetailTexture.depth).toBe(32);
      expect(resources.cloudDetailTexture.pixelFormat).toBe(PixelFormat.RED);
      expect(resources.cloudWeatherTexture.width).toBe(512);
      expect(resources.cloudWeatherTexture.height).toBe(512);
      expect(reference.activePixels).toBeGreaterThan(0);
      expect(reference.transitionDensity).toBeGreaterThan(0.0);
      expect(reference.connectedBodies).toBeGreaterThan(0);
      expect(reference.largestBodyFraction).toBeGreaterThan(0.0);
      expect(reference.opacity[2]).toBeGreaterThan(0.0);
      expect(reference.maximumRgb).toBeLessThan(65504.0);
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
            .toBeLessThan(0.03);
        }
        expect(radiance[scale].maximumRgb).toBeLessThan(65504.0);
      }
      expect(radiance[0].rawY).toEqual([0.0, 0.0, 0.0]);
      expect(Number.isFinite(reference.d65Distance)).toBe(true);
      expect(reference.interiorPixels).toBeGreaterThan(0);
    } finally {
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
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
    const exhaustiveCloudSource = cloudSource
      .replace("if (occupancy <= 1.0e-5) {", "if (false) {")
      .replace(
        "progressiveDistance += nextProgressiveStepLength;",
        `if (occupancy <= 1.0e-5) {
            progressiveDistance = coarseEndDistance;
        } else {
            progressiveDistance += nextProgressiveStepLength;
        }`,
      );
    const cameraRelativeCloudSource = cloudSource.replace(
      `    vec3 worldPosition = surfacePosition +
        east * localPosition.x +
        north * localPosition.y +
        vertical * localPosition.z;
    vec3 centeredPosition = worldPosition - ellipsoidCenter;
    vec3 radiiSquared = ellipsoidRadii * ellipsoidRadii;
    vec3 geodeticNormal = normalize(centeredPosition / radiiSquared);
    float surfaceScale = inversesqrt(dot(
        radiiSquared,
        geodeticNormal * geodeticNormal));
    vec3 ellipsoidSurface =
        radiiSquared * geodeticNormal * surfaceScale;
    float height = dot(
        centeredPosition - ellipsoidSurface,
        geodeticNormal);
    return geodeticNormal * (SCENEGIS_BOTTOM_RADIUS + height);`,
      `    return normalize(vertical) * SCENEGIS_BOTTOM_RADIUS +
        east * localPosition.x +
        north * localPosition.y +
        vertical * localPosition.z;`,
    );
    expect(exhaustiveCloudSource).not.toBe(cloudSource);
    expect(cloudSource).not.toContain("SCENEGIS_CLOUD_ENTRY_FADE");
    expect(cameraRelativeCloudSource).not.toBe(cloudSource);

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
    const cameraRelativePrograms = createPair(cameraRelativeCloudSource);
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

        resources.cloudProgram = cameraRelativePrograms.linear;
        resources.cloudLogDepthProgram = cameraRelativePrograms.logarithmic;
        const cameraRelative = renderControlledCloudSample(
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
                cameraRelative.liveRaw.color[index],
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
      installControlledCloudTestTextures("globe");
      scene.canvas.width = 65;
      scene.canvas.height = 33;
      const horizonDirection = Cartesian3.clone(Cartesian3.UNIT_Y);
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
      const horizon = renderControlledCloudSample(
        "globe",
        phase,
        false,
        false,
        horizonDirection,
        200000.0,
      );
      expect(1.0 - horizon.liveColor[3]).toBeGreaterThan(0.05);
      expect(horizon.liveColor.every(Number.isFinite)).toBe(true);
      expect(maximumMutationDelta)
        .withContext("camera-relative cloud-material mutation rejected")
        .toBeGreaterThan(0);
    } finally {
      resources.cloudProgram = originalLinear;
      resources.cloudLogDepthProgram = originalLogarithmic;
      exhaustivePrograms.linear.destroy();
      exhaustivePrograms.logarithmic.destroy();
      cameraRelativePrograms.linear.destroy();
      cameraRelativePrograms.logarithmic.destroy();
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
        createThinCloudBuffers(mode),
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
    const exhaustiveCloudSource = cloudSource
      .replace("if (occupancy <= 1.0e-5) {", "if (false) {")
      .replace(
        "progressiveDistance += nextProgressiveStepLength;",
        `if (occupancy <= 1.0e-5) {
            progressiveDistance = coarseEndDistance;
        } else {
            progressiveDistance += nextProgressiveStepLength;
        }`,
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
        createThinCloudBuffers(mode),
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
        let differingPixels = 0;
        let maximumColorDelta = 0.0;
        let maximumTransmittanceDelta = 0.0;
        let firstDifference;
        for (let index = 0; index < product.liveSamples.length; index++) {
          const productColor = product.liveSamples[index].color;
          const exhaustiveColor = exhaustive.liveSamples[index].color;
          let differs = false;
          for (let channel = 0; channel < 4; channel++) {
            const delta = Math.abs(
              productColor[channel] - exhaustiveColor[channel],
            );
            maximumColorDelta = Math.max(maximumColorDelta, delta);
            differs ||= delta > 0.0;
            if (channel === 3) {
              maximumTransmittanceDelta = Math.max(
                maximumTransmittanceDelta,
                delta,
              );
            }
          }
          if (differs) {
            differingPixels++;
            firstDifference ??= {
              index,
              productColor,
              exhaustiveColor,
              productDistances: product.liveSamples[index].distances,
              exhaustiveDistances: exhaustive.liveSamples[index].distances,
            };
          }
        }
        const occupancyComparison = JSON.stringify({
          mode,
          differingPixels,
          maximumColorDelta,
          maximumTransmittanceDelta,
          firstDifference,
        });
        expect(maximumColorDelta)
          .withContext(
            `${mode} occupancy color versus exhaustive density ${occupancyComparison}`,
          )
          .toBeLessThanOrEqual(0.0005);
        expect(maximumTransmittanceDelta)
          .withContext(
            `${mode} occupancy transmittance versus exhaustive density ${occupancyComparison}`,
          )
          .toBe(0.0);
        expect(product.liveRaw.distance)
          .withContext(`${mode} occupancy distance versus exhaustive density`)
          .toEqual(exhaustive.liveRaw.distance);
        let supportedPixels = 0;
        let attenuatedSupportedPixels = 0;
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
          if (accelerated.color[3] < 1.0) {
            attenuatedSupportedPixels++;
          }
        }
        expect(supportedPixels).withContext(mode).toBeGreaterThan(0);
        expect(attenuatedSupportedPixels).withContext(mode).toBeGreaterThan(0);
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
              active: distances[3] > 0.5 && opacity > 0.0,
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
      expect(planarSamples.length).withContext(phaseContext).toBeGreaterThan(0);
      expect(globeSamples.length).withContext(phaseContext).toBeGreaterThan(0);
      let phaseActive = false;
      for (const mode of ["planar", "globe"]) {
        const samples = results[mode][index];
        for (let pixel = 0; pixel < samples.length; pixel++) {
          const sample = samples[pixel];
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
            .toBeLessThanOrEqual(1000000.0);
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
              result.maxCoarse = Math.max(result.maxCoarse, value[0]);
              return result;
            },
            {
              rays: 0,
              coarse: 0,
              fine: 0,
              skipped: 0,
              earlyOut: 0,
              maxCoarse: 0,
            },
          );
          reports[mode][preset] = summary;
          const context = JSON.stringify({ mode, preset, summary });
          expect(summary.rays).withContext(context).toBeGreaterThan(0);
          expect(summary.coarse)
            .withContext(context)
            .toBeLessThanOrEqual(summary.rays * (mode === "globe" ? 500 : 64));
          expect(summary.fine).withContext(context).toBeGreaterThan(0);
          expect(summary.fine)
            .withContext(context)
            .toBeLessThanOrEqual(
              (summary.coarse - summary.skipped) * (mode === "globe" ? 1 : 4),
            );
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
        const maximumCoarse = Math.max(
          ...Object.values(reports[mode]).map((value) => value.maxCoarse),
        );
        if (mode === "globe") {
          expect(maximumCoarse)
            .withContext("Globe progressive schedule exceeds the old ceiling")
            .toBeGreaterThan(64);
        } else {
          expect(maximumCoarse)
            .withContext("Planar retains the frozen uniform schedule")
            .toBeLessThanOrEqual(64);
        }
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
      // This MRT geometry fixture evaluates the legacy 1500-6000 m shell.
      cloudBaseHeight: 1500.0,
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
      effects._pipeline._currentFrameDepthAvailable = true;
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
    expect(cloudSource).toContain("SCENEGIS_GLOBE_CLOUD_MARCH_MAX_STEPS = 500");
    expect(cloudSource).toContain("SCENEGIS_GLOBE_CLOUD_LOW_MARCH_STEPS = 200");
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
    expect(cloudSource).not.toContain("SCENEGIS_CLOUD_ENTRY_FADE");
    expect(cloudSource).toContain("#ifndef SCENEGIS_GLOBE");
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
      "totalSource = (solarScattering + groundSource + skySource) * localPowder",
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
    expect(runtimeTexture3DPrototype.generateMipmap).toEqual(
      jasmine.any(Function),
    );
    expect(runtimeTexture3DPrototype.destroy).toEqual(jasmine.any(Function));
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
    effects.showBloom = false;
    effects.showLensFlare = false;
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

      const stableTerrainDistances = executeHalfFloatQuad(
        [
          brunetonDefinitionsSource,
          brunetonCommonSource,
          brunetonRuntimeSource,
          atmosphereSource,
          heightFogSource,
          `precision highp float;
          void main() {
            vec3 down = vec3(0.0, 0.0, -1.0);
            float nearDistance = sceneGISGlobeStableTerrainDistance(
              vec3(0.0, 0.0, 1000.0), down, 500.0);
            float farGroundDistance = sceneGISGlobeStableTerrainDistance(
              vec3(0.0, 0.0, 100000.0), down, 100000.0);
            float farLodDistance = sceneGISGlobeStableTerrainDistance(
              vec3(0.0, 0.0, 100000.0), down, 98000.0);
            float highCameraShortDepth = sceneGISGlobeStableTerrainDistance(
              vec3(0.0, 0.0, 100000.0), down, 4000.0);
            out_FragColor = vec4(
              nearDistance / 10000.0,
              farGroundDistance / 200000.0,
              farLodDistance / 200000.0,
              highCameraShortDepth / 200000.0);
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
        },
      )[0];
      expect(stableTerrainDistances[0] * 10000.0).toEqualEpsilon(500.0, 8.0);
      expect(stableTerrainDistances[1] * 200000.0).toEqualEpsilon(
        100000.0,
        64.0,
      );
      expect(
        (stableTerrainDistances[1] - stableTerrainDistances[2]) * 200000.0,
      ).toEqualEpsilon(0.0, 64.0);
      expect(stableTerrainDistances[3] * 200000.0).toEqualEpsilon(
        100000.0,
        64.0,
      );

      const clearDepthTexture = new Texture({
        context: scene.context,
        width: capturedDepthTexture.width,
        height: capturedDepthTexture.height,
        pixelFormat: PixelFormat.DEPTH_COMPONENT,
        pixelDatatype: PixelDatatype.UNSIGNED_INT,
      });
      const clearDepthColorTexture = new Texture({
        context: scene.context,
        width: capturedDepthTexture.width,
        height: capturedDepthTexture.height,
      });
      const stableInputValues = new Uint8Array(
        capturedDepthTexture.width * capturedDepthTexture.height * 4,
      );
      for (let index = 0; index < stableInputValues.length; index += 4) {
        stableInputValues[index] = 96;
        stableInputValues[index + 1] = 112;
        stableInputValues[index + 2] = 128;
        stableInputValues[index + 3] = 255;
      }
      const stableInputTexture = new Texture({
        context: scene.context,
        width: capturedDepthTexture.width,
        height: capturedDepthTexture.height,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
        source: {
          width: capturedDepthTexture.width,
          height: capturedDepthTexture.height,
          arrayBufferView: stableInputValues,
        },
      });
      const clearDepthFramebuffer = new Framebuffer({
        context: scene.context,
        colorTextures: [clearDepthColorTexture],
        depthTexture: clearDepthTexture,
        destroyAttachments: false,
      });
      new ClearCommand({
        color: Color.BLACK,
        depth: 1.0,
        framebuffer: clearDepthFramebuffer,
      }).execute(scene.context);
      const staleSceneDepthTexture = capturedDepthTexture;
      const currentFrustums = scene._view.frustumCommandsList.slice();
      try {
        effects.showAerialPerspective = false;
        effects.showHeightFog = true;
        scene._view.frustumCommandsList.length = 0;
        const staleDepthOutput = effects._pipeline._executeHdr(
          scene,
          scene.context,
          stableInputTexture,
          staleSceneDepthTexture,
          scene.context.defaultTexture,
        );
        const staleDepthBits = readHalfTextureRawBits(staleDepthOutput);
        expect(effects._pipeline._uniformMap.u_hasCurrentGlobeDepth()).toBe(
          false,
        );
        const clearDepthOutput = effects._pipeline._executeHdr(
          scene,
          scene.context,
          stableInputTexture,
          clearDepthTexture,
          scene.context.defaultTexture,
        );
        const clearDepthBits = readHalfTextureRawBits(clearDepthOutput);
        const staleClearDifferenceCount = Array.from(staleDepthBits).reduce(
          (count, value, index) =>
            count + (value === clearDepthBits[index] ? 0 : 1),
          0,
        );
        expect(staleClearDifferenceCount).toBe(0);

        scene._view.frustumCommandsList.push(...currentFrustums);
        const currentDepthOutput = effects._pipeline._executeHdr(
          scene,
          scene.context,
          stableInputTexture,
          staleSceneDepthTexture,
          scene.context.defaultTexture,
        );
        expect(effects._pipeline._uniformMap.u_hasCurrentGlobeDepth()).toBe(
          true,
        );
        const currentDepthBits = readHalfTextureRawBits(currentDepthOutput);
        const currentStaleDifferenceCount = Array.from(staleDepthBits).reduce(
          (count, value, index) =>
            count + (value === currentDepthBits[index] ? 0 : 1),
          0,
        );
        expect(currentStaleDifferenceCount).toBeGreaterThan(0);
      } finally {
        scene._view.frustumCommandsList.length = 0;
        scene._view.frustumCommandsList.push(...currentFrustums);
        clearDepthFramebuffer.destroy();
        clearDepthColorTexture.destroy();
        clearDepthTexture.destroy();
        stableInputTexture.destroy();
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
