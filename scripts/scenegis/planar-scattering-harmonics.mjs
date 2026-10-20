// Offline real cosine spherical harmonics. Reflection symmetry about the
// sun/vertical plane makes the sine coefficients identically zero.
export function coefficientCount(degree) {
  return ((degree + 1) * (degree + 2)) / 2;
}

function index(l, m) {
  return (l * (l + 1)) / 2 + m;
}

export function cosineBasis(degree, mu, phi) {
  const values = new Float64Array(coefficientCount(degree));
  const radial = Math.sqrt(Math.max(1 - mu * mu, 0));
  let diagonal = 1;
  for (let m = 0; m <= degree; m++) {
    if (m > 0) {
      diagonal *= -(2 * m - 1) * radial;
    }
    let previous = 0;
    let current = diagonal;
    for (let l = m; l <= degree; l++) {
      if (l > m) {
        const next =
          ((2 * l - 1) * mu * current - (l + m - 1) * previous) / (l - m);
        previous = current;
        current = next;
      }
      let factorialRatio = 1;
      for (let k = l - m + 1; k <= l + m; k++) {
        factorialRatio /= k;
      }
      values[index(l, m)] =
        current *
        Math.sqrt(
          ((2 * l + 1) * factorialRatio * (m === 0 ? 1 : 2)) / (4 * Math.PI),
        ) *
        Math.cos(m * phi);
    }
  }
  return values;
}

export function relativeAzimuth(viewMu, sunMu, nu) {
  const radial = Math.sqrt(
    Math.max((1 - viewMu * viewMu) * (1 - sunMu * sunMu), 0),
  );
  return radial === 0
    ? 0
    : Math.acos(Math.min(Math.max((nu - viewMu * sunMu) / radial, -1), 1));
}

// Zonal convolution eigenvalues. Cornette-Shanks is HG times
// 3(1 + nu^2)/(2(2 + g^2)); applying the Legendre recurrence gives these moments.
export function phaseEigenvalues(l, g = 0.8) {
  const a = ((l + 1) * (l + 2)) / ((2 * l + 1) * (2 * l + 3));
  const b =
    (l + 1) ** 2 / ((2 * l + 1) * (2 * l + 3)) +
    l ** 2 / ((2 * l + 1) * (2 * l - 1));
  const c = (l * (l - 1)) / ((2 * l + 1) * (2 * l - 1));
  return {
    rayleigh: l === 0 ? 1 : l === 2 ? 0.1 : 0,
    mie:
      (3 / (2 * (2 + g * g))) *
      ((1 + b) * g ** l + a * g ** (l + 2) + (l < 2 ? 0 : c * g ** (l - 2))),
  };
}

export function gaussLegendre(count, start = -1, end = 1) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (count + 0.5));
    let derivative;
    for (let iteration = 0; iteration < 32; iteration++) {
      let previous = 1;
      let current = x;
      for (let l = 2; l <= count; l++) {
        const next = ((2 * l - 1) * x * current - (l - 1) * previous) / l;
        previous = current;
        current = next;
      }
      derivative = (count * (x * current - previous)) / (x * x - 1);
      const step = current / derivative;
      x -= step;
      if (Math.abs(step) < 1e-15) {
        break;
      }
    }
    nodes.push({
      mu: (start + end + (end - start) * x) / 2,
      weight: (end - start) / ((1 - x * x) * derivative * derivative),
    });
  }
  return nodes;
}

export function evaluateCoefficients(coefficients, basis) {
  const result = [0, 0, 0];
  for (let i = 0; i < basis.length; i++) {
    for (let c = 0; c < 3; c++) {
      result[c] += coefficients[i * 3 + c] * basis[i];
    }
  }
  return result;
}
