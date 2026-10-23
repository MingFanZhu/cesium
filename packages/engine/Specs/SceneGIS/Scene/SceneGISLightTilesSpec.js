import {
  _SceneGISLocalLights as LocalLights,
  BoundingRectangle,
  Cartesian3,
  Color,
  FramebufferManager,
  Matrix4,
  OrthographicFrustum,
  PerspectiveOffCenterFrustum,
  PixelDatatype,
  RenderState,
  SceneGISLightCollection,
  SceneGISPointLight,
  SceneGISRectAreaLight,
  SceneGISSpotLight,
} from "../../../index.js";
import localLightsShader from "../../../Source/Shaders/SceneGIS/Rendering/SceneGISLocalLights.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISLightTiles", function () {
  let scene, lights, target, command;
  const width = 128;
  const height = 96;
  let depth = 12;

  beforeEach(function () {
    scene = createScene({
      canvas: createCanvas(width, height),
      scene3DOnly: true,
    });
    scene.camera.setView({
      destination: new Cartesian3(20000000, -30000000, 100),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: new Cartesian3(0, 1, 0),
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 32,
      aspectRatio: width / height,
      near: 1,
      far: 100,
    });
    lights = new SceneGISLightCollection({ scene });
    target = new FramebufferManager({ pixelDatatype: PixelDatatype.FLOAT });
    target.update(scene.context, width, height);
    depth = 12;
    scene.renderForSpecs();
  });
  afterEach(function () {
    command?.shaderProgram.destroy();
    target?.destroy();
    scene?.destroyForSpecs();
    scene = lights = target = command = undefined;
  });
  function world(position) {
    return Matrix4.multiplyByPoint(
      scene.camera.inverseViewMatrix,
      position,
      new Cartesian3(),
    );
  }
  function add(position, range, spot = false) {
    const options = {
      position: world(position),
      range,
      radius: 0.2,
      intensity: 0.2,
      color: new Color(0.3, 0.6, 1),
    };
    if (spot) {
      options.direction = Matrix4.multiplyByPointAsVector(
        scene.camera.inverseViewMatrix,
        new Cartesian3(0.2, 0, -1),
        new Cartesian3(),
      );
      options.innerConeAngle = 0.2;
      options.outerConeAngle = 0.8;
    }
    return lights.add(
      spot ? new SceneGISSpotLight(options) : new SceneGISPointLight(options),
    );
  }
  function prepare() {
    LocalLights.prepare(scene);
    scene.context.uniformState.updateCamera(scene.camera);
  }
  function read(tiled) {
    lights._tiled = tiled;
    if (!command) {
      command = scene.context.createViewportQuadCommand(
        `${localLightsShader}
        uniform float u_depth;
        uniform mat4 u_inverse;
        void main() {
          vec2 ndc = gl_FragCoord.xy / vec2(${width}.0, ${height}.0) * 2.0 - 1.0;
          vec4 a = u_inverse * vec4(ndc, -1.0, 1.0);
          vec4 b = u_inverse * vec4(ndc, 1.0, 1.0);
          vec3 origin = a.xyz / a.w;
          vec3 ray = b.xyz / b.w - origin;
          vec3 position = origin + ray * ((-u_depth - origin.z) / ray.z);
          out_FragColor = vec4(sceneGISLocalLambert(position, vec3(0,0,1), vec3(0.5)), 1);
        }`,
        {
          framebuffer: target.framebuffer,
          renderState: RenderState.fromCache({
            viewport: new BoundingRectangle(0, 0, width, height),
          }),
          uniformMap: {
            ...lights._state.uniforms,
            u_depth: () => depth,
            u_inverse: () =>
              Matrix4.inverse(
                scene.camera.frustum.projectionMatrix,
                new Matrix4(),
              ),
          },
        },
      );
    }
    command.execute(scene.context);
    return scene.context.readPixels({
      framebuffer: target.framebuffer,
      width,
      height,
    });
  }
  function equivalent() {
    prepare();
    const reference = read(false);
    const actual = read(true);
    let maximum = 0;
    let energy = 0;
    for (let i = 0; i < actual.length; i++) {
      if (i % 4 === 3) {
        continue;
      }
      maximum = Math.max(maximum, Math.abs(actual[i] - reference[i]));
      energy += reference[i];
    }
    expect(energy).toBeGreaterThan(0.01);
    expect(maximum).toBeLessThan(0.000001);
  }

  it("preserves all 256 sources and spot cones while culling outside each tile", function () {
    for (let i = 0; i < 256; i++) {
      add(
        new Cartesian3((i % 16) * 3 - 22, Math.floor(i / 16) * 3 - 22, -10),
        5,
        i % 3 === 0,
      );
    }
    equivalent();
    const tiles = lights._state.tiles;
    expect(lights._state.count).toBe(256);
    expect(tiles.maximumTileCount).toBeLessThan(80);
    expect(tiles.referenceCount).toBeLessThan(
      256 * tiles.grid.x * tiles.grid.y,
    );
    scene.camera.position.x += 0.3;
    equivalent();
  });

  it("keeps near-plane intersections and camera-inside ranges in an asymmetric perspective", function () {
    scene.camera.frustum = new PerspectiveOffCenterFrustum({
      left: -0.8,
      right: 1.2,
      bottom: -0.7,
      top: 0.8,
      near: 1,
      far: 100,
    });
    add(new Cartesian3(0, 0, 0.5), 18);
    add(new Cartesian3(1, 1, -1), 4, true);
    add(new Cartesian3(-2, 0, -3), 6);
    add(new Cartesian3(0, 0, 4), 1);
    depth = 2;
    equivalent();
    depth = 12;
    equivalent();
  });

  it("preserves mixed rectangular candidates, finite ranges and rotated wide panels", function () {
    for (let i = 0; i < 40; ++i) {
      add(new Cartesian3(i - 20, 0, -5), 7, i % 2 === 0);
      lights.add(
        new SceneGISRectAreaLight({
          position: world(new Cartesian3(i - 20, 2, -8)),
          direction: Matrix4.multiplyByPointAsVector(
            scene.camera.inverseViewMatrix,
            new Cartesian3(0.2, 0, -1),
            new Cartesian3(),
          ),
          up: Matrix4.multiplyByPointAsVector(
            scene.camera.inverseViewMatrix,
            new Cartesian3(1, 1, 0),
            new Cartesian3(),
          ),
          width: 8,
          height: 0.5,
          range: 6,
          intensity: 0.1,
        }),
      );
    }
    equivalent();
    expect(lights._state.tiles.headerRow).toBe(38);
    expect(lights._state.tiles.maximumTileCount).toBeLessThan(80);
  });

  it("does not truncate 256 overlapping lights or alter their accumulation order", function () {
    for (let i = 0; i < 256; i++) {
      add(new Cartesian3((i % 16) * 0.01, 0, -3), 80, i % 2 === 0);
    }
    equivalent();
    expect(lights._state.tiles.maximumTileCount).toBe(256);
    expect(lights._state.tiles.referenceCount).toBe(256 * 12);
  });

  it("reuses tables, replaces the grid on resize and releases empty or detached collections", function () {
    const light = add(new Cartesian3(0, 0, -8), 4);
    prepare();
    const tiles = lights._state.tiles;
    const table = tiles.texture;
    light.position.x += 0.01;
    prepare();
    expect(tiles.texture).toBe(table);
    scene.canvas.width = 256;
    prepare();
    expect(tiles.grid.x).toBe(8);
    expect(tiles.texture).toBe(table);
    for (let i = 1; i < 256; ++i) {
      add(new Cartesian3(0, 0, i < 128 ? -8 : 100), i < 128 ? 80 : 1);
    }
    prepare();
    const grown = tiles.texture;
    expect(grown).not.toBe(table);
    expect(table.isDestroyed()).toBe(true);
    lights.show = false;
    prepare();
    expect(grown.isDestroyed()).toBe(true);
    expect(table.isDestroyed()).toBe(true);
    expect(lights._state.tiles).toBeUndefined();
    lights.show = true;
    prepare();
    const recreated = lights._state.tiles.texture;
    lights.removeAll();
    prepare();
    expect(recreated.isDestroyed()).toBe(true);
    add(new Cartesian3(0, 0, -8), 4);
    prepare();
    const final = lights._state.tiles.texture;
    lights.destroy();
    expect(final.isDestroyed()).toBe(true);
  });
});
