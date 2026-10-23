import Color from "../../../../Source/Core/Color.js";
import Matrix4 from "../../../../Source/Core/Matrix4.js";
import SceneGISGaussianSegmentedPrimitive from "../../../../Source/SceneGIS/Scene/SceneGISGaussianSegmentedPrimitive.js";
import * as Engine from "../../../../index.js";

function options(overrides = {}) {
  return {
    url: "https://example.test/scene.mcl.json",
    maximumSelectedSplats: 1_000_000,
    maximumCoverageSlots: 100_000,
    maximumCpuBytes: 100_000_000,
    maximumGpuBytes: 100_000_000,
    maximumCpuPageBytes: 10_000_000,
    replacementCpuEscrowBytes: 5_000_000,
    maximumGpuPageBytes: 10_000_000,
    replacementGpuEscrowBytes: 5_000_000,
    maximumSortWorkingSetBytes: 1_000_000,
    ...overrides,
  };
}

describe("SceneGIS/Scene/SceneGISGaussianSegmentedPrimitive", function () {
  it("pending destroy: continues after removal without update and coalesces repeated requests into one timer", function () {
    jasmine.clock().install();
    try {
      const primitive = new SceneGISGaussianSegmentedPrimitive(options());
      expect(primitive._destroyCleanupTimer).toBeUndefined();
      primitive._controller.requestDestroy();
      let acknowledged = false;
      const controller = {
        destroyed: false,
        update: jasmine.createSpy("removed Primitive update"),
        requestDestroy: jasmine.createSpy("requestDestroy").and.callFake(() => {
          controller.destroyed = acknowledged;
          return acknowledged;
        }),
      };
      primitive._controller = controller;
      expect(primitive.destroy()).toBeUndefined();
      const timer = primitive._destroyCleanupTimer;
      expect(timer).toBeDefined();
      primitive.destroy();
      primitive.destroy();
      expect(primitive._destroyCleanupTimer).toBe(timer);
      expect(primitive.isDestroyed()).toBe(false);
      jasmine.clock().tick(16);
      expect(controller.requestDestroy.calls.count()).toBe(4);
      expect(primitive.isDestroyed()).toBe(false);
      acknowledged = true;
      jasmine.clock().tick(16);
      expect(primitive.isDestroyed()).toBe(true);
      expect(primitive._destroyCleanupTimer).toBeUndefined();
      const requests = controller.requestDestroy.calls.count();
      jasmine.clock().tick(160);
      expect(controller.requestDestroy.calls.count()).toBe(requests);
      expect(controller.update).not.toHaveBeenCalled();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it("pending destroy: cancels its pending timer when a repeated synchronous call completes", function () {
    jasmine.clock().install();
    try {
      const primitive = Object.create(
        SceneGISGaussianSegmentedPrimitive.prototype,
      );
      const controller = {
        destroyed: false,
        requestDestroy: jasmine.createSpy("requestDestroy"),
      };
      primitive._controller = controller;
      primitive.destroy();
      expect(primitive._destroyCleanupTimer).toBeDefined();
      controller.requestDestroy.and.callFake(() => {
        controller.destroyed = true;
        return true;
      });
      primitive.destroy();
      expect(primitive._destroyCleanupTimer).toBeUndefined();
      jasmine.clock().tick(160);
      expect(controller.requestDestroy.calls.count()).toBe(2);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it("pending destroy: preserves synchronous and background cleanup failures while retrying the same transaction", function () {
    jasmine.clock().install();
    try {
      const primitive = Object.create(
        SceneGISGaussianSegmentedPrimitive.prototype,
      );
      const failure = new Error("delayed cleanup failed");
      let attempts = 0;
      const controller = {
        destroyed: false,
        requestDestroy() {
          attempts++;
          if (attempts <= 2) {
            throw failure;
          }
          controller.destroyed = true;
          return true;
        },
      };
      primitive._controller = controller;
      expect(() => primitive.destroy()).toThrow(failure);
      expect(primitive.error).toBe(failure);
      expect(primitive.isDestroyed()).toBe(false);
      expect(primitive._destroyCleanupTimer).toBeDefined();
      jasmine.clock().tick(16);
      expect(attempts).toBe(2);
      expect(primitive.error).toBe(failure);
      expect(primitive.isDestroyed()).toBe(false);
      expect(primitive._destroyCleanupTimer).toBeDefined();
      jasmine.clock().tick(16);
      expect(attempts).toBe(3);
      expect(primitive.isDestroyed()).toBe(true);
      expect(primitive._destroyCleanupTimer).toBeUndefined();
      expect(primitive.error).toBe(failure);
      jasmine.clock().tick(160);
      expect(attempts).toBe(3);
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it("segmented persistence: enables the isolated cache by default and forwards explicit limits", function () {
    const factory = jasmine.createSpy("persistent cache factory");
    const defaults = new SceneGISGaussianSegmentedPrimitive(
      options({ _persistentCacheFactory: factory }),
    );
    expect(defaults._controller._options).toEqual(
      jasmine.objectContaining({
        usePersistentCache: true,
        maximumPersistentCacheBytes: 4 * 1024 ** 3,
        maximumPersistentCacheStagingBytes: 64 * 1024 ** 2,
        requestPersistentStorage: true,
        persistentCacheFactory: factory,
      }),
    );
    expect(factory).not.toHaveBeenCalled();
    defaults.destroy();

    const configured = new SceneGISGaussianSegmentedPrimitive(
      options({
        usePersistentCache: false,
        maximumPersistentCacheBytes: 123456,
        maximumPersistentCacheStagingBytes: 7890,
        requestPersistentStorage: false,
        _persistentCacheFactory: factory,
      }),
    );
    expect(configured._controller._options).toEqual(
      jasmine.objectContaining({
        usePersistentCache: false,
        maximumPersistentCacheBytes: 123456,
        maximumPersistentCacheStagingBytes: 7890,
        requestPersistentStorage: false,
      }),
    );
    configured._controller._initializePersistentCache();
    expect(factory).not.toHaveBeenCalled();
    expect(configured.statistics.persistentCacheEnabled).toBe(false);
    expect(configured.statistics.persistentCacheDisabledReason).toBe(
      "explicitly-disabled",
    );
    configured.destroy();
  });

  it("segmented persistence: rejects invalid storage and staging limits before creating a cache", function () {
    const factory = jasmine.createSpy("persistent cache factory");
    for (const name of [
      "maximumPersistentCacheBytes",
      "maximumPersistentCacheStagingBytes",
    ]) {
      for (const value of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(
          () =>
            new SceneGISGaussianSegmentedPrimitive(
              options({ [name]: value, _persistentCacheFactory: factory }),
            ),
        ).toThrowDeveloperError();
      }
    }
    expect(factory).not.toHaveBeenCalled();
  });

  it("exports the segmented public route without a fixed-grid entry", function () {
    expect(Engine.GaussianMacroChunkPrimitive).toBeUndefined();
    expect(typeof Engine.SceneGISGaussianSegmentedPrimitive).toBe("function");
    const segmented = new SceneGISGaussianSegmentedPrimitive(options());
    expect(segmented.state).toBe("LOADING");
    expect(segmented.ready).toBe(false);
    expect(segmented.statistics.liveContentWork).toBe(0);
    expect(segmented.statistics.liveOrderingWork).toBe(0);
    expect(segmented._controller._options.refineErrorPixels).toBe(16);
    expect(segmented._controller._options.coarsenErrorPixels).toBe(12);
    expect(segmented._controller._options.maximumMappingEntriesPerFrame).toBe(
      32768,
    );
    expect(
      segmented._controller._options.maximumSortPositionExtractionsPerFrame,
    ).toBe(32768);
    expect(segmented._controller._options.maximumTextureUploadsPerFrame).toBe(
      16,
    );
    expect(
      segmented._controller._options.maximumGpuFeedOperationsPerFrame,
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(segmented._controller._options.maximumGpuFeedBytesPerFrame).toBe(
      8 * 1024 * 1024,
    );
    expect(
      segmented._controller._loader._maximumRawCompletionPagesPerUpdate,
    ).toBe(Number.MAX_SAFE_INTEGER);
    expect(
      segmented._controller._loader._maximumRawCompletionWorkMilliseconds,
    ).toBeUndefined();
    segmented.destroy();
    expect(segmented.isDestroyed()).toBe(true);
  });

  it("rejects missing, zero, inverted and impossible resource partitions before loading", function () {
    for (const mutation of [
      { maximumCpuPageBytes: 0 },
      { replacementCpuEscrowBytes: 0 },
      { maximumGpuPageBytes: 0 },
      { replacementGpuEscrowBytes: 0 },
      { replacementCpuEscrowBytes: 10_000_001 },
      { replacementGpuEscrowBytes: 10_000_001 },
      { maximumCpuBytes: 11_000_000 },
      { maximumGpuBytes: 10_000_000 },
      { coarsenErrorPixels: -1 },
      { coarsenErrorPixels: Number.NaN },
      { coarsenErrorPixels: Number.POSITIVE_INFINITY },
      { coarsenErrorPixels: 2, refineErrorPixels: 2 },
      { _maximumGpuPageFeedOperationsPerFrame: -1 },
      { _maximumGpuPageFeedBytesPerFrame: -1 },
    ]) {
      expect(function () {
        return new SceneGISGaussianSegmentedPrimitive(options(mutation));
      }).toThrowDeveloperError();
    }
    expect(function () {
      return new SceneGISGaussianSegmentedPrimitive({});
    }).toThrowDeveloperError();
    const zeroCoarsen = new SceneGISGaussianSegmentedPrimitive(
      options({ coarsenErrorPixels: 0 }),
    );
    zeroCoarsen.destroy();
  });

  it("owns show, rigid modelMatrix, color and falloff independently", function () {
    const primitive = new SceneGISGaussianSegmentedPrimitive(options());
    primitive.show = false;
    primitive.color = Color.RED;
    primitive.falloff = 2;
    primitive.modelMatrix = Matrix4.fromTranslation({ x: 1, y: 2, z: 3 });
    expect(primitive.show).toBe(false);
    expect(primitive.color).toEqual(Color.RED);
    expect(primitive.falloff).toBe(2);
    expect(primitive.modelMatrix[12]).toBe(1);
    expect(function () {
      primitive.modelMatrix = Matrix4.fromScale({ x: 2, y: 1, z: 1 });
    }).toThrowDeveloperError();
    primitive.destroy();
  });
});
