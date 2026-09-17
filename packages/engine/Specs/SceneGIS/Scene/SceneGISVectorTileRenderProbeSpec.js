import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  CullFace,
  DepthFunction,
  DrawCommand,
  Event,
  GeometryInstance,
  GeometryAttribute,
  Matrix4,
  Pass,
  PerInstanceColorAppearance,
  Primitive,
  RenderState,
  SceneTransforms,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarWorld,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";
import createGroundCommands from "../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundCommands.js";
import groundVolume from "../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundVolume.js";
import groundShaders from "../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundLineShader.js";

describe("SceneGIS/Scene/SceneGISVectorTileRenderProbe", function () {
  let scene;
  let world;

  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(64, 64) });
    scene.frameState.scene3DOnly = true;
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128,
          minimumY: -128,
          maximumX: 128,
          maximumY: 128,
        }),
        crs: "EPSG:3857",
      }),
      maximumLevel: 0,
      baseColor: Color.BLACK,
    });
    scene._initializeWorld(world);
    scene.msaaSamples = 1;
    scene.postProcessStages.fxaa.enabled = false;
    scene.camera.position = new Cartesian3(0, 0, 80);
    scene.camera.direction = new Cartesian3(0, 0, -1);
    scene.camera.up = new Cartesian3(0, 1, 0);
    scene.camera.right = new Cartesian3(1, 0, 0);
    scene.camera.frustum.near = 1;
    scene.camera.frustum.far = 1000;
  });

  afterEach(function () {
    scene.destroyForSpecs();
  });

  function polygon(centerX = 0, halfWidth = 40) {
    return new SceneGISPlanarPolygonGeometry({
      positions: [
        new Cartesian3(centerX - halfWidth, -40, 0),
        new Cartesian3(centerX + halfWidth, -40, 0),
        new Cartesian3(centerX + halfWidth, 40, 0),
        new Cartesian3(centerX - halfWidth, 40, 0),
      ],
    });
  }

  function instance(id, color, ground, centerX = 0, halfWidth = 40) {
    const geometry = polygon(centerX, halfWidth);
    const volume = ground ? groundVolume.create(world, geometry) : undefined;
    return new GeometryInstance({
      id,
      geometry: volume?.geometry ?? geometry._createGeometry(),
      modelMatrix:
        volume?.modelMatrix ??
        Matrix4.fromTranslation(geometry._origin, new Matrix4()),
      attributes: {
        color: ColorGeometryInstanceAttribute.fromColor(color),
      },
    });
  }

  function flatQueue(
    primitive,
    frameState,
    commands,
    pickCommands,
    modelMatrix,
  ) {
    Primitive._updateBoundingVolumes(primitive, frameState, modelMatrix, false);
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      command.modelMatrix = modelMatrix;
      command.boundingVolume = primitive._boundingSphereWC[i];
      command.pass = Pass.TERRAIN_CLASSIFICATION;
      if (frameState.passes.render) {
        frameState.commandList.push(command);
      } else if (frameState.passes.pick && !frameState.passes.depth) {
        const pick = DrawCommand.shallowClone(command);
        pick.pickId = "v_pickColor";
        pick.renderState = RenderState.fromCache({
          depthTest: { enabled: true, func: DepthFunction.LESS_OR_EQUAL },
          depthMask: false,
        });
        frameState.commandList.push(pick);
      }
    }
  }

  function add(instances, ground = false) {
    const hooks = ground ? createGroundCommands({}) : undefined;
    return scene.primitives.add(
      new Primitive({
        geometryInstances: instances,
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: true,
          vertexShaderSource: ground
            ? groundShaders.areaVertexShaderSource
            : undefined,
          fragmentShaderSource: ground
            ? groundShaders.areaFragmentShaderSource
            : undefined,
          renderState: {
            depthTest: { enabled: true, func: DepthFunction.LESS_OR_EQUAL },
            depthMask: false,
            cull: { enabled: false },
          },
        }),
        asynchronous: false,
        vertexCacheOptimize: false,
        compressVertices: false,
        _updateAndQueueCommandsFunction: hooks?.updateAndQueue ?? flatQueue,
      }),
    );
  }

  function pixel() {
    scene.renderForSpecs();
    return Array.from(
      scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
    );
  }

  function expectComposite(value, context) {
    for (const [channel, expected] of [64, 0, 128, 255].entries()) {
      expect(value[channel]).withContext(context).toEqualEpsilon(expected, 2);
    }
  }

  function overlapping(ground = false) {
    return [
      instance("red", new Color(1, 0, 0, 0.5), ground),
      instance("blue", new Color(0, 0, 1, 0.5), ground),
    ];
  }

  it("preserves source-over and topmost picking inside one flat geometry batch", function () {
    const primitive = add(overlapping());
    expectComposite(pixel(), "flat batch");
    expect(primitive._colorCommands.length).toBe(1);
    expect(scene.pick(new Cartesian2(32, 32))?.id).toBe("blue");
  });

  it("preserves painter order across flat style batches", function () {
    for (const geometry of overlapping()) {
      add(geometry);
    }
    expectComposite(pixel(), "flat layer order");
    expect(scene.pick(new Cartesian2(32, 32))?.id).toBe("blue");
  });

  it("composites flat batches only once at a native frustum boundary", function () {
    scene.logarithmicDepthBuffer = false;
    scene.farToNearRatio = 2;
    scene.camera.position.z = 128 * (1 - 0.00005);
    add(overlapping());
    const value = pixel();
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    expectComposite(value, "native frustum boundary");
  });

  it("establishes independent ground stencil groups as the overlap reference", function () {
    for (const geometry of overlapping(true)) {
      add(geometry, true);
    }
    expectComposite(pixel(), "ground reference");
    expect(scene.pick(new Cartesian2(32, 32))?.id).toBe("blue");
  });

  it("measures overlap identity loss when volumes share one stencil group", function () {
    const primitive = add(overlapping(true), true);
    const value = pixel();
    const id = scene.pick(new Cartesian2(32, 32))?.id;
    expect(primitive._colorCommands.length).toBe(1);
    // This is an architecture counterexample, not a supported map backend.
    expect(value).toEqual([128, 0, 0, 255]);
    expect(id).toBe("red");
  });

  function addSurfaceDepthBatch(geometries = overlapping(true)) {
    for (const geometry of geometries) {
      const positions = geometry.geometry.attributes.position.values;
      const count = positions.length / 3;
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < positions.length; i += 3) {
        const point = Matrix4.multiplyByPoint(
          geometry.modelMatrix,
          Cartesian3.unpack(positions, i, new Cartesian3()),
          new Cartesian3(),
        );
        bounds[0] = Math.min(bounds[0], point.x);
        bounds[1] = Math.min(bounds[1], point.y);
        bounds[2] = Math.max(bounds[2], point.x);
        bounds[3] = Math.max(bounds[3], point.y);
      }
      geometry.geometry.attributes.footprint = new GeometryAttribute({
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 4,
        values: new Float32Array(
          Array.from({ length: count }, () => bounds).flat(),
        ),
      });
    }
    return scene.primitives.add(
      new Primitive({
        geometryInstances: geometries,
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: true,
          vertexShaderSource: `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec4 color;
in float batchId;
in vec4 footprint;
out vec4 v_color;
out vec4 v_footprint;
void main() {
  v_color = color;
  v_footprint = footprint;
  gl_Position = czm_depthClamp(czm_modelViewProjectionRelativeToEye * czm_computePosition());
}`,
          fragmentShaderSource: `
in vec4 v_color;
in vec4 v_footprint;
void main() {
  float depth = czm_unpackDepth(texture(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));
  if (depth == 0.0 || depth == 1.0) discard;
  vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
  vec4 world = czm_inverseView * eye;
  vec2 xy = world.xy / world.w;
  if (any(lessThan(xy, v_footprint.xy)) || any(greaterThanEqual(xy, v_footprint.zw))) discard;
  out_FragColor = czm_gammaCorrect(v_color);
  czm_writeDepthClamp();
}`,
          renderState: {
            depthTest: { enabled: false },
            depthMask: false,
            cull: { enabled: true, face: CullFace.FRONT },
          },
        }),
        asynchronous: false,
        vertexCacheOptimize: false,
        compressVertices: false,
        _updateAndQueueCommandsFunction: function (
          owner,
          frameState,
          commands,
          picks,
          matrix,
        ) {
          Primitive._updateBoundingVolumes(owner, frameState, matrix, false);
          for (let i = 0; i < commands.length; i++) {
            const command = commands[i];
            command.modelMatrix = matrix;
            command.boundingVolume = owner._boundingSphereWC[i];
            command.pass = Pass.TERRAIN_CLASSIFICATION;
            if (frameState.passes.render) {
              frameState.commandList.push(command);
            } else if (frameState.passes.pick && !frameState.passes.depth) {
              const pick = DrawCommand.shallowClone(command);
              pick.pickId = "v_pickColor";
              pick.renderState = RenderState.fromCache({
                depthTest: { enabled: false },
                depthMask: false,
                cull: { enabled: true, face: CullFace.FRONT },
              });
              frameState.commandList.push(pick);
            }
          }
        },
      }),
    );
  }

  it("composites overlapping convex volumes by testing each feature against surface depth", function () {
    scene.logarithmicDepthBuffer = false;
    const primitive = addSurfaceDepthBatch();
    expectComposite(pixel(), "surface-depth batch");
    expect(primitive._colorCommands.length).toBe(1);
    expect(scene.pick(new Cartesian2(32, 32))?.id).toBe("blue");
  });

  it("keeps opaque objects in front of the flat map", function () {
    add(overlapping());
    const foreground = instance("foreground", Color.LIME, false);
    foreground.modelMatrix[14] = 10;
    scene.primitives.add(
      new Primitive({
        geometryInstances: foreground,
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
        asynchronous: false,
      }),
    );
    expect(pixel()).toEqual([0, 255, 0, 255]);
    expect(scene.pick(new Cartesian2(32, 32))?.id).toBe("foreground");
  });

  it("clips depth-tested ground color and picking to the owning feature", function () {
    scene.logarithmicDepthBuffer = false;
    addSurfaceDepthBatch([
      instance("red", new Color(1, 0, 0, 0.5), true, -16, 24),
      instance("blue", new Color(0, 0, 1, 0.5), true, 16, 24),
    ]);
    expectComposite(pixel(), "partial overlap");
    for (const [x, expected, id] of [
      [-24, [128, 0, 0, 255], "red"],
      [24, [0, 0, 128, 255], "blue"],
    ]) {
      const windowPosition = SceneTransforms.worldToWindowCoordinates(
        scene,
        new Cartesian3(x, 0, 0),
      );
      scene.renderForSpecs();
      const value = Array.from(
        scene.context.readPixels({
          x: Math.floor(windowPosition.x),
          y: scene.canvas.height - 1 - Math.floor(windowPosition.y),
          width: 1,
          height: 1,
        }),
      );
      expect(value).toEqual(expected);
      expect(scene.pick(windowPosition)?.id).toBe(id);
    }
  });

  [false, true].forEach(function (logarithmic) {
    it(`keeps feature color and identity on sloped terrain with logarithmic depth ${logarithmic}`, async function () {
      scene.logarithmicDepthBuffer = logarithmic;
      world.terrainProvider = {
        tilingScheme: world.tilingScheme,
        minimumHeight: 0,
        maximumHeight: 24,
        maximumLevel: 0,
        errorEvent: new Event(),
        getLevelMaximumGeometricError: () => 1,
        getTileDataAvailable: () => true,
        loadTileDataAvailability: () => undefined,
        requestTileGeometry: () =>
          Promise.resolve(
            new SceneGISPlanarHeightmapTerrainData({
              width: 3,
              height: 3,
              buffer: new Float32Array([0, 12, 24, 0, 12, 24, 0, 12, 24]),
            }),
          ),
      };
      scene.camera.position = new Cartesian3(0, -80, 80);
      scene.camera.direction = Cartesian3.normalize(
        new Cartesian3(0, 80, -68),
        new Cartesian3(),
      );
      scene.camera.up = Cartesian3.cross(
        scene.camera.right,
        scene.camera.direction,
        new Cartesian3(),
      );
      await pollToPromise(function () {
        scene.renderForSpecs();
        return world.getTerrainHeight(Cartesian3.ZERO) !== undefined;
      });
      const primitive = addSurfaceDepthBatch();
      expectComposite(pixel(), "sloped terrain depth batch");
      expect(scene.pick(new Cartesian2(32, 32))?.id).toBe("blue");
      expect(primitive._colorCommands.length).toBe(1);
      if (scene.pickPositionSupported) {
        const picked = scene.pickPosition(new Cartesian2(32, 32));
        expect(picked.z).toEqualEpsilon(12, 1);
      }
    });
  });
});
