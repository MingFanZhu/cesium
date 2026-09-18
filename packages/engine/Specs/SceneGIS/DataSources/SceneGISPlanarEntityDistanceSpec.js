import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  EntityCollection,
  HeightReference,
  JulianDate,
  PolygonHierarchy,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneTransforms,
  _SceneGISPlanarPolylineVisualizer as SceneGISPlanarPolylineVisualizer,
  _SceneGISPlanarPolygonVisualizer as SceneGISPlanarPolygonVisualizer,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/DataSources/SceneGISPlanarEntityDistance", function () {
  let scene;
  let visualizer;
  let collection;
  const time = JulianDate.fromIso8601("2026-09-18T00:00:00Z");

  beforeEach(function () {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -100,
          minimumY: -100,
          maximumX: 100,
          maximumY: 100,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.BLACK,
    });
    scene = createScene({
      canvas: createCanvas(128, 128),
      scene3DOnly: true,
    });
    scene._initializeWorld(world);
    scene.camera.setView({
      destination: new Cartesian3(0, 0, 100),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum.near = 0.1;
    collection = new EntityCollection();
  });

  afterEach(function () {
    visualizer?.destroy();
    visualizer = undefined;
    scene.destroyForSpecs();
  });

  function addGraphic(kind, ground) {
    const positions = [
      new Cartesian3(-20, -20, 4),
      new Cartesian3(20, -20, 4),
      new Cartesian3(20, 20, 4),
      new Cartesian3(-20, 20, 4),
    ];
    const Visualizer =
      kind === "polyline"
        ? SceneGISPlanarPolylineVisualizer
        : SceneGISPlanarPolygonVisualizer;
    visualizer = new Visualizer(scene.world, scene, collection);
    return collection.add({
      [kind]:
        kind === "polyline"
          ? {
              positions: [new Cartesian3(-20, 0, 4), new Cartesian3(20, 0, 4)],
              width: 8,
              material: Color.RED,
              clampToGround: ground,
            }
          : {
              hierarchy: new PolygonHierarchy(positions),
              height: 4,
              heightReference: ground
                ? HeightReference.CLAMP_TO_GROUND
                : HeightReference.NONE,
              material: Color.RED,
              outline: true,
              outlineWidth: 8,
              outlineColor: Color.BLUE,
            },
    });
  }

  function render() {
    visualizer.update(time);
    scene.renderForSpecs(time);
  }

  function owner(entity) {
    return visualizer._items.get(entity.id).owner;
  }

  function verifySample(entity, position, visible, channel) {
    const windowPosition = SceneTransforms.worldToWindowCoordinates(
      scene,
      position,
    );
    expect(scene.pick(windowPosition)?.id === entity).toBe(visible);
    // Render again because picking uses a separate framebuffer.
    scene.renderForSpecs(time);
    const pixelPosition = SceneTransforms.transformWindowToDrawingBuffer(
      scene,
      windowPosition,
      new Cartesian2(),
    );
    const pixel = scene.context.readPixels({
      x: Math.floor(pixelPosition.x),
      y: scene.drawingBufferHeight - 1 - Math.floor(pixelPosition.y),
      width: 1,
      height: 1,
    });
    expect(pixel[channel] > 100).toBe(visible);
  }

  ["polyline", "polygon"].forEach(function (kind) {
    [false, true].forEach(function (ground) {
      it(`renders and picks ${ground ? "ground" : "ordinary"} ${kind} with dynamic distance conditions`, function () {
        const entity = addGraphic(kind, ground);
        const graphic = entity[kind];
        const z = ground ? 0 : 4;
        const center = new Cartesian3(0, 0, z);
        render();
        const initial = owner(entity);
        verifySample(entity, center, true, 0);

        const condition = new DistanceDisplayCondition(0, 1000);
        graphic.distanceDisplayCondition = new CallbackProperty(
          () => condition,
          false,
        );
        render();
        const current = owner(entity);
        expect(current).not.toBe(initial);
        expect(initial.destroyed).toBeTrue();
        const resources = current.primitives.map((p) => ({
          primitive: p._current,
          va: p._current._va[0],
          command:
            p._currentCommands?.colorCommands[0] ??
            p._current._colorCommands[0],
        }));
        verifySample(entity, center, true, 0);
        if (kind === "polygon") {
          verifySample(entity, new Cartesian3(20, 0, z), true, 2);
        }

        condition.far = 1;
        render();
        verifySample(entity, center, false, 0);
        if (kind === "polygon") {
          verifySample(entity, new Cartesian3(20, 0, z), false, 2);
        }
        condition.near = 200;
        condition.far = 1000;
        render();
        verifySample(entity, center, false, 0);
        condition.near = 0;
        render();
        verifySample(entity, center, true, 0);
        expect(owner(entity)).toBe(current);
        current.primitives.forEach((p, i) => {
          expect(p._current).toBe(resources[i].primitive);
          expect(p._current._va[0]).toBe(resources[i].va);
          expect(resources[i].command).toBeDefined();
          expect(
            p._currentCommands?.colorCommands[0] ??
              p._current._colorCommands[0],
          ).toBe(resources[i].command);
        });

        condition.near = -1;
        expect(() => visualizer.update(time)).toThrowDeveloperError();
        expect(owner(entity)).toBe(current);
        condition.near = 0;
        graphic.distanceDisplayCondition = undefined;
        render();
        expect(current.destroyed).toBeTrue();
        verifySample(entity, center, true, 0);

        const finalOwner = owner(entity);
        collection.remove(entity);
        render();
        expect(finalOwner.destroyed).toBeTrue();
        expect(scene.primitives.length).toBe(0);
      });
    });

    it(`updates pending ${kind} conditions and accepts the native default far distance`, function () {
      const entity = addGraphic(kind, false);
      entity[kind].distanceDisplayCondition = new DistanceDisplayCondition();
      visualizer.update(time);
      const first = owner(entity);
      entity[kind].distanceDisplayCondition = new DistanceDisplayCondition(
        0,
        1,
      );
      visualizer.update(time);
      expect(first.destroyed).toBeTrue();
      render();
      verifySample(entity, new Cartesian3(0, 0, 4), false, 0);
      entity[kind].distanceDisplayCondition = new DistanceDisplayCondition();
      render();
      verifySample(entity, new Cartesian3(0, 0, 4), true, 0);
    });
  });
});
