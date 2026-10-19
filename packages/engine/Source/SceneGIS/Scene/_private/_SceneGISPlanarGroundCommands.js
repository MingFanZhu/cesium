import BlendingState from "../../../Scene/BlendingState.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import DepthFunction from "../../../Scene/DepthFunction.js";
import Primitive from "../../../Scene/Primitive.js";
import StencilConstants from "../../../Scene/StencilConstants.js";
import StencilFunction from "../../../Scene/StencilFunction.js";
import StencilOperation from "../../../Scene/StencilOperation.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Pass from "../../../Renderer/Pass.js";
import RenderState from "../../../Renderer/RenderState.js";

const stencilDepthRenderStateOptions = {
  colorMask: {
    red: false,
    green: false,
    blue: false,
    alpha: false,
  },
  cull: {
    enabled: false,
  },
  stencilTest: {
    enabled: true,
    frontFunction: StencilFunction.ALWAYS,
    frontOperation: {
      fail: StencilOperation.KEEP,
      zFail: StencilOperation.DECREMENT_WRAP,
      zPass: StencilOperation.KEEP,
    },
    backFunction: StencilFunction.ALWAYS,
    backOperation: {
      fail: StencilOperation.KEEP,
      zFail: StencilOperation.INCREMENT_WRAP,
      zPass: StencilOperation.KEEP,
    },
    reference: StencilConstants.CESIUM_3D_TILE_MASK,
    mask: StencilConstants.CESIUM_3D_TILE_MASK,
  },
  stencilMask: StencilConstants.CLASSIFICATION_MASK,
  depthTest: {
    enabled: true,
    func: DepthFunction.LESS_OR_EQUAL,
  },
  depthMask: false,
};

const colorRenderStateOptions = {
  cull: {
    enabled: false,
  },
  stencilTest: {
    enabled: true,
    frontFunction: StencilFunction.NOT_EQUAL,
    frontOperation: {
      fail: StencilOperation.ZERO,
      zFail: StencilOperation.ZERO,
      zPass: StencilOperation.ZERO,
    },
    backFunction: StencilFunction.NOT_EQUAL,
    backOperation: {
      fail: StencilOperation.ZERO,
      zFail: StencilOperation.ZERO,
      zPass: StencilOperation.ZERO,
    },
    reference: 0,
    mask: StencilConstants.CLASSIFICATION_MASK,
  },
  stencilMask: StencilConstants.CLASSIFICATION_MASK,
  depthTest: {
    enabled: false,
  },
  depthMask: false,
  blending: BlendingState.PRE_MULTIPLIED_ALPHA_BLEND,
};

const pickRenderStateOptions = {
  stencilTest: colorRenderStateOptions.stencilTest,
  stencilMask: StencilConstants.CLASSIFICATION_MASK,
  depthTest: {
    enabled: false,
  },
  depthMask: false,
};

function syncBaseCommand(command, modelMatrix, boundingVolume) {
  command.modelMatrix = modelMatrix;
  command.boundingVolume = boundingVolume;
  command.cull = false;
  command.castShadows = false;
  command.receiveShadows = false;
}

/**
 * Creates the standard Primitive queue hook used by planar ground volumes.
 *
 * The two-command z-fail structure follows the algorithmic roles in Cesium's
 * ClassificationPrimitive at upstream baseline
 * 6d5d8b1f0725b6f831b336463f4b11c98023427b. Recheck that source when its
 * stencil mask, depth function, or terrain-classification pass changes.
 *
 * @param {object} owner The public planar ground primitive.
 * @returns {object} The hook and stable derived command arrays.
 * @private
 */
