import {
  Color,
  ClearCommand,
  Framebuffer,
  FramebufferManager,
  PixelDatatype,
  _SceneGISMaterialArray as MaterialArray,
} from "../../../index.js";
import createContext from "../../../../../Specs/createContext.js";

describe("SceneGIS/Renderer/SceneGISMaterialArray", function () {
  it("writes independent half-float layers with one sampler and releases borrowed views", function () {
    const context = createContext();
    const array = new MaterialArray(4);
    const output = new FramebufferManager({
      pixelDatatype: PixelDatatype.FLOAT,
    });
    let write, read, borrowed;
    try {
      array.update(context, 2, 3);
      const texture = array.texture;
      const layer = array.getColorTexture(2);
      expect(texture.sizeInBytes).toBe(2 * 3 * 4 * 8);
      write = context.createViewportQuadCommand(
        "layout(location=1) out vec4 a; layout(location=2) out vec4 b; layout(location=3) out vec4 c; void main(){out_FragColor=vec4(0.25);a=vec4(0.5);b=vec4(2.0);c=vec4(8.0);}",
        { framebuffer: array.framebuffer },
      );
      write.execute(context);
      output.update(context, 1, 1);
      read = context.createViewportQuadCommand(
        "uniform highp sampler2DArray u_layers; void main(){out_FragColor=vec4(texelFetch(u_layers,ivec3(0,0,0),0).r,texelFetch(u_layers,ivec3(0,0,1),0).r,texelFetch(u_layers,ivec3(0,0,2),0).r,texelFetch(u_layers,ivec3(0,0,3),0).r);}",
        {
          framebuffer: output.framebuffer,
          uniformMap: { u_layers: () => array.texture },
        },
      );
      read.execute(context);
      expect(
        Array.from(context.readPixels({ framebuffer: output.framebuffer })),
      ).toEqual([0.25, 0.5, 2, 8]);
      expect(read.shaderProgram.maximumTextureUnitIndex).toBe(1);
      borrowed = new Framebuffer({ context, colorTextures: [layer] });
      borrowed.destroy();
      borrowed = undefined;
      expect(texture.isDestroyed()).toBe(false);
      array.update(context, 2, 3);
      expect(array.texture).toBe(texture);
      array.update(context, 4, 2);
      expect(texture.isDestroyed()).toBe(true);
      expect(layer.isDestroyed()).toBe(true);
      const clear = new ClearCommand({ color: Color.RED });
      array.clear(context, clear);
      expect(clear.framebuffer).toBeUndefined();
      read.execute(context);
      expect(
        Array.from(context.readPixels({ framebuffer: output.framebuffer })),
      ).toEqual([1, 1, 1, 1]);
      expect(context._gl.getError()).toBe(0);
      const last = array.texture;
      array.destroy();
      expect(last.isDestroyed()).toBe(true);
    } finally {
      borrowed?.destroy();
      write?.shaderProgram.destroy();
      read?.shaderProgram.destroy();
      if (!array.isDestroyed()) {
        array.destroy();
      }
      output.destroy();
      context.destroyForSpecs();
    }
  });
});
