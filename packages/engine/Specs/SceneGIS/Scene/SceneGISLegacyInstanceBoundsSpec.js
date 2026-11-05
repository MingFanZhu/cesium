import {
  Axis,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Cesium3DTileset,
  Color,
  Matrix4,
  Quaternion,
  SceneMode,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  Transforms,
} from "../../../index.js";
import LegacyInstanceBounds from "../../../Source/SceneGIS/Scene/_private/_SceneGISLegacyInstanceBounds.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

// Local deterministic GLB/i3dm: a 200-metre quad scaled to 2 metres per instance.
function createTile(oriented = false) {
  const positions = new Float32Array([
    -100, 0, -100, 100, 0, -100, 100, 0, 100, -100, 0, 100,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const bin = new Uint8Array(positions.byteLength + indices.byteLength);
  bin.set(new Uint8Array(positions.buffer));
  bin.set(new Uint8Array(indices.buffer), positions.byteLength);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: "parent", children: [1, 2] },
      { name: "mesh", mesh: 0, scale: [0.01, 0.01, 0.01] },
      {
        name: "sibling",
        mesh: 0,
        scale: [0.01, 0.01, 0.01],
        translation: [0, 0, 8],
      },
    ],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    materials: [
      {
        doubleSided: true,
        pbrMetallicRoughness: { baseColorFactor: [0.8, 0.2, 0.3, 1] },
        extensions: { KHR_materials_unlit: {} },
      },
    ],
    extensionsUsed: ["KHR_materials_unlit"],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positions.byteLength,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: indices.byteLength,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: "VEC3",
        min: [-100, 0, -100],
        max: [100, 0, 100],
      },
      { bufferView: 1, componentType: 5123, count: 6, type: "SCALAR" },
    ],
  };
  const padded = (value, alignment) =>
    new TextEncoder().encode(
      JSON.stringify(value).padEnd(
        Math.ceil(JSON.stringify(value).length / alignment) * alignment,
        " ",
      ),
    );
  const gltfJson = padded(json, 4);
  const glb = new Uint8Array(28 + gltfJson.length + bin.length);
  const glbView = new DataView(glb.buffer);
  [0x46546c67, 2, glb.length, gltfJson.length, 0x4e4f534a].forEach((value, i) =>
    glbView.setUint32(i * 4, value, true),
  );
  glb.set(gltfJson, 20);
  glbView.setUint32(20 + gltfJson.length, bin.length, true);
  glbView.setUint32(24 + gltfJson.length, 0x004e4942, true);
  glb.set(bin, 28 + gltfJson.length);
  const featureTable = {
    INSTANCES_LENGTH: 2,
    RTC_CENTER: [0, 0, 5],
    POSITION: { byteOffset: 0 },
  };
  const translations = new Float32Array(oriented ? 24 : 6);
  translations.set([-500, 0, 0, 500, 0, 0]);
  if (oriented) {
    featureTable.NORMAL_RIGHT = { byteOffset: 24 };
    featureTable.NORMAL_UP = { byteOffset: 48 };
    featureTable.SCALE_NON_UNIFORM = { byteOffset: 72 };
    translations.set(
      [Math.cos(0.3), 0, -Math.sin(0.3), Math.cos(-0.2), 0, -Math.sin(-0.2)],
      6,
    );
    translations.set([0, 1, 0, 0, 1, 0], 12);
    translations.set([2, 0.5, 1, 1.5, 2, 0.5], 18);
  }
  const features = padded(featureTable, 8);
  const tile = new Uint8Array(
    32 + features.length + translations.byteLength + glb.length,
  );
  const view = new DataView(tile.buffer);
  [
    0x6d643369,
    1,
    tile.length,
    features.length,
    translations.byteLength,
    0,
    0,
    1,
  ].forEach((value, i) => view.setUint32(i * 4, value, true));
  tile.set(features, 32);
  tile.set(new Uint8Array(translations.buffer), 32 + features.length);
  tile.set(glb, 32 + features.length + translations.byteLength);
  return tile;
}

