import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import Pass from "../../../Renderer/Pass.js";
import RenderState from "../../../Renderer/RenderState.js";
import BlendingState from "../../../Scene/BlendingState.js";
import fragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorGlobeBackgroundFS.js";
import EnvironmentResources from "../../Renderer/_private/_SceneGISVectorEnvironmentResources.js";
import environment from "./_SceneGISVectorEnvironment.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import patternFragment from "../../../Shaders/SceneGIS/VectorTiles/SceneGISVectorPattern.js";
import Pattern from "../../Core/_private/_SceneGISVectorPattern.js";

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
  if (paint["background-pattern"] !== undefined) {
    const image = Pattern.image(
      owner._patterns.metadata,
      paint["background-pattern"],
    );
    this._pattern = image;
    this._patternRect = Cartesian4.unpack(image.rect);
    this._patternSize = Cartesian2.unpack(image.size);
    this._patternRoot = new Cartesian2(
      owner._extent.minimumX,
      owner._extent.maximumY,
    );
    this._color.w = paint["background-opacity"];
  }
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
  const source = new ShaderSource({
    defines: this._pattern ? ["SCENEGIS_VECTOR_PATTERN"] : [],
    sources: [patternFragment, fragment],
  });
  this._command = frameState.context.createViewportQuadCommand(source, {
    owner: this._owner,
    uniformMap: {
      ...(this._pattern
        ? {
            ...this._owner._patterns.uniformMap(this._owner._extent),
            u_patternRect: () => this._patternRect,
            u_patternSize: () => this._patternSize,
            u_patternRoot: () => this._patternRoot,
          }
        : {}),
      ...environment.createUniformMap(this._owner),
      u_sceneGISVectorOpacity: () => this._owner.opacity,
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
