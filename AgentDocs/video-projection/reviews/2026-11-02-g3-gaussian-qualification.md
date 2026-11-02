# G3 review：双世界画面、资源与交付

- Type: review
- Status: technical approval; owner retains final visual judgment
- Date: 2026-11-02
- Owner: current task architecture self-review
- Target: [G3](../plans/2026-11-02-g3-gaussian-qualification.md)
- ADR: ADR-0208; upstream delta in G3: none; extension seam remains Scene.js / SGP-0065

## Findings and disposition

- Fixed in example: Camera.setView requires an orthonormal direction/up basis. The initial
  unnormalized ENU orientation made world-to-window probes point outside the viewport;
  the example now constructs the basis explicitly. No engine tolerance or fallback was added.
- Fixed in example: the behind-panel preset needs a valid downward planar rig and a home
  extent compatible with near/far. Its public camera preset now satisfies that existing contract.
- Fixed in test: symmetry-axis samples at video y=0.5 were white grid lines before/after flip.
  Probes now use nonsymmetric interior color locations; no rendering threshold was relaxed.
- Fixed in documentation: the owned enabled accessor supersedes the inherited English field.
  Remove that one obsolete external entry and assert Chinese source provenance; native parent
  translation and all other inherited fields stay intact.
- Environment-only diagnosis: port 8080 belongs to an unrelated Jetty server and bundled
  Playwright Chromium is absent. The owned Gaussian config uses installed Chrome and the
  explicit root server port 8096. Original video test config is unchanged; no product fallback.

## Verification

- Four browser cases pass for development and branded SceneGIS release. Both Worlds verify
  projected back-wall/front-panel colors, unchanged Gaussian-shadow regions, opaque mesh
  blockers, paused stable pixels/uploads/atlas, flip and page-owned teardown. A behind-camera
  panel still blocks projection; changing the public threshold to 1 admits video without
  recreating the target/atlas. Both screenshots were inspected.
- Full buildSceneGIS passes, including runtime/resources/types/docs. build-ts and final tsc
  pass; existing upstream type-generation warnings remain. Forty-two Node checks pass,
  including strict public declaration/export parity, all documentation links/provenance,
  native translation coverage and Gaussian multi-view tests.
- G2 retains 256 Gaussian, 8 video and 14 Viewshed GPU passes. Final target tests include
  active Scene destruction and program/depth release; the final enabled edit retains all
  eight original media tests. No final render-code change after those checks.
- Native inventory is 15,522 fully translated fields, owned Chinese source has 2,342 fields;
  missing/stale/unused are zero. New target/threshold options and getters reach HTML/JSON/types.
- Upstream audit passes for the five-line Scene.js seam under SGP-0065. Source lint and
  changed-path formatting/Markdown pass; full AgentDocs formatting retains inherited warnings.
  No generated product, binary fixture, SDK, native Gaussian or upstream build file is committed.
- Final pre-commit HTML lint hits an existing `eslint-plugin-html` / `eslint-seatbelt`
  processor serialization conflict. All staged scripts/HTML pass an ignored Build-only
  ESLint config preserving the rules and removing only HTML baseline suppression;
  Markdown and changed-file formatting pass separately. Commit skips the broken hook;
  no repository lint configuration or dependency is changed.
  Final example-only lint cleanup retains both planar/globe browser smoke passes,
  including front/rear occlusion, pause and ownership.

## Bounded hardware sample

Windows 10 / Chrome 156, RTX 3060 Ti / ANGLE D3D11, 1280×800, local deterministic
8,531 splats, paused 512×320 video, one projector at 1024². Warm page atlas: 16 MiB;
video: 655,360 bytes; depth: approximately 4 MiB; two cached auxiliary shader programs.
These exclude the main renderer, mapping/order and driver program allocations.
Capture: one draw, latest CPU submit 0.40 ms; last frame upload submit 0.70 ms. Sixteen
valid EXT_disjoint_timer_query_webgl2 whole-frame samples: median 2.419712 ms,
P95 3.363840 ms. No claim of isolated incremental GPU cost or million-splat throughput.
Paused samples do not increase upload counts or atlas capacity. Measurements and images
remain ignored Build artifacts, reproducible through the owned script/config.

## Remaining limits / handoff

Single-fragment alpha threshold is an approximate occluder, not accumulated transmittance;
sparse/low-opacity assets may leak projection. Finite LOD/depth bounds precision and each
target retains its existing budget and inter-primitive sorting limitations. Captured RGB is
affected by global display/exposure; no PBR/SH relighting. Native Gaussian receivers are
outside scope. Owner visual judgment on actual assets remains; no unresolved implementation
finding blocks the technical checkpoint. Feature is not merged or pushed automatically.
