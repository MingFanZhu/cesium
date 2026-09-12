import Cartesian4 from "../../../Core/Cartesian4.js";
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
  this.renderCommands = [];
  this._regionCommands = [];
  this._tileBounds = tile.bounds;
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
    u_sceneGISVectorTileClip: new Cartesian4(
      0,
      -tile.bounds.height,
      tile.bounds.width,
      0,
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
      }
    },
  });
}

SceneGISVectorTileBatch.prototype.update = function (frameState) {
  this.primitive.update(frameState);
};

SceneGISVectorTileBatch.prototype.setRegions = function (regions) {
  this.renderCommands.length = 0;
  const count = regions.length * this.commands.length;
  this._regionCommands.length = count;
  const bounds = this._tileBounds;
  let index = 0;
  for (const region of regions) {
    for (const source of this.commands) {
      let published = this._regionCommands[index];
      if (published === undefined) {
        const clip = new Cartesian4();
        published = { clip, uniformMap: {}, sourceMap: undefined };
        this._regionCommands[index] = published;
      }
      const clip = published.clip;
      Cartesian4.fromElements(
        region.minimumX - bounds.minimumX,
        region.minimumY - bounds.maximumY,
        region.maximumX - bounds.minimumX,
        region.maximumY - bounds.maximumY,
        clip,
      );
      if (published.sourceMap !== source.uniformMap) {
        published.sourceMap = source.uniformMap;
        published.uniformMap = {
          ...source.uniformMap,
          u_sceneGISVectorTileClip: () => clip,
        };
      }
      published.render = DrawCommand.shallowClone(source, published.render);
      published.render.uniformMap = published.uniformMap;
      this.renderCommands.push(published.render);
      if (this._allowPicking) {
        published.pick = DrawCommand.shallowClone(source, published.pick);
        published.pick.uniformMap = published.uniformMap;
        published.pick.renderState = RenderState.fromCache(pickState);
        published.pick.pickId = "v_pickColor";
      }
      index++;
    }
  }
};

SceneGISVectorTileBatch.prototype.queue = function (frameState) {
  if (frameState.passes.render) {
    for (const command of this.renderCommands) {
      frameState.commandList.push(command);
    }
  } else if (
    frameState.passes.pick &&
    !frameState.passes.depth &&
    this._allowPicking
  ) {
    for (const published of this._regionCommands) {
      frameState.commandList.push(published.pick);
    }
  }
};

SceneGISVectorTileBatch.prototype.destroy = function () {
  this.primitive.destroy();
  this.commands.length = 0;
  this.renderCommands.length = 0;
  this._regionCommands.length = 0;
};

export default SceneGISVectorTileBatch;
