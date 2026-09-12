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
    scene.frameState.scene3DOnly = true;
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
      expect(lineOwner.primitive.geometry.origin.x).toBe(center - 65.0);
      expect(polygonOwner.fillPrimitive.geometry.origin.x).toBe(center - 30.0);
      expect(
        extrusionOwner.fillPrimitive.geometry._bottomPositions.length,
      ).toBe(4);
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
        const picked = scene.pick(windowPosition);
        expect(picked?.id).toBe(fixture.entity);
        expect(picked?.primitive).toBeInstanceOf(
          lineOwner.primitive.constructor,
        );
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

      const lineInternal = lineOwner.primitive._current;
      const polygonInternal = polygonOwner.fillPrimitive._current;
      const extrusionInternal = extrusionOwner.fillPrimitive._current;
      const lineCommand = lineInternal._colorCommands[0];
      const lineVertexArray = lineInternal._va[0];
      const polygonCommand = polygonInternal._colorCommands[0];
      const polygonVertexArray = polygonInternal._va[0];

      lineVisualizer.update(time);
      polygonVisualizer.update(time);
      scene.renderForSpecs();
      expect(lineVisualizer._items.get(polyline.id).owner).toBe(lineOwner);
      expect(polygonVisualizer._items.get(polygon.id).owner).toBe(polygonOwner);
      expect(polygonVisualizer._items.get(extrusion.id).owner).toBe(
        extrusionOwner,
      );
      expect(lineOwner.primitive._current).toBe(lineInternal);
      expect(polygonOwner.fillPrimitive._current).toBe(polygonInternal);
      expect(extrusionOwner.fillPrimitive._current).toBe(extrusionInternal);
      expect(lineInternal._colorCommands[0]).toBe(lineCommand);
      expect(lineInternal._va[0]).toBe(lineVertexArray);
      expect(polygonInternal._colorCommands[0]).toBe(polygonCommand);
      expect(polygonInternal._va[0]).toBe(polygonVertexArray);

      polyline.polyline.positions = [
        new Cartesian3(center - 65.0, center - 30.0, 20.0),
        new Cartesian3(center - 65.0, center + 25.0, 20.0),
      ];
      lineVisualizer.update(time);
      const changedLineOwner = lineVisualizer._items.get(polyline.id).owner;
      expect(changedLineOwner).not.toBe(lineOwner);
      expect(lineOwner.destroyed).toBeTrue();
      expect(changedLineOwner.primitive.geometry.positions[1].y).toBe(
        center + 25.0,
      );
      scene.renderForSpecs();

      const ownedPrimitives = [
        ...changedLineOwner.primitives,
        ...polygonOwner.primitives,
        ...extrusionOwner.primitives,
      ];
      const destroySpies = ownedPrimitives.map((primitive) =>
        spyOn(primitive, "destroy").and.callThrough(),
      );
      lineVisualizer.destroy();
      polygonVisualizer.destroy();
      for (let i = 0; i < ownedPrimitives.length; i++) {
        expect(destroySpies[i]).toHaveBeenCalledTimes(1);
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
