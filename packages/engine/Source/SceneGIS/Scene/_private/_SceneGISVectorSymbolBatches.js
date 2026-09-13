import Cartesian2 from "../../../Core/Cartesian2.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import RenderState from "../../../Renderer/RenderState.js";
import Pass from "../../../Renderer/Pass.js";
import BlendingState from "../../../Scene/BlendingState.js";
import Resources from "../../Renderer/_private/_SceneGISVectorSymbolResources.js";

const corners = [0, 1, 2, 0, 2, 3];
const white = { red: 1, green: 1, blue: 1, alpha: 1 };
const zeroPick = [0, 0, 0, 0];
const fixedStride = Resources.staticStride;
const dynamicStride = Resources.dynamicStride;

function write(batch, fixed, offset, values) {
  const array = fixed ? batch.fixed : batch.staging;
  const range = fixed ? batch.fixedDirty : batch.dynamicDirty;
  for (let i = 0; i < values.length; i++) {
    const value = Math.fround(values[i]);
    if (array[offset + i] !== value) {
      array[offset + i] = value;
      range[0] = Math.min(range[0], offset + i);
      range[1] = Math.max(range[1], offset + i + 1);
    }
  }
}

function writeSlot(batch, slot, initialize) {
  const candidate = slot.candidate,
    text = slot.text;
  const geometry = candidate._geometry?.[text ? "text" : "icon"];
  const quad = geometry?.quads[slot.index];
  const visible = !!(
    candidate._visible &&
    quad &&
    candidate.placed?.[text ? "text" : "icon"]
  );
  const paint = candidate.evaluated.paint;
  const scale = text && quad ? quad.scale : 0;
  const haloWidth = text ? paint["text-halo-width"] : 0;
  const haloBlur = text ? paint["text-halo-blur"] : 0;
  if (
    initialize ||
    slot.quad !== quad ||
    slot.visible !== visible ||
    slot.scale !== scale ||
    slot.haloWidth !== haloWidth ||
    slot.haloBlur !== haloBlur
  ) {
    for (let v = 0; v < corners.length; v++) {
      const corner = corners[v];
      const encoded = quad?.encodedPositions?.[corner] ?? candidate.encoded;
      const high = encoded.high,
        low = encoded.low;
      const offset = quad && !quad.positions ? quad.corners[corner] : [0, 0];
      write(batch, false, (slot.start + v) * dynamicStride, [
        high.x,
        high.y,
        high.z,
        low.x,
        low.y,
        low.z,
        offset[0],
        offset[1],
        scale,
        haloWidth,
        haloBlur,
        Number(visible),
      ]);
    }
    slot.quad = quad;
    slot.visible = visible;
    slot.scale = scale;
    slot.haloWidth = haloWidth;
    slot.haloBlur = haloBlur;
  }
  if (initialize || slot.paint !== paint) {
    const source = slot.source;
    const rect = source.rect,
      page = source.page;
    const width = page.image.width,
      height = page.image.height;
    const opacity = paint[text ? "text-opacity" : "icon-opacity"];
    const color = text ? paint["text-color"] : white;
    const halo = text ? paint["text-halo-color"] : white;
    const pick = candidate._pickColor ?? zeroPick;
    for (let v = 0; v < corners.length; v++) {
      const corner = corners[v];
      write(batch, true, (slot.start + v) * fixedStride, [
        (rect.x + (corner === 1 || corner === 2 ? rect.width : 0)) / width,
        (rect.y + (corner >= 2 ? rect.height : 0)) / height,
        color.red,
        color.green,
        color.blue,
        color.alpha * opacity,
        halo.red,
        halo.green,
        halo.blue,
        text ? halo.alpha * opacity : 0,
        pick[0],
        pick[1],
        pick[2],
        pick[3],
      ]);
    }
    slot.paint = paint;
  }
}

