import {
  Cartesian2,
  Cartesian3,
  CoplanarPolygonGeometry,
  JulianDate,
  PolygonHierarchy,
  SceneGISWindWaves,
  VertexFormat,
} from "../../../index.js";
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
