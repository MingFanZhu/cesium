import BillboardGraphics from "../../../../Source/DataSources/BillboardGraphics.js";
import BoundingSphere from "../../../../Source/Core/BoundingSphere.js";
import BoundingSphereState from "../../../../Source/DataSources/BoundingSphereState.js";
import Cartesian2 from "../../../../Source/Core/Cartesian2.js";
import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Color from "../../../../Source/Core/Color.js";
import ConstantPositionProperty from "../../../../Source/DataSources/ConstantPositionProperty.js";
import ConstantProperty from "../../../../Source/DataSources/ConstantProperty.js";
import EntityCluster from "../../../../Source/DataSources/EntityCluster.js";
import EntityCollection from "../../../../Source/DataSources/EntityCollection.js";
import HeightReference from "../../../../Source/Scene/HeightReference.js";
import JulianDate from "../../../../Source/Core/JulianDate.js";
import LabelGraphics from "../../../../Source/DataSources/LabelGraphics.js";
import NearFarScalar from "../../../../Source/Core/NearFarScalar.js";
import PointGraphics from "../../../../Source/DataSources/PointGraphics.js";
import SceneGISPlanarAnchorVisualizer from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarAnchorVisualizer.js";
import SceneGISPlanarCoordinateSystem from "../../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarWorld from "../../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";
import createScene from "../../../../../../Specs/createScene.js";

