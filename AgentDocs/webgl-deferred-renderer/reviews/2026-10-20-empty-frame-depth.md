# Review: Empty-frame native depth

## Metadata

- Type / Status: review / engine technical acceptance; SDK integration pending
- Author / Reviewer: current architecture and execution task (self-review)
- Date: 2026-10-20
- Target: [standalone plan](../plans/2026-10-20-empty-frame-depth.md)
- Contract: ADR-0156 current-frame depth publication; existing native postprocess input
- Upstream-owned change: `packages/engine/Source/Scene/Scene.js`, SGP-0046

## Finding and correction

DEPTH-01 — P1, fixed, owner: engine execution task.

When camera culling produces zero frusta, Scene skips its per-frustum hardware
depth clear. The native GlobeDepth attachment survives correctly, but its old
contents are still supplied to native PostProcessStage and environment consumers.
Releasing deferred-owned material targets does not initialize this borrowed depth.
This explains Planar terrain / opaque building silhouettes persisting in a sky view.

Scene now clears native depth and stencil once for an empty command view before
deferred / screen-effect preparation. It uses the existing commands and framebuffer;
it does not clear the environment color, manufacture a frustum, change cameras,
allocate resources or alter normal nonempty frame scheduling. The existing
SGP-0046 integration seam and manifest cover this correction.

## Evidence

Windows / Edge Headless 155, real WebGL with shader / framebuffer validation:

- New `SceneGISDeferredEmptyFrameSpec`: 2 / 2 pass. Before the runtime fix, both
  single-frustum and multi-frustum cases failed specifically on stale first and
  consecutive empty-frame depth and missing clears. Fixture render / return checks
  already passed before the fix.
- The GPU scene has real Planar surface and a native opaque Primitive. A native
  PostProcessStage samples its public `depthTexture`. Its first empty output and
  consecutive output are entirely 255 (depth equals the far-plane sentinel), and
  looking back restores geometry depth. No settling frame is inserted.
- Existing `SceneGISDeferredLightingSpec`: 21 / 21 pass, including multi-frustum
  and log depth, native picking, MASK, transparency, shadows, shared AO / SSR / SSIL
  depth, water inputs, resize and borrowed-resource ownership.
- Cost evidence: the new regression observes exactly one depth clear in each empty
  frame. Returning to nonempty rendering retains the existing one clear per segment
  (two phases for multi-frustum deferred scheduling). No new geometry submission,
  texture, framebuffer or shader. The native depth attachment retains identity and
  remains alive while deferred targets are released.
- Development engine / Specs bundles rebuilt through the test entry. No public API,
  type surface, build implementation or package boundary changed.
- Scoped ESLint / Prettier, changed-document Prettier / markdownlint and
  `git diff --check` pass. Full AgentDocs markdownlint passes. The required full
  AgentDocs Prettier scan reports 451 unrelated existing formatting failures; these
  documents were not reformatted as part of this fix.
- Upstream audit passes: 60 registered upstream-owned entries, one current-delivery
  upstream-owned file (Scene.js), generated-file status zero.

## Review and remaining boundary

The runtime diff is limited to seven lines inside the existing Scene scheduling seam.
Native depth remains owned by GlobeDepth; no SDK private-depth workaround is needed.
Other in-progress atmosphere / fog files are outside this change and remain untouched.
There is no new resource budget or rendering-policy decision.

SDK integration is pending: update its pinned engine from `5d5064c067` to the new
engine checkpoint and rerun the reported Nanjing Planar skyline regression, including
the disabled-analysis native depth mask. These engine GPU results do not claim that
SDK integration or project-owner visual acceptance has already occurred. Engine code
review finds no remaining issue in the reproduced zero-frustum depth contract.
