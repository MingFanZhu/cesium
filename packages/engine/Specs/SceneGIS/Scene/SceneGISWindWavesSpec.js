import {
  Cartesian2,
  Cartesian3,
  CoplanarPolygonGeometry,
  ClearCommand,
  DrawCommand,
  Matrix4,
  OrthographicFrustum,
  PrimitiveType,
  Sampler,
  ShaderProgram,
  ShaderSource,
  Texture,
  TextureMinificationFilter,
  TextureWrap,
  VertexArray,
  JulianDate,
  PolygonHierarchy,
  SceneGISWindWaves,
  VertexFormat,
} from "../../../index.js";
import waterVertex from "../../../Source/Shaders/SceneGIS/Water/SceneGISWaterVS.js";
import createFrameState from "../../../../../Specs/createFrameState.js";
import createContext from "../../../../../Specs/createContext.js";
import spectrum from "../../../Source/SceneGIS/Scene/_private/_SceneGISWindSpectrum.js";
import WaterMesh from "../../../Source/SceneGIS/Scene/_private/_SceneGISWaterMesh.js";

describe("SceneGIS/Scene/SceneGISWindWaves", function () {
  let context, waves;
  const time = JulianDate.fromIso8601("2026-06-21T10:00:00Z");
  afterEach(function () {
    waves?.destroy();
    waves = undefined;
    context?.destroyForSpecs();
    context = undefined;
  });
  function update(seconds = 0) {
    waves._update({
      context,
      time: JulianDate.addSeconds(time, seconds, new JulianDate()),
    });
  }
  it("validates physical parameters and remains allocation-free until attached", function () {
    expect(
      () => new SceneGISWindWaves({ resolution: 100 }),
    ).toThrowDeveloperError();
    expect(
      () => new SceneGISWindWaves({ windDirection: Cartesian2.ZERO }),
    ).toThrowDeveloperError();
    expect(
      () => new SceneGISWindWaves({ waterDepth: 0 }),
    ).toThrowDeveloperError();
    waves = new SceneGISWindWaves();
    expect(waves.ready).toBeFalse();
    expect(waves._state).toBeUndefined();
  });
  it("synthesizes deterministic finite-depth wind spectra with exact calm water", function () {
    waves = new SceneGISWindWaves({
      resolution: 32,
      patchLength: 16,
      windSpeed: 8,
    });
    const a = spectrum(waves),
      b = spectrum(waves);
    expect(a.bands[0].data).toEqual(b.bands[0].data);
    expect(a.significantWaveHeight).toBeGreaterThan(0.05);
    waves.waterDepth = 0.2;
    const shallow = spectrum(waves);
    expect(shallow.significantWaveHeight).toBeLessThan(a.significantWaveHeight);
    expect(shallow.bands[1].data[6]).toBeLessThan(a.bands[1].data[6]);
    waves.windSpeed = 0;
    const calm = spectrum(waves);
    expect(calm.significantWaveHeight).toBe(0);
    expect(calm.bands.every((b) => b.data.every((v) => v === 0))).toBeTrue();
  });
  function half(v) {
    const sign = v & 32768 ? -1 : 1,
      exponent = (v >> 10) & 31,
      fraction = v & 1023;
    return (
      sign *
      (exponent
        ? (1 + fraction / 1024) * 2 ** (exponent - 15)
        : fraction * 2 ** -24)
    );
  }
  it("matches a direct CPU Fourier sum for both GPU bands and reuses frozen simulation", function () {
    context = createContext();
    waves = new SceneGISWindWaves({
      resolution: 32,
      patchLength: 16,
      windSpeed: 9,
    });
    update();
    update(1.25);
    const initial = spectrum(waves),
      n = 32;
    // Independent O(N^2) Fourier evaluation at selected spatial points, not another FFT.
    function height(band, x, y, t) {
      const d = initial.bands[band].data;
      let result = 0;
      for (let ky = 0; ky < n; ++ky) {
        for (let kx = 0; kx < n; ++kx) {
          const i = (ky * n + kx) * 4,
            j = (((n - ky) % n) * n + ((n - kx) % n)) * 4;
          const c = Math.cos(d[i + 2] * t),
            s = Math.sin(d[i + 2] * t);
          const re = (d[i] + d[j]) * c + (d[i + 1] + d[j + 1]) * s;
          const im = (d[i + 1] - d[j + 1]) * c + (d[j] - d[i]) * s;
          const angle = (2 * Math.PI * (kx * x + ky * y)) / n;
          result += re * Math.cos(angle) - im * Math.sin(angle);
        }
      }
      return result;
    }
    for (let b = 0; b < 2; ++b) {
      const output = waves._state.bands[b].output;
      for (const [x, y] of [
        [0, 0],
        [3, 7],
        [17, 25],
      ]) {
        const pixels = context.readPixels({
          framebuffer: output,
          x,
          y,
          width: 1,
          height: 1,
        });
        expect(half(pixels[2])).toEqualEpsilon(height(b, x, y, 1.25), 0.001);
        expect(Number.isFinite(pixels[0])).toBeTrue();
      }
    }
    const textures = waves._state.bands.map((b) => b.output.getColorTexture(0));
    const spy = spyOn(context, "draw").and.callThrough();
    update(1.25);
    expect(spy).not.toHaveBeenCalled();
    waves.windSpeed = 0;
    update(1.25);
    expect(spy).toHaveBeenCalled();
    expect(
      Array.from(
        context.readPixels({
          framebuffer: waves._state.bands[0].output,
          width: 1,
          height: 1,
        }),
        half,
      ),
    ).toEqual([0, 0, 0, 1]);
    expect(waves._state.bands[0].output.getColorTexture(0)).toBe(textures[0]);
    waves.destroy();
    expect(textures.every((t) => t.isDestroyed())).toBeTrue();
    waves = undefined;
  });
  it("filters edge and interior displacement with the same continuous camera footprint", function () {
    context = createContext();
    const hierarchy = new PolygonHierarchy([
      new Cartesian3(-128, -128),
      new Cartesian3(128, -128),
      new Cartesian3(128, 128),
      new Cartesian3(-128, 128),
    ]);
    const source = CoplanarPolygonGeometry.createGeometry(
      new CoplanarPolygonGeometry({
        polygonHierarchy: hierarchy,
        vertexFormat: VertexFormat.POSITION_ONLY,
      }),
    );
    const mesh = new WaterMesh(source, hierarchy, 0.25);
    const geometry = mesh.createGeometry(
      mesh.tiles.find((t) => t.x === 0 && t.y === 0),
      4,
    );
    const positions = geometry.attributes.position.values;
    const data = geometry.attributes.waveData.values;
    const frame = createFrameState(context);
    frame.camera.position = new Cartesian3(2, 64, 256);
    frame.camera.direction = new Cartesian3(0, 0, -1);
    frame.camera.up = Cartesian3.clone(Cartesian3.UNIT_Y);
    frame.camera.right = Cartesian3.clone(Cartesian3.UNIT_X);
    frame.camera.frustum = new OrthographicFrustum({
      width: 0.25,
      aspectRatio: 1,
      near: 0.1,
      far: 1000,
    });
    context.uniformState.update(frame);
    // Base texels alternate zero/one height. All coarser levels have exactly mean height 0.5.
    const pixels = new Uint8Array(32 * 32 * 4);
    for (let y = 0; y < 32; ++y) {
      for (let x = 0; x < 32; ++x) {
        pixels[(y * 32 + x) * 4 + 2] = ((x + y) % 2) * 255;
        pixels[(y * 32 + x) * 4 + 3] = 255;
      }
    }
    const displacement = new Texture({
      context,
      flipY: false,
      source: { width: 32, height: 32, arrayBufferView: pixels },
    });
    displacement.generateMipmap();
    displacement.sampler = new Sampler({
      wrapS: TextureWrap.REPEAT,
      wrapT: TextureWrap.REPEAT,
      minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
    });
    const zero = new Texture({
      context,
      source: { width: 1, height: 1, arrayBufferView: new Uint8Array(4) },
    });
    const program = ShaderProgram.fromCache({
      context,
      vertexShaderSource: new ShaderSource({
        defines: ["SCENEGIS_WIND_WAVES"],
        sources: [
          ShaderSource.replaceMain(waterVertex, "waterMain"),
          "void main() { waterMain(); gl_Position = vec4(0.0, 0.0, 0.0, 1.0); gl_PointSize = 1.0; }",
        ],
      }),
      fragmentShaderSource:
        "in vec3 v_positionEC; void main() { out_FragColor = vec4(v_positionEC.z + 256.0, 0.0, 0.0, 1.0); }",
      attributeLocations: { position: 0, waveData: 1 },
    });
    try {
      // These points have equal camera distance; one is on the shared tile edge and one inside.
      for (const x of [0, 4]) {
        let index = -1;
        for (let i = 0; i < positions.length; i += 3) {
          if (positions[i] === x && positions[i + 1] === 64) {
            index = i / 3;
            break;
          }
        }
        expect(index).toBeGreaterThanOrEqual(0);
        const vertexArray = new VertexArray({
          context,
          attributes: [
            {
              index: 0,
              value: Array.from(positions.subarray(index * 3, index * 3 + 3)),
            },
            {
              index: 1,
              value: Array.from(data.subarray(index * 2, index * 2 + 2)),
            },
          ],
        });
        try {
          ClearCommand.ALL.execute(context);
          new DrawCommand({
            vertexArray,
            shaderProgram: program,
            count: 1,
            primitiveType: PrimitiveType.POINTS,
            modelMatrix: Matrix4.IDENTITY,
            uniformMap: {
              u_displacement0: () => displacement,
              u_displacement1: () => zero,
              u_wavePeriod: () => 16,
              u_waveResolution: () => 32,
              u_waveLodScale: () => mesh.lodScale,
            },
          }).execute(context);
          const result = context.readPixels();
          expect(result[0]).toEqualEpsilon(128, 2);
          expect(Array.from(result.subarray(1))).toEqual([0, 0, 255]);
        } finally {
          vertexArray.destroy();
        }
      }
    } finally {
      program.destroy();
      displacement.destroy();
      zero.destroy();
    }
  });
  it("preserves hole area and identical tile boundary vertices across mesh LODs", function () {
    const ring = (s) =>
      new PolygonHierarchy([
        new Cartesian3(-s, -s),
        new Cartesian3(s, -s),
        new Cartesian3(s, s),
        new Cartesian3(-s, s),
      ]);
    const h = ring(128);
    h.holes.push(ring(13));
    const geometry = CoplanarPolygonGeometry.createGeometry(
      new CoplanarPolygonGeometry({
        polygonHierarchy: h,
        vertexFormat: VertexFormat.POSITION_ONLY,
      }),
    );
    const mesh = new WaterMesh(geometry, h, 1);
    let area = 0;
    for (const tile of mesh.tiles) {
      const g = mesh.createGeometry(tile, 3),
        p = g.attributes.position.values;
      expect(
        g.attributes.waveData.values.every(
          (v, i) => i % 2 === 0 || v === mesh.spacing,
        ),
      ).toBeTrue();
      for (let i = 0; i < g.indices.length; i += 3) {
        const a = g.indices[i] * 3,
          b = g.indices[i + 1] * 3,
          c = g.indices[i + 2] * 3;
        area +=
          Math.abs(
            (p[b] - p[a]) * (p[c + 1] - p[a + 1]) -
              (p[c] - p[a]) * (p[b + 1] - p[a + 1]),
          ) * 0.5;
      }
    }
    expect(area).toEqualEpsilon(256 * 256 - 26 * 26, 0.05);
    const tile = mesh.tiles[0];
    function edge(level) {
      const g = mesh.createGeometry(tile, level),
        p = g.attributes.position.values,
        w = g.attributes.waveData.values,
        result = [];
      for (let i = 0; i < p.length; i += 3) {
        if (p[i] === tile.x) {
          result.push([p[i + 1], w[(i / 3) * 2], w[(i / 3) * 2 + 1]]);
        }
      }
      return result.sort((a, b) => a[0] - b[0]);
    }
    expect(edge(0)).toEqual(edge(4));
  });
});
