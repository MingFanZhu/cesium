import {
  _SceneGISViewshedDepth as SceneGISViewshedDepth,
  BoundingRectangle,
  BoundingSphere,
  Camera,
  Cartesian2,
  Cartesian3,
  DrawCommand,
  Framebuffer,
  Matrix4,
  Pass,
  PerspectiveFrustum,
  PixelDatatype,
  PixelFormat,
  RenderState,
  ShaderProgram,
  Texture,
  Transforms,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISViewshedDepth", function () {
  let scene, capture, resources;
  beforeEach(function () {
    scene = createScene();
    scene.renderForSpecs();
    resources = [];
    capture = new SceneGISViewshedDepth(scene);
  });
  afterEach(function () {
    if (!capture.isDestroyed()) {
      capture.destroy();
    }
    for (const resource of resources) {
      resource.destroy();
    }
    scene.destroyForSpecs();
  });

  function camera(frame, y = -10) {
    const result = new Camera(scene);
    result.frustum = new PerspectiveFrustum({
      near: 0.5,
      far: 100000,
      fov: Math.PI / 3,
      aspectRatio: 1,
    });
    result.setView({
      destination: Matrix4.multiplyByPoint(
        frame,
        new Cartesian3(0, y, 0),
        new Cartesian3(),
      ),
      orientation: {
        direction: Matrix4.multiplyByPointAsVector(
          frame,
          Cartesian3.UNIT_Y,
          new Cartesian3(),
        ),
        up: Matrix4.multiplyByPointAsVector(
          frame,
          Cartesian3.UNIT_Z,
          new Cartesian3(),
        ),
      },
    });
    return result;
  }

  function wall(frame, mask = false) {
    const quad = scene.context.createViewportQuadCommand(
      "void main() { out_FragColor = vec4(1.0); }",
    );
    resources.push(quad.shaderProgram);
    const program = ShaderProgram.fromCache({
      context: scene.context,
      vertexShaderSource: `
        in vec4 position;
        out float v_side;
        uniform float u_height;
        void main() {
          v_side = position.x;
          gl_Position = czm_modelViewProjection *
            vec4(position.x * 10.0, 0.0, position.y * 10.0 + u_height, 1.0);
        }`,
      fragmentShaderSource: `
        in float v_side;
        void main() {
          ${mask ? "if (v_side < 0.0) { discard; }" : ""}
          out_FragColor = vec4(1.0);
        }`,
      attributeLocations: { position: 0 },
    });
    resources.push(program);
    const command = new DrawCommand({
      vertexArray: quad.vertexArray,
      primitiveType: quad.primitiveType,
      count: quad.count,
      shaderProgram: program,
      modelMatrix: frame,
      uniformMap: { u_height: () => 0 },
      pass: Pass.OPAQUE,
      renderState: RenderState.fromCache({
        depthTest: { enabled: true },
        depthMask: true,
        // Deliberately incompatible main-view viewport must not leak.
        viewport: new BoundingRectangle(0, 0, 1, 1),
      }),
      boundingVolume: new BoundingSphere(
        Matrix4.getTranslation(frame, new Cartesian3()),
        15,
      ),
    });
    return command;
  }

  function sample(texture, uv = new Cartesian2(0.75, 0.5)) {
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [
        new Texture({
          context: scene.context,
          width: 1,
          height: 1,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype: PixelDatatype.FLOAT,
        }),
      ],
    });
    const quad = scene.context.createViewportQuadCommand(
      `uniform sampler2D u_depth;
       uniform vec2 u_uv;
       void main() { out_FragColor = vec4(texture(u_depth, u_uv).r); }`,
      { framebuffer, uniformMap: { u_depth: () => texture, u_uv: () => uv } },
    );
    try {
      quad.execute(scene.context);
      return scene.context.readPixels({ framebuffer, width: 1, height: 1 })[0];
    } finally {
      quad.shaderProgram.destroy();
      framebuffer.destroy();
    }
  }

  function distance(value, observer) {
    const { near, far } = observer.frustum;
    return 2 ** (value * Math.log2(far - near + 1)) - 1 + near;
  }

  [false, true].forEach((globe) => {
    it(`preserves original transforms and MASK at ${globe ? "ECEF" : "large planar"} coordinates`, function () {
      const frame = globe
        ? Transforms.eastNorthUpToFixedFrame(
            Cartesian3.fromDegrees(118, 32, 30),
          )
        : Matrix4.fromTranslation(new Cartesian3(20000000, -30000000, 100));
      const observer = camera(frame);
      const command = wall(frame, true);
      capture.capture(observer, [command], 32);
      expect(capture.ready).toBe(true);
      expect(capture.drawCount).toBe(1);
      expect(distance(sample(capture.texture), observer)).toEqualEpsilon(
        10,
        0.01,
      );
      expect(sample(capture.texture, new Cartesian2(0.25, 0.5))).toBe(1);
      // A changed original vertex uniform must affect the depth result.
      command.uniformMap.u_height = () => 100;
      capture.capture(observer, [command], 32);
      expect(sample(capture.texture)).toBe(1);
      expect(command.framebuffer).toBeUndefined();
      expect(command.renderState.viewport.width).toBe(1);
    });
  });

  it("isolates observer results, reuses warm targets and releases resized resources", function () {
    const frame = Matrix4.IDENTITY;
    const observer = camera(frame);
    const command = wall(frame);
    const other = new SceneGISViewshedDepth(scene);
    try {
      capture.capture(observer, [command], 32);
      const texture = capture.texture;
      scene.camera.setView({ destination: new Cartesian3(0, -1000, 1000) });
      capture.capture(observer, [command], 32);
      expect(capture.texture).toBe(texture);
      expect(distance(sample(texture), observer)).toEqualEpsilon(10, 0.001);
      other.capture(camera(frame, -20), [command], 32);
      expect(
        distance(sample(other.texture), camera(frame, -20)),
      ).toEqualEpsilon(20, 0.001);
      expect(other.texture).not.toBe(texture);
      expect(distance(sample(texture), observer)).toEqualEpsilon(10, 0.001);
      capture.capture(observer, [command], 64);
      expect(texture.isDestroyed()).toBe(true);
      const resized = capture.texture;
      capture.destroy();
      expect(resized.isDestroyed()).toBe(true);
      expect(command.shaderProgram.isDestroyed()).toBe(false);
    } finally {
      other.destroy();
    }
  });

  it("restores the actual main frustum, viewport and pass even when a draw throws", function () {
    const observer = camera(Matrix4.IDENTITY);
    const command = wall(Matrix4.IDENTITY);
    const uniforms = scene.context.uniformState;
    const frustum = scene.camera.frustum.clone();
    frustum.near = 10;
    frustum.far = 500;
    const jitter = new Cartesian2(0.03, -0.02);
    uniforms._sceneGISProjectionJitter = jitter;
    uniforms.updateFrustum(frustum);
    uniforms.updatePass(Pass.TRANSLUCENT);
    uniforms.viewport = new BoundingRectangle(2, 3, 4, 5);
    const projection = Matrix4.clone(uniforms.projection);
    const view = Matrix4.clone(uniforms.view);
    command.uniformMap.u_height = () => {
      throw new Error("intentional draw failure");
    };
    expect(() => capture.capture(observer, [command], 32)).toThrowError(
      "intentional draw failure",
    );
    expect(capture.ready).toBe(false);
    expect(uniforms.view).toEqual(view);
    expect(uniforms.projection).toEqual(projection);
    expect(uniforms.currentFrustum).toEqual(new Cartesian2(10, 500));
    expect(uniforms._sceneGISProjectionJitter).toBe(jitter);
    expect(uniforms.pass).toBe(Pass.TRANSLUCENT);
    expect(uniforms.viewport).toEqual(new BoundingRectangle(2, 3, 4, 5));
    expect(scene.frameState.camera).toBe(scene.camera);
  });

  it("culls by observer bounds even when main commands disable culling, and excludes transparent draws", function () {
    const observer = camera(Matrix4.IDENTITY);
    const command = wall(Matrix4.IDENTITY);
    command.cull = false;
    command.boundingVolume = new BoundingSphere(new Cartesian3(0, -100, 0), 1);
    capture.capture(observer, [command], 32);
    expect(capture.drawCount).toBe(0);
    expect(sample(capture.texture)).toBe(1);
    command.boundingVolume = undefined;
    command.pass = Pass.TRANSLUCENT;
    capture.capture(observer, [command], 32);
    expect(capture.drawCount).toBe(0);
  });
});
