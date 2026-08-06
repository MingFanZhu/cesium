import {
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "@cesium/engine";
import { SceneGISPlanarHomeButtonViewModel } from "../../index.js";

describe("SceneGIS/SceneGISPlanarHomeButtonViewModel", function () {
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
    });
  }

  let world;
  let controller;
  let scene;

  beforeEach(function () {
    world = createWorld();
    controller = new SceneGISPlanarCameraController({ world });
    scene = { world };
  });

  afterEach(function () {
    if (!world.isDestroyed()) {
      world.destroy();
    }
  });

  it("exposes its dependencies and observable tooltip", function () {
    const viewModel = new SceneGISPlanarHomeButtonViewModel(scene, controller);

    expect(viewModel.scene).toBe(scene);
    expect(viewModel.planarCameraController).toBe(controller);
    expect(viewModel.tooltip).toBe("View Home");
    viewModel.tooltip = "Planar home";
    expect(viewModel.tooltip).toBe("Planar home");
  });

  it("executes viewHome with standard command hooks", function () {
    const viewModel = new SceneGISPlanarHomeButtonViewModel(scene, controller);
    spyOn(controller, "viewHome");
    const before = jasmine.createSpy("before");
    const after = jasmine.createSpy("after");
    viewModel.command.beforeExecute.addEventListener(before);
    viewModel.command.afterExecute.addEventListener(after);

    viewModel.command();

    expect(before).toHaveBeenCalledTimes(1);
    expect(controller.viewHome).toHaveBeenCalledOnceWith(scene);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("honors command cancellation", function () {
    const viewModel = new SceneGISPlanarHomeButtonViewModel(scene, controller);
    spyOn(controller, "viewHome");
    viewModel.command.beforeExecute.addEventListener(function (commandInfo) {
      commandInfo.cancel = true;
    });

    viewModel.command();

    expect(controller.viewHome).not.toHaveBeenCalled();
  });

  it("rejects missing or mismatched dependencies", function () {
    expect(function () {
      return new SceneGISPlanarHomeButtonViewModel(undefined, controller);
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarHomeButtonViewModel(scene, {});
    }).toThrowDeveloperError();

    const otherWorld = createWorld();
    const otherController = new SceneGISPlanarCameraController({
      world: otherWorld,
    });
    expect(function () {
      return new SceneGISPlanarHomeButtonViewModel(scene, otherController);
    }).toThrowDeveloperError();
    otherWorld.destroy();
  });
});
