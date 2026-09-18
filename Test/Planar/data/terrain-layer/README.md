# TileWorker terrain fixtures

These are unmodified outputs from the user-owned TileWorker CLI run
`terrain-v2-consumer-20260918`, generated on 2026-09-18 at 12:17 local time.
Only layer.json and tile payloads are included. The source is synthetic test elevation,
not a third-party DEM. TileWorker is part of SceneGISDataTool.

| Local directory       | Producer dataset                | Tiles |
| --------------------- | ------------------------------- | ----- |
| heightmap             | private-full-heightmap          | 5     |
| mesh                  | private-full-quantized-mesh     | 5     |
| north-mesh            | private-north-quantized-mesh    | 2     |
| globe-north-mesh      | mercator-north-quantized-mesh   | 2     |
| geographic-north-mesh | geographic-north-quantized-mesh | 2     |

The private root is `[-100,-100,100,100]` metres and levels are 0–1. The full source is
a 128×128 Float64 DEM spanning `[-101,-101,101,101]`: its first 16 columns are NoData,
and the remaining elevations are `-17.125 + column * 0.03125` metres. The northern
private source spans `[-75,25,-25,75]`; only the northwest Level-1 tile exists.
The geographic source spans `[22.5,22.5,67.5,67.5]` degrees, occupying the eastern
root and Level-1 column 2. Mercator uses the equivalent northwest quadrant coverage.

All metadata and network rows use TMS. The examples consume the published
`source-scan-conservative` heightRange directly, approximately `[-16.726,0.101]`
metres, with additional outward Float32 rounding for mesh. No application height
override hides a missing producer field. Planar v2 profiles remain explicitly private;
the two Globe datasets retain the standard `quantized-mesh-1.0` format.

The producer build used base revision `46df145cddf4f854eec644a470b8b0ddd99a41a2`
plus the then-uncommitted terrain v2 implementation. That base alone does not identify
the complete code. Exact CLI SHA256:
`7e3b06490026de010f4c3aa42e5186020801816167d76a77e34f0123f4089d3e`.
The producer handoff retains `provenance.json`, `native-source-sha256.json`, source
DEMs, job configurations, logs and `verification.json`. All 21 copied files were
verified byte-for-byte against that handoff.

The completed producer implementation is commit
`77e2acfb524de2d723ab3a915a4cf7e339f2c3ba`. The producer subsequently verified that
all 112 Native source hashes in the generation snapshot match that implementation
and recorded this in the handoff provenance. The CLI and dataset bytes were unchanged.

Generation uses the project's normal isolated runtime environment:

```text
tileworker_batch_v3_test.exe --terrain-v2-fixtures <new-output-directory>
TileWorker.exe batch-tile --job <generated-job-name.json> --threads 2
```