function createSceneGISPlanarGroundCommands(owner) {
  const stencilCommands = [];
  const colorCommands = [];
  const pickStencilCommands = [];
  const pickColorCommands = [];
  let stencilDepthRenderState;
  let colorRenderState;
  let pickRenderState;
  let ranges;
  let rangesDirty = true;

  function updateRanges(primitive) {
    const instances = owner._batch.instances;
    const offsets = primitive._pickOffsets;
    const schema = instances[0].attributes.color;
    const mergeAreas =
      owner._geometryKind === "polygon" &&
      schema.componentDatatype === ComponentDatatype.UNSIGNED_BYTE &&
      schema.normalize;
    const result = [];
    let run;
    let previousColor;
    let count = 0;
    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i];
      const color = mergeAreas
        ? primitive.getGeometryInstanceAttributes(instances[i].id).color
        : undefined;
      // The classification bits count closed-volume crossings. A full wrap would
      // erase coverage when all footprints overlap, even when their colors match.
      const merge =
        mergeAreas &&
        color[3] === 255 &&
        previousColor !== undefined &&
        count < StencilConstants.CLASSIFICATION_MASK &&
        run.index === offset.index &&
        run.offset + run.count === offset.offset &&
        color[0] === previousColor[0] &&
        color[1] === previousColor[1] &&
        color[2] === previousColor[2] &&
        color[3] === previousColor[3];
      if (merge) {
        run.count += offset.count;
        count++;
      } else {
        run = { ...offset };
        result.push(run);
        count = 1;
      }
      previousColor = color;
    }
    ranges = result;
    rangesDirty = false;
  }

  function updateAndQueue(
    primitive,
    frameState,
    sourceColorCommands,
    _sourcePickCommands,
    modelMatrix,
  ) {
    stencilDepthRenderState ??= RenderState.fromCache(
      stencilDepthRenderStateOptions,
    );
    colorRenderState ??= RenderState.fromCache(colorRenderStateOptions);
    pickRenderState ??= RenderState.fromCache(pickRenderStateOptions);
    Primitive._updateBoundingVolumes(primitive, frameState, modelMatrix, false);
    const boundingVolumes = primitive._boundingSphereWC;
    const commandList = frameState.commandList;
    const batch = owner._batch !== undefined;
    if (batch && frameState.passes.render && rangesDirty) {
      updateRanges(primitive);
    }
    const activeRanges = batch
      ? frameState.passes.render
        ? ranges
        : primitive._pickOffsets
      : undefined;
    const length = activeRanges?.length ?? sourceColorCommands.length;
    if (frameState.passes.render) {
      stencilCommands.length = colorCommands.length = length;
    } else if (frameState.passes.pick && !frameState.passes.depth) {
      pickStencilCommands.length = pickColorCommands.length = length;
    }

    for (let i = 0; i < length; ++i) {
      const range = activeRanges?.[i];
      const sourceIndex = range?.index ?? i;
      const source = sourceColorCommands[sourceIndex];
      syncBaseCommand(source, modelMatrix, boundingVolumes[sourceIndex]);

      if (frameState.passes.render) {
        const stencil = DrawCommand.shallowClone(source, stencilCommands[i]);
        stencil.owner = owner;
        stencil.pass = Pass.TERRAIN_CLASSIFICATION;
        stencil.renderState = stencilDepthRenderState;
        stencil.cull = false;
        stencil.pickId = undefined;
        stencilCommands[i] = stencil;

        const color = DrawCommand.shallowClone(source, colorCommands[i]);
        color.owner = owner;
        color.pass = Pass.TERRAIN_CLASSIFICATION;
        color.renderState = colorRenderState;
        color.cull = false;
        color.pickId = undefined;
        colorCommands[i] = color;
        if (batch) {
          stencil.offset = color.offset = range.offset;
          stencil.count = color.count = range.count;
        }

        commandList.push(stencil, color);
      } else if (frameState.passes.pick && !frameState.passes.depth) {
        const stencil = DrawCommand.shallowClone(
          source,
          pickStencilCommands[i],
        );
        stencil.owner = owner;
        stencil.pass = Pass.TERRAIN_CLASSIFICATION;
        stencil.renderState = stencilDepthRenderState;
        stencil.cull = false;
        stencil.pickOnly = true;
        stencil.pickId = undefined;
        pickStencilCommands[i] = stencil;

        const color = DrawCommand.shallowClone(source, pickColorCommands[i]);
        color.owner = owner;
        color.pass = Pass.TERRAIN_CLASSIFICATION;
        color.renderState = pickRenderState;
        color.cull = false;
        color.pickOnly = false;
        color.pickId = primitive.allowPicking ? "v_pickColor" : undefined;
        pickColorCommands[i] = color;
        if (batch) {
          stencil.offset = color.offset = range.offset;
          stencil.count = color.count = range.count;
        }

        commandList.push(stencil, color);
      }
    }
  }

  return {
    updateAndQueue,
    invalidate: function () {
      rangesDirty = true;
    },
    stencilCommands,
    colorCommands,
    pickStencilCommands,
    pickColorCommands,
  };
}

export default createSceneGISPlanarGroundCommands;
