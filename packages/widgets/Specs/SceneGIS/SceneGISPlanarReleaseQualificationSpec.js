import {
  Color,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "@cesium/engine";
import createViewer from "../createViewer.js";

describe(
  "SceneGIS/SceneGISPlanarReleaseQualification",
  function () {
    let container;

    function createWorld() {
      return new SceneGISPlanarWorld({
        coordinateSystem: new SceneGISPlanarCoordinateSystem({
          extent: new SceneGISPlanarExtent({
            minimumX: -128,
            minimumY: -128,
            maximumX: 128,
            maximumY: 128,
          }),
        }),
        maximumLevel: 0,
        baseColor: Color.BLACK,
      });
    }

    beforeEach(function () {
      container = document.createElement("div");
      container.style.width = "32px";
      container.style.height = "32px";
      document.body.appendChild(container);
    });

    afterEach(function () {
      document.body.removeChild(container);
    });

    it("restores ControllerHost and DOM baselines across eight Viewer cycles", function () {
      const childBaseline = container.children.length;
      for (let i = 0; i < 8; ++i) {
        const world = createWorld();
        const viewer = createViewer(container, {
          world,
          useDefaultRenderLoop: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
        });
        const controller = viewer.planarCameraController;
        const aggregator = controller._aggregator;
        const host = viewer.scene._controllerHost;
        const hostBaseline = host.controllerCount - 1;
        expect(
          host._controllers.filter((entry) => entry === controller).length,
        ).toBe(1);
        viewer.render();
        viewer.destroy();
        expect(world.isDestroyed()).toBe(true);
        expect(aggregator.isDestroyed()).toBe(true);
        expect(controller._aggregator).toBeUndefined();
        expect(host.controllerCount).toBe(hostBaseline);
        expect(container.children.length).toBe(childBaseline);
      }
    });
  },
  "WebGL",
);
