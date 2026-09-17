import RuntimeError from "../../../Core/RuntimeError.js";
import Layout from "../../Core/_private/_SceneGISVectorSymbolLayout.js";
import Shaping from "./_SceneGISVectorSymbolShaping.js";
import Assets from "./_SceneGISVectorSymbolAssets.js";
import Projection from "./_SceneGISVectorSymbolProjection.js";
import Batches from "./_SceneGISVectorSymbolBatches.js";
import GlobeCoordinates from "../../Core/_private/_SceneGISVectorGlobeCoordinates.js";
import State from "../../Core/_private/_SceneGISVectorState.js";

function inRegion(point, bounds, world) {
  return (
    point.x >= bounds.minimumX &&
    (point.x < bounds.maximumX || point.x === world.maximumX) &&
    point.y <= bounds.maximumY &&
    (point.y > bounds.minimumY || point.y === world.minimumY)
  );
}
function shifted(box, screen, padding) {
  const edges = Array.isArray(padding)
    ? padding
    : [padding, padding, padding, padding];
  return [
    box[0] + screen.x - edges[3],
    box[1] + screen.y - edges[0],
    box[2] + screen.x + edges[1],
    box[3] + screen.y + edges[2],
  ];
}
function close(a, b) {
  let dx = a.anchor.position.x - b.anchor.position.x;
  if (a.terrain?.ellipsoid) {
    const width = GlobeCoordinates.halfWidth * 2;
    dx -= Math.round(dx / width) * width;
  }
  return (
    a.key === b.key &&
    Math.hypot(dx, a.anchor.position.y - b.anchor.position.y) <=
      Math.max(a.tolerance, b.tolerance)
  );
}
function metersPerPixel(runtime, zoom) {
  const extent = runtime.owner._extent;
  return (extent.maximumX - extent.minimumX) / (512 * 2 ** zoom);
}
function eligible(definition, zoom) {
  return (
    definition.type === "symbol" &&
    zoom >= (definition.minzoom ?? 0) &&
    zoom < (definition.maxzoom ?? 24)
  );
}

function tileCandidates(runtime, entry, order) {
  let cached = runtime._tileLayouts.get(entry);
  if (!cached || cached.symbols !== entry.symbols) {
    cached = { symbols: entry.symbols, layers: new Map() };
    runtime._tileLayouts.set(entry, cached);
  }
  let result = cached.layers.get(order);
  if (!result) {
    result = [];
    const layer = entry.symbols?.get(order);
    const definition = runtime.owner._records[order].definition;
    for (const label of layer?.labels ?? []) {
      const identity = Object.freeze({
        source: definition.source,
        sourceLayer: layer.name,
        styleLayer: definition.id,
        featureId: label.feature.id,
        properties: label.feature.properties,
        tile: Object.freeze({ x: entry.x, y: entry.y, level: entry.level }),
      });
      for (const anchor of label.anchors) {
        result.push({
          ...label.names,
          ...anchor,
          anchor,
          label,
          entry,
          symbols: entry.symbols,
          order,
          identity,
          tileKey: entry.key,
          key: label.key,
          id: ++runtime._nextId,
          tolerance:
            (2 * (entry.bounds.maximumX - entry.bounds.minimumX)) /
            layer.extent,
        });
      }
    }
    runtime.statistics.candidateBuilds += result.length;
    result = { candidates: result };
    cached.layers.set(order, result);
  }
  return result;
}

