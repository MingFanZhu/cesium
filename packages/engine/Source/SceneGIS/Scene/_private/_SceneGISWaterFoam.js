import buildModuleUrl from "../../../Core/buildModuleUrl.js";
import Resource from "../../../Core/Resource.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import Texture from "../../../Renderer/Texture.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import Sampler from "../../../Renderer/Sampler.js";
import TextureWrap from "../../../Renderer/TextureWrap.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";

/** Scene-owned, shared foam density material. @private */
class SceneGISWaterFoam {
  constructor(requestRender) {
    this.texture = undefined;
    this._image = undefined;
    this._error = undefined;
    this._destroyed = false;
    const url = buildModuleUrl("Assets/SceneGIS/Water/Foam/Foam2.png");
    this._promise = new Resource({ url })
      .fetchImage({ preferImageBitmap: true, skipColorSpaceConversion: true })
      .then((image) => {
        if (this._destroyed) {
          image.close?.();
          return;
        }
        this._image = image;
        requestRender();
      })
      .catch((error) => {
        if (!this._destroyed) {
          this._error = new RuntimeError(
            `Water foam texture failed: ${url}: ${error}`,
          );
          requestRender();
        }
      });
  }

  update(context) {
    if (this._error) {
      throw this._error;
    }
    const image = this._image;
    if (!image) {
      return;
    }
    this.texture = new Texture({
      context,
      source: image,
      flipY: false,
      skipColorSpaceConversion: true,
      sampler: new Sampler({
        wrapS: TextureWrap.REPEAT,
        wrapT: TextureWrap.REPEAT,
        minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR,
        maximumAnisotropy: Math.min(
          8,
          ContextLimits.maximumTextureFilterAnisotropy,
        ),
      }),
    });
    this.texture.generateMipmap();
    image.close?.();
    this._image = undefined;
  }

  destroy() {
    this._destroyed = true;
    this.texture?.destroy();
    this.texture = undefined;
    this._image?.close?.();
    this._image = undefined;
  }
}

export default SceneGISWaterFoam;
