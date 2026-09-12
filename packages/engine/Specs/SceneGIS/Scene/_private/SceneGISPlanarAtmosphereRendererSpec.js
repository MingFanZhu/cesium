import {
  Cartesian3,
  Color,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveFrustum,
  PerspectiveOffCenterFrustum,
} from "../../../../index.js";
import SceneGISPlanarAtmosphereRenderer from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarAtmosphereRenderer.js";

describe("SceneGIS/Scene/_private/SceneGISPlanarAtmosphereRenderer", function () {
  function resource() {
    return {
      destroy: jasmine.createSpy("destroy"),
      isDestroyed: function () {
        return this.destroy.calls.count() > 0;
      },
      _bind: jasmine.createSpy("bind"),
    };
  }

  function resourceFactory() {
    return {
      createVertexBuffer: jasmine
        .createSpy("createVertexBuffer")
        .and.callFake(() => resource()),
      createVertexArray: jasmine
        .createSpy("createVertexArray")
        .and.callFake((options) => {
          const vertexArray = resource();
          vertexArray.destroy.and.callFake(() => {
            options.attributes[0].vertexBuffer.destroy();
          });
          return vertexArray;
        }),
      createShaderProgram: jasmine
        .createSpy("createShaderProgram")
        .and.callFake(() => resource()),
      getRenderState: jasmine.createSpy("getRenderState").and.returnValue({}),
    };
  }

  function camera(frustum) {
    return {
      frustum,
      positionWC: new Cartesian3(0.0, 0.0, 200.0),
      directionWC: Cartesian3.UNIT_Y,
      upWC: Cartesian3.UNIT_Z,
      rightWC: Cartesian3.UNIT_X,
    };
  }

  function perspective() {
    return new PerspectiveFrustum({
      fov: Math.PI * 0.5,
      aspectRatio: 2.0,
      near: 1.0,
      far: 1000.0,
    });
  }

  it("keeps default construction GPU-empty and prepares resident underground state", function () {
    const renderer = new SceneGISPlanarAtmosphereRenderer();
    expect(renderer._context).toBeUndefined();
    expect(renderer._vertexArray).toBeUndefined();
    expect(renderer._shaderProgram).toBeUndefined();
    expect(renderer._command).toBeUndefined();
    const world = {
      getTerrainHeight: jasmine.createSpy().and.returnValue(250),
    };
    const state = renderer.prepare(world, { camera: camera(perspective()) });
    expect(state.underground).toBe(true);
    expect(state.terrainHeight).toBe(250);
    world.getTerrainHeight.and.returnValue(undefined);
    expect(
      renderer.prepare(world, { camera: camera(perspective()) }).underground,
    ).toBe(false);
    renderer.destroy();
  });

  it("classifies all four frusta with deterministic off-center directions", function () {
    const renderer = new SceneGISPlanarAtmosphereRenderer();
    const frusta = [
      perspective(),
      new PerspectiveOffCenterFrustum({
        left: -1.0,
        right: 3.0,
        bottom: -2.0,
        top: 1.0,
        near: 1.0,
        far: 1000.0,
      }),
      new OrthographicFrustum({
        width: 4.0,
        aspectRatio: 2.0,
        near: 1.0,
        far: 1000.0,
      }),
      new OrthographicOffCenterFrustum({
        left: -1.0,
        right: 3.0,
        bottom: -2.0,
        top: 1.0,
        near: 1.0,
        far: 1000.0,
      }),
    ];
    const scratch = renderer._frustumInfo;
    for (const frustum of frusta) {
      renderer.prepare(
        { getTerrainHeight: () => 0.0 },
        { camera: camera(frustum) },
      );
      renderer._setProjection({ camera: camera(frustum) });
      expect(renderer._frustumInfo).toBe(scratch);
      expect(Number.isFinite(renderer._cameraDirection.x)).toBe(true);
      expect(Number.isFinite(renderer._cameraDirection.y)).toBe(true);
      expect(Number.isFinite(renderer._cameraDirection.z)).toBe(true);
      if (frustum === frusta[1]) {
        expect(renderer._frustumSlopes.x).toBe(-1.0);
        expect(renderer._frustumSlopes.y).toBe(3.0);
        expect(renderer._frustumSlopes.z).toBe(-2.0);
        expect(renderer._frustumSlopes.w).toBe(1.0);
      }
    }
    expect(renderer._frustumInfo.type).toBe("orthographicOffCenter");
    expect(renderer._cameraDirection).toEqual(Cartesian3.UNIT_Y);
    renderer.destroy();
  });

  it("cleans candidate failure without publishing partial resources", function () {
    const renderer = new SceneGISPlanarAtmosphereRenderer();
    const factory = resourceFactory();
    const buffer = resource();
    factory.createVertexBuffer.and.returnValue(buffer);
    factory.createVertexArray.and.throwError("injected VertexArray failure");
    renderer._resourceFactory = factory;
    expect(() => renderer._ensureResources({})).toThrow();
    expect(buffer.destroy).toHaveBeenCalledTimes(1);
    expect(renderer._context).toBeUndefined();
    expect(renderer._vertexArray).toBeUndefined();
    expect(renderer._shaderProgram).toBeUndefined();
    expect(renderer._command).toBeUndefined();
    renderer.destroy();
  });

  it("recreates for a second Context and destroys each resource exactly once", function () {
    const renderer = new SceneGISPlanarAtmosphereRenderer();
    renderer._resourceFactory = resourceFactory();
    renderer._ensureResources({ id: 1 });
    const firstVertexArray = renderer._vertexArray;
    const firstShaderProgram = renderer._shaderProgram;
    renderer._ensureResources({ id: 2 });
    expect(firstVertexArray.isDestroyed()).toBe(true);
    expect(firstShaderProgram.isDestroyed()).toBe(true);
    const secondVertexArray = renderer._vertexArray;
    const secondShaderProgram = renderer._shaderProgram;
    spyOn(renderer._command, "execute");
    renderer.renderMask(
      { context: renderer._context },
      {},
      Color.DARKSLATEGRAY,
    );
    expect(renderer._mask).toBe(true);
    expect(renderer._backgroundColor).toEqual(Color.DARKSLATEGRAY);
    expect(renderer._command.execute).toHaveBeenCalledTimes(1);
    renderer.destroy();
    expect(firstVertexArray.destroy).toHaveBeenCalledTimes(1);
    expect(firstShaderProgram.destroy).toHaveBeenCalledTimes(1);
    expect(secondVertexArray.destroy).toHaveBeenCalledTimes(1);
    expect(secondShaderProgram.destroy).toHaveBeenCalledTimes(1);
  });
});
