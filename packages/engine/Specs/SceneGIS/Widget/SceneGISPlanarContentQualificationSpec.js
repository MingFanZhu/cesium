import {
  ApproximateTerrainHeights,
  BillboardGraphics,
  BoundingSphere,
  BoundingSphereState,
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  ColorMaterialProperty,
  CustomDataSource,
  HeightReference,
  LabelGraphics,
  ModelGraphics,
  PointGraphics,
  PolygonGraphics,
  PolygonHierarchy,
  PolylineGraphics,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneTransforms,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Widget/SceneGISPlanarContentQualification", function () {
  const center = 20000000.0;
  const modelUrl = "./Data/Models/glTF-2.0/BoxTextured/glTF/BoxTextured.gltf";
  let container;
  let widget;

  function createWorld() {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: center - 2048.0,
          minimumY: center - 2048.0,
          maximumX: center + 2048.0,
          maximumY: center + 2048.0,
        }),
        crs: "EPSG:3857",
      }),
      maximumLevel: 0,
      baseColor: Color.BLACK,
    });
  }

  function createWidget(world) {
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      contextOptions,
    });
    widget.scene.highDynamicRange = false;
    widget.scene.camera.setView({
      destination: new Cartesian3(center, center, 3200.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });
    widget.resize();
  }

  function gridPosition(index, columns, spacing, z = 10.0) {
    return new Cartesian3(
      center + (index % columns) * spacing - ((columns - 1) * spacing) / 2.0,
      center + Math.floor(index / columns) * spacing - 720.0,
      z,
    );
  }

  function square(position, halfSize, z) {
    return [
      new Cartesian3(position.x - halfSize, position.y - halfSize, z),
      new Cartesian3(position.x + halfSize, position.y - halfSize, z),
      new Cartesian3(position.x + halfSize, position.y + halfSize, z),
      new Cartesian3(position.x - halfSize, position.y + halfSize, z),
    ];
  }

  function createImage() {
    const image = document.createElement("canvas");
    image.width = 8;
    image.height = 8;
    const context = image.getContext("2d");
    context.fillStyle = "#00ffff";
    context.fillRect(0, 0, 8, 8);
    return image;
  }

  function addModerateProfile(source, terrainHeightRef) {
    const points = [];
    const billboards = [];
    const labels = [];
    const polylines = [];
    const polygons = [];
    const image = createImage();

    for (let i = 0; i < 256; ++i) {
      const entity = source.entities.add({
        id: `point-${i}`,
        position: gridPosition(i, 32, 42.0, i === 0 ? 3.0 : 10.0),
        point: new PointGraphics({
          pixelSize: i === 0 ? 18.0 : 5.0,
          color: i === 0 ? Color.RED : Color.YELLOW,
          heightReference:
            i === 0 ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE,
        }),
      });
      points.push(entity);
    }
    for (let i = 0; i < 128; ++i) {
      billboards.push(
        source.entities.add({
          id: `billboard-${i}`,
          position: gridPosition(i, 32, 42.0, 14.0),
          billboard: new BillboardGraphics({ image, width: 6.0, height: 6.0 }),
        }),
      );
    }
    for (let i = 0; i < 128; ++i) {
      labels.push(
        source.entities.add({
          id: `label-${i}`,
          position: gridPosition(i, 32, 42.0, 18.0),
          label: new LabelGraphics({ text: `${i}`, font: "10px sans-serif" }),
        }),
      );
    }
    for (let i = 0; i < 64; ++i) {
      const position = gridPosition(i, 16, 80.0, 8.0);
      polylines.push(
        source.entities.add({
          id: `polyline-${i}`,
          polyline: new PolylineGraphics({
            positions: [
              new Cartesian3(position.x - 20.0, position.y, 8.0),
              new Cartesian3(position.x + 20.0, position.y, 8.0),
            ],
            clampToGround: i === 0,
            material: new ColorMaterialProperty(Color.CYAN),
            width: 2,
          }),
        }),
      );
    }
    for (let i = 0; i < 32; ++i) {
      const position = gridPosition(i, 8, 160.0, 6.0);
      polygons.push(
        source.entities.add({
          id: `polygon-${i}`,
          position: new Cartesian3(position.x, position.y, i === 0 ? 2.0 : 6.0),
          polygon: new PolygonGraphics({
            hierarchy: new PolygonHierarchy(square(position, 24.0, 0.0)),
            height: i === 0 ? 2.0 : 6.0,
            heightReference:
              i === 0
                ? HeightReference.RELATIVE_TO_GROUND
                : HeightReference.NONE,
            material: new ColorMaterialProperty(Color.LIME.withAlpha(0.8)),
          }),
        }),
      );
    }
    terrainHeightRef.value = 20.0;
    return { points, billboards, labels, polylines, polygons };
  }

  function getVisualizers(source) {
    return {
      anchor: source._visualizers[1],
      model: source._visualizers[2],
      polyline: source._visualizers[3],
      polygon: source._visualizers[4],
    };
  }

  function snapshotStable(source, profile) {
    const visualizers = getVisualizers(source);
    const pointSlots = profile.points.map(
      (entity) => visualizers.anchor._items.get(entity.id).point,
    );
    const billboardSlots = profile.billboards.map(
      (entity) => visualizers.anchor._items.get(entity.id).billboard,
    );
    const labelSlots = profile.labels.map(
      (entity) => visualizers.anchor._items.get(entity.id).label,
    );
    const lineOwners = profile.polylines.map(
      (entity) => visualizers.polyline._items.get(entity.id).owner,
    );
    const polygonOwners = profile.polygons.map(
      (entity) => visualizers.polygon._items.get(entity.id).owner,
    );
    const lineContext = lineOwners[0].collection._renderContext;
    const polygonContext = polygonOwners[0].fillCollection._renderContext;
    return {
      pointSlots,
      billboardSlots,
      labelSlots,
      lineOwners,
      polygonOwners,
      primitiveCount: source._primitives.length,
      lineContext,
      lineCommand: lineContext.command,
      lineVertexArray: lineContext.vertexArray,
      polygonContext,
      polygonCommand: polygonContext.command,
      polygonVertexArray: polygonContext.vertexArray,
      lineVersions: lineOwners.map((owner) => owner.collection._version),
      polygonVersions: polygonOwners.map((owner) =>
        owner.collections.map((collection) => collection._version),
      ),
    };
  }

  function expectStable(source, profile, snapshot) {
    const current = snapshotStable(source, profile);
    expect(current.pointSlots).toEqual(snapshot.pointSlots);
    expect(current.billboardSlots).toEqual(snapshot.billboardSlots);
    expect(current.labelSlots).toEqual(snapshot.labelSlots);
    expect(current.lineOwners).toEqual(snapshot.lineOwners);
    expect(current.polygonOwners).toEqual(snapshot.polygonOwners);
    expect(current.primitiveCount).toBe(snapshot.primitiveCount);
    expect(current.lineContext).toBe(snapshot.lineContext);
    expect(current.lineCommand).toBe(snapshot.lineCommand);
    expect(current.lineVertexArray).toBe(snapshot.lineVertexArray);
    expect(current.polygonContext).toBe(snapshot.polygonContext);
    expect(current.polygonCommand).toBe(snapshot.polygonCommand);
    expect(current.polygonVertexArray).toBe(snapshot.polygonVertexArray);
    expect(current.lineVersions).toEqual(snapshot.lineVersions);
    expect(current.polygonVersions).toEqual(snapshot.polygonVersions);
    for (const owner of [...current.lineOwners, ...current.polygonOwners]) {
      for (const collection of owner.collections) {
        expect(collection._dirtyCount).toBe(0);
      }
    }
  }

  function percentile(values, fraction) {
    const sorted = values.slice().sort((left, right) => left - right);
    return sorted[
      Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
    ];
  }

  beforeAll(async function () {
    await ApproximateTerrainHeights.initialize();
  });

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "256px";
    container.style.height = "256px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    widget = undefined;
    document.body.removeChild(container);
  });

  it("qualifies the fixed moderate profile across warm and local mutation frames", function () {
    const world = createWorld();
    const terrainHeight = { value: 20.0 };
    spyOn(world, "getTerrainHeight").and.callFake(() => terrainHeight.value);
    createWidget(world);
    const source = new CustomDataSource("moderate-profile");
    const profile = addModerateProfile(source, terrainHeight);
    return widget.dataSources.add(source).then(function () {
      widget.render();
      widget.render();
      const visualizers = getVisualizers(source);
      expect(visualizers.anchor._items.length).toBe(512);
      expect(visualizers.polyline._items.length).toBe(64);
      expect(visualizers.polygon._items.length).toBe(32);
      expect(visualizers.model._items.length).toBe(0);
      expect(source._primitives.length).toBeGreaterThanOrEqual(97);
      const bounds = new BoundingSphere();
      expect(
        widget.dataSourceDisplay.getBoundingSphere(
          profile.points[0],
          true,
          bounds,
        ),
      ).toBe(BoundingSphereState.DONE);
      expect(Number.isFinite(bounds.center.x)).toBe(true);
      expect(Number.isFinite(bounds.center.y)).toBe(true);
      expect(Number.isFinite(bounds.center.z)).toBe(true);
      if (!window.webglStub) {
        const point = visualizers.anchor._items.get(profile.points[0].id).point;
        const windowPosition = SceneTransforms.worldToWindowCoordinates(
          widget.scene,
          point.position,
          new Cartesian2(),
        );
        expect(widget.scene.pick(windowPosition)?.id).toBe(profile.points[0]);
      }

      const stable = snapshotStable(source, profile);
      for (let frame = 0; frame < 20; ++frame) {
        widget.dataSourceDisplay.update(widget.clock.currentTime);
        widget.scene.render();
        expectStable(source, profile, stable);
      }
      const batchSize = 4;
      const updateSamples = [];
      const renderSamples = [];
      for (let batch = 0; batch < 5; ++batch) {
        let start = performance.now();
        for (let sample = 0; sample < batchSize; ++sample) {
          widget.dataSourceDisplay.update(widget.clock.currentTime);
        }
        updateSamples.push((performance.now() - start) / batchSize);
        start = performance.now();
        for (let sample = 0; sample < batchSize; ++sample) {
          widget.scene.render();
        }
        renderSamples.push((performance.now() - start) / batchSize);
        expectStable(source, profile, stable);
      }

      const unchangedPoint = stable.pointSlots[255];
      const unchangedLine = stable.lineOwners[63];
      const unchangedPolygon = stable.polygonOwners[31];
      for (let round = 0; round < 5; ++round) {
        for (let i = 0; i < 32; ++i) {
          const old = profile.points[i].position.getValue(
            widget.clock.currentTime,
          );
          profile.points[i].position = new Cartesian3(
            old.x + 1.0,
            old.y,
            old.z,
          );
        }
        for (let i = 0; i < 8; ++i) {
          const y = center - 700.0 + round;
          profile.polylines[i].polyline.positions = [
            new Cartesian3(center - 30.0 + i, y, 8.0),
            new Cartesian3(center + 30.0 + i, y, 8.0),
          ];
        }
        for (let i = 0; i < 4; ++i) {
          const position = gridPosition(i, 8, 160.0, 6.0);
          profile.polygons[i].polygon.hierarchy = new PolygonHierarchy(
            square(position, 24.0 + round + 1.0, 0.0),
          );
        }
        terrainHeight.value += 1.0;
        widget.render();
        expect(
          visualizers.anchor._items.get(profile.points[255].id).point,
        ).toBe(unchangedPoint);
        expect(
          visualizers.polyline._items.get(profile.polylines[63].id).owner,
        ).toBe(unchangedLine);
        expect(
          visualizers.polygon._items.get(profile.polygons[31].id).owner,
        ).toBe(unchangedPolygon);
        expect(
          visualizers.anchor._items.get(profile.points[0].id).point.position.z,
        ).toBe(terrainHeight.value);
        const clampedLinePositions = visualizers.polyline._items
          .get(profile.polylines[0].id)
          .owner.primitive.getPositions();
        expect(clampedLinePositions[2]).toBe(terrainHeight.value);
        expect(clampedLinePositions[5]).toBe(terrainHeight.value);
        expect(
          visualizers.polygon._items
            .get(profile.polygons[0].id)
            .owner.fillPrimitive.getPositions()[2],
        ).toBe(terrainHeight.value + 2.0);
        widget.render();
      }

      console.warn(
        `SCENEGIS_C5_TIMING ${JSON.stringify({
          environment: {
            userAgent: navigator.userAgent,
            drawingBuffer: [
              widget.scene.drawingBufferWidth,
              widget.scene.drawingBufferHeight,
            ],
            webglStub: !!window.webglStub,
            profile: {
              point: 256,
              billboard: 128,
              label: 128,
              polyline: 64,
              polygon: 32,
            },
          },
          protocol: {
            warmFrames: 20,
            timingBatches: 5,
            batchSize,
            mutationRounds: 5,
          },
          update: {
            median: percentile(updateSamples, 0.5),
            p95: percentile(updateSamples, 0.95),
          },
          render: {
            median: percentile(renderSamples, 0.5),
            p95: percentile(renderSamples, 0.95),
          },
        })}`,
      );
    });
  });

  it("keeps two local models stable through transform updates and removal", async function () {
    const world = createWorld();
    const terrainHeight = { value: 20.0 };
    spyOn(world, "getTerrainHeight").and.callFake(() => terrainHeight.value);
    createWidget(world);
    const source = new CustomDataSource("model-qualification");
    const models = [0, 1].map((index) =>
      source.entities.add({
        id: `model-${index}`,
        position: new Cartesian3(center - 80.0 + index * 160.0, center, 20.0),
        model: new ModelGraphics({
          uri: modelUrl,
          scale: 12.0,
          heightReference:
            index === 0
              ? HeightReference.RELATIVE_TO_GROUND
              : HeightReference.NONE,
        }),
      }),
    );
    await widget.dataSources.add(source);
    widget.render();
    widget.render();
    const visualizer = getVisualizers(source).model;
    await pollToPromise(function () {
      widget.render();
      return models.every(
        (entity) => visualizer._items.get(entity.id)?.model !== undefined,
      );
    });
    const active = models.map(
      (entity) => visualizer._items.get(entity.id).model,
    );
    terrainHeight.value = 25.0;
    models[0].position = new Cartesian3(center - 60.0, center + 20.0, 30.0);
    widget.render();
    expect(visualizer._items.get(models[0].id).model).toBe(active[0]);
    expect(visualizer._items.get(models[1].id).model).toBe(active[1]);
    expect(active[0].modelMatrix[14]).toBe(55.0);
    for (let frame = 0; frame < 20; ++frame) {
      widget.render();
      expect(visualizer._items.get(models[0].id).model).toBe(active[0]);
      expect(visualizer._items.get(models[1].id).model).toBe(active[1]);
    }
    const destroys = active.map((model) =>
      spyOn(model, "destroy").and.callThrough(),
    );
    expect(widget.dataSources.remove(source)).toBe(true);
    expect(destroys[0]).toHaveBeenCalledTimes(1);
    expect(destroys[1]).toHaveBeenCalledTimes(1);
  });

  it("restores listener primitive and DOM baselines across three cycles", async function () {
    const childBaseline = container.children.length;
    for (let cycle = 0; cycle < 3; ++cycle) {
      const world = createWorld();
      createWidget(world);
      const controllerHost = widget.scene.controllerHost;
      const controllerBaseline = controllerHost.controllerCount;
      const source = new CustomDataSource(`cycle-${cycle}`);
      const listenerBaseline =
        source.entities.collectionChanged.numberOfListeners;
      source.entities.add({
        id: `cycle-point-${cycle}`,
        position: new Cartesian3(center, center, 5.0),
        point: new PointGraphics({ pixelSize: 8.0, color: Color.RED }),
      });
      source.entities.add({
        id: `cycle-line-${cycle}`,
        polyline: new PolylineGraphics({
          positions: [
            new Cartesian3(center - 10.0, center, 4.0),
            new Cartesian3(center + 10.0, center, 4.0),
          ],
          material: new ColorMaterialProperty(Color.CYAN),
          width: 2,
        }),
      });
      await widget.dataSources.add(source);
      const primitiveBaseline = 0;
      const attachedListenerBaseline =
        source.entities.collectionChanged.numberOfListeners;
      widget.render();
      widget.render();
      expect(source.entities.collectionChanged.numberOfListeners).toBe(
        attachedListenerBaseline + 4,
      );
      expect(source._primitives.length).toBeGreaterThan(1);
      expect(widget.dataSources.remove(source)).toBe(true);
      expect(source.entities.collectionChanged.numberOfListeners).toBe(
        listenerBaseline,
      );
      expect(source._primitives.length).toBe(primitiveBaseline);
      widget = widget.destroy();
      expect(world.isDestroyed()).toBe(true);
      expect(controllerHost.controllerCount).toBe(controllerBaseline);
      expect(container.children.length).toBe(childBaseline);
    }
  });
});
