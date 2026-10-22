import {
  CallbackPositionProperty,
  Cartesian2,
  Cartesian3,
  Color,
  EntityCluster,
  EntityCollection,
  JulianDate,
  OrthographicFrustum,
  SceneGISPlanarWorld,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneTransforms,
  Scene,
  PrimitiveCollection,
  HeightReference,
  TimeInterval,
  TimeIntervalCollection,
  _SceneGISPlanarAnchorVisualizer as AnchorVisualizer,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe(
  "SceneGIS/DataSources/SceneGISPlanarClustering",
  function () {
    let scene, world, cluster, entities, visualizer, primitives;
    const time = JulianDate.fromIso8601("2026-10-22T04:00:00Z");
    const origin = new Cartesian3(13000000, 4000000, 100);
    const position = (x = 0, y = 0, z = 100) =>
      new Cartesian3(origin.x + x, origin.y + y, z);
    beforeEach(function () {
      world = new SceneGISPlanarWorld({
        coordinateSystem: new SceneGISPlanarCoordinateSystem({
          extent: new SceneGISPlanarExtent({
            minimumX: -20000000,
            minimumY: -20000000,
            maximumX: 20000000,
            maximumY: 20000000,
          }),
        }),
        maximumLevel: 0,
      });
      scene = new Scene({
        canvas: createCanvas(400, 300),
        contextOptions: { webgl: { antialias: false } },
      });
      scene._initializeWorld(world);
      scene.rethrowRenderErrors = true;
      scene.context.validateShaderProgram = true;
      scene.context.validateFramebuffer = true;
      scene.context.throwOnWebGLError = true;
      scene.camera.setView({
        destination: position(0, 0, 1100),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      });
      scene.environmentEffects.enabled = false;
      cluster = new EntityCluster({ enabled: true, pixelRange: 30 });
      cluster._initialize(scene);
      primitives = scene.primitives.add(new PrimitiveCollection());
      primitives.add(cluster);
      entities = new EntityCollection();
      visualizer = new AnchorVisualizer(world, scene, cluster, entities);
    });
    afterEach(function () {
      visualizer.destroy();
      const canvas = scene.canvas;
      scene.destroy();
      canvas.remove();
    });
    function frame() {
      visualizer.update(time);
      scene.initializeFrame();
      scene.render(time);
    }
    function add(x = 0, options = {}) {
      return entities.add({
        position: position(x),
        point: { pixelSize: 12, color: Color.CYAN },
        ...options,
      });
    }
    function labels() {
      return cluster._clusterLabelCollection;
    }
    async function ready() {
      frame();
      // Native getPoint/getBillboard/getLabel mark newly allocated pools in a microtask.
      await Promise.resolve();
      await pollToPromise(() => {
        frame();
        return cluster.ready;
      });
    }
    it("clusters large planar XYZ, keeps original member ids, picks and disables", async function () {
      const a = add(-10),
        b = add(10);
      cluster.clusterEvent.addEventListener((ids, result) => {
        result.point.show = true;
        result.point.pixelSize = 30;
        result.point.color = Color.YELLOW;
        result.point.id = ids;
        result.label.pixelOffset = new Cartesian2(0, -24);
      });
      await ready();
      expect(labels().length).toBe(1);
      expect(labels().get(0).id).toEqual([a, b]);
      expect(labels().get(0).position).toEqual(origin);
      expect(cluster.getPoint(a).clusterShow).toBe(false);
      const screen = SceneTransforms.worldToWindowCoordinates(scene, origin);
      expect(scene.pick(screen).id).toEqual([a, b]);
      cluster.enabled = false;
      frame();
      expect(labels()).toBeUndefined();
      expect(cluster.getPoint(a).clusterShow).toBe(true);
      cluster.enabled = true;
      frame();
      expect(labels().length).toBe(1);
    });
    it("invalidates frozen-time positions, show, size and removal without rebuilding static frames", async function () {
      let x = 10;
      const a = add(-10),
        b = add(10, {
          position: new CallbackPositionProperty(() => position(x), false),
        });
      await ready();
      const callback = spyOn(cluster, "_cluster").and.callThrough();
      for (let i = 0; i < 8; ++i) {
        frame();
      }
      expect(callback).not.toHaveBeenCalled();
      x = 800;
      frame();
      expect(labels()).toBeUndefined();
      expect(callback).toHaveBeenCalledTimes(1);
      x = 10;
      frame();
      expect(labels().length).toBe(1);
      b.show = false;
      frame();
      expect(labels()).toBeUndefined();
      b.show = true;
      frame();
      expect(labels().length).toBe(1);
      a.point.pixelSize = 18;
      callback.calls.reset();
      frame();
      expect(callback).toHaveBeenCalledTimes(1);
      entities.remove(a);
      frame();
      expect(labels()).toBeUndefined();
      expect(cluster.getPoint(b).clusterShow).toBe(true);
    });
    it("invalidates resident terrain heights and availability in existing clusters", async function () {
      let height = 100;
      spyOn(world, "getTerrainHeight").and.callFake(() => height);
      const a = add(-10, {
        point: {
          pixelSize: 12,
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
      });
      const b = add(10, {
        point: {
          pixelSize: 12,
          heightReference: HeightReference.CLAMP_TO_GROUND,
        },
      });
      await ready();
      expect(labels().get(0).position.z).toBe(100);
      height = 200;
      frame();
      expect(labels().get(0).position.z).toBe(200);
      b.availability = new TimeIntervalCollection([
        new TimeInterval({
          start: JulianDate.addSeconds(time, 10, new JulianDate()),
          stop: JulianDate.addSeconds(time, 20, new JulianDate()),
        }),
      ]);
      frame();
      expect(labels()).toBeUndefined();
      expect(cluster.getPoint(a).clusterShow).toBe(true);
      expect(cluster.getPoint(b).show).toBe(false);
      b.availability = undefined;
      frame();
      expect(labels().get(0).id).toEqual([a, b]);
    });

    it("restores excluded types and clears clusters when all flags are off", async function () {
      const a = add(-10),
        b = add(10);
      await ready();
      cluster.clusterPoints = false;
      frame();
      expect(labels()).toBeUndefined();
      expect(cluster.getPoint(a).clusterShow).toBe(true);
      cluster.clusterPoints = true;
      frame();
      expect(labels().length).toBe(1);
      cluster.clusterPoints =
        cluster.clusterLabels =
        cluster.clusterBillboards =
          false;
      frame();
      expect(labels()).toBeUndefined();
      expect(cluster.getPoint(b).clusterShow).toBe(true);
    });
    it("clusters labels with billboards without double counting and updates text/image bounds", async function () {
      const image = document.createElement("canvas");
      image.width = 16;
      image.height = 16;
      image.getContext("2d").fillRect(0, 0, 16, 16);
      const options = {
        point: undefined,
        billboard: { image },
        label: { text: "POI", font: "16px sans-serif" },
      };
      const a = add(-10, options),
        b = add(10, options);
      await ready();
      expect(labels().length).toBe(1);
      expect(labels().get(0).id).toEqual([a, b]);
      expect(cluster.getLabel(a).clusterShow).toBe(false);
      const callback = spyOn(cluster, "_cluster").and.callThrough();
      frame();
      expect(callback).not.toHaveBeenCalled();
      a.label.text = "Long changed label";
      frame();
      expect(callback).toHaveBeenCalled();
      cluster.clusterBillboards = false;
      frame();
      expect(cluster.getBillboard(a).clusterShow).toBe(true);
      expect(labels().get(0).id).toEqual([a, b]);
    });
    it("uses the same window Y for mixed points, billboards and labels away from screen center", async function () {
      const image = document.createElement("canvas");
      image.width = 16;
      image.height = 16;
      image.getContext("2d").fillRect(0, 0, 16, 16);
      const north = add(-5, { position: position(-5, 400) });
      const northIcon = add(5, {
        position: position(5, 400),
        point: undefined,
        billboard: { image },
      });
      const south = add(-5, {
        position: position(-5, -400),
        point: undefined,
        billboard: { image },
      });
      const southLabel = add(5, {
        position: position(5, -400),
        point: undefined,
        label: { text: "South", font: "14px sans-serif" },
      });
      await ready();
      expect(labels().length).toBe(2);
      const groups = [labels().get(0).id, labels().get(1).id];
      expect(
        groups.some(
          (ids) =>
            ids.includes(north) && ids.includes(northIcon) && ids.length === 2,
        ),
      ).toBe(true);
      expect(
        groups.some(
          (ids) =>
            ids.includes(south) && ids.includes(southLabel) && ids.length === 2,
        ),
      ).toBe(true);
    });

    it("uses current orthographic projection and viewport instead of camera height history", async function () {
      add(-100);
      add(100);
      scene.camera.frustum = new OrthographicFrustum({
        width: 4000,
        aspectRatio: 4 / 3,
        near: 1,
        far: 10000,
      });
      await ready();
      expect(labels().length).toBe(1);
      scene.camera.frustum.width = 400;
      frame();
      expect(labels()).toBeUndefined();
      scene.camera.frustum.width = 4000;
      frame();
      expect(labels().length).toBe(1);
      const callback = spyOn(cluster, "_cluster").and.callThrough();
      scene.canvas.style.width = "600px";
      frame();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(labels().get(0).position).toEqual(origin);
    });
    it("excludes points behind the camera without ellipsoid culling at the planar origin", async function () {
      const behind = add(0, { position: position(0, 0, 1200) });
      add(-10);
      add(10);
      await ready();
      expect(labels().get(0).id.length).toBe(2);
      expect(labels().get(0).id).not.toContain(behind);
      expect(cluster.getPoint(behind).clusterShow).toBe(false);
    });

    it("clusters near world XYZ zero without treating anchors as inside Earth", async function () {
      scene.camera.setView({
        destination: new Cartesian3(0, 0, 1000),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      });
      const a = add(0, { position: new Cartesian3(-10, 0, 100) });
      const b = add(0, { position: new Cartesian3(10, 0, 100) });
      await ready();
      expect(labels().get(0).id).toEqual([a, b]);
      expect(labels().get(0).position).toEqual(new Cartesian3(0, 0, 100));
    });
    it("releases policy and listeners, permits reuse after removal, and rejects cross-scene sharing", async function () {
      add(-10);
      add(10);
      await ready();
      const listeners = scene.camera.changed.numberOfListeners;
      expect(() =>
        cluster._initialize({ world, camera: scene.camera }),
      ).toThrowDeveloperError();
      expect(cluster._scene).toBe(scene);
      visualizer.destroy();
      primitives.remove(cluster);
      expect(cluster._sceneGISPlanar).toBeUndefined();
      expect(scene.camera.changed.numberOfListeners).toBe(listeners - 1);
      cluster._initialize(scene);
      primitives.add(cluster);
      visualizer = new AnchorVisualizer(world, scene, cluster, entities);
      await ready();
      expect(labels().length).toBe(1);
      expect(scene.camera.changed.numberOfListeners).toBe(listeners);
    });
  },
  "WebGL",
);
