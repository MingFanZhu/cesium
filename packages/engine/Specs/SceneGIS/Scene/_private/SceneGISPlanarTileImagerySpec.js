import SceneGISPlanarTileImagery from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarTileImagery.js";

describe("SceneGIS/Scene/SceneGISPlanarTileImagery", function () {
  const State = { UNLOADED: 0, READY: 3, FAILED: 4, UNAVAILABLE: 5 };

  function createManager() {
    const entries = new Map();
    return {
      State,
      entries,
      acquire: function (_runtime, address) {
        const entry =
          address.state === undefined
            ? { ...address, state: State.UNLOADED }
            : address;
        entry.references = (entry.references ?? 0) + 1;
        entries.set(`${entry.level}/${entry.x}/${entry.y}`, entry);
        return entry;
      },
      release: function (_runtime, entry) {
        --entry.references;
      },
      find: function (_runtime, address) {
        return entries.get(`${address.level}/${address.x}/${address.y}`);
      },
    };
  }

  function createBinding(x, y, level, maximumLevel, minimumLevel = 0) {
    const manager = createManager();
    const tile = { x, y, level };
    const runtime = {
      layer: { imageryProvider: { maximumLevel, minimumLevel } },
    };
    return new SceneGISPlanarTileImagery(manager, tile, runtime);
  }

  it("maps same-level imagery identically", function () {
    const binding = createBinding(3, 2, 3, 3);
    binding.desired.state = State.READY;
    expect(binding.select()).toBe(binding.desired);
    expect(binding.translationScale).toEqual({ x: 0, y: 0, z: 1, w: 1 });
    binding.destroy();
  });

  it("maps northwest-origin ancestor quadrants into south-origin tile UV", function () {
    const expected = [
      [0, 0, 0, 0.5],
      [1, 0, 0.5, 0.5],
      [0, 1, 0, 0],
      [1, 1, 0.5, 0],
    ];
    for (const [x, y, u, v] of expected) {
      const binding = createBinding(x, y, 1, 0);
      binding.desired.state = State.READY;
      binding.select();
      expect(binding.translationScale.x).toBe(u);
      expect(binding.translationScale.y).toBe(v);
      expect(binding.translationScale.z).toBe(0.5);
      expect(binding.translationScale.w).toBe(0.5);
      binding.destroy();
    }
  });

  it("uses arithmetic addressing at high safe levels", function () {
    const x = 2 ** 40 + 3;
    const y = 2 ** 40 + 2;
    const binding = createBinding(x, y, 41, 40);
    binding.desired.state = State.READY;
    binding.select();
    expect(binding.desired.x).toBe(Math.floor(x / 2));
    expect(binding.desired.y).toBe(Math.floor(y / 2));
    expect(binding.translationScale.x).toBe(0.5);
    expect(binding.translationScale.y).toBe(0.5);
    binding.destroy();
  });

  it("retains an already-ready ancestor after terminal desired failure", function () {
    const binding = createBinding(1, 1, 1, 1);
    binding.select();
    expect(binding.fallback).toBeDefined();
    binding.fallback.state = State.READY;
    binding.desired.state = State.FAILED;
    expect(binding.select()).toBe(binding.fallback);
    expect(binding.fallback.references).toBe(1);
    binding.destroy();
  });

  it("prefers the nearest cached ready ancestor and releases references exactly", function () {
    const binding = createBinding(5, 2, 3, 3);
    const manager = binding.manager;
    const runtime = binding.runtime;
    const root = manager.acquire(runtime, { level: 0, x: 0, y: 0 });
    root.state = State.READY;
    const nearest = manager.acquire(runtime, { level: 2, x: 2, y: 1 });
    nearest.state = State.READY;

    expect(binding.select()).toBe(nearest);
    expect(binding.fallback).toBe(nearest);
    expect(root.references).toBe(1);
    expect(nearest.references).toBe(2);
    const desired = binding.desired;
    manager.release(runtime, root);
    manager.release(runtime, nearest);
    binding.destroy();
    expect(root.references).toBe(0);
    expect(nearest.references).toBe(0);
    expect(desired.references).toBe(0);
  });
  it("skips coarse surfaces even when finer imagery is cached", function () {
    const binding = createBinding(1, 1, 1, 4, 2);
    binding.manager.acquire(binding.runtime, {
      level: 2,
      x: 2,
      y: 2,
      state: State.READY,
    });
    expect(binding.desired).toBeUndefined();
    expect(binding.select()).toBeUndefined();
    expect(binding.fallback).toBeUndefined();
    expect(binding.isSettled()).toBe(true);
    binding.destroy();
  });

  it("bootstraps the global minimum ancestor and settles missing fallback", function () {
    const binding = createBinding(13, 6, 4, 4, 2);
    binding.select();
    expect([
      binding.fallback.level,
      binding.fallback.x,
      binding.fallback.y,
    ]).toEqual([2, 3, 1]);
    binding.desired.state = State.UNAVAILABLE;
    binding.select();
    expect(binding.isSettled()).toBe(false);
    binding.fallback.state = State.UNAVAILABLE;
    binding.select();
    expect(binding.isSettled()).toBe(true);
    expect(binding.selected).toBeUndefined();
    binding.destroy();
  });

  it("uses a ready legal ancestor after a desired 404 and preserves UV overzoom", function () {
    const binding = createBinding(13, 6, 4, 3, 2);
    binding.select();
    binding.desired.state = State.UNAVAILABLE;
    binding.fallback.state = State.READY;
    expect(binding.select()).toBe(binding.fallback);
    expect(binding.translationScale).toEqual({
      x: 0.25,
      y: 0.25,
      z: 0.25,
      w: 0.25,
    });
    expect(binding.isSettled()).toBe(true);
    binding.destroy();
  });
});
