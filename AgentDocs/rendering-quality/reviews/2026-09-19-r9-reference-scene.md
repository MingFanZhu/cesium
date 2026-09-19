# Review: R9 Public-data Reference Scene

- Type: `review`; status: `completed`, owner accepted on 2026-09-19
- Date: `2026-09-19`; owner / reviewer: Current task, architecture and execution self-review
- Target: [R9](../plans/2026-09-19-r9-reference-scene.md)
- ADR / SGP: None; no upstream-owned files changed in R9
- Open discussions: None

## Findings and dispositions

| ID    | Severity | Finding                                                                                            | Disposition                                                                                                                                                                                                                                                                                                                                                              |
| ----- | -------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R9-F1 | P1       | A zero tileset-level geometric error makes native traversal skip this leaf entirely.               | Fixed in the fixture preparer: omission error is the campus bounding-box diagonal; full-detail leaf error remains zero. Both-world E2E verifies actual content and 139,461 triangles.                                                                                                                                                                                    |
| R9-F2 | P2       | Metadata completion and `tilesLoaded` alone do not prove a visible tile was loaded.                | Fixed: the page reports readiness only after root content and both reference models are ready.                                                                                                                                                                                                                                                                           |
| R9-F3 | P2       | Exact floating-point camera equality produces a false Globe failure after basis normalization.     | Fixed in the test with a tight numeric tolerance; position, orientation, frustum and paused time remain checked. No runtime settling or fallback was added.                                                                                                                                                                                                              |
| R9-F4 | P2       | Existing Globe shadows produce bands on the glossy reference surface and scan in the overview.     | Deferred to the next shadow-quality investigation in the [roadmap](../plans/2026-09-18-rendering-quality-extension.md#r9-photogrammetry-comparison-priority). Reproduced by toggling geometric shadows in B; the bands disappear with shadows disabled. Keep this as a baseline defect, not a new fixture shader workaround. Owner: architecture / next execution phase. |
| R9-F5 | P1       | The public OBJ has no normals, causing Cesium to render it unlit even when the scene time changes. | Fixed in data preparation: derive area-weighted corner normals from original triangles, separating opposite-facing faces. Original positions, topology and textures remain unchanged. An asset regression checks NORMAL accessors, and both-world visual checks verify daylight/night relighting.                                                                        |

## Verification

- One asset regression and two Chromium E2E cases cover both Worlds: fully local requests, actual scan content,
  A/B restoration, original-texture shader selection, SSR toggle, unchanged camera/time,
  exported configuration, model visibility, BFCache preservation and idempotent cleanup.
- Actual browser inspection covers campus overview, building close-up, shaded/contact view,
  and the truck's screen-space reflection. Globe and Planar both load the same scan.
- Source ZIP checksum is pinned; conversion records the resulting GLB checksum in the
  fixture manifest. Source attribution and Apache 2.0 evidence are retained with the data.
- Final run: all three tests pass. Scoped ESLint / Prettier, all AgentDocs Markdownlint and
  the upstream patch audit pass. The mandatory all-AgentDocs Prettier check still reports
  316 pre-existing unrelated files; changed documents pass their scoped check.
- This is example composition only: no runtime, shader, public API, build or type changes;
  full engine checks are not required for this phase.

## Remaining limits and handoff

The scan retains photographed lighting and shadows. Relighting is an approximation; original
texture inspection remains available. The single-leaf campus cannot qualify urban streaming,
multi-level LOD or city-scale performance. Cross-build comparison requires retained captures and
Git revisions; A/B switches parameters within the current build, not renderer versions.

Owner accepted R9 and requested shadow refinement next. After the R9 checkpoint, prioritize
shadow quality, indirect lighting, reflection completeness and local night lighting. Every new
effect needs its own focused example plus integration into this shared scene.
