# M4 平面折线 Fabric 材质评审

- Type: review; status: technical passed, owner visual acceptance pending.
- Author role: architecture / current task self-review (no separate review agent).
- Updated: 2026-10-22.
- Target: feature/planar-polyline-materials, M4 implementation, Specs, example and docs.
- Plan: [M4](../plans/2026-10-21-m4-polyline-materials.md).
- ADR: [ADR-0182](../../../Documentation/SceneGIS/Decisions/ADR-0182-planar-polyline-materials.md).
- Upstream-owned files / SGP: none; upstream audit passed, generated status 0.

## Findings and disposition

| Finding                                                                                 | Severity / owner  | Disposition / evidence                                                                                                                                                |
| --------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native index-based s is unsuitable for unequal planar segments                          | P1 / execution    | Fixed: cumulative source XYZ for ordinary lines, XY for ground; CPU unequal-length checks and GPU UV / closed-boundary pixels                                         |
| Native constructor render state can retain blending after alpha returns opaque          | P1 / execution    | Fixed: owned internal appearance with opaque base state; GPU opaque → translucent → opaque returns original pixels                                                    |
| MaterialProperty updates and derived material ownership missing for lines               | P1 / execution    | Fixed: same-type getValue on every update, including identical time; type/position replacement, failure, repeated remove and destroy tests                            |
| Area discard restriction must not be applied to ground Dash                             | P1 / execution    | Fixed: line coverage uses material alpha/discard; one-pixel pick checks include visible and gap pixels. Existing area no-discard/footprint rules pass regressions     |
| Capturing native vertexShaderSource getter makes Dash define sticky after material swap | P2 / execution    | Fixed: retain raw native source; Arrow → Dash → Arrow GPU test reuses VA. Private dependency and upgrade check recorded in ADR                                        |
| Color-only ground batches should not allocate unused UV payload                         | P2 / execution    | Fixed: cumulative lengths / segmentTexture only on Fabric path; CPU attribute check and existing color batch tests                                                    |
| Ordinary miter interpolation is not exact per-fragment world arc length                 | P2 / architecture | Accepted: native expanded mesh interpolation is preserved; metric vertex parameters and shared-join continuity are guaranteed. Documented, no replacement tessellator |

## Evidence

- Development ChromeHeadless / WebGL validation: 27 polyline-related Specs, 43 ground Specs,
  16 ordinary Primitive Specs, all passed (86 distinct tests).
- Release Shader bundle: 27 polyline-related Specs passed.
- Real Viewer Playwright: development + release both passed; each produces native Arrow/Dash/
  closed-flow overview, flow view and 18-degree terrain view screenshots under
  `Build/Specs/e2e/planar-polyline-materials/` (generated artifacts, not committed).
- Frozen clock: same JulianDate, four material reads on next frame, changed RGBA visible
  in derived uniforms, same owner and VA. Seconds advanced by explicit JulianDate change.
- Original Entity pick IDs retained on ordinary and real local-terrain ground paths;
  type replacement destroys derived materials and VA; position update replaces geometry;
  six repeat rebuild cycles leave four live Entities/owners; double page destroy is safe.
- 128 shared-material routes: one VA and one ground color command, independent UV start,
  show and IDs. Warm uniform changes keep VA/program identity; no per-frame UV reconstruction
  on CPU or terrain sampling. Ground adds two FLOAT components per volume vertex
  (64 bytes per segment); ColorAppearance does not add these attributes.
- Chromium / Windows / ANGLE D3D11 / RTX 3060 Ti, 1280×900, six routes with local terrain,
  24 warm manual Viewer.render samples: development median/max 0.8/1.6 ms,
  release 0.6/0.9 ms. These are whole-frame CPU submission timings, not GPU time or an SLA.
- `npm run build-release`, `npm run build-ts`, `npm run tsc` passed; existing TSD-JSDoc
  warnings remain. Scoped ESLint/Prettier passed; full AgentDocs markdownlint passed.
  Full AgentDocs Prettier reports 569 pre-existing, unchanged files; none is a file
  changed by M4. No unrelated formatting changes were made.

## Remaining limits and handoff

No unresolved implementation blocker. Native Dash retains screen-pixel phase and angle
quantization. Closed patterns have one documented 1-to-0 seam. Existing joins, terrain
foreshortening and culling limits remain; arbitrary outer ground shaders / TBN materials
are outside the st/uniform contract. Default globe behavior has no source changes.

Current task inspected development/release screenshots: all six routes are visible,
closed boundaries remain joined, and local-terrain flow remains present at low angle.
Final product visual acceptance belongs to the project owner and is not claimed here.
Next: owner reviews `Test/平面折线材质.html`; record that result before expanding scope.
