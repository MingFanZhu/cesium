import DeveloperError from "../../../Core/DeveloperError.js";
import RuntimeError from "../../../Core/RuntimeError.js";

const properties = [
  "fill-extrusion-wall-material",
  "fill-extrusion-roof-material",
];
const channels = [
  "baseColorTexture",
  "normalTexture",
  "metallicRoughnessTexture",
  "emissiveTexture",
];
const defaults = {
  baseColor: [1, 1, 1],
  emissive: [0, 0, 0],
  roughness: 1,
  metallic: 0,
  normalScale: 1,
};
const keys = [...channels, ...Object.keys(defaults), "repeat"];

function vector(value, length, minimum, maximum) {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((x) => Number.isFinite(x) && x >= minimum && x <= maximum)
  );
}

/** Immutable material descriptors and source-coordinate UVs; no platform resources. @private */
const BuildingMaterial = {
  properties,
  channels,
  defaults,
  specification: {
    type: "string",
    default: "",
    transition: false,
    "property-type": "data-driven",
    expression: { interpolated: false, parameters: ["zoom", "feature"] },
  },
  used(definition) {
    return properties.some((key) => definition.paint?.[key] !== undefined);
  },
  validate(style, errors) {
    if (
      style.materialOrigin !== undefined &&
      !vector(style.materialOrigin, 2, -Infinity, Infinity)
    ) {
      errors.push("materialOrigin: expected two finite source coordinates.");
    }
    const library = style.materials;
    if (library === undefined) {
      if (style.layers?.some(BuildingMaterial.used)) {
        errors.push(
          "materials: material selectors require a material library.",
        );
      }
      return;
    }
    if (!library || typeof library !== "object" || Array.isArray(library)) {
      errors.push("materials: expected a named material object.");
      return;
    }
    if (!vector(style.materialOrigin, 2, -Infinity, Infinity)) {
      errors.push(
        "materialOrigin: required for a stable regional material frame.",
      );
    }
    for (const [name, material] of Object.entries(library)) {
      const path = `materials.${name}`;
      if (
        !name ||
        !material ||
        typeof material !== "object" ||
        Array.isArray(material)
      ) {
        errors.push(`${path}: expected a named material object.`);
        continue;
      }
      for (const key of Object.keys(material)) {
        if (!keys.includes(key)) {
          errors.push(`${path}.${key}: unsupported property.`);
        }
      }
      if (!vector(material.repeat, 2, Number.MIN_VALUE, Infinity)) {
        errors.push(
          `${path}.repeat: expected positive width and height in meters.`,
        );
      }
      for (const key of channels) {
        if (
          material[key] !== undefined &&
          (typeof material[key] !== "string" || !material[key])
        ) {
          errors.push(`${path}.${key}: expected a non-empty image URL.`);
        }
      }
      for (const key of ["baseColor", "emissive"]) {
        if (
          material[key] !== undefined &&
          !vector(material[key], 3, 0, key === "baseColor" ? 1 : Infinity)
        ) {
          errors.push(`${path}.${key}: invalid linear RGB factor.`);
        }
      }
      for (const key of ["roughness", "metallic", "normalScale"]) {
        const value = material[key];
        if (
          value !== undefined &&
          (!Number.isFinite(value) ||
            value < 0 ||
            (key !== "normalScale" && value > 1))
        ) {
          errors.push(`${path}.${key}: invalid material factor.`);
        }
      }
    }
    for (const layer of style.layers ?? []) {
      for (const key of properties) {
        const name = layer.paint?.[key];
        if (typeof name === "string" && name && !Object.hasOwn(library, name)) {
          errors.push(`${layer.id}.${key}: unknown material ${name}.`);
        }
      }
    }
  },
  resolve(style, paint, globe) {
    const library = style._snapshot.materials ?? {};
    const names = Object.keys(library);
    const origin = style._snapshot.materialOrigin;
    if (globe && Math.abs(origin[1]) > 20037508.342789244) {
      throw new DeveloperError(
        "Globe materialOrigin must use the source EPSG:3857 coordinates.",
      );
    }
    const scale = globe ? 1 / Math.cosh(origin[1] / 6378137) : 1;
    return properties.map((key) => {
      const name = paint[key] ?? "";
      if (name === "") {
        return { index: -1, repeat: [1, 1], origin, scale };
      }
      if (!Object.hasOwn(library, name)) {
        throw new RuntimeError(`Unknown building material: ${name}`);
      }
      return { ...library[name], index: names.indexOf(name), origin, scale };
    });
  },
  coordinates(material, coordinates, point, z, tangent, start) {
    const [ox, oy] = material.origin;
    const x = coordinates.origin.x - ox + point.x;
    const y = coordinates.origin.y - oy + point.y;
    let u, v, anchor;
    if (tangent) {
      u =
        ((x * tangent[0] + y * tangent[1]) * material.scale) /
        material.repeat[0];
      const ax = coordinates.origin.x - ox + start.x;
      const ay = coordinates.origin.y - oy + start.y;
      anchor =
        ((ax * tangent[0] + ay * tangent[1]) * material.scale) /
        material.repeat[0];
      v = z / material.repeat[1];
      return [u - Math.floor(anchor), v, material.index];
    }
    // Use the tile origin for roof precision; its integral offset changes no phase.
    u = (x * material.scale) / material.repeat[0];
    v = (y * material.scale) / material.repeat[1];
    return [
      u -
        Math.floor(
          ((coordinates.origin.x - ox) * material.scale) / material.repeat[0],
        ),
      v -
        Math.floor(
          ((coordinates.origin.y - oy) * material.scale) / material.repeat[1],
        ),
      material.index,
    ];
  },
};
export default BuildingMaterial;
