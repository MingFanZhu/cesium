import SceneGISPlanarTileImagery from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarTileImagery.js";

describe("SceneGIS/Scene/SceneGISPlanarTileImagery", function () {
  const State = { UNLOADED: 0, READY: 3, FAILED: 4 };

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

  function createBinding(x, y, level, maximumLevel) {
    const manager = createManager();
    const tile = { x, y, level };
    const runtime = {
      layer: { imageryProvider: { maximumLevel } },
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
});
