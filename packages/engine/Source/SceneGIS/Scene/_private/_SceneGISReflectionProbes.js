import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import Color from "../../../Core/Color.js";
import Intersect from "../../../Core/Intersect.js";
import Matrix3 from "../../../Core/Matrix3.js";
import Matrix4 from "../../../Core/Matrix4.js";
import OrthographicOffCenterFrustum from "../../../Core/OrthographicOffCenterFrustum.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import ClearCommand from "../../../Renderer/ClearCommand.js";
import CubeMap from "../../../Renderer/CubeMap.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import Pass from "../../../Renderer/Pass.js";
import PassState from "../../../Renderer/PassState.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Renderbuffer from "../../../Renderer/Renderbuffer.js";
import RenderbufferFormat from "../../../Renderer/RenderbufferFormat.js";
import RenderState from "../../../Renderer/RenderState.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderDestination from "../../../Renderer/ShaderDestination.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import Camera from "../../../Scene/Camera.js";
import DerivedCommand from "../../../Scene/DerivedCommand.js";
import SceneMode from "../../../Scene/SceneMode.js";
import ShadowMap from "../../../Scene/ShadowMap.js";
import convolve from "../../../Shaders/ConvolveSpecularMapFS.js";
import cubeVertex from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISSkyReflectionVS.js";
import filter from "../../../Shaders/SceneGIS/Reflections/SceneGISProbeFilterFS.js";
import lighting from "../../../Shaders/SceneGIS/Reflections/SceneGISProbeLighting.js";
import LocalLights from "./_SceneGISLocalLights.js";
import SurfaceWeather from "./_SceneGISSurfaceWeather.js";

const directions = [
  new Cartesian3(1, 0, 0),
  new Cartesian3(-1, 0, 0),
  new Cartesian3(0, 1, 0),
  new Cartesian3(0, -1, 0),
  new Cartesian3(0, 0, 1),
  new Cartesian3(0, 0, -1),
];
const ups = [
  new Cartesian3(0, -1, 0),
  new Cartesian3(0, -1, 0),
  new Cartesian3(0, 0, 1),
  new Cartesian3(0, 0, -1),
  new Cartesian3(0, -1, 0),
  new Cartesian3(0, -1, 0),
];
const emptyBox = new Cartesian4(1, 1, 1, 1);

function cube(context, size, mipmaps) {
  const texture = new CubeMap({
    context,
    width: size,
    height: size,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: PixelDatatype.HALF_FLOAT,
  });
  if (mipmaps) {
    texture.generateMipmap();
    texture.sampler = new Sampler({
      minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
    });
  }
  return texture;
}

function createMaps(context, size) {
  const result = { radiance: undefined, visibility: undefined, frames: [] };
  result.destroy = function () {
    for (const frame of this.frames) {
      frame.destroy();
    }
    this.radiance?.destroy();
    this.visibility?.destroy();
    return undefined;
  };
  try {
    result.radiance = cube(context, size, true);
    result.visibility = cube(context, 8, false);
    for (let level = 0; level <= Math.log2(size); level++) {
      for (const face of CubeMap.faceNames()) {
        result.frames.push(
          new Framebuffer({
            context,
            colorTextures: [result.radiance[face]],
            colorTextureMipLevel: level,
            destroyAttachments: false,
          }),
        );
      }
    }
    for (const face of CubeMap.faceNames()) {
      result.frames.push(
        new Framebuffer({
          context,
          colorTextures: [result.visibility[face]],
          destroyAttachments: false,
        }),
      );
    }
    return result;
  } catch (error) {
    result.destroy();
    throw error;
  }
}

function createState(collection) {
  const scene = collection._scene;
  return {
    camera: new Camera(scene),
    lightCamera: new Camera(scene),
    hdr: new WeakMap(),
    cast: new WeakMap(),
    receive: new WeakMap(),
    capture: new WeakMap(),
    controls: new Cartesian4(),
    ready: new Cartesian2(),
    boxes: [new Cartesian4(), new Cartesian4()],
    captureDraws: 0,
    shadowDraws: 0,
    captureMilliseconds: 0,
    captures: 0,
    commands: [],
    quadCommands: [],
    frames: [],
    cubeToSky: new Matrix3(),
  };
}