function* indexCandidates(candidates, projection, axis = "x") {
  // Index construction shares the placement budget. Bounds contain actual attached
  // anchor positions, so the same query works for flat, terrain and ECEF anchors.
  yield;
  const bounds = [
    Infinity,
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
    -Infinity,
  ];
  if (candidates.length <= 32) {
    for (const candidate of candidates) {
      Projection.attach(projection, candidate);
      const point = candidate.position;
      bounds[0] = Math.min(bounds[0], point.x);
      bounds[1] = Math.min(bounds[1], point.y);
      bounds[2] = Math.min(bounds[2], point.z);
      bounds[3] = Math.max(bounds[3], point.x);
      bounds[4] = Math.max(bounds[4], point.y);
      bounds[5] = Math.max(bounds[5], point.z);
    }
    return { bounds, candidates };
  }
  const ordered = candidates
    .slice()
    .sort((a, b) => a.anchor.position[axis] - b.anchor.position[axis]);
  const middle = Math.floor(ordered.length / 2);
  const nextAxis = axis === "x" ? "y" : "x";
  const left = yield* indexCandidates(
    ordered.slice(0, middle),
    projection,
    nextAxis,
  );
  const right = yield* indexCandidates(
    ordered.slice(middle),
    projection,
    nextAxis,
  );
  for (let i = 0; i < 3; i++) {
    bounds[i] = Math.min(left.bounds[i], right.bounds[i]);
    bounds[i + 3] = Math.max(left.bounds[i + 3], right.bounds[i + 3]);
  }
  return { bounds, left, right };
}

function* queryCandidates(index, projection) {
  if (!Projection.intersectsBounds(projection, index.bounds)) {
    return;
  }
  if (index.candidates) {
    yield* index.candidates;
  } else {
    yield* queryCandidates(index.left, projection);
    yield* queryCandidates(index.right, projection);
  }
}

function evaluation(runtime, base, zoom) {
  const label = base.label;
  const before = label.evaluation.value.layout;
  label.evaluation = runtime.owner.style._evaluateVisibleLayer(
    base.identity.styleLayer,
    label.feature,
    zoom,
    label.evaluation,
    State.context(
      runtime.owner._states.sources.get(base.identity.source),
      base.identity.sourceLayer,
      label.feature.id,
      runtime.owner._states.global,
    ),
  );
  const evaluated = label.evaluation.value;
  if (!label.shapeKey || evaluated.layout !== before) {
    label.shapeKey = JSON.stringify([
      base.text,
      base.icon,
      base.font,
      evaluated.layout,
    ]);
  }
  return { evaluated, shapeKey: label.shapeKey };
}

function* collect(runtime, job) {
  const result = [],
    world = runtime.owner._extent;
  for (let order = 0; order < runtime.owner._records.length; order++) {
    const definition = runtime.owner._records[order].definition;
    if (!eligible(definition, job.zoom)) {
      continue;
    }
    for (const [entry, regions] of job.cover.get(definition.source) ?? []) {
      const cached = tileCandidates(runtime, entry, order);
      if (cached.candidates.length === 0) {
        continue;
      }
      if (!cached.index || cached.terrain !== job.projection.terrain) {
        cached.index = yield* indexCandidates(
          cached.candidates,
          job.projection,
        );
        cached.terrain = job.projection.terrain;
      }
      for (const base of queryCandidates(cached.index, job.projection)) {
        yield;
        Projection.attach(job.projection, base);
        if (
          !regions.some((region) =>
            inRegion(base.anchor.position, region, world),
          )
        ) {
          continue;
        }
        const screen = Projection.visible(job.projection, base.position);
        if (!screen) {
          continue;
        }
        if (/[\u0590-\u109f]/u.test(base.text)) {
          runtime.report(
            `${definition.id}/shaping`,
            new RuntimeError(
              `This text requires shaping outside the horizontal Latin/CJK profile: ${definition.id}`,
            ),
          );
          continue;
        }
        result.push({
          ...base,
          base,
          screen,
          ...evaluation(runtime, base, job.zoom),
        });
      }
    }
  }
  result.sort(
    (a, b) =>
      b.order - a.order ||
      (a.evaluated.layout["symbol-sort-key"] ?? 0) -
        (b.evaluated.layout["symbol-sort-key"] ?? 0) ||
      a.anchor.position.x - b.anchor.position.x ||
      a.anchor.position.y - b.anchor.position.y ||
      a.key.localeCompare(b.key),
  );
  job.candidateCount = result.length;
  return result.slice(0, runtime.maximumCandidates);
}

