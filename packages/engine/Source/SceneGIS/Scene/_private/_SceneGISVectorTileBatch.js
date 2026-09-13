import Cartesian4 from "../../../Core/Cartesian4.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import Matrix4 from "../../../Core/Matrix4.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Pass from "../../../Renderer/Pass.js";
import RenderState from "../../../Renderer/RenderState.js";
import BlendingState from "../../../Scene/BlendingState.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import BatchResources from "../../Renderer/_private/_SceneGISVectorTileBatchResources.js";

const colorState = {
  depthTest: { enabled: false },
  depthMask: false,
  cull: { enabled: false },
  blending: BlendingState.PRE_MULTIPLIED_ALPHA_BLEND,
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
  this._owner = owner;
  this._prepared = prepared;
  this._resources = undefined;
  this._modelMatrix = Matrix4.fromTranslation(
    new Cartesian3(tile.bounds.minimumX, tile.bounds.maximumY, 0),
  );
}

SceneGISVectorTileBatch.prototype.update = function (frameState) {
  if (this._resources !== undefined) {
    return;
  }
  this._resources = new BatchResources(
    frameState.context,
    this._prepared,
    this._owner,
    this._allowPicking,
  );
  this._prepared = undefined;
  for (const vertexArray of this._resources._vertexArrays) {
    this.commands.push(
      new DrawCommand({
        owner: this._owner,
        vertexArray,
        shaderProgram: this._resources._shaderProgram,
        modelMatrix: this._modelMatrix,
        boundingVolume: this._bounds,
        uniformMap: {},
        renderState: RenderState.fromCache(colorState),
        pickId: this._allowPicking ? "v_pickColor" : undefined,
        primitiveType: PrimitiveType.TRIANGLES,
        pass: Pass.TERRAIN_CLASSIFICATION,
        cull: false,
        castShadows: false,
        receiveShadows: false,
      }),
    );
  }
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
      index++;
    }
  }
};

SceneGISVectorTileBatch.prototype.queue = function (frameState) {
  if (
    frameState.passes.render ||
    (frameState.passes.pick && !frameState.passes.depth && this._allowPicking)
  ) {
    for (const command of this.renderCommands) {
      frameState.commandList.push(command);
    }
  }
};

SceneGISVectorTileBatch.prototype.destroy = function () {
  this._resources?.destroy();
  this._prepared = undefined;
  this.commands.length = 0;
  this.renderCommands.length = 0;
  this._regionCommands.length = 0;
};

export default SceneGISVectorTileBatch;
