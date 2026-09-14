import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import Pass from "../../../Renderer/Pass.js";
import RenderState from "../../../Renderer/RenderState.js";
import BlendingState from "../../../Scene/BlendingState.js";
import fragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorGlobeBackgroundFS.js";
import EnvironmentResources from "../../Renderer/_private/_SceneGISVectorEnvironmentResources.js";
import environment from "./_SceneGISVectorEnvironment.js";

/** One surface-depth background command, independent of source subdivision. @private */
function GlobeBackground(owner, evaluated) {
  this._owner = owner;
  const paint = evaluated.paint,
    color = paint["background-color"];
  this._color = new Cartesian4(
    color.red,
    color.green,
    color.blue,
    color.alpha * paint["background-opacity"],
  );
  this.renderCommands = [];
}
GlobeBackground.prototype.update = function (frameState) {
  if (this._command) {
    const program = environment.active(this._owner)
      ? (this._environmentResources ??= new EnvironmentResources(
          frameState.context,
        )).get(this._baseProgram, true, environment.shadowMap(this._owner))
      : this._baseProgram;
    EnvironmentResources.setProgram(this._command, program);
    return;
  }
  const range = new Cartesian2();
  this._command = frameState.context.createViewportQuadCommand(fragment, {
    owner: this._owner,
    uniformMap: {
      ...environment.createUniformMap(this._owner),
      u_color: () => this._color,
      u_lighting: () => this._owner._world.enableLighting,
      u_depthRange: () => {
        const far = frameState.context.uniformState.currentFrustum.y;
        const splits = frameState.frustumSplits;
        range.x = splits[splits.indexOf(far) - 1];
        range.y = far;
        return range;
      },
    },
    renderState: RenderState.fromCache({
      depthTest: { enabled: false },
      depthMask: false,
      blending: BlendingState.PRE_MULTIPLIED_ALPHA_BLEND,
    }),
  });
  this._command.pass = Pass.TERRAIN_CLASSIFICATION;
  this._baseProgram = this._command.shaderProgram;
  this.renderCommands.push(this._command);
  this.update(frameState);
};
GlobeBackground.prototype.setRegions = function () {};
GlobeBackground.prototype.queue = function (frameState) {
  if (frameState.passes.render) {
    frameState.commandList.push(this._command);
  }
};
GlobeBackground.prototype.destroy = function () {
  this._environmentResources?.destroy();
  this._baseProgram?.destroy();
  this._command = undefined;
  this.renderCommands.length = 0;
};
export default GlobeBackground;