function allocate(collection) {
  const state = collection._state;
  if (state.source) {
    return;
  }
  const context = collection._scene.context;
  const size = collection.resolution;
  state.source = cube(context, size, false);
  state.depth = new Renderbuffer({
    context,
    width: size,
    height: size,
    format: RenderbufferFormat.DEPTH24_STENCIL8,
  });
  state.passState = new PassState(context);
  state.passState.viewport = new BoundingRectangle(0, 0, size, size);
  state.clear = new ClearCommand({ color: new Color(0, 0, 0, 1), depth: 1 });
  for (const face of CubeMap.faceNames()) {
    state.frames.push(
      new Framebuffer({
        context,
        colorTextures: [state.source[face]],
        depthStencilRenderbuffer: state.depth,
        destroyAttachments: false,
      }),
    );
  }
  const uniforms = {
    u_face: () => state.face,
    u_radianceTexture: () => state.source,
    u_roughness: () => (state.level / Math.log2(size)) ** 2,
    u_faceDirection: () => Cartesian3.UNIT_Z,
    u_visibility: () => state.visibility,
    u_sky: () => state.sky.texture,
    u_cubeToSky: () => state.cubeToSky,
    u_scale: () => state.scale,
  };
  const fragments = [
    `in vec3 v_textureCoordinates; uniform samplerCube u_sky; uniform mat3 u_cubeToSky; uniform float u_scale;
     void main() { out_FragColor = vec4(textureLod(u_sky, u_cubeToSky * v_textureCoordinates, 0.0).rgb * u_scale, 1.0); }`,
    `in vec3 v_textureCoordinates; uniform samplerCube u_radianceTexture;
     void main() { out_FragColor = textureLod(u_radianceTexture, v_textureCoordinates, 0.0); }`,
    new ShaderSource({
      sources: [
        ShaderSource.replaceMain(convolve, "sceneGISNativeConvolution"),
        filter,
      ],
    }),
  ];
  for (const fragmentShaderSource of fragments) {
    state.quadCommands.push(
      new DrawCommand({
        vertexArray: context.getViewportQuadVertexArray(),
        shaderProgram: ShaderProgram.fromCache({
          context,
          vertexShaderSource: cubeVertex,
          fragmentShaderSource,
          attributeLocations: { position: 0 },
        }),
        uniformMap: uniforms,
      }),
    );
  }
}

function setFace(state, probe, face, frameState) {
  const camera = state.camera;
  Matrix4.getTranslation(probe.modelMatrix, camera.position);
  Matrix3.multiplyByVector(probe._rotation, directions[face], camera.direction);
  Matrix3.multiplyByVector(probe._rotation, ups[face], camera.up);
  Cartesian3.cross(camera.direction, camera.up, camera.right);
  camera.frustum.fov = Math.PI / 2;
  camera.frustum.aspectRatio = 1;
  camera.frustum.near = 0.05;
  camera.frustum.far = probe.maximumDistance;
  frameState.camera = camera;
  frameState.cullingVolume = camera.frustum.computeCullingVolume(
    camera.positionWC,
    camera.directionWC,
    camera.upWC,
  );
  frameState.context.uniformState.update(frameState);
}