function shape(runtime, candidate, old) {
  if (
    old?.shaped?.pages.some(
      ([key, generation]) =>
        (key === "sprite"
          ? runtime.assets.sprite
          : runtime.assets.pages.get(key)
        )?.generation !== generation,
    )
  ) {
    old = undefined;
  }
  let pending = candidate.requirements.some(
    (r) => runtime.assets.pages.get(r.key)?.state !== "ready",
  );
  pending ||= !!candidate.icon && runtime.assets.sprite?.state !== "ready";
  if (pending) {
    if (old?.shaped) {
      candidate.shaped = old.shaped;
      candidate.evaluated = old.evaluated;
      candidate.shapeKey = old.shapeKey;
    }
    return;
  }
  if (old?.shapeKey === candidate.shapeKey) {
    candidate.shaped = old.shaped;
    return;
  }
  let image;
  if (candidate.icon) {
    image = runtime.assets.sprite.metadata[candidate.icon];
    if (!image) {
      runtime._missingImages.add(candidate.icon);
    }
    if (
      image &&
      (image.sdf ||
        ![image.x, image.y, image.width, image.height, image.pixelRatio].every(
          Number.isFinite,
        ) ||
        image.width <= 0 ||
        image.height <= 0 ||
        image.pixelRatio <= 0 ||
        image.x < 0 ||
        image.y < 0 ||
        image.x + image.width > runtime.assets.sprite.image.width ||
        image.y + image.height > runtime.assets.sprite.image.height)
    ) {
      throw new RuntimeError(
        `Missing or invalid ordinary sprite image: ${candidate.icon}`,
      );
    }
  }
  candidate.shaped = runtime._shaping.get(
    candidate,
    candidate.evaluated.layout,
    image,
  );
  if (!candidate.shaped) {
    runtime._waitingShapes = true;
    if (old?.shaped) {
      candidate.shaped = old.shaped;
      candidate.evaluated = old.evaluated;
      candidate.shapeKey = old.shapeKey;
    }
  }
}

function boxes(part, candidate, text) {
  const layout = candidate.evaluated.layout;
  return (part?.boxes ?? []).map((box) =>
    shifted(
      box,
      candidate.screen,
      layout[text ? "text-padding" : "icon-padding"],
    ),
  );
}
function paired(text, icon, layout) {
  return {
    text: !icon && !layout["icon-optional"] ? [] : text,
    icon: !text && !layout["text-optional"] ? [] : icon,
  };
}

function selectAnchor(candidate, anchor) {
  const text = candidate.shaped.variants?.get(anchor);
  if (text && candidate.shaped.text !== text) {
    // Never mutate a shape container borrowed from the published placement.
    candidate.shaped = { ...candidate.shaped, text };
  }
}

function tryPlacement(job, candidate, layout, collision) {
  const text = Projection.collision(
    job.projection,
    candidate,
    candidate.shaped.text,
    true,
    job.metersPerPixel,
  );
  const icon = Projection.collision(
    job.projection,
    candidate,
    candidate.shaped.icon,
    false,
    job.metersPerPixel,
  );
  const proxies = paired(text, icon, layout);
  let textBoxes = boxes(proxies.text, candidate, true);
  let iconBoxes = boxes(proxies.icon, candidate, false);
  const preflight = Layout.place(
    textBoxes,
    iconBoxes,
    layout,
    collision,
    false,
  );
  if (!preflight.text && !preflight.icon) {
    return undefined;
  }
  const geometry = paired(
    preflight.text
      ? Projection.geometry(
          job.projection,
          candidate,
          candidate.shaped.text,
          true,
          job.metersPerPixel,
        )
      : { quads: [] },
    preflight.icon
      ? Projection.geometry(
          job.projection,
          candidate,
          candidate.shaped.icon,
          false,
          job.metersPerPixel,
        )
      : { quads: [] },
    layout,
  );
  textBoxes = geometry.text?.quads?.length ? textBoxes : [];
  iconBoxes = geometry.icon?.quads?.length ? iconBoxes : [];
  const selected = Layout.place(textBoxes, iconBoxes, layout, collision, false);
  if (!selected.text && !selected.icon) {
    return undefined;
  }
  return { selected, geometry, textBoxes, iconBoxes };
}

