import Cartesian2 from "../../../Core/Cartesian2.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import RenderState from "../../../Renderer/RenderState.js";
import Pass from "../../../Renderer/Pass.js";
import BlendingState from "../../../Scene/BlendingState.js";
import Layout from "../../Core/_private/_SceneGISVectorSymbolLayout.js";
import Resources from "../../Renderer/_private/_SceneGISVectorSymbolResources.js";
import Shaping from "./_SceneGISVectorSymbolShaping.js";
import Assets from "./_SceneGISVectorSymbolAssets.js";
import Projection from "./_SceneGISVectorSymbolProjection.js";

function inRegion(point, bounds, world) {
  return (
    point.x >= bounds.minimumX &&
    (point.x < bounds.maximumX || point.x === world.maximumX) &&
    point.y <= bounds.maximumY &&
    (point.y > bounds.minimumY || point.y === world.minimumY)
  );
}
function shifted(box, screen, padding) {
  if (!box) {
    return undefined;
  }
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
  return (
    a.key === b.key &&
    Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) <=
      Math.max(a.tolerance, b.tolerance)
  );
}
function colorValues(color, opacity) {
  return [color.red, color.green, color.blue, color.alpha * opacity];
}
const white = { red: 1, green: 1, blue: 1, alpha: 1 };
const corners = [0, 1, 2, 0, 2, 3];

function appendQuad(group, candidate, quad, text, pick) {
  const needed = group.length + 6 * Resources.stride;
  if (!group.values || group.values.length < needed) {
    const expanded = new Float32Array(
      Math.max(needed, (group.values?.length ?? 0) * 2),
    );
    if (group.values) {
      expanded.set(group.values);
    }
    group.values = expanded;
  }
  const values = group.values,
    rect = quad.rect,
    page = quad.page;
  const width = page.image.width,
    height = page.image.height;
  const paint = candidate.evaluated.paint;
  const opacity = paint[text ? "text-opacity" : "icon-opacity"];
  const color = text ? paint["text-color"] : white;
  const halo = text ? paint["text-halo-color"] : white;
  const haloOpacity = text ? opacity : 0;
  let index = group.length;
  for (const corner of corners) {
    const encoded = quad.encodedPositions
      ? quad.encodedPositions[corner]
      : candidate.encoded;
    const high = encoded.high,
      low = encoded.low;
    const right = corner === 1 || corner === 2,
      bottom = corner >= 2;
    values[index++] = high.x;
    values[index++] = high.y;
    values[index++] = high.z;
    values[index++] = low.x;
    values[index++] = low.y;
    values[index++] = low.z;
    values[index++] = quad.positions ? 0 : quad.corners[corner][0];
    values[index++] = quad.positions ? 0 : quad.corners[corner][1];
    values[index++] = (rect.x + (right ? rect.width : 0)) / width;
    values[index++] = (rect.y + (bottom ? rect.height : 0)) / height;
    values[index++] = color.red;
    values[index++] = color.green;
    values[index++] = color.blue;
    values[index++] = color.alpha * opacity;
    values[index++] = halo.red;
    values[index++] = halo.green;
    values[index++] = halo.blue;
    values[index++] = halo.alpha * haloOpacity;
    values[index++] = text ? quad.scale : 0;
    values[index++] = text ? paint["text-halo-width"] : 0;
    values[index++] = text ? paint["text-halo-blur"] : 0;
    values[index++] = pick[0];
    values[index++] = pick[1];
    values[index++] = pick[2];
    values[index++] = pick[3];
  }
  group.length = index;
}