function deriveCapture(context, command, state) {
  let program = context.shaderCache.getDerivedShaderProgram(
    command.shaderProgram,
    "sceneGIS_probeCapture",
  );
  if (!program) {
    const fs = command.shaderProgram.fragmentShaderSource.clone();
    fs.sources = fs.sources.map((s) =>
      ShaderSource.replaceMain(s, "sceneGISProbeCaptureMain"),
    );
    fs.sources.push(
      "void main() { sceneGISProbeCaptureMain(); out_FragColor.a = 0.0; }",
    );
    program = context.shaderCache.createDerivedShaderProgram(
      command.shaderProgram,
      "sceneGIS_probeCapture",
      {
        vertexShaderSource: command.shaderProgram.vertexShaderSource,
        fragmentShaderSource: fs,
        attributeLocations: command.shaderProgram._attributeLocations,
      },
    );
  }
  const result = DrawCommand.shallowClone(command, state.capture.get(command));
  state.capture.set(command, result);
  result.shaderProgram = program;
  result.framebuffer = undefined;
  return result;
}

function prepareShadows(collection, probe, state, frameState) {
  const scene = collection._scene;
  if (!scene.shadowMap.enabled) {
    return undefined;
  }
  const context = scene.context;
  const camera = state.lightCamera;
  const radius = probe.maximumDistance;
  Cartesian3.negate(context.uniformState.lightDirectionWC, camera.direction);
  const axis =
    Math.abs(camera.direction.z) < 0.9 ? Cartesian3.UNIT_Z : Cartesian3.UNIT_Y;
  Cartesian3.normalize(
    Cartesian3.cross(camera.direction, axis, camera.right),
    camera.right,
  );
  Cartesian3.cross(camera.right, camera.direction, camera.up);
  Matrix4.getTranslation(probe.modelMatrix, camera.position);
  Cartesian3.subtract(
    camera.position,
    Cartesian3.multiplyByScalar(camera.direction, radius, new Cartesian3()),
    camera.position,
  );
  camera.frustum = new OrthographicOffCenterFrustum({
    left: -radius,
    right: radius,
    bottom: -radius,
    top: radius,
    near: 0.01,
    far: 2 * radius,
  });
  const shadow =
    state.shadow ??
    (state.shadow = new ShadowMap({
      context,
      lightCamera: camera,
      cascadesEnabled: false,
      size: 1024,
      softShadows: true,
      normalOffset: true,
      maximumDistance: radius * 2,
    }));
  shadow.maximumDistance = radius * 2;
  shadow._fitNearFar = false;
  shadow.update(frameState);
  const pass = shadow.passes[0];
  context.uniformState.updateCamera(pass.camera);
  shadow.updatePass(context, 0);
  for (const command of state.commands) {
    if (
      !command.castShadows ||
      shadow.shadowMapCullingVolume.computeVisibility(
        command.boundingVolume,
      ) === Intersect.OUTSIDE
    ) {
      continue;
    }
    const result = ShadowMap.createCastDerivedCommand(
      [shadow],
      command,
      true,
      context,
      state.cast.get(command),
    );
    state.cast.set(command, result);
    context.uniformState.updatePass(command.pass);
    result.castCommands[0].execute(context, pass.passState);
    state.shadowDraws++;
  }
  return shadow;
}

