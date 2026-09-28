const gravity = 9.81;

/**
 *  Deterministic JONSWAP/TMA samples; no renderer dependencies.
 * @private
 */
function createSceneGISWindSpectrum(options) {
  const n = options.resolution;
  let seed = options.seed >>> 0;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  }
  const directionLength = Math.hypot(
    options.windDirection.x,
    options.windDirection.y,
  );
  const dx = options.windDirection.x / directionLength;
  const dy = options.windDirection.y / directionLength;
  const wind = options.windSpeed;
  const peak =
    wind > 0
      ? 22 * Math.cbrt((gravity * gravity) / (wind * options.fetchLength))
      : 0;
  const alpha =
    wind > 0
      ? 0.076 * Math.pow((wind * wind) / (gravity * options.fetchLength), 0.22)
      : 0;
  const split = (Math.PI * n) / (options.patchLength * 4);
  let variance = 0;
  let bound = 0;
  const bands = [options.patchLength, options.patchLength * 4].map(
    (length, band) => {
      const data = new Float32Array(n * n * 4);
      const step = (2 * Math.PI) / length;
      for (let y = 0; y < n; ++y) {
        for (let x = 0; x < n; ++x) {
          const i = (y * n + x) * 4;
          const kx = (x < n / 2 ? x : x - n) * step;
          const ky = (y < n / 2 ? y : y - n) * step;
          const k = Math.hypot(kx, ky);
          if (k === 0 || x === n / 2 || y === n / 2 || wind === 0) {
            continue;
          }
          const kd = k * options.waterDepth;
          const t = Math.tanh(kd);
          const omega = Math.sqrt(gravity * k * t);
          const derivative = (gravity * (t + kd * (1 - t * t))) / (2 * omega);
          const sigma = omega <= peak ? 0.07 : 0.09;
          const peakShape = Math.exp(
            -0.5 * Math.pow((omega - peak) / (sigma * peak), 2),
          );
          const nu = omega * Math.sqrt(options.waterDepth / gravity);
          const shallow =
            nu < 1 ? 0.5 * nu * nu : nu < 2 ? 1 - 0.5 * Math.pow(2 - nu, 2) : 1;
          const cosine = (kx * dx + ky * dy) / k;
          const angular =
            (Math.pow(Math.abs(cosine), 8) * (cosine < 0 ? 0.03 : 1) * 128) /
            (35 * Math.PI * 1.03);
          const blend = Math.max(0, Math.min(1, (k / split - 0.65) / 0.35));
          const weight = band === 0 ? blend : 1 - blend;
          const spectrum =
            ((alpha * gravity * gravity) / Math.pow(omega, 5)) *
            Math.exp(-1.25 * Math.pow(peak / omega, 4)) *
            Math.pow(3.3, peakShape) *
            shallow;
          const energy =
            ((spectrum * derivative) / k) * angular * step * step * weight;
          const radius = Math.sqrt(-2 * Math.log(random()));
          const phase = random() * 2 * Math.PI;
          const amplitude = Math.sqrt(energy * 0.25) * options.amplitudeScale;
          data[i] = amplitude * radius * Math.cos(phase);
          data[i + 1] = amplitude * radius * Math.sin(phase);
          data[i + 2] = omega;
          const magnitude = Math.hypot(data[i], data[i + 1]);
          variance += 2 * magnitude * magnitude;
          bound += 2 * magnitude;
        }
      }
      return { length, data };
    },
  );
  return {
    bands,
    significantWaveHeight: 4 * Math.sqrt(variance),
    maximumDisplacement:
      bound * Math.sqrt(1 + options.choppiness * options.choppiness),
  };
}
export default createSceneGISWindSpectrum;
