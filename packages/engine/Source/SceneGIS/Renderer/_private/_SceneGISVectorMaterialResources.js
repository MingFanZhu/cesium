import Texture from "../../../Renderer/Texture.js";
import Sampler from "../../../Renderer/Sampler.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";

const names = [
  "Color",
  "Normal",
  "MetallicRoughness",
  "Emissive",
  "Parameters",
];

/** Owns one layer's shared material atlases; never owns environment resources. @private */
function VectorMaterialResources(context, packed) {
  this.textures = [];
  this.byteLength = packed.byteLength;
  try {
    for (const [index, source] of [
      ...packed.atlases,
      packed.parameters,
    ].entries()) {
      const table = index === 4;
      this.textures.push(
        new Texture({
          context,
          source,
          flipY: false,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype: table
            ? PixelDatatype.FLOAT
            : PixelDatatype.UNSIGNED_BYTE,
          sampler: new Sampler({
            minificationFilter: table
              ? TextureMinificationFilter.NEAREST
              : TextureMinificationFilter.LINEAR,
            magnificationFilter: table
              ? TextureMagnificationFilter.NEAREST
              : TextureMagnificationFilter.LINEAR,
          }),
        }),
      );
    }
  } catch (error) {
    this.destroy();
    throw error;
  }
  this.uniformMap = Object.fromEntries(
    names.map((name, index) => [
      `u_vectorMaterial${name}`,
      () => this.textures[index],
    ]),
  );
}
VectorMaterialResources.prototype.destroy = function () {
  for (const texture of this.textures) {
    texture.destroy();
  }
  this.textures.length = 0;
};
export default VectorMaterialResources;
