import BoundingSphere from "../../../../Source/Core/BoundingSphere.js";
import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Color from "../../../../Source/Core/Color.js";
import Matrix4 from "../../../../Source/Core/Matrix4.js";
import Quaternion from "../../../../Source/Core/Quaternion.js";
import ClearCommand from "../../../../Source/Renderer/ClearCommand.js";
import Pass from "../../../../Source/Renderer/Pass.js";
import ContextLimits from "../../../../Source/Renderer/ContextLimits.js";
import _SceneGISGaussianSegmentedGlobalContentAtlas from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedGlobalContentAtlas.js";
import _SceneGISGaussianSegmentedGlobalPresentationResources from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedGlobalPresentationResources.js";
import _SceneGISGaussianSegmentedGlobalRenderResources from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedGlobalRenderResources.js";
import createCamera from "../../../../../../Specs/createCamera.js";
import createContext from "../../../../../../Specs/createContext.js";
import createFrameState from "../../../../../../Specs/createFrameState.js";
import { prepareGaussianSegmentedCore } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSortTask.js";
import { createSegmentedPreparedCoreReceipt } from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedCorePreparation.js";
import pollToPromise from "../../../../../../Specs/pollToPromise.js";

function encodedCore(centers, invalidIndex) {
  const bytes = new Uint8Array(centers.length * 32);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < centers.length; index++) {
    const offset = index * 32;
    const center = centers[index];
    view.setFloat32(offset, center[0], true);
    view.setFloat32(offset + 4, center[1], true);
    view.setFloat32(offset + 8, center[2], true);
    view.setUint32(offset + 12, 0x00003c00, true);
    view.setUint32(offset + 16, index === invalidIndex ? 0x00003c00 : 0, true);
    view.setUint32(offset + 20, index === invalidIndex ? 0 : 0x00003c00, true);
    view.setUint32(offset + 24, 0, true);
    view.setUint32(offset + 28, 0, true);
  }
  return bytes;
}

