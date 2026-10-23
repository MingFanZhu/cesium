import DeveloperError from "../../../../Source/Core/DeveloperError.js";
import {
  compareGaussianStreamWorkPriority,
  gaussianStreamLegacyPriorityDisposition,
  gaussianStreamRequestPriority,
  GaussianStreamScheduleClass,
  GaussianStreamWorkClass,
  normalizeGaussianStreamWorkPriority,
  rankGaussianStreamWorkPriorities,
  validateGaussianStreamWorkPriority,
} from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianStreamWorkPriority.js";

function priority(overrides = {}) {
  return {
    workClass: GaussianStreamWorkClass.VISIBLE_WORK_CORE,
    scheduleClass: GaussianStreamScheduleClass.COARSE_MISSING,
    distanceSquared: 1,
    logicalXyExtentSquared: 4,
    selectedSplats: 3,
    tileY: 5,
    tileX: 6,
    canonicalIdentity: "5:6",
    sequence: 0,
    ...overrides,
  };
}

describe("SceneGIS/Scene/SceneGISGaussianStreamWorkPriority", function () {
  it("orders every frozen tuple field and keeps Request bands disjoint", function () {
    const values = [
      priority(),
      priority({ scheduleClass: 1 }),
      priority({ workClass: 2, scheduleClass: 0 }),
      priority({ workClass: 3, scheduleClass: 0 }),
    ];
    const ordered = [...values].sort(compareGaussianStreamWorkPriority);
    expect(
      [...ordered].reverse().sort(compareGaussianStreamWorkPriority),
    ).toEqual(ordered);
    const ranked = rankGaussianStreamWorkPriorities(values.reverse());
    for (let i = 1; i < ranked.length; i++) {
      expect(gaussianStreamRequestPriority(ranked[i])).toBeGreaterThan(
        gaussianStreamRequestPriority(ranked[i - 1]),
      );
    }
    const tie = priority({ sequence: 9 });
    expect(compareGaussianStreamWorkPriority(tie, { ...tie })).toBe(0);
    expect(Object.isFrozen(validateGaussianStreamWorkPriority(tie))).toBe(true);
  });

  it("assigns an exact Request rank after every semantic tuple field", function () {
    const adversarial = [
      priority({
        distanceSquared: 1 + Number.EPSILON,
        logicalXyExtentSquared: Number.MAX_SAFE_INTEGER,
      }),
      priority({ distanceSquared: 1, logicalXyExtentSquared: 0 }),
      priority({
        distanceSquared: 1,
        logicalXyExtentSquared: 0,
        selectedSplats: 4,
      }),
      priority({
        distanceSquared: 1,
        logicalXyExtentSquared: 0,
        selectedSplats: 4,
        tileY: 6,
      }),
      priority({
        distanceSquared: 1,
        logicalXyExtentSquared: 0,
        selectedSplats: 4,
        tileX: 7,
      }),
      priority({
        distanceSquared: 1,
        logicalXyExtentSquared: 0,
        selectedSplats: 4,
        canonicalIdentity: "z",
      }),
      priority({
        distanceSquared: 1,
        logicalXyExtentSquared: 0,
        selectedSplats: 4,
        sequence: 9,
      }),
    ];
    const ranked = rankGaussianStreamWorkPriorities(adversarial);
    for (let i = 1; i < ranked.length; i++) {
      expect(
        compareGaussianStreamWorkPriority(ranked[i - 1], ranked[i]),
      ).toBeLessThanOrEqual(0);
      expect(gaussianStreamRequestPriority(ranked[i - 1])).toBeLessThan(
        gaussianStreamRequestPriority(ranked[i]),
      );
    }
    expect(
      compareGaussianStreamWorkPriority(adversarial[1], adversarial[0]),
    ).toBeLessThan(0);
    expect(gaussianStreamRequestPriority(ranked[0])).toBe(0);
  });

  it("rejects malformed structured priorities before mutation", function () {
    const mutation = jasmine.createSpy("mutation");
    for (const value of [
      undefined,
      null,
      priority({ workClass: 4 }),
      priority({ distanceSquared: Infinity }),
      priority({ selectedSplats: 0.5 }),
      priority({ tileX: 0.5 }),
      priority({ canonicalIdentity: "" }),
      priority({ requestRank: 2 ** 51 }),
      priority({ requestRank: Number.MAX_SAFE_INTEGER }),
      priority({ sequence: 2 ** 51 }),
    ]) {
      expect(function () {
        validateGaussianStreamWorkPriority(value);
        mutation();
      }).toThrowError(DeveloperError);
    }
    expect(mutation).not.toHaveBeenCalled();
    expect(
      validateGaussianStreamWorkPriority(priority({ workClass: 1 })).workClass,
    ).toBe(1);
  });

  it("enumerates legacy dispositions without prefix inference", function () {
    const high = ["visible-core", "coming-core", "coming-sh"];
    const maintenance = [
      "bootstrap-core",
      "bootstrap-sh",
      "global-snapshot-source",
      "around-coarse-prefetch",
      "progressive-tile-core",
      "progressive-tile-sh",
      "macro-coarse-core",
      "history",
      "preload-unknown",
      "unknown",
    ];
    for (const value of high) {
      expect(gaussianStreamLegacyPriorityDisposition(value)).toBe(0);
    }
    for (const value of maintenance) {
      expect(gaussianStreamLegacyPriorityDisposition(value)).toBe(3);
    }
    expect(
      normalizeGaussianStreamWorkPriority("visible-core", 7).sequence,
    ).toBe(7);
  });
});
