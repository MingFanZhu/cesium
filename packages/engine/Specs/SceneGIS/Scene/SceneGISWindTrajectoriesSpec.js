import {
  BoxGeometry,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  Framebuffer,
  GeometryInstance,
  Globe,
  JulianDate,
  Matrix4,
  PerInstanceColorAppearance,
  PixelDatatype,
  PixelFormat,
  Primitive,
  PrimitiveCollection,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISWindVisualization,
  Texture,
  Transforms,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";

describe("SceneGIS/Scene/SceneGISWindTrajectories", function () {
  let scene, view, field, textures;
  const time = JulianDate.fromIso8601("2026-10-29T00:00:00Z");
  function setup(options = {}, rotation = 0, planar) {
    scene = createScene({ canvas: createCanvas(128, 128), scene3DOnly: true });
    scene.skyBox = scene.skyAtmosphere = scene.sun = scene.moon = undefined;
    scene.fog.enabled = false;
    scene.backgroundColor = Color.BLACK;
    let matrix = Matrix4.IDENTITY;
    if (planar === true) {
      scene._initializeWorld(
        new SceneGISPlanarWorld({
          coordinateSystem: new SceneGISPlanarCoordinateSystem({
            extent: new SceneGISPlanarExtent({
              minimumX: -1000,
              maximumX: 1000,
              minimumY: -1000,
              maximumY: 1000,
            }),
          }),
          maximumLevel: 0,
        }),
      );
      matrix = Matrix4.fromTranslation(new Cartesian3(100, 100, 100));
    } else if (planar === false) {
      scene.globe = new Globe();
      scene.globe.show = false;
      matrix = Transforms.eastNorthUpToFixedFrame(
        Cartesian3.fromDegrees(-74, 40, 100),
      );
    }
    const n = new Cartesian3(32, 32, 8),
      width = 96,
      height = 96;
    const velocity = new Float32Array(width * height * 4),
      solid = new Uint8Array(width * height * 4);
    for (let k = 0; k < 8; k++) {
      for (let j = 0; j < 32; j++) {
        for (let i = 0; i < 32; i++) {
          const p =
            4 * (i + (k % 3) * 32 + width * (j + Math.floor(k / 3) * 32));
          velocity[p] = rotation ? -rotation * (j - 15.5) : 1;
          velocity[p + 1] = rotation * (i - 15.5);
          velocity[p + 3] = 1;
          if (options.obstacle && i === 17 && j === 16 && k === 4) {
            solid[p] = 255;
          }
        }
      }
    }
    const texture = (array, pixelDatatype) =>
      new Texture({
        context: scene.context,
        width,
        height,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype,
        flipY: false,
        source: { width, height, arrayBufferView: array },
      });
    textures = [
      texture(velocity, PixelDatatype.FLOAT),
      texture(solid, PixelDatatype.UNSIGNED_BYTE),
      texture(new Float32Array(width * height * 4), PixelDatatype.FLOAT),
    ];
    field = {
      dimensions: n,
      minimum: new Cartesian3(-16, -16, 0),
      cellSize: 1,
      atlasColumns: 3,
      modelMatrix: matrix,
      contextId: scene.context.id,
      velocityTexture: textures[0],
      solidTexture: textures[1],
      concentrationTexture: textures[2],
      version: 0,
      generation: 0,
      simulationTime: 0,
    };
    view = scene.primitives.add(
      new SceneGISWindVisualization({
        scene,
        simulation: { timeStep: 0.02, getGpuField: () => field },
        mode: "none",
        particleCount: 128,
        ...options,
      }),
    );
    camera(40);
    render();
  }
  function camera(z) {
    const m = field.modelMatrix;
    scene.camera.setView({
      destination: Matrix4.multiplyByPoint(
        m,
        new Cartesian3(0, 0, z),
        new Cartesian3(),
      ),
      orientation: {
        direction: Matrix4.multiplyByPointAsVector(
          m,
          new Cartesian3(0, 0, -1),
          new Cartesian3(),
        ),
        up: Matrix4.multiplyByPointAsVector(
          m,
          Cartesian3.UNIT_Y,
          new Cartesian3(),
        ),
      },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 200;
  }
  function render(t = field.simulationTime) {
    field.simulationTime = t;
    scene.renderForSpecs(time);
  }
  function read(texture) {
    const f = new Framebuffer({
      context: scene.context,
      colorTextures: [texture],
      destroyAttachments: false,
    });
    try {
      return Array.from(
        scene.context.readPixels({
          framebuffer: f,
          width: texture.width,
          height: texture.height,
        }),
      );
    } finally {
      f.destroy();
    }
  }
  function heads(attachment = 0) {
    const p = view._particles;
    return read(p.buffers[p.index].getColorTexture(attachment));
  }
  function setHead(position, style = [2, 16, 0, 1]) {
    const p = view._particles;
    for (const [index, data] of [
      [0, position],
      [1, style],
    ]) {
      p.buffers[p.index].getColorTexture(index).copyFrom({
        source: {
          width: 1,
          height: 1,
          arrayBufferView: new Float32Array(data),
        },
      });
    }
  }
  function sample(index, particle, data) {
    const p = view._particles,
      width = p.history.getColorTexture(0).width;
    const x = (index % p.columns) * p.width + (particle % p.width);
    const y =
      Math.floor(index / p.columns) * p.height + Math.floor(particle / p.width);
    return data.slice(4 * (x + y * width), 4 * (x + y * width) + 4);
  }
  function extent() {
    const data = scene.context.readPixels();
    let x0 = 128,
      y0 = 128,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const k = 4 * (x + y * 128);
        if (data[k] + data[k + 1] + data[k + 2] < 20) {
          continue;
        }
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
    return [Math.max(0, x1 - x0 + 1), Math.max(0, y1 - y0 + 1)];
  }
  afterEach(function () {
    scene?.destroyForSpecs();
    textures?.forEach((t) => t.destroy());
    scene = view = field = textures = undefined;
  });
  it("validates independent dimensions, duration, capacity and padded memory ceilings", function () {
    setup();
    const simulation = { timeStep: 0.02, getGpuField: () => field };
    [
      { particleWidth: 0 },
      { particleLength: Infinity },
      { particleWidthUnits: "css" },
      { trailDuration: 0 },
      { trailDuration: 121 },
      { trailSegments: 0 },
      { trailSegments: 129 },
      { trailFade: -1 },
      { particleCount: 65536, trailSegments: 128 },
    ].forEach((controls) => {
      expect(
        () => new SceneGISWindVisualization({ scene, simulation, ...controls }),
      ).toThrowDeveloperError();
    });
    expect(view.showTrails).toBeFalse();
    expect(view.trailSegments).toBe(32);
    expect(view.trailTextureByteLength).toBe(0);
  });
  it("stores actual curved RK2 positions at physical-time boundaries across render batches", function () {
    setup({ showTrails: true, trailDuration: 4, trailSegments: 8 }, 0.3);
    const first = heads(),
      styles = heads(1),
      p = view._particles;
    let particle = -1;
    for (let i = 0; i < 128; i++) {
      const r = Math.hypot(first[4 * i], first[4 * i + 1]);
      if (r > 4 && r < 10 && styles[4 * i] + 6 < styles[4 * i + 1]) {
        particle = i;
        break;
      }
    }
    expect(particle).toBeGreaterThanOrEqual(0);
    render(1.3);
    render(3);
    render(6);
    const data = read(p.history.getColorTexture(0));
    expect(p.count).toBe(9);
    for (let i = 0; i < p.capacity; i++) {
      const at = p.times[i],
        v = sample(i, particle, data),
        a = 0.3 * at;
      expect(v.slice(0, 2)).toEqualEpsilon(
        [
          first[particle * 4] * Math.cos(a) -
            first[particle * 4 + 1] * Math.sin(a),
          first[particle * 4] * Math.sin(a) +
            first[particle * 4 + 1] * Math.cos(a),
        ],
        0.002,
      );
      expect(v[2]).toEqualEpsilon(first[particle * 4 + 2], 1e-5);
      expect(v[3]).toBe(0);
    }
    const head = heads(),
      historyTexture = p.history;
    render();
    expect(heads()).toEqual(head);
    expect(read(historyTexture.getColorTexture(0))).toEqual(data);
    camera(30);
    render();
    expect(heads()).toEqual(head);
    view.show = false;
    render(8);
    view.show = true;
    render(8);
    expect(heads()).toEqual(head);
    expect(p.count).toBe(1);
    expect(p.times[p.head]).toBe(8);
    view.trailDuration = 2;
    render();
    expect(p.count).toBe(1);
    expect(p.history).toBe(historyTexture);
    field.generation++;
    render(0);
    expect(heads()).toEqual(first);
    expect(p.count).toBe(1);
    render(1);
    render(0);
    expect(heads()).toEqual(first);
    expect(p.count).toBe(1);
    const targets = p.targets.slice();
    scene.primitives.remove(view);
    expect(targets.every((t) => t.isDestroyed())).toBeTrue();
    expect(textures.every((t) => !t.isDestroyed())).toBeTrue();
  });
  it("bounds retained samples when a batch exceeds the trail duration", function () {
    setup({ showTrails: true, trailDuration: 2, trailSegments: 4 });
    const p = view._particles;
    spyOn(p.copy, "execute").and.callThrough();
    render(10);
    expect(p.count).toBe(5);
    expect(p.copy.execute.calls.count()).toBe(5);
    expect(Math.min(...p.times)).toBe(8);
    expect(Math.max(...p.times)).toBe(10);
  });
  it("discards hidden ancestor history and never integrates twice in one frame or pick", function () {
    setup({ showTrails: true, trailDuration: 2, trailSegments: 8 });
    render(1);
    const state = heads(),
      p = view._particles;
    scene.primitives.destroyPrimitives = false;
    scene.primitives.remove(view);
    scene.primitives.destroyPrimitives = true;
    const layer = scene.primitives.add(new PrimitiveCollection());
    layer.add(view);
    layer.show = false;
    render(2);
    render(3);
    layer.show = true;
    render(3);
    expect(heads()).toEqual(state);
    expect(p.count).toBe(1);
    spyOn(p.advance, "execute").and.callThrough();
    spyOn(p.copy, "execute").and.callThrough();
    const frame = {
      ...scene.frameState,
      passes: { render: true, pick: false },
      commandList: [],
    };
    view.update(frame);
    frame.passes.pick = true;
    view.update(frame);
    expect(p.advance.execute).not.toHaveBeenCalled();
    expect(p.copy.execute).not.toHaveBeenCalled();
  });
  it("applies tail fade and shared opacity without changing trajectory resources", function () {
    setup({
      particleCount: 1,
      showTrails: true,
      trailDuration: 4,
      trailSegments: 8,
      particleWidth: 4,
      particleLength: 2,
      particleOpacity: 1,
    });
    setHead([0, 0, 4, 0]);
    view.showTrails = false;
    render();
    view.showTrails = true;
    render();
    render(2);
    const p = view._particles,
      state = heads(),
      history = p.history;
    const energy = () =>
      Array.from(scene.context.readPixels()).reduce(
        (sum, v, i) => sum + (i % 4 === 3 ? 0 : v),
        0,
      );
    view.trailFade = 0;
    render();
    const full = energy();
    view.trailFade = 4;
    render();
    const faded = energy();
    expect(faded).toBeLessThan(full);
    view.particleOpacity = 0.2;
    render();
    expect(energy()).toBeLessThan(faded);
    expect(heads()).toEqual(state);
    expect(p.history).toBe(history);
  });
  ["collision", "outflow", "lifetime"].forEach(function (kind) {
    it(`breaks history tokens on ${kind} recycling`, function () {
      setup({
        particleCount: 1,
        showTrails: true,
        trailDuration: 2,
        trailSegments: 8,
        obstacle: true,
      });
      setHead(
        kind === "outflow" ? [15.99, 0.5, 4.5, 0] : [0.99, 0.5, 4.5, 0],
        kind === "lifetime" ? [15.99, 16, 0, 1] : [2, 16, 0, 1],
      );
      view.showTrails = false;
      render();
      view.showTrails = true;
      render();
      const p = view._particles,
        old = p.head;
      render(0.1);
      expect(heads()[3]).toBe(1);
      expect(sample(old, 0, read(p.history.getColorTexture(0)))[3]).toBe(0);
    });
  });
  it("keeps width and length independent and pixel width stable under camera zoom", function () {
    setup({
      particleCount: 1,
      particleWidth: 4,
      particleWidthUnits: "pixels",
      particleLength: 8,
      particleOpacity: 1,
    });
    setHead([0, 0, 4, 0]);
    render();
    const first = extent(),
      p = view._particles,
      program = p.draw.shaderProgram,
      state = heads();
    view.particleLength = 16;
    render();
    const longer = extent();
    expect(longer[0]).toBeGreaterThan(first[0] * 1.7);
    expect(Math.abs(longer[1] - first[1])).toBeLessThanOrEqual(1);
    view.particleWidth = 8;
    render();
    const wider = extent();
    expect(wider[1]).toBeGreaterThan(first[1] * 1.5);
    expect(Math.abs(wider[0] - longer[0])).toBeLessThanOrEqual(2);
    camera(24);
    render();
    expect(Math.abs(extent()[1] - wider[1])).toBeLessThanOrEqual(1);
    expect(p.draw.shaderProgram).toBe(program);
    expect(heads()).toEqual(state);
    view.particleOpacity = 0;
    render();
    expect(extent()).toEqual([0, 0]);
  });
  [false, true].forEach(function (planar) {
    it(`depth-tests three-dimensional trails and releases them in ${planar ? "Planar" : "Globe"}`, function () {
      setup(
        {
          particleCount: 128,
          showTrails: true,
          trailSegments: 8,
          trailDuration: 4,
          particleWidth: 2,
          particleWidthUnits: "pixels",
          particleLength: 2,
        },
        0.3,
        planar,
      );
      render(2);
      render(4);
      const p = view._particles,
        state = heads(),
        history = read(p.history.getColorTexture(0));
      view.showTrails = false;
      render();
      const plain = Array.from(scene.context.readPixels());
      view.showTrails = true;
      render();
      render(4.5);
      expect(Array.from(scene.context.readPixels())).not.toEqual(plain);
      scene.primitives.add(
        new Primitive({
          asynchronous: false,
          modelMatrix: Matrix4.multiplyByTranslation(
            field.modelMatrix,
            new Cartesian3(0, 0, 16),
            new Matrix4(),
          ),
          geometryInstances: new GeometryInstance({
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(50, 50, 1),
              vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
            },
          }),
          appearance: new PerInstanceColorAppearance({
            flat: true,
            translucent: false,
          }),
        }),
      );
      render();
      const covered = Array.from(scene.context.readPixels());
      view.showParticles = false;
      render();
      expect(Array.from(scene.context.readPixels())).toEqual(covered);
      expect(state.length).toBe(128 * 4 + 16);
      expect(history.length).toBeGreaterThan(0);
    });
  });
});
