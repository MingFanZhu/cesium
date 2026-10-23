import _SceneGISGaussianSegmentedGlobalPresentationResources from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedGlobalPresentationResources.js";
import ContextLimits from "../../../../Source/Renderer/ContextLimits.js";
import { buildGaussianSegmentedMapping } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianMappingTask.js";
import createContext from "../../../../../../Specs/createContext.js";

describe("SceneGIS/Scene/SceneGISGaussianSegmentedGlobalPresentationResources", function () {
  function mappingTaskProcessor() {
    return {
      scheduleTask(parameters) {
        return Promise.resolve(buildGaussianSegmentedMapping(parameters));
      },
      destroy() {},
    };
  }

  function mappingAuthority() {
    return {
      contentIdentity: "content-1",
      contentGeneration: 1,
      mappingGeneration: 1,
    };
  }
  function uploadBinding(ordering, viewGeneration = 1) {
    const sortIntent = Object.freeze({
      requestSerial: viewGeneration,
      viewGeneration,
      contentGeneration: 1,
      mappingGeneration: 1,
    });
    return Object.freeze({
      adapterTicketSerial: 1,
      sortIntent,
      sortRequestSerial: sortIntent.requestSerial,
      viewGeneration,
      ordering,
      contentGeneration: sortIntent.contentGeneration,
      mappingGeneration: sortIntent.mappingGeneration,
    });
  }

  function page(index, splats, bytesPerSplat) {
    const payload = new Uint8Array(splats * bytesPerSplat);
    for (let offset = 0; offset < payload.length; offset++) {
      payload[offset] = (index * 17 + offset) & 0xff;
    }
    if (bytesPerSplat === 32) {
      const view = new DataView(payload.buffer);
      for (let splat = 0; splat < splats; splat++) {
        view.setFloat32(splat * 32, splat + 0.25, true);
        view.setFloat32(splat * 32 + 4, splat + 0.5, true);
        view.setFloat32(splat * 32 + 8, splat + 0.75, true);
      }
    }
    return {
      descriptor: {
        artifactIdentity: "artifact",
        index,
        assetId: index,
        assetLocalStart: 0,
        semantic: bytesPerSplat === 32 ? 1 : 2,
        kind: 1,
        layoutId: 1,
        packId: 0,
        offset: 256 + index * 256,
        checksum: index + 1,
        splatCount: splats,
        rawBytes: payload.byteLength,
        storedBytes: payload.byteLength,
      },
      payload,
    };
  }

  function mockAtlas() {
    return {
      coreTexture: Object.freeze({ role: "atlas-core" }),
      shTexture: Object.freeze({ role: "atlas-sh" }),
      pageAddress(descriptor) {
        return Object.freeze({
          semantic: descriptor.semantic,
          splatCount: descriptor.splatCount,
          packedAddress: descriptor.index * 256,
        });
      },
    };
  }

  async function sharedUploadHarness() {
    const textures = [];
    let mapping;
    const createTexture = (options) => {
      const texture = {
        ...options,
        data: new (options.float ? Float32Array : Uint32Array)(
          options.width * options.height * 4,
        ),
        uploads: [],
        copyFrom(upload) {
          this.uploads.push(upload);
          this.data.set(
            upload.source.arrayBufferView,
            upload.yOffset * options.width * 4,
          );
        },
        destroy: jasmine.createSpy("destroy"),
      };
      textures.push(texture);
      return texture;
    };
    const resources = new _SceneGISGaussianSegmentedGlobalPresentationResources(
      {
        contentAtlas: mockAtlas(),
        createTexture,
        mappingTaskProcessor: {
          scheduleTask(parameters) {
            const result = buildGaussianSegmentedMapping(parameters);
            mapping = result.mapping;
            return Promise.resolve(result);
          },
          destroy() {},
        },
      },
    );
    const source = page(0, 4097, 32);
    const rowBytes = 4096 * 16;
    const descriptor = {
      coreLogicalBytes: source.payload.byteLength,
      shLogicalBytes: 0,
      mappingBytes: rowBytes * 2,
      cropBytes: 32,
      cropLogicalSlots: 2,
      cropCapacitySlots: 2,
      orderingBytes: rowBytes * 2,
      coreCanonicalizationScratchBytes: 0,
    };
    const cropBounds = new Float64Array([-1, -2, 3, 4, 5, 6, 7, 8]);
    const ticket = resources.prepare({
      artifactIdentity: "artifact",
      ...mappingAuthority(),
      composition: {
        selectedSplatCount: 4097,
        slotCount: 2,
        fragmentCount: 2,
        fragmentCorePageIds: new Uint32Array([0, 0]),
        fragmentShPageIds: new Uint32Array([0xffffffff, 0xffffffff]),
        fragmentPageLocalStarts: new Uint32Array([0, 4096]),
        fragmentCounts: new Uint32Array([4096, 1]),
        fragmentPresentationStarts: new Uint32Array([0, 4096]),
        fragmentSlotIds: new Uint32Array([0, 1]),
        slotCoverageNodeIds: new Uint32Array([7, 8]),
        slotRepresentationIds: new Uint32Array([0, 0]),
        slotCropBounds: cropBounds,
      },
      descriptor,
      fragmentShDenseStarts: new Uint32Array([0xffffffff, 0xffffffff]),
      maxShDegree: 0,
      resolvePage: () => source,
      // Use two tiny Crop rows in the texture mock, without a WebGL context.
      maximumTextureSize: 1,
    });
    resources.advance(ticket);
    await Promise.resolve();
    await Promise.resolve();
    resources.advance(ticket);
    return {
      resources,
      ticket,
      textures,
      descriptor,
      mapping,
      cropBounds,
      rowBytes,
    };
  }

  function budgetOrderingUpload(resources, descriptor) {
    const ordering = Uint32Array.from(
      { length: descriptor.orderingBytes / 4 },
      (_, index) => index ^ 0x1234,
    );
    const binding = uploadBinding(ordering);
    const cursor = resources.prepareOrderingUpload(
      descriptor,
      ordering,
      binding,
    );
    return { ordering, binding, cursor };
  }

  it("scalar diagnostics: preserves cumulative copy and upload counts through cleanup", async function () {
    const { resources, ticket, descriptor, rowBytes } =
      await sharedUploadHarness();
    expect(resources.copiedSplats).toBe(4097);
    expect(resources.uploadedResources).toBe(0);
    expect(resources.copiedSplats).toBe(resources.statistics.copiedSplats);
    expect(resources.uploadedResources).toBe(
      resources.statistics.uploadedResources,
    );
    spyOnProperty(resources, "statistics", "get").and.throwError(
      "Full resource statistics are diagnostic-only",
    );
    resources.advance(ticket, { maximumTextureUploads: 2 });
    expect(resources.uploadedResources).toBe(2);
    const { ordering, binding, cursor } = budgetOrderingUpload(
      resources,
      descriptor,
    );
    for (let row = 0; row < 2; row++) {
      resources.advanceOrderingUpload(cursor, 1, binding, ordering, {
        remainingBytes: rowBytes,
        remainingUploads: 1,
      });
      expect(resources.uploadedResources).toBe(3 + row);
      expect(resources.copiedSplats).toBe(4097);
    }
    resources.abortOrderingUpload(cursor);
    resources.abort(ticket);
    resources.destroy();
    expect(resources.copiedSplats).toBe(4097);
    expect(resources.uploadedResources).toBe(4);
  });

  it("shared upload budget: slices Mapping and Crop into consecutive zero-copy rows", async function () {
    const { resources, ticket, textures, mapping, cropBounds, rowBytes } =
      await sharedUploadHarness();
    resources.advance(ticket, { maximumTextureUploads: 2 });
    for (const bytes of [rowBytes, rowBytes, 16, 16]) {
      const budget = { remainingBytes: bytes, remainingUploads: 1 };
      resources.advance(ticket, {
        maximumTextureUploads: 8,
        textureUploadBudget: budget,
      });
      expect(budget).toEqual({ remainingBytes: 0, remainingUploads: 0 });
    }
    expect(ticket.state).toBe("CONTENT_READY");
    for (const texture of textures) {
      expect(texture.uploads.map((upload) => upload.yOffset)).toEqual([0, 1]);
      expect(texture.uploads.map((upload) => upload.source.height)).toEqual([
        1, 1,
      ]);
      const [first, second] = texture.uploads.map(
        (upload) => upload.source.arrayBufferView,
      );
      expect(second.buffer).toBe(first.buffer);
      expect(second.byteOffset - first.byteOffset).toBe(texture.width * 16);
      expect(first.byteLength).toBe(texture.width * 16);
      expect(second.byteLength).toBe(texture.width * 16);
    }
    expect(textures[0].uploads[0].source.arrayBufferView.buffer).toBe(
      mapping.buffer,
    );
    expect(textures[0].data).toEqual(mapping);
    expect(textures[1].data).toEqual(new Float32Array(cropBounds));
    resources.abort(ticket);
    resources.destroy();
  });

  it("shared upload budget: charges empty allocations only as operations and waits for a complete row", async function () {
    const { resources, ticket, textures, rowBytes } =
      await sharedUploadHarness();
    const allocationBudget = { remainingBytes: 0, remainingUploads: 1 };
    resources.advance(ticket, {
      maximumTextureUploads: 8,
      textureUploadBudget: allocationBudget,
    });
    expect(textures.length).toBe(1);
    expect(allocationBudget).toEqual({
      remainingBytes: 0,
      remainingUploads: 0,
    });
    resources.advance(ticket, {
      maximumTextureUploads: 8,
      textureUploadBudget: allocationBudget,
    });
    expect(textures.length).toBe(1);
    const shortBudget = { remainingBytes: rowBytes - 1, remainingUploads: 8 };
    for (let attempt = 0; attempt < 2; attempt++) {
      resources.advance(ticket, {
        maximumTextureUploads: 8,
        textureUploadBudget: shortBudget,
      });
      expect(textures.length).toBe(2);
      expect(textures.every((texture) => texture.uploads.length === 0)).toBe(
        true,
      );
      expect(shortBudget).toEqual({
        remainingBytes: rowBytes - 1,
        remainingUploads: 7,
      });
    }
    const fullRowBudget = { remainingBytes: rowBytes, remainingUploads: 1 };
    resources.advance(ticket, {
      maximumTextureUploads: 1,
      textureUploadBudget: fullRowBudget,
    });
    expect(textures[0].uploads.length).toBe(1);
    expect(textures[0].uploads[0].yOffset).toBe(0);
    expect(ticket.state).toBe("UPLOADING");
    resources.abort(ticket);
    resources.destroy();
  });

  it("shared upload budget: prevents Mapping and Ordering from spending the same bytes or operation twice", async function () {
    const { resources, ticket, textures, descriptor, rowBytes } =
      await sharedUploadHarness();
    resources.advance(ticket, { maximumTextureUploads: 2 });
    const { ordering, binding, cursor } = budgetOrderingUpload(
      resources,
      descriptor,
    );
    const bytesBudget = { remainingBytes: rowBytes, remainingUploads: 2 };
    resources.advance(ticket, {
      maximumTextureUploads: 8,
      textureUploadBudget: bytesBudget,
    });
    resources.advanceOrderingUpload(cursor, 8, binding, ordering, bytesBudget);
    const orderingTexture = textures.find(
      (texture) => texture.role === "ordering",
    );
    expect(textures[0].uploads.length).toBe(1);
    expect(orderingTexture.uploads.length).toBe(0);
    expect(bytesBudget).toEqual({ remainingBytes: 0, remainingUploads: 1 });

    const operationBudget = {
      remainingBytes: rowBytes * 3,
      remainingUploads: 1,
    };
    resources.advanceOrderingUpload(
      cursor,
      8,
      binding,
      ordering,
      operationBudget,
    );
    resources.advance(ticket, {
      maximumTextureUploads: 8,
      textureUploadBudget: operationBudget,
    });
    expect(orderingTexture.uploads.length).toBe(1);
    expect(textures[0].uploads.length).toBe(1);
    expect(operationBudget).toEqual({
      remainingBytes: rowBytes,
      remainingUploads: 0,
    });
    resources.abortOrderingUpload(cursor);
    resources.abort(ticket);
    resources.destroy();
  });

  it("shared upload budget: keeps partial Ordering unconsumable and rejects rebinding after its first row", async function () {
    const { resources, ticket, textures, descriptor, rowBytes } =
      await sharedUploadHarness();
    const { ordering, binding, cursor } = budgetOrderingUpload(
      resources,
      descriptor,
    );
    const shortBudget = { remainingBytes: rowBytes - 1, remainingUploads: 1 };
    expect(
      resources.advanceOrderingUpload(cursor, 1, binding, ordering, shortBudget)
        .ready,
    ).toBe(false);
    expect(textures[0].uploads.length).toBe(0);
    expect(shortBudget.remainingUploads).toBe(1);
    const rowBudget = { remainingBytes: rowBytes, remainingUploads: 1 };
    expect(
      resources.advanceOrderingUpload(cursor, 1, binding, ordering, rowBudget)
        .ready,
    ).toBe(false);
    expect(() =>
      resources.consumeOrderingUpload(cursor, binding, ordering),
    ).toThrowDeveloperError();
    const newerOrdering = ordering.slice();
    expect(() =>
      resources.rebindOrderingUpload(
        cursor,
        descriptor,
        newerOrdering,
        uploadBinding(newerOrdering, 2),
      ),
    ).toThrowDeveloperError();
    expect(
      resources.advanceOrderingUpload(cursor, 1, binding, ordering, {
        remainingBytes: rowBytes,
        remainingUploads: 1,
      }).ready,
    ).toBe(true);
    const texture = textures[0];
    expect(texture.uploads.map((upload) => upload.yOffset)).toEqual([0, 1]);
    for (let row = 0; row < 2; row++) {
      const source = texture.uploads[row].source.arrayBufferView;
      expect(source.buffer).toBe(ordering.buffer);
      expect(source.byteOffset).toBe(ordering.byteOffset + row * rowBytes);
      expect(source.byteLength).toBe(rowBytes);
    }
    expect(texture.data).toEqual(ordering);
    expect(
      resources.consumeOrderingUpload(cursor, binding, ordering).texture,
    ).toBe(texture);
    expect(resources.statistics.activeOrderingUploadCursorCount).toBe(0);
    resources.destroyOrderingTexture(texture);
    resources.abort(ticket);
    resources.destroy();
  });

  it("shared upload budget: aborts partial Mapping and Ordering without advancing stale cursors", async function () {
    const { resources, ticket, textures, descriptor, rowBytes } =
      await sharedUploadHarness();
    resources.advance(ticket, { maximumTextureUploads: 2 });
    const { ordering, binding, cursor } = budgetOrderingUpload(
      resources,
      descriptor,
    );
    resources.advance(ticket, {
      maximumTextureUploads: 1,
      textureUploadBudget: { remainingBytes: rowBytes, remainingUploads: 1 },
    });
    resources.advanceOrderingUpload(cursor, 1, binding, ordering, {
      remainingBytes: rowBytes,
      remainingUploads: 1,
    });
    expect(resources.abortOrderingUpload(cursor)).toBe(true);
    expect(resources.abort(ticket)).toBe(true);
    for (const texture of textures) {
      expect(texture.destroy).toHaveBeenCalledOnceWith();
    }
    expect(resources.statistics.activeOrderingUploadCursorCount).toBe(0);
    expect(resources.statistics.cleanupDebtBytes).toBe(0);
    expect(() =>
      resources.advance(ticket, { maximumTextureUploads: 1 }),
    ).toThrowDeveloperError();
    expect(() =>
      resources.advanceOrderingUpload(cursor, 1, binding, ordering),
    ).toThrowDeveloperError();
    expect(textures.map((texture) => texture.uploads.length)).toEqual([
      1, 0, 1,
    ]);
    resources.destroy();
  });

  it("writes Worker Mapping without rewriting retained Core or SH", async function () {
    const textures = [];
    function createTexture(options) {
      const elementCount =
        options.width * options.height * (options.layers ?? 1) * 4;
      const texture = {
        ...options,
        data: options.float
          ? new Float32Array(elementCount)
          : new Uint32Array(elementCount),
        destroyed: false,
        copyFrom(upload) {
          this.uploads ??= [];
          this.uploads.push(upload);
          const source = upload.source.arrayBufferView;
          const rowElements = upload.source.width * 4;
          const targetWidth = options.width * 4;
          const layerStride = targetWidth * options.height;
          for (let row = 0; row < upload.source.height; row++) {
            const target =
              (upload.layerOffset ?? 0) * layerStride +
              ((upload.yOffset ?? 0) + row) * targetWidth +
              (upload.xOffset ?? 0) * 4;
            this.data.set(
              source.subarray(row * rowElements, (row + 1) * rowElements),
              target,
            );
          }
        },
        destroy() {
          this.destroyed = true;
        },
      };
      textures.push(texture);
      return texture;
    }
    const resources = new _SceneGISGaussianSegmentedGlobalPresentationResources(
      {
        contentAtlas: mockAtlas(),
        createArrayTexture: createTexture,
        createTexture,
        mappingTaskProcessor: mappingTaskProcessor(),
      },
    );
    const composition = {
      selectedSplatCount: 3,
      slotCount: 2,
      fragmentCount: 2,
      fragmentCorePageIds: new Uint32Array([0, 0]),
      fragmentShPageIds: new Uint32Array([1, 0xffffffff]),
      fragmentPageLocalStarts: new Uint32Array([0, 2]),
      fragmentCounts: new Uint32Array([2, 1]),
      fragmentPresentationStarts: new Uint32Array([0, 2]),
      fragmentSlotIds: new Uint32Array([0, 1]),
      slotCoverageNodeIds: new Uint32Array([7, 8]),
      slotRepresentationIds: new Uint32Array([0, 0]),
      slotCropBounds: new Float64Array([-1, -2, 3, 4, 5, 6, 7, 8]),
    };
    const descriptor = {
      coreBytes: 8192,
      coreLogicalBytes: 96,
      coreLayerCount: 1,
      coreTextureHeight: 1,
      shBytes: 4096,
      shLogicalBytes: 32,
      shLayerCount: 1,
      shTextureHeight: 1,
      mappingBytes: 65536,
      cropBytes: 32,
      cropLogicalSlots: 2,
      cropCapacitySlots: 2,
      orderingBytes: 65536,
      coreCanonicalizationScratchBytes: 0,
      cpuStagingBytes: 131296,
      gpuPresentationBytes: 147552,
    };
    const pages = new Map([
      [0, page(0, 4, 32)],
      [1, page(1, 4, 16)],
    ]);
    const originalCorePage = pages.get(0).payload.slice();
    const plan = {
      artifactIdentity: "artifact",
      ...mappingAuthority(),
      composition,
      descriptor,
      fragmentShDenseStarts: new Uint32Array([0, 0xffffffff]),
      maxShDegree: 1,
      resolvePage: (id) => pages.get(id),
    };
    const ticket = resources.prepare(plan);
    expect(
      resources.advance(ticket, {
        maximumMappingEntries: 1,
        maximumTextureUploads: 0,
        maximumPositionExtractions: 0,
      }).state,
    ).toBe("MAPPING");
    expect(textures.length).toBe(0);
    await Promise.resolve();
    await Promise.resolve();
    let progress;
    do {
      progress = resources.advance(ticket, {
        maximumMappingEntries: 1,
        maximumTextureUploads: 1,
        maximumPositionExtractions: 1,
      });
    } while (!progress.ready);
    expect(progress.state).toBe("CONTENT_READY");
    const mapping = textures.find((value) => value.role === "mapping").data;
    expect([...mapping.subarray(0, 12)]).toEqual([
      0, 256, 0, 7, 1, 257, 0, 7, 2, 0xffffffff, 1, 8,
    ]);
    const crop = textures.find((value) => value.role === "crop").data;
    expect([...crop.subarray(0, 8)]).toEqual([-1, -2, 3, 4, 5, 6, 7, 8]);
    const ordering = new Uint32Array(descriptor.orderingBytes / 4);
    ordering.fill(0xffffffff);
    ordering.set([2, 1, 0]);
    const initialBinding = uploadBinding(ordering);
    const initialUpload = resources.prepareOrderingUpload(
      descriptor,
      ordering,
      initialBinding,
    );
    expect(
      resources.advanceOrderingUpload(
        initialUpload,
        0,
        initialBinding,
        ordering,
      ).ready,
    ).toBe(false);
    expect(
      resources.advanceOrderingUpload(
        initialUpload,
        1,
        initialBinding,
        ordering,
      ).ready,
    ).toBe(true);
    resources.installPreparedOrdering(
      ticket,
      initialUpload,
      initialBinding,
      ordering,
    );
    expect(ticket.reachableCpuRoles.coreBytes).toBe(0);
    expect(ticket.reachableCpuRoles.shBytes).toBe(0);
    expect(ticket.reachableCpuRoles.coreCanonicalizationScratchBytes).toBe(0);
    expect(
      Object.values(ticket.reachableCpuRoles).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ).toBeLessThanOrEqual(descriptor.cpuStagingBytes);
    const owner = resources.createOwner(ticket, {
      resourceOwnerIdentity: "owner-1",
    });
    expect(owner.coreTexture.role).toBe("atlas-core");
    expect(owner.shTexture.role).toBe("atlas-sh");
    expect(resources.statistics.presentationCoreRewriteSplats).toBe(0);
    expect(resources.statistics.mappingEntriesWritten).toBe(3);
    expect(resources.statistics.coreCanonicalizationScratchBytes).toBe(0);
    expect(resources.statistics.coreCanonicalizationScratchHighWaterBytes).toBe(
      0,
    );
    expect(pages.get(0).payload).toEqual(originalCorePage);
    const replacementOrdering = ordering.slice();
    replacementOrdering[0] = 0;
    const replacementBinding = uploadBinding(replacementOrdering, 2);
    const replacementUpload = resources.prepareOrderingUpload(
      descriptor,
      replacementOrdering,
      replacementBinding,
    );
    resources.advanceOrderingUpload(
      replacementUpload,
      1,
      replacementBinding,
      replacementOrdering,
    );
    const replacementTexture = resources.consumeOrderingUpload(
      replacementUpload,
      replacementBinding,
      replacementOrdering,
    ).texture;
    const oldTexture = resources.prepareOrderingSwap(
      owner,
      replacementTexture,
      replacementOrdering,
    )();
    expect(owner.ordering).toBe(replacementOrdering);
    expect(owner.orderingTexture).toBe(replacementTexture);
    resources.destroyOrderingTexture(oldTexture);
    expect(resources.retire(owner)).toBe(true);
    expect(textures.every((texture) => texture.destroyed)).toBe(true);
  });

  it("keeps 4096 Mapping entries off the main-thread frame quota", async function () {
    function createHarness() {
      const textures = [];
      const createTexture = (options) => {
        const texture = {
          ...options,
          uploads: [],
          copyFrom(upload) {
            this.uploads.push(upload);
          },
          destroy() {},
        };
        textures.push(texture);
        return texture;
      };
      const resources =
        new _SceneGISGaussianSegmentedGlobalPresentationResources({
          contentAtlas: mockAtlas(),
          createArrayTexture: createTexture,
          createTexture,
          mappingTaskProcessor: mappingTaskProcessor(),
        });
      const splatCount = 4096;
      const source = page(0, splatCount, 32);
      const descriptor = {
        coreBytes: splatCount * 32,
        coreLogicalBytes: splatCount * 32,
        coreLayerCount: 16,
        coreTextureHeight: 1,
        shBytes: 0,
        shLogicalBytes: 0,
        shLayerCount: 0,
        shTextureHeight: 0,
        mappingBytes: 65536,
        cropBytes: 16,
        cropLogicalSlots: 1,
        cropCapacitySlots: 1,
        orderingBytes: 65536,
        coreCanonicalizationScratchBytes: 0,
        cpuStagingBytes: splatCount * 32 + 131088,
        gpuPresentationBytes: splatCount * 32 + 131088,
      };
      const ticket = resources.prepare({
        artifactIdentity: "artifact",
        ...mappingAuthority(),
        composition: {
          selectedSplatCount: splatCount,
          slotCount: 1,
          fragmentCount: 1,
          fragmentCorePageIds: new Uint32Array([0]),
          fragmentShPageIds: new Uint32Array([0xffffffff]),
          fragmentPageLocalStarts: new Uint32Array([0]),
          fragmentCounts: new Uint32Array([splatCount]),
          fragmentPresentationStarts: new Uint32Array([0]),
          fragmentSlotIds: new Uint32Array([0]),
          slotCoverageNodeIds: new Uint32Array([7]),
          slotRepresentationIds: new Uint32Array([0]),
          slotCropBounds: new Float64Array([-1, -1, 1, 1]),
        },
        descriptor,
        fragmentShDenseStarts: new Uint32Array([0xffffffff]),
        maxShDegree: 0,
        resolvePage: () => source,
      });
      return { resources, ticket, textures, splatCount };
    }

    const one = createHarness();
    let progress = one.resources.advance(one.ticket, {
      maximumMappingEntries: 1,
      maximumTextureUploads: 0,
      maximumPositionExtractions: 0,
    });
    expect(progress.copiedSplats).toBe(0);
    expect(one.textures.length).toBe(0);
    await Promise.resolve();
    await Promise.resolve();
    progress = one.resources.advance(one.ticket, {
      maximumMappingEntries: 0,
      maximumTextureUploads: 0,
      maximumPositionExtractions: 0,
    });
    expect(progress.copiedSplats).toBe(4096);
    expect(one.resources.statistics.lastFrameMappingEntriesWritten).toBe(0);

    const sixteen = createHarness();
    for (const limits of [
      {
        maximumMappingEntries: 0,
        maximumTextureUploads: 16,
        maximumPositionExtractions: sixteen.splatCount,
      },
    ]) {
      progress = sixteen.resources.advance(sixteen.ticket, limits);
      expect(progress.copiedSplats).toBe(0);
    }
    await Promise.resolve();
    await Promise.resolve();
    progress = sixteen.resources.advance(sixteen.ticket, {
      maximumMappingEntries: sixteen.splatCount,
      maximumTextureUploads: 0,
      maximumPositionExtractions: 0,
    });
    expect(progress.copiedSplats).toBe(4096);
    expect(progress.ready).toBe(false);
    progress = sixteen.resources.advance(sixteen.ticket, {
      maximumMappingEntries: 0,
      maximumTextureUploads: 4,
      maximumPositionExtractions: 0,
    });
    expect(progress.ready).toBe(true);
    expect(sixteen.textures.map((texture) => texture.role)).toEqual([
      "mapping",
      "crop",
    ]);
    expect(
      sixteen.textures.every((texture) => texture.uploads.length === 1),
    ).toBe(true);
    expect(sixteen.resources.statistics.presentationCoreRewriteSplats).toBe(0);
  });

  it("fails closed on invalid atlas authority and aborts with zero Core scratch", function () {
    const resources = new _SceneGISGaussianSegmentedGlobalPresentationResources(
      {
        contentAtlas: {
          pageAddress() {
            return { semantic: 1, splatCount: 0, packedAddress: 0 };
          },
        },
        createTexture() {
          return { copyFrom() {}, destroy() {} };
        },
      },
    );
    const source = page(0, 1, 32);
    expect(function () {
      resources.prepare({
        artifactIdentity: "artifact",
        ...mappingAuthority(),
        composition: {
          selectedSplatCount: 1,
          slotCount: 1,
          fragmentCount: 1,
          fragmentCorePageIds: new Uint32Array([0]),
          fragmentShPageIds: new Uint32Array([0xffffffff]),
          fragmentPageLocalStarts: new Uint32Array([0]),
          fragmentCounts: new Uint32Array([1]),
          fragmentPresentationStarts: new Uint32Array([0]),
          fragmentSlotIds: new Uint32Array([0]),
          slotCoverageNodeIds: new Uint32Array([0]),
          slotRepresentationIds: new Uint32Array([0]),
          slotCropBounds: new Float64Array(4),
        },
        descriptor: {
          coreLogicalBytes: 32,
          mappingBytes: 65536,
          cropBytes: 16,
          cropLogicalSlots: 1,
          cropCapacitySlots: 1,
          orderingBytes: 65536,
          coreCanonicalizationScratchBytes: 0,
        },
        fragmentShDenseStarts: new Uint32Array([0xffffffff]),
        maxShDegree: 0,
        resolvePage: () => source,
      });
    }).toThrowDeveloperError();
    expect(resources.statistics.coreCanonicalizationScratchBytes).toBe(0);
    expect(resources.statistics.presentationCoreRewriteSplats).toBe(0);
  });

  it("rejects non-finite limits and corrupt Page provenance before copy", function () {
    const resources = new _SceneGISGaussianSegmentedGlobalPresentationResources(
      {
        contentAtlas: mockAtlas(),
        createArrayTexture() {
          return { copyFrom() {}, destroy() {} };
        },
        createTexture() {
          return { copyFrom() {}, destroy() {} };
        },
      },
    );
    const validSource = page(0, 1, 32);
    const plan = {
      artifactIdentity: "artifact",
      ...mappingAuthority(),
      composition: {
        selectedSplatCount: 1,
        slotCount: 1,
        fragmentCount: 1,
        fragmentCorePageIds: new Uint32Array([0]),
        fragmentShPageIds: new Uint32Array([0xffffffff]),
        fragmentPageLocalStarts: new Uint32Array([0]),
        fragmentCounts: new Uint32Array([1]),
        fragmentPresentationStarts: new Uint32Array([0]),
        fragmentSlotIds: new Uint32Array([0]),
        slotCoverageNodeIds: new Uint32Array([0]),
        slotRepresentationIds: new Uint32Array([0]),
        slotCropBounds: new Float64Array(4),
      },
      descriptor: {
        coreBytes: 8192,
        coreLogicalBytes: 32,
        coreLayerCount: 1,
        coreTextureHeight: 1,
        shBytes: 0,
        shLogicalBytes: 0,
        mappingBytes: 65536,
        cropBytes: 16,
        cropLogicalSlots: 1,
        cropCapacitySlots: 1,
        orderingBytes: 65536,
        coreCanonicalizationScratchBytes: 0,
        cpuStagingBytes: 33,
        gpuPresentationBytes: 1,
      },
      fragmentShDenseStarts: new Uint32Array([0xffffffff]),
      maxShDegree: 0,
      resolvePage: () => validSource,
    };
    const ticket = resources.prepare(plan);
    expect(function () {
      resources.advance(ticket, {
        maximumMappingEntries: Number.POSITIVE_INFINITY,
        maximumTextureUploads: 0,
        maximumPositionExtractions: 0,
      });
    }).toThrowDeveloperError();
    plan.resolvePage = function () {
      return {
        descriptor: {
          artifactIdentity: "artifact",
          index: 0,
          assetId: 0,
          assetLocalStart: 0,
          semantic: 1,
          splatCount: 1,
          rawBytes: 31,
          storedBytes: 31,
        },
        payload: new Uint8Array(31),
      };
    };
    expect(() => resources.prepare(plan)).toThrowDeveloperError();
  });

  it("discards an aborted Mapping settlement without resource debt", async function () {
    let parameters;
    let resolveMapping;
    const resources = new _SceneGISGaussianSegmentedGlobalPresentationResources(
      {
        contentAtlas: mockAtlas(),
        mappingTaskProcessor: {
          scheduleTask(value) {
            parameters = value;
            return new Promise((resolve) => {
              resolveMapping = resolve;
            });
          },
          destroy() {},
        },
        createArrayTexture() {
          throw new Error("stale Mapping must not allocate");
        },
        createTexture() {
          throw new Error("stale Mapping must not allocate");
        },
      },
    );
    const source = page(0, 1, 32);
    const ticket = resources.prepare({
      artifactIdentity: "artifact",
      ...mappingAuthority(),
      composition: {
        selectedSplatCount: 1,
        slotCount: 1,
        fragmentCount: 1,
        fragmentCorePageIds: new Uint32Array([0]),
        fragmentShPageIds: new Uint32Array([0xffffffff]),
        fragmentPageLocalStarts: new Uint32Array([0]),
        fragmentCounts: new Uint32Array([1]),
        fragmentPresentationStarts: new Uint32Array([0]),
        fragmentSlotIds: new Uint32Array([0]),
        slotCoverageNodeIds: new Uint32Array([9]),
        slotRepresentationIds: new Uint32Array([0]),
        slotCropBounds: new Float64Array([-1, -1, 1, 1]),
      },
      descriptor: {
        coreBytes: 8192,
        coreLogicalBytes: 32,
        coreLayerCount: 1,
        coreTextureHeight: 1,
        shBytes: 0,
        shLogicalBytes: 0,
        shLayerCount: 0,
        shTextureHeight: 0,
        mappingBytes: 65536,
        cropBytes: 16,
        cropLogicalSlots: 1,
        cropCapacitySlots: 1,
        orderingBytes: 65536,
        coreCanonicalizationScratchBytes: 0,
        cpuStagingBytes: 131188,
        gpuPresentationBytes: 139280,
      },
      fragmentShDenseStarts: new Uint32Array([0xffffffff]),
      maxShDegree: 0,
      resolvePage: () => source,
    });
    resources.advance(ticket);
    expect(resources.abort(ticket)).toBe(true);
    resolveMapping(buildGaussianSegmentedMapping(parameters));
    await Promise.resolve();
    await Promise.resolve();
    expect(resources.statistics.staleMappingDiscardCount).toBe(1);
    expect(resources.statistics.cleanupDebtBytes).toBe(0);
    expect(resources.destroy()).toBe(true);
  });

  it("allocates only exact Mapping, Crop, and Ordering WebGL2 textures", async function () {
    const context = createContext({ requestWebgl1: false });
    ContextLimits._maximumTextureSize = context.maximumTextureSize;
    try {
      const resources =
        new _SceneGISGaussianSegmentedGlobalPresentationResources({
          contentAtlas: mockAtlas(),
          context,
          mappingTaskProcessor: mappingTaskProcessor(),
        });
      const source = page(0, 1, 32);
      const descriptor = {
        coreBytes: 8192,
        coreLogicalBytes: 32,
        coreLayerCount: 1,
        coreTextureHeight: 1,
        shBytes: 0,
        shLogicalBytes: 0,
        shLayerCount: 0,
        shTextureHeight: 0,
        mappingBytes: 65536,
        cropBytes: 16,
        cropLogicalSlots: 1,
        cropCapacitySlots: 1,
        orderingBytes: 65536,
        coreCanonicalizationScratchBytes: 0,
        cpuStagingBytes: 131188,
        gpuPresentationBytes: 139280,
      };
      const ticket = resources.prepare({
        artifactIdentity: "artifact",
        ...mappingAuthority(),
        composition: {
          selectedSplatCount: 1,
          slotCount: 1,
          fragmentCount: 1,
          fragmentCorePageIds: new Uint32Array([0]),
          fragmentShPageIds: new Uint32Array([0xffffffff]),
          fragmentPageLocalStarts: new Uint32Array([0]),
          fragmentCounts: new Uint32Array([1]),
          fragmentPresentationStarts: new Uint32Array([0]),
          fragmentSlotIds: new Uint32Array([0]),
          slotCoverageNodeIds: new Uint32Array([9]),
          slotRepresentationIds: new Uint32Array([0]),
          slotCropBounds: new Float64Array([-1, -1, 1, 1]),
        },
        descriptor,
        fragmentShDenseStarts: new Uint32Array([0xffffffff]),
        maxShDegree: 0,
        maximumTextureSize: context.maximumTextureSize,
        resolvePage: () => source,
      });
      resources.advance(ticket, {
        maximumMappingEntries: 0,
        maximumTextureUploads: 0,
        maximumPositionExtractions: 0,
      });
      await Promise.resolve();
      await Promise.resolve();
      let progress;
      do {
        progress = resources.advance(ticket, {
          maximumMappingEntries: 1,
          maximumTextureUploads: 1,
          maximumPositionExtractions: 1,
        });
      } while (!progress.ready);
      const ordering = new Uint32Array(descriptor.orderingBytes / 4);
      ordering.fill(0xffffffff);
      ordering[0] = 0;
      const binding = uploadBinding(ordering);
      const upload = resources.prepareOrderingUpload(
        descriptor,
        ordering,
        binding,
      );
      expect(
        resources.advanceOrderingUpload(upload, 0, binding, ordering).ready,
      ).toBe(false);
      resources.advanceOrderingUpload(upload, 1, binding, ordering);
      resources.installPreparedOrdering(ticket, upload, binding, ordering);
      const owner = resources.createOwner(ticket, {
        resourceOwnerIdentity: "webgl-owner",
      });
      expect(owner.coreTexture.role).toBe("atlas-core");
      expect(owner.mappingTexture.width).toBe(4096);
      expect(owner.cropTexture.width).toBe(1);
      expect(owner.orderingTexture.width).toBe(4096);
      const gl = context._gl;
      function expectNearest(texture, target) {
        gl.bindTexture(target, texture._texture);
        expect(gl.getTexParameter(target, gl.TEXTURE_MIN_FILTER)).toBe(
          gl.NEAREST,
        );
        expect(gl.getTexParameter(target, gl.TEXTURE_MAG_FILTER)).toBe(
          gl.NEAREST,
        );
        gl.bindTexture(target, null);
      }
      expectNearest(owner.mappingTexture, gl.TEXTURE_2D);
      expectNearest(owner.orderingTexture, gl.TEXTURE_2D);
      resources.retire(owner);
    } finally {
      context.destroyForSpecs();
    }
  });

  it("rebinds only a zero-copy Ordering cursor and rejects stale consume authority", function () {
    let allocationCount = 0;
    let copyFromCount = 0;
    let uploaded;
    const resources = new _SceneGISGaussianSegmentedGlobalPresentationResources(
      {
        contentAtlas: mockAtlas(),
        createArrayTexture() {},
        createTexture() {
          allocationCount++;
          return {
            copyFrom(options) {
              copyFromCount++;
              uploaded = options.source.arrayBufferView.slice();
            },
            destroy() {},
          };
        },
      },
    );
    const descriptor = { orderingBytes: 65536 };
    const view2 = new Uint32Array(16384);
    view2[0] = 2;
    const view3 = new Uint32Array(16384);
    view3[0] = 3;
    const binding2 = uploadBinding(view2, 2);
    const binding3 = uploadBinding(view3, 3);
    const cursor = resources.prepareOrderingUpload(descriptor, view2, binding2);
    expect(
      resources.advanceOrderingUpload(cursor, 0, binding2, view2).ready,
    ).toBe(false);
    expect(allocationCount).toBe(1);
    expect(copyFromCount).toBe(0);
    expect(
      resources.rebindOrderingUpload(cursor, descriptor, view3, binding3),
    ).toBe(cursor);
    expect(function () {
      resources.advanceOrderingUpload(cursor, 1, binding2, view2);
    }).toThrowDeveloperError();
    expect(
      resources.advanceOrderingUpload(cursor, 1, binding3, view3).ready,
    ).toBe(true);
    expect(copyFromCount).toBe(1);
    expect(uploaded[0]).toBe(3);
    expect(function () {
      resources.rebindOrderingUpload(cursor, descriptor, view2, binding2);
    }).toThrowDeveloperError();
    expect(function () {
      resources.consumeOrderingUpload(cursor, binding2, view2);
    }).toThrowDeveloperError();
    const prepared = resources.consumeOrderingUpload(cursor, binding3, view3);
    expect(prepared.ordering).toBe(view3);
    expect(resources.statistics.activeOrderingUploadCursorCount).toBe(0);
    expect(resources.statistics.cleanupDebtBytes).toBe(0);
  });

  it("cleans initial and replacement Ordering upload failure without changing current", function () {
    let failures = 2;
    const resources = new _SceneGISGaussianSegmentedGlobalPresentationResources(
      {
        contentAtlas: mockAtlas(),
        createArrayTexture() {},
        createTexture() {
          return {
            copyFrom() {
              throw new Error("injected upload failure");
            },
            destroy() {
              if (failures-- > 0) {
                throw new Error("injected texture destroy failure");
              }
            },
          };
        },
      },
    );
    const ordering = new Uint32Array(16384);
    const binding = uploadBinding(ordering);
    const cursor = resources.prepareOrderingUpload(
      { orderingBytes: 65536 },
      ordering,
      binding,
    );
    expect(
      resources.advanceOrderingUpload(cursor, 0, binding, ordering).ready,
    ).toBe(false);
    expect(function () {
      resources.advanceOrderingUpload(cursor, 1, binding, ordering);
    }).toThrowError("injected upload failure");
    expect(resources.statistics.cleanupDebtBytes).toBe(65536);
    expect(function () {
      resources.abortOrderingUpload(cursor);
    }).toThrowError("injected texture destroy failure");
    expect(function () {
      resources.abortOrderingUpload(cursor);
    }).toThrowError("injected texture destroy failure");
    expect(resources.abortOrderingUpload(cursor)).toBe(true);
    expect(resources.statistics.cleanupDebtBytes).toBe(0);
  });
});