function publish(runtime, groups, frameState) {
  const previous = runtime._groups,
    next = new Map();
  const updates = [];
  try {
    for (const [key, group] of groups) {
      const values = group.values.subarray(0, group.length);
      let batch = previous.get(key);
      if (!batch || batch.resources.capacity < values.length) {
        const resources = new Resources(frameState.context, group.values);
        const depthRange = new Cartesian2();
        batch = {
          resources,
          page: group.page,
          record: group.record,
          text: group.text,
        };
        next.set(key, batch);
        batch.command = new DrawCommand({
          owner: runtime.owner,
          vertexArray: resources.vertexArray,
          shaderProgram: resources.shader,
          uniformMap: {
            u_symbolAtlas: () =>
              runtime.assets.texture(batch.page, frameState.context),
            u_symbolDepthRange: () => {
              const far = frameState.context.uniformState.currentFrustum.y;
              const index = frameState.frustumSplits.indexOf(far);
              depthRange.x = frameState.frustumSplits[index - 1];
              depthRange.y = far;
              return depthRange;
            },
          },
          renderState: RenderState.fromCache({
            depthTest: { enabled: false },
            depthMask: false,
            cull: { enabled: false },
            blending: BlendingState.PRE_MULTIPLIED_ALPHA_BLEND,
          }),
          pickId: runtime.owner._allowPicking ? "v_pickColor" : undefined,
          pass: Pass.TERRAIN_CLASSIFICATION,
          cull: false,
        });
      }
      // Allocate textures in normal update, never lazily from a pick uniform.
      runtime.assets.texture(group.page, frameState.context);
      updates.push({
        batch,
        values,
        staging: group.values,
        page: group.page,
        reused: batch === previous.get(key),
      });
      next.set(key, batch);
    }
  } catch (error) {
    for (const [key, batch] of next) {
      if (batch !== previous.get(key)) {
        batch.resources.destroy();
      }
    }
    throw error;
  }
  // All allocations are complete before touching the published buffers or counts.
  for (const { batch, values, staging, page, reused } of updates) {
    if (reused) {
      batch.resources.update(values);
    }
    batch.page = page;
    batch.staging = staging;
    batch.command.count = values.length / Resources.stride;
  }
  for (const [key, batch] of previous) {
    if (batch !== next.get(key)) {
      batch.resources.destroy();
    }
  }
  runtime._groups = next;
  orderBatches(runtime);
}

function orderBatches(runtime) {
  runtime.batches.clear();
  for (const batch of [...runtime._groups.values()].sort(
    (a, b) => a.record - b.record || Number(a.text) - Number(b.text),
  )) {
    const id = runtime.owner._records[batch.record].definition.id;
    if (!runtime.batches.has(id)) {
      runtime.batches.set(id, []);
    }
    runtime.batches.get(id).push({
      renderCommands: [batch.command],
      queue(frame) {
        if (
          frame.passes.render ||
          (frame.passes.pick &&
            !frame.passes.depth &&
            runtime.owner._allowPicking)
        ) {
          frame.commandList.push(batch.command);
        }
      },
    });
  }
}

function tileLabels(runtime, state, entry, order) {
  let cached = runtime._tileLayouts.get(entry);
  if (!cached || cached.symbols !== entry.symbols) {
    cached = {
      data: entry.data,
      zoom: entry.symbolZoom,
      symbols: entry.symbols,
      layers: new Map(
        [...(entry.symbols ?? [])].map(([key, layer]) => [key, layer.labels]),
      ),
    };
    runtime._tileLayouts.set(entry, cached);
  }
  return cached.layers.get(order) ?? [];
}