function* placement(runtime, job) {
  const candidates = yield* collect(runtime, job);
  const requirements = new Map();
  let spriteNeeded = false;
  for (const candidate of candidates) {
    spriteNeeded ||= !!candidate.icon;
    for (const r of candidate.requirements) {
      requirements.set(r.key, r);
    }
  }
  if (requirements.size > runtime.assets.maximumRanges) {
    throw new RuntimeError(
      "Active symbol glyph ranges exceed maximumGlyphRanges.",
    );
  }
  for (const [key, batch] of runtime._groups) {
    if (batch.text ? !requirements.has(batch.page.key) : !spriteNeeded) {
      batch.resources.destroy();
      runtime._groups.delete(key);
    }
  }
  Batches.order(runtime);
  runtime._protected = new Set(
    [...runtime._groups.values()].map((batch) => batch.page.key),
  );
  runtime._requirements = requirements;
  runtime._spriteNeeded = spriteNeeded;
  runtime.assets.prepare(requirements, spriteNeeded, runtime._protected);
  runtime._waitingShapes = false;
  const previous = new Map(),
    anchors = new Map(),
    byKey = new Map(),
    repeats = new Map();
  const matched = new Set(),
    collision = Layout.collision(),
    retained = [];
  for (const old of runtime._previous) {
    anchors.set(old.anchor, old);
    if (!previous.has(old.key)) {
      previous.set(old.key, []);
    }
    previous.get(old.key).push(old);
  }
  job.duplicates = 0;
  for (const candidate of candidates) {
    yield;
    const peers = byKey.get(candidate.key) ?? [];
    if (
      peers.some(
        (other) =>
          other.tileKey !== candidate.tileKey && close(candidate, other),
      )
    ) {
      job.duplicates++;
      continue;
    }
    peers.push(candidate);
    byKey.set(candidate.key, peers);
    const exact = anchors.get(candidate.anchor);
    const old =
      (exact && !matched.has(exact.id) ? exact : undefined) ??
      (previous.get(candidate.key) ?? []).find(
        (other) => close(candidate, other) && !matched.has(other.id),
      );
    candidate.id = old?.id ?? candidate.id;
    candidate.base.id = candidate.id;
    matched.add(candidate.id);
    try {
      shape(runtime, candidate, old);
      if (!candidate.shaped) {
        continue;
      }
      retained.push(candidate);
      const layout = candidate.evaluated.layout;
      const peers = repeats.get(candidate.key) ?? [];
      if (
        candidate.line &&
        candidate.text &&
        peers.some(
          (other) =>
            Math.hypot(
              candidate.screen.x - other.screen.x,
              candidate.screen.y - other.screen.y,
            ) <
            layout["symbol-spacing"] * 0.5,
        )
      ) {
        job.duplicates++;
        continue;
      }
      const variants = candidate.shaped.variants;
      const anchors = variants ? [...variants.keys()] : [undefined];
      if (variants?.has(old?.variableAnchor)) {
        anchors.splice(anchors.indexOf(old.variableAnchor), 1);
        anchors.unshift(old.variableAnchor);
      }
      const passes =
        variants &&
        (layout["text-allow-overlap"] || layout["icon-allow-overlap"])
          ? [
              {
                ...layout,
                "text-allow-overlap": false,
                "icon-allow-overlap": false,
              },
              layout,
            ]
          : [layout];
      let choice, fallback;
      for (const pass of passes) {
        for (const anchor of anchors) {
          if (variants) {
            yield;
          }
          selectAnchor(candidate, anchor);
          const trial = tryPlacement(job, candidate, pass, collision);
          if (!trial) {
            continue;
          }
          trial.shaped = candidate.shaped;
          trial.anchor = anchor;
          if (trial.selected.text || !candidate.text) {
            choice = trial;
            break;
          }
          fallback ??= trial;
        }
        if (choice) {
          break;
        }
      }
      choice ??= fallback;
      if (!choice) {
        continue;
      }
      candidate.shaped = choice.shaped;
      candidate.variableAnchor = choice.anchor;
      candidate.selection = Layout.place(
        choice.textBoxes,
        choice.iconBoxes,
        layout,
        collision,
      );
      candidate._layoutGeometry = choice.geometry;
      candidate.placed = candidate.selection;
      peers.push(candidate);
      repeats.set(candidate.key, peers);
    } catch (error) {
      runtime.report(candidate.key, error);
    }
  }
  return retained;
}

