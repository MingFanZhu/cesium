import createScene from "../../../../../../Specs/createScene.js";
import SceneGISEnvironmentEffectsPipeline from "../../../../Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsPipeline.js";

describe("SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipeline", function () {
  let scene;
  let otherScene;
  let pipeline;

  beforeEach(function () {
    scene = createScene();
    otherScene = createScene();
    pipeline = new SceneGISEnvironmentEffectsPipeline();
  });

  afterEach(function () {
    if (pipeline && !pipeline.isDestroyed()) {
      pipeline.destroy();
    }
    if (scene && !scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
    if (otherScene && !otherScene.isDestroyed()) {
      otherScene.destroyForSpecs();
    }
  });

  it("attaches once and rejects duplicate and cross-Scene authority", function () {
    const competing = new SceneGISEnvironmentEffectsPipeline();
    pipeline.attach(scene);

    expect(scene._sceneGISEnvironmentEffectsPipeline).toBe(pipeline);
    expect(function () {
      pipeline.attach(scene);
    }).toThrowDeveloperError();
    expect(function () {
      pipeline.attach(otherScene);
    }).toThrowDeveloperError();
    expect(function () {
      competing.attach(scene);
    }).toThrowDeveloperError();
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBe(pipeline);

    competing.destroy();
  });

  it("keeps inactive execution identity and activates without resources", function () {
    const context = scene.context;
    const texture = context.defaultTexture;
    pipeline.attach(scene);
    const background = spyOn(pipeline, "renderBackground").and.callThrough();
    const hdr = spyOn(pipeline, "executeHdr").and.callThrough();

    pipeline._renderBackground(scene, scene.frameState, scene._view.passState);
    expect(
      pipeline._executeHdr(scene, context, texture, texture, texture),
    ).toBe(texture);
    expect(background).not.toHaveBeenCalled();
    expect(hdr).not.toHaveBeenCalled();

    pipeline.enabled = true;
    pipeline._renderBackground(scene, scene.frameState, scene._view.passState);
    expect(
      pipeline._executeHdr(scene, context, texture, texture, texture),
    ).toBe(texture);
    expect(background).toHaveBeenCalledTimes(1);
    expect(hdr).toHaveBeenCalledTimes(1);
  });

  it("detaches conditionally and never clears foreign authority", function () {
    pipeline.attach(scene);
    const foreign = {};
    scene._sceneGISEnvironmentEffectsPipeline = foreign;

    pipeline.detach();
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBe(foreign);
    expect(pipeline._scene).toBeUndefined();
  });

  it("destroy detaches exactly once and rejects destroyed use", function () {
    pipeline.attach(scene);
    pipeline.destroy();

    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
    expect(pipeline.isDestroyed()).toBe(true);
    expect(function () {
      pipeline.attach(otherScene);
    }).toThrowDeveloperError();
    expect(function () {
      pipeline.destroy();
    }).toThrowDeveloperError();
  });

  it("rejects a destroyed Scene before publication", function () {
    scene.destroyForSpecs();

    expect(function () {
      pipeline.attach(scene);
    }).toThrowDeveloperError();
    expect(pipeline._scene).toBeUndefined();
  });

  it("remains caller-owned when the Scene is destroyed first", function () {
    pipeline.attach(scene);

    scene.destroyForSpecs();
    expect(pipeline.isDestroyed()).toBe(false);
    expect(pipeline._scene).toBe(scene);

    pipeline.destroy();
    expect(pipeline.isDestroyed()).toBe(true);
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBeUndefined();
  });

  it("rejects invalid HDR returns without replacing the input", function () {
    const context = scene.context;
    const texture = context.defaultTexture;
    pipeline.attach(scene);
    pipeline.enabled = true;
    spyOn(pipeline, "executeHdr").and.returnValue(undefined);

    expect(function () {
      pipeline._executeHdr(scene, context, texture, texture, texture);
    }).toThrowDeveloperError();
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBe(pipeline);
  });
});