function collect(runtime, zoom, projection) {
  const owner = runtime.owner;
  const world = owner._world.coordinateSystem.extent;
  const metersPerPixel =
    (world.maximumX - world.minimumX) / (512 * 2 ** Math.floor(zoom));
  const result = [];
  const activeEntries = new Set();
  for (let order = 0; order < owner._records.length; order++) {
    const definition = owner._records[order].definition;
    if (
      definition.type !== "symbol" ||
      zoom < (definition.minzoom ?? 0) ||
      zoom >= (definition.maxzoom ?? 24)
    ) {
      continue;
    }
    const state = owner._sources.get(definition.source);
    for (const [entry, regions] of state.render) {
      activeEntries.add(entry);
      const sourceLayer = entry.symbols?.get(order);
      if (!sourceLayer) {
        continue;
      }
      for (const label of tileLabels(
        runtime,
        state,
        entry,
        order,
        sourceLayer,
        zoom,
        metersPerPixel,
      )) {
        const { feature, names } = label;
        const visible = [];
        for (const anchor of label.anchors) {
          if (
            !regions.some((region) => inRegion(anchor.position, region, world))
          ) {
            continue;
          }
          const screen = Projection.visible(projection, anchor.position);
          if (screen) {
            visible.push({ anchor, screen });
          }
        }
        if (visible.length === 0) {
          continue;
        }
        const previousLayout = label.evaluation.value.layout;
        label.evaluation = owner.style._evaluateVisibleLayer(
          definition.id,
          feature,
          zoom,
          label.evaluation,
        );
        const evaluated = label.evaluation.value;
        if (!label.shapeKey || evaluated.layout !== previousLayout) {
          label.shapeKey = JSON.stringify([
            names.text,
            names.icon,
            names.font,
            evaluated.layout,
          ]);
        }
        for (const { anchor, screen } of visible) {
          if (/[\u0590-\u109f]/u.test(names.text)) {
            runtime.report(
              `${definition.id}/shaping`,
              new RuntimeError(
                `This text requires shaping outside the horizontal Latin/CJK profile: ${definition.id}`,
              ),
            );
            continue;
          }
          result.push({
            ...names,
            ...anchor,
            anchor,
            shapeKey: label.shapeKey,
            screen,
            evaluated,
            order,
            tileKey: entry.key,
            key: label.key,
            tolerance:
              (2 * (entry.bounds.maximumX - entry.bounds.minimumX)) /
              sourceLayer.extent,
            identity: {
              source: definition.source,
              sourceLayer: sourceLayer.name,
              styleLayer: definition.id,
              featureId: feature.id,
              properties: feature.properties,
              tile: { x: entry.x, y: entry.y, level: entry.level },
            },
          });
        }
      }
    }
  }
  for (const entry of runtime._tileLayouts.keys()) {
    if (!activeEntries.has(entry)) {
      runtime._tileLayouts.delete(entry);
    }
  }
  result.sort(
    (a, b) =>
      b.order - a.order ||
      (a.evaluated.layout["symbol-sort-key"] ?? 0) -
        (b.evaluated.layout["symbol-sort-key"] ?? 0) ||
      a.position.x - b.position.x ||
      a.position.y - b.position.y ||
      a.key.localeCompare(b.key),
  );
  runtime.statistics.candidates = result.length;
  runtime.statistics.truncated = Math.max(
    0,
    result.length - runtime.maximumCandidates,
  );
  return result.slice(0, runtime.maximumCandidates);
}

