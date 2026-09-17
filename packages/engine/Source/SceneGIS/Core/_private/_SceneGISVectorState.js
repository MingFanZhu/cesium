import DeveloperError from "../../../Core/DeveloperError.js";

const empty = Object.freeze({});

/** JSON state helpers shared by the Scene owner and Worker evaluation. @private */
const VectorState = { empty };
VectorState.copy = function (value) {
  const seen = new Set();
  function visit(item) {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean"
    ) {
      return item;
    }
    if (typeof item === "number" && Number.isFinite(item)) {
      return item;
    }
    if (
      !item ||
      typeof item !== "object" ||
      seen.has(item) ||
      (!Array.isArray(item) &&
        ![Object.prototype, null].includes(Object.getPrototypeOf(item)))
    ) {
      throw new DeveloperError("Style state must contain finite JSON values.");
    }
    seen.add(item);
    const result = Array.isArray(item)
      ? Array.from(item, visit)
      : Object.fromEntries(
          Object.entries(item).map(([key, v]) => [key, visit(v)]),
        );
    seen.delete(item);
    return result;
  }
  return visit(value);
};
VectorState.dependencies = function (
  value,
  result = { feature: new Set(), global: new Set() },
) {
  if (!Array.isArray(value) || value[0] === "literal") {
    return result;
  }
  if (value[0] === "match") {
    VectorState.dependencies(value[1], result);
    for (let i = 3; i < value.length - 1; i += 2) {
      VectorState.dependencies(value[i], result);
    }
    VectorState.dependencies(value[value.length - 1], result);
    return result;
  }
  if (value[0] === "feature-state" || value[0] === "global-state") {
    result[value[0] === "feature-state" ? "feature" : "global"].add(
      typeof value[1] === "string" ? value[1] : undefined,
    );
  }
  for (const item of value) {
    VectorState.dependencies(item, result);
  }
  return result;
};
VectorState.context = function (states, sourceLayer, id, globalState) {
  return {
    featureState:
      id === undefined
        ? empty
        : (states?.get(sourceLayer)?.get(String(id)) ?? empty),
    globalState: globalState ?? empty,
  };
};
export default VectorState;
