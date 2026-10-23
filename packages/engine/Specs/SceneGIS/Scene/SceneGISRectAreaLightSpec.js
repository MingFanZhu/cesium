import {
  _SceneGISLocalLights as LocalLights,
  Cartesian3,
  Color,
  FramebufferManager,
  Matrix4,
  OrthographicFrustum,
  PixelDatatype,
  SceneGISLightCollection,
  SceneGISPointLight,
  SceneGISRectAreaLight,
} from "../../../index.js";
import localLightsShader from "../../../Source/Shaders/SceneGIS/Rendering/SceneGISLocalLights.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISRectAreaLight", function () {
  let scene, lights, light, target, command;
  let normal = new Cartesian3(0, 0, 1);
  let position = new Cartesian3(0, 0, -12);
  let roughness = 0.3;

  function setup() {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.camera.setView({
      destination: new Cartesian3(20000000, -30000000, 100),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 16,
      aspectRatio: 1,
      near: 1,
      far: 100,
    });
    scene.renderForSpecs();
    lights = new SceneGISLightCollection({ scene });
    light = lights.add(
      new SceneGISRectAreaLight({
        position: Matrix4.multiplyByPoint(
          scene.camera.inverseViewMatrix,
          new Cartesian3(0, 0, -8),
          new Cartesian3(),
        ),
        direction: Matrix4.multiplyByPointAsVector(
          scene.camera.inverseViewMatrix,
          new Cartesian3(0, 0, -1),
          new Cartesian3(),
        ),
        up: Matrix4.multiplyByPointAsVector(
          scene.camera.inverseViewMatrix,
          Cartesian3.UNIT_Y,
          new Cartesian3(),
        ),
        width: 6,
        height: 2,
        range: 50,
      }),
    );
    normal = new Cartesian3(0, 0, 1);
    position = new Cartesian3(0, 0, -12);
    roughness = 0.3;
    target = new FramebufferManager({ pixelDatatype: PixelDatatype.FLOAT });
    target.update(scene.context, 1, 1);
  }
  function sample() {
    LocalLights.prepare(scene);
    scene.context.uniformState.updateCamera(scene.camera);
    command ??= scene.context.createViewportQuadCommand(
      `${localLightsShader}
      uniform vec3 u_position;
      uniform vec3 u_normal;
      uniform float u_roughness;
      void main() {
        vec3 c, r, u, radiance;
        float diffuse = 0.0; float specular = 0.0;
        if (sceneGISRectLight(0, u_position, c, r, u, radiance)) {
          vec3 v = normalize(-u_position);
          mat3 basis = sceneGISRectBasis(u_normal, v);
          diffuse = sceneGISRectIntegral(c, r, u, basis) * radiance.r;
          specular = sceneGISRectSpecular(c, r, u, basis, dot(u_normal, v), u_roughness, vec3(1), vec3(1)).r * radiance.r;
        }
        out_FragColor = vec4(diffuse, specular, sceneGISLocalLambert(u_position, u_normal, vec3(1)).r, 1);
      }`,
      {
        framebuffer: target.framebuffer,
        uniformMap: {
          ...lights._state.uniforms,
          u_position: () => position,
          u_normal: () => normal,
          u_roughness: () => roughness,
        },
      },
    );
    command.execute(scene.context);
    return scene.context.readPixels({
      framebuffer: target.framebuffer,
      width: 1,
      height: 1,
    });
  }
  afterEach(function () {
    command?.shaderProgram.destroy();
    target?.destroy();
    scene?.destroyForSpecs();
    scene = lights = light = target = command = undefined;
  });

  it("clones inputs, validates independent axes and dimensions, and supports the collection", function () {
    const options = {
      position: Cartesian3.ZERO,
      direction: new Cartesian3(0, 0, -2),
      up: new Cartesian3(0, 3, 1),
      color: Color.RED,
    };
    const rect = new SceneGISRectAreaLight(options);
    expect(rect.position).not.toBe(options.position);
    expect(rect.direction).not.toBe(options.direction);
    expect(rect.up).not.toBe(options.up);
    expect(rect.color).not.toBe(options.color);
    expect(rect.width).toBe(1);
    expect(rect.twoSided).toBe(false);
    expect(() => new SceneGISRectAreaLight()).toThrowDeveloperError();
    for (const invalid of [
      { width: 0 },
      { height: -1 },
      { range: Infinity },
      { intensity: -1 },
      { direction: Cartesian3.ZERO },
      { up: new Cartesian3(0, 0, 2) },
      { color: new Color(-1, 0, 0) },
      { twoSided: 1 },
    ]) {
      expect(
        () => new SceneGISRectAreaLight({ ...options, ...invalid }),
      ).toThrowDeveloperError();
    }
    setup();
    expect(lights.add(light)).toBe(light);
    expect(lights.length).toBe(1);
    light.up = Cartesian3.clone(light.direction);
    expect(() => LocalLights.prepare(scene)).toThrowDeveloperError();
  });

  it("matches independent area quadrature, including a rectangle crossing the receiver horizon", function () {
    setup();
    for (const n of [
      new Cartesian3(0, 0, 1),
      Cartesian3.normalize(new Cartesian3(1, 0, 0.1), new Cartesian3()),
    ]) {
      normal = n;
      const result = sample();
      let integral = 0;
      let specularIntegral = 0;
      const steps = 100;
      for (let y = 0; y < steps; ++y) {
        for (let x = 0; x < steps; ++x) {
          const dx = ((x + 0.5) / steps - 0.5) * 6;
          const dy = ((y + 0.5) / steps - 0.5) * 2;
          const distance2 = dx * dx + dy * dy + 16;
          if (n.z === 1) {
            const cosine = 4 / Math.sqrt(distance2);
            const alpha2 = roughness ** 4;
            const halfway2 = (1 + cosine) * 0.5;
            const distribution =
              alpha2 / (Math.PI * (halfway2 * (alpha2 - 1) + 1) ** 2);
            const visibility =
              0.5 /
              (cosine + Math.sqrt(alpha2 + (1 - alpha2) * cosine * cosine));
            specularIntegral +=
              (((distribution * visibility * cosine * cosine) / distance2) *
                12) /
              (steps * steps);
          }
          integral +=
            (((Math.max(n.x * dx + n.y * dy + n.z * 4, 0) * 4) /
              (distance2 * distance2 * Math.PI)) *
              12) /
            (steps * steps);
        }
      }
      const fade = (1 - (16 / 2500) ** 2) ** 2;
      expect(result[0]).toEqualEpsilon(integral * fade, 0.00002);
      expect(result[2]).toEqualEpsilon(result[0], 0.000001);
      expect(Number.isFinite(result[1])).toBe(true);
      if (n.z === 1) {
        expect(result[1]).toEqualEpsilon(
          specularIntegral * fade,
          specularIntegral * 0.06,
        );
      }
    }
  });

  it("changes the finite rectangular highlight with size, rotation and roughness", function () {
    setup();
    roughness = 0.08;
    position.x = 1.2;
    const wide = sample();
    [light.width, light.height] = [light.height, light.width];
    const tall = sample();
    expect(wide[1]).toBeGreaterThan(tall[1] * 2);
    roughness = 0.7;
    const rough = sample();
    expect(rough[1]).toBeGreaterThan(tall[1]);
    expect(rough[1]).toBeLessThan(wide[1]);
    light.width = light.height = 0.5;
    expect(sample()[0]).toBeLessThan(tall[0] * 0.1);
  });

  it("enforces front-face/range semantics and reuses/reuploads LUT storage after mode changes", function () {
    setup();
    const before = sample();
    expect(before[0]).toBeGreaterThan(0.1);
    const tiles = lights._state.tiles;
    const table = tiles.texture;
    const upload = spyOn(table, "copyFrom").and.callThrough();
    expect(sample()).toEqual(before);
    expect(upload.calls.count()).toBe(4);
    Cartesian3.negate(light.direction, light.direction);
    expect(sample()[0]).toBe(0);
    light.twoSided = true;
    expect(sample()).toEqualEpsilon(before, 0.000001);
    expect(tiles.texture).toBe(table);
    light.range = 3;
    expect(sample()[0]).toBe(0);
    light.range = 50;
    const point = lights.add(
      new SceneGISPointLight({ position: light.position, intensity: 0.1 }),
    );
    // Exercise headers occupying the LUT region before returning to the rectangle layout.
    light.show = false;
    scene.canvas.width = scene.canvas.height = 1024;
    LocalLights.prepare(scene);
    expect(tiles.headerRow).toBe(4);
    expect(tiles.indexRow).toBe(8);
    light.show = true;
    expect(sample().slice(0, 2)).toEqualEpsilon(before.slice(0, 2), 0.000001);
    lights.remove(point);
    lights.show = false;
    LocalLights.prepare(scene);
    expect(tiles.texture.isDestroyed()).toBe(true);
    lights.show = true;
    expect(sample()).toEqualEpsilon(before, 0.000001);
  });
});
