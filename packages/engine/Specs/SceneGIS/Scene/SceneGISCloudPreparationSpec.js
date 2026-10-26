import { Globe, Resource, SceneGISEnvironmentEffects } from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISCloudPreparation", function () {
  let scene;
  let effects;
  let held;
  let queries;

  async function initialize() {
    scene = createScene();
    scene.globe = new Globe();
    scene.globe.showGroundAtmosphere = false;
    scene.globe.enableLighting = false;
    for (const name of ["skyAtmosphere", "sun", "moon", "skyBox"]) {
      if (scene[name]) {
        scene[name].show = false;
      }
    }
    scene.sunBloom = false;
    scene.fog.enabled = false;
    scene.highDynamicRange = true;
    scene.frameState.useLogDepth = true;
    effects = new SceneGISEnvironmentEffects({
      mode: "globe",
      enabled: true,
      showClouds: false,
      showCloudShadows: false,
      showCrepuscularRays: false,
      showBloom: false,
      showLensFlare: false,
    });
    effects.connectedCallback({});
    effects.firstUpdate(scene, scene.frameState.time);
    await pollToPromise(
      () => {
        effects.update(scene, scene.frameState.time);
        return effects.ready;
      },
      { timeout: 60000 },
    );
    const gl = scene.context._gl;
    const extension = gl.getExtension("KHR_parallel_shader_compile");
    if (!extension) {
      pending("KHR_parallel_shader_compile is unavailable");
    }
    held = true;
    const getParameter = gl.getProgramParameter.bind(gl);
    queries = spyOn(gl, "getProgramParameter").and.callFake((program, name) =>
      held && name === extension.COMPLETION_STATUS_KHR
        ? false
        : getParameter(program, name),
    );
  }

  function update() {
    effects.update(scene, scene.frameState.time);
  }

  async function startClouds() {
    effects.showClouds = true;
    await pollToPromise(() => {
      update();
      return !!effects._pipeline._pendingCloudResources;
    });
  }

  afterEach(function () {
    effects?.disconnectedCallback(effects._element);
    scene?.destroyForSpecs();
    effects = undefined;
    scene = undefined;
  });

  it("publishes three current-depth programs atomically, then reuses assets and both depth variants", async function () {
    await initialize();
    const pipeline = effects._pipeline;
    const resources = pipeline._resources;
    const previousAerial = resources.aerialLogDepthProgram;
    const fetch = spyOn(Resource, "fetchArrayBuffer").and.callThrough();
    const link = spyOn(scene.context._gl, "linkProgram").and.callThrough();
    const request = spyOn(scene, "requestRender").and.callThrough();
    await startClouds();
    expect(link.calls.count()).toBe(3);
    expect(
      Object.keys(pipeline._pendingCloudResources.resources).sort(),
    ).toEqual([
      "aerialLogDepthProgram",
      "cloudLogDepthProgram",
      "cloudResolveLogDepthProgram",
    ]);
    expect(pipeline.hasCloudTextures()).toBe(false);
    expect(effects.ready).toBe(false);
    expect(resources.aerialLogDepthProgram).toBe(previousAerial);
    expect(
      queries.calls
        .allArgs()
        .some((args) => args[1] === scene.context._gl.LINK_STATUS),
    ).toBe(false);
    expect(request).toHaveBeenCalled();
    held = false;
    await pollToPromise(
      () => {
        update();
        return effects.ready;
      },
      { timeout: 60000 },
    );
    expect(fetch.calls.count()).toBe(5);
    expect(resources.cloudProgram).toBeUndefined();
    expect(resources.cloudLogDepthProgram).toBeDefined();
    expect(resources.aerialLogDepthProgram).not.toBe(previousAerial);
    expect(effects._pendingCloudBuffers).toBeUndefined();
    const shape = resources.cloudShapeTexture;
    const logProgram = resources.cloudLogDepthProgram;
    scene.frameState.useLogDepth = false;
    held = true;
    update();
    expect(effects.ready).toBe(false);
    expect(link.calls.count()).toBe(6);
    expect(resources.cloudShapeTexture).toBe(shape);
    expect(resources.cloudProgram).toBeUndefined();
    held = false;
    await pollToPromise(
      () => {
        update();
        return effects.ready;
      },
      { timeout: 60000 },
    );
    expect(resources.cloudProgram).toBeDefined();
    scene.frameState.useLogDepth = true;
    update();
    expect(effects.ready).toBe(true);
    expect(resources.cloudLogDepthProgram).toBe(logProgram);
    expect(resources.cloudShapeTexture).toBe(shape);
    effects.showClouds = false;
    update();
    effects.showClouds = true;
    update();
    expect(link.calls.count()).toBe(6);
    expect(fetch.calls.count()).toBe(5);
    effects.enabled = false;
    expect(() => effects.ready).not.toThrow();
  }, 120000);

  it("cancels pending references on hide and disable, and reports preparation failure once", async function () {
    await initialize();
    const pipeline = effects._pipeline;
    const resources = pipeline._resources;
    await startClouds();
    const first = Object.values(pipeline._pendingCloudResources.resources);
    effects.showClouds = false;
    scene.context.shaderCache.destroyReleasedShaderPrograms();
    expect(pipeline._pendingCloudResources).toBeUndefined();
    first.forEach((program) => expect(program.isDestroyed()).toBe(true));
    effects.showClouds = true;
    update();
    const second = Object.values(pipeline._pendingCloudResources.resources);
    effects.enabled = false;
    scene.context.shaderCache.destroyReleasedShaderPrograms();
    second.forEach((program) => expect(program.isDestroyed()).toBe(true));
    expect(pipeline._resources).toBe(resources);
    effects.enabled = true;
    await startClouds();
    const error = new Error("cloud preparation failure");
    const pendingPrograms = Object.values(
      pipeline._pendingCloudResources.resources,
    );
    spyOn(pendingPrograms[1], "_prepare").and.throwError(error);
    const errors = jasmine.createSpy("errors");
    effects.errorEvent.addEventListener(errors);
    update();
    update();
    expect(errors.calls.count()).toBe(1);
    expect(errors.calls.argsFor(0)).toEqual([effects, error]);
    expect(effects.ready).toBe(false);
    expect(pipeline._resources).toBe(resources);
    expect(pipeline._pendingCloudResources).toBeUndefined();
    scene.context.shaderCache.destroyReleasedShaderPrograms();
    pendingPrograms.forEach((program) =>
      expect(program.isDestroyed()).toBe(true),
    );
  }, 120000);
  it("prepares optional shadow programs before allocating or publishing their atlas", async function () {
    await initialize();
    await startClouds();
    held = false;
    await pollToPromise(
      () => {
        update();
        return effects.ready;
      },
      { timeout: 60000 },
    );
    const pipeline = effects._pipeline;
    held = true;
    effects.showCloudShadows = true;
    update();
    expect(Object.keys(pipeline._pendingShadowPrograms).length).toBe(2);
    expect(pipeline._globeShadowResources).toBeUndefined();
    expect(effects.ready).toBe(false);
    expect(pipeline._globeLightingRecord.showCloudShadows).toBe(false);
    held = false;
    await pollToPromise(
      () => {
        update();
        return effects.ready;
      },
      { timeout: 60000 },
    );
    expect(pipeline._pendingShadowPrograms).toBeUndefined();
    expect(pipeline._globeShadowResources.currentFramebuffer).toBeDefined();
    const program = pipeline._globeShadowResources.program;
    const resolve = pipeline._globeShadowResources.resolveProgram;
    effects.enabled = false;
    scene.context.shaderCache.destroyReleasedShaderPrograms();
    expect(program.isDestroyed()).toBe(true);
    expect(resolve.isDestroyed()).toBe(true);
  }, 120000);
});
