import {
  BillboardGraphics,
  Cartesian2,
  Cartesian3,
  Color,
  EntityCluster,
  EntityCollection,
  HeightReference,
  JulianDate,
  LabelGraphics,
  ModelGraphics,
  PointGraphics,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneTransforms,
  _SceneGISPlanarAnchorVisualizer as SceneGISPlanarAnchorVisualizer,
  _SceneGISPlanarModelVisualizer as SceneGISPlanarModelVisualizer,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/DataSources/SceneGISPlanarContentVisualizer", function () {
  const modelUrl = "./Data/Models/glTF-2.0/BoxTextured/glTF/BoxTextured.gltf";
  let scene;

  beforeAll(function () {
    scene = createScene({ canvas: createCanvas(128, 128) });
  });

  afterAll(function () {
    scene.destroyForSpecs();
  });

  it("renders and picks four planar content types at a large offset", async function () {
    const gl = scene.context._gl;
    const supportsAnchorInstancing =
      !!scene.context.instancedArrays &&
      gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;
    const center = 20037508.0;
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: center - 128.0,
          minimumY: center - 128.0,
          maximumX: center + 128.0,
          maximumY: center + 128.0,
        }),
        crs: "EPSG:3857",
      }),
      maximumLevel: 2,
    });
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValue(12.0);
    const collection = new EntityCollection();
    const cluster = new EntityCluster();
    const collectionListenerBaseline =
      collection.collectionChanged.numberOfListeners;
    const cameraListenerBaseline = scene.camera.changed.numberOfListeners;
    const anchorVisualizer = new SceneGISPlanarAnchorVisualizer(
      world,
      scene,
      cluster,
      collection,
    );
    const modelVisualizer = new SceneGISPlanarModelVisualizer(
      world,
      scene,
      collection,
    );
    const time = JulianDate.fromIso8601("2026-08-09T00:00:00Z");
    const image = document.createElement("canvas");
    image.width = 16;
    image.height = 16;
    const context = image.getContext("2d");
    context.fillStyle = "#00ffff";
    context.fillRect(0, 0, 16, 16);

    const point = collection.add({
      id: "point",
      position: new Cartesian3(center - 70.0, center, 5.0),
      point: new PointGraphics({
        pixelSize: 20.0,
        color: Color.RED,
        heightReference: HeightReference.RELATIVE_TO_GROUND,
      }),
    });
    const billboard = collection.add({
      id: "billboard",
      position: new Cartesian3(center - 25.0, center, 0.0),
      billboard: new BillboardGraphics({ image, width: 20.0, height: 20.0 }),
    });
    const label = collection.add({
      id: "label",
      position: new Cartesian3(center + 25.0, center, 0.0),
      label: new LabelGraphics({
        text: "C2",
        font: "24px sans-serif",
        fillColor: Color.YELLOW,
        showBackground: true,
        backgroundColor: Color.BLUE,
      }),
    });
    const model = collection.add({
      id: "model",
      position: new Cartesian3(center + 70.0, center, 5.0),
      model: new ModelGraphics({
        uri: modelUrl,
        scale: 8.0,
        minimumPixelSize: 20.0,
        heightReference: HeightReference.RELATIVE_TO_GROUND,
      }),
    });

    const clusterPrimitive = {
      show: true,
      update: function (frameState) {
        cluster.update(frameState);
      },
      isDestroyed: function () {
        return false;
      },
      destroy: function () {},
    };
    if (supportsAnchorInstancing) {
      scene.primitives.add(clusterPrimitive);
    }
    expect(collection.collectionChanged.numberOfListeners).toBe(
      collectionListenerBaseline + 2,
    );
    expect(scene.camera.changed.numberOfListeners).toBe(
      cameraListenerBaseline + 1,
    );
    scene.camera.setView({
      destination: new Cartesian3(center, center, 160.0),
      orientation: {
        direction: Cartesian3.negate(Cartesian3.UNIT_Z, new Cartesian3()),
        up: Cartesian3.UNIT_Y,
      },
    });

    function updateAndRender() {
      anchorVisualizer.update(time);
      modelVisualizer.update(time);
      scene.renderForSpecs();
    }

    try {
      await pollToPromise(function () {
        updateAndRender();
        const item = modelVisualizer._items.get(model.id);
        return (
          item?.model?.ready === true &&
          (!supportsAnchorInstancing || cluster.ready)
        );
      });
      updateAndRender();

      const anchorItem = anchorVisualizer._items.get(point.id);
      const modelItem = modelVisualizer._items.get(model.id);
      expect(anchorItem.point.position.z).toBe(17.0);
      expect(modelItem.model.modelMatrix[14]).toBe(17.0);
      expect(Number.isFinite(modelItem.model.boundingSphere.radius)).toBe(true);

      const modelWindowPosition = SceneTransforms.worldToWindowCoordinates(
        scene,
        new Cartesian3(center + 70.0, center, 17.0),
      );
      const modelDrawingPosition =
        SceneTransforms.transformWindowToDrawingBuffer(
          scene,
          modelWindowPosition,
          new Cartesian2(),
        );
      const readX = Math.max(
        0,
        Math.min(
          scene.drawingBufferWidth - 9,
          Math.floor(modelDrawingPosition.x) - 4,
        ),
      );
      const readY = Math.max(
        0,
        Math.min(
          scene.drawingBufferHeight - 9,
          Math.floor(scene.drawingBufferHeight - modelDrawingPosition.y) - 4,
        ),
      );
      const region = scene.context.readPixels({
        x: readX,
        y: readY,
        width: 9,
        height: 9,
      });
      let hasRenderedPixel = false;
      for (let i = 0; i < region.length; i += 4) {
        if (region[i] !== 0 || region[i + 1] !== 0 || region[i + 2] !== 0) {
          hasRenderedPixel = true;
          break;
        }
      }
      expect(hasRenderedPixel).toBe(true);

      const pickFixtures = [
        {
          entity: point,
          position: anchorItem.point.position,
          requiresInstancing: true,
        },
        {
          entity: billboard,
          position: anchorVisualizer._items.get(billboard.id).billboard
            .position,
          requiresInstancing: true,
        },
        {
          entity: label,
          position: anchorVisualizer._items.get(label.id).label.position,
          requiresInstancing: true,
        },
        {
          entity: model,
          position: new Cartesian3(center + 70.0, center, 17.0),
        },
      ];
      for (let i = 0; i < pickFixtures.length; i++) {
        const fixture = pickFixtures[i];
        if (fixture.requiresInstancing && !supportsAnchorInstancing) {
          continue;
        }
        const windowPosition = SceneTransforms.worldToWindowCoordinates(
          scene,
          fixture.position,
        );
        expect(Number.isFinite(windowPosition.x)).toBe(true);
        expect(Number.isFinite(windowPosition.y)).toBe(true);
        expect(
          scene.pick(windowPosition)?.id ?? scene.pick(windowPosition),
        ).toBe(fixture.entity);
      }

      const pointSlot = anchorItem.point;
      const activeModel = modelItem.model;
      updateAndRender();
      updateAndRender();
      expect(anchorVisualizer._items.get(point.id).point).toBe(pointSlot);
      expect(modelVisualizer._items.get(model.id).model).toBe(activeModel);
    } finally {
      const pointSlot = anchorVisualizer._items.get(point.id)?.point;
      const billboardSlot = anchorVisualizer._items.get(
        billboard.id,
      )?.billboard;
      const labelSlot = anchorVisualizer._items.get(label.id)?.label;
      const activeModel = modelVisualizer._items.get(model.id)?.model;
      anchorVisualizer.destroy();
      modelVisualizer.destroy();
      expect(collection.collectionChanged.numberOfListeners).toBe(
        collectionListenerBaseline,
      );
      expect(pointSlot?.id).toBeUndefined();
      expect(billboardSlot?.id).toBeUndefined();
      expect(labelSlot?.id).toBeUndefined();
      expect(cluster._scene).toBe(scene);
      expect(scene.camera.changed.numberOfListeners).toBe(
        cameraListenerBaseline + 1,
      );
      if (activeModel !== undefined) {
        expect(activeModel.isDestroyed()).toBe(true);
      }
      if (supportsAnchorInstancing) {
        scene.primitives.remove(clusterPrimitive);
      }
      cluster.destroy();
      expect(scene.camera.changed.numberOfListeners).toBe(
        cameraListenerBaseline,
      );
      world.destroy();
    }
  });
});
