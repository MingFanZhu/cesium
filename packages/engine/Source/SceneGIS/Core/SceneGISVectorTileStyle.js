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
import State from "./_private/_SceneGISVectorState.js";

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
      "symbol-spacing",
      "text-field",
      "text-font",
      "text-size",
      "text-max-width",
      "text-line-height",
      "text-letter-spacing",
      "text-anchor",
      "text-variable-anchor",
      "text-radial-offset",
      "text-justify",
      "text-offset",
      "text-padding",
      "text-transform",
      "text-allow-overlap",
      "text-ignore-placement",
      "text-optional",
      "text-rotation-alignment",
      "text-pitch-alignment",
      "text-rotate",
      "text-keep-upright",
      "text-max-angle",
      "icon-image",
      "icon-size",
      "icon-text-fit",
      "icon-text-fit-padding",
      "icon-anchor",
      "icon-offset",
      "icon-padding",
      "icon-allow-overlap",
      "icon-ignore-placement",
      "icon-optional",
      "icon-rotation-alignment",
      "icon-pitch-alignment",
      "icon-rotate",
      "icon-keep-upright",
    ],
  },
  background: {
    paint: ["background-color", "background-opacity", "background-pattern"],
    layout: ["visibility"],
  },
  fill: {
    paint: [
      "fill-color",
      "fill-opacity",
      "fill-outline-color",
      "fill-antialias",
      "fill-pattern",
    ],
    layout: ["visibility"],
  },
  "fill-extrusion": {
    paint: [
      "fill-extrusion-color",
      "fill-extrusion-opacity",
      "fill-extrusion-height",
      "fill-extrusion-base",
      "fill-extrusion-vertical-gradient",
      "fill-extrusion-pattern",
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
      "line-pattern",
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
  "feature-state",
  "global-state",
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
      if (
        layer.layout?.["text-variable-anchor"] !== undefined &&
        (layer.layout["symbol-placement"] ?? "point") !== "point"
      ) {
        errors.push(
          `${path}.layout.text-variable-anchor: requires constant point placement.`,
        );
      }
      for (const scope of ["paint", "layout"]) {
        const values = layer[scope] ?? {};
        checkKeys(values, selected[scope], `${path}.${scope}`, errors);
        for (const [name, value] of Object.entries(values)) {
          const propertyPath = `${path}.${scope}.${name}`;
          const dependencies = State.dependencies(value);
          if (
            scope !== "paint" &&
            (dependencies.feature.size || dependencies.global.size)
          ) {
            errors.push(
              `${propertyPath}: state expressions are supported only in paint.`,
            );
          }
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
            (name === "text-font" || name === "text-variable-anchor") &&
            Array.isArray(value) &&
            value.every((v) => typeof v === "string")
          )) {
            checkExpression(value, propertyPath, errors);
          }
        }
      }
      checkExpression(layer.filter, `${path}.filter`, errors);
      const dependencies = State.dependencies(layer.filter);
      if (dependencies.feature.size || dependencies.global.size) {
        errors.push(
          `${path}.filter: state expressions are supported only in paint.`,
        );
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
      // Absence preserves text-offset; an explicit radial zero overrides it.
      if (name === "text-radial-offset" && layer[scope]?.[name] === undefined) {
        continue;
      }
      const property = specification[name];
      const value = layer[scope]?.[name] ?? property.default;
      if (value !== undefined) {
        compiled[scope][name] = normalizePropertyExpression(value, property);
        const dependencies = State.dependencies(value);
        compiled[scope][name]._stateDependent =
          dependencies.feature.size > 0 || dependencies.global.size > 0;
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

function evaluateProperties(
  properties,
  globals,
  feature,
  previous,
  changed = true,
  context,
  stateChanged = false,
) {
  if (previous && !changed && !stateChanged) {
    return previous;
  }
  let result = previous ?? {};
  const evaluationGlobals = context?.globalState
    ? { ...globals, globalState: context.globalState }
    : globals;
  for (const [name, expression] of Object.entries(properties)) {
    if (
      previous &&
      !(stateChanged && expression._stateDependent) &&
      (!changed ||
        expression.kind === "constant" ||
        expression.kind === "source")
    ) {
      continue;
    }
    if (result === previous) {
      result = { ...previous };
    }
    const value = expression.evaluate(
      evaluationGlobals,
      feature,
      context?.featureState,
    );
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
 * 使用独立 MapLibre 样式前端编译 Style v8 的 scenegis-vector-v1 子集。输入 JSON 会复制，此对象不拥有渲染器、请求或 GPU 资源。
 * @alias SceneGISVectorTileStyle
 * @constructor
 * @experimental 此 API 为实验性，可能发生变化。
 * @param {object} style 文档 V1 范围内的 Style v8 JSON 对象。
 * @exception {DeveloperError} JSON、样式验证或支持范围无效。
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
  this._snapshot = freezeJson(snapshot);
}

/**
 *  返回独立完整 Style JSON 文档。 @private
 */
SceneGISVectorTileStyle.prototype._getSnapshot = function () {
  return cloneJson(this._snapshot);
};

function ruleDefinition(style, layerId, scope, name) {
  if (typeof layerId !== "string" || layerId.length === 0) {
    throw new DeveloperError("A non-empty style layer ID is required.");
  }
  if (scope !== "filter" && typeof name !== "string") {
    throw new DeveloperError("A style property name is required.");
  }
  const definition = getLayer(style, layerId).definition;
  if (scope === "filter") {
    if (definition.type === "background") {
      throw new DeveloperError("Background layers do not support filters.");
    }
  } else if (
    !["paint", "layout"].includes(scope) ||
    !profile[definition.type][scope].includes(name)
  ) {
    throw new DeveloperError(
      `Unsupported style property: ${layerId}.${scope}.${name}`,
    );
  }
  return definition;
}

/**
 *  获取未求值规则的副本，缺失时为 undefined。 @private
 */
SceneGISVectorTileStyle.prototype._getRule = function (layerId, scope, name) {
  const definition = ruleDefinition(this, layerId, scope, name);
  const value =
    scope === "filter" ? definition.filter : definition[scope]?.[name];
  return value === undefined ? undefined : cloneJson(value);
};

/**
 *  在所有者发生任何修改前验证并编译不可变候选。 @private
 */
SceneGISVectorTileStyle.prototype._withRule = function (
  layerId,
  scope,
  name,
  value,
) {
  const previous = this._getRule(layerId, scope, name);
  if (value === undefined) {
    throw new DeveloperError(
      "A style rule value is required; use null to remove it.",
    );
  }
  const next = value === null ? undefined : cloneJson(value);
  if (JSON.stringify(previous) === JSON.stringify(next)) {
    return this;
  }
  const snapshot = this._getSnapshot();
  const definition = snapshot.layers.find((layer) => layer.id === layerId);
  const target = scope === "filter" ? definition : (definition[scope] ??= {});
  const key = scope === "filter" ? "filter" : name;
  if (next === undefined) {
    delete target[key];
  } else {
    target[key] = next;
  }
  return new SceneGISVectorTileStyle(snapshot);
};

Object.defineProperties(SceneGISVectorTileStyle.prototype, {
  /**
   * 字形 PBF URL 模板，或 undefined。
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
   * 单一精灵 URL 基址，或 undefined。
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
   * 带版本的计算能力范围，渲染器资格独立验证。
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
   * 不可变源配置，切片方案由应用独立提供。
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
   * 按样式顺序排列的不可变图层 ID。
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
 * 检查样式语法与支持范围，不构造运行时。
 * @param {object} style Style v8 JSON 对象。
 * @returns {string[]} 包含路径的诊断信息，有效时为空。
 */
SceneGISVectorTileStyle.validate = function (style) {
  try {
    return validate(cloneJson(style));
  } catch (error) {
    return [error.message];
  }
};

/**
 * 获取已编译属性的失效类别。
 * @param {string} layerId 样式层 ID。
 * @param {string} scope 取值 "paint" 或 "layout"。
 * @param {string} name 属性名称。
 * @returns {string|undefined} 取值 constant/source/camera/composite，未设置属性时为 undefined。
 * @exception {DeveloperError} 图层或作用域无效。
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
 * 获取图层不可变 JSON 定义，不求值要素。
 * @param {string} layerId 样式层 ID。
 * @returns {object} 递归冻结的图层快照。
 * @exception {DeveloperError} 图层不存在。
 */
SceneGISVectorTileStyle.prototype.getLayerDefinition = function (layerId) {
  return getLayer(this, layerId).definition;
};

/**
 * 已求值图层，绘制颜色为非预乘 Cesium Color。
 * @typedef {object} SceneGISVectorTileStyle.EvaluatedLayer
 * @property {string} id 样式层 ID。
 * @property {string} type 样式层类型。
 * @property {string|undefined} source 源 ID。
 * @property {string|undefined} sourceLayer MVT 源图层名称。
 * @property {boolean} show 缩放、显隐与过滤器是否允许此要素。
 * @property {object} layout 已求值布局属性。
 * @property {object} paint 已求值绘制属性。
 */

/**
 * 每次求值的绘制状态，已编译样式不保留此上下文。
 * @typedef {object} SceneGISVectorTileStyle.EvaluationContext
 * @property {object} [featureState] 此要素状态，默认空。
 * @property {object} [globalState] 图层级状态，默认空。
 */

/**
 * 对单个图层求值，不修改输入要素或已编译配置。不安全整数属性以十进制字符串进入样式引擎，ID 保持字符串标识。
 * @param {string} layerId 样式层 ID。
 * @param {SceneGISVectorTile.Feature|undefined} feature 解码要素，背景可为 undefined。
 * @param {number} zoom 连续样式缩放，独立于源 LOD。
 * @param {SceneGISVectorTileStyle.EvaluationContext} [context] 本次求值可选的绘制状态。
 * @returns {SceneGISVectorTileStyle.EvaluatedLayer} 图层值；绘制和符号尺寸使用小数缩放，其他布局和过滤值使用整数缩放。
 * @exception {DeveloperError} 图层、要素或缩放无效。
 */
SceneGISVectorTileStyle.prototype.evaluateLayer = function (
  layerId,
  feature,
  zoom,
  context,
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
    zoom >= (layer.minzoom ?? -Infinity) &&
    zoom < (layer.maxzoom ?? Infinity) &&
    layout.visibility !== "none" &&
    compiled.filter.filter(layoutGlobals, input);
  return {
    id: layer.id,
    type: layer.type,
    source: layer.source,
    sourceLayer: layer["source-layer"],
    show,
    layout,
    paint: evaluateProperties(
      compiled.paint,
      { zoom },
      input,
      undefined,
      true,
      context,
    ),
  };
};

/**
 *  由仅相机相关值而非原始 zoom 使几何批次失效。 @private
 */
SceneGISVectorTileStyle.prototype._getGeometryKey = function (
  layerId,
  zoom,
  context,
) {
  const compiled = getLayer(this, layerId);
  const values = [];
  const uniform = this._getUniformPaint(layerId, zoom, context);
  if (uniform) {
    const type = compiled.definition.type;
    const width = uniform["line-width"],
      gap = uniform["line-gap-width"];
    values.push(
      uniform[`${type}-opacity`] * uniform[`${type}-color`].alpha > 0 &&
        (type === "fill" || width > 0)
        ? type === "fill"
          ? "visible"
          : Math.ceil(Math.log2(gap * 0.5 + width * (gap > 0 ? 1 : 0.5)))
        : "hidden",
    );
  }
  for (const scope of ["layout", "paint"]) {
    const globals = { zoom: scope === "layout" ? Math.floor(zoom) : zoom };
    for (const [name, expression] of Object.entries(compiled[scope])) {
      if (
        uniform &&
        scope === "paint" &&
        (compiled.definition.type === "line"
          ? name !== "line-dasharray" && name !== "line-pattern"
          : name === "fill-color" || name === "fill-opacity")
      ) {
        continue;
      }
      if (expression.kind === "camera") {
        values.push(
          expression.evaluate({
            ...globals,
            globalState: context?.globalState,
          }),
        );
      } else if (expression.kind === "composite") {
        values.push(globals.zoom);
      }
    }
  }
  return JSON.stringify(values);
};

/**
 *  与要素无关的绘制可使用常量顶点属性。 @private
 */
SceneGISVectorTileStyle.prototype._getUniformPaint = function (
  layerId,
  zoom,
  context,
) {
  const compiled = getLayer(this, layerId);
  if (
    !["line", "fill"].includes(compiled.definition.type) ||
    compiled.paint["fill-outline-color"] !== undefined ||
    Object.values(compiled.paint).some(
      (expression) =>
        expression.kind === "source" || expression.kind === "composite",
    )
  ) {
    return undefined;
  }
  const paint = evaluateProperties(
    compiled.paint,
    { zoom },
    undefined,
    undefined,
    true,
    context,
  );
  const type = compiled.definition.type;
  if (paint[`${type}-pattern`] !== undefined) {
    paint[`${type}-color`] = Color.clone(Color.WHITE);
  }
  return paint;
};

/**
 * Evaluates visible renderer features, reusing a caller-owned tile cache.
 * Decoded tile data is immutable for its residency. Public evaluation stays uncached.
 * @private
 */
SceneGISVectorTileStyle.prototype._evaluateVisibleLayer = function (
  layerId,
  feature,
  zoom,
  previous,
  context,
) {
  const compiled = getLayer(this, layerId);
  const layer = compiled.definition;
  if (
    zoom < (layer.minzoom ?? -Infinity) ||
    zoom >= (layer.maxzoom ?? Infinity)
  ) {
    return undefined;
  }
  const input = previous?.input ?? styleFeature(feature);
  const globals = { zoom: Math.floor(zoom) };
  const layoutChanged = !previous || Math.floor(previous.zoom) !== globals.zoom;
  if (
    layoutChanged &&
    (compiled.layout.visibility.evaluate(globals, input) === "none" ||
      !compiled.filter.filter(globals, input))
  ) {
    return undefined;
  }
  const featureState = context?.featureState ?? State.empty;
  const globalState = context?.globalState ?? State.empty;
  const stateChanged =
    previous?.featureState !== featureState ||
    previous?.globalState !== globalState;
  if (previous?.zoom === zoom && !stateChanged) {
    return previous;
  }
  let layout = evaluateProperties(
    compiled.layout,
    globals,
    input,
    previous?.value.layout,
    layoutChanged,
  );
  if (layer.type === "symbol") {
    for (const name of ["text-size", "icon-size"]) {
      const value = compiled.layout[name].evaluate({ zoom }, input);
      if (layout[name] !== value) {
        if (layout === previous?.value.layout) {
          layout = { ...layout };
        }
        layout[name] = value;
      }
    }
    for (const name of ["text-field", "icon-image"]) {
      if (layoutChanged && typeof layer.layout?.[name] === "string") {
        layout[name] = layer.layout[name].replace(
          /\{([^}]+)\}/g,
          (match, property) => String(input.properties[property] ?? ""),
        );
      }
    }
  }
  return {
    input,
    zoom,
    featureState,
    globalState,
    value: {
      id: layer.id,
      type: layer.type,
      source: layer.source,
      sourceLayer: layer["source-layer"],
      show: true,
      layout,
      paint: evaluateProperties(
        compiled.paint,
        { zoom },
        input,
        previous?.value.paint,
        true,
        context,
        stateChanged,
      ),
    },
  };
};

export default SceneGISVectorTileStyle;
