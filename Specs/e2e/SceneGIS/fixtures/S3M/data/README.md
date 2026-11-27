# Official S3M fixtures

`CBD/` and `comModel/` are unmodified samples from
[SuperMap/s3m-spec](https://github.com/SuperMap/s3m-spec), commit
`462cf06b95857fe2410dce9aecbfd8e4c16e84fc`,
`S3M_SDK/S3M_JS/data/`. The SDK/sample license is included as `LICENSE.txt`.

The Jinjiang oblique photogrammetry example uses SuperMap's public demonstration
service. Its data is fetched at runtime and is not redistributed in this repository.
This external service is a qualification dependency, not a production availability guarantee.
`jinjiang.scp` is a hand-authored minimal config using the position, bounds and
absolute URL of the first qualified root from that service. During qualification,
eight of the ten roots in the original service config returned HTTP 404; the
example deliberately selects this available subtree instead of silently ignoring
errors. The original service config remains usable as a normal SDK input.

The pinned CBD sample references `Tile_-14624_42667_0000_0000_0000.s3mb`,
which is absent from that repository. The example therefore explicitly caps CBD
at depth 2. Source binaries are not rewritten to hide the missing reference.
The SDK has no such default cap; a failed child retains its parent's coverage.

To cache a bounded Jinjiang root and its first child under ignored `Build/`:

```powershell
node scripts/scenegis/fetch-s3m-sample.mjs
$env:S3M_OBLIQUE = "1"
npm run test-e2e -- scenegis-s3m-layer.spec.js
```

Only the preparation command needs external access; the tests use the cached
data and prohibit external browser requests. Remove the environment variable
after running if the optional sample should no longer be tested.
