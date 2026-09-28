# R16 Cycles calibration review

- Type: `review`; status: `completed`; date: `2026-09-28`
- Author / reviewer: current task, architecture and execution self-review
- Target: [R16 plan](../plans/2026-09-28-r16-cycles-calibration.md)
- Parent: [extension](../plans/2026-09-18-rendering-quality-extension.md)
- ADR / SGP: none; owned development artifacts and one fixture correction only

## Findings and disposition

| ID    | Severity | Evidence / disposition                                                                                                                                                                                                                                                   | Owner            |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| R16-1 | P1       | All 131 source ORM red channels are zero; prior conversion bound them as glTF occlusion. Source Falcor documents the slot as unsupported. Fixed only these bindings, preserving G/B, geometry and textures. Fixture regression and selective-binding unit check pass.    | Execution, fixed |
| R16-2 | P2       | Native unlit material path leaves roughness at its default; the initial diagnostic was white. Fixed diagnostics to sample actual bound metallic/roughness inputs, factors and UV transform. GPU pixel test verifies authored 189/255 roughness and dielectric metalness. | Execution, fixed |
| R16-3 | P2       | Blender angle_x is not the projected horizontal angle with vertical sensor fit. Corrected validation to derive horizontal span from the exported long-axis FOV/aspect. Landscape and portrait projection checks pass; actual landscape image remains aligned.            | Execution, fixed |
| R16-4 | P2       | Planar navigation owns its controller; toggling the legacy screen-space controller cannot freeze it. Export now temporarily disables/restores the actual planar controller. Focused export/state test passes.                                                            | Execution, fixed |

## Verification and gate

- Three focused browser/fixture tests pass: real GPU export, material pixels, exact
  snapshot/controller/HDR/custom-shader/callback restoration, comparison controls and
  explicit missing-image error, and source geometry/texture conversion regression.
- Three Blender contract checks pass: independent native-GPU / Python Neutral agreement
  on five HDR colors, both aspect orientations, and zero-only AO correction retaining
  authored nonzero AO. No full renderer regression matrix is needed.
- Actual Blender 5.2.2 CUDA renders complete: same prepared Bistro, 1778 × 1000,
  64 samples, direct and full transport, independent `.blend`, scene-linear EXR and
  matching Neutral PNG. Standalone comparison visually inspected; output remains ignored.
- ESLint and changed-file formatting pass; global AgentDocs markdownlint passes.
  Repository-wide AgentDocs Prettier retains 316 pre-existing failures.
- GPU readback releases its command shader, framebuffer and texture; capture restores
  borrowed state in `finally`. No runtime hook, new public API or hot-path change.
- The already-open unsaved Blender document is untouched. Its capture interface timed out;
  supported background Blender produced the independent artifact. OptiX compilation failed;
  explicit CUDA succeeded. Browser camera/settings and planar navigation are restored.
- Technical implementation/review complete. Owner visual acceptance is pending. Create
  one local R16 checkpoint; do not activate a subsequent GI/probe phase.

## Remaining limits and follow-up

The captured sky is limited to the existing angular resolution and approximate ground;
runtime diffuse sky, geometry visibility, BRDFs, filtering and transparency are not identical
to Cycles. Full/direct Cycles isolates bounces more directly than cross-renderer pixel error.
Native base IBL currently ignores material occlusion, so the fixture correction alone is
not claimed to repair this view. 125 ORM maps have roughness near constant 0.741; 1K delivery,
alpha-only glass and absent foliage transmission remain explicit asset/material limits.
These findings are collected in [calibration notes](../../../Test/Rendering/pbr-data/Calibration.md).
No unresolved implementation blocker; owner chooses the next improvement after visual review.

## Upstream inventory

Upstream-owned files changed: **none**. SGP: **none**. No generated artifact is committed.