describe("SceneGIS/Scene/SceneGISGaussianSegmentedGlobalRenderResources", function () {
  let context;

  afterEach(function () {
    context?.destroyForSpecs();
    context = undefined;
  });

  it("compiles the segmented shaders and creates exactly one Gaussian command", function () {
    context = createContext({ requestWebgl1: false });
    ContextLimits._maximumTextureSize = context.maximumTextureSize;
    const lineWidthRange = context._gl.getParameter(
      context._gl.ALIASED_LINE_WIDTH_RANGE,
    );
    ContextLimits._minimumAliasedLineWidth = lineWidthRange[0];
    ContextLimits._maximumAliasedLineWidth = lineWidthRange[1];
    const primitive = {
      _maxShDegree: 0,
      _viewOriginLocal: Cartesian3.ZERO,
      _sourceRenderToViewPosition: Cartesian3.ZERO,
      _sourceRenderToViewQuaternion: Quaternion.IDENTITY,
      _color: Color.WHITE,
      _renderTuning0: { x: 3, y: 0.1, z: 1024, w: 1 / 255 },
      _renderTuning1: { x: 0.3, y: 0.3, z: 1.2, w: 1 },
      _falloff: 1,
      _effectiveModelMatrix: Matrix4.IDENTITY,
    };
    const render = new _SceneGISGaussianSegmentedGlobalRenderResources({
      primitive,
      frameState: createFrameState(context),
    });
    const bounds = new BoundingSphere(Cartesian3.ZERO, 10);
    const command = render.createCommand(
      {
        selectedSplatCount: 7,
        coreTexture: {},
        shTexture: undefined,
        mappingTexture: {},
        cropTexture: {},
        orderingTexture: {},
      },
      bounds,
    );
    expect(command.instanceCount).toBe(7);
    expect(command.pass).toBe(Pass.GAUSSIAN_SPLATS);
    expect(command.boundingVolume).toBe(bounds);
    expect(command.cull).toBe(true);
    expect(command.occlude).toBe(false);
    expect(command.uniformMap.u_tileCropBounds).toBeUndefined();
    expect(command.uniformMap.u_globalCropTexture()).toBe(
      command.uniformMap.u_globalCropTexture(),
    );
    expect(render.destroy()).toBe(true);
  });

  it("keeps center-owned adjacent-slot footprints continuous and rejects a foreign center", async function () {
    const width = 64;
    const height = 64;
    context = createContext({ requestWebgl1: false }, width, height);
    ContextLimits._maximumTextureSize = context.maximumTextureSize;
    const lineWidthRange = context._gl.getParameter(
      context._gl.ALIASED_LINE_WIDTH_RANGE,
    );
    ContextLimits._minimumAliasedLineWidth = lineWidthRange[0];
    ContextLimits._maximumAliasedLineWidth = lineWidthRange[1];
    const centers = [
      [-0.05, 0, 0],
      [0.05, 0, 0],
      [-0.1, 0.08, 0],
      [0.1, -0.08, 0],
      [0.6, 0.7, 0],
    ];
    const invalidIndex = centers.length - 1;
    const payload = encodedCore(centers, invalidIndex);
    const source = {
      descriptor: {
        artifactIdentity: "r3-crop",
        index: 0,
        assetId: 0,
        assetLocalStart: 0,
        semantic: 1,
        kind: 1,
        layoutId: 1,
        packId: 0,
        offset: 256,
        checksum: 1,
        splatCount: centers.length,
        rawBytes: payload.byteLength,
        storedBytes: payload.byteLength,
      },
      payload,
    };
    const slotIds = new Uint32Array([0, 1, 0, 1, 0]);
    const composition = {
      selectedSplatCount: centers.length,
      slotCount: 2,
      fragmentCount: centers.length,
      fragmentCorePageIds: new Uint32Array(centers.length),
      fragmentShPageIds: new Uint32Array(centers.length).fill(0xffffffff),
      fragmentPageLocalStarts: Uint32Array.from(
        centers.map((_, index) => index),
      ),
      fragmentCounts: new Uint32Array(centers.length).fill(1),
      fragmentPresentationStarts: Uint32Array.from(
        centers.map((_, index) => index),
      ),
      fragmentSlotIds: slotIds,
      slotCoverageNodeIds: new Uint32Array([7, 8]),
      slotRepresentationIds: new Uint32Array([0, 0]),
      slotCropBounds: new Float64Array([-1, -1, 0, 1, 0, -1, 1, 1]),
    };
    const descriptor = {
      coreBytes: 8192,
      coreLogicalBytes: payload.byteLength,
      coreLayerCount: 1,
      coreTextureHeight: 1,
      shBytes: 0,
      shLogicalBytes: 0,
      shLayerCount: 0,
      shTextureHeight: 0,
      mappingBytes: 65536,
      cropBytes: 32,
      cropLogicalSlots: 2,
      cropCapacitySlots: 2,
      orderingBytes: 65536,
      coreCanonicalizationScratchBytes: 0,
      cpuStagingBytes: 131232,
      gpuPresentationBytes: 139424,
    };
    const contentAtlas = new _SceneGISGaussianSegmentedGlobalContentAtlas({
      artifactIdentity: "r3-crop",
      maxShDegree: 0,
      maximumBytes: 1024 * 1024,
      maximumTextureSize: context._gl.getParameter(
        context._gl.MAX_TEXTURE_SIZE,
      ),
      maximumTextureArrayLayers: context._gl.getParameter(
        context._gl.MAX_ARRAY_TEXTURE_LAYERS,
      ),
      context,
    });
    const identity = {
      ...source.descriptor,
      pageIndex: 0,
      pageSplatCount: centers.length,
      expectedCoreBytes: payload.byteLength,
      positionBytes: centers.length * 12,
      representationId: 0,
      positionOriginX: 0,
      positionOriginY: 0,
      positionOriginZ: 0,
      uploadBytes: 8192,
    };
    const core = new Uint8Array(identity.uploadBytes);
    core.set(payload);
    prepareGaussianSegmentedCore({ ...identity, core });
    const atlasReceipt = contentAtlas.createBindingReceipt(
      source.descriptor,
      createSegmentedPreparedCoreReceipt(identity, core),
    );
    const resources = new _SceneGISGaussianSegmentedGlobalPresentationResources(
      {
        context,
        contentAtlas,
      },
    );
    const ticket = resources.prepare({
      artifactIdentity: "r3-crop",
      contentIdentity: "r3-crop-content",
      contentGeneration: 1,
      mappingGeneration: 1,
      composition,
      descriptor,
      fragmentShDenseStarts: new Uint32Array(centers.length).fill(0xffffffff),
      maxShDegree: 0,
      maximumTextureSize: context.maximumTextureSize,
      resolvePage: () => source,
    });
    await pollToPromise(() => {
      return resources.advance(ticket, {
        maximumMappingEntries: centers.length,
        maximumTextureUploads: 16,
        maximumPositionExtractions: centers.length,
      }).ready;
    });
    const ordering = new Uint32Array(descriptor.orderingBytes / 4);
    ordering.fill(0xffffffff);
    ordering.set([0, 1, 2, 3, 4]);
    expect([...ordering.subarray(0, 4)].map((index) => slotIds[index])).toEqual(
      [0, 1, 0, 1],
    );
    const sortIntent = Object.freeze({
      requestSerial: 1,
      viewGeneration: 1,
      contentGeneration: 1,
      mappingGeneration: 1,
    });
    const binding = Object.freeze({
      adapterTicketSerial: 1,
      sortIntent,
      sortRequestSerial: 1,
      viewGeneration: 1,
      ordering,
      contentGeneration: 1,
      mappingGeneration: 1,
    });
    const orderingUpload = resources.prepareOrderingUpload(
      descriptor,
      ordering,
      binding,
    );
    expect(
      resources.advanceOrderingUpload(orderingUpload, 1, binding, ordering)
        .ready,
    ).toBe(true);
    resources.installPreparedOrdering(
      ticket,
      orderingUpload,
      binding,
      ordering,
    );
    const owner = resources.createOwner(ticket, {
      resourceOwnerIdentity: "r3-crop-owner",
    });
    const camera = createCamera({
      canvas: context.canvas,
      target: Cartesian3.ZERO,
      offset: new Cartesian3(0, 0, 5),
      far: 20,
    });
    camera.frustum.aspectRatio = 1;
    const frameState = createFrameState(context, camera);
    context.uniformState.update(frameState);
    const primitive = {
      _maxShDegree: 0,
      _viewOriginLocal: Cartesian3.clone(camera.positionWC),
      _sourceRenderToViewPosition: Cartesian3.ZERO,
      _sourceRenderToViewQuaternion: Quaternion.IDENTITY,
      _color: Color.WHITE,
      _renderTuning0: { x: 3, y: 0.1, z: 1024, w: 1 / 255 },
      _renderTuning1: { x: 0.3, y: 0.3, z: 1.2, w: 1 },
      _falloff: 1,
      _effectiveModelMatrix: Matrix4.IDENTITY,
    };
    const render = new _SceneGISGaussianSegmentedGlobalRenderResources({
      primitive,
      frameState,
    });
    const command = render.createCommand(
      owner,
      new BoundingSphere(Cartesian3.ZERO, 2),
    );
    try {
      ClearCommand.ALL.execute(context);
      command.execute(context);
      const pixels = context.readPixels({ x: 0, y: 0, width, height });
      const alphaAt = (x, y) => pixels[(y * width + x) * 4 + 3];
      expect(alphaAt(31, 32)).toBeGreaterThan(0);
      expect(alphaAt(32, 32)).toBeGreaterThan(0);
      expect(alphaAt(33, 32)).toBeGreaterThan(0);
      for (let pixel = 0; pixel < pixels.length; pixel += 4) {
        expect(pixels[pixel]).toBe(0);
      }
      expect(command.instanceCount).toBe(centers.length);
    } finally {
      expect(render.destroy()).toBe(true);
      expect(resources.retire(owner)).toBe(true);
      expect(contentAtlas.releaseBinding(atlasReceipt, source.descriptor)).toBe(
        true,
      );
      expect(contentAtlas.destroy()).toBe(true);
    }
  });

  it("retains constructor cleanup cursor across two shader destroy failures", function () {
    let failures = 2;
    let successes = 0;
    const render = new _SceneGISGaussianSegmentedGlobalRenderResources({
      primitive: {},
      frameState: { context: {} },
      buildShaderProgram() {
        return {
          destroy() {
            if (failures-- > 0) {
              throw new Error("injected shader destroy failure");
            }
            successes++;
          },
        };
      },
      createVertexArray() {
        throw new Error("injected VAO allocation failure");
      },
    });
    expect(function () {
      render.createCommand({}, {});
    }).toThrowDeveloperError();
    expect(function () {
      render.destroy();
    }).toThrowError("injected shader destroy failure");
    expect(render.destroy()).toBe(true);
    expect(successes).toBe(1);
    expect(render.statistics.destroyed).toBe(true);
  });
});