describe("SceneGIS/Scene/SceneGISLegacyInstanceBounds", function () {
  let scene, tileset;
  afterEach(function () {
    scene?.destroyForSpecs();
    scene = tileset = undefined;
  });

  async function load(oriented = false) {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene._initializeWorld(
      new SceneGISPlanarWorld({
        coordinateSystem: new SceneGISPlanarCoordinateSystem({
          extent: new SceneGISPlanarExtent({
            minimumX: -2000,
            maximumX: 2000,
            minimumY: -2000,
            maximumY: 2000,
          }),
        }),
        maximumLevel: 0,
      }),
    );
    scene.world.show = false;
    scene.environmentEffects.enabled = false;
    scene.backgroundColor = Color.BLACK;
    scene.camera.setView({
      destination: new Cartesian3(500, -20, 5),
      orientation: { direction: Cartesian3.UNIT_Y, up: Cartesian3.UNIT_Z },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 2000;
    const data = {
      asset: { version: "1.0", gltfUpAxis: "Z" },
      geometricError: 500,
      root: {
        boundingVolume: { box: [0, 0, 5, 600, 0, 0, 0, 10, 0, 0, 0, 50] },
        geometricError: 0,
        content: {
          uri: `data:application/octet-stream;base64,${btoa(String.fromCharCode(...createTile(oriented)))}`,
        },
      },
    };
    tileset = scene.primitives.add(
      await Cesium3DTileset.fromUrl(
        `data:application/json,${encodeURIComponent(JSON.stringify(data))}`,
        {
          modelUpAxis: Axis.Z,
          modelForwardAxis: Axis.X,
          cullRequestsWhileMoving: false,
        },
      ),
    );
    await pollToPromise(
      () => {
        scene.renderForSpecs();
        return tileset.tilesLoaded && tileset.root.content?._model?.ready;
      },
      { timeout: 15000 },
    );
    return tileset.root.content._model;
  }

  it("keeps scaled-node i3dm instances in the draw depth interval while turning the camera", async function () {
    const model = await load();
    const runtime = model.sceneGraph._runtimeNodes[1].runtimePrimitives[0];
    expect(runtime.drawCommand.boundingVolume.radius).toBeGreaterThan(500);
    expect(model.boundingSphere.radius).toBeGreaterThan(500);
    const nodes = model.sceneGraph._runtimeNodes;
    expect(nodes[1].node.instances._sceneGISInstanceBounds).toBe(
      nodes[2].node.instances._sceneGISInstanceBounds,
    );
    for (const yaw of [-0.03, 0, 0.03]) {
      scene.camera.setView({
        destination: new Cartesian3(500, -20, 5),
        orientation: {
          direction: new Cartesian3(Math.sin(yaw), Math.cos(yaw), 0),
          up: Cartesian3.UNIT_Z,
        },
      });
      scene.renderForSpecs();
      const pixel = scene.context.readPixels({
        x: 32,
        y: 32,
        width: 1,
        height: 1,
      });
      expect(pixel[0]).toBeGreaterThan(40);
      const hit = scene.pickPosition(new Cartesian2(32, 32));
      expect(hit).toBeDefined();
      expect(hit.y).toEqualEpsilon(0, 0.01);
    }
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("updates shared draw bounds after parent, node and tileset transforms change", async function () {
    const model = await load();
    const runtime = model.sceneGraph._runtimeNodes[1].runtimePrimitives[0];
    const bounds = runtime.drawCommand.boundingVolume;
    const commandMatrix = runtime.drawCommand.modelMatrix;
    const outer = Matrix4.fromTranslationQuaternionRotationScale(
      new Cartesian3(25, 10, 5),
      Quaternion.fromAxisAngle(Cartesian3.UNIT_Z, 0.3),
      new Cartesian3(1.2, 1.2, 1.2),
    );
    model.getNode("mesh").matrix = Matrix4.fromScale(
      new Cartesian3(0.02, 0.005, 0.03),
    );
    model.getNode("parent").matrix = Matrix4.fromTranslation(
      new Cartesian3(17, 3, 2),
    );
    tileset.modelMatrix = outer;
    const point = (x, y, z) =>
      Matrix4.multiplyByPoint(outer, new Cartesian3(x, y, z), new Cartesian3());
    const vector = (value) =>
      Cartesian3.normalize(
        Matrix4.multiplyByPointAsVector(outer, value, new Cartesian3()),
        new Cartesian3(),
      );
    scene.camera.setView({
      destination: point(517, -17, 7),
      orientation: {
        direction: vector(Cartesian3.UNIT_Y),
        up: vector(Cartesian3.UNIT_Z),
      },
    });
    scene.renderForSpecs();
    expect(runtime.drawCommand.boundingVolume).toBe(bounds);
    expect(runtime.drawCommand.modelMatrix).toBe(commandMatrix);
    expect(bounds.radius).toBeGreaterThan(600);
    for (const x of [-483, 517]) {
      for (const dx of [-2, 2]) {
        for (const dz of [-3, 3]) {
          expect(
            Cartesian3.distance(bounds.center, point(x + dx, 3, 7 + dz)),
          ).toBeLessThanOrEqual(bounds.radius + 1e-6);
        }
      }
    }
    for (const derived of runtime.drawCommand._derivedCommands) {
      expect(derived.command.boundingVolume).toBe(bounds);
    }
    expect(
      scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 })[0],
    ).toBeGreaterThan(40);
    expect(
      Cartesian3.distance(
        scene.pickPosition(new Cartesian2(32, 32)),
        point(517, 3, 7),
      ),
    ).toBeLessThan(1);
    const vertexArray = runtime.drawCommand.command.vertexArray;
    scene.primitives.remove(tileset);
    expect(model.isDestroyed()).toBe(true);
    expect(vertexArray.isDestroyed()).toBe(true);
  });

  it("renders legacy matrix attributes with instance rotation and nonuniform scale", async function () {
    const model = await load(true);
    const node = model.sceneGraph._runtimeNodes[1];
    expect(node.instancingTransformsBuffer).toBeDefined();
    expect(node.node.instances._sceneGISInstanceBounds.byteLength).toBe(192);
    for (const attribute of node.node.instances.attributes) {
      expect(attribute.typedArray).toBeUndefined();
    }
    expect(
      node.runtimePrimitives[0].drawCommand.boundingVolume.radius,
    ).toBeGreaterThan(500);
    expect(
      scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 })[0],
    ).toBeGreaterThan(40);
    expect(scene.pickPosition(new Cartesian2(32, 32))).toBeDefined();
  });

  it("bounds rotated and scaled instances after axis, singular node, RTC and ENU transforms", function () {
    const translations = new Float32Array([-500, -100, 20, 500, 80, -30]);
    const rotations = new Float32Array(8);
    Quaternion.pack(
      Quaternion.fromAxisAngle(Cartesian3.UNIT_X, 1.1),
      rotations,
      0,
    );
    Quaternion.pack(
      Quaternion.fromAxisAngle(Cartesian3.UNIT_Y, -0.7),
      rotations,
      4,
    );
    const scales = new Float32Array([2, 0.3, -1, 0.4, 3, 1]);
    const summary = LegacyInstanceBounds.create(
      translations,
      rotations,
      scales,
    );
    expect(summary.byteLength).toBe(192);
    const axis = Axis.Y_UP_TO_Z_UP;
    const outer = Transforms.eastNorthUpToFixedFrame(
      Cartesian3.fromDegrees(118, 32, 50),
    );
    const rtc = Matrix4.fromTranslation(new Cartesian3(1000, 2000, 30));
    const node = Matrix4.fromTranslationQuaternionRotationScale(
      new Cartesian3(7, -2, 8),
      Quaternion.fromAxisAngle(Cartesian3.UNIT_Z, 0.4),
      new Cartesian3(0, -0.1, 2),
    );
    const min = new Cartesian3(-3, -2, -1),
      max = new Cartesian3(5, 7, 11);
    const resources = {
      runtimeNode: {
        node: { instances: { _sceneGISInstanceBounds: summary } },
        computedTransform: node,
      },
      model: {
        modelMatrix: outer,
        sceneGraph: {
          axisCorrectionMatrix: axis,
          components: { transform: rtc },
        },
      },
      runtimePrimitive: {
        primitive: { attributes: [{ semantic: "POSITION", min, max }] },
      },
    };
    const sphere = new BoundingSphere();
    LegacyInstanceBounds.update(resources, sphere, { mode: SceneMode.SCENE3D });
    const modelMin = new Cartesian3(),
      modelMax = new Cartesian3();
    LegacyInstanceBounds.modelPositions(resources, modelMin, modelMax);
    const inverseAxis = Matrix4.inverseTransformation(axis, new Matrix4());
    for (let instance = 0; instance < 2; instance++) {
      const transform = Matrix4.fromTranslationQuaternionRotationScale(
        Cartesian3.unpack(translations, instance * 3),
        Quaternion.unpack(rotations, instance * 4),
        Cartesian3.unpack(scales, instance * 3),
      );
      // The native matrix vertex attributes use Float32 storage.
      for (let index = 0; index < 16; index++) {
        transform[index] = Math.fround(transform[index]);
      }
      const full = Matrix4.multiply(outer, rtc, new Matrix4());
      Matrix4.multiply(full, transform, full);
      Matrix4.multiply(full, axis, full);
      Matrix4.multiply(full, node, full);
      for (let index = 0; index < 8; index++) {
        const corner = new Cartesian3(
          index & 1 ? max.x : min.x,
          index & 2 ? max.y : min.y,
          index & 4 ? max.z : min.z,
        );
        const world = Matrix4.multiplyByPoint(full, corner, new Cartesian3());
        expect(Cartesian3.distance(world, sphere.center)).toBeLessThanOrEqual(
          sphere.radius + 1e-6,
        );
        const inModel = Matrix4.multiplyByPoint(node, corner, new Cartesian3());
        Matrix4.multiplyByPoint(axis, inModel, inModel);
        Matrix4.multiplyByPoint(transform, inModel, inModel);
        Matrix4.multiplyByPoint(inverseAxis, inModel, inModel);
        expect(inModel.x).toBeGreaterThanOrEqual(modelMin.x - 1e-6);
        expect(inModel.y).toBeGreaterThanOrEqual(modelMin.y - 1e-6);
        expect(inModel.z).toBeGreaterThanOrEqual(modelMin.z - 1e-6);
        expect(inModel.x).toBeLessThanOrEqual(modelMax.x + 1e-6);
        expect(inModel.y).toBeLessThanOrEqual(modelMax.y + 1e-6);
        expect(inModel.z).toBeLessThanOrEqual(modelMax.z + 1e-6);
      }
    }
  });
});
