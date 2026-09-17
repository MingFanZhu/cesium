import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import Assets from "./_SceneGISVectorSymbolAssets.js";

/** Borrows symbol sprite resources, or owns them when there are no symbols. @private */
function VectorPatterns(owner, maximumRanges, maximumRequests) {
  this.owner = owner;
  this.owned = !owner._symbols;
  this.assets =
    owner._symbols?.assets ?? new Assets(owner, maximumRanges, maximumRequests);
  this.loaded = false;
  this.ready = false;
  this._empty = new Map();
  this._protected = new Set();
  this.size = new Cartesian2();
}

VectorPatterns.prototype.update = function (context) {
  this.assets.prepare(this._empty, true, this._protected);
  const sprite = this.assets.sprite;
  this.loaded = sprite.state === "ready" || sprite.state === "failed";
  if (sprite.state === "ready" && !this.ready) {
    try {
      const image = sprite.image;
      for (const [name, value] of Object.entries(sprite.metadata)) {
        if (
          value.x + value.width > image.width ||
          value.y + value.height > image.height
        ) {
          throw new RuntimeError(`Sprite image outside atlas: ${name}`);
        }
      }
      this.texture = this.assets.texture(sprite, context);
      this.size.x = image.width;
      this.size.y = image.height;
      this.metadata = sprite.metadata;
      this.owner._workers.configuration.patterns = this.metadata;
      this.ready = true;
    } catch (error) {
      sprite.state = "failed";
      this.assets.errors.push({ resource: "sprite", error });
    }
  }
  if (this.owned) {
    for (const error of this.assets.errors.splice(0)) {
      this.owner.errorEvent.raiseEvent({ layer: this.owner, ...error });
    }
  }
};

VectorPatterns.prototype.uniformMap = function (bounds) {
  const origin = new Cartesian4();
  const owner = this.owner;
  return {
    u_sceneGISPatternAtlas: () => this.texture,
    u_sceneGISPatternAtlasSize: () => this.size,
    u_sceneGISPatternMetersPerPixel: () => owner._metersPerPixel,
    u_sceneGISPatternOrigin: () => {
      const x =
        (bounds.minimumX - owner._extent.minimumX) / owner._metersPerPixel;
      const y =
        (owner._extent.maximumY - bounds.maximumY) / owner._metersPerPixel;
      origin.x = Math.floor(x / 65536);
      origin.y = Math.floor(y / 65536);
      origin.z = x - origin.x * 65536;
      origin.w = y - origin.y * 65536;
      return origin;
    },
  };
};

VectorPatterns.prototype.destroy = function () {
  if (this.owned) {
    this.assets.destroy();
  }
  this.texture = undefined;
};

export default VectorPatterns;
