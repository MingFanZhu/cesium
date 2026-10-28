import {
  Framebuffer,
  PixelDatatype,
  PixelFormat,
  Resource,
  Texture,
  _SceneGISWaterFoam as WaterFoam,
} from "../../../index.js";
import foamShader from "../../../Source/Shaders/SceneGIS/Water/SceneGISWaterFoam.js";
import createContext from "../../../../../Specs/createContext.js";

describe("SceneGIS/Scene/SceneGISWaterFoam", function () {
  let context, material, target, command;
  beforeEach(function () {
    context = createContext(undefined, 64, 64);
  });
  afterEach(function () {
    command?.shaderProgram.destroy();
    command = undefined;
    target?.destroy();
    target = undefined;
    material?.destroy();
    material = undefined;
    context.destroyForSpecs();
  });
  it("loads the packaged density map once and releases the mipmapped texture", async function () {
    const request = jasmine.createSpy("requestRender");
    material = new WaterFoam(request);
    expect(material.texture).toBeUndefined();
    await material._promise;
    expect(request).toHaveBeenCalledTimes(1);
    material.update(context);
    const texture = material.texture;
    expect(texture.width).toBe(450);
    expect(texture.height).toBe(450);
    expect(material._image).toBeUndefined();
    material.update(context);
    expect(material.texture).toBe(texture);
    material.destroy();
    expect(texture.isDestroyed()).toBeTrue();
  });
  it("closes late decoded images without uploading or waking a destroyed Scene", async function () {
    let complete;
    spyOn(Resource.prototype, "fetchImage").and.returnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const request = jasmine.createSpy("requestRender");
    material = new WaterFoam(request);
    material.destroy();
    const close = jasmine.createSpy("close");
    complete({ close });
    await material._promise;
    expect(close).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    expect(material.texture).toBeUndefined();
  });
  it("surfaces asset failures without retries or a different foam material", async function () {
    const fetch = spyOn(Resource.prototype, "fetchImage").and.returnValue(
      Promise.reject(new Error("missing packaged foam")),
    );
    material = new WaterFoam(() => {});
    await material._promise;
    expect(() => material.update(context)).toThrowError(
      /missing packaged foam/,
    );
    expect(material.texture).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("renders progressively denser films, resolved relief and filtered distant coverage", async function () {
    material = new WaterFoam(() => {});
    await material._promise;
    material.update(context);
    target = new Framebuffer({
      context,
      colorTextures: [
        new Texture({
          context,
          width: 64,
          height: 64,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype: PixelDatatype.FLOAT,
        }),
      ],
    });
    let density = 0,
      span = 2;
    command = context.createViewportQuadCommand(
      `${foamShader}
      uniform float u_density, u_span;
      in vec2 v_textureCoordinates;
      void main() {
        vec2 p = v_textureCoordinates * u_span;
        vec4 m = sceneGISFoamMaterial(u_density, p, dFdx(p), dFdy(p));
        vec3 n = normalize(vec3(-m.xy, 1.0));
        float left = sceneGISFoamDiffuse(n, normalize(vec3(-1.0, 0.0, 0.5)), vec3(1.0), vec3(0.0)).r;
        float right = sceneGISFoamDiffuse(n, normalize(vec3(1.0, 0.0, 0.5)), vec3(1.0), vec3(0.0)).r;
        out_FragColor = vec4(m.a, left, right, 1.0);
      }`,
      {
        framebuffer: target,
        uniformMap: {
          u_foamDetail: () => material.texture,
          u_density: () => density,
          u_span: () => span,
        },
      },
    );
    const draw = () => {
      command.execute(context);
      return context.readPixels({ framebuffer: target, width: 64, height: 64 });
    };
    const clear = draw();
    expect(
      Array.from(clear)
        .filter((_, i) => i % 4 === 0)
        .every((v) => v === 0),
    ).toBeTrue();
    density = 0.3;
    const sparse = draw();
    density = 0.65;
    const dense = draw();
    let coverage = 0,
      relief = 0,
      open = 0,
      closed = 0;
    for (let i = 0; i < dense.length; i += 4) {
      expect(dense[i]).toBeGreaterThanOrEqual(sparse[i] - 1e-6);
      coverage += dense[i];
      relief += Math.abs(dense[i + 1] - dense[i + 2]);
      open += sparse[i] < 0.05;
      // Sparse films may be partially transparent, but must remain visible.
      closed += sparse[i] > 0.1;
    }
    expect(coverage / 4096).toBeGreaterThan(0.5);
    expect(open).toBeGreaterThan(20);
    expect(closed).toBeGreaterThan(20);
    expect(relief / 4096).toBeGreaterThan(0.0001);
    span = 512;
    const distant = draw();
    expect(Array.from(distant).every(Number.isFinite)).toBeTrue();
    const values = Array.from(distant).filter((_, i) => i % 4 === 0);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.02);
  });
});
