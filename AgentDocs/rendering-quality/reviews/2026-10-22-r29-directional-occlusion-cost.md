# R29 review: Remove redundant model lighting work

## Scope and source review

- Date: 2026-10-22; status: complete; architecture / execution / review: current task, self-review.
- Plan: [R29](../plans/2026-10-22-r29-directional-occlusion-cost.md).
- Baseline: R28 checkpoint `023016e69c`, visually accepted by the owner.
- Runtime change: owned `_SceneGISDeferredLighting.prepareGroups` only.
- Upstream-owned files changed in R29: none; additional SGP: none.

The old order compares a native primitive uniformMap before checking whether its
model/lighting key has already been selected. Distinct primitive material maps
therefore replace the selected group and append another full-screen light command.
Material capture resolves only the last map entry, so the previous light commands
cannot light any matching material pixels. Bistro reproduces 627 group replacements
and 627 shader source lookups per frame in both scalar and directional modes.

Check the per-frame selected flag first. Keep the existing first representative
binding check across frames, extension-layout / EDL / define invalidation, and
paired native IBL shader/uniform creation. Material capture still evaluates every
primitive independently. Group reuse remains per Model and lighting key; the
change neither combines distinct Models nor freezes live lighting uniforms.

## Measured cost and picture preservation

RTX 3060 Ti / ANGLE D3D11, Chrome Headless 155, 1280×800, fixed Bistro noon view,
8 alternating scalar/directional samples per world. AO uses 8×8 taps, radius 0.7 m,
intensity 0.8. SSR/SSIL/AA are disabled for timing; no concurrent build or test
jobs. Existing user tabs stay open. Before/after artifacts are respectively under
`Build/Specs/e2e/directional-before-optimization/` and
`Build/Specs/e2e/directional-after-optimization/`.

| Median time (ms)                   | Globe before | Globe after | Planar before | Planar after |
| ---------------------------------- | -----------: | ----------: | ------------: | -----------: |
| CPU render, scalar                 |       89.250 |      15.600 |        40.950 |       16.400 |
| CPU render, directional            |       82.550 |      16.000 |        41.400 |       16.800 |
| Whole-frame GPU query, scalar      |       89.106 |      15.262 |        40.754 |       15.406 |
| Whole-frame GPU query, directional |       89.622 |      18.253 |        40.036 |       16.028 |

For both worlds and both modes, actual material draws remain **627** and lighting
groups/draws fall **627 to 1**. The warm GPU Spec also verifies zero deferred
lighting shader-cache source lookups. This directly establishes less work even
though elapsed time varies with CPU/GPU scheduling. GPU query intervals include
submission starvation; these are session observations, not pure shader timings or
a cross-device frame-rate guarantee. The noisier Globe baseline is not presented
as a universal speedup factor.

Post-fix directional-minus-scalar CPU medians are 0.4 ms in both worlds. Whole-frame
GPU-query increments are 2.991 ms Globe / 0.622 ms Planar; the 0.5 ms whole-frame
investigation target is **not** claimed achieved. Isolated estimate/filter medians
are 2.675/2.868 ms Globe and 2.517/2.696 ms Planar (scalar/directional), about
0.18–0.19 ms incremental. No estimate/filter code, sample count, resolution, pass
count or storage changed; the additional directional allocation remains 6.84 MiB.

All eight off/scalar/directional/visibility PNG pairs have zero changed RGB pixels
and identical dimensions. The resulting Globe/Planar directional pictures were
also inspected. The owner-accepted detail, direct light, emission and material
appearance are preserved; no new owner color/quality choice is required.

## Verification

- Development DeferredLighting: 22 GPU cases pass, including a new two-material
  real glTF regression that fails with the old grouping order. It checks ordinary
  and directional groups/draws, independent colors, warm shader reuse, native
  lightColor define/value updates, first-primitive hide/show and model removal.
- Development AO / SSR: 16 + 15 GPU cases pass. Release DeferredLighting: all 22
  cases pass against the minified shader product; complete `gulp buildRelease` passes.
- Both-world E2E: 2 pass, including continuous camera movement, SSR/SSIL coexistence,
  one estimator execution, shared depth, disable/toggle/destruction and no page errors.
- Scoped ESLint / Prettier, full AgentDocs Markdown lint, `git diff --check` and
  upstream patch audit pass (zero current upstream-owned files, generated status 0).
  Full AgentDocs Prettier reports 563 existing issues outside the edited files;
  no unrelated document cleanup is included. Commit hooks check engine types.

## Findings and boundary

| Finding                                                                           | Disposition                                                                                                     |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Repeated grouping/source construction and unmatched light commands                | Fixed; draw counts and regression demonstrate the cause and reduction.                                          |
| Native async IBL binding / live uniforms must not become stale                    | Existing invalidation and paired shader/uniform ownership preserved; targeted native-light tests pass.          |
| End-to-end directional increment varies and remains above the original GPU target | Explicit measured limitation; no lower-quality approximation or further speculative optimization in this phase. |
| One-layer screen depth / single visibility cone limitations                       | Unchanged ADR-0184 boundary; default remains off.                                                               |

The bounded verification is complete and R29 is ready for its independent local
checkpoint. No new phase, merge or default change is activated by this review.
