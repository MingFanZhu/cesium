import {
  Cartesian3,
  Color,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveFrustum,
  PerspectiveOffCenterFrustum,
} from "../../../../index.js";
import SceneGISPlanarCelestialBodyRenderer from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarCelestialBodyRenderer.js";
import SceneGISPlanarCamera from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js";

describe("SceneGIS/Scene/_private/SceneGISPlanarCelestialBodyRenderer", function () {
  function frameState(frustum) {
    return {
      camera: { frustum },
      context: {
        canvas: { clientWidth: 100, clientHeight: 50 },
        drawingBufferWidth: 200,
        drawingBufferHeight: 100,
      },
    };
  }

  function configurePose(renderer) {
    Cartesian3.clone(Cartesian3.ZERO, renderer._pose.position);
    Cartesian3.clone(Cartesian3.UNIT_Y, renderer._pose.direction);
    Cartesian3.clone(Cartesian3.UNIT_Z, renderer._pose.up);
    Cartesian3.clone(Cartesian3.UNIT_X, renderer._pose.right);
  }

  function passState(width = 200, height = 100) {
    return { viewport: { x: 0, y: 0, width, height } };
  }

  function resource(options = {}) {
    return {
      destroy: jasmine.createSpy("destroy"),
      isDestroyed: function () {
        return this.destroy.calls.count() > 0;
      },
      _bind: jasmine.createSpy("bind"),
      ...options,
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

  function renderFixture(renderer) {
    const frustum = new PerspectiveFrustum({
      fov: Math.PI * 0.5,
      aspectRatio: 2.0,
      near: 1.0,
      far: 100.0,
    });
    const state = frameState(frustum);
    state.camera.positionWC = new Cartesian3(0.0, 0.0, 10.0);
    state.camera.directionWC = Cartesian3.UNIT_Y;
    state.camera.upWC = Cartesian3.UNIT_Z;
    state.camera.rightWC = Cartesian3.UNIT_X;
    const environment = {
      _scene: {},
      _showSun: true,
      _showMoon: true,
      _effectiveSunDirection: new Cartesian3(0.0, 1.0, 0.25),
      _effectiveMoonDirection: new Cartesian3(0.0, 1.0, 0.25),
      _sunPixelSize: 20.0,
      _moonPixelSize: 10.0,
      _sunColor: Color.WHITE,
      _moonColor: Color.LIGHTGRAY,
      _validateNativeEnvironmentConflict: jasmine.createSpy("validateConflict"),
    };
    const world = {
      getTerrainHeight: jasmine
        .createSpy("getTerrainHeight")
        .and.returnValue(0),
    };
    return { environment, frameState: state, passState: passState(), world };
  }

  it("projects the center through all four supported frustums", function () {
    const renderer = new SceneGISPlanarCelestialBodyRenderer();
    configurePose(renderer);
    const perspective = new PerspectiveFrustum({
      fov: Math.PI * 0.5,
      aspectRatio: 2.0,
      near: 1.0,
      far: 100.0,
    });
    const perspectiveOffCenter = new PerspectiveOffCenterFrustum({
      left: -2.0,
      right: 2.0,
      bottom: -1.0,
      top: 1.0,
      near: 1.0,
      far: 100.0,
    });
    const orthographic = new OrthographicFrustum({
      width: 4.0,
      aspectRatio: 2.0,
      near: 1.0,
      far: 100.0,
    });
    const orthographicOffCenter = new OrthographicOffCenterFrustum({
      left: -2.0,
      right: 2.0,
      bottom: -1.0,
      top: 1.0,
      near: 1.0,
      far: 100.0,
    });

    for (const frustum of [
      perspective,
      perspectiveOffCenter,
      orthographic,
      orthographicOffCenter,
    ]) {
      expect(
        renderer._projectBody(
          new Cartesian3(0.0, 1.0, 0.5),
          20.0,
          renderer._sun,
          frameState(frustum),
          passState(),
        ),
      ).toBe(true);
      expect(renderer._sun.center.x).toBeCloseTo(0.0, 12);
      expect(renderer._sun.scale.x).toBeCloseTo(0.2, 12);
      expect(renderer._sun.scale.y).toBeCloseTo(0.4, 12);
    }
    renderer.destroy();
  });

  it("applies off-center shift and rejects horizon and camera-back directions", function () {
    const renderer = new SceneGISPlanarCelestialBodyRenderer();
    configurePose(renderer);
    const frustum = new PerspectiveOffCenterFrustum({
      left: -1.0,
      right: 3.0,
      bottom: -1.0,
      top: 1.0,
      near: 1.0,
      far: 100.0,
    });
    expect(
      renderer._projectBody(
        new Cartesian3(0.0, 1.0, 0.5),
        10.0,
        renderer._sun,
        frameState(frustum),
        passState(),
      ),
    ).toBe(true);
    expect(renderer._sun.center.x).toBeCloseTo(-0.5, 12);
    const orthographicOffCenter = new OrthographicOffCenterFrustum({
      left: -1.0,
      right: 3.0,
      bottom: -2.0,
      top: 1.0,
      near: 1.0,
      far: 100.0,
    });
    expect(
      renderer._projectBody(
        new Cartesian3(0.0, 1.0, 0.5),
        10.0,
        renderer._sun,
        frameState(orthographicOffCenter),
        passState(),
      ),
    ).toBe(true);
    expect(renderer._sun.center.x).toBeCloseTo(-0.5, 12);
    expect(renderer._sun.center.y).toBeCloseTo(5.0 / 6.0, 12);
    expect(
      renderer._projectBody(
        new Cartesian3(0.0, 1.0, 0.0),
        10.0,
        renderer._sun,
        frameState(frustum),
        passState(),
      ),
    ).toBe(false);
    expect(
      renderer._projectBody(
        new Cartesian3(0.0, -1.0, 1.0),
        10.0,
        renderer._sun,
        frameState(frustum),
        passState(),
      ),
    ).toBe(false);
    expect(
      renderer._projectBody(
        new Cartesian3(10.0, 1.0, 1.0),
        10.0,
        renderer._sun,
        frameState(frustum),
        passState(),
      ),
    ).toBe(false);
    renderer.destroy();
  });

  it("uses high-DPI partial viewport CSS dimensions on both axes", function () {
    const renderer = new SceneGISPlanarCelestialBodyRenderer();
    configurePose(renderer);
    const frustum = new PerspectiveFrustum({
      fov: Math.PI * 0.5,
      aspectRatio: 2.0,
      near: 1.0,
      far: 100.0,
    });
    expect(
      renderer._projectBody(
        new Cartesian3(0.0, 1.0, 0.5),
        10.0,
        renderer._sun,
        frameState(frustum),
        passState(100, 25),
      ),
    ).toBe(true);
    expect(renderer._sun.scale.x).toBeCloseTo(0.2, 12);
    expect(renderer._sun.scale.y).toBeCloseTo(0.8, 12);
    renderer.destroy();
  });

  it("cleans an unowned candidate buffer when VertexArray construction fails", function () {
    const renderer = new SceneGISPlanarCelestialBodyRenderer();
    const factory = resourceFactory();
    const buffer = resource();
    factory.createVertexBuffer.and.returnValue(buffer);
    factory.createVertexArray.and.throwError("injected VertexArray failure");
    renderer._resourceFactory = factory;

    expect(() => renderer._ensureResources({})).toThrow();
    expect(buffer.destroy).toHaveBeenCalledTimes(1);
    expect(factory.createShaderProgram).not.toHaveBeenCalled();
    expect(renderer._context).toBeUndefined();
    expect(renderer._vertexArray).toBeUndefined();
    expect(renderer._shaderProgram).toBeUndefined();
    expect(renderer._sunCommand).toBeUndefined();
    expect(renderer._moonCommand).toBeUndefined();
    renderer.destroy();
  });

  it("recreates resources for a second Context and destroys exactly once", function () {
    const firstContext = {};
    const secondContext = {};
    const renderer = new SceneGISPlanarCelestialBodyRenderer();
    renderer._resourceFactory = resourceFactory();
    expect(renderer._vertexArray).toBeUndefined();
    expect(renderer._shaderProgram).toBeUndefined();

    renderer._ensureResources(firstContext);
    const firstVertexArray = renderer._vertexArray;
    const firstShaderProgram = renderer._shaderProgram;
    renderer._ensureResources(secondContext);
    expect(firstVertexArray.isDestroyed()).toBe(true);
    expect(firstShaderProgram.isDestroyed()).toBe(true);
    const secondVertexArray = renderer._vertexArray;
    const secondShaderProgram = renderer._shaderProgram;
    expect(secondVertexArray).not.toBe(firstVertexArray);
    expect(secondShaderProgram).not.toBe(firstShaderProgram);

    renderer.destroy();
    expect(secondVertexArray.isDestroyed()).toBe(true);
    expect(secondShaderProgram.isDestroyed()).toBe(true);
    expect(firstVertexArray.destroy).toHaveBeenCalledTimes(1);
    expect(firstShaderProgram.destroy).toHaveBeenCalledTimes(1);
    expect(secondVertexArray.destroy).toHaveBeenCalledTimes(1);
    expect(secondShaderProgram.destroy).toHaveBeenCalledTimes(1);
  });

  it("classifies one shared frustum scratch for both visible bodies", function () {
    const renderer = new SceneGISPlanarCelestialBodyRenderer();
    renderer._resourceFactory = resourceFactory();
    const fixture = renderFixture(renderer);
    renderer._ensureResources(fixture.frameState.context);
    spyOn(renderer._sunCommand, "execute");
    spyOn(renderer._moonCommand, "execute");
    const scratch = renderer._frustumInfo;
    const classify = spyOn(
      SceneGISPlanarCamera,
      "getFrustumInfo",
    ).and.callThrough();

    renderer.render(
      fixture.world,
      fixture.environment,
      fixture.frameState,
      fixture.passState,
    );
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify.calls.argsFor(0)[1]).toBe(scratch);
    expect(renderer._frustumInfo).toBe(scratch);
    expect(renderer._sunCommand.execute).toHaveBeenCalledTimes(1);
    expect(renderer._moonCommand.execute).toHaveBeenCalledTimes(1);
    renderer.destroy();
  });
});
