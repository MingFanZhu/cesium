import {
  BoundingRectangle,
  Framebuffer,
  PassState,
  PixelDatatype,
  PixelFormat,
  Sampler,
  ShaderSource,
  Texture,
  TextureMinificationFilter,
  TextureMagnificationFilter,
} from "../../../index.js";
import heightFogSource from "../../../Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISExponentialHeightFog.js";
import createContext from "../../../../../Specs/createContext.js";

describe("SceneGIS/Scene/SceneGISHeightFog", function () {
  let context;
  const radius = 6360000;
  // Exercise the production numerical kernel without unrelated lighting/LUTs.
  const kernel = heightFogSource.slice(
    0,
    heightFogSource.indexOf("vec3 sceneGISHeightFogSunTransmittance("),
  );

  beforeAll(function () {
    context = createContext();
  });
  afterAll(function () {
    context.destroyForSpecs();
  });

  function render(cases) {
    const values = new Float32Array(cases.length * 8);
    cases.forEach((c, i) => {
      values.set([c.height, c.mu, c.distance ?? 5e6, c.start ?? 250], i * 4);
      values.set(
        [c.density ?? 8e-6, c.falloff ?? 2e-4, c.base ?? 0, c.planar ? 1 : 0],
        (cases.length + i) * 4,
      );
    });
    const input = new Texture({
      context,
      flipY: false,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.NEAREST,
        magnificationFilter: TextureMagnificationFilter.NEAREST,
      }),
      source: { width: cases.length, height: 2, arrayBufferView: values },
    });
    const output = new Texture({
      context,
      width: cases.length,
      height: 1,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
    });
    const framebuffer = new Framebuffer({
      context,
      colorTextures: [output],
      destroyAttachments: false,
    });
    const passState = new PassState(context);
    passState.framebuffer = framebuffer;
    passState.viewport = new BoundingRectangle(0, 0, cases.length, 1);
    const command = context.createViewportQuadCommand(
      new ShaderSource({
        sources: [
          "precision highp float; const float SCENEGIS_BOTTOM_RADIUS = 6360000.0; const float SCENEGIS_TOP_RADIUS = 6420000.0;",
          kernel,
          `uniform sampler2D u_cases;
          void main() {
            int index = int(gl_FragCoord.x);
            vec4 ray = texelFetch(u_cases, ivec2(index, 0), 0);
            vec4 fog = texelFetch(u_cases, ivec2(index, 1), 0);
            vec3 origin = vec3(0.0, 0.0, ray.x);
            vec3 direction = vec3(sqrt(max(1.0 - ray.y * ray.y, 0.0)), 0.0, ray.y);
            float start; float end;
            bool hit = fog.w > 0.0
              ? sceneGISHeightFogPlanarSegment(origin, direction, ray.z, ray.w, start, end)
              : sceneGISHeightFogGlobeSegment(origin, direction, ray.z, ray.w, start, end);
            float tau = 0.0;
            if (hit) {
              tau = fog.w > 0.0
                ? sceneGISHeightFogPlanarOpticalDepth(origin, direction, start, end, fog.x, fog.y, fog.z)
                : sceneGISHeightFogGlobeOpticalDepth(origin, direction, start, end, fog.x, fog.y, fog.z);
            }
            out_FragColor = vec4(tau, 1.0 - exp(-tau), hit ? start * 1e-6 : 0.0, hit ? end * 1e-6 : 0.0);
          }`,
        ],
      }),
      { uniformMap: { u_cases: () => input }, framebuffer },
    );
    try {
      command.execute(context, passState);
      return context.readPixels({
        framebuffer,
        width: cases.length,
        height: 1,
      });
    } finally {
      command.shaderProgram.destroy();
      framebuffer.destroy();
      output.destroy();
      input.destroy();
      expect(framebuffer.isDestroyed()).toBe(true);
      expect(output.isDestroyed()).toBe(true);
      expect(input.isDestroyed()).toBe(true);
    }
  }

  function reference(c) {
    // Match uploaded inputs, then independently integrate the entire geometric segment.
    const height = Math.fround(c.height);
    const mu = Math.fround(c.mu);
    const limit = Math.fround(c.distance ?? 5e6);
    let start = Math.fround(c.start ?? 250);
    let end = limit;
    if (c.planar) {
      if (mu === 0) {
        if (height < 0 || height > 60000) {
          return 0;
        }
      } else {
        const a = -height / mu;
        const b = (60000 - height) / mu;
        start = Math.max(start, 0, Math.min(a, b));
        end = Math.min(end, Math.max(a, b));
      }
    } else {
      const r = radius + height;
      const projected = r * mu;
      function interval(shell) {
        const d = projected * projected - (r - shell) * (r + shell);
        return d < 0
          ? undefined
          : [-projected - Math.sqrt(d), -projected + Math.sqrt(d)];
      }
      const top = interval(radius + 60000);
      if (!top) {
        return 0;
      }
      start = Math.max(start, 0, top[0]);
      end = Math.min(end, top[1]);
      const ground = interval(radius);
      if (ground && ground[0] > start) {
        end = Math.min(end, ground[0]);
      }
    }
    if (end <= start) {
      return 0;
    }
    const density = Math.fround(c.density ?? 8e-6);
    const falloff = Math.fround(c.falloff ?? 2e-4);
    const base = Math.fround(c.base ?? 0);
    function f(t) {
      const h = c.planar
        ? height + mu * t
        : Math.hypot(t * Math.sqrt(1 - mu * mu), radius + height + mu * t) -
          radius;
      return (
        density * Math.exp(Math.max(-80, Math.min(80, -falloff * (h - base))))
      );
    }
    // Dense Simpson reference includes both limbs of a tangent ray.
    const count = 8192;
    const step = (end - start) / count;
    let sum = f(start) + f(end);
    for (let i = 1; i < count; i++) {
      sum += (i % 2 === 0 ? 2 : 4) * f(start + i * step);
    }
    return Math.min((sum * step) / 3, 80);
  }

  function expectReference(cases) {
    const pixels = render(cases);
    cases.forEach((c, i) => {
      const tau = pixels[i * 4];
      const expected = reference(c);
      const label = JSON.stringify(c);
      expect(Number.isFinite(tau)).withContext(label).toBe(true);
      expect(Math.abs(pixels[i * 4 + 1] - (1 - Math.exp(-expected))))
        .withContext(label)
        .toBeLessThan(0.005);
      if (expected >= 1e-4 && expected <= 20) {
        expect(Math.abs(tau - expected) / expected)
          .withContext(label)
          .toBeLessThan(0.02);
      }
    });
    return pixels;
  }

  it("integrates the visible high-altitude fog beyond the former 300 km cutoff", function () {
    const pixels = expectReference([
      { height: 336250.4323275919, mu: -0.32003455398996533 },
      { height: 336250, mu: -0.34 },
      { height: 120000, mu: -0.2 },
      { height: 120000, mu: -0.1, planar: true },
      { height: 1000, mu: 0, distance: 900000, density: 1e-6, planar: true },
    ]);
    expect(pixels[1]).toBeGreaterThan(0.2);
    expect((pixels[3] - pixels[2]) * 1e6).toBeGreaterThan(300000);
  });

  it("resolves thin, tangent, uniform and finite fog segments within a fixed sample budget", function () {
    const cases = [];
    for (const height of [100, 10000, 60000, 120000, 336250, 1e6]) {
      const horizon = -Math.sqrt(1 - (radius / (radius + height)) ** 2);
      for (const mu of [-1, horizon - 0.001, horizon + 0.001, 0.05]) {
        for (const falloff of [0, 1e-6, 0.0002, 0.001]) {
          cases.push({ height, mu, falloff });
        }
      }
    }
    cases.push(
      { height: 1e6, mu: -1, distance: 950000 },
      { height: 1e6, mu: -1, distance: 900000 },
      { height: 120000, mu: -0.2, base: 60000 },
      { height: 120000, mu: -0.2, base: -60000 },
      { height: 120000, mu: -0.2, density: 0 },
      { height: 1000, mu: 0.1, start: 300000 },
    );
    expectReference(cases);
  });

  it("tracks continuous height and inclination changes through the former cutoff", function () {
    const cases = [];
    for (let i = 0; i <= 80; i++) {
      const height = 120000 + i * 5000;
      const horizon = -Math.sqrt(1 - (radius / (radius + height)) ** 2);
      cases.push({ height, mu: horizon - 0.003 - i * 0.0005 });
      cases.push({ height: 336250, mu: -0.32 - i * 0.001 });
    }
    expectReference(cases);
  });
});
