import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  buildSegmentedGaussianScene,
  validateSegmentedGaussianScene,
} from "../src/segmentedBuilder.js";

test("leaf completions refill workers before a slow part and publish canonical multi-part bytes", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "proxy-leaf-pipeline-"));
  try {
    // Exercise the real fixed 400K physical-part boundary without making this
    // scheduler test spend minutes in fitting: only fourteen records survive.
    const count = 400013,
      stride = 56,
      body = Buffer.alloc(count * stride);
    for (let i = 0; i < count; i++) {
      const offset = i * stride;
      body.writeFloatLE(i > 400000 ? (i - 400000) * 10 + 1 : 1, offset);
      body.writeFloatLE(1, offset + 4);
      body.writeFloatLE(1, offset + 8);
      body.writeFloatLE(Number.NaN, offset + 12);
      body.writeFloatLE(1, offset + 24);
      if (i === 0 || i >= 400000) {
        for (let k = 0; k < 3; k++) {
          body.writeFloatLE(-4, offset + 12 + k * 4);
        }
      }
    }
    const fields = [
      "x",
      "y",
      "z",
      "scale_0",
      "scale_1",
      "scale_2",
      "rot_0",
      "rot_1",
      "rot_2",
      "rot_3",
      "opacity",
      "f_dc_0",
      "f_dc_1",
      "f_dc_2",
    ];
    const input = path.join(parent, "parts.ply");
    await writeFile(
      input,
      Buffer.concat([
        Buffer.from(
          `ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n${fields.map((f) => `property float ${f}\n`).join("")}end_header\n`,
        ),
        body,
      ]),
    );
    const options = { fixedGridOrigin: [0, 0, 0], temporaryDirectory: parent };
    const serial = path.join(parent, "serial"),
      parallel = path.join(parent, "parallel");
    await buildSegmentedGaussianScene(input, serial, {
      ...options,
      workers: 1,
    });
    const events = [];
    const built = await buildSegmentedGaussianScene(input, parallel, {
      ...options,
      workers: 12,
      maximumInFlightLeafSplats: 1600000,
      taskDelayMilliseconds: (key) => (key === "leaf:0" ? 1500 : 0),
      onLeafTaskDispatched: (e) => events.push(`dispatch:${e.sourceOrdinal}`),
      onLeafTaskCompleted: (e) => events.push(`complete:${e.sourceOrdinal}`),
      onLeafBackingReleased(e) {
        assert.equal(e.coarsestSeedBackingCount, 0);
        assert.equal(e.workerResultCount, 0);
      },
    });
    assert(events.includes("dispatch:12"));
    assert(events.indexOf("dispatch:12") < events.indexOf("complete:0"));
    assert.equal(built.report.source.retainedSplatCount, 14);
    assert.equal(built.report.peakInFlight, 12);
    for (const file of [
      "scene.mci",
      "scene.mcl.json",
      ...(await readdir(path.join(serial, "packs"))).map((f) => `packs/${f}`),
    ]) {
      assert.deepEqual(
        await readFile(path.join(parallel, file)),
        await readFile(path.join(serial, file)),
        file,
      );
    }
    await validateSegmentedGaussianScene(parallel);
    const limited = path.join(parent, "limited");
    const bounded = await buildSegmentedGaussianScene(input, limited, {
      ...options,
      workers: 4,
      maximumInFlightLeafSplats: 400000,
      onLeafTaskDispatched(e) {
        assert(e.activeLeafSourceSplats <= 400000);
      },
    });
    assert.equal(bounded.report.peakActiveLeafSourceSplats, 400000);
    assert.deepEqual(
      await readFile(path.join(limited, "scene.mci")),
      await readFile(path.join(serial, "scene.mci")),
    );
    const failed = path.join(parent, "failed");
    await assert.rejects(
      buildSegmentedGaussianScene(input, failed, {
        ...options,
        workers: 2,
        onLeafTaskCompleted(e) {
          if (e.sourceOrdinal === 0) {
            throw new Error("pipeline failure");
          }
        },
      }),
      /pipeline failure/,
    );
    assert.deepEqual((await readdir(parent)).sort(), [
      "limited",
      "parallel",
      "parts.ply",
      "serial",
    ]);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
