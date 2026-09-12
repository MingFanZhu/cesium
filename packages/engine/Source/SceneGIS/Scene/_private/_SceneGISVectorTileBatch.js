import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import Matrix4 from "../../../Core/Matrix4.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Pass from "../../../Renderer/Pass.js";
import RenderState from "../../../Renderer/RenderState.js";
import BlendingState from "../../../Scene/BlendingState.js";
import PerInstanceColorAppearance from "../../../Scene/PerInstanceColorAppearance.js";
import PolylineColorAppearance from "../../../Scene/PolylineColorAppearance.js";
import Primitive from "../../../Scene/Primitive.js";
import flatFragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorTileFlatFS.js";
import circleVertex from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorTileCircleVS.js";

const colorState = {
  depthTest: { enabled: false },
  depthMask: false,
  cull: { enabled: false },
  blending: BlendingState.PRE_MULTIPLIED_ALPHA_BLEND,
};
const pickState = {
  depthTest: { enabled: false },
  depthMask: false,
  cull: { enabled: false },
};

/** Owns one tile/style geometry batch and its last published commands. @private */
function SceneGISVectorTileBatch(owner, tile, prepared, allowPicking) {
  this.commands = [];
  this.pickCommands = [];
  this._allowPicking = allowPicking;
  this._bounds = BoundingSphere.fromCornerPoints(
    new Cartesian3(tile.bounds.minimumX, tile.bounds.minimumY, 0),
    new Cartesian3(tile.bounds.maximumX, tile.bounds.maximumY, 0),
  );
  for (const instance of prepared.instances) {
    instance.pickPrimitive = owner;
  }
  const fragmentShaderSource =
    (prepared.kind === "circle" ? "#define SCENEGIS_VECTOR_CIRCLE\n" : "") +
    flatFragment;
  const appearance =
    prepared.kind === "line"
      ? new PolylineColorAppearance({
          fragmentShaderSource,
          renderState: colorState,
        })
      : new PerInstanceColorAppearance({
          flat: true,
          vertexShaderSource:
            prepared.kind === "circle" ? circleVertex : undefined,
          fragmentShaderSource,
          renderState: colorState,
        });
  appearance.uniforms = {
    u_sceneGISVectorTileSize: new Cartesian2(
      tile.bounds.width,
      tile.bounds.height,
    ),
  };
  this.primitive = new Primitive({
    geometryInstances: prepared.instances,
    appearance,
    modelMatrix: Matrix4.fromTranslation(
      new Cartesian3(tile.bounds.minimumX, tile.bounds.maximumY, 0),
    ),
    asynchronous: false,
    allowPicking,
    vertexCacheOptimize: false,
    compressVertices: false,
    cull: false,
    _updateAndQueueCommandsFunction: (
      primitive,
      frameState,
      commands,
      _picks,
      matrix,
    ) => {
      this.commands.length = commands.length;
      this.pickCommands.length = allowPicking ? commands.length : 0;
      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        command.modelMatrix = matrix;
        command.boundingVolume = this._bounds;
        // Appearance.getRenderState forces straight-alpha blending for translucency.
        // This fragment shader emits premultiplied color, including circle coverage.
        command.renderState = RenderState.fromCache(colorState);
        command.pass = Pass.TERRAIN_CLASSIFICATION;
        command.cull = false;
        command.castShadows = false;
        command.receiveShadows = false;
        command.pickId = undefined;
        this.commands[i] = command;
        if (allowPicking) {
          const pick = DrawCommand.shallowClone(command, this.pickCommands[i]);
          pick.renderState = RenderState.fromCache(pickState);
          pick.pickId = "v_pickColor";
          this.pickCommands[i] = pick;
        }
      }
    },
  });
}

SceneGISVectorTileBatch.prototype.update = function (frameState) {
  this.primitive.update(frameState);
};

SceneGISVectorTileBatch.prototype.queue = function (frameState) {
  const commands = frameState.passes.render
    ? this.commands
    : frameState.passes.pick && !frameState.passes.depth
      ? this.pickCommands
      : [];
  for (const command of commands) {
    frameState.commandList.push(command);
  }
};

SceneGISVectorTileBatch.prototype.destroy = function () {
  this.primitive.destroy();
  this.commands.length = 0;
  this.pickCommands.length = 0;
};

export default SceneGISVectorTileBatch;
