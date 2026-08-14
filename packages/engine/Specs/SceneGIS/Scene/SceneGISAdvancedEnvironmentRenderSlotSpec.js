import {
  Cartesian2,
  Cartesian3,
  DrawCommand,
  Ellipsoid,
  Globe,
  Pass,
  RenderState,
  ShaderProgram,
  ShaderSource,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import SceneGISEnvironmentEffectsPipeline from "../../../Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsPipeline.js";

describe("SceneGIS/Scene/SceneGISAdvancedEnvironmentRenderSlot", function () {
  let scene;
  let pipeline;

  function createPlanarWorld() {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -100.0,
          minimumY: -100.0,
          maximumX: 100.0,
          maximumY: 100.0,
        }),
      }),
      maximumLevel: 0,
    });
  }

  function readPixels() {
    return scene.context.readPixels({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  }

  afterEach(function () {
    if (pipeline && !pipeline.isDestroyed()) {
      pipeline.destroy();
    }
    if (scene && !scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
  });

  it("orders advanced background before primary-world environment and geometry", function () {
    scene = createScene({ scene3DOnly: true });
    scene.logarithmicDepthBuffer = false;
    scene.highDynamicRange = false;
    const world = createPlanarWorld();
    scene._initializeWorld(world);
    scene.camera.setView({
      destination: new Cartesian3(0.0, 0.0, 300.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });

    const order = [];
    pipeline = new SceneGISEnvironmentEffectsPipeline();
    pipeline.attach(scene);
    pipeline.enabled = true;
    spyOn(pipeline, "renderBackground").and.callFake(function () {
      order.push("advanced-background");
    });
    const originalWorldEnvironment = world.renderEnvironment;
    spyOn(world, "renderEnvironment").and.callFake(function (...args) {
      order.push("primary-world");
      return originalWorldEnvironment.apply(this, args);
    });

    const command = new DrawCommand({
      cull: false,
      pass: Pass.OPAQUE,
      pickOnly: true,
      renderState: RenderState.fromCache(),
      shaderProgram: ShaderProgram.fromCache({
        context: scene.context,
        vertexShaderSource: new ShaderSource({
          sources: ["void main() { gl_Position = vec4(1.0); }"],
        }),
        fragmentShaderSource: new ShaderSource({
          sources: ["void main() { out_FragColor = vec4(1.0); }"],
        }),
      }),
    });
    command.execute = function () {
      order.push("geometry");
    };
    let destroyed = false;
    scene.primitives.add({
      update: function (frameState) {
        frameState.commandList.push(command);
      },
      isDestroyed: function () {
        return destroyed;
      },
      destroy: function () {
        destroyed = true;
      },
    });

    scene.renderForSpecs();

    expect(order.indexOf("advanced-background")).toBeGreaterThan(-1);
    expect(order.indexOf("primary-world")).toBeGreaterThan(
      order.indexOf("advanced-background"),
    );
    expect(order.indexOf("geometry")).toBeGreaterThan(
      order.indexOf("primary-world"),
    );
  });

  it("passes resolved textures through HDR before built-in postprocess", function () {
    scene = createScene({
      canvas: createCanvas(8, 8),
      msaaSamples: 4,
      orderIndependentTranslucency: true,
    });
    scene.globe = new Globe(Ellipsoid.UNIT_SPHERE);
    scene.highDynamicRange = true;
    pipeline = new SceneGISEnvironmentEffectsPipeline();
    pipeline.attach(scene);
    pipeline.enabled = true;
    const order = [];
    let resolvedTextures;
    spyOn(pipeline, "executeHdr").and.callFake(
      function (context, colorTexture, depthTexture, idTexture) {
        order.push("advanced-hdr");
        resolvedTextures = { context, colorTexture, depthTexture, idTexture };
        return colorTexture;
      },
    );
    const originalExecute = scene.postProcessStages.execute;
    spyOn(scene.postProcessStages, "execute").and.callFake(function (...args) {
      order.push("postprocess");
      return originalExecute.apply(this, args);
    });

    scene.renderForSpecs();

    expect(order).toEqual(["advanced-hdr", "postprocess"]);
    expect(resolvedTextures.context).toBe(scene.context);
    expect(resolvedTextures.colorTexture).toBeDefined();
    expect(resolvedTextures.depthTexture).toBeDefined();
    expect(resolvedTextures.idTexture).toBeDefined();
    expect(resolvedTextures.colorTexture.isDestroyed()).toBe(false);
    expect(resolvedTextures.depthTexture.isDestroyed()).toBe(false);
    expect(resolvedTextures.idTexture.isDestroyed()).toBe(false);
  });

  it("keeps absent, inactive, enabled identity, and detached pixels stable", function () {
    scene = createScene({
      orderIndependentTranslucency: false,
      msaaSamples: 1,
    });
    scene.highDynamicRange = true;
    scene.renderForSpecs();
    const baseline = readPixels();
    const identities = {
      sceneFramebuffer: scene._view.sceneFramebuffer,
      colorFramebuffer: scene._view.sceneFramebuffer._colorFramebuffer,
      oit: scene._view.oit,
      postProcess: scene.postProcessStages,
    };

    pipeline = new SceneGISEnvironmentEffectsPipeline();
    pipeline.attach(scene);
    scene.renderForSpecs();
    expect(readPixels()).toEqual(baseline);

    pipeline.enabled = true;
    scene.renderForSpecs();
    expect(readPixels()).toEqual(baseline);
    expect(scene._view.sceneFramebuffer).toBe(identities.sceneFramebuffer);
    expect(scene._view.sceneFramebuffer._colorFramebuffer).toBe(
      identities.colorFramebuffer,
    );
    expect(scene._view.oit).toBe(identities.oit);
    expect(scene.postProcessStages).toBe(identities.postProcess);

    scene.canvas.width = 4;
    scene.canvas.height = 4;
    scene.renderForSpecs();
    expect(readPixels()).toEqual(baseline);
    expect(scene._view.sceneFramebuffer).toBe(identities.sceneFramebuffer);
    expect(scene._view.sceneFramebuffer._colorFramebuffer).toBe(
      identities.colorFramebuffer,
    );

    pipeline.detach();
    scene.renderForSpecs();
    expect(readPixels()).toEqual(baseline);
  });

  it("does not execute either advanced slot during picking", function () {
    scene = createScene();
    scene.highDynamicRange = true;
    pipeline = new SceneGISEnvironmentEffectsPipeline();
    pipeline.attach(scene);
    pipeline.enabled = true;
    const background = spyOn(pipeline, "renderBackground").and.callThrough();
    const hdr = spyOn(pipeline, "executeHdr").and.callThrough();

    scene.pick(new Cartesian2(0.0, 0.0));

    expect(background).not.toHaveBeenCalled();
    expect(hdr).not.toHaveBeenCalled();
  });

  it("rejects invalid HDR publication before postprocess execution", function () {
    scene = createScene();
    scene.highDynamicRange = true;
    pipeline = new SceneGISEnvironmentEffectsPipeline();
    pipeline.attach(scene);
    pipeline.enabled = true;
    spyOn(pipeline, "executeHdr").and.returnValue(undefined);
    const postProcess = spyOn(
      scene.postProcessStages,
      "execute",
    ).and.callThrough();
    const originalFramebuffer = scene._environmentState.originalFramebuffer;

    expect(function () {
      scene.renderForSpecs();
    }).toThrowDeveloperError();
    expect(postProcess).not.toHaveBeenCalled();
    expect(scene._environmentState.originalFramebuffer).toBe(
      originalFramebuffer,
    );
    expect(scene._sceneGISEnvironmentEffectsPipeline).toBe(pipeline);
  });
});