function coverSignature(runtime) {
  const parts = [];
  for (const [id, state] of runtime.owner._sources) {
    for (const [entry, regions] of state.render) {
      parts.push(id, entry.key, entry.signature, entry.symbolZoom);
      for (const r of regions) {
        parts.push(r.minimumX, r.minimumY, r.maximumX, r.maximumY);
      }
    }
  }
  return parts.join("|");
}
function viewSignature(runtime, zoom) {
  const scene = runtime.owner.scene,
    camera = scene.camera;
  const view = camera.viewMatrix,
    projection = camera.frustum.projectionMatrix;
  return [
    runtime.owner._terrain?.revision,
    runtime.owner._states.revision,
    ...Array.from({ length: 16 }, (_, i) => view[i]),
    ...Array.from({ length: 16 }, (_, i) => projection[i]),
    zoom,
    scene.canvas.clientWidth,
    scene.canvas.clientHeight,
    scene.pixelRatio,
  ].join("|");
}
function currentOwner(runtime, candidate) {
  const regions = runtime.owner._sources
    .get(candidate.identity.source)
    ?.render.get(candidate.entry);
  return (
    candidate.entry.symbols === candidate.symbols &&
    regions?.some((r) =>
      inRegion(candidate.anchor.position, r, runtime.owner._extent),
    )
  );
}

function drawCandidates(runtime, candidates, zoom) {
  const projection = runtime._projection;
  const mpp = runtime._metersPerPixel;
  for (const candidate of candidates) {
    if (!candidate.selection) {
      continue;
    }
    Projection.attach(projection, candidate);
    candidate._visible = false;
    candidate.placed = undefined;
    if (
      !currentOwner(runtime, candidate) ||
      !eligible(runtime.owner._records[candidate.order].definition, zoom)
    ) {
      continue;
    }
    const screen = Projection.visible(projection, candidate.position);
    if (!screen) {
      continue;
    }
    candidate.screen = screen;
    const current = evaluation(runtime, candidate.base, zoom);
    if (current.shapeKey !== candidate.shapeKey) {
      const old = {
        shaped: candidate.shaped,
        evaluated: candidate.evaluated,
        shapeKey: candidate.shapeKey,
      };
      Object.assign(candidate, current);
      shape(runtime, candidate, old);
    } else {
      candidate.evaluated = current.evaluated;
    }
    selectAnchor(candidate, candidate.variableAnchor);
    const layout = candidate.evaluated.layout;
    candidate._geometry = paired(
      candidate.selection.text
        ? Projection.geometry(
            projection,
            candidate,
            candidate.shaped.text,
            true,
            mpp,
          )
        : { quads: [] },
      candidate.selection.icon
        ? Projection.geometry(
            projection,
            candidate,
            candidate.shaped.icon,
            false,
            mpp,
          )
        : { quads: [] },
      layout,
    );
    const text =
      candidate.selection.text && !!candidate._geometry.text?.quads?.length;
    const icon =
      candidate.selection.icon && !!candidate._geometry.icon?.quads?.length;
    candidate._visible = text || icon;
    candidate.placed = candidate._visible ? { text, icon } : undefined;
  }
}

