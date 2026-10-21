/**
 * Seeded, unit-variance agitation and ripple spectra for the shared FFT backend.
 * Broad angular support gives finite, irregular crests. These authored visual bands
 * are not a wind estimate or a hydraulic simulation. Lengths use a 12 m reference.
 * @private
 */
function createSceneGISRiverSpectrum(options) {
  const n = options.resolution;
  let seed = options.seed >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  };
  let bound = 0;
  const bands = [
    { length: 96, wavelength: 12 },
    { length: 24, wavelength: 2 },
  ].map(({ length, wavelength }) => {
    const data = new Float32Array(n * n * 4);
    const step = (2 * Math.PI) / length;
    const peak = (2 * Math.PI) / wavelength;
    let variance = 0;
    for (let y = 0; y < n; ++y) {
      for (let x = 0; x < n; ++x) {
        const kx = (x < n / 2 ? x : x - n) * step;
        const ky = (y < n / 2 ? y : y - n) * step;
        const k = Math.hypot(kx, ky);
        if (k === 0 || x === n / 2 || y === n / 2) {
          continue;
        }
        const angular = 0.08 + 0.92 * Math.max(0, kx / k) ** 2;
        const energy =
          (Math.exp(-0.5 * (Math.log(k / peak) / 0.5) ** 2) * angular) /
          (k * k);
        const radius = Math.sqrt(-2 * Math.log(random()) * energy);
        const phase = random() * 2 * Math.PI;
        const i = (y * n + x) * 4;
        data[i] = radius * Math.cos(phase);
        data[i + 1] = radius * Math.sin(phase);
        data[i + 2] = Math.sqrt(9.81 * k * Math.tanh(k * 3));
        variance += 2 * (data[i] ** 2 + data[i + 1] ** 2);
      }
    }
    const scale = 1 / Math.sqrt(variance);
    for (let i = 0; i < data.length; i += 4) {
      data[i] *= scale;
      data[i + 1] *= scale;
      bound += 2 * Math.hypot(data[i], data[i + 1]);
    }
    return { length, data };
  });
  return {
    bands,
    significantWaveHeight: 4 * Math.SQRT2,
    maximumDisplacement: bound,
  };
}

export default createSceneGISRiverSpectrum;
