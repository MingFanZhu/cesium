import {
  Cartesian3,
  Color,
  Globe,
  Matrix4,
  Model,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISVideoProjection,
  SceneGISViewshed,
  Transforms,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISVideoProjection", function () {
  let scene, world, frame, projection;
  const media = [];
  function setup(globe = false) {
    scene = createScene({ canvas: createCanvas(64, 64) });
    world = globe
      ? new Globe()
      : new SceneGISPlanarWorld({
          coordinateSystem: new SceneGISPlanarCoordinateSystem({
            extent: new SceneGISPlanarExtent({
              minimumX: -64,
              minimumY: -64,
              maximumX: 64,
              maximumY: 64,
            }),
          }),
          maximumLevel: 0,
        });
    scene._initializeWorld(world);
    world.show = false;
    scene.postProcessStages.fxaa.enabled = false;
    frame = globe
      ? Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(118, 32, 50))
      : Matrix4.IDENTITY;
    scene.camera.setView({
      destination: point(0, 0, 10),
      orientation: {
        direction: vector(0, 0, -1),
        up: vector(0, 1, 0),
      },
    });
    scene.camera.frustum.fov = Math.PI / 2;
    scene.camera.frustum.aspectRatio = 1;
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 1000;
  }
  function point(x, y, z) {
    return Matrix4.multiplyByPoint(
      frame,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function vector(x, y, z) {
    return Matrix4.multiplyByPointAsVector(
      frame,
      new Cartesian3(x, y, z),
      new Cartesian3(),
    );
  }
  function render() {
    scene.renderForSpecs();
  }
  function until(condition) {
    return pollToPromise(
      () => {
        render();
        if (projection?.error) {
          throw projection.error;
        }
        return condition();
      },
      { timeout: 20000 },
    );
  }
  function pixel(x = 32, y = 32) {
    return Array.from(scene.context.readPixels({ x, y, width: 1, height: 1 }));
  }
  async function box(x, y, z, scale) {
    const matrix = Matrix4.multiply(
      frame,
      Matrix4.fromTranslation(new Cartesian3(x, y, z)),
      new Matrix4(),
    );
    Matrix4.multiplyByScale(matrix, scale, matrix);
    const model = scene.primitives.add(
      await Model.fromGltfAsync({
        url: "./Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
        modelMatrix: matrix,
        incrementallyLoadTextures: false,
      }),
    );
    await until(() => model.ready);
    return model;
  }
  async function video(width = 64, height = 32, color) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    for (const [i, c] of [
      "red",
      "lime",
      "blue",
      "rgb(128,128,128)",
    ].entries()) {
      context.fillStyle = color ?? c;
      context.fillRect(
        ((i % 2) * width) / 2,
        (Math.floor(i / 2) * height) / 2,
        width / 2,
        height / 2,
      );
    }
    const stream = canvas.captureStream(0);
    const element = document.createElement("video");
    element.muted = true;
    element.playsInline = true;
    element.srcObject = stream;
    const fixture = {
      element,
      stream,
      canvas,
      context,
      track: stream.getVideoTracks()[0],
    };
    media.push(fixture);
    const presented = new Promise((resolve) =>
      element.requestVideoFrameCallback(resolve),
    );
    fixture.track.requestFrame();
    await element.play();
    await presented;
    element.pause();
    return fixture;
  }
  function add(element, sources, options = {}) {
    projection = scene.postProcessStages.add(
      new SceneGISVideoProjection({
        scene,
        world,
        video: element,
        position: point(0, 0, 10),
        direction: vector(0, 0, -1),
        up: vector(0, 1, 0),
        distance: 100,
        horizontalAngle: Math.PI / 2,
        verticalAngle: Math.PI / 2,
        resolution: 128,
        terrain: false,
        sources,
        ...options,
      }),
    );
    return projection;
  }
  afterEach(function () {
    scene?.destroyForSpecs();
    scene = undefined;
    projection = undefined;
    for (const fixture of media.splice(0)) {
      fixture.element.pause();
      fixture.stream?.getTracks().forEach((track) => track.stop());
      fixture.element.removeAttribute("src");
      fixture.element.srcObject = null;
      fixture.element.load();
    }
  });

  [false, true].forEach((globe) => {
    it(`contains oriented SDR frames and preserves color in HDR/LDR in ${globe ? "Globe" : "Planar"}`, async function () {
      setup(globe);
      const floor = await box(0, 0, -0.2, new Cartesian3(50, 50, 0.2));
      const fixture = await video();
      add(fixture.element, [floor]);
      await until(() => projection.projectionReady && projection.ready);
      for (const hdr of [false, true]) {
        scene.highDynamicRange = hdr;
        scene.postProcessStages.exposure = 2;
        render();
        expect(pixel(16, 40)).toEqualEpsilon([255, 0, 0, 255], 3);
        expect(pixel(48, 40)).toEqualEpsilon([0, 255, 0, 255], 3);
        expect(pixel(16, 24)).toEqualEpsilon([0, 0, 255, 255], 3);
        expect(pixel(48, 24)).toEqualEpsilon([128, 128, 128, 255], 3);
        const bar = pixel(16, 56);
        projection.enabled = false;
        render();
        expect(pixel(16, 56)).toEqual(bar);
        projection.enabled = true;
      }
      render();
      const texture = projection._observer.media.texture;
      const uploads = projection.statistics.videoUploads;
      for (let i = 0; i < 5; i++) {
        render();
      }
      expect(projection.statistics.videoUploads).toBe(uploads);
      projection.flipY = true;
      render();
      expect(pixel(16, 40)).toEqualEpsilon([0, 0, 255, 255], 3);
      projection.opacity = 0;
      render();
      const original = pixel(16, 40);
      projection.opacity = 0.5;
      render();
      expect(pixel(16, 40)).toEqualEpsilon(
        original.map((v, i) => (i === 3 ? v : (v + [0, 0, 255][i]) / 2)),
        3,
      );
      const black = await video(32, 32, "black");
      projection.video = black.element;
      projection.opacity = 1;
      expect(projection.videoReady).toBe(false);
      await until(() => projection.projectionReady);
      expect(pixel()).toEqual([0, 0, 0, 255]);
      expect(texture.isDestroyed()).toBe(true);
      const current = projection._observer.media.texture;
      const cancel = spyOn(
        black.element,
        "cancelVideoFrameCallback",
      ).and.callThrough();
      scene.postProcessStages.remove(projection);
      projection = undefined;
      expect(current.isDestroyed()).toBe(true);
      expect(cancel).toHaveBeenCalled();
      expect(black.track.readyState).toBe("live");
      expect(floor.isDestroyed()).toBe(false);
    });

    it(`keeps video frozen while offscreen occluders move and coexists with analysis in ${globe ? "Globe" : "Planar"}`, async function () {
      setup(globe);
      const floor = await box(0, 0, -0.2, new Cartesian3(50, 50, 0.2));
      const wall = await box(0, -5, 3, new Cartesian3(4, 1, 6));
      const fixture = await video(32, 32, "red");
      const original = pixel();
      const shadow = scene.shadowMap;
      shadow.enabled = true;
      const p = add(fixture.element, [floor, wall], {
        position: point(0, -10, 2),
        direction: vector(0, 1, 0),
        up: vector(0, 0, 1),
      });
      const analysis = scene.postProcessStages.add(
        new SceneGISViewshed({
          scene,
          world,
          position: point(0, -10, 2),
          direction: vector(0, 1, 0),
          up: vector(0, 0, 1),
          terrain: false,
          sources: [floor, wall],
          resolution: 32,
          distance: 100,
          visibleColor: Color.TRANSPARENT,
          hiddenColor: Color.TRANSPARENT,
        }),
      );
      await until(() => p.projectionReady && p.ready && analysis.ready);
      const unprojected = pixel();
      expect(unprojected).not.toEqual([255, 0, 0, 255]);
      const uploads = p.statistics.videoUploads;
      wall.show = false;
      render();
      expect(pixel()).toEqualEpsilon([255, 0, 0, 255], 3);
      expect(p.statistics.videoUploads).toBe(uploads);
      expect(p._observer.depth.texture).not.toBe(
        analysis._observer.depth.texture,
      );
      expect(scene.shadowMap).toBe(shadow);
      expect(scene.frameState.camera).toBe(scene.camera);
      expect(original[3]).toBe(255);
      wall.show = true;
      render();
      expect(pixel()).toEqual(unprojected);
      p.enabled = false;
      render();
      expect(p.status).toBe("disabled");
      expect(p._observer.media._callback).toBeUndefined();
    });
  });

  it("requests a render per new frame, skips duplicate uploads and cancels obsolete media callbacks", async function () {
    setup();
    const fixture = await video(32, 32, "red");
    const callbacks = [];
    const nativeRequest = fixture.element.requestVideoFrameCallback.bind(
      fixture.element,
    );
    spyOn(fixture.element, "requestVideoFrameCallback").and.callFake(
      (callback) => {
        callbacks.push(callback);
        return nativeRequest(callback);
      },
    );
    add(fixture.element, []);
    await until(() => projection.videoReady);
    const uploads = projection.statistics.videoUploads;
    const request = spyOn(scene, "requestRender").and.callThrough();
    const framePresented = new Promise((resolve) => nativeRequest(resolve));
    const playing = fixture.element.play();
    fixture.context.fillStyle = "blue";
    fixture.context.fillRect(0, 0, 32, 32);
    fixture.track.requestFrame();
    await playing;
    await framePresented;
    fixture.element.pause();
    expect(request).toHaveBeenCalled();
    expect(projection.statistics.videoUploads).toBe(uploads);
    render();
    expect(projection.statistics.videoUploads).toBe(uploads + 1);
    for (let i = 0; i < 5; i++) {
      render();
    }
    expect(projection.statistics.videoUploads).toBe(uploads + 1);
    const obsolete = callbacks[callbacks.length - 1];
    const second = await video(16, 16, "black");
    projection.video = second.element;
    await until(() => projection.videoReady);
    const currentUploads = projection.statistics.videoUploads;
    obsolete();
    render();
    expect(projection.statistics.videoUploads).toBe(currentUploads);
    const owner = projection._observer.media;
    scene.postProcessStages.remove(projection);
    projection = undefined;
    expect(owner.isDestroyed()).toBe(true);
    expect(() => obsolete()).not.toThrow();
    expect(fixture.track.readyState).toBe("live");
    expect(second.track.readyState).toBe("live");
  });

  it("invalidates callbacks and texture dimensions when the same video element changes stream", async function () {
    setup();
    const first = await video(32, 32, "red");
    const callbacks = [];
    const request = first.element.requestVideoFrameCallback.bind(first.element);
    spyOn(first.element, "requestVideoFrameCallback").and.callFake(
      (callback) => {
        callbacks.push(callback);
        return request(callback);
      },
    );
    add(first.element, []);
    await until(() => projection.videoReady);
    const oldTexture = projection._observer.media.texture;
    const obsolete = callbacks[callbacks.length - 1];
    const second = await video(64, 32, "blue");
    first.element.srcObject = second.stream;
    const playing = first.element.play();
    second.track.requestFrame();
    await playing;
    await until(
      () =>
        projection.videoReady &&
        projection._observer.media.texture.width === 64,
    );
    first.element.pause();
    expect(oldTexture.isDestroyed()).toBe(true);
    expect(projection.video).toBe(first.element);
    const currentCallback = projection._observer.media._callback;
    obsolete();
    expect(projection._observer.media._callback).toBe(currentCallback);
    expect(projection.error).toBeUndefined();
  });

  it("defines transparent foreground as a display overlay and preserves the scene outside projection", async function () {
    setup();
    const floor = await box(0, 0, -0.2, new Cartesian3(50, 50, 0.2));
    const glass = await box(0, 0, 3, new Cartesian3(8, 8, 1));
    glass.color = Color.BLUE.withAlpha(0.5);
    const fixture = await video(32, 32, "red");
    add(fixture.element, [floor, glass]);
    await until(() => projection.projectionReady && projection.ready);
    expect(pixel()).toEqualEpsilon([255, 0, 0, 255], 3);
    projection.setView({
      position: point(100, 0, 10),
      direction: vector(0, 0, -1),
      up: vector(0, 1, 0),
    });
    render();
    const outside = pixel();
    projection.enabled = false;
    render();
    expect(pixel()).toEqual(outside);
    expect(outside).not.toEqual([255, 0, 0, 255]);
  });

  it("invalidates seeking and source reload, reports media errors and validates bindings", async function () {
    setup();
    const element = document.createElement("video");
    element.muted = true;
    media.push({ element });
    element.src = "./Data/Videos/big-buck-bunny-trailer-small.webm";
    add(element, []);
    expect(projection.videoReady).toBe(false);
    await until(() => projection.videoReady);
    const errors = jasmine.createSpy("mediaError");
    projection.errorEvent.addEventListener(errors);
    element.currentTime = 1;
    render();
    expect(projection.videoReady).toBe(false);
    await until(() => !element.seeking && projection.videoReady);
    const uploads = projection.statistics.videoUploads;
    render();
    render();
    expect(projection.statistics.videoUploads).toBe(uploads);
    element.load();
    render();
    expect(projection.videoReady).toBe(false);
    await until(() => projection.videoReady);
    element.dispatchEvent(new Event("error"));
    expect(projection.status).toBe("error");
    expect(errors).toHaveBeenCalledTimes(1);
    expect(() => {
      projection.video = {};
    }).toThrowDeveloperError();
    expect(projection.video).toBe(element);
    expect(() => {
      projection.opacity = 2;
    }).toThrowDeveloperError();
    expect(() => {
      projection.flipY = 1;
    }).toThrowDeveloperError();
    const otherWorld = new Globe();
    expect(() =>
      add(element, [], { world: otherWorld }),
    ).toThrowDeveloperError();
    otherWorld.destroy();
  });
});
