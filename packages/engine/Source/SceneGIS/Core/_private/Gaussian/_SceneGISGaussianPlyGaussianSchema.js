/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
const REQUIRED_CORE = [
  "x",
  "y",
  "z",
  "scale_0",
  "scale_1",
  "scale_2",
  "rot_0",
  "rot_1",
  "rot_2",
  "rot_3",
  "opacity",
  "f_dc_0",
  "f_dc_1",
  "f_dc_2",
];

export function inspectGaussianPlySchema(header, options = {}) {
  const vertex = header.elements.find((element) => element.name === "vertex");
  if (!vertex) {
    throw new Error("PLY has no vertex element");
  }
  const names = new Set(vertex.properties.map((property) => property.name));
  const missing = REQUIRED_CORE.filter((name) => !names.has(name));
  if (missing.length > 0 && options.strict !== false) {
    throw new Error(
      `PLY is missing required 3DGS properties: ${missing.join(", ")}`,
    );
  }
  const restIndices = vertex.properties
    .map((property) => /^f_rest_(\d+)$/.exec(property.name))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((left, right) => left - right);
  for (let i = 0; i < restIndices.length; i++) {
    if (restIndices[i] !== i) {
      throw new Error(`PLY SH properties are not contiguous at f_rest_${i}`);
    }
  }
  const maxShDegree =
    restIndices.length >= 45
      ? 3
      : restIndices.length >= 24
        ? 2
        : restIndices.length >= 9
          ? 1
          : 0;
  const expectedRestCount = [0, 9, 24, 45][maxShDegree];
  if (restIndices.length !== expectedRestCount) {
    throw new Error(
      `PLY has ${restIndices.length} f_rest properties; expected 0, 9, 24, or 45`,
    );
  }
  return {
    vertexCount: vertex.count,
    missing,
    maxShDegree,
    shCoefficientCount: restIndices.length,
    rotationMapping: ["rot_1", "rot_2", "rot_3", "rot_0"],
    scaleEncoding: "natural-log",
    opacityEncoding: "logit",
    dcEncoding: "spherical-harmonic-c0",
  };
}

export const gaussianCorePropertyNames = Object.freeze([...REQUIRED_CORE]);

/** @private */
const _SceneGISGaussianPlyGaussianSchema = {
  inspectGaussianPlySchema,
  gaussianCorePropertyNames,
};
export default _SceneGISGaussianPlyGaussianSchema;
