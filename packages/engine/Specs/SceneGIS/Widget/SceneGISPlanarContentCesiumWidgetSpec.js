import {
  ApproximateTerrainHeights,
  BillboardGraphics,
  BoxGraphics,
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  ColorMaterialProperty,
  CorridorGraphics,
  CustomDataSource,
  LabelGraphics,
  PointGraphics,
  PolygonGraphics,
  PolygonHierarchy,
  PolylineGraphics,
  Rectangle,
  RectangleGraphics,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneTransforms,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";

describe("SceneGIS/Widget/SceneGISPlanarContentCesiumWidget", function () {
  let container;
  let widget;

  function createWorld() {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        }),
      }),
      maximumLevel: 1,
      baseColor: Color.BLACK,
    });
  }

  function createWidget(options) {
    const contextOptions = { webgl: {} };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    return new CesiumWidget(container, {
      useDefaultRenderLoop: false,
      contextOptions,
      ...options,
    });
  }

  beforeAll(async function () {
    await ApproximateTerrainHeights.initialize();
  });

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "64px";
    container.style.height = "64px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    document.body.removeChild(container);
  });

  it("activates planar content for widget.entities and preserves original picking", function () {
    widget = createWidget({ world: createWorld() });
    widget.resize();
    const visualizers = widget.dataSourceDisplay.defaultDataSource._visualizers;
    expect(visualizers.length).toBe(1);
    const entity = widget.entities.add({
      id: "automatic-point",
      position: new Cartesian3(0.0, 0.0, 10.0),
      point: new PointGraphics({ pixelSize: 20.0, color: Color.RED }),
    });
    widget.scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 64.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });

    widget.render();
    expect(visualizers.length).toBe(7);
    widget.render();
    const anchorItem = visualizers[1]._items.get(entity.id);
    expect(anchorItem.point.id).toBe(entity);
    expect(anchorItem.point.position).toEqual(new Cartesian3(0.0, 0.0, 10.0));

    if (!window.webglStub) {
      const windowPosition = SceneTransforms.worldToWindowCoordinates(
        widget.scene,
        anchorItem.point.position,
        new Cartesian2(),
      );
      expect(widget.scene.pick(windowPosition)?.id).toBe(entity);
      const pixels = widget.scene.context.readPixels();
      expect(pixels.some((component) => component !== 0)).toBe(true);
    }
  });

  it("targets each CustomDataSource primitive container and cleans on removal", async function () {
    widget = createWidget({ world: createWorld() });
    const dataSource = new CustomDataSource("ordered-planar-content-a");
    const secondDataSource = new CustomDataSource("ordered-planar-content-b");
    const image = document.createElement("canvas");
    image.width = 4;
    image.height = 4;
    dataSource.entities.add({
      id: "anchors",
      position: new Cartesian3(-40.0, 0.0, 4.0),
      billboard: new BillboardGraphics({ image, width: 8.0, height: 8.0 }),
      label: new LabelGraphics({ text: "C4" }),
    });
    const polyline = dataSource.entities.add({
      id: "polyline",
      polyline: new PolylineGraphics({
        positions: [
          new Cartesian3(-20.0, -20.0, 2.0),
          new Cartesian3(20.0, -20.0, 2.0),
        ],
        material: new ColorMaterialProperty(Color.CYAN),
        width: 2,
      }),
    });
    const polygon = dataSource.entities.add({
      id: "polygon",
      polygon: new PolygonGraphics({
        hierarchy: new PolygonHierarchy([
          new Cartesian3(-10.0, 0.0, 3.0),
          new Cartesian3(10.0, 0.0, 3.0),
          new Cartesian3(10.0, 20.0, 3.0),
          new Cartesian3(-10.0, 20.0, 3.0),
        ]),
        material: new ColorMaterialProperty(Color.LIME),
      }),
    });
    const box = dataSource.entities.add({
      id: "box",
      position: new Cartesian3(40, -10, 8),
      box: new BoxGraphics({ dimensions: new Cartesian3(8, 10, 12) }),
    });
    const rectangle = dataSource.entities.add({
      id: "rectangle",
      rectangle: new RectangleGraphics({
        coordinates: new Rectangle(30, 5, 50, 25),
        height: 3,
      }),
    });
    await widget.dataSources.add(dataSource);
    await widget.dataSources.add(secondDataSource);
    widget.dataSourceDisplay.update(widget.clock.currentTime);
    widget.dataSourceDisplay.update(widget.clock.currentTime);

    expect(dataSource._visualizers.length).toBe(7);
    expect(dataSource._visualizers[2]._primitives).toBe(dataSource._primitives);
    expect(dataSource._visualizers[3]._primitives).toBe(dataSource._primitives);
    expect(dataSource._visualizers[4]._primitives).toBe(dataSource._primitives);
    expect(dataSource._visualizers[5]._primitives).toBe(dataSource._primitives);
    expect(dataSource._visualizers[6]._primitives).toBe(dataSource._primitives);
    const anchorItem = dataSource._visualizers[1]._items.get("anchors");
    const polylineOwner = dataSource._visualizers[3]._items.get(
      polyline.id,
    ).owner;
    const polygonOwner = dataSource._visualizers[4]._items.get(
      polygon.id,
    ).owner;
    const boxOwner = dataSource._visualizers[5]._items.get(box.id).owners.box;
    const rectangleOwner = dataSource._visualizers[6]._items.get(rectangle.id)
      .owners.rectangle;
    expect(anchorItem.billboard).toBeDefined();
    expect(anchorItem.label).toBeDefined();
    expect(polylineOwner).toBeDefined();
    expect(polygonOwner).toBeDefined();
    expect(boxOwner).toBeDefined();
    expect(rectangleOwner).toBeDefined();
    expect(dataSource._primitives.contains(polylineOwner.collections[0])).toBe(
      true,
    );
    expect(dataSource._primitives.contains(polygonOwner.collections[0])).toBe(
      true,
    );
    expect(dataSource._primitives.contains(boxOwner.collections[0])).toBe(true);
    expect(dataSource._primitives.contains(rectangleOwner.collections[0])).toBe(
      true,
    );
    expect(widget.scene.primitives.contains(polylineOwner.collections[0])).toBe(
      false,
    );
    expect(widget.scene.primitives.contains(polygonOwner.collections[0])).toBe(
      false,
    );

    const displayPrimitives = widget.dataSourceDisplay._primitives;
    function indexOfPrimitive(primitive) {
      for (let i = 0; i < displayPrimitives.length; i++) {
        if (displayPrimitives.get(i) === primitive) {
          return i;
        }
      }
      return -1;
    }
    expect(indexOfPrimitive(dataSource._primitives)).toBeLessThan(
      indexOfPrimitive(secondDataSource._primitives),
    );
    widget.dataSources.raise(dataSource);
    expect(indexOfPrimitive(dataSource._primitives)).toBeGreaterThan(
      indexOfPrimitive(secondDataSource._primitives),
    );
    expect(dataSource._visualizers[3]._items.get(polyline.id).owner).toBe(
      polylineOwner,
    );
    expect(dataSource._visualizers[4]._items.get(polygon.id).owner).toBe(
      polygonOwner,
    );
    expect(dataSource._visualizers[5]._items.get(box.id).owners.box).toBe(
      boxOwner,
    );
    expect(
      dataSource._visualizers[6]._items.get(rectangle.id).owners.rectangle,
    ).toBe(rectangleOwner);

    const children = dataSource._visualizers.slice();
    const childDestroy = children.map((child) =>
      spyOn(child, "destroy").and.callThrough(),
    );
    expect(widget.dataSources.remove(dataSource)).toBe(true);
    expect(dataSource._visualizers).toBeUndefined();
    for (let i = 0; i < children.length; i++) {
      expect(childDestroy[i]).toHaveBeenCalledTimes(1);
      expect(children[i].isDestroyed()).toBe(true);
    }
    expect(polylineOwner.destroyed).toBe(true);
    expect(polygonOwner.destroyed).toBe(true);
    expect(boxOwner.destroyed).toBe(true);
    expect(rectangleOwner.destroyed).toBe(true);
    expect(widget.dataSources.remove(secondDataSource)).toBe(true);
  });

  it("rejects dynamic unsupported graphics before child updates and resource mutation", function () {
    widget = createWidget({ world: createWorld() });
    widget.dataSourceDisplay.update(widget.clock.currentTime);
    const visualizers = widget.dataSourceDisplay.defaultDataSource._visualizers;
    const childUpdates = visualizers
      .slice(1)
      .map((visualizer) => spyOn(visualizer, "update").and.callThrough());
    const primitiveBaseline =
      widget.dataSourceDisplay.defaultDataSource._primitives.length;
    const entity = widget.entities.add({
      id: "mixed-point-corridor",
      position: new Cartesian3(0.0, 0.0, 1.0),
      point: new PointGraphics({ pixelSize: 8.0, color: Color.RED }),
      corridor: new CorridorGraphics({
        positions: [Cartesian3.ZERO, Cartesian3.UNIT_X],
        width: 1,
      }),
    });
    const anchorItem = visualizers[1]._items.get(entity.id);
    expect(anchorItem).toBeDefined();
    expect(anchorItem.point).toBeUndefined();
    expect(anchorItem.billboard).toBeUndefined();
    expect(anchorItem.label).toBeUndefined();
    expect(visualizers[2]._items.get(entity.id)).toBeUndefined();
    expect(visualizers[3]._items.get(entity.id)).toBeUndefined();
    expect(visualizers[4]._items.get(entity.id)).toBeUndefined();
    expect(visualizers[5]._items.get(entity.id)).toBeUndefined();
    expect(visualizers[6]._items.get(entity.id)).toBeUndefined();
    expect(widget.dataSourceDisplay.defaultDataSource._primitives.length).toBe(
      primitiveBaseline,
    );

    expect(function () {
      widget.dataSourceDisplay.update(widget.clock.currentTime);
    }).toThrowDeveloperError();
    for (let i = 0; i < childUpdates.length; i++) {
      expect(childUpdates[i]).not.toHaveBeenCalled();
    }
    expect(anchorItem.point).toBeUndefined();
    expect(anchorItem.billboard).toBeUndefined();
    expect(anchorItem.label).toBeUndefined();
    expect(widget.dataSourceDisplay.defaultDataSource._primitives.length).toBe(
      primitiveBaseline,
    );
  });

  it("preserves Cesium default visualizers when no planar world is supplied", function () {
    widget = createWidget({ globe: false });
    const visualizers = widget.dataSourceDisplay.defaultDataSource._visualizers;
    expect(visualizers.length).toBeGreaterThan(1);
    expect(visualizers[0].constructor.name).toContain("BillboardVisualizer");
  });
});
