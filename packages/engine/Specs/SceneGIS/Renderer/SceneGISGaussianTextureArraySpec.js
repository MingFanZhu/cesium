import { FramebufferManager, PixelDatatype } from "../../../index.js";
import TextureArray from "../../../Source/SceneGIS/Renderer/_SceneGISGaussianTextureArray.js";
import createContext from "../../../../../Specs/createContext.js";

describe("SceneGIS/Renderer/SceneGISGaussianTextureArray", function () {
  it("uploads unsigned integer layers through native uniforms and releases storage", function () {
    const context = createContext();
    const texture = new TextureArray({
      context,
      width: 2,
      height: 1,
      layers: 2,
    });
    const target = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    let read;
    try {
      texture.copyFrom({
        layerOffset: 1,
        source: {
          width: 2,
          height: 1,
          layers: 1,
          arrayBufferView: new Uint32Array([7, 11, 13, 17, 19, 23, 29, 31]),
        },
      });
      target.update(context, 1, 1);
      read = context.createViewportQuadCommand(
        "uniform highp usampler2DArray u_pages; void main(){out_FragColor=vec4(texelFetch(u_pages,ivec3(1,0,1),0));}",
        {
          framebuffer: target.framebuffer,
          uniformMap: { u_pages: () => texture },
        },
      );
      read.execute(context);
      expect(
        Array.from(context.readPixels({ framebuffer: target.framebuffer })),
      ).toEqual([19, 23, 29, 31]);
      expect(texture.sizeInBytes).toBe(64);
      expect(() =>
        texture.copyFrom({
          layerOffset: 2,
          source: {
            width: 1,
            height: 1,
            layers: 1,
            arrayBufferView: new Uint32Array(4),
          },
        }),
      ).toThrowDeveloperError();
      expect(context._gl.getError()).toBe(0);
    } finally {
      read?.shaderProgram.destroy();
      target.destroy();
      texture.destroy();
      expect(texture.isDestroyed()).toBe(true);
      context.destroyForSpecs();
    }
  });
});
