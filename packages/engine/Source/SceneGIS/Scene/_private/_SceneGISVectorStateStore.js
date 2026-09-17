import DeveloperError from "../../../Core/DeveloperError.js";
import State from "../../Core/_private/_SceneGISVectorState.js";

/** Layer-scoped immutable snapshots, independent of resident tile lifetimes. @private */
function StateStore(owner) {
  this.owner = owner;
  this.sources = new Map();
  this.global = State.empty;
  this.revision = 0;
}
function target(store, value) {
  if (
    !value ||
    typeof value.source !== "string" ||
    !store.owner._sources.has(value.source) ||
    typeof value.sourceLayer !== "string" ||
    !value.sourceLayer.length ||
    !(typeof value.id === "string" || Number.isSafeInteger(value.id))
  ) {
    throw new DeveloperError(
      "State target requires a known source, sourceLayer and a string or safe integer id.",
    );
  }
  return {
    source: value.source,
    sourceLayer: value.sourceLayer,
    id: String(value.id),
  };
}
function matches(dependencies, keys) {
  return (
    dependencies.has(undefined) || keys.some((key) => dependencies.has(key))
  );
}
function invalidate(store, identity, keys) {
  const owner = store.owner;
  store.revision++;
  for (const record of owner._records) {
    const definition = record.definition;
    const deps = record.stateDependencies;
    if (
      identity
        ? definition.source !== identity.source ||
          definition["source-layer"] !== identity.sourceLayer ||
          !matches(deps.feature, keys)
        : !matches(deps.global, keys)
    ) {
      continue;
    }
    if (!identity) {
      record.stateRevision = (record.stateRevision ?? 0) + 1;
      record.context = { globalState: store.global };
    }
    if (definition.type === "background" || definition.type === "symbol") {
      continue;
    }
    const source = owner._sources.get(definition.source);
    for (const entry of source.entries.values()) {
      if (
        identity &&
        entry.featureIds &&
        !entry.featureIds.get(identity.sourceLayer)?.has(identity.id)
      ) {
        continue;
      }
      entry.stateRevision = (entry.stateRevision ?? 0) + 1;
      entry.stateVersions ??= new Map();
      entry.stateVersions.set(definition.id, store.revision);
    }
  }
  owner._tilesLoaded = false;
  owner.scene.requestRender();
}
StateStore.prototype.get = function (value) {
  const t = target(this, value);
  return State.context(
    this.sources.get(t.source),
    t.sourceLayer,
    t.id,
    this.global,
  ).featureState;
};
StateStore.prototype.set = function (value, update, remove, key) {
  const t = target(this, value);
  if (key !== undefined && typeof key !== "string") {
    throw new DeveloperError("State key must be a string.");
  }
  if (
    !remove &&
    (!update || typeof update !== "object" || Array.isArray(update))
  ) {
    throw new DeveloperError("Feature state must be a JSON object.");
  }
  const previous = this.get(t);
  const next = remove
    ? { ...previous }
    : { ...previous, ...State.copy(update) };
  if (remove) {
    if (key === undefined) {
      for (const k of Object.keys(next)) {
        delete next[k];
      }
    } else {
      delete next[key];
    }
  }
  const keys = [
    ...new Set([...Object.keys(previous), ...Object.keys(next)]),
  ].filter((k) => JSON.stringify(previous[k]) !== JSON.stringify(next[k]));
  if (!keys.length) {
    return;
  }
  let source = this.sources.get(t.source);
  if (!source) {
    this.sources.set(t.source, (source = new Map()));
  }
  let layer = source.get(t.sourceLayer);
  if (!layer) {
    source.set(t.sourceLayer, (layer = new Map()));
  }
  if (Object.keys(next).length) {
    layer.set(t.id, next);
  } else {
    layer.delete(t.id);
    if (!layer.size) {
      source.delete(t.sourceLayer);
    }
    if (!source.size) {
      this.sources.delete(t.source);
    }
  }
  invalidate(this, t, keys);
};
StateStore.prototype.setGlobal = function (key, value) {
  if (typeof key !== "string") {
    throw new DeveloperError("Global state key must be a string.");
  }
  const next = { ...this.global };
  if (value === null) {
    delete next[key];
  } else {
    Object.defineProperty(next, key, {
      value: State.copy(value),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  if (JSON.stringify(next[key]) === JSON.stringify(this.global[key])) {
    return;
  }
  this.global = next;
  invalidate(this, undefined, [key]);
};
export default StateStore;
