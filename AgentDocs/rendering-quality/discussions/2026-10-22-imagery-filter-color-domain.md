# Discussion: Common imagery filter color domain

## Metadata

- Type: discussion; status: resolved; created/updated: 2026-10-22.
- Owner: architecture; direction confirmed by the project owner.
- Parent: [audit plan](../plans/2026-10-22-material-lighting-audit.md).
- Evidence: [audit review F1/F2](../reviews/2026-10-22-material-lighting-audit.md).
- Related: ADR-0031, ADR-0154; existing SGP-0051 Globe integration boundary.
- Implementation: [Globe compatibility](../../planar-surface-styling/plans/2026-10-22-globe-filter-compatibility.md), ADR-0031 amendment; no upstream changes or SGP.

## Owner decision and resolution

The owner explicitly chooses existing Cesium Globe computations and filter/decode
order as the compatibility reference. Preserve Globe, including its gamma=1
discontinuity and draw-wide gamma selection. Align Planar instead. The earlier
proposal below is superseded; it is retained as discussion history, not guidance.
The linked implementation also resolves the obsolete imagery test expectations.
Technical verification is recorded in the
[compatibility review](../../planar-surface-styling/reviews/2026-10-22-globe-filter-compatibility.md).

## Confirmed problem

Default imagery and linear alpha composition agree between worlds. Non-default
Globe imagery filters do not match Planar. In particular, `gamma = 1.001` skips
the usual decode and causes a large brightness jump from the identity setting.
The issue reproduces without advanced environment or physical lighting.

## Historical proposal (superseded)

Keep the documented Planar contract: raw color-to-alpha and coverage checks,
artistic filters in display RGB, one decode, linear layer composition and surface
lighting, one final display conversion. Extend that contract to SceneGIS Globe
imagery. Do not copy the Globe discontinuity into Planar or compensate with
exposure/white balance.

Before implementation, confirm the current upstream ownership/SGP boundaries and
document how existing users of native HDR imagery filters are affected. A narrow
SceneGIS branch in the existing integration is preferable to broad changes to
upstream native behavior; its actual design must follow current source review.

## Historical acceptance proposal (superseded)

- Record the chosen filter domain and compatibility behavior in an ADR/plan.
- Reproduce gamma 1 / 1.001 continuity and brightness/contrast/gamma agreement in
  both worlds, while preserving default original RGB and linear alpha blending.
- Preserve raw color-to-alpha ordering, alpha, resource identity and layer order.
- Retain the distinction between linear intermediate storage and HDR/LDR display.
- Correct the two obsolete blend expectations using independent arithmetic;
  resolve the initial `tilesLoaded` assertion from its actual public contract.
- Recheck both-world imagery screenshots. Run only the affected GPU/browser
  suites, plus required renderer/build checks if source changes are introduced.

The broader question of photographic imagery versus authored PBR reflectance is
separate. Do not attach a new per-layer relighting mode or asset conversion to
this bounded color-domain fix without a product requirement.