function captureProbe(collection, probe, frameState) {
  const state = collection._state;
  const scene = collection._scene;
  const context = scene.context;
  const size = collection.resolution;
  const maximumLod = Math.log2(size);
  const maps = createMaps(context, size);
  try {
    Matrix3.multiply(state.sky.worldToLocal, probe._rotation, state.cubeToSky);
    setFace(state, probe, 0, frameState);
    const shadow = prepareShadows(collection, probe, state, frameState);
    const viewportState = RenderState.fromCache({
      viewport: new BoundingRectangle(0, 0, size, size),
    });
    for (state.face = 0; state.face < 6; state.face++) {
      setFace(state, probe, state.face, frameState);
      if (shadow) {
        shadow.update(frameState);
      }
      LocalLights.prepare(scene, state.camera);
      SurfaceWeather.prepare(scene, state.camera);
      state.passState.framebuffer = state.frames[state.face];
      state.clear.execute(context, state.passState);
      const skyCommand = state.quadCommands[0];
      skyCommand.renderState = viewportState;
      skyCommand.framebuffer = state.frames[state.face];
      skyCommand.execute(context, state.passState);
      for (const source of state.commands) {
        if (
          frameState.cullingVolume.computeVisibility(source.boundingVolume) ===
          Intersect.OUTSIDE
        ) {
          continue;
        }
        let command = source;
        if (shadow && command.receiveShadows) {
          const result = ShadowMap.createReceiveDerivedCommand(
            [shadow],
            command,
            true,
            context,
            state.receive.get(command),
          );
          state.receive.set(command, result);
          command = result.receiveCommand;
        }
        command = LocalLights.receiver(scene, command);
        command = SurfaceWeather.receiver(scene, command);
        context.uniformState.updatePass(command.pass);
        deriveCapture(context, command, state).execute(
          context,
          state.passState,
        );
        state.captureDraws++;
      }
    }
    for (state.level = 0; state.level <= maximumLod + 1; state.level++) {
      state.visibility = state.level > maximumLod;
      const command = state.quadCommands[state.level === 0 ? 1 : 2];
      const width = state.visibility ? 8 : size >> state.level;
      command.renderState = RenderState.fromCache({
        viewport: new BoundingRectangle(0, 0, width, width),
      });
      for (state.face = 0; state.face < 6; state.face++) {
        command.framebuffer = maps.frames[state.level * 6 + state.face];
        command.execute(context);
      }
    }
    return maps;
  } catch (error) {
    maps.destroy();
    throw error;
  }
}

