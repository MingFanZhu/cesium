import BlendingState from "../../../Scene/BlendingState.js";
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
    const length = sourceColorCommands.length;
    stencilCommands.length = length;
    colorCommands.length = length;
    pickStencilCommands.length = length;
    pickColorCommands.length = length;

    for (let i = 0; i < length; ++i) {
      const source = sourceColorCommands[i];
      syncBaseCommand(source, modelMatrix, boundingVolumes[i]);

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

        commandList.push(stencil, color);
      }
    }
  }

  return {
    updateAndQueue,
    stencilCommands,
    colorCommands,
    pickStencilCommands,
    pickColorCommands,
  };
}

export default createSceneGISPlanarGroundCommands;
