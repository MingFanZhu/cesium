import Pass from "../../../Renderer/Pass.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";

function depthCommand(command, scene) {
  const derivedCommands = command.derivedCommands;
  const derived = DrawCommand.shallowClone(
    command,
    derivedCommands.sceneGISSurfaceDepth,
  );
  derivedCommands.sceneGISSurfaceDepth = derived;
  // Native translucent color omits skirts. Its borrowed first-surface depth
  // still needs the existing seam closure to keep maps off the distant side.
  derived.count = command.vertexArray.indexBuffer.numberOfIndices;
  scene.updateDerivedCommands(derived);
  return derived;
}

function hasCommands(owners, commands, length) {
  if (owners === undefined) {
    return false;
  }
  for (let i = 0; i < length; i++) {
    if (owners.has(commands[i].owner)) {
      return true;
    }
  }
  return false;
}

function execute(
  scene,
  passState,
  frustumCommands,
  executeCommand,
  owners,
  side,
  depthTexture,
) {
  const uniformState = scene.context.uniformState;
  const commands = frustumCommands.commands[Pass.TRANSLUCENT];
  const length = frustumCommands.indices[Pass.TRANSLUCENT];
  uniformState.updatePass(Pass.TRANSLUCENT);
  // The back surface is underneath the front surface. Keep native blending,
  // shader derivation and pick execution; only move their place in the frame.
  for (let i = 0; i < length; i++) {
    if (side(commands[i]) === 1) {
      executeCommand(commands[i], scene, passState);
    }
  }
  let remaining = 0;
  for (let i = 0; i < length; i++) {
    const command = commands[i];
    const face = side(command);
    if (face === 2) {
      executeCommand(command, scene, passState);
    } else if (face === 0) {
      commands[remaining++] = command;
    }
  }
  frustumCommands.indices[Pass.TRANSLUCENT] = remaining;
  commands.length = remaining;

  const originalDepth = uniformState.globeDepthTexture;
  const deferred = scene._sceneGISDeferred;
  const originalOwners = deferred?._directSurfaceOverlays;
  if (deferred) {
    // The transparent surface owns this color composition, including the
    // single-frustum schedule that runs before opaque material lighting.
    deferred._directSurfaceOverlays = owners;
  }
  uniformState.globeDepthTexture = depthTexture;
  uniformState.updatePass(Pass.TERRAIN_CLASSIFICATION);
  try {
    const overlays = frustumCommands.commands[Pass.TERRAIN_CLASSIFICATION];
    const count = frustumCommands.indices[Pass.TERRAIN_CLASSIFICATION];
    for (let i = 0; i < count; i++) {
      if (owners.has(overlays[i].owner)) {
        executeCommand(overlays[i], scene, passState);
      }
    }
  } finally {
    uniformState.globeDepthTexture = originalDepth;
    if (deferred) {
      deferred._directSurfaceOverlays = originalOwners;
    }
  }
}

/** Direct color overlays borrowing the native first-surface depth peel. @private */
const surfaceOverlays = { hasCommands, execute, depthCommand };
export default surfaceOverlays;