/** View-wide placement and symbol command publication. @private */
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
  this._tileLayouts = new Map();
  this._nextId = 0;
  this._reported = new Set();
  this._missingImages = new Set();
  this._protected = new Set();
  this._requirements = new Map();
  this.statistics = { candidates: 0, placed: 0, truncated: 0, duplicates: 0 };
  this.loaded = false;
}
SceneGISVectorSymbols.prototype.report = function (key, error) {
  if (this._reported.has(key)) {
    return;
  }
  this._reported.add(key);
  this.owner._errorEvent.raiseEvent({
    layer: this.owner,
    resource: key,
    error,
  });
};
SceneGISVectorSymbols.prototype.update = function (frameState, zoom) {
  const owner = this.owner,
    camera = owner.scene.camera;
  const parts = [
    ...Array.from({ length: 16 }, (_, i) => camera.viewMatrix[i]),
    ...Array.from({ length: 16 }, (_, i) => camera.frustum.projectionMatrix[i]),
    zoom,
    owner.scene.canvas.clientWidth,
    owner.scene.canvas.clientHeight,
    owner.scene.pixelRatio,
    this.assets.revision,
    this._shaping.revision,
  ];
  for (const [id, state] of owner._sources) {
    for (const [entry, regions] of state.render) {
      parts.push(
        id,
        entry.key,
        entry.signature,
        ...regions.flatMap((r) => [
          r.minimumX,
          r.minimumY,
          r.maximumX,
          r.maximumY,
        ]),
      );
    }
  }
  const signature = parts.join("|");
  if (signature === this._signature) {
    this.assets.prepare(
      this._requirements,
      this._spriteNeeded,
      this._protected,
    );
    this._shaping.flush();
    this.loaded =
      this.assets.loaded && !this._shaping.pending && !this._waitingShapes;
    return;
  }
  this._waitingShapes = false;
  const projection = Projection.snapshot(owner.scene);
  const candidates = collect(this, zoom, projection),
    requirements = new Map();
  let spriteNeeded = false;
  for (const candidate of candidates) {
    spriteNeeded ||= !!candidate.icon;
    for (const requirement of candidate.requirements) {
      requirements.set(requirement.key, requirement);
    }
  }
  if (requirements.size > this.assets.maximumRanges) {
    throw new RuntimeError(
      "Active symbol glyph ranges exceed maximumGlyphRanges.",
    );
  }
  // Release obsolete atlas references before the cache may evict their pages.
  // Matching old labels use the same content/font keys and remain protected.
  for (const [key, batch] of this._groups) {
    if (batch.text ? !requirements.has(batch.page.key) : !spriteNeeded) {
      batch.resources.destroy();
      this._groups.delete(key);
    }
  }
  orderBatches(this);
  this._protected = new Set(
    [...this._groups.values()].map((batch) => batch.page.key),
  );
  this.assets.prepare(requirements, spriteNeeded, this._protected);
  for (const error of this.assets.errors.splice(0)) {
    this.report(error.resource, error.error);
  }
  const byKey = new Map(),
    previous = new Map(),
    previousAnchors = new Map(),
    activePicks = new Set(),
    matched = new Set(),
    createdPicks = [],
    pickObjects = new Map(),
    protectedKeys = new Set();
  for (const candidate of this._previous) {
    previousAnchors.set(candidate.anchor, candidate);
    if (!previous.has(candidate.key)) {
      previous.set(candidate.key, []);
    }
    previous.get(candidate.key).push(candidate);
  }
  const collision = Layout.collision(),
    groups = new Map(),
    retained = [],
    repeats = new Map();
  const extent = owner._world.coordinateSystem.extent;
  const metersPerPixel =
    (extent.maximumX - extent.minimumX) / (512 * 2 ** zoom);
  // Collision-free labels may share page batches. Overlapping labels must keep
  // feature paint order even when consecutive glyphs use different atlas pages.
  const orderedLayers = new Set(
    candidates
      .filter((candidate) =>
        [
          "text-allow-overlap",
          "icon-allow-overlap",
          "text-ignore-placement",
          "icon-ignore-placement",
        ].some((name) => candidate.evaluated.layout[name]),
      )
      .map((candidate) => candidate.order),
  );
  let placed = 0,
    duplicates = 0;
  for (const candidate of candidates) {
    const peers = byKey.get(candidate.key) ?? [];
    if (
      peers.some(
        (other) =>
          other.tileKey !== candidate.tileKey && close(candidate, other),
      )
    ) {
      duplicates++;
      continue;
    }
    peers.push(candidate);
    byKey.set(candidate.key, peers);
    const exact = previousAnchors.get(candidate.anchor);
    const old =
      (exact && !matched.has(exact.id) ? exact : undefined) ??
      (previous.get(candidate.key) ?? []).find(
        (other) => close(candidate, other) && !matched.has(other.id),
      );
    candidate.id = old?.id ?? ++this._nextId;
    matched.add(candidate.id);
    const layout = candidate.evaluated.layout;
    const shapeKey = candidate.shapeKey;
    let pending = false;
    for (const requirement of candidate.requirements) {
      const page = this.assets.pages.get(requirement.key);
      if (page?.state !== "ready") {
        pending = true;
      }
    }
    if (candidate.icon && this.assets.sprite?.state !== "ready") {
      pending = true;
    }
    try {
      if (pending) {
        if (!old?.shaped) {
          continue;
        }
        candidate.shaped = old.shaped;
        candidate.evaluated = old.evaluated;
      } else if (old?.shapeKey === shapeKey) {
        candidate.shaped = old.shaped;
      } else {
        let image;
        if (candidate.icon) {
          image = this.assets.sprite.metadata[candidate.icon];
          // A missing sprite entry has no icon geometry; text still participates.
          // This follows MapLibre's performSymbolLayout rather than substituting an image.
          if (!image) {
            this._missingImages.add(candidate.icon);
          }
          if (
            image &&
            (image.sdf ||
              ![
                image.x,
                image.y,
                image.width,
                image.height,
                image.pixelRatio,
              ].every(Number.isFinite) ||
              image.width <= 0 ||
              image.height <= 0 ||
              image.pixelRatio <= 0 ||
              image.x < 0 ||
              image.y < 0 ||
              image.x + image.width > this.assets.sprite.image.width ||
              image.y + image.height > this.assets.sprite.image.height)
          ) {
            throw new RuntimeError(
              `Missing or invalid ordinary sprite image: ${candidate.icon}`,
            );
          }
        }
        const shaped = this._shaping.get(candidate, layout, image);
        if (!shaped) {
          this._waitingShapes = true;
          if (!old?.shaped) {
            continue;
          }
          candidate.shaped = old.shaped;
          candidate.evaluated = old.evaluated;
          pending = true;
        } else {
          candidate.shaped = shaped;
        }
      }
      candidate.shapeKey = pending ? old.shapeKey : shapeKey;
      const shaped = candidate.shaped,
        effective = candidate.evaluated.layout;
      const projected = {
        text: Projection.shape(
          projection,
          candidate,
          shaped.text,
          true,
          metersPerPixel,
        ),
        icon: Projection.shape(
          projection,
          candidate,
          shaped.icon,
          false,
          metersPerPixel,
        ),
      };
      candidate.projected = projected;
      const blockedText = !projected.text && !effective["text-optional"];
      const blockedIcon = !projected.icon && !effective["icon-optional"];
      const textBoxes = blockedIcon
        ? []
        : (projected.text?.boxes ?? []).map((box) =>
            shifted(box, candidate.screen, effective["text-padding"]),
          );
      const iconBoxes = blockedText
        ? []
        : (projected.icon?.boxes ?? []).map((box) =>
            shifted(box, candidate.screen, effective["icon-padding"]),
          );
      const peers = repeats.get(candidate.key) ?? [];
      const repeated =
        candidate.line &&
        candidate.text &&
        peers.some(
          (other) =>
            Math.hypot(
              candidate.screen.x - other.screen.x,
              candidate.screen.y - other.screen.y,
            ) <
            effective["symbol-spacing"] * 0.5,
        );
      const placement = repeated
        ? { text: false, icon: false }
        : Layout.place(textBoxes, iconBoxes, effective, collision);
      duplicates += Number(!!repeated);
      retained.push(candidate);
      for (const shapedPart of [shaped.text, shaped.icon]) {
        for (const quad of shapedPart.quads) {
          protectedKeys.add(quad.page.key);
        }
      }
      if (!placement.text && !placement.icon) {
        continue;
      }
      placed++;
      candidate.placed = placement;
      peers.push(candidate);
      repeats.set(candidate.key, peers);
      activePicks.add(candidate.id);
      let pick = this._pickIds.get(candidate.id);
      if (!pick && owner._allowPicking) {
        pick = frameState.context.createPickId({
          primitive: owner,
          id: candidate.identity,
        });
        this._pickIds.set(candidate.id, pick);
        createdPicks.push(candidate.id);
      }
      if (pick) {
        pickObjects.set(pick, { primitive: owner, id: candidate.identity });
      }
      const color = pick ? colorValues(pick.color, 1) : [0, 0, 0, 0];
      for (const text of [false, true]) {
        if (!(text ? placement.text : placement.icon)) {
          continue;
        }
        for (const quad of (text ? projected.text : projected.icon).quads) {
          const key = `${candidate.order}/${Number(text)}/${quad.page.key}/${orderedLayers.has(candidate.order) ? candidate.id : "batch"}`;
          let group = groups.get(key);
          if (!group) {
            group = {
              values: this._groups.get(key)?.staging,
              length: 0,
              record: candidate.order,
              text,
              page: quad.page,
            };
            groups.set(key, group);
          }
          appendQuad(group, candidate, quad, text, color);
        }
      }
    } catch (error) {
      this.report(candidate.key, error);
    }
  }
  try {
    publish(this, groups, frameState);
  } catch (error) {
    for (const id of createdPicks) {
      this._pickIds.get(id).destroy();
      this._pickIds.delete(id);
    }
    throw error;
  }
  for (const [pick, object] of pickObjects) {
    pick.object = object;
  }
  for (const [id, pick] of this._pickIds) {
    if (!activePicks.has(id)) {
      pick.destroy();
      this._pickIds.delete(id);
    }
  }
  this._previous = retained;
  this._protected = protectedKeys;
  this._requirements = requirements;
  this._spriteNeeded = spriteNeeded;
  this._signature = signature;
  this._shaping.flush();
  this.loaded =
    this.assets.loaded && !this._shaping.pending && !this._waitingShapes;
  this.statistics = { ...this.statistics, placed, duplicates };
};
SceneGISVectorSymbols.prototype.clear = function () {
  this._signature = undefined;
  this.batches.clear();
  this._tileLayouts.clear();
  this._shaping.records.clear();
  this._waitingShapes = false;
  this.loaded = true;
  this.statistics = { candidates: 0, placed: 0, truncated: 0, duplicates: 0 };
};
SceneGISVectorSymbols.prototype.destroy = function () {
  this._shaping.destroy();
  for (const batch of this._groups.values()) {
    batch.resources.destroy();
  }
  for (const pick of this._pickIds.values()) {
    pick.destroy();
  }
  this.assets.destroy();
  this._groups.clear();
  this._pickIds.clear();
  this._previous.length = 0;
  this._tileLayouts.clear();
};
export default SceneGISVectorSymbols;
