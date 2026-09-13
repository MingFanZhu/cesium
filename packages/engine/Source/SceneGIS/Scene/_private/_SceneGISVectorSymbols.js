import Cartesian2 from "../../../Core/Cartesian2.js";
import EncodedCartesian3 from "../../../Core/EncodedCartesian3.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import RenderState from "../../../Renderer/RenderState.js";
import Pass from "../../../Renderer/Pass.js";
import BlendingState from "../../../Scene/BlendingState.js";
import SceneTransforms from "../../../Scene/SceneTransforms.js";
import Coordinates from "../../Core/SceneGISVectorTileCoordinates.js";
import Layout from "../../Core/_private/_SceneGISVectorSymbolLayout.js";
import Resources from "../../Renderer/_private/_SceneGISVectorSymbolResources.js";
import Assets from "./_SceneGISVectorSymbolAssets.js";

function inRegion(point, bounds, world) {
  return (
    point.x >= bounds.minimumX &&
    (point.x < bounds.maximumX || point.x === world.maximumX) &&
    point.y <= bounds.maximumY &&
    (point.y > bounds.minimumY || point.y === world.minimumY)
  );
}
function content(layout) {
  let text = layout["text-field"] ?? "";
  if (layout["text-transform"] === "uppercase") {
    text = text.toUpperCase();
  }
  if (layout["text-transform"] === "lowercase") {
    text = text.toLowerCase();
  }
  return {
    text,
    icon: layout["icon-image"] ?? "",
    font: layout["text-font"].join(","),
  };
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

function appendQuad(values, candidate, quad, text, pick) {
  const high = candidate.encoded.high,
    low = candidate.encoded.low;
  const rect = quad.rect,
    page = quad.page;
  const width = page.image.width,
    height = page.image.height;
  const boxes = [
    [quad.box[0], quad.box[1]],
    [quad.box[2], quad.box[1]],
    [quad.box[2], quad.box[3]],
    [quad.box[0], quad.box[3]],
  ];
  const uv = [
    [rect.x / width, rect.y / height],
    [(rect.x + rect.width) / width, rect.y / height],
    [(rect.x + rect.width) / width, (rect.y + rect.height) / height],
    [rect.x / width, (rect.y + rect.height) / height],
  ];
  const paint = candidate.evaluated.paint;
  const opacity = paint[text ? "text-opacity" : "icon-opacity"];
  const color = colorValues(text ? paint["text-color"] : white, opacity);
  const halo = colorValues(
    text ? paint["text-halo-color"] : white,
    text ? opacity : 0,
  );
  for (const corner of corners) {
    values.push(
      high.x,
      high.y,
      high.z,
      low.x,
      low.y,
      low.z,
      ...boxes[corner],
      ...uv[corner],
      ...color,
      ...halo,
      text ? quad.scale : 0,
      text ? paint["text-halo-width"] : 0,
      text ? paint["text-halo-blur"] : 0,
      ...pick,
    );
  }
}

function publish(runtime, groups, frameState) {
  const previous = runtime._groups,
    next = new Map();
  const updates = [];
  try {
    for (const [key, group] of groups) {
      const values = new Float32Array(group.values);
      let batch = previous.get(key);
      if (!batch || batch.resources.capacity < values.length) {
        const resources = new Resources(frameState.context, values);
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
  for (const { batch, values, page, reused } of updates) {
    if (reused) {
      batch.resources.update(values);
    }
    batch.page = page;
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

function collect(runtime, zoom) {
  const owner = runtime.owner,
    scene = owner.scene;
  const world = owner._world.coordinateSystem.extent;
  const camera = scene.camera;
  const eye = camera.positionWC;
  const direction = camera.directionWC;
  const result = [];
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
      const sourceLayer = entry.data.layers.find(
        (layer) => layer.name === definition["source-layer"],
      );
      if (!sourceLayer) {
        continue;
      }
      const coordinates = new Coordinates({
        tilingScheme: state.source.tilingScheme,
        x: entry.x,
        y: entry.y,
        level: entry.level,
        extent: sourceLayer.extent,
      });
      for (const feature of sourceLayer.features) {
        const evaluated = owner.style.evaluateLayer(
          definition.id,
          feature,
          zoom,
        );
        if (!evaluated.show) {
          continue;
        }
        const names = content(evaluated.layout);
        if (!names.text && !names.icon) {
          continue;
        }
        if (feature.type !== 1) {
          runtime.report(
            `${definition.id}/geometry`,
            new RuntimeError(
              `Point symbol profile requires MVT Point geometry: ${
                definition.id
              }`,
            ),
          );
          continue;
        }
        for (const part of feature.geometry.parts) {
          for (let i = 0; i < part.length; i += 2) {
            const position = coordinates.toWorld(part[i], part[i + 1]);
            if (!regions.some((region) => inRegion(position, region, world))) {
              continue;
            }
            const depth =
              (position.x - eye.x) * direction.x +
              (position.y - eye.y) * direction.y +
              (position.z - eye.z) * direction.z;
            if (depth <= camera.frustum.near || depth > camera.frustum.far) {
              continue;
            }
            const screen = SceneTransforms.worldToWindowCoordinates(
              scene,
              position,
              new Cartesian2(),
            );
            if (
              !screen ||
              screen.x < 0 ||
              screen.y < 0 ||
              screen.x >= scene.canvas.clientWidth ||
              screen.y >= scene.canvas.clientHeight
            ) {
              continue;
            }
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
              position,
              screen,
              evaluated,
              order,
              tileKey: entry.key,
              key: JSON.stringify([
                definition.source,
                definition.id,
                names.text,
                names.icon,
                names.font,
              ]),
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

/** View-wide point placement and symbol command publication. @private */
function SceneGISVectorSymbols(
  owner,
  maximumCandidates,
  maximumRanges,
  maximumRequests,
) {
  this.owner = owner;
  this.maximumCandidates = maximumCandidates;
  this.assets = new Assets(owner, maximumRanges, maximumRequests);
  this.batches = new Map();
  this._groups = new Map();
  this._pickIds = new Map();
  this._previous = [];
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
    this.loaded = this.assets.loaded;
    return;
  }
  const candidates = collect(this, zoom),
    requirements = new Map();
  let spriteNeeded = false;
  for (const candidate of candidates) {
    spriteNeeded ||= !!candidate.icon;
    for (const character of candidate.text) {
      if (character === "\n" || character === "\r") {
        continue;
      }
      const code = character.codePointAt(0);
      requirements.set(Assets.key(candidate.font, code), {
        font: candidate.font,
        range: Math.floor(code / 256),
      });
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
    activePicks = new Set(),
    matched = new Set(),
    createdPicks = [],
    pickObjects = new Map(),
    protectedKeys = new Set();
  for (const candidate of this._previous) {
    if (!previous.has(candidate.key)) {
      previous.set(candidate.key, []);
    }
    previous.get(candidate.key).push(candidate);
  }
  const collision = Layout.collision(),
    groups = new Map(),
    retained = [];
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
    const old = (previous.get(candidate.key) ?? []).find(
      (other) => close(candidate, other) && !matched.has(other.id),
    );
    candidate.id = old?.id ?? ++this._nextId;
    matched.add(candidate.id);
    const layout = candidate.evaluated.layout;
    const shapeKey = JSON.stringify([
      candidate.text,
      candidate.icon,
      candidate.font,
      layout,
    ]);
    let pending = false;
    for (const character of candidate.text) {
      if (character === "\n" || character === "\r") {
        continue;
      }
      const page = this.assets.pages.get(
        Assets.key(candidate.font, character.codePointAt(0)),
      );
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
        candidate.shaped = {
          text: Layout.text(candidate.text.replace(/\r/g, ""), layout, (code) =>
            this.assets.glyph(candidate.font, code),
          ),
          icon: Layout.icon(image, this.assets.sprite, layout),
        };
      }
      candidate.shapeKey = pending ? old.shapeKey : shapeKey;
      candidate.encoded = EncodedCartesian3.fromCartesian(candidate.position);
      const shaped = candidate.shaped,
        effective = candidate.evaluated.layout;
      const textBox = shifted(
        shaped.text.box,
        candidate.screen,
        effective["text-padding"],
      );
      const iconBox = shifted(
        shaped.icon.box,
        candidate.screen,
        effective["icon-padding"],
      );
      const placement = Layout.place(textBox, iconBox, effective, collision);
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
        for (const quad of (text ? shaped.text : shaped.icon).quads) {
          const key = `${candidate.order}/${Number(text)}/${quad.page.key}/${orderedLayers.has(candidate.order) ? candidate.id : "batch"}`;
          let group = groups.get(key);
          if (!group) {
            group = {
              values: [],
              record: candidate.order,
              text,
              page: quad.page,
            };
            groups.set(key, group);
          }
          appendQuad(group.values, candidate, quad, text, color);
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
  this.loaded = this.assets.loaded;
  this.statistics = { ...this.statistics, placed, duplicates };
};
SceneGISVectorSymbols.prototype.clear = function () {
  this._signature = undefined;
  this.batches.clear();
  this.loaded = true;
  this.statistics = { candidates: 0, placed: 0, truncated: 0, duplicates: 0 };
};
SceneGISVectorSymbols.prototype.destroy = function () {
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
};
export default SceneGISVectorSymbols;
