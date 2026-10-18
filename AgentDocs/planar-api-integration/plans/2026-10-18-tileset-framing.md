# Planar tileset framing

- Type: standalone plan
- Status: completed
- Created / Updated: 2026-10-18
- Owner / review: current architecture / execution role; no independent review agent
- ADR / SGP: ADR-0006 amendment; reuse SGP-0005 for public target documentation
- Review: [Implementation review](../reviews/2026-10-18-tileset-framing.md)
- Discussion: [Geographic tileset scope](../discussions/2026-10-18-geographic-tileset-scope.md)

## Confirmed gap and scope

Viewer delegates framing to CesiumWidget. The existing planar helper rejects native
Cesium3DTileset before using the fixed-axis Camera path. The public tileset
boundingSphere getter already updates root bounds from modelMatrix and root.transform.
Accept a loaded native tileset, or a Promise resolving to it, whose geometry and
bounds are already in the current planar World Cartesian coordinates.

Reuse the operation identity, cancellation, Promise settlement, Camera framing and
controller suspension contracts. Read current public bounds at execution rather
than snapshotting stale bounds at request time. Track primitive collection removal
and target destruction while pending/flying; release all operation listeners on
completion, replacement, error and Widget/Scene teardown. Do not call private root
methods or introduce a rendering fallback or a new public transform API.

The target must be attached to the scene's PrimitiveCollection tree. Membership,
valid bounds and transform readiness are checked before Camera mutation. Loading
uses the existing Promise target path; this does not wait for all tile contents.
Attachment may occur after target resolution but before framing dispatch; an absent
target is not rejected merely because its Promise continuation runs first.
Retaining an already destroyed object in a PrimitiveCollection remains invalid
native ownership; callers should remove through its owning collection.

## Boundaries

No ECEF-to-EPSG:3857 conversion is implemented. Audit root/child transforms,
content coordinate encodings, box/sphere/region, culling, SSE and picking and record
the distinction between planar content and geographic reprojection. Public
root.transform replacement is assessed separately from additive modelMatrix.
Automatic reprojection needs owner-approved design before implementation. Environment
defaults and SDK API names are unchanged.

## Verification

First reproduce target rejection with a real native tileset and real planar Widget.
Then cover initial framing, root/model matrix changes before dispatch, Promise
replacement, completion/cancel, removal (including a parent collection), destruction
and controller token cleanup. Verify Viewer delegation for live/declarative Worlds
and preserve existing Entity framing regressions. Use native bounds and Camera,
without claiming a framing test qualifies all 3D Tiles coordinate formats.

Run scoped Specs, full build/type checks, static checks and upstream patch audit.
Update the guide, ADR and extension index; record a local SDK-sync checkpoint once
implementation and review are complete.

## Outcome

The owned framing helper now accepts native planar-coordinate tilesets and reads
current public bounds at dispatch. Removal/destruction, asynchronous readiness,
replacement and teardown retain isolated settlement and controller cleanup.
50 scoped Specs, build/type checks, static checks and patch audit passed; see the
linked review for exact evidence and unrelated documentation-format warnings.
Geographic reprojection remains an explicitly deferred design decision. The local
checkpoint is on scenegis/develop; environment defaults and SDK APIs are unchanged.
