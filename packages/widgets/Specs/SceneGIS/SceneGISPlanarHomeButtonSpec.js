import {
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "@cesium/engine";
import { SceneGISPlanarHomeButton } from "../../index.js";

describe("SceneGIS/SceneGISPlanarHomeButton", function () {
  function createWorld() {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -1,
          minimumY: -1,
          maximumX: 1,
          maximumY: 1,
        }),
      }),
      maximumLevel: 0,
    });
  }

  let container;
  let world;
  let button;

  beforeEach(function () {
    container = document.createElement("div");
    container.id = "sceneGISPlanarHomeButtonContainer";
    document.body.appendChild(container);
    world = createWorld();
  });

  afterEach(function () {
    if (button && !button.isDestroyed()) {
      button.destroy();
    }
    if (!world.isDestroyed()) {
      world.destroy();
    }
    document.body.removeChild(container);
  });

  it("creates the standard Home toolbar DOM and view model", function () {
    const controller = new SceneGISPlanarCameraController({ world });
    const scene = { world };
    button = new SceneGISPlanarHomeButton(container, scene, controller);

    expect(button.container).toBe(container);
    expect(button.viewModel.scene).toBe(scene);
    expect(button.viewModel.planarCameraController).toBe(controller);
    expect(container.children.length).toBe(1);
    expect(container.firstChild.className).toContain("cesium-home-button");
  });

  it("accepts a container id and destroys exactly once", function () {
    const controller = new SceneGISPlanarCameraController({ world });
    button = new SceneGISPlanarHomeButton(container.id, { world }, controller);

    button.destroy();

    expect(button.isDestroyed()).toBe(true);
    expect(container.children.length).toBe(0);
  });

  it("rejects a missing container", function () {
    const controller = new SceneGISPlanarCameraController({ world });
    expect(function () {
      return new SceneGISPlanarHomeButton(undefined, { world }, controller);
    }).toThrowDeveloperError();
  });
});
