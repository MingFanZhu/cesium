import {
  Cartesian3,
  CesiumWidget,
  Color,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "../../../index.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";

describe("SceneGIS/Widget/SceneGISPlanarWorldCesiumWidget", function () {
  let container;
  let widget;

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
      maximumLevel: 3,
      maximumScreenSpaceError: 2.0,
      baseColor: Color.LIME,
    });
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "16px";
    container.style.height = "16px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    document.body.removeChild(container);
  });

  it("renders a planar primary world without Globe or Earth defaults", function () {
    const world = createWorld();
    const contextOptions = { webgl: {} };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      contextOptions,
    });

    expect(widget.scene.world).toBe(world);
    expect(widget.scene.globe).toBeUndefined();
    expect(widget.scene.skyBox).toBeUndefined();
    expect(widget.scene.skyAtmosphere).toBeUndefined();
    expect(widget.scene.moon).toBeUndefined();
    expect(widget.scene.sun).toBeUndefined();

    widget.scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 64.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: new Cartesian3(0.0, 1.0, 0.0),
      },
    });

    expect(widget.scene).toRenderAndCall(function (rgba) {
      for (let i = 0; i < rgba.length; i += 4) {
        expect(Array.from(rgba.slice(i, i + 4))).toEqual([0, 255, 0, 255]);
      }
    });
    expect(world._surface._debug.submittedCommands).toBeGreaterThan(0);
    expect(world._surface._quadtree._debug.selected).toBeGreaterThan(0);
  });
});
