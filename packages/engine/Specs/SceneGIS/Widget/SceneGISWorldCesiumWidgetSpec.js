import {
  CesiumWidget,
  Globe,
  SceneGISWorld,
  SkyAtmosphere,
} from "../../../index.js";

import getWebGLStub from "../../../../../Specs/getWebGLStub.js";

describe("SceneGIS/Widget/SceneGISWorldCesiumWidget", function () {
  let container;
  let widget;

  function createMockWorld(options = {}) {
    let destroyed = false;
    const calls = [];
    const world = {
      show: true,
      tilesLoaded: options.tilesLoaded ?? true,
      calls: calls,
      destroyCalls: 0,
      update: function () {
        calls.push("update");
      },
      beginFrame: function () {
        calls.push("beginFrame");
      },
      render: function () {
        calls.push("render");
      },
      endFrame: function () {
        calls.push("endFrame");
      },
      isDestroyed: function () {
        return destroyed;
      },
      destroy: function () {
        ++world.destroyCalls;
        destroyed = true;
      },
    };
    return world;
  }

  function createWidget(options = {}) {
    options.useDefaultRenderLoop = false;
    options.contextOptions = options.contextOptions ?? {};
    options.contextOptions.webgl = options.contextOptions.webgl ?? {};
    if (!!window.webglStub) {
      options.contextOptions.getWebGLStub = getWebGLStub;
    }
    return new CesiumWidget(container, options);
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "1px";
    container.style.height = "1px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    document.body.removeChild(container);
  });

  it("exports the SceneGISWorld public interface", function () {
    expect(SceneGISWorld).toBeDefined();
  });

  it("aliases the default Globe as the primary world", function () {
    widget = createWidget({ baseLayer: false });

    expect(widget.scene.globe).toBeInstanceOf(Globe);
    expect(widget.scene.world).toBe(widget.scene.globe);
    expect(widget.scene.sun).toBeDefined();
  });

  it("preserves globe false and supports world false", function () {
    widget = createWidget({ globe: false });
    expect(widget.scene.globe).toBeUndefined();
    expect(widget.scene.world).toBeUndefined();
    expect(widget.scene.sun).toBeDefined();
    widget = widget.destroy();

    widget = createWidget({ world: false });
    expect(widget.scene.globe).toBeUndefined();
    expect(widget.scene.world).toBeUndefined();
    expect(widget.scene.skyBox).toBeUndefined();
    expect(widget.scene.skyAtmosphere).toBeUndefined();
    expect(widget.scene.moon).toBeUndefined();
    expect(widget.scene.sun).toBeUndefined();
  });

  it("constructs a custom world without default Earth environment", function () {
    const world = createMockWorld();
    Object.defineProperty(world, "shadows", {
      get: function () {
        throw new Error("A custom world must not be treated as a Globe.");
      },
      set: function () {
        throw new Error("A custom world must not be treated as a Globe.");
      },
    });

    widget = createWidget({ world: world });

    expect(widget.scene.world).toBe(world);
    expect(widget.scene.globe).toBeUndefined();
    expect(widget.scene.skyBox).toBeUndefined();
    expect(widget.scene.skyAtmosphere).toBeUndefined();
    expect(widget.scene.moon).toBeUndefined();
    expect(widget.scene.sun).toBeUndefined();
  });

  it("keeps explicitly supplied generic environment options", function () {
    const world = createMockWorld();
    const skyAtmosphere = new SkyAtmosphere();

    widget = createWidget({
      world: world,
      skyBox: false,
      skyAtmosphere: skyAtmosphere,
    });

    expect(widget.scene.skyAtmosphere).toBe(skyAtmosphere);
  });

  it("rejects world and globe together", function () {
    expect(function () {
      createWidget({ world: createMockWorld(), globe: false });
    }).toThrowDeveloperError(
      "Specify either options.world or options.globe, but not both.",
    );
  });

  ["baseLayer", "terrainProvider", "terrain", "terrainShadows"].forEach(
    function (optionName) {
      it(`rejects custom world with ${optionName}`, function () {
        const options = { world: createMockWorld() };
        options[optionName] = {};

        expect(function () {
          createWidget(options);
        }).toThrowDeveloperError(
          `options.${optionName} is not supported with a non-Globe options.world.`,
        );
      });
    },
  );

  it("runs the custom world lifecycle in the existing order", function () {
    const world = createMockWorld();
    widget = createWidget({ world: world });

    widget.render();

    expect(world.calls).toEqual(["update", "beginFrame", "render", "endFrame"]);
  });

  it("continues requesting frames while world tiles are loading", function () {
    const world = createMockWorld({ tilesLoaded: false });
    widget = createWidget({ world: world, requestRenderMode: true });

    widget.render();
    const firstFrameNumber = widget.scene.frameState.frameNumber;
    expect(widget.scene._renderRequested).toBe(true);

    widget.render();
    expect(widget.scene.frameState.frameNumber).toBeGreaterThan(
      firstFrameNumber,
    );
  });

  it("keeps a custom world when scene.globe is assigned undefined", function () {
    const world = createMockWorld();
    widget = createWidget({ world: world });

    widget.scene.globe = undefined;

    expect(widget.scene.world).toBe(world);
    expect(widget.scene.globe).toBeUndefined();
    expect(world.destroyCalls).toBe(0);
  });

  it("rejects a Globe assignment without disturbing a custom world", function () {
    const world = createMockWorld();
    widget = createWidget({ world: world });
    const globe = new Globe();

    expect(function () {
      widget.scene.globe = globe;
    }).toThrowDeveloperError(
      "scene.globe cannot be assigned while a non-Globe world is active.",
    );
    expect(widget.scene.world).toBe(world);
    expect(widget.scene.globe).toBeUndefined();
    expect(world.destroyCalls).toBe(0);

    globe.destroy();
  });

  it("destroys a custom world exactly once with its Scene", function () {
    const world = createMockWorld();
    widget = createWidget({ world: world });

    widget.destroy();

    expect(world.destroyCalls).toBe(1);
    expect(world.isDestroyed()).toBe(true);
  });

  it("replaces and removes a default Globe without listener leaks", function () {
    widget = createWidget({ baseLayer: false });
    const scene = widget.scene;
    const oldGlobe = scene.globe;
    const replacement = new Globe();
    const oldImageryEvent = oldGlobe.imageryLayersUpdatedEvent;
    const oldTerrainEvent = oldGlobe.terrainProviderChanged;
    const replacementImageryEvent = replacement.imageryLayersUpdatedEvent;
    const replacementTerrainEvent = replacement.terrainProviderChanged;
    const oldDestroy = spyOn(oldGlobe, "destroy").and.callThrough();
    const replacementDestroy = spyOn(replacement, "destroy").and.callThrough();

    expect(oldImageryEvent.numberOfListeners).toBe(1);
    expect(oldTerrainEvent.numberOfListeners).toBe(1);

    scene.globe = replacement;

    expect(oldDestroy).toHaveBeenCalledTimes(1);
    expect(oldImageryEvent.numberOfListeners).toBe(0);
    expect(oldTerrainEvent.numberOfListeners).toBe(0);
    expect(replacementImageryEvent.numberOfListeners).toBe(1);
    expect(replacementTerrainEvent.numberOfListeners).toBe(1);
    expect(scene.world).toBe(replacement);

    scene.globe = undefined;

    expect(replacementDestroy).toHaveBeenCalledTimes(1);
    expect(replacementImageryEvent.numberOfListeners).toBe(0);
    expect(replacementTerrainEvent.numberOfListeners).toBe(0);
    expect(scene.world).toBeUndefined();
    expect(scene.globe).toBeUndefined();
  });
});
