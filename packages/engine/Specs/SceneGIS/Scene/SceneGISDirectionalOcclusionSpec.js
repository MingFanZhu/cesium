import {
  Cartesian3,
  FramebufferManager,
  OrthographicFrustum,
  PixelDatatype,
  PixelFormat,
  ShaderSource,
  Texture,
} from "../../../index.js";
import common from "../../../Source/Shaders/SceneGIS/AmbientOcclusion/SceneGISAOCommon.js";
import estimate from "../../../Source/Shaders/SceneGIS/AmbientOcclusion/SceneGISAOEstimate.js";
import filter from "../../../Source/Shaders/SceneGIS/AmbientOcclusion/SceneGISAOFilter.js";
import directional from "../../../Source/Shaders/SceneGIS/AmbientOcclusion/SceneGISAODirectional.js";
import composite from "../../../Source/Shaders/SceneGIS/Reflections/SceneGISSSRComposite.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISDirectionalOcclusion", function () {
  let scene;
  const resources = [];
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.camera.setView({
      destination: new Cartesian3(7000000, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 8,
      aspectRatio: 1,
      near: 0.1,
      far: 30,
    });
    scene.renderForSpecs();
  });
  afterEach(function () {
    for (const resource of resources.splice(0)) {
      resource.destroy();
    }
    scene.destroyForSpecs();
  });
  function texture(
    data,
    width = 1,
    height = 1,
    pixelFormat = PixelFormat.RGBA,
  ) {
    const result = new Texture({
      context: scene.context,
      pixelFormat,
      pixelDatatype: PixelDatatype.FLOAT,
      source: { width, height, arrayBufferView: new Float32Array(data) },
    });
    resources.push(result);
    return result;
  }
  function target(count = 1, floating = false, size = 64) {
    const result = new FramebufferManager({
      colorAttachmentsLength: count,
      pixelDatatype: floating
        ? PixelDatatype.FLOAT
        : PixelDatatype.UNSIGNED_BYTE,
    });
    result.update(scene.context, size, size);
    resources.push(result);
    return result;
  }
  function draw(sources, defines, uniforms, output) {
    const command = scene.context.createViewportQuadCommand(
      new ShaderSource({ sources, defines }),
      {
        uniformMap: uniforms,
        framebuffer: output.framebuffer,
      },
    );
    resources.push(command.shaderProgram);
    command.execute(scene.context);
    return scene.context.readPixels({
      framebuffer: output.framebuffer,
      width: output.getColorTexture().width,
      height: output.getColorTexture().height,
    });
  }
  function pipeline(depthData, useDirection) {
    const depth = texture(depthData, 64, 64, PixelFormat.RED);
    const raw = target(useDirection ? 2 : 1);
    const output = target();
    const defines = useDirection ? ["SCENEGIS_DIRECTIONAL_OCCLUSION"] : [];
    const uniforms = { u_linearDepth: () => depth, u_radius: () => 3 };
    draw(
      [common, estimate],
      defines,
      {
        ...uniforms,
        u_bias: () => 0.03,
        u_directions: () => 8,
        u_steps: () => 8,
      },
      raw,
    );
    return draw(
      [common, filter],
      defines,
      {
        ...uniforms,
        u_estimate: () => raw.getColorTexture(),
        u_moment: () => raw.getColorTexture(1),
        u_intensity: () => 1,
      },
      output,
    );
  }
  it("preserves scalar visibility and bends away from a one-sided depth occluder", function () {
    const depths = Array.from({ length: 4096 }, (_, i) =>
      i % 64 >= 36 ? 8 : 10,
    );
    const scalar = pipeline(depths, false);
    const bent = pipeline(depths, true);
    for (let i = 0; i < scalar.length; i += 4) {
      expect(bent[i]).toEqual(scalar[i]);
    }
    const p = (32 * 64 + 30) * 4;
    expect(bent[p]).toBeLessThan(245);
    expect(bent[p + 1]).toBeLessThan(120);
    expect(bent[p + 3]).toBeGreaterThan(200);
  });
  it("keeps an open hemisphere white with a forward bent direction", function () {
    const result = pipeline(new Array(4096).fill(10), true);
    const p = (32 * 64 + 32) * 4;
    expect(result[p]).toBe(255);
    expect(result[p + 1]).toEqualEpsilon(128, 2);
    expect(result[p + 2]).toEqualEpsilon(128, 2);
    expect(result[p + 3]).toBeGreaterThan(253);
  });
  it("distinguishes reflection directions and preserves open and mirror limits", function () {
    const input = texture([0.35, 0.5, 0.5, 1]);
    const output = target(1, true, 1);
    const result = draw(
      [
        directional,
        `void main() { out_FragColor = vec4(
        sceneGISSpecularVisibility(vec3(0,0,1), 0.6),
        sceneGISSpecularVisibility(vec3(1,0,0), 0.6),
        sceneGISSpecularVisibility(vec3(1,0,0), 0.0), sceneGISDiffuseVisibility()); }`,
      ],
      [],
      { u_sceneGISDirectionalOcclusion: () => input },
      output,
    );
    expect(result[0]).toBeGreaterThan(result[1] + 0.3);
    expect(result[2]).toBe(1);
    expect(result[3]).toEqualEpsilon(0.35, 1e-5);
    input.copyFrom({
      source: {
        width: 1,
        height: 1,
        arrayBufferView: new Float32Array([1, 0.5, 0.5, 1]),
      },
    });
    const open = draw(
      [
        directional,
        "void main() { out_FragColor = vec4(sceneGISSpecularVisibility(vec3(1,0,0), 0.8)); }",
      ],
      [],
      { u_sceneGISDirectionalOcclusion: () => input },
      output,
    );
    expect(open[0]).toBe(1);
  });
  it("replaces an occluded environment without re-occluding the SSR hit", function () {
    const values = {
      u_base: texture([0.8, 0.4, 0.2, 0.5]),
      u_baseWeight: texture([0.5, 0.5, 0.5, 1]),
      u_baseEnvironment: texture([0.1, 0.1, 0.1, 0]),
      u_indirect: texture([0.0, 0.0, 0.0, 1]),
      u_occlusion: texture([0.25, 0.25, 0.25, 0.25]),
    };
    // One-pixel inputs use a one-pixel framebuffer, preserving production GLSL.
    const output = target(1, true, 1);
    output.update(scene.context, 1, 1);
    const uniforms = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, () => value]),
    );
    const command = scene.context.createViewportQuadCommand(
      new ShaderSource({
        sources: [composite],
        defines: ["SCENEGIS_SSR_MAIN", "SCENEGIS_AO_MAIN"],
      }),
      {
        framebuffer: output.framebuffer,
        uniformMap: { ...uniforms, u_directionalOcclusion: () => true },
      },
    );
    resources.push(command.shaderProgram);
    command.execute(scene.context);
    const result = scene.context.readPixels({
      framebuffer: output.framebuffer,
      width: 1,
      height: 1,
    });
    expect(Array.from(result).slice(0, 3)).toEqualEpsilon(
      [0.15, 0.05, 0],
      1e-5,
    );
  });
});
