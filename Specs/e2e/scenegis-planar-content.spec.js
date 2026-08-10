import { test, expect } from "./test.js";

test("qualifies automatic planar content, dynamic update, selection, and destroy", async ({
  cesiumPage,
  page,
}) => {
  const externalAttempts = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    ) {
      externalAttempts.push(request.url());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" &&
      !text.startsWith("Blocked script execution in 'about:blank'")
    ) {
      consoleErrors.push(text);
    }
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
  await page.addInitScript({
    content: `window.CESIUM_BASE_URL = "${process.env.release ? "../../Build/Cesium/" : "../../Build/CesiumUnminified/"}";`,
  });
  await cesiumPage.goto();
  await page.evaluate(async () => {
    await Cesium.ApproximateTerrainHeights.initialize();
  });

  const initial = await page.evaluate(async () => {
    const world = new Cesium.SceneGISPlanarWorld({
      coordinateSystem: new Cesium.SceneGISPlanarCoordinateSystem({
        extent: new Cesium.SceneGISPlanarExtent({
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        }),
        crs: "LOCAL:METERS",
      }),
      maximumLevel: 0,
      baseColor: Cesium.Color.BLACK,
    });
    const terrainData = new Cesium.SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([10, 30, 10, 40, 100, 40, 10, 30, 10]),
      width: 3,
      height: 3,
    });
    const terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 10,
      maximumHeight: 100,
      maximumLevel: 0,
      errorEvent: new Cesium.Event(),
      credit: undefined,
      getLevelMaximumGeometricError: (level) => 64 / 2 ** level,
      requestTileGeometry: () => Promise.resolve(terrainData),
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    world.terrainProvider = terrainProvider;
    const viewer = new Cesium.Viewer("cesiumContainer", {
      world,
      useDefaultRenderLoop: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
    });
    viewer.scene.highDynamicRange = false;
    viewer.scene.camera.setView({
      destination: new Cesium.Cartesian3(0.0, 0.0, 512.0),
      orientation: {
        direction: new Cesium.Cartesian3(0.0, 0.0, -1.0),
        up: Cesium.Cartesian3.UNIT_Y,
      },
    });
    const image = document.createElement("canvas");
    image.width = 8;
    image.height = 8;
    image.getContext("2d").fillRect(0, 0, 8, 8);
    const source = new Cesium.CustomDataSource("c10-local-content");
    const point = source.entities.add({
      id: "e2e-point",
      position: new Cesium.Cartesian3(-96.0, -30.0, 140.0),
      point: { pixelSize: 28.0, color: Cesium.Color.RED },
    });
    source.entities.add({
      id: "e2e-billboard",
      position: new Cesium.Cartesian3(-50.0, 0.0, 10.0),
      billboard: { image, width: 16.0, height: 16.0 },
    });
    source.entities.add({
      id: "e2e-label",
      position: new Cesium.Cartesian3(50.0, 0.0, 10.0),
      label: { text: "C10 local", fillColor: Cesium.Color.YELLOW },
    });
    const model = source.entities.add({
      id: "e2e-model",
      position: new Cesium.Cartesian3(-32.0, -30.0, 140.0),
      model: {
        uri: "../../Apps/SampleData/models/CesiumMan/Cesium_Man.glb",
        scale: 5.0,
        minimumPixelSize: 20.0,
      },
    });
    const line = source.entities.add({
      id: "e2e-line",
      polyline: {
        positions: [
          new Cesium.Cartesian3(16.0, -30.0, 140.0),
          new Cesium.Cartesian3(48.0, -30.0, 140.0),
        ],
        width: 4,
        material: Cesium.Color.CYAN,
        arcType: Cesium.ArcType.NONE,
      },
    });
    const polygon = source.entities.add({
      id: "e2e-polygon",
      position: new Cesium.Cartesian3(96.0, -30.0, 140.0),
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy([
          new Cesium.Cartesian3(80.0, -45.0, 0.0),
          new Cesium.Cartesian3(112.0, -45.0, 0.0),
          new Cesium.Cartesian3(112.0, -15.0, 0.0),
          new Cesium.Cartesian3(80.0, -15.0, 0.0),
        ]),
        height: 140.0,
        material: Cesium.Color.LIME,
      },
    });
    const box = source.entities.add({
      id: "e2e-box",
      position: new Cesium.Cartesian3(-96, 35, 140),
      box: { dimensions: new Cesium.Cartesian3(20, 24, 30) },
    });
    source.entities.add({
      id: "e2e-cylinder",
      position: new Cesium.Cartesian3(-40, 60, 25),
      cylinder: { length: 30, topRadius: 8, bottomRadius: 10, slices: 12 },
    });
    source.entities.add({
      id: "e2e-ellipsoid",
      position: new Cesium.Cartesian3(0, 60, 25),
      ellipsoid: { radii: new Cesium.Cartesian3(10, 12, 14) },
    });
    const plane = source.entities.add({
      id: "e2e-plane",
      position: new Cesium.Cartesian3(-32, 35, 140),
      plane: {
        plane: new Cesium.Plane(Cesium.Cartesian3.UNIT_Z, 0),
        dimensions: new Cesium.Cartesian2(20, 16),
      },
    });
    source.entities.add({
      id: "e2e-ellipse",
      position: new Cesium.Cartesian3(80, 60, 0),
      ellipse: { semiMajorAxis: 12, semiMinorAxis: 8, height: 20 },
    });
    source.entities.add({
      id: "e2e-rectangle",
      rectangle: {
        coordinates: new Cesium.Rectangle(-100, 80, -70, 105),
        height: 18,
      },
    });
    source.entities.add({
      id: "e2e-corridor",
      corridor: {
        positions: [
          new Cesium.Cartesian3(-50, 90, 15),
          new Cesium.Cartesian3(-20, 110, 15),
          new Cesium.Cartesian3(10, 90, 15),
        ],
        width: 8,
        height: 15,
      },
    });
    const wall = source.entities.add({
      id: "e2e-wall",
      wall: {
        positions: [
          new Cesium.Cartesian3(16, 35, 140),
          new Cesium.Cartesian3(48, 35, 150),
        ],
      },
    });
    source.entities.add({
      id: "e2e-volume",
      polylineVolume: {
        positions: [
          new Cesium.Cartesian3(60, 90, 25),
          new Cesium.Cartesian3(95, 90, 25),
        ],
        shape: [
          new Cesium.Cartesian2(-4, -4),
          new Cesium.Cartesian2(4, -4),
          new Cesium.Cartesian2(4, 4),
          new Cesium.Cartesian2(-4, 4),
        ],
      },
    });
    const sampled = new Cesium.SampledPositionProperty();
    sampled.addSample(
      Cesium.JulianDate.addSeconds(
        viewer.clock.currentTime,
        -60,
        new Cesium.JulianDate(),
      ),
      new Cesium.Cartesian3(80, 35, 140),
    );
    sampled.addSample(
      Cesium.JulianDate.addSeconds(
        viewer.clock.currentTime,
        60,
        new Cesium.JulianDate(),
      ),
      new Cesium.Cartesian3(112, 35, 140),
    );
    const path = source.entities.add({
      id: "e2e-path",
      position: sampled,
      path: { leadTime: 60, trailTime: 60 },
    });
    const groundEntity = source.entities.add({
      id: "e2e-ground-line",
      polyline: {
        positions: [
          new Cesium.Cartesian3(-80, -85, 0),
          new Cesium.Cartesian3(80, -85, 0),
        ],
        clampToGround: true,
        width: 6,
        material: Cesium.Color.MAGENTA,
      },
    });
    await viewer.dataSources.add(source);
    const directOrdinaryEntity = viewer.entities.add({
      id: "e2e-direct-ordinary",
      name: "Direct ordinary polygon",
      description: "Metadata for a direct planar primitive.",
      position: new Cesium.Cartesian3(-60, -10, 140),
    });
    const directGroundCenter = new Cesium.Cartesian3(0, 0, 0);
    const directGroundEntity = viewer.entities.add({
      id: "e2e-direct-ground",
      name: "Direct ground polygon",
      description: "Metadata for a direct planar ground primitive.",
      position: new Cesium.CallbackProperty((_time, result) => {
        const height = world.getTerrainHeight(directGroundCenter) ?? 0;
        return Cesium.Cartesian3.fromElements(0, 0, height, result);
      }, false),
    });
    const directPrimitive = viewer.scene.primitives.add(
      new Cesium.SceneGISPlanarPrimitive({
        geometry: new Cesium.SceneGISPlanarPolygonGeometry({
          positions: [
            new Cesium.Cartesian3(-80, -25, 140),
            new Cesium.Cartesian3(-40, -25, 140),
            new Cesium.Cartesian3(-40, 5, 140),
            new Cesium.Cartesian3(-80, 5, 140),
          ],
        }),
        appearance: new Cesium.PerInstanceColorAppearance({ flat: true }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.BLUE,
          ),
        },
        id: directOrdinaryEntity,
      }),
    );
    const directGround = viewer.scene.primitives.add(
      new Cesium.SceneGISPlanarGroundPrimitive({
        world,
        geometry: new Cesium.SceneGISPlanarPolygonGeometry({
          positions: [
            new Cesium.Cartesian3(-12, -12, 0),
            new Cesium.Cartesian3(12, -12, 0),
            new Cesium.Cartesian3(12, 12, 0),
            new Cesium.Cartesian3(-12, 12, 0),
          ],
        }),
        appearance: new Cesium.PerInstanceColorAppearance({
          flat: true,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(
            Cesium.Color.ORANGE,
          ),
        },
        id: directGroundEntity,
      }),
    );
    for (let frame = 0; frame < 20; ++frame) {
      viewer.dataSourceDisplay.update(viewer.clock.currentTime);
      viewer.render();
      await Promise.resolve();
    }
    const visualizers = source._visualizers;
    let modelReady = false;
    for (let attempt = 0; attempt < 100 && !modelReady; ++attempt) {
      viewer.dataSourceDisplay.update(viewer.clock.currentTime);
      viewer.render();
      modelReady =
        visualizers[2]._items.get("e2e-model")?.model?.ready === true;
      if (!modelReady) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    const groundOwner = visualizers[3]._items.get(groundEntity.id).owner
      .primitive;
    const modelBounds = new Cesium.BoundingSphere();
    const modelBoundsState = viewer.dataSourceDisplay.getBoundingSphere(
      model,
      true,
      modelBounds,
    );
    if (modelBoundsState !== Cesium.BoundingSphereState.DONE) {
      throw new Error("Planar Model bounding sphere is not ready.");
    }
    const roleTargets = [
      { entity: point, position: new Cesium.Cartesian3(-96, -30, 140) },
      { entity: model, position: modelBounds.center },
      { entity: line, position: new Cesium.Cartesian3(32, -30, 140) },
      { entity: polygon, position: new Cesium.Cartesian3(96, -30, 140) },
      { entity: box, position: new Cesium.Cartesian3(-96, 35, 140) },
      { entity: plane, position: new Cesium.Cartesian3(-32, 35, 140) },
      { entity: wall, position: new Cesium.Cartesian3(32, 35, 145) },
      { entity: path, position: new Cesium.Cartesian3(96, 35, 140) },
    ];
    const findRolePick = ({ entity, position }) => {
      const centerPosition = Cesium.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        position,
      );
      for (let radius = 0; radius <= 16; ++radius) {
        for (let y = -radius; y <= radius; ++y) {
          for (let x = -radius; x <= radius; ++x) {
            if (Math.max(Math.abs(x), Math.abs(y)) !== radius) {
              continue;
            }
            const windowPosition = new Cesium.Cartesian2(
              centerPosition.x + x,
              centerPosition.y + y,
            );
            const picked = viewer.scene.pick(windowPosition)?.id;
            if (picked === entity) {
              return {
                id: entity.id,
                picked: picked.id,
                window: [windowPosition.x, windowPosition.y],
              };
            }
          }
        }
      }
      return {
        id: entity.id,
        picked: undefined,
        window: [centerPosition.x, centerPosition.y],
      };
    };
    const rolePicks = roleTargets.map(findRolePick);
    source.show = false;
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    viewer.render();
    const terrainHeight = world.getTerrainHeight(
      new Cesium.Cartesian3(0.0, 0.0, 0.0),
    );
    const terrainWindow = Cesium.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      new Cesium.Cartesian3(0.0, 0.0, terrainHeight),
    );
    const terrainPick = world.pickTerrainFromWindowPosition(
      terrainWindow,
      viewer.scene,
    );
    const depthPick = viewer.scene.pickPosition(terrainWindow);
    const groundPick = viewer.scene.pick(terrainWindow);
    const groundPickId = groundPick?.id?.id ?? groundPick?.id;
    const directPicks = [
      findRolePick({
        entity: directOrdinaryEntity,
        position: new Cesium.Cartesian3(-60, -10, 140),
      }),
      findRolePick({
        entity: directGroundEntity,
        position: new Cesium.Cartesian3(0, 0, terrainHeight),
      }),
    ];
    source.show = true;
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    viewer.render();
    window.scenegisC10 = {
      viewer,
      world,
      source,
      point,
      visualizers,
      rolePicks,
      directPrimitive,
      directGround,
      directOrdinaryEntity,
      directGroundEntity,
    };
    return {
      visualizerCount: visualizers.length,
      anchorCount: visualizers[1]._items.length,
      modelCount: visualizers[2]._items.length,
      lineCount: visualizers[3]._items.length,
      polygonCount: visualizers[4]._items.length,
      solidCount: visualizers[5]._items.length,
      areaCount: visualizers[6]._items.length,
      routeCount: visualizers[7]._items.length,
      pathCount: visualizers[8]._items.length,
      modelReady,
      groundReady: groundOwner.ready,
      directReady: directPrimitive.ready && directGround.ready,
      terrainClosure:
        Number.isFinite(terrainHeight) &&
        terrainPick !== undefined &&
        depthPick !== undefined &&
        groundPickId === "e2e-direct-ground" &&
        Number.isFinite(depthPick.x) &&
        Number.isFinite(depthPick.y) &&
        Number.isFinite(depthPick.z) &&
        Math.abs(depthPick.x) < 2.0 &&
        Math.abs(depthPick.y) < 2.0 &&
        Math.abs(depthPick.z - terrainHeight) < 2.0 &&
        Math.abs(terrainPick.z - terrainHeight) < 2.0,
      worldIdentity:
        viewer.scene.world === world && viewer.scene.globe === undefined,
      controllerCount: viewer.scene.controllerHost.controllerCount,
      rolePicks,
      directPicks,
    };
  });
  expect(initial).toMatchObject({
    visualizerCount: 9,
    anchorCount: 3,
    modelCount: 1,
    lineCount: 2,
    polygonCount: 1,
    solidCount: 3,
    areaCount: 3,
    routeCount: 3,
    pathCount: 1,
    modelReady: true,
    groundReady: true,
    directReady: true,
    terrainClosure: true,
    worldIdentity: true,
    controllerCount: 1,
  });
  expect(initial.rolePicks.map(({ picked }) => picked)).toEqual([
    "e2e-point",
    "e2e-model",
    "e2e-line",
    "e2e-polygon",
    "e2e-box",
    "e2e-plane",
    "e2e-wall",
    "e2e-path",
  ]);
  expect(initial.directPicks.map(({ picked }) => picked)).toEqual([
    "e2e-direct-ordinary",
    "e2e-direct-ground",
  ]);
  for (const role of initial.rolePicks) {
    await page.mouse.click(role.window[0], role.window[1]);
    expect(
      await page.evaluate(() => window.scenegisC10.viewer.selectedEntity?.id),
    ).toBe(role.id);
  }
  const directTitles = ["Direct ordinary polygon", "Direct ground polygon"];
  for (let i = 0; i < initial.directPicks.length; ++i) {
    const direct = initial.directPicks[i];
    await page.mouse.click(direct.window[0], direct.window[1]);
    await page.evaluate(() => {
      const viewer = window.scenegisC10.viewer;
      viewer._onTick(viewer.clock);
    });
    await page.waitForFunction((id) => {
      const viewer = window.scenegisC10.viewer;
      const position = viewer.selectionIndicator.viewModel.position;
      return (
        viewer.selectedEntity?.id === id &&
        Number.isFinite(position?.x) &&
        Number.isFinite(position?.y) &&
        Number.isFinite(position?.z)
      );
    }, direct.id);
    const selected = await page.evaluate(() => {
      const viewer = window.scenegisC10.viewer;
      const position = viewer.selectionIndicator.viewModel.position;
      return {
        id: viewer.selectedEntity?.id,
        title: viewer.infoBox.viewModel.titleText,
        anchor: [position.x, position.y, position.z],
      };
    });
    expect(selected.id).toBe(direct.id);
    expect(selected.title).toBe(directTitles[i]);
    expect(selected.anchor.every(Number.isFinite)).toBe(true);
  }

  const dynamic = await page.evaluate(() => {
    const { viewer, point, visualizers } = window.scenegisC10;
    point.position = new Cesium.Cartesian3(-92.0, -30.0, 145.0);
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    viewer.render();
    const slot = visualizers[1]._items.get(point.id).point;
    return [slot.position.x, slot.position.y, slot.position.z];
  });
  expect(dynamic).toEqual([-92, -30, 145]);

  const removed = await page.evaluate(() => {
    const { viewer, source, point, visualizers } = window.scenegisC10;
    source.entities.remove(point);
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    viewer.render();
    return visualizers[1]._items.get(point.id);
  });
  expect(removed).toBeUndefined();

  const destroyed = await page.evaluate(() => {
    const { viewer, world, source } = window.scenegisC10;
    const controllerHost = viewer.scene.controllerHost;
    const sourcePrimitives = source._primitives;
    const removedSource = viewer.dataSources.remove(source);
    viewer.destroy();
    return {
      removedSource,
      sourcePrimitiveCount: sourcePrimitives.length,
      viewer: viewer.isDestroyed(),
      world: world.isDestroyed(),
      controllerCount: controllerHost.controllerCount,
      children: document.getElementById("cesiumContainer").children.length,
    };
  });
  expect(destroyed).toEqual({
    removedSource: true,
    sourcePrimitiveCount: 0,
    viewer: true,
    world: true,
    controllerCount: 0,
    children: 0,
  });
  expect(externalAttempts).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
