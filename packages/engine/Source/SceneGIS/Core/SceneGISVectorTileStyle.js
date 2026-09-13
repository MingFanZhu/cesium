import {
  Color as StyleColor,
  Formatted,
  Padding,
  ResolvedImage,
  featureFilter,
  latest,
  normalizePropertyExpression,
  validateStyleMin,
} from "@maplibre/maplibre-gl-style-spec";
import Color from "../../Core/Color.js";
import DeveloperError from "../../Core/DeveloperError.js";

const profile = {
  symbol: {
    paint: [
      "text-color",
      "text-opacity",
      "text-halo-color",
      "text-halo-width",
      "text-halo-blur",
      "icon-opacity",
    ],
    layout: [
      "visibility",
      "symbol-placement",
      "symbol-sort-key",
      "text-field",
      "text-font",
      "text-size",
      "text-max-width",
      "text-line-height",
      "text-letter-spacing",
      "text-anchor",
      "text-justify",
      "text-offset",
      "text-padding",
      "text-transform",
      "text-allow-overlap",
      "text-ignore-placement",
      "text-optional",
      "text-rotation-alignment",
      "text-pitch-alignment",
      "icon-image",
      "icon-size",
      "icon-anchor",
      "icon-offset",
      "icon-padding",
      "icon-allow-overlap",
      "icon-ignore-placement",
      "icon-optional",
      "icon-rotation-alignment",
      "icon-pitch-alignment",
    ],
  },
  background: {
    paint: ["background-color", "background-opacity"],
    layout: ["visibility"],
  },
  fill: {
    paint: [
      "fill-color",
      "fill-opacity",
      "fill-outline-color",
      "fill-antialias",
    ],
    layout: ["visibility"],
  },
  line: {
    paint: [
      "line-color",
      "line-opacity",
      "line-width",
      "line-gap-width",
      "line-offset",
      "line-blur",
      "line-dasharray",
    ],
    layout: [
      "visibility",
      "line-cap",
      "line-join",
      "line-miter-limit",
      "line-round-limit",
    ],
  },
  circle: {
    paint: [
      "circle-color",
      "circle-radius",
      "circle-opacity",
      "circle-stroke-color",
      "circle-stroke-width",
      "circle-stroke-opacity",
      "circle-blur",
    ],
    layout: ["visibility"],
  },
};
const operators = new Set([
  "literal",
  "get",
  "has",
  "!has",
  "id",
  "geometry-type",
  "zoom",
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "!",
  "all",
  "any",
  "none",
  "in",
  "!in",
  "match",
  "case",
  "coalesce",
  "step",
  "interpolate",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "number",
  "string",
  "boolean",
  "to-number",
  "to-string",
  "to-boolean",
  "to-color",
  "concat",
  "rgb",
  "rgba",
]);
const rootKeys = [
  "version",
  "name",
  "metadata",
  "sources",
  "layers",
  "glyphs",
  "sprite",
];
const sourceKeys = [
  "type",
  "tiles",
  "minzoom",
  "maxzoom",
  "scheme",
  "attribution",
];
const layerKeys = [
  "id",
  "type",
  "source",
  "source-layer",
  "filter",
  "minzoom",
  "maxzoom",
  "metadata",
  "layout",
  "paint",
];

function cloneJson(style) {
  try {
    return JSON.parse(
      JSON.stringify(style, (_key, value) => {
        if (
          typeof value === "function" ||
          typeof value === "bigint" ||
          typeof value === "undefined" ||
          typeof value === "symbol" ||
          (typeof value === "number" && !Number.isFinite(value))
        ) {
          throw new Error("style values must be JSON data.");
        }
        return value;
      }),
    );
  } catch (error) {
    throw new DeveloperError(`Invalid style JSON: ${error.message}`);
  }
}

function freezeJson(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeJson);
    Object.freeze(value);
  }
  return value;
}

