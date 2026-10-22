# Standalone plan: Globe / Planar material and lighting audit

## Metadata

- Type: standalone; status: completed; created/updated: 2026-10-22.
- Owner / reviewer: current task, architecture and execution self-review.
- Parent: [rendering quality](2026-09-18-rendering-quality-extension.md).
- Architecture review: confirmed; bounded inspection of existing contracts.
- Related: ADR-0031, ADR-0044, ADR-0054, ADR-0084, ADR-0169.
- Upstream / SGP: none planned; no new rendering feature or default tuning.
- Review: [audit results](../reviews/2026-10-22-material-lighting-audit.md).
- Follow-up: [imagery filter color domain](../discussions/2026-10-22-imagery-filter-color-domain.md).

## Scope and source facts

The owner requests the same bounded audit in Globe and Planar before considering
directional occlusion or contact shadows. Both worlds already expose physical
lighting, sky reflections, HDR/LDR and white balance. Existing Bistro calibration
records nearly constant authored roughness, baked texture lighting and limited
glass; those asset limitations must not be mistaken for renderer regressions.

Reuse the existing PBR example, calibration diagnostics and relevant GPU Specs.
Add deterministic browser checks only where existing coverage is insufficient.
Keep the user's open views, runtime defaults, original assets and branch list.
This audit is independent of completed water work; its recorded cold-build and
visual findings remain unchanged.

## Steps and acceptance

1. Trace imagery decoding, PBR texture channels and final output conversion.
2. Verify local deterministic imagery colors with lighting isolated, including
   Globe / Planar and the existing linear HDR/LDR output contract.
3. Inspect identical local PBR geometry with gray/white colors and roughness /
   metalness controls; verify texture data channels and authored IBL precedence.
4. Capture the existing Bistro in both worlds at matched local camera, fixed time
   and exposure. Separate direct light, sky response, fog and display transforms;
   compare expected world geometry differences without forcing pixel equality.
5. Run the minimal relevant GPU/browser tests; save screenshots and numeric
   observations under ignored Build/Specs. Inspect actual images.
6. Record confirmed defects, expected behavior and asset limits separately in a
   review; update handoff. Any source fix requires a reproduced failure and its
   applicable architecture/SGP checks before implementation.

## Bounds

No new GI, volumetric light, reflection probes, exposure preset or broad shader
refactor. No complete release/type rebuild unless public API or renderer code
changes. This is not a claim of equivalence with a path tracer or photometric
calibration of arbitrary imagery. All surviving uncertainties must be explicit.

## Outcome

Inspection is complete, with findings open for follow-up rather than an engine
change in this audit. Four browser cases pass; 53 of 56 focused GPU Specs pass.
Two existing imagery cases retain encoded-space blend expectations, and one
expects readiness before the initial frame. No existing assertion was weakened.
The review distinguishes these failures from a reproduced Globe imagery filter
discontinuity. Generated evidence remains under ignored `Build/Specs`.

The current deferred pipeline rejects MSAA; the new comparison explicitly uses
no AA, rather than the historical calibration's 4x MSAA. The old calibration
export was not changed. Tests wait for tile readiness inside `postRender` to
avoid measuring the asynchronous imagery rebuild's intermediate frame.

Scoped ESLint, Prettier and Markdown lint pass. The required full AgentDocs
Markdown lint passes; full Prettier reports 568 other files, none modified by
this audit. These unrelated formatting issues are left unchanged. `git diff
--check` passes. No engine source, generated output or upstream-owned file is
included in the changes.
