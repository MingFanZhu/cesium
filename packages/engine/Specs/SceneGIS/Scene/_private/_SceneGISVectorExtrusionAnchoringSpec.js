import anchoring from "../../../../Source/SceneGIS/Scene/_private/_SceneGISVectorExtrusionAnchoring.js";
import { Event, Rectangle } from "../../../../index.js";

describe("SceneGIS/Scene/SceneGISVectorExtrusionAnchoring", function () {
  let batch, owner, entry, frame, finish, fail;
  const values = (value) => ({
    streams: [
      { high: new Float32Array(6).fill(value), low: new Float32Array(6) },
    ],
  });
  function snapshot(entries, provider = owner._terrain.provider) {
    owner._terrain = {
      entries,
      provider,
      height: jasmine.createSpy("main-thread terrain query"),
    };
  }
  function update() {
    anchoring.update(batch, { frameNumber: ++frame });
  }
  beforeEach(function () {
    frame = 0;
    entry = {
      rectangle: new Rectangle(-0.001, -0.001, 0.001, 0.001),
      height: 120,
      result: {},
    };
    owner = {
      _terrain: { provider: {} },
      _scene: { requestRender: jasmine.createSpy("requestRender") },
      _errorEvent: new Event(),
      _maximumUploadBytesPerFrame: 100,
      _workers: {
        available: true,
        schedule: jasmine.createSpy("schedule").and.callFake(
          () =>
            new Promise((resolve, reject) => {
              finish = resolve;
              fail = reject;
            }),
        ),
      },
    };
    snapshot([entry]);
    batch = {
      _owner: owner,
      _tileBounds: { minimumX: 0, maximumY: 0 },
      _origin: { x: 6378137, y: 0, z: 0 },
      _resources: {
        _anchorCoordinates: [new Float32Array([0, 0, 1, -1])],
        _extrusionData: [new Float32Array(8)],
        _anchorBuffers: [0, 1].map(() => ({
          values: new Float32Array(6),
          buffer: { copyFromArrayView: jasmine.createSpy("upload") },
        })),
      },
    };
  });
  it("waits for the resident index and publishes only in a budgeted render update", async function () {
    entry.result = undefined;
    update();
    expect(entry.needed).toBeTrue();
    expect(anchoring.pending(batch)).toBeTrue();
    expect(owner._workers.schedule).not.toHaveBeenCalled();
    entry.result = {};
    snapshot([entry]);
    update();
    expect(owner._workers.schedule).toHaveBeenCalledTimes(1);
    finish(values(120));
    await Promise.resolve();
    const buffer = batch._resources._anchorBuffers[0].buffer;
    expect(buffer.copyFromArrayView).not.toHaveBeenCalled();
    owner._uploadBudget = { bytes: 100, deadline: Infinity };
    update();
    expect(buffer.copyFromArrayView).not.toHaveBeenCalled();
    owner._uploadBudget.bytes = 0;
    update();
    expect(buffer.copyFromArrayView).toHaveBeenCalledTimes(1);
    expect(anchoring.pending(batch)).toBeFalse();
    expect(owner._terrain.height).not.toHaveBeenCalled();
  });
  it("does not rebuild a batch when only unrelated terrain or cover order changes", async function () {
    update();
    finish(values(120));
    await Promise.resolve();
    update();
    const remote = { rectangle: new Rectangle(1, 1, 1.1, 1.1), result: {} };
    snapshot([remote, entry]);
    update();
    snapshot([entry, remote]);
    update();
    expect(owner._workers.schedule).toHaveBeenCalledTimes(1);
    expect(remote.needed).toBeUndefined();
    entry.result = {};
    snapshot([entry]);
    update();
    expect(owner._workers.schedule).toHaveBeenCalledTimes(2);
  });
  it("discards obsolete provider and destroyed batch results without uploading", async function () {
    update();
    snapshot([], {});
    update();
    finish(values(120));
    await Promise.resolve();
    update();
    expect(owner._workers.schedule).toHaveBeenCalledTimes(2);
    expect(
      batch._resources._anchorBuffers[0].buffer.copyFromArrayView,
    ).not.toHaveBeenCalled();
    anchoring.clear(batch);
    finish(values(0));
    await Promise.resolve();
    expect(batch._extrusionState).toBeUndefined();
    expect(
      batch._resources._anchorBuffers[0].buffer.copyFromArrayView,
    ).not.toHaveBeenCalled();
  });
  it("reports a failed current task once and does not retry the unchanged revision", async function () {
    const errors = [];
    owner._errorEvent.addEventListener((error) => errors.push(error));
    update();
    fail(new Error("worker failed"));
    await Promise.resolve();
    update();
    expect(errors.length).toBe(1);
    expect(errors[0].resource).toBe("extrusion-terrain");
    expect(owner._workers.schedule).toHaveBeenCalledTimes(1);
    expect(anchoring.pending(batch)).toBeFalse();
  });
});