/** Explicit, bounded capture and material integration. @private */
const SceneGISReflectionProbes = {
  prepare(scene) {
    const collection = scene._sceneGISReflectionProbes;
    scene.frameState._sceneGISReflectionProbes = collection;
    if (!collection) {
      return;
    }
    const state =
      collection._state ?? (collection._state = createState(collection));
    Cartesian4.fromElements(
      collection.show ? 1 : 0,
      collection.reflections ? 1 : 0,
      collection.occlusion ? 1 : 0,
      Math.log2(collection.resolution),
      state.controls,
    );
    for (let i = 0; i < 2; i++) {
      const probe = collection._probes[i];
      state.ready[i === 0 ? "x" : "y"] = probe?.ready ? 1 : 0;
      if (probe) {
        Matrix4.multiply(
          probe._inverse,
          scene.camera.inverseViewMatrix,
          probe._eyeToLocal,
        );
        Cartesian4.fromElements(
          probe.halfSize.x,
          probe.halfSize.y,
          probe.halfSize.z,
          probe.blendDistance,
          state.boxes[i],
        );
      }
    }
  },

  execute(scene) {
    const collection = scene._sceneGISReflectionProbes;
    const request = collection?._pending;
    const frameState = scene.frameState;
    if (
      !request ||
      !frameState.passes.render ||
      frameState.passes.pick ||
      frameState.passes.depth
    ) {
      return;
    }
    collection._pending = undefined;
    const state = collection._state;
    const camera = frameState.camera;
    const cullingVolume = frameState.cullingVolume;
    const commandList = frameState.commandList;
    const uniformState = scene.context.uniformState;
    const oldPass = uniformState.pass;
    const record =
      frameState._sceneGISPlanarLighting ?? frameState._sceneGISGlobeLighting;
    const planarPosition = record?.cameraRelativePosition;
    const candidates = [];
    const start = performance.now();
    state.captureDraws = state.shadowDraws = 0;
    try {
      if (
        scene.mode !== SceneMode.SCENE3D ||
        !scene.highDynamicRange ||
        !record?.active ||
        !record.skyReflections?.texture
      ) {
        throw new RuntimeError(
          "Capture requires an active physical sky in HDR SCENE3D.",
        );
      }
      allocate(collection);
      state.sky = record.skyReflections;
      state.scale = record.surfaceRadianceScale;
      collection._capturing = true;
      state.controls.x = 0;
      state.commands.length = 0;
      frameState.commandList = [];
      for (const model of request.sources) {
        if (
          model.isDestroyed() ||
          !model.ready ||
          !scene.primitives.contains(model)
        ) {
          throw new RuntimeError("A capture source was removed or destroyed.");
        }
        if (model.show) {
          model._sceneGraph.pushDrawCommands(frameState);
        }
      }
      for (const command of frameState.commandList) {
        if (
          command.pass !== Pass.OPAQUE ||
          !command.boundingVolume ||
          !command.renderState.depthMask
        ) {
          continue;
        }
        const result = DerivedCommand.createHdrCommand(
          command,
          scene.context,
          state.hdr.get(command),
        );
        state.hdr.set(command, result);
        state.commands.push(result.command);
      }
      for (const probe of collection._probes) {
        if (planarPosition) {
          const offset = Cartesian3.subtract(
            Matrix4.getTranslation(probe.modelMatrix, new Cartesian3()),
            camera.positionWC,
            new Cartesian3(),
          );
          // Physical-light records are immutable publications. Borrow a capture-local
          // record rather than mutating the primary-view origin.
          frameState._sceneGISPlanarLighting = {
            ...record,
            cameraRelativePosition: Cartesian3.add(
              planarPosition,
              offset,
              offset,
            ),
          };
        }
        candidates.push(captureProbe(collection, probe, frameState));
      }
      for (let i = 0; i < candidates.length; i++) {
        const probe = collection._probes[i];
        probe._maps?.destroy();
        probe._maps = candidates[i];
        probe._generation++;
      }
      candidates.length = 0;
      state.captures++;
      request.resolve();
    } catch (error) {
      request.reject(error);
    } finally {
      for (const maps of candidates) {
        maps.destroy();
      }
      collection._capturing = false;
      frameState.camera = camera;
      frameState.cullingVolume = cullingVolume;
      frameState.commandList = commandList;
      if (planarPosition) {
        frameState._sceneGISPlanarLighting = record;
      }
      uniformState.update(frameState);
      uniformState.updatePass(oldPass);
      LocalLights.prepare(scene);
      SurfaceWeather.prepare(scene);
      this.prepare(scene);
      state.commands.length = 0;
      state.captureMilliseconds = performance.now() - start;
    }
  },

  process(renderResources, frameState) {
    const collection = frameState._sceneGISReflectionProbes;
    if (!collection) {
      return;
    }
    const { shaderBuilder, uniformMap } = renderResources;
    shaderBuilder.addDefine(
      "SCENEGIS_LOCAL_PROBES",
      undefined,
      ShaderDestination.FRAGMENT,
    );
    shaderBuilder.addFragmentLines(lighting);
    const state = collection._state;
    uniformMap.u_sceneGISProbeState = () => state.controls;
    uniformMap.u_sceneGISProbeReady = () => state.ready;
    for (let i = 0; i < 2; i++) {
      uniformMap[`u_sceneGISProbe${i}`] = () =>
        collection._probes[i]?._maps?.radiance ??
        frameState.context.defaultCubeMap;
      uniformMap[`u_sceneGISVisibility${i}`] = () =>
        collection._probes[i]?._maps?.visibility ??
        frameState.context.defaultCubeMap;
      uniformMap[`u_sceneGISProbeMatrix${i}`] = () =>
        collection._probes[i]?._eyeToLocal ?? Matrix4.IDENTITY;
      uniformMap[`u_sceneGISProbeBox${i}`] = () =>
        collection._probes[i] ? state.boxes[i] : emptyBox;
    }
  },

  destroy(collection) {
    const state = collection._state;
    if (!state) {
      return;
    }
    for (const frame of state.frames) {
      frame.destroy();
    }
    for (const command of state.quadCommands) {
      command.shaderProgram.destroy();
    }
    state.source?.destroy();
    state.depth?.destroy();
    state.shadow?.destroy();
    state.controls.x = 0;
    state.ready.x = state.ready.y = 0;
    collection._state = undefined;
  },
};

export default SceneGISReflectionProbes;
