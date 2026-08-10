import {
  ApproximateTerrainHeights,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  CorridorGraphics,
  CustomDataSource,
  Event,
  HeightReference,
  PointGraphics,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneTransforms,
  ScreenSpaceEventType,
} from "@cesium/engine";
import createViewer from "../createViewer.js";

describe("SceneGIS/SceneGISPlanarContentViewer", function () {
  let container;
  let viewer;

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

  function createPlanarViewer() {
    return createViewer(container, {
      world: createWorld(),
      useDefaultRenderLoop: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
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
    if (viewer && !viewer.isDestroyed()) {
      viewer.destroy();
    }
    document.body.removeChild(container);
  });

  it("automatically visualizes viewer.entities and preserves Entity selection", function () {
    viewer = createPlanarViewer();
    const entity = viewer.entities.add({
      id: "viewer-point",
      name: "Planar point",
      description: "Planar content description",
      position: new Cartesian3(0.0, 0.0, 10.0),
      point: new PointGraphics({ pixelSize: 16.0, color: Color.CYAN }),
    });
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    const visualizers = viewer.dataSourceDisplay.defaultDataSource._visualizers;
    expect(visualizers.length).toBe(9);
    expect(visualizers[1]._items.get(entity.id).point.id).toBe(entity);

    spyOn(viewer.scene, "pick").and.returnValue({ id: entity });
    const select = viewer.screenSpaceEventHandler.getInputAction(
      ScreenSpaceEventType.LEFT_CLICK,
    );
    select({ position: new Cartesian2(32.0, 32.0) });
    viewer._onTick(viewer.clock);
    expect(viewer.selectedEntity).toBe(entity);
    expect(viewer.selectionIndicator.viewModel.showSelection).toBe(true);
    expect(viewer.infoBox.viewModel.titleText).toBe("Planar point");
    expect(viewer.infoBox.viewModel.description).toBe(
      "Planar content description",
    );
    expect(viewer.infoBox.viewModel.enableCamera).toBe(false);
  });

  it("anchors an oblique ground Corridor selection to the presentation surface", function () {
    viewer = createPlanarViewer();
    const world = viewer.scene.world;
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: -450,
      maximumHeight: 8700,
      maximumLevel: 1,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: (level) => 1 / 2 ** level,
      requestTileGeometry: () => undefined,
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    const entity = viewer.entities.add({
      id: "viewer-ground-corridor",
      name: "Planar Corridor",
      description: "Ground selection anchor",
      corridor: new CorridorGraphics({
        positions: [new Cartesian3(-40, -10, 999), new Cartesian3(40, 10, 999)],
        width: 14,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        material: new ColorMaterialProperty(Color.DEEPSKYBLUE),
      }),
    });
    const cameraPosition = new Cartesian3(96, -96, 96);
    const direction = Cartesian3.normalize(
      Cartesian3.negate(cameraPosition, new Cartesian3()),
      new Cartesian3(),
    );
    const right = Cartesian3.normalize(
      Cartesian3.cross(direction, Cartesian3.UNIT_Z, new Cartesian3()),
      new Cartesian3(),
    );
    const up = Cartesian3.cross(right, direction, new Cartesian3());
    viewer.camera.setView({
      destination: cameraPosition,
      orientation: { direction, up },
    });
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    viewer.render();
    viewer.render();

    const route = viewer.dataSourceDisplay.defaultDataSource._visualizers[7];
    const owner = route._items.get(entity.id).owners.corridor;
    const primitive = owner.fillPrimitive;
    const presentationSphere = primitive.getBoundingSphere(
      new BoundingSphere(),
    );
    expect(presentationSphere.center.x).toBeCloseTo(0, 12);
    expect(presentationSphere.center.y).toBeCloseTo(0, 12);
    expect(presentationSphere.center.z).toBe(0);
    expect(presentationSphere.center.z).not.toBe(4125);

    spyOn(viewer.scene, "pick").and.returnValue({ id: entity });
    const select = viewer.screenSpaceEventHandler.getInputAction(
      ScreenSpaceEventType.LEFT_CLICK,
    );
    select({ position: new Cartesian2(32, 32) });
    viewer._onTick(viewer.clock);
    const viewModel = viewer.selectionIndicator.viewModel;
    expect(viewer.selectedEntity).toBe(entity);
    expect(viewModel.showSelection).toBe(true);
    expect(viewModel.position).toEqual(presentationSphere.center);
    const projected = viewModel.computeScreenSpacePosition(
      viewModel.position,
      new Cartesian2(),
    );
    expect(projected).toEqualEpsilon(
      SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        presentationSphere.center,
        new Cartesian2(),
      ),
      1e-12,
    );
    const canvas = viewer.scene.canvas;
    expect(projected.x).toBeGreaterThanOrEqual(0);
    expect(projected.x).toBeLessThanOrEqual(canvas.clientWidth);
    expect(projected.y).toBeGreaterThanOrEqual(0);
    expect(projected.y).toBeLessThanOrEqual(canvas.clientHeight);
  });

  it("keeps added CustomDataSource primitives isolated and releases them", async function () {
    viewer = createPlanarViewer();
    const dataSource = new CustomDataSource("planar-data-source");
    await viewer.dataSources.add(dataSource);
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    expect(dataSource._visualizers[2]._primitives).toBe(dataSource._primitives);
    expect(dataSource._visualizers[3]._primitives).toBe(dataSource._primitives);
    expect(dataSource._visualizers[4]._primitives).toBe(dataSource._primitives);

    const visualizers = dataSource._visualizers.slice();
    viewer.dataSources.remove(dataSource);
    expect(dataSource._visualizers).toBeUndefined();
    for (let i = 0; i < visualizers.length; i++) {
      expect(visualizers[i].isDestroyed()).toBe(true);
    }
  });
});