function checkKeys(value, allowed, path, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path}: expected an object.`);
    return;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      errors.push(`${path}.${key}: unsupported by scenegis-vector-v1.`);
    }
  }
}

function checkExpression(value, path, errors) {
  if (!Array.isArray(value) || typeof value[0] !== "string") {
    return;
  }
  const operator = value[0];
  if (!operators.has(operator)) {
    errors.push(`${path}[0]: unsupported operator ${operator}.`);
    return;
  }
  if (operator === "literal") {
    return;
  }
  if (operator === "match") {
    checkExpression(value[1], `${path}[1]`, errors);
    for (let i = 3; i < value.length - 1; i += 2) {
      checkExpression(value[i], `${path}[${i}]`, errors);
    }
    checkExpression(
      value[value.length - 1],
      `${path}[${value.length - 1}]`,
      errors,
    );
    return;
  }
  for (let i = 1; i < value.length; ++i) {
    if (operator === "interpolate" && i === 1) {
      if (
        !Array.isArray(value[i]) ||
        !["linear", "exponential"].includes(value[i][0])
      ) {
        errors.push(
          `${path}[1]: only linear/exponential interpolation is supported.`,
        );
      }
    } else {
      checkExpression(value[i], `${path}[${i}]`, errors);
    }
  }
}

function validate(style) {
  const errors = [];
  checkKeys(style, rootKeys, "style", errors);
  if (!style || typeof style !== "object") {
    return errors;
  }
  if (style.sprite !== undefined && typeof style.sprite !== "string") {
    errors.push("style.sprite: only a single sprite URL is supported.");
  }
  if (style.sources && typeof style.sources === "object") {
    for (const [name, source] of Object.entries(style.sources)) {
      const path = `sources.${name}`;
      checkKeys(source, sourceKeys, path, errors);
      if (source?.type !== "vector") {
        errors.push(`${path}.type: only vector sources are supported.`);
      }
      if (!Array.isArray(source?.tiles) || source.tiles.length === 0) {
        errors.push(
          `${
            path
          }.tiles: URL templates are required; TileJSON is not supported.`,
        );
      }
    }
  }
  if (Array.isArray(style.layers)) {
    style.layers.forEach((layer, index) => {
      const path = `layers[${index}]`;
      checkKeys(layer, layerKeys, path, errors);
      const selected = Object.hasOwn(profile, layer?.type)
        ? profile[layer.type]
        : undefined;
      if (!selected) {
        errors.push(`${path}.type: unsupported layer type.`);
        return;
      }
      for (const scope of ["paint", "layout"]) {
        const values = layer[scope] ?? {};
        checkKeys(values, selected[scope], `${path}.${scope}`, errors);
        for (const [name, value] of Object.entries(values)) {
          const propertyPath = `${path}.${scope}.${name}`;
          if (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
          ) {
            errors.push(
              `${
                propertyPath
              }: legacy style function objects are not supported.`,
            );
          }
          if (!(
            name === "text-font" &&
            Array.isArray(value) &&
            value.every((v) => typeof v === "string")
          )) {
            checkExpression(value, propertyPath, errors);
          }
        }
      }
      checkExpression(layer.filter, `${path}.filter`, errors);
      if (layer.type === "symbol") {
        const layout = layer.layout ?? {};
        if ((layout["symbol-placement"] ?? "point") !== "point") {
          errors.push(
            `${
              path
            }.layout.symbol-placement: only point placement is supported.`,
          );
        }
        for (const name of [
          "text-rotation-alignment",
          "text-pitch-alignment",
          "icon-rotation-alignment",
          "icon-pitch-alignment",
        ]) {
          if (!["auto", "viewport"].includes(layout[name] ?? "auto")) {
            errors.push(
              `${path}.layout.${name}: only viewport alignment is supported.`,
            );
          }
        }
      }
    });
  }
  try {
    errors.push(...validateStyleMin(style).map((error) => error.message));
  } catch (error) {
    errors.push(`style: ${error.message}`);
  }
  return errors;
}

function compileLayer(layer) {
  const compiled = {
    definition: layer,
    filter: featureFilter(layer.filter),
    paint: {},
    layout: {},
  };
  if (compiled.filter.needGeometry) {
    throw new DeveloperError(
      "Geometry-dependent filters are outside scenegis-vector-v1.",
    );
  }
  for (const scope of ["paint", "layout"]) {
    const specification = latest[`${scope}_${layer.type}`];
    for (const name of profile[layer.type][scope]) {
      const property = specification[name];
      const value = layer[scope]?.[name] ?? property.default;
      if (value !== undefined) {
        compiled[scope][name] = normalizePropertyExpression(value, property);
      }
    }
  }
  return compiled;
}

function getLayer(style, id) {
  const layer = style._compiled.get(id);
  if (!layer) {
    throw new DeveloperError(`Unknown style layer: ${id}`);
  }
  return layer;
}

function styleFeature(feature) {
  if (
    !feature ||
    ![1, 2, 3].includes(feature.type) ||
    !feature.properties ||
    typeof feature.properties !== "object"
  ) {
    throw new DeveloperError("feature must be a decoded MVT feature.");
  }
  const properties = Object.create(null);
  for (const [key, value] of Object.entries(feature.properties)) {
    properties[key] = typeof value === "bigint" ? value.toString() : value;
  }
  return { type: feature.type, id: feature.id, properties };
}

function evaluateProperties(properties, globals, feature) {
  const result = {};
  for (const [name, expression] of Object.entries(properties)) {
    const value = expression.evaluate(globals, feature);
    if (value instanceof StyleColor) {
      const [r, g, b, a] = value.rgb;
      result[name] = new Color(r, g, b, a);
    } else if (value instanceof Formatted) {
      result[name] = value.toString();
    } else if (value instanceof Padding) {
      result[name] = value.values.slice();
    } else if (value instanceof ResolvedImage) {
      result[name] = value.name;
    } else {
      result[name] = Array.isArray(value) ? value.slice() : value;
    }
  }
  return result;
}

/**
 * Compiles the scenegis-vector-v1 subset of Style v8 with the independent MapLibre style frontend.
 * The input JSON is copied. This object owns no renderer, requests, or GPU resources.
 * @alias SceneGISVectorTileStyle
 * @constructor
 * @experimental This API is experimental and subject to change.
 * @param {object} style A Style v8 JSON object within the documented V1 profile.
 * @exception {DeveloperError} JSON, style validation, or the supported profile is invalid.
 */
function SceneGISVectorTileStyle(style) {
  const snapshot = cloneJson(style);
  const errors = validate(snapshot);
  if (errors.length !== 0) {
    throw new DeveloperError(errors.join("\n"));
  }
  this._compiled = new Map(
    snapshot.layers.map((layer) => [layer.id, compileLayer(layer)]),
  );
  this._sources = freezeJson(snapshot.sources);
  this._glyphs = snapshot.glyphs;
  this._sprite = snapshot.sprite;
  this._layerIds = Object.freeze(snapshot.layers.map((layer) => layer.id));
  freezeJson(snapshot.layers);
}

Object.defineProperties(SceneGISVectorTileStyle.prototype, {
  /**
   * The glyph PBF URL template, or undefined.
   * @memberof SceneGISVectorTileStyle.prototype
   * @type {string|undefined}
   * @readonly
   */
  glyphs: {
    get: function () {
      return this._glyphs;
    },
  },
  /**
   * The single sprite URL base, or undefined.
   * @memberof SceneGISVectorTileStyle.prototype
   * @type {string|undefined}
   * @readonly
   */
  sprite: {
    get: function () {
      return this._sprite;
    },
  },
  /**
   * The versioned computation profile. Renderer qualification is separate.
   * @memberof SceneGISVectorTileStyle.prototype
   * @type {string}
   * @readonly
   */
  profile: {
    get: function () {
      return "scenegis-vector-v1";
    },
  },
  /**
   * Immutable source configuration. Tiling schemes are supplied independently by the application.
   * @memberof SceneGISVectorTileStyle.prototype
   * @type {object}
   * @readonly
   */
  sources: {
    get: function () {
      return this._sources;
    },
  },
  /**
   * Immutable layer IDs in style order.
   * @memberof SceneGISVectorTileStyle.prototype
   * @type {string[]}
   * @readonly
   */
  layerIds: {
    get: function () {
      return this._layerIds;
    },
  },
});

/**
 * Checks style syntax and the supported profile without constructing a runtime.
 * @param {object} style A Style v8 JSON object.
 * @returns {string[]} Path-bearing diagnostics; empty when valid.
 */
SceneGISVectorTileStyle.validate = function (style) {
  try {
    return validate(cloneJson(style));
  } catch (error) {
    return [error.message];
  }
};

/**
 * Gets the invalidation category of a compiled property.
 * @param {string} layerId Style layer ID.
 * @param {string} scope "paint" or "layout".
 * @param {string} name Property name.
 * @returns {string|undefined} constant/source/camera/composite, or undefined for an unset property.
 * @exception {DeveloperError} The layer or scope is invalid.
 */
SceneGISVectorTileStyle.prototype.getPropertyKind = function (
  layerId,
  scope,
  name,
) {
  if (scope !== "paint" && scope !== "layout") {
    throw new DeveloperError('scope must be "paint" or "layout".');
  }
  const properties = getLayer(this, layerId)[scope];
  return Object.hasOwn(properties, name) ? properties[name].kind : undefined;
};

/**
 * Gets the immutable JSON definition of a layer without evaluating a feature.
 * @param {string} layerId Style layer ID.
 * @returns {object} The recursively frozen layer snapshot.
 * @exception {DeveloperError} The layer does not exist.
 */
SceneGISVectorTileStyle.prototype.getLayerDefinition = function (layerId) {
  return getLayer(this, layerId).definition;
};

/**
 * An evaluated layer. Paint colors are unpremultiplied Cesium Color values.
 * @typedef {object} SceneGISVectorTileStyle.EvaluatedLayer
 * @property {string} id Style layer ID.
 * @property {string} type Style layer type.
 * @property {string|undefined} source Source ID.
 * @property {string|undefined} sourceLayer MVT source-layer name.
 * @property {boolean} show Whether zoom, visibility and filter permit this feature.
 * @property {object} layout Evaluated layout properties.
 * @property {object} paint Evaluated paint properties.
 */

/**
 * Evaluates one layer without mutating the input feature or compiled configuration.
 * Unsafe integer properties enter the style engine as decimal strings; IDs retain their string identity.
 * @param {string} layerId Style layer ID.
 * @param {SceneGISVectorTile.Feature|undefined} feature A decoded feature, or undefined for background.
 * @param {number} zoom Continuous style zoom, independent of source LOD.
 * @returns {SceneGISVectorTileStyle.EvaluatedLayer} Layer values; paint and symbol sizes use fractional zoom, other layout/filter values use integer zoom.
 * @exception {DeveloperError} The layer, feature, or zoom is invalid.
 */
SceneGISVectorTileStyle.prototype.evaluateLayer = function (
  layerId,
  feature,
  zoom,
) {
  if (!Number.isFinite(zoom)) {
    throw new DeveloperError("zoom must be finite.");
  }
  const compiled = getLayer(this, layerId);
  const layer = compiled.definition;
  const input = layer.type === "background" ? undefined : styleFeature(feature);
  const layoutGlobals = { zoom: Math.floor(zoom) };
  const layout = evaluateProperties(compiled.layout, layoutGlobals, input);
  if (layer.type === "symbol") {
    for (const name of ["text-size", "icon-size"]) {
      layout[name] = compiled.layout[name].evaluate({ zoom }, input);
    }
    for (const name of ["text-field", "icon-image"]) {
      if (typeof layer.layout?.[name] === "string") {
        layout[name] = (layout[name] ?? "").replace(
          /\{([^}]+)\}/g,
          (match, property) => String(input.properties[property] ?? ""),
        );
      }
    }
  }
  const show =
    zoom >= (layer.minzoom ?? 0) &&
    zoom < (layer.maxzoom ?? 24) &&
    layout.visibility !== "none" &&
    compiled.filter.filter(layoutGlobals, input);
  return {
    id: layer.id,
    type: layer.type,
    source: layer.source,
    sourceLayer: layer["source-layer"],
    show,
    layout,
    paint: evaluateProperties(compiled.paint, { zoom }, input),
  };
};

export default SceneGISVectorTileStyle;
