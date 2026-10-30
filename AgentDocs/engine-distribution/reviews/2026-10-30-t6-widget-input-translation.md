# T6 Widget and input translation review

- Type: phase review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [T6](../plans/2026-10-30-t6-widget-input-translation.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; no upstream-owned file changed

## Assessment and resolved findings

Four catalogs add 832 records across 69 roots, including 68 inherited native records published
under owned class names. Their source filenames and inherits fields refer to native CustomShader
or PostProcessStage; sourceLocale correctly remains en-US. Owned Chinese fields stay excluded.
Reviewed all 32 exact reused texts and repeated source text contexts.

Current-code evidence resolves copied or inaccurate native prose:

- createCommand.command raises beforeExecute with cancel=false, then executes only if cancel
  remains false. Chinese correctly says set cancel=true to cancel. args is the arguments object,
  not a true Array. No runtime behavior or signature changes.
- BaseLayerPicker forwards options to its view model; missing provider arrays default empty.
  Viewer supplies demonstration defaults. Chinese distinguishes these construction contexts.
- GeocoderViewModel.geocode tries services in order until a fulfilled, nonempty result.
- ScreenSpaceElevatorCameraController.update moves horizontally along camera.rightWC and
  vertically along normalized picked position; this is radial elevation rather than purely
  tangential motion. Both pan controllers multiply pixel dimensions at target distance by
  panSpeed: the setting is a coefficient rather than a fixed metre-per-pixel quantity.
- Tilt/orbit methods accept explicit target/axis; they do not themselves reject off-ellipsoid
  targets. Both require positive dt. Tilt uses the supplied axis for angular reference and
  camera.rightWC for rotation. Chinese retains documented signs and angular units.
- Native RIGHT_DOWN copied LEFT_DOWN prose; both enum member and enum property descriptions
  now say right button. Inspector selectParent and quadrant commands identify their actual
  target instead of repeating pickTile wording. viewerDragDropMixin supports multiple formats.

Protected-token validation initially caught an omitted repeated ControllerHost code token;
restored both occurrences before successful rebuilding. No guard weakened. Accepted inherited
limitation: malformed Stadia Maps href markup and Fullscreen static-member link spelling remain
literal; canonical source/link identities are outside this catalog-only phase.

## Validation and gate

- Docs build: 13,503/15,294 translated (88.3%), 1,791 missing, zero stale/unused.
- Twenty-eight Node checks pass, including all 433 reviewed roots, native inheritance provenance,
  control units and source-specific semantics. Every metadata page and anchor resolves.
- Focused nested browser case passes without page/resource errors; Command cancellation and
  projected pan-size prose display correctly. Screenshot inspected.
- All 7,943 symbols preserve non-prose metadata, signature fields, examples and URLs before/after.
- Scoped ESLint/Prettier and Markdown checks pass. Whole-tree AgentDocs formatting retains only
  623 inherited warnings outside this extension. No runtime, generator, type or SDK change.

No unresolved new finding. Approved for the T6 local checkpoint. Continue from the current
remaining inventory only after this commit; the complete translation goal remains active.
