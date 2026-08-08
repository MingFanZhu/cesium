import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  EntityCollection,
  JulianDate,
  PolygonGraphics,
  PolygonHierarchy,
  PolylineGraphics,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneTransforms,
  _SceneGISPlanarPolygonVisualizer as SceneGISPlanarPolygonVisualizer,
  _SceneGISPlanarPolylineVisualizer as SceneGISPlanarPolylineVisualizer,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/DataSources/SceneGISPlanarGeometry", function () {
  let scene;

  beforeAll(function () {
    scene = createScene({ canvas: createCanvas(192, 192) });
  });

  afterAll(function () {
    scene.destroyForSpecs();
  });

  function square(centerX, centerY, halfSize, z = 0.0) {
    return [
      new Cartesian3(centerX - halfSize, centerY - halfSize, z),
      new Cartesian3(centerX + halfSize, centerY - halfSize, z),
      new Cartesian3(centerX + halfSize, centerY + halfSize, z),
      new Cartesian3(centerX - halfSize, centerY + halfSize, z),
    ];
  }

  function readRegion(position, radius = 2) {
    const windowPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      position,
    );
    const drawing = SceneTransforms.transformWindowToDrawingBuffer(
      scene,
      windowPosition,
      new Cartesian2(),
    );
    const width = radius * 2 + 1;
    return scene.context.readPixels({
      x: Math.max(
        0,
        Math.min(
          scene.drawingBufferWidth - width,
          Math.floor(drawing.x) - radius,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          scene.drawingBufferHeight - width,
          Math.floor(scene.drawingBufferHeight - drawing.y) - radius,
        ),
      ),
      width,
      height: width,
    });
  }

  function hasNonBlackPixel(region) {
    for (let i = 0; i < region.length; i += 4) {
      if (region[i] !== 0 || region[i + 1] !== 0 || region[i + 2] !== 0) {
        return true;
      }
    }
    return false;
  }

  it("renders, depths, picks, warms, and destroys large-offset line and polygon geometry", function () {
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
    const entities = new EntityCollection();
    const polyline = entities.add({
      id: "large-line",
      polyline: new PolylineGraphics({
        positions: [
          new Cartesian3(center - 65.0, center - 30.0, 20.0),
          new Cartesian3(center - 65.0, center + 30.0, 20.0),
        ],
        material: new ColorMaterialProperty(Color.RED),
        width: 8.0,
      }),
    });
    const polygon = entities.add({
      id: "hole-polygon",
      polygon: new PolygonGraphics({
        hierarchy: new PolygonHierarchy(square(center, center, 30.0), [
          new PolygonHierarchy(square(center, center, 8.0)),
        ]),
        height: 5.0,
        material: new ColorMaterialProperty(Color.LIME),
      }),
    });
    const extrusion = entities.add({
      id: "extrusion",
      polygon: new PolygonGraphics({
        hierarchy: new PolygonHierarchy(square(center + 65.0, center, 18.0)),
        height: 30.0,
        extrudedHeight: 0.0,
        material: new ColorMaterialProperty(Color.BLUE),
        outline: true,
        outlineColor: Color.WHITE,
        outlineWidth: 2.0,
      }),
    });
    const lineVisualizer = new SceneGISPlanarPolylineVisualizer(
      world,
      scene,
      entities,
    );
    const polygonVisualizer = new SceneGISPlanarPolygonVisualizer(
      world,
      scene,
      entities,
    );
    const time = JulianDate.fromIso8601("2026-08-09T00:00:00Z");
    const direction = Cartesian3.normalize(
      new Cartesian3(0.0, 180.0, -150.0),
      new Cartesian3(),
    );
    const right = Cartesian3.normalize(
      Cartesian3.cross(direction, Cartesian3.UNIT_Z, new Cartesian3()),
      new Cartesian3(),
    );
    const up = Cartesian3.cross(right, direction, new Cartesian3());
    scene.backgroundColor = Color.BLACK;
    scene.camera.setView({
      destination: new Cartesian3(center, center - 180.0, 150.0),
      orientation: { direction, up },
    });
    const primitiveBaseline = scene.primitives.length;

    function updateAndRender() {
      lineVisualizer.update(time);
      polygonVisualizer.update(time);
      scene.renderForSpecs();
    }

    try {
      updateAndRender();
      const lineOwner = lineVisualizer._items.get(polyline.id).owner;
      const polygonOwner = polygonVisualizer._items.get(polygon.id).owner;
      const extrusionOwner = polygonVisualizer._items.get(extrusion.id).owner;
      expect(lineOwner.collection.modelMatrix[12]).toBe(center - 65.0);
      expect(polygonOwner.fillCollection.modelMatrix[12]).toBe(center - 30.0);
      expect(extrusionOwner.fillPrimitive.vertexCount).toBe(8);
      expect(scene.primitives.length).toBeGreaterThan(primitiveBaseline);

      const fixtures = [
        {
          entity: polyline,
          position: new Cartesian3(center - 65.0, center, 20.0),
        },
        {
          entity: polygon,
          position: new Cartesian3(center - 18.0, center, 5.0),
        },
        {
          entity: extrusion,
          position: new Cartesian3(center + 65.0, center - 18.0, 15.0),
        },
      ];
      for (let i = 0; i < fixtures.length; i++) {
        const fixture = fixtures[i];
        expect(hasNonBlackPixel(readRegion(fixture.position))).toBe(true);
        const windowPosition = SceneTransforms.worldToWindowCoordinates(
          scene,
          fixture.position,
        );
        expect(scene.pick(windowPosition)?.id).toBe(fixture.entity);
      }

      const holeRegion = readRegion(new Cartesian3(center, center, 5.0), 0);
      expect(Array.from(holeRegion).slice(0, 3)).toEqual([0, 0, 0]);

      if (scene.pickPositionSupported && !window.webglStub) {
        const fillPosition = fixtures[1].position;
        const fillWindow = SceneTransforms.worldToWindowCoordinates(
          scene,
          fillPosition,
        );
        const depthPosition = scene.pickPosition(fillWindow);
        expect(depthPosition).toBeDefined();
        expect(Number.isFinite(depthPosition.x)).toBe(true);
        expect(Number.isFinite(depthPosition.y)).toBe(true);
        expect(Number.isFinite(depthPosition.z)).toBe(true);
        expect(depthPosition.x).toBeGreaterThan(center - 30.0);
        expect(depthPosition.x).toBeLessThan(center + 30.0);
        expect(depthPosition.y).toBeGreaterThan(center - 30.0);
        expect(depthPosition.y).toBeLessThan(center + 30.0);
        expect(depthPosition.z).toBeGreaterThanOrEqual(0.0);
        expect(depthPosition.z).toBeLessThan(10.0);
      }

      const lineContext = lineOwner.collection._renderContext;
      const polygonContext = polygonOwner.fillCollection._renderContext;
      const extrusionContext = extrusionOwner.fillCollection._renderContext;
      const lineCommand = lineContext.command;
      const lineVertexArray = lineContext.vertexArray;
      const polygonCommand = polygonContext.command;
      const polygonVertexArray = polygonContext.vertexArray;
      const lineAttributeCopy = spyOn(
        lineVertexArray,
        "copyAttributeFromRange",
      ).and.callThrough();
      const lineIndexCopy = spyOn(
        lineVertexArray,
        "copyIndexFromRange",
      ).and.callThrough();

      lineVisualizer.update(time);
      polygonVisualizer.update(time);
      const warmCollections = [
        lineOwner.collection,
        polygonOwner.fillCollection,
        extrusionOwner.fillCollection,
        extrusionOwner.outlineCollection,
      ];
      for (let i = 0; i < warmCollections.length; i++) {
        expect(warmCollections[i]._dirtyCount).toBe(0);
      }
      scene.renderForSpecs();
      expect(lineVisualizer._items.get(polyline.id).owner).toBe(lineOwner);
      expect(polygonVisualizer._items.get(polygon.id).owner).toBe(polygonOwner);
      expect(polygonVisualizer._items.get(extrusion.id).owner).toBe(
        extrusionOwner,
      );
      expect(lineOwner.collection._renderContext).toBe(lineContext);
      expect(polygonOwner.fillCollection._renderContext).toBe(polygonContext);
      expect(extrusionOwner.fillCollection._renderContext).toBe(
        extrusionContext,
      );
      expect(lineContext.command).toBe(lineCommand);
      expect(lineContext.vertexArray).toBe(lineVertexArray);
      expect(polygonContext.command).toBe(polygonCommand);
      expect(polygonContext.vertexArray).toBe(polygonVertexArray);
      expect(lineAttributeCopy).not.toHaveBeenCalled();
      expect(lineIndexCopy).not.toHaveBeenCalled();

      polyline.polyline.positions = [
        new Cartesian3(center - 65.0, center - 30.0, 20.0),
        new Cartesian3(center - 65.0, center + 25.0, 20.0),
      ];
      lineVisualizer.update(time);
      expect(lineVisualizer._items.get(polyline.id).owner).toBe(lineOwner);
      expect(lineOwner.collection._dirtyCount).toBeGreaterThan(0);
      expect(lineOwner.primitive.getPositions()[4]).toBe(55.0);
      scene.renderForSpecs();
      expect(lineAttributeCopy.calls.count()).toBeGreaterThan(0);

      const ownedCollections = [
        lineOwner.collection,
        polygonOwner.fillCollection,
        extrusionOwner.fillCollection,
        extrusionOwner.outlineCollection,
      ];
      for (let i = 0; i < ownedCollections.length; i++) {
        spyOn(ownedCollections[i], "destroy").and.callThrough();
      }
      lineVisualizer.destroy();
      polygonVisualizer.destroy();
      for (let i = 0; i < ownedCollections.length; i++) {
        expect(ownedCollections[i].destroy).toHaveBeenCalledTimes(1);
      }
      expect(scene.primitives.length).toBe(primitiveBaseline);
    } finally {
      if (!lineVisualizer.isDestroyed()) {
        lineVisualizer.destroy();
      }
      if (!polygonVisualizer.isDestroyed()) {
        polygonVisualizer.destroy();
      }
      world.destroy();
    }
  });
});
