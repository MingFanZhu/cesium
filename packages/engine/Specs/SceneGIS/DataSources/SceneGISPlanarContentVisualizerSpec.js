import {
  BillboardGraphics,
  BoundingSphere,
  BoundingSphereState,
  BoxGraphics,
  Cartesian2,
  Cartesian3,
  Color,
  CorridorGraphics,
  EntityCluster,
  EntityCollection,
  EllipseGraphics,
  HeightReference,
  JulianDate,
  LabelGraphics,
  ModelGraphics,
  Plane,
  PlaneGraphics,
  PointGraphics,
  PathGraphics,
  PolylineVolumeGraphics,
  Rectangle,
  RectangleGraphics,
  ReferenceFrame,
  SampledPositionProperty,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneTransforms,
  WallGraphics,
  _SceneGISPlanarAnchorVisualizer as SceneGISPlanarAnchorVisualizer,
  _SceneGISPlanarAreaVisualizer as SceneGISPlanarAreaVisualizer,
  _SceneGISPlanarModelVisualizer as SceneGISPlanarModelVisualizer,
  _SceneGISPlanarPathVisualizer as SceneGISPlanarPathVisualizer,
  _SceneGISPlanarRouteVisualizer as SceneGISPlanarRouteVisualizer,
  _SceneGISPlanarSolidVisualizer as SceneGISPlanarSolidVisualizer,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/DataSources/SceneGISPlanarContentVisualizer", function () {
  const modelUrl = "./Data/Models/glTF-2.0/BoxTextured/glTF/BoxTextured.gltf";
  let scene;

  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(128, 128) });
  });

  afterEach(function () {
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

  it("renders volume, area, route, and path graphics with stable public primitives", function () {
    const center = 20037508.0;
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: center - 128,
          minimumY: center - 128,
          maximumX: center + 128,
          maximumY: center + 128,
        }),
        crs: "EPSG:3857",
      }),
      maximumLevel: 1,
    });
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValue(4);
    // Ground graphics require the scene-owned world and its surface depth.
    scene._initializeWorld(world);
    const collection = new EntityCollection();
    const solid = new SceneGISPlanarSolidVisualizer(world, scene, collection);
    const area = new SceneGISPlanarAreaVisualizer(world, scene, collection);
    const route = new SceneGISPlanarRouteVisualizer(world, scene, collection);
    const path = new SceneGISPlanarPathVisualizer(world, scene, collection);
    const time = JulianDate.fromIso8601("2026-08-09T00:00:00Z");
    const entities = [
      collection.add({
        id: "box-c7",
        position: new Cartesian3(center - 60, center, 12),
        box: new BoxGraphics({
          dimensions: new Cartesian3(30, 30, 24),
          material: Color.RED,
        }),
      }),
      collection.add({
        id: "plane-c7",
        position: new Cartesian3(center - 20, center, 10),
        plane: new PlaneGraphics({
          plane: new Plane(Cartesian3.UNIT_Z, 0),
          dimensions: new Cartesian2(30, 30),
          material: Color.GREEN,
        }),
      }),
      collection.add({
        id: "ellipse-c7",
        position: new Cartesian3(center + 20, center, 999),
        ellipse: new EllipseGraphics({
          semiMajorAxis: 18,
          semiMinorAxis: 12,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          material: Color.BLUE,
        }),
      }),
      collection.add({
        id: "rectangle-c7",
        rectangle: new RectangleGraphics({
          coordinates: new Rectangle(
            center + 40,
            center - 15,
            center + 70,
            center + 15,
          ),
          height: 16,
          extrudedHeight: 4,
          rotation: 0.25,
          material: Color.YELLOW,
        }),
      }),
      collection.add({
        id: "corridor-c8",
        corridor: new CorridorGraphics({
          positions: [
            new Cartesian3(center - 70, center - 45, 0),
            new Cartesian3(center - 30, center - 45, 0),
          ],
          width: 12,
          height: 20,
          material: Color.MAGENTA,
        }),
      }),
      collection.add({
        id: "wall-c8",
        wall: new WallGraphics({
          positions: [
            new Cartesian3(center - 10, center + 45, 4),
            new Cartesian3(center + 10, center + 45, 24),
          ],
          material: Color.CYAN,
        }),
      }),
      collection.add({
        id: "volume-c8",
        polylineVolume: new PolylineVolumeGraphics({
          positions: [
            new Cartesian3(center + 30, center - 45, 12),
            new Cartesian3(center + 65, center - 45, 12),
          ],
          shape: [
            new Cartesian2(-4, -4),
            new Cartesian2(4, -4),
            new Cartesian2(4, 4),
            new Cartesian2(-4, 4),
          ],
          material: Color.ORANGE,
        }),
      }),
    ];
    const pathPosition = new SampledPositionProperty(ReferenceFrame.FIXED);
    pathPosition.addSample(
      JulianDate.addSeconds(time, -60, new JulianDate()),
      new Cartesian3(center - 30, center + 65, 18),
    );
    pathPosition.addSample(
      JulianDate.addSeconds(time, 60, new JulianDate()),
      new Cartesian3(center + 30, center + 65, 18),
    );
    entities.push(
      collection.add({
        id: "path-c8",
        position: pathPosition,
        path: new PathGraphics({ leadTime: 60, trailTime: 60, width: 5 }),
      }),
    );
    scene.frameState.scene3DOnly = true;
    scene.camera.setView({
      destination: new Cartesian3(center, center, 180),
      orientation: {
        direction: Cartesian3.negate(Cartesian3.UNIT_Z, new Cartesian3()),
        up: Cartesian3.UNIT_Y,
      },
    });

    try {
      solid.update(time);
      area.update(time);
      route.update(time);
      path.update(time);
      scene.renderForSpecs();
      scene.renderForSpecs();
      const owners = [
        solid._items.get(entities[0].id).owners.box,
        area._items.get(entities[1].id).owners.plane,
        area._items.get(entities[2].id).owners.ellipse,
        area._items.get(entities[3].id).owners.rectangle,
        route._items.get(entities[4].id).owners.corridor,
        route._items.get(entities[5].id).owners.wall,
        route._items.get(entities[6].id).owners.polylineVolume,
        path._items.get(entities[7].id).owner,
      ];
      const primitiveIdentities = owners.map((owner) => owner.primitives[0]);
      const boxSurface = new Cartesian3(center - 60, center, 24);
      const boxWindow = SceneTransforms.worldToWindowCoordinates(
        scene,
        boxSurface,
      );
      const boxDrawing = SceneTransforms.transformWindowToDrawingBuffer(
        scene,
        boxWindow,
        new Cartesian2(),
      );
      const boxPixel = scene.context.readPixels({
        x: Math.max(
          0,
          Math.min(scene.drawingBufferWidth - 1, Math.floor(boxDrawing.x)),
        ),
        y: Math.max(
          0,
          Math.min(
            scene.drawingBufferHeight - 1,
            Math.floor(scene.drawingBufferHeight - boxDrawing.y),
          ),
        ),
        width: 1,
        height: 1,
      });
      expect(boxPixel[0]).toBeGreaterThan(boxPixel[1]);
      expect(boxPixel[0]).toBeGreaterThan(boxPixel[2]);
      expect(scene.pickPositionSupported).toBeTrue();
      const renderedBoxPosition = scene.pickPosition(boxWindow);
      expect(renderedBoxPosition).toBeDefined();
      expect(renderedBoxPosition.x).toBeCloseTo(boxSurface.x, 1);
      expect(renderedBoxPosition.y).toBeCloseTo(boxSurface.y, 1);
      expect(renderedBoxPosition.z).toBeCloseTo(boxSurface.z, 0);
      const corridorSurface = new Cartesian3(center - 50, center - 45, 20);
      const corridorWindow = SceneTransforms.worldToWindowCoordinates(
        scene,
        corridorSurface,
      );
      const renderedCorridorPosition = scene.pickPosition(corridorWindow);
      expect(renderedCorridorPosition).toBeDefined();
      expect(renderedCorridorPosition.z).toBeCloseTo(20, 0);
      expect(scene.pick(corridorWindow)?.id ?? scene.pick(corridorWindow)).toBe(
        entities[4],
      );
      entities[0].box.material = Color.CYAN;
      solid.update(time);
      area.update(time);
      route.update(time);
      path.update(time);
      scene.renderForSpecs();
      expect(owners.map((owner) => owner.primitives[0])).toEqual(
        primitiveIdentities,
      );
      for (let i = 0; i < entities.length; i++) {
        const sphere = new BoundingSphere();
        const visualizer =
          i === 0 ? solid : i < 4 ? area : i < 7 ? route : path;
        expect(visualizer.getBoundingSphere(entities[i], sphere)).toBe(
          BoundingSphereState.DONE,
        );
        expect(Number.isFinite(sphere.radius)).toBeTrue();
        const windowPosition = SceneTransforms.worldToWindowCoordinates(
          scene,
          sphere.center,
        );
        expect(
          scene.pick(windowPosition)?.id ?? scene.pick(windowPosition),
        ).toBe(entities[i]);
      }
      const oldCorridorOwner = owners[4];
      const oldCorridorCenter = Cartesian3.clone(
        oldCorridorOwner.boundingSphere.center,
      );
      entities[4].corridor.positions = entities[4].corridor.positions
        .getValue(time)
        .map(
          (position) =>
            new Cartesian3(position.x + 10, position.y + 15, position.z),
        );
      route.update(time);
      scene.renderForSpecs();
      scene.renderForSpecs();
      const translatedCorridorOwner = route._items.get(entities[4].id).owners
        .corridor;
      expect(translatedCorridorOwner).not.toBe(oldCorridorOwner);
      expect(translatedCorridorOwner.boundingSphere.center.x).toBeCloseTo(
        oldCorridorCenter.x + 10,
        8,
      );
      expect(translatedCorridorOwner.boundingSphere.center.y).toBeCloseTo(
        oldCorridorCenter.y + 15,
        8,
      );
      const translatedCorridorSurface = new Cartesian3(
        corridorSurface.x + 10,
        corridorSurface.y + 15,
        corridorSurface.z,
      );
      const translatedCorridorWindow = SceneTransforms.worldToWindowCoordinates(
        scene,
        translatedCorridorSurface,
      );
      expect(
        scene.pick(translatedCorridorWindow)?.id ??
          scene.pick(translatedCorridorWindow),
      ).toBe(entities[4]);
    } finally {
      const primitives = [
        solid._items.get(entities[0].id)?.owners.box?.primitives[0],
        area._items.get(entities[1].id)?.owners.plane?.primitives[0],
      ];
      solid.destroy();
      area.destroy();
      route.destroy();
      path.destroy();
      expect(
        primitives.every((primitive) => primitive.isDestroyed()),
      ).toBeTrue();
      // The scene owns this world and releases it in afterEach.
    }
  });
});