function commit(runtime, job, candidates, frameState, zoom) {
  drawCandidates(runtime, candidates, zoom);
  const active = new Set(),
    created = [];
  try {
    for (const candidate of candidates) {
      // Diagnostic geometry is materialized only on inspection, not in the draw hot path.
      Object.defineProperty(candidate, "projected", {
        get() {
          return {
            text: Projection.shape(
              runtime._projection,
              candidate,
              candidate.shaped.text,
              true,
              runtime._metersPerPixel,
            ),
            icon: Projection.shape(
              runtime._projection,
              candidate,
              candidate.shaped.icon,
              false,
              runtime._metersPerPixel,
            ),
          };
        },
      });
      if (!candidate.selection) {
        continue;
      }
      active.add(candidate.id);
      let pick = runtime._pickIds.get(candidate.id);
      if (!pick && runtime.owner._allowPicking) {
        pick = frameState.context.createPickId({
          primitive: runtime.owner,
          id: candidate.identity,
        });
        runtime._pickIds.set(candidate.id, pick);
        created.push(candidate.id);
      }
      if (pick) {
        candidate._pickColor = [
          pick.color.red,
          pick.color.green,
          pick.color.blue,
          pick.color.alpha,
        ];
      }
    }
    Batches.publish(runtime, candidates, frameState);
  } catch (error) {
    for (const id of created) {
      runtime._pickIds.get(id).destroy();
      runtime._pickIds.delete(id);
    }
    throw error;
  }
  for (const candidate of candidates) {
    const pick = runtime._pickIds.get(candidate.id);
    if (pick && candidate.selection) {
      pick.object = { primitive: runtime.owner, id: candidate.identity };
    }
  }
  for (const [id, pick] of runtime._pickIds) {
    if (!active.has(id)) {
      pick.destroy();
      runtime._pickIds.delete(id);
    }
  }
  runtime._previous = candidates;
  runtime._placed = candidates.filter((candidate) => candidate.selection);
  runtime._signature = job.signature;
  runtime._content = job.content;
  runtime._resource = job.resource;
  runtime._nextPlacementTime = performance.now() + 100;
  runtime._protected = new Set(
    [...runtime._groups.values()].map((batch) => batch.page.key),
  );
  const entries = new Set();
  for (const state of runtime.owner._sources.values()) {
    for (const entry of state.entries.values()) {
      entries.add(entry);
    }
  }
  for (const entry of runtime._tileLayouts.keys()) {
    if (!entries.has(entry)) {
      runtime._tileLayouts.delete(entry);
    }
  }
  Object.assign(runtime.statistics, {
    candidates: job.candidateCount,
    truncated: Math.max(0, job.candidateCount - runtime.maximumCandidates),
    duplicates: job.duplicates,
    placementCommits: runtime.statistics.placementCommits + 1,
  });
}

