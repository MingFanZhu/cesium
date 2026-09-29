# P4 review: Surface ripples and lens rain

- Status: approved; created/updated: 2026-09-29
- Reviewer/owner: current architecture/execution task, self-review; no independent reviewer
- Target: P4 changes after 87debf6371
- Parent: [P4 plan](../plans/2026-09-29-p4-rain-details.md); [ADR-0105](../../../Documentation/SceneGIS/Decisions/ADR-0105-rain-surface-and-lens-details.md)
- Upstream-owned files / SGP: none changed; existing SGP-0028 seams unchanged

## Conclusion and findings

Architecture/code gate approves a separate local P4 checkpoint. Default ripple intensity is zero and lens stage defaults disabled. Wet surface rings alter normals before lighting/SSR without extra geometry, targets or history. World-fixed projection and scene time produce stable patterns. Lens stage uses explicit native collection ownership and one color-only pass. Generic particles, weather physics, water surfaces, lighting and exposure remain unchanged.

| ID    | Severity | Status   | Owner        | Evidence and disposition                                                                                                                                                                                                             |
| ----- | -------- | -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P4-01 | note     | accepted | architecture | Existing data has no shelter or puddle mask. Upward wet surface approximation meets the authorized scope; no displacement or lake-surface ripples. Dominant-axis seams and distance fading are documented limitations.               |
| P4-02 | note     | accepted | architecture | Lens refraction can obscure GIS labels/content. Independent default-disabled public stage, example toggles and strength/size/distortion controls let callers opt in. It preserves alpha but is not a physical lens solver.           |
| P4-03 | low      | accepted | example      | Reloaded online Globe page reports a world-terrain network/ion error while buildings render. Deterministic local Globe/Planar examples and GPU tests pass. Keep the explicit error, do not add silent retries or substitute terrain. |

No unresolved code finding remains. Owner visual acceptance remains pending.

## Validation evidence

- Chrome Headless 154, Windows, WebGL validation: 12 SurfaceWeather Specs and 2 RainLensStage Specs pass in development and release. New checks cover zero/dry/snow/wall/subpixel suppression, animated/frozen time, large-coordinate anchoring, updated SSR rays with unchanged targets/command counts and zero replay. Existing PBR, terrain and Phong tests exercise compiled ripple paths. Lens checks cover validation, disabled default, identity, color change/alpha preservation, native reuse and teardown.
- Four scoped Playwright cases pass: rain details Globe/Planar independent controls/disposal, local Planar surface regression and aerial Planar rain/clear/snow controls with retained surface amounts. Globe aerial online checks are not claimed as passing in this phase.
- Full buildRelease, buildTs and gulp tsc pass. Generated public class extends native PostProcessStage with numeric controls; generated artifacts stay uncommitted. Existing unrelated JSDoc warnings remain.
- Scoped ESLint, Prettier and Markdown/whitespace checks qualify changed files. Repository-wide AgentDocs formatting failures recorded in P3 remain unrelated; no unrelated reformatting.
- Desktop visual inspection shows world-aligned rings, reflected objects and lens refraction in both worlds. The independent example and updated aerial page are available for owner inspection; original aerial camera/weather are restored.

## Bounded performance and ownership

Windows / Codex Chromium / ANGLE D3D11 / NVIDIA RTX 3060 Ti, 1219×826, HDR, MSAA 1, FXAA, model SSR enabled. Local fixture: eight PBR boxes (one floor), fixed camera/time, no precipitation or online loading. EXT_disjoint_timer_query_webgl2 measures Scene preUpdate through postRender; each sequential case has 16 non-disjoint samples. Other app tabs remain active, so medians are bounded fixture evidence, not an isolated incremental-cost guarantee.

| Case             | GPU median (ms) | Min / max (ms) |
| ---------------- | --------------- | -------------- |
| Both details off | 4.290           | 4.194 / 6.741  |
| Ripples          | 4.435           | 4.317 / 6.043  |
| Ripples and lens | 4.525           | 4.425 / 7.245  |

Scene command list remains eight geometry entries; this is not a raw GL draw count. Ripples allocate no GPU resource. Lens adds one full-resolution native RGBA8 output target (about 3.84 MiB here), without depth/history or geometry replay. Existing SSR stays on MRT with captureDraws zero. Parameter changes preserve native target/program identity, disable releases the lens program, and Scene removal/destruction disposes stage resources. No city-scale performance claim is made.