describe("SceneGIS/DataSources/SceneGISPlanarAnchorVisualizer", function () {
  let world;
  let scene;
  let cluster;
  let collection;
  let visualizer;
  const time = JulianDate.fromIso8601("2026-08-09T00:00:00Z");

  beforeAll(function () {
    scene = createScene();
  });

  afterAll(function () {
    scene.destroyForSpecs();
  });

  beforeEach(function () {
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -10.0,
          minimumY: -10.0,
          maximumX: 10.0,
          maximumY: 10.0,
        }),
      }),
      maximumLevel: 1,
    });
    cluster = new EntityCluster();
    collection = new EntityCollection();
  });

  afterEach(function () {
    if (visualizer !== undefined && !visualizer.isDestroyed()) {
      visualizer.destroy();
    }
    cluster.destroy();
    if (!world.isDestroyed()) {
      world.destroy();
    }
  });

  function createVisualizer() {
    visualizer = new SceneGISPlanarAnchorVisualizer(
      world,
      scene,
      cluster,
      collection,
    );
  }

  it("rejects enabled clustering before subscription or slot mutation", function () {
    cluster.enabled = true;
    expect(function () {
      return new SceneGISPlanarAnchorVisualizer(
        world,
        scene,
        cluster,
        collection,
      );
    }).toThrowDeveloperError();
    expect(collection.collectionChanged.numberOfListeners).toBe(0);
    expect(cluster._pointCollection).toBeUndefined();
  });

  it("rejects clustering enabled after construction without mutating slots", function () {
    const entity = collection.add({
      id: "cluster-toggle",
      position: new Cartesian3(1.0, 2.0, 3.0),
      point: new PointGraphics({ pixelSize: 4.0 }),
    });
    createVisualizer();
    visualizer.update(time);
    const point = visualizer._items.get(entity.id).point;
    const listenerCount = collection.collectionChanged.numberOfListeners;

    entity.point.pixelSize = 12.0;
    cluster.enabled = true;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).point).toBe(point);
    expect(point.pixelSize).toBe(4.0);
    expect(point.id).toBe(entity);
    expect(point.show).toBe(true);
    expect(collection.collectionChanged.numberOfListeners).toBe(listenerCount);

    cluster.enabled = false;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).point).toBe(point);
    expect(point.pixelSize).toBe(12.0);
  });

  it("creates independent point, billboard, and label slots with original ids", function () {
    const entity = collection.add({
      id: "all",
      position: new Cartesian3(2.0, 3.0, 4.0),
      point: new PointGraphics({
        pixelSize: 9.0,
        color: Color.CYAN,
        outlineWidth: 2.0,
      }),
      billboard: new BillboardGraphics({
        image: "data:image/png;base64,iVBORw0KGgo=",
        pixelOffset: new Cartesian2(2.0, 1.0),
        alignedAxis: Cartesian3.UNIT_X,
      }),
      label: new LabelGraphics({
        text: "planar",
        fillColor: Color.YELLOW,
        showBackground: true,
      }),
    });
    createVisualizer();

    visualizer.update(time);

    const item = visualizer._items.get(entity.id);
    expect(item.point.id).toBe(entity);
    expect(item.billboard.id).toBe(entity);
    expect(item.label.id).toBe(entity);
    expect(item.point.pixelSize).toBe(9.0);
    expect(item.billboard.alignedAxis).toEqual(Cartesian3.UNIT_X);
    expect(item.billboard.heightReference).toBe(HeightReference.NONE);
    expect(item.label.heightReference).toBe(HeightReference.NONE);
    expect(item.point).not.toBe(item.billboard);
    expect(item.billboard).not.toBe(item.label);
  });

  it("resolves all height modes while point remains a PointPrimitive", function () {
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValue(20.0);
    const entity = collection.add({
      id: "height",
      position: new Cartesian3(1.0, 1.0, 5.0),
      point: new PointGraphics({
        heightReference: HeightReference.CLAMP_TO_GROUND,
      }),
      label: new LabelGraphics({
        text: "relative",
        heightReference: HeightReference.RELATIVE_TO_GROUND,
      }),
      billboard: new BillboardGraphics({
        image: "data:image/png;base64,iVBORw0KGgo=",
        heightReference: HeightReference.NONE,
      }),
    });
    createVisualizer();
    visualizer.update(time);
    const item = visualizer._items.get(entity.id);

    expect(item.point.position.z).toBe(20.0);
    expect(item.label.position.z).toBe(25.0);
    expect(item.billboard.position.z).toBe(5.0);
    expect(cluster._billboardCollection.length).toBe(1);
    expect(cluster._pointCollection.length).toBe(1);
  });

  it("retains slots while hidden, undefined, or outside and updates dynamics", function () {
    const position = new ConstantPositionProperty(
      new Cartesian3(0.0, 0.0, 0.0),
    );
    const show = new ConstantProperty(true);
    const entity = collection.add({
      id: "dynamic",
      position,
      point: new PointGraphics({ show, pixelSize: 4.0 }),
    });
    createVisualizer();
    visualizer.update(time);
    const point = visualizer._items.get(entity.id).point;

    show.setValue(false);
    visualizer.update(time);
    expect(point.show).toBe(false);
    show.setValue(true);
    position.setValue(new Cartesian3(11.0, 0.0, 0.0));
    visualizer.update(time);
    expect(point.show).toBe(false);
    position.setValue(new Cartesian3(10.0, -10.0, 0.0));
    entity.point.pixelSize = 12.0;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).point).toBe(point);
    expect(point.show).toBe(true);
    expect(point.pixelSize).toBe(12.0);
  });

  it("releases only removed graphics and keeps the caller-owned cluster live", function () {
    const entity = collection.add({
      id: "release",
      position: new Cartesian3(),
      point: new PointGraphics(),
      label: new LabelGraphics({ text: "x" }),
    });
    createVisualizer();
    visualizer.update(time);
    const label = visualizer._items.get(entity.id).label;
    entity.point = undefined;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).point).toBeUndefined();
    expect(visualizer._items.get(entity.id).label).toBe(label);

    const listenerCount = collection.collectionChanged.numberOfListeners;
    visualizer.destroy();
    visualizer = undefined;
    expect(collection.collectionChanged.numberOfListeners).toBe(
      listenerCount - 1,
    );
    expect(cluster._pointCollection).toBeDefined();
    expect(label.id).toBeUndefined();
  });

  it("reinitializes a released billboard when the same image is re-added", function () {
    const image = document.createElement("canvas");
    image.width = 2;
    image.height = 2;
    const entity = collection.add({
      id: "billboard-release",
      position: new Cartesian3(),
      point: new PointGraphics({ pixelSize: 3.0 }),
      billboard: new BillboardGraphics({ image }),
    });
    createVisualizer();
    visualizer.update(time);
    const item = visualizer._items.get(entity.id);
    const point = item.point;
    const firstBillboard = item.billboard;
    const firstImageId = firstBillboard.image;

    entity.billboard = undefined;
    visualizer.update(time);
    expect(item.billboard).toBeUndefined();
    expect(item.billboardImage).toBeUndefined();

    entity.billboard = new BillboardGraphics({ image });
    visualizer.update(time);
    expect(item.billboard).toBe(firstBillboard);
    expect(item.billboardImage).toBe(image);
    expect(item.billboard.image).toBeDefined();
    expect(item.billboard.image).not.toBe(firstImageId);
    expect(item.billboard.id).toBe(entity);
    expect(item.billboard.show).toBe(true);
    expect(item.point).toBe(point);
  });

  it("returns a zero-radius sphere and preserves warm slot identity", function () {
    const entity = collection.add({
      id: "sphere",
      position: new Cartesian3(3.0, 4.0, 5.0),
      point: new PointGraphics(),
    });
    createVisualizer();
    visualizer.update(time);
    const point = visualizer._items.get(entity.id).point;
    visualizer.update(time);
    expect(visualizer._items.get(entity.id).point).toBe(point);
    const sphere = new BoundingSphere();
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.DONE,
    );
    expect(sphere.center).toEqual(new Cartesian3(3.0, 4.0, 5.0));
    expect(sphere.radius).toBe(0.0);
  });

  it("bounds every visible anchor slot and fails when none are visible", function () {
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValue(20.0);
    const entity = collection.add({
      id: "combined-sphere",
      position: new Cartesian3(1.0, 2.0, -10.0),
      point: new PointGraphics({
        heightReference: HeightReference.CLAMP_TO_GROUND,
      }),
      billboard: new BillboardGraphics({
        image: "data:image/png;base64,iVBORw0KGgo=",
        heightReference: HeightReference.NONE,
      }),
      label: new LabelGraphics({
        text: "relative",
        heightReference: HeightReference.RELATIVE_TO_GROUND,
      }),
    });
    createVisualizer();
    visualizer.update(time);
    const sphere = new BoundingSphere();
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.DONE,
    );
    expect(sphere.center).toEqual(new Cartesian3(1.0, 2.0, 5.0));
    expect(sphere.radius).toBe(15.0);

    entity.point.show = false;
    visualizer.update(time);
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.DONE,
    );
    expect(sphere.center).toEqual(new Cartesian3(1.0, 2.0, 0.0));
    expect(sphere.radius).toBe(10.0);

    entity.billboard.show = false;
    visualizer.update(time);
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.DONE,
    );
    expect(sphere.center).toEqual(new Cartesian3(1.0, 2.0, 10.0));
    expect(sphere.radius).toBe(0.0);

    entity.label.show = false;
    visualizer.update(time);
    expect(visualizer.getBoundingSphere(entity, sphere)).toBe(
      BoundingSphereState.FAILED,
    );
  });

  it("allows infinite depth-test distance and rejects invalid bounds atomically", function () {
    const originalScale = new NearFarScalar(1.0, 1.0, 10.0, 0.5);
    const entity = collection.add({
      id: "mapped-values",
      position: new Cartesian3(),
      point: new PointGraphics({
        pixelSize: 4.0,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: originalScale,
      }),
    });
    createVisualizer();
    visualizer.update(time);
    const point = visualizer._items.get(entity.id).point;
    expect(point.disableDepthTestDistance).toBe(Number.POSITIVE_INFINITY);
    expect(point.scaleByDistance).toEqual(originalScale);

    entity.point.pixelSize = 12.0;
    entity.point.scaleByDistance = new NearFarScalar(10.0, 1.0, 5.0, 0.5);
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(visualizer._items.get(entity.id).point).toBe(point);
    expect(point.pixelSize).toBe(4.0);
    expect(point.scaleByDistance).toEqual(originalScale);
    expect(point.disableDepthTestDistance).toBe(Number.POSITIVE_INFINITY);
  });

  it("fails invalid mapped values before acquiring a slot", function () {
    const entity = collection.add({
      id: "invalid",
      position: new Cartesian3(),
      point: new PointGraphics({ pixelSize: Number.NaN }),
    });
    createVisualizer();
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(cluster._pointCollection).toBeUndefined();

    entity.point.pixelSize = 3.0;
    entity.point.heightReference = HeightReference.CLAMP_TO_3D_TILE;
    expect(function () {
      visualizer.update(time);
    }).toThrowDeveloperError();
    expect(cluster._pointCollection).toBeUndefined();
  });
});
