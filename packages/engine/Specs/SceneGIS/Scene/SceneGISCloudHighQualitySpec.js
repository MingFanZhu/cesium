import {
  BoundingRectangle,
  Cartesian2,
  Cartesian3,
  Cartesian4,
  Framebuffer,
  PassState,
  PixelDatatype,
  PixelFormat,
  Sampler,
  SceneGISEnvironmentEffects,
  Texture,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import { createEnvironmentEffectsProgramForSpecs } from "../../../Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js";
import resolveSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS.js";
import producerSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsCloudFS.js";

describe("SceneGIS/Scene/SceneGISCloudHighQuality", function () {
  let scene;
  let textures;
  let programs;
  let uniforms;
  let currentColor;
  let currentDistance;
  let historyColor;
  let historyDistance;
  let depth;
  let valid;
  let moving;
  const size = 9;
  const frustum = new Cartesian4(-0.1, 0.1, -0.1, 0.1);
  const empty = [0, 0, 0, 1];
  const history = [18, 18, 18, 0.75];

  function decodeHalf(bits) {
    const sign = bits >> 15 ? -1 : 1;
    const exponent = (bits >> 10) & 31;
    const fraction = bits & 1023;
    if (exponent === 31) {
      return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
    }
    return (
      sign *
      (exponent === 0
        ? fraction * 2 ** -24
        : (1 + fraction / 1024) * 2 ** (exponent - 15))
    );
  }

  function texture(sample, width = size) {
    const values = Array.from({ length: width * width }, (_, i) =>
      sample(i % width, Math.floor(i / width)),
    ).flat();
    const result = new Texture({
      context: scene.context,
      width,
      height: width,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      sampler: Sampler.NEAREST,
      flipY: false,
      source: { arrayBufferView: new Float32Array(values) },
    });
    textures.push(result);
    return result;
  }

  function rayLength(x, y) {
    return Math.hypot(
      -0.1 + ((x + 0.5) * 0.2) / size,
      -0.1 + ((y + 0.5) * 0.2) / size,
      1,
    );
  }

  function distances(mean = 2000, front = 1800, receiver = 10000) {
    return texture((x, y) => [
      mean / 1e6,
      front / 1e6,
      (receiver * rayLength(x, y)) / 1e6,
      1,
    ]);
  }

  function initialize() {
    scene = createScene();
    textures = [];
    programs = [];
    if (!SceneGISEnvironmentEffects.isSupported(scene)) {
      pending("Floating-point cloud rendering is unavailable");
    }
    scene.renderForSpecs();
    valid = true;
    moving = false;
    depth = texture(() => [10000, 0, 0, 1]);
    currentColor = texture((x, y) => {
      const value = (x + y) % 2 === 0 ? 0.2 : 0.8;
      return [25 * value, 25 * value, 25 * value, value];
    });
    currentDistance = distances();
    historyColor = texture(() => history);
    historyDistance = distances();
    uniforms = {
      u_depthTexture: () => depth,
      u_cloudLowColorTexture: () => currentColor,
      u_cloudLowDistanceTexture: () => currentDistance,
      u_cloudHistoryColorTexture: () => historyColor,
      u_cloudHistoryDistanceTexture: () => historyDistance,
      u_cloudTracePhased: () => false,
      u_cloudStbnSlice: () => 0.5 / 64,
      u_cloudHistoryValid: () => valid,
      u_cloudHistoryWeight: () => (moving ? 0.82 : 0.9),
      u_cloudHistoryReprojection: () => moving,
      u_hasCurrentGlobeDepth: () => true,
      u_linearSceneDepth: () => true,
      u_sceneDepthPerspective: () => true,
      u_sceneDepthFrustum: () => frustum,
      u_perspective: () => true,
      u_cloudPreviousPerspective: () => true,
      u_frustum: () => frustum,
      u_cloudPreviousFrustum: () => frustum,
      u_cloudDepthOffset: () => Cartesian2.ZERO,
      u_cloudPreviousDepthOffset: () => Cartesian2.ZERO,
      u_cameraPosition: () => Cartesian3.ZERO,
      u_cloudPreviousCameraPosition: () => Cartesian3.ZERO,
      u_cameraDirection: () =>
        Cartesian3.negate(Cartesian3.UNIT_Z, new Cartesian3()),
      u_cloudPreviousCameraDirection: () =>
        Cartesian3.negate(Cartesian3.UNIT_Z, new Cartesian3()),
      u_cameraRight: () => Cartesian3.UNIT_X,
      u_cloudPreviousCameraRight: () => Cartesian3.UNIT_X,
      u_cameraUp: () => Cartesian3.UNIT_Y,
      u_cloudPreviousCameraUp: () => Cartesian3.UNIT_Y,
      u_east: () => Cartesian3.UNIT_X,
      u_cloudPreviousEast: () => Cartesian3.UNIT_X,
      u_north: () => Cartesian3.UNIT_Y,
      u_cloudPreviousNorth: () => Cartesian3.UNIT_Y,
      u_cloudOffset: () => Cartesian2.ZERO,
      u_cloudPreviousCloudOffset: () => Cartesian2.ZERO,
    };
  }

  function draw(source = resolveSource, x = 4, y = 4, attachments) {
    const context = scene.context;
    const output = [0, 1].map(() => {
      const result = new Texture({
        context,
        width: size,
        height: size,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
      });
      textures.push(result);
      return result;
    });
    const framebuffer = new Framebuffer({
      context,
      colorTextures: output,
      destroyAttachments: false,
    });
    const program = createEnvironmentEffectsProgramForSpecs(
      context,
      source,
      true,
    );
    programs.push(program);
    const command = context.createViewportQuadCommand(
      program._fragmentShaderSource,
      {
        framebuffer,
        uniformMap: uniforms,
      },
    );
    programs.push(command.shaderProgram);
    const pass = new PassState(context);
    pass.viewport = new BoundingRectangle(0, 0, size, size);
    try {
      command.execute(context, pass);
      attachments?.push(...output);
      return output.map((color) => {
        const read = new Framebuffer({
          context,
          colorTextures: [color],
          destroyAttachments: false,
        });
        try {
          return Array.from(
            context.readPixels({
              framebuffer: read,
              x,
              y,
              width: 1,
              height: 1,
            }),
            decodeHalf,
          );
        } finally {
          read.destroy();
        }
      });
    } finally {
      framebuffer.destroy();
    }
  }

  function spatial(x = 4, y = 4) {
    valid = false;
    const result = draw(resolveSource, x, y);
    valid = true;
    return result;
  }

  function publish(source = producerSource, dimensions = size, phased = false) {
    // Feed controlled march results through the actual producer publication
    // block, then consume its GPU attachment in the unmodified resolve pass.
    const publication = source.slice(
      source.indexOf("    bool publishSceneDistance = true;"),
      source.lastIndexOf("}"),
    );
    expect(publication).toContain("out_FragData_1 = cloudDistances;");
    const input = currentDistance;
    uniforms.u_inputCloudDistance = () => input;
    uniforms.u_cloudBufferDimensions = () =>
      new Cartesian2(dimensions, dimensions);
    uniforms.u_cloudTracePhased = () => phased;
    const attachments = [];
    const result = draw(
      `precision highp float;
      precision highp sampler3D;
      layout(location = 0) out vec4 out_FragData_0;
      layout(location = 1) out vec4 out_FragData_1;
      in vec2 v_textureCoordinates;
      uniform sampler2D u_inputCloudDistance;
      uniform sampler2D u_depthTexture;
      uniform vec2 u_cloudBufferDimensions;
      void main() {
          vec4 cloudDistances = texture(u_inputCloudDistance, v_textureCoordinates);
          float rawDepth = texture(u_depthTexture, v_textureCoordinates).r;
          bool isClearDepth = sceneGISIsClearResolvedDepth(rawDepth);
          vec4 eye = sceneGISScreenToEyeCoordinates(v_textureCoordinates, rawDepth);
          float distanceToGeometry = length(eye.xyz / eye.w);
          out_FragData_0 = vec4(0.0);
          ${publication}
      }`,
      4,
      4,
      attachments,
    );
    currentDistance = attachments[1];
    uniforms.u_cloudTracePhased = () => false;
    return result[1];
  }

  afterEach(function () {
    for (const program of programs ?? []) {
      program.destroy();
    }
    for (const resource of textures ?? []) {
      resource.destroy();
    }
    scene?.destroyForSpecs();
  });

  it("accumulates stationary stochastic depths and clipped HDR at full resolution", function () {
    initialize();
    const current = spatial();
    const oldPolicy = resolveSource.replace(
      "return u_cloudTracePhased || all(equal(",
      "return u_cloudTracePhased || false && all(equal(",
    );
    expect(oldPolicy).not.toBe(resolveSource);
    for (const mean of [2000, 1000]) {
      historyDistance = distances(mean, mean - 200);
      const result = draw();
      for (let c = 0; c < 4; c++) {
        expect(result[0][c])
          .withContext(`mean ${mean}, channel ${c}`)
          .toEqualEpsilon(current[0][c] * 0.1 + history[c] * 0.9, 0.016);
      }
      expect(result[1])
        .withContext("only current-domain distance is published")
        .toEqual(current[1]);
      expect(Math.abs(draw(oldPolicy)[0][0] - result[0][0]))
        .withContext("former high policy discards clipped history")
        .toBeGreaterThan(1);
    }
  });

  it("rejects foreground, changed receivers and unsupported moving depth", function () {
    initialize();
    const current = spatial();
    for (const [mean, front, receiver, motion] of [
      [15000, 14000, 10000, false],
      [2000, 1800, 5000, false],
      [5000, 4800, 10000, true],
    ]) {
      historyDistance = distances(mean, front, receiver);
      moving = motion;
      expect(draw()[0])
        .withContext(`${mean}/${receiver}/${motion}`)
        .toEqual(current[0]);
    }
    historyDistance = distances();
    const movingResult = draw();
    expect(movingResult[0][0])
      .withContext("supported moving history remains usable")
      .toEqualEpsilon(current[0][0] * 0.18 + history[0] * 0.82, 0.016);
    currentColor = texture(() => empty);
    currentDistance = texture((x, y) => [0, 0, rayLength(x, y) * 0.01, 0]);
    expect(draw()[0])
      .withContext("removed current support clears cloud history")
      .toEqual(empty);
  });

  it("uses the current receiver and excludes neighboring opaque silhouettes", function () {
    initialize();
    depth = texture((x) => [x < 4 ? 100 : 10000, 0, 0, 1]);
    currentColor = texture((x) => (x < 4 ? empty : [0.5, 0.5, 0.5, 0.5]));
    currentDistance = texture((x, y) =>
      x < 4
        ? [0, 0, rayLength(x, y) * 0.0001, 0]
        : [0.002, 0.0018, rayLength(x, y) * 0.01, 1],
    );
    expect(draw(resolveSource, 3, 4)[0]).toEqual(empty);
    const visible = draw(resolveSource, 4, 4);
    expect(visible[0]).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(visible[1][2]).toEqualEpsilon(0.01, 0.00001);
    depth = texture((x, y) => [10000 + 800 * (x - 4) + 400 * (y - 4), 0, 0, 1]);
    currentDistance = texture((x, y) => [
      0.002,
      0.0018,
      ((10000 + 800 * (x - 4) + 400 * (y - 4)) * rayLength(x, y)) / 1e6,
      1,
    ]);
    expect(draw()[1][2])
      .withContext("receiver metadata is not a weighted neighbor depth")
      .toEqualEpsilon(0.01, 0.00001);
  });

  it("publishes receiver depth on full-resolution misses without changing reduced unphased traces", function () {
    initialize();
    for (const [dimensions, phased, expected] of [
      [size, false, 0.01],
      [4, true, 0.01],
      [4, false, 0],
    ]) {
      currentDistance = texture(() => [0, 0, 0, 0.125]);
      const result = publish(producerSource, dimensions, phased);
      expect(result[2]).toEqualEpsilon(expected, 0.00001);
      expect([result[0], result[1], result[3]]).toEqual([0, 0, 0.125]);
    }
    depth = texture(() => [0, 0, 0, 1]);
    currentDistance = texture(() => [0, 0, 0, 0.125]);
    expect(publish()[2]).withContext("clear sky retains its sentinel").toBe(1);
  });

  it("keeps transparent neighbors in thin-edge history bounds across hit and miss frames", function () {
    initialize();
    historyColor = texture(() => empty);
    historyDistance = texture((x, y) => [0, 0, rayLength(x, y) * 0.01, 0]);
    currentColor = texture((x, y) =>
      x === 4 && y === 4 ? [10, 10, 10, 0.2] : empty,
    );
    const marchDistance = texture((x, y) =>
      x === 4 && y === 4 ? [0.002, 0.0018, 0.01, 1] : [0, 0, 0, 0],
    );
    currentDistance = marchDistance;
    publish();
    const current = spatial();
    const attachments = [];
    const accumulated = draw(resolveSource, 4, 4, attachments);
    for (let c = 0; c < 4; c++) {
      expect(accumulated[0][c])
        .withContext(`transparent history survives clipping, channel ${c}`)
        .toEqualEpsilon(0.1 * current[0][c] + 0.9 * empty[c], 0.002);
    }
    const previousPublication = producerSource.replace(
      /publishSceneDistance = u_cloudTracePhased \|\| all\(equal\([\s\S]*?\)\);/,
      "publishSceneDistance = u_cloudTracePhased;",
    );
    expect(previousPublication).not.toBe(producerSource);
    currentDistance = marchDistance;
    publish(previousPublication);
    expect(1 - draw()[0][3])
      .withContext(
        "missing receiver rejects all transparent neighbors and snaps opaque",
      )
      .toBeGreaterThan(0.7);

    historyColor = attachments[0];
    historyDistance = attachments[1];
    currentColor = texture((x, y) =>
      x === 5 && y === 4 ? [10, 10, 10, 0.2] : empty,
    );
    currentDistance = texture((x, y) =>
      x === 5 && y === 4
        ? [0.002, 0.0018, rayLength(x, y) * 0.01, 1]
        : [0, 0, 0, 0],
    );
    publish();
    expect(draw()[0][3])
      .withContext(
        "center miss with neighboring support remains a thin estimate",
      )
      .toBeGreaterThan(0.9);
    currentColor = texture(() => empty);
    currentDistance = texture(() => [0, 0, 0, 0]);
    publish();
    expect(draw()[0])
      .withContext("no current support clears the cloud")
      .toEqual(empty);
    depth = texture(() => [100, 0, 0, 1]);
    currentDistance = texture(() => [0, 0, 0, 0]);
    publish();
    expect(draw()[0])
      .withContext("new foreground occludes history")
      .toEqual(empty);
  });

  function phasedInputs(phase, color, receiver = () => 10000) {
    const [dx, dy] = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ][phase];
    uniforms.u_cloudTracePhased = () => true;
    uniforms.u_cloudStbnSlice = () => (phase + 0.5) / 64;
    depth = texture((x, y) => [receiver(x, y), 0, 0, 1]);
    currentColor = texture(color, 5);
    currentDistance = texture((x, y) => {
      const fullX = Math.min(2 * x + dx, size - 1);
      const fullY = Math.min(2 * y + dy, size - 1);
      const distance = receiver(fullX, fullY);
      return [0.002, 0.0018, (distance * rayLength(fullX, fullY)) / 1e6, 1];
    }, 5);
  }

  it("reduces medium-phase noise while preserving constant and centered signals", function () {
    initialize();
    valid = false;
    const formerTent = resolveSource.replace(
      /if \(u_cloudTracePhased\) \{\s*\/\/ A 1\.5-pixel Gaussian[\s\S]*?\n {16}\}/,
      "if (false) {}",
    );
    expect(formerTent).not.toBe(resolveSource);
    let variance = 0;
    let formerVariance = 0;
    for (let phase = 0; phase < 4; phase++) {
      phasedInputs(phase, (x, y) => {
        const value = (x + y) % 2 ? 0.2 : 0.8;
        return [value, value, value, value];
      });
      for (const x of [3, 4]) {
        for (const y of [3, 4]) {
          variance += (draw(resolveSource, x, y)[0][0] - 0.5) ** 2;
          formerVariance += (draw(formerTent, x, y)[0][0] - 0.5) ** 2;
        }
      }
      const constant = [2, 3, 4, 0.5];
      phasedInputs(phase, () => constant);
      for (const [x, y] of [
        [4, 4],
        [8, 8],
      ]) {
        expect(draw(resolveSource, x, y)[0])
          .withContext(`constant, phase ${phase}, pixel ${x}/${y}`)
          .toEqualEpsilon(constant, 0.004);
      }
      const [dx, dy] = [
        [0, 0],
        [1, 1],
        [1, 0],
        [0, 1],
      ][phase];
      phasedInputs(phase, (x, y) => {
        const value = (2 * x + dx + 2 * y + dy) / 16;
        return [value, value, value, 0.5];
      });
      expect(draw()[0][0])
        .withContext(`a linear signal must not shift with phase ${phase}`)
        .toEqualEpsilon(0.5, 0.001);
    }
    expect(variance).toBeLessThan(formerVariance * 0.1);
    expect(formerVariance).toBeGreaterThan(0.1);
  });

  it("keeps medium filtering on the visible receiver and clears unsupported history", function () {
    initialize();
    for (let phase = 0; phase < 4; phase++) {
      const dx = phase === 1 || phase === 2 ? 1 : 0;
      phasedInputs(
        phase,
        (x) => (2 * x + dx < 4 ? empty : [0.5, 0.5, 0.5, 0.5]),
        (x) => (x < 4 ? 100 : 10000),
      );
      // These controlled foreground samples contain no cloud. Their metadata
      // still names the foreground receiver, including transparent samples.
      currentDistance = texture((x, y) => {
        const fullX = Math.min(2 * x + dx, size - 1);
        const dy = phase === 1 || phase === 3 ? 1 : 0;
        const fullY = Math.min(2 * y + dy, size - 1);
        return fullX < 4
          ? [0, 0, 0.0001 * rayLength(fullX, fullY), 0]
          : [0.002, 0.0018, 0.01 * rayLength(fullX, fullY), 1];
      }, 5);
      expect(draw(resolveSource, 3, 4)[0]).toEqual(empty);
      const visible = draw(resolveSource, 4, 4);
      expect(visible[0]).toEqual([0.5, 0.5, 0.5, 0.5]);
      expect(visible[1][2]).toEqualEpsilon(0.01, 0.00001);

      historyColor = texture(() => [8, 8, 8, 0.1]);
      currentColor = texture(() => empty, 5);
      currentDistance = texture(() => [0, 0, 0.01, 0], 5);
      depth = texture(() => [10000, 0, 0, 1]);
      expect(draw()[0])
        .withContext(`removed cloud, phase ${phase}`)
        .toEqual(empty);
    }
  });
});