function command(runtime, batch, frameState) {
  const depthRange = new Cartesian2();
  return new DrawCommand({
    owner: runtime.owner,
    vertexArray: batch.resources.vertexArray,
    shaderProgram: batch.resources.shader,
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

function order(runtime) {
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

function upload(batch) {
  batch.resources.update(true, batch.fixed, ...batch.fixedDirty);
  batch.resources.update(false, batch.staging, ...batch.dynamicDirty);
  batch.fixedDirty[0] = batch.dynamicDirty[0] = Infinity;
  batch.fixedDirty[1] = batch.dynamicDirty[1] = 0;
}

function copyChanged(batch, fixed, source, length) {
  const array = fixed ? batch.fixed : batch.staging;
  const range = fixed ? batch.fixedDirty : batch.dynamicDirty;
  for (let i = 0; i < length; i++) {
    if (array[i] !== source[i]) {
      array[i] = source[i];
      range[0] = Math.min(range[0], i);
      range[1] = Math.max(range[1], i + 1);
    }
  }
}

function publish(runtime, candidates, frameState) {
  const groups = new Map();
  const ordered = new Set(
    candidates
      .filter((candidate) =>
        [
          "text-allow-overlap",
          "icon-allow-overlap",
          "text-ignore-placement",
          "icon-ignore-placement",
        ].some((key) => candidate.evaluated.layout[key]),
      )
      .map((candidate) => candidate.order),
  );
  for (const candidate of candidates) {
    for (const text of [false, true]) {
      const part = text ? "text" : "icon";
      if (!candidate.selection?.[part]) {
        continue;
      }
      const quads = candidate._layoutGeometry?.[part]?.quads ?? [];
      for (let index = 0; index < quads.length; index++) {
        const quad = quads[index];
        const key = `${candidate.order}/${Number(text)}/${quad.page.key}/${ordered.has(candidate.order) ? candidate.id : "batch"}`;
        let group = groups.get(key);
        if (!group) {
          group = {
            key,
            record: candidate.order,
            text,
            page: quad.page,
            slots: [],
            length: 0,
          };
          groups.set(key, group);
        }
        group.slots.push({
          candidate,
          text,
          index,
          start: group.length,
          source: quad,
        });
        group.length += 6;
      }
    }
  }
  const next = new Map(),
    allocated = [];
  try {
    for (const [key, group] of groups) {
      const old = runtime._groups.get(key);
      const capacity =
        old?.resources.capacity >= group.length
          ? old.resources.capacity
          : group.length;
      group.fixed = new Float32Array(capacity * fixedStride);
      group.staging = new Float32Array(capacity * dynamicStride);
      group.fixedDirty = [Infinity, 0];
      group.dynamicDirty = [Infinity, 0];
      for (const slot of group.slots) {
        writeSlot(group, slot, true);
      }
      runtime.assets.texture(group.page, frameState.context);
      let batch = old;
      if (!batch || batch.resources.capacity < group.length) {
        batch = group;
        batch.resources = new Resources(
          frameState.context,
          group.fixed,
          group.staging,
        );
        allocated.push(batch);
        batch.command = command(runtime, batch, frameState);
        batch.fixedDirty = [Infinity, 0];
        batch.dynamicDirty = [Infinity, 0];
      }
      next.set(key, batch);
    }
  } catch (error) {
    for (const batch of allocated) {
      batch.resources.destroy();
    }
    throw error;
  }
  // No published stream is changed until all candidate allocations succeed.
  for (const [key, group] of groups) {
    const batch = next.get(key);
    if (batch !== group) {
      copyChanged(batch, true, group.fixed, group.length * fixedStride);
      copyChanged(batch, false, group.staging, group.length * dynamicStride);
      batch.slots = group.slots;
      batch.page = group.page;
      upload(batch);
    }
    batch.command.count = group.length;
  }
  for (const [key, batch] of runtime._groups) {
    if (batch !== next.get(key)) {
      batch.resources.destroy();
    }
  }
  runtime._groups = next;
  order(runtime);
}

function update(runtime) {
  for (const batch of runtime._groups.values()) {
    for (const slot of batch.slots) {
      writeSlot(batch, slot, false);
    }
    upload(batch);
  }
}

/** Publishes symbol membership and uploads only changed vertex streams. @private */
const SceneGISVectorSymbolBatches = { publish, update, order };
export default SceneGISVectorSymbolBatches;
