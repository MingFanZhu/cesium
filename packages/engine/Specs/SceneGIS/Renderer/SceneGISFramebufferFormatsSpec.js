import {
  Framebuffer,
  PixelDatatype,
  PixelFormat,
  Texture,
} from "../../../index.js";
import createContext from "../../../../../Specs/createContext.js";

describe("SceneGIS/Renderer/SceneGISFramebufferFormats", function () {
  let context;
  let framebuffer;
  let write;
  let sample;
  let textures;

  beforeAll(function () {
    context = createContext({}, 1, 1);
  });

  afterEach(function () {
    write?.shaderProgram.destroy();
    sample?.shaderProgram.destroy();
    framebuffer?.destroy();
    textures?.forEach((texture) => texture.destroy());
    write = sample = framebuffer = textures = undefined;
  });

  afterAll(function () {
    context.destroyForSpecs();
  });

  it("renders and samples RG32F beside an RGBA16F material attachment", function () {
    if (!context.webgl2 || !context.colorBufferFloat) {
      return;
    }
    textures = [
      new Texture({
        context,
        width: 1,
        height: 1,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.HALF_FLOAT,
      }),
      new Texture({
        context,
        width: 1,
        height: 1,
        pixelFormat: PixelFormat.RG,
        pixelDatatype: PixelDatatype.FLOAT,
      }),
    ];
    framebuffer = new Framebuffer({
      context,
      colorTextures: textures,
      destroyAttachments: false,
    });
    write = context.createViewportQuadCommand(
      "layout(location = 1) out vec2 data; void main() { out_FragColor = vec4(0.25, 0.5, 0.75, 1.0); data = vec2(1234567.75, 3.0); }",
      { framebuffer },
    );
    write.execute(context);
    sample = context.createViewportQuadCommand(
      `uniform sampler2D u_material;
       uniform sampler2D u_data;
       void main() {
         vec4 material = texelFetch(u_material, ivec2(0), 0);
         vec4 data = texelFetch(u_data, ivec2(0), 0);
         bool valid = all(equal(material, vec4(0.25, 0.5, 0.75, 1.0))) &&
           all(equal(data, vec4(1234567.75, 3.0, 0.0, 1.0)));
         out_FragColor = vec4(vec3(valid ? 1.0 : 0.0), 1.0);
       }`,
      {
        uniformMap: {
          u_material: () => textures[0],
          u_data: () => textures[1],
        },
      },
    );
    sample.execute(context);
    expect(context.readPixels()).toEqual(new Uint8Array([255, 255, 255, 255]));
    framebuffer = framebuffer.destroy();
    expect(textures[1].isDestroyed()).toBe(false);
  });
});