/** Persistent symbol candidates, budgeted placement, and current-camera drawing. @private */
function SceneGISVectorSymbols(
  owner,
  maximumCandidates,
  maximumRanges,
  maximumRequests,
) {
  this.owner = owner;
  this.maximumCandidates = maximumCandidates;
  this.assets = new Assets(owner, maximumRanges, maximumRequests);
  this._shaping = new Shaping(owner, this.assets, maximumCandidates * 2);
  this.batches = new Map();
  this._groups = new Map();
  this._pickIds = new Map();
  this._previous = [];
  this._placed = [];
  this._tileLayouts = new Map();
  this._nextId = 0;
  this._reported = new Set();
  this._missingImages = new Set();
  this._protected = new Set();
  this._requirements = new Map();
  this._nextPlacementTime = 0;
  this._placementBudget = 2;
  this.statistics = {
    candidates: 0,
    placed: 0,
    truncated: 0,
    duplicates: 0,
    candidateBuilds: 0,
    placementCommits: 0,
    placementSteps: 0,
  };
  this.loaded = false;
}
SceneGISVectorSymbols.prototype.report = function (key, error) {
  if (!this._reported.has(key)) {
    this._reported.add(key);
    this.owner._errorEvent.raiseEvent({
      layer: this.owner,
      resource: key,
      error,
    });
  }
};
SceneGISVectorSymbols.prototype.update = function (frameState, zoom) {
  const view = viewSignature(this, zoom);
  const content = coverSignature(this);
  const resource = `${this.assets.revision}/${this._shaping.revision}`;
  const signature = `${view}|${content}|${resource}`;
  this._projection = Projection.snapshot(
    this.owner.scene,
    this.owner._terrain,
    this.owner._referenceDepth,
  );
  this._metersPerPixel = metersPerPixel(this, zoom);
  let changed = view !== this._drawView || content !== this._drawContent;
  if (changed) {
    drawCandidates(this, this._placed, zoom);
    Batches.update(this);
  }
  if (
    !this._placement &&
    signature !== this._signature &&
    (content !== this._content ||
      resource !== this._resource ||
      performance.now() >= this._nextPlacementTime)
  ) {
    const cover = new Map();
    for (const [id, state] of this.owner._sources) {
      cover.set(
        id,
        [...state.render].map(([entry, regions]) => [
          entry,
          regions.map((r) => ({
            minimumX: r.minimumX,
            minimumY: r.minimumY,
            maximumX: r.maximumX,
            maximumY: r.maximumY,
          })),
        ]),
      );
    }
    const job = {
      signature,
      content,
      resource,
      cover,
      zoom,
      projection: this._projection,
      metersPerPixel: this._metersPerPixel,
    };
    job.iterator = placement(this, job);
    this._placement = job;
  }
  if (this._placement) {
    const job = this._placement;
    const start = performance.now();
    let step;
    try {
      do {
        step = job.iterator.next();
        this.statistics.placementSteps++;
      } while (!step.done && performance.now() - start < this._placementBudget);
      if (step.done) {
        commit(this, job, step.value, frameState, zoom);
        this._placement = undefined;
        changed = true;
      }
    } catch (error) {
      job.iterator.return();
      this._placement = undefined;
      this._signature = signature;
      this._content = content;
      this._resource = resource;
      throw error;
    }
  }
  this.assets.prepare(this._requirements, this._spriteNeeded, this._protected);
  for (const error of this.assets.errors.splice(0)) {
    this.report(error.resource, error.error);
  }
  this._shaping.flush();
  this._drawView = view;
  this._drawContent = content;
  if (changed) {
    this.statistics.placed = this._placed.filter(
      (candidate) => candidate._visible,
    ).length;
  }
  const pending = !!this._placement || signature !== this._signature;
  this.loaded =
    !pending &&
    this.assets.loaded &&
    !this._shaping.pending &&
    !this._waitingShapes;
  if (pending) {
    this.owner.scene.requestRender();
  }
};
SceneGISVectorSymbols.prototype.clear = function () {
  this._placement?.iterator.return();
  this._placement = undefined;
  this._projection = undefined;
  for (const batch of this._groups.values()) {
    batch.resources.destroy();
  }
  for (const pick of this._pickIds.values()) {
    pick.destroy();
  }
  this._groups.clear();
  this._pickIds.clear();
  this.batches.clear();
  this._previous = [];
  this._placed = [];
  this._tileLayouts.clear();
  this._shaping.clear();
  this._protected.clear();
  this._requirements.clear();
  this._spriteNeeded = false;
  this._waitingShapes = false;
  this._signature = this._content = this._resource = undefined;
  this._drawView = this._drawContent = undefined;
  this._nextPlacementTime = 0;
  Object.assign(this.statistics, {
    candidates: 0,
    placed: 0,
    truncated: 0,
    duplicates: 0,
  });
  this.loaded = true;
};
SceneGISVectorSymbols.prototype.destroy = function () {
  this.clear();
  this._shaping.destroy();
  this.assets.destroy();
};
export default SceneGISVectorSymbols;
