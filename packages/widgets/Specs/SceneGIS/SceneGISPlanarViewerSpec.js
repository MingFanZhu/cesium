import {
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Color,
  ControllerHost,
  Credit,
  DeveloperError,
  Ellipsoid,
  Entity,
  Event,
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarImageryLayer,
  SceneGISPlanarWorld,
  SceneMode,
  ScreenSpaceEventType,
} from "@cesium/engine";
import { ClockViewModel, SceneGISPlanarHomeButton } from "../../index.js";
import createViewer from "../createViewer.js";

describe(
  "SceneGIS/SceneGISPlanarViewer",
  function () {
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

    function createImage(cssColor) {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      const context = canvas.getContext("2d");
      context.fillStyle = cssColor;
      context.fillRect(0, 0, 2, 2);
      return canvas;
    }

    function expectSolid(expected) {
      return function (rgba) {
        for (let i = 0; i < rgba.length; i += 4) {
          expect(Array.from(rgba.slice(i, i + 4))).toEqual(expected);
        }
      };
    }

    function createPlanarViewer(world, options = {}) {
      return createViewer(container, {
        world,
        useDefaultRenderLoop: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        ...options,
      });
    }

    function expectPreflightError(options) {
      expect(function () {
        return createViewer(container, options);
      }).toThrowDeveloperError();
      expect(container.children.length).toBe(0);
    }

    let container;
    let viewer;
    let looseWorlds;

    beforeEach(function () {
      container = document.createElement("div");
      container.style.width = "32px";
      container.style.height = "32px";
      container.style.position = "relative";
      document.body.appendChild(container);
      looseWorlds = [];
    });

    afterEach(function () {
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
      for (let i = 0; i < looseWorlds.length; i++) {
        const world = looseWorlds[i];
        if (!world.isDestroyed()) {
          world.destroy();
        }
      }
      document.body.removeChild(container);
    });

    it("constructs a planar Viewer with owned navigation and Home", function () {
      const world = createWorld();
      viewer = createPlanarViewer(world);

      expect(viewer.scene.world).toBe(world);
      expect(viewer.scene.globe).toBeUndefined();
      expect(viewer.planarCameraController).toBeInstanceOf(
        SceneGISPlanarCameraController,
      );
      expect(viewer.planarCameraController.world).toBe(world);
      expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(false);
      expect(viewer.homeButton).toBeInstanceOf(SceneGISPlanarHomeButton);
      expect(viewer.geocoder).toBeUndefined();
      expect(viewer.sceneModePicker).toBeUndefined();
      expect(viewer.projectionPicker).toBeUndefined();
      expect(viewer.baseLayerPicker).toBeUndefined();
      expect(viewer.navigationHelpButton).toBeUndefined();
    });

    it("allows disabling and re-enabling the owned controller", function () {
      viewer = createPlanarViewer(createWorld());
      const controller = viewer.planarCameraController;
      const aggregator = controller._aggregator;

      controller.enabled = false;
      expect(viewer.planarCameraController).toBe(controller);
      expect(controller._aggregator).toBe(aggregator);
      expect(controller.enabled).toBe(false);
      expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(false);

      controller.enabled = true;
      expect(viewer.planarCameraController).toBe(controller);
      expect(controller._aggregator).toBe(aggregator);
      expect(controller.enabled).toBe(true);
      expect(viewer.scene.screenSpaceCameraController.enableInputs).toBe(false);
    });

    it("rejects invalid worlds before child DOM mutation", function () {
      const values = [false, {}, { isDestroyed: () => false }];
      for (let i = 0; i < values.length; i++) {
        expectPreflightError({ world: values[i] });
      }

      const destroyedWorld = createWorld();
      destroyedWorld.destroy();
      expectPreflightError({ world: destroyedWorld });
    });

    it("preflights incompatible planar options before child DOM mutation", function () {
      const rejected = {
        globe: false,
        sceneMode: SceneMode.SCENE2D,
        scene3DOnly: false,
        baseLayer: false,
        imageryProvider: false,
        selectedImageryProviderViewModel: false,
        imageryProviderViewModels: [],
        terrainProvider: false,
        terrain: false,
        terrainShadows: false,
        selectedTerrainProviderViewModel: false,
        terrainProviderViewModels: [],
        mapProjection: false,
        mapMode2D: false,
        depthPlaneEllipsoidOffset: 0,
        navigationInstructionsInitiallyVisible: false,
        baseLayerPicker: true,
        geocoder: true,
        sceneModePicker: true,
        projectionPicker: true,
        navigationHelpButton: true,
        vrButton: true,
      };

      for (const name in rejected) {
        if (Object.prototype.hasOwnProperty.call(rejected, name)) {
          const world = createWorld();
          looseWorlds.push(world);
          expectPreflightError({
            world,
            [name]: rejected[name],
          });
        }
      }
    });

    it("accepts explicit false for suppressed widgets", function () {
      viewer = createPlanarViewer(createWorld(), {
        baseLayerPicker: false,
        geocoder: false,
        sceneModePicker: false,
        projectionPicker: false,
        navigationHelpButton: false,
        vrButton: false,
      });

      expect(viewer.scene.world).toBeDefined();
    });

    it("allows disabling all retained planar widgets", function () {
      viewer = createViewer(container, {
        world: createWorld(),
        useDefaultRenderLoop: false,
        homeButton: false,
        infoBox: false,
        selectionIndicator: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
      });

      expect(viewer.homeButton).toBeUndefined();
      expect(viewer.infoBox).toBeUndefined();
      expect(viewer.selectionIndicator).toBeUndefined();
      expect(viewer.animation).toBeUndefined();
      expect(viewer.timeline).toBeUndefined();
      expect(viewer.fullscreenButton).toBeUndefined();
      expect(container.querySelector(".cesium-home-button")).toBeNull();
      expect(
        container.querySelector(".cesium-viewer-infoBoxContainer"),
      ).toBeNull();
      expect(
        container.querySelector(".cesium-viewer-selectionIndicatorContainer"),
      ).toBeNull();
      expect(
        container.querySelector(".cesium-viewer-animationContainer"),
      ).toBeNull();
      expect(
        container.querySelector(".cesium-viewer-timelineContainer"),
      ).toBeNull();
      expect(
        container.querySelector(".cesium-viewer-fullscreenContainer"),
      ).toBeNull();
    });

    it("preserves planar identities when an ellipsoid is supplied", function () {
      const world = createWorld();
      const coordinateSystem = world.coordinateSystem;
      const tilingScheme = world.tilingScheme;
      const ellipsoid = new Ellipsoid(2.0, 3.0, 4.0);

      viewer = createPlanarViewer(world, { ellipsoid });

      expect(viewer.scene.ellipsoid).toBe(ellipsoid);
      expect(world.coordinateSystem).toBe(coordinateSystem);
      expect(world.tilingScheme).toBe(tilingScheme);
    });

    it("keeps compatible default widgets and disables InfoBox camera", function () {
      viewer = createViewer(container, {
        world: createWorld(),
        useDefaultRenderLoop: false,
      });

      expect(viewer.infoBox).toBeDefined();
      expect(viewer.selectionIndicator).toBeDefined();
      expect(viewer.animation).toBeDefined();
      expect(viewer.timeline).toBeDefined();
      expect(viewer.fullscreenButton).toBeDefined();
      viewer._onTick(viewer.clock);
      expect(viewer.infoBox.viewModel.enableCamera).toBe(false);
    });

    it("keeps left-click selection and omits double-click tracking", function () {
      viewer = createPlanarViewer(createWorld());

      expect(
        viewer.screenSpaceEventHandler.getInputAction(
          ScreenSpaceEventType.LEFT_CLICK,
        ),
      ).toBeDefined();
      expect(
        viewer.screenSpaceEventHandler.getInputAction(
          ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
        ),
      ).toBeUndefined();
    });

    it("selects positioned Entities through direct and primitive ids", function () {
      viewer = createPlanarViewer(createWorld());
      viewer.planarCameraController.viewHome(viewer.scene);
      viewer.render();
      const directEntity = new Entity({
        name: "Direct planar feature",
        description: "Direct planar description",
        position: new Cartesian3(0, 0, 0),
      });
      const primitiveEntity = new Entity({
        name: "Primitive planar feature",
        description: "Primitive planar description",
        position: new Cartesian3(32, 0, 0),
      });
      spyOn(viewer.scene, "pick").and.returnValues(
        { id: directEntity },
        { primitive: { id: primitiveEntity } },
      );
      const select = viewer.screenSpaceEventHandler.getInputAction(
        ScreenSpaceEventType.LEFT_CLICK,
      );

      select({ position: new Cartesian2(16, 16) });
      viewer._onTick(viewer.clock);
      expect(viewer.selectedEntity).toBe(directEntity);
      expect(viewer.infoBox.viewModel.titleText).toBe("Direct planar feature");
      expect(viewer.infoBox.viewModel.description).toBe(
        "Direct planar description",
      );
      expect(viewer.selectionIndicator.viewModel.showSelection).toBe(true);
      expect(
        Cartesian3.equals(
          viewer.selectionIndicator.viewModel.position,
          new Cartesian3(0, 0, 0),
        ),
      ).toBe(true);
      expect(viewer.infoBox.viewModel.enableCamera).toBe(false);

      select({ position: new Cartesian2(20, 16) });
      viewer._onTick(viewer.clock);
      const indicatorPosition = viewer.selectionIndicator.viewModel.position;
      expect(viewer.selectedEntity).toBe(primitiveEntity);
      expect(viewer.selectionIndicator.viewModel.showSelection).toBe(true);
      expect(Number.isFinite(indicatorPosition.x)).toBe(true);
      expect(Number.isFinite(indicatorPosition.y)).toBe(true);
      expect(Number.isFinite(indicatorPosition.z)).toBe(true);
      expect(viewer.infoBox.viewModel.enableCamera).toBe(false);
    });

    it("rejects planar tracking, zoom, and flight synchronously", function () {
      viewer = createPlanarViewer(createWorld());

      expect(function () {
        viewer.trackedEntity = {};
      }).toThrowDeveloperError();
      expect(function () {
        viewer.zoomTo({});
      }).toThrowDeveloperError();
      expect(function () {
        viewer.flyTo({});
      }).toThrowDeveloperError();
      expect(function () {
        viewer.trackedEntity = undefined;
      }).not.toThrow();
    });

    it("disconnects the planar controller before destroying its world", function () {
      const originalRegister = ControllerHost.prototype.registerController;
      let registeredHost;
      let baselineCount;
      spyOn(ControllerHost.prototype, "registerController").and.callFake(
        function (controller, element, priority) {
          registeredHost = this;
          baselineCount = this.controllerCount;
          return originalRegister.call(this, controller, element, priority);
        },
      );
      const originalDisconnected =
        SceneGISPlanarCameraController.prototype.disconnectedCallback;
      let worldLiveDuringDisconnect;
      const disconnected = spyOn(
        SceneGISPlanarCameraController.prototype,
        "disconnectedCallback",
      ).and.callFake(function (element) {
        worldLiveDuringDisconnect = !world.isDestroyed();
        return originalDisconnected.call(this, element);
      });
      const world = createWorld();
      const worldDestroy = spyOn(world, "destroy").and.callThrough();
      viewer = createPlanarViewer(world);
      const host = viewer.scene.controllerHost;

      expect(host).toBe(registeredHost);
      expect(host.controllerCount).toBe(baselineCount + 1);

      viewer.destroy();

      expect(disconnected).toHaveBeenCalledTimes(1);
      expect(worldLiveDuringDisconnect).toBe(true);
      expect(host.controllerCount).toBe(baselineCount);
      expect(worldDestroy).toHaveBeenCalledTimes(1);
      expect(world.isDestroyed()).toBe(true);
      expect(viewer.isDestroyed()).toBe(true);
    });

    it("rolls back when the controller constructor sees a dead world", function () {
      const register = spyOn(
        ControllerHost.prototype,
        "registerController",
      ).and.callThrough();
      const unregister = spyOn(
        ControllerHost.prototype,
        "unregisterController",
      ).and.callThrough();
      const connected = spyOn(
        SceneGISPlanarCameraController.prototype,
        "connectedCallback",
      ).and.callThrough();
      const disconnected = spyOn(
        SceneGISPlanarCameraController.prototype,
        "disconnectedCallback",
      ).and.callThrough();
      const clockDestroy = spyOn(
        ClockViewModel.prototype,
        "destroy",
      ).and.callThrough();
      const world = createWorld();
      const originalIsDestroyed = world.isDestroyed;
      let isDestroyedCalls = 0;
      spyOn(world, "isDestroyed").and.callFake(function () {
        isDestroyedCalls++;
        return isDestroyedCalls === 3 ? true : originalIsDestroyed.call(this);
      });
      const worldDestroy = spyOn(world, "destroy").and.callThrough();

      expect(function () {
        return createPlanarViewer(world);
      }).toThrowError(
        DeveloperError,
        "options.world must be a live SceneGISPlanarWorld.",
      );

      expect(register).not.toHaveBeenCalled();
      expect(unregister).not.toHaveBeenCalled();
      expect(connected).not.toHaveBeenCalled();
      expect(disconnected).not.toHaveBeenCalled();
      expect(worldDestroy).toHaveBeenCalledTimes(1);
      expect(clockDestroy).toHaveBeenCalledTimes(1);
      expect(world.isDestroyed()).toBe(true);
      expect(container.children.length).toBe(0);
    });

    it("rolls back a failed controller registration", function () {
      const originalRegister = ControllerHost.prototype.registerController;
      let host;
      let baselineCount;
      const register = spyOn(
        ControllerHost.prototype,
        "registerController",
      ).and.callFake(function (controller, element, priority) {
        host = this;
        baselineCount = this.controllerCount;
        return originalRegister.call(this, controller, element, priority);
      });
      const unregister = spyOn(
        ControllerHost.prototype,
        "unregisterController",
      ).and.callThrough();
      const originalConnected =
        SceneGISPlanarCameraController.prototype.connectedCallback;
      const connected = spyOn(
        SceneGISPlanarCameraController.prototype,
        "connectedCallback",
      ).and.callFake(function (element) {
        originalConnected.call(this, element);
        throw new Error("registration failed");
      });
      const disconnected = spyOn(
        SceneGISPlanarCameraController.prototype,
        "disconnectedCallback",
      ).and.callThrough();
      const world = createWorld();
      const originalWorldDestroy = world.destroy;
      let hostCountAtWorldDestroy;
      const worldDestroy = spyOn(world, "destroy").and.callFake(function () {
        hostCountAtWorldDestroy = host.controllerCount;
        return originalWorldDestroy.call(this);
      });

      expect(function () {
        return createPlanarViewer(world);
      }).toThrowError("registration failed");

      expect(connected).toHaveBeenCalledTimes(1);
      expect(disconnected).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledTimes(1);
      expect(unregister).toHaveBeenCalledTimes(1);
      expect(host.controllerCount).toBe(baselineCount);
      expect(hostCountAtWorldDestroy).toBe(baselineCount);
      expect(
        disconnected.calls.mostRecent().object._aggregator,
      ).toBeUndefined();
      expect(worldDestroy).toHaveBeenCalledTimes(1);
      expect(world.isDestroyed()).toBe(true);
      expect(container.children.length).toBe(0);
    });

    it("does not remove a controller that never entered the host", function () {
      const addController = spyOn(
        CesiumWidget.prototype,
        "addController",
      ).and.throwError("pre-host registration failed");
      const removeController = spyOn(
        CesiumWidget.prototype,
        "removeController",
      ).and.callThrough();
      const connected = spyOn(
        SceneGISPlanarCameraController.prototype,
        "connectedCallback",
      ).and.callThrough();
      const disconnected = spyOn(
        SceneGISPlanarCameraController.prototype,
        "disconnectedCallback",
      ).and.callThrough();
      const world = createWorld();
      const worldDestroy = spyOn(world, "destroy").and.callThrough();

      expect(function () {
        return createPlanarViewer(world);
      }).toThrowError("pre-host registration failed");

      expect(addController).toHaveBeenCalledTimes(1);
      expect(removeController).not.toHaveBeenCalled();
      expect(connected).not.toHaveBeenCalled();
      expect(disconnected).not.toHaveBeenCalled();
      expect(worldDestroy).toHaveBeenCalledTimes(1);
      expect(world.isDestroyed()).toBe(true);
      expect(container.children.length).toBe(0);
    });

    it("does not alter the existing globe and globe:false branches", function () {
      viewer = createViewer(container, {
        useDefaultRenderLoop: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
      });
      expect(viewer.scene.globe).toBeDefined();
      expect(viewer.planarCameraController).toBeUndefined();
      viewer.destroy();

      viewer = createViewer(container, {
        globe: false,
        baseLayer: false,
        useDefaultRenderLoop: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        baseLayerPicker: false,
      });
      expect(viewer.scene.globe).toBeUndefined();
      expect(viewer.planarCameraController).toBeUndefined();
    });

    it("renders explicit local imagery with credit, depth, and warm reuse", async function () {
      const world = createWorld();
      const requestImage = jasmine
        .createSpy("requestImage")
        .and.returnValue(Promise.resolve(createImage("rgb(255,0,0)")));
      world.imageryLayers.add(
        new SceneGISPlanarImageryLayer({
          tilingScheme: world.tilingScheme,
          minimumLevel: 0,
          maximumLevel: 0,
          tileWidth: 2,
          tileHeight: 2,
          hasAlphaChannel: true,
          errorEvent: new Event(),
          credit: new Credit("Local planar Viewer fixture"),
          requestImage,
        }),
      );
      viewer = createPlanarViewer(world, {
        contextOptions: { webgl: { antialias: false } },
      });
      viewer.scene.highDynamicRange = false;
      viewer.scene.rethrowRenderErrors = true;
      viewer.scene.camera.setView({
        destination: new Cartesian3(0, 0, 64),
        orientation: {
          direction: new Cartesian3(0, 0, -1),
          up: new Cartesian3(0, 1, 0),
        },
      });

      expect(viewer.scene).toRenderAndCall(expectSolid([0, 0, 0, 255]));
      for (let i = 0; i < 4; i++) {
        await Promise.resolve();
        viewer.render();
      }
      expect(viewer.scene).toRenderAndCall(expectSolid([255, 0, 0, 255]));
      expect(requestImage).toHaveBeenCalledTimes(1);
      const credits =
        viewer.creditDisplay._currentFrameCredits.lightboxCredits.values;
      expect(
        credits.some(function (creditInfo) {
          return creditInfo.credit.html === "Local planar Viewer fixture";
        }),
      ).toBe(true);

      const surface = world._surface;
      const before = {
        requests: surface._imagery._debug.createdRequests,
        textures: surface._imagery._debug.createdTextures,
        shaders: surface._debug.createdShaders,
        commands: surface._debug.createdCommands,
        bindings: surface._imagery._debug.createdBindings,
      };
      expect(viewer.scene).toRenderAndCall(expectSolid([255, 0, 0, 255]));
      expect({
        requests: surface._imagery._debug.createdRequests,
        textures: surface._imagery._debug.createdTextures,
        shaders: surface._debug.createdShaders,
        commands: surface._debug.createdCommands,
        bindings: surface._imagery._debug.createdBindings,
      }).toEqual(before);

      if (viewer.scene.pickPositionSupported && !window.webglStub) {
        const position = viewer.scene.pickPosition(new Cartesian2(16, 16));
        expect(position).toBeDefined();
        expect(position.z).toEqualEpsilon(0, 1e-4);
      }
    });

    it("preserves the zero-layer lazy imagery path", function () {
      const world = createWorld();
      viewer = createPlanarViewer(world);
      viewer.planarCameraController.viewHome(viewer.scene);

      viewer.render();

      const tile = world._surface._quadtree._idealTiles[0];
      expect(tile._imagerySlots).toBeUndefined();
      expect(tile.imageryBindings).toBeUndefined();
      expect(tile._imageryRelease).toBeUndefined();
    });
  },
  "WebGL",
);
