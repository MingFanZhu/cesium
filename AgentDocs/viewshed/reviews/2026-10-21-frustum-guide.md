# Review: Observer range guide

## Metadata

- Type: architecture / code self-review
- Status: approved; project-owner guide visual acceptance confirmed
- Owner / reviewer: current task; no independent agent
- Created / Updated: 2026-10-21
- Target: [standalone plan](../plans/2026-10-21-frustum-guide.md)
- ADR: 0176 amendment
- Upstream-owned changes / SGP: none

## Findings and disposition

| ID       | Severity | Finding                                                                                                            | Disposition / evidence                                                                                                                                         |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guide-01 | P2       | A rectangular far plane overstates the radial analysis range, and a large near plane can intersect the radial cap. | Fixed: outline the actual boundary intersections; geometry Specs check all vertices against angular, near and radial constraints, including near/range = 0.95. |
| Guide-02 | P2       | Native morphable Primitive splits local coordinates at the date line, producing two source commands.               | Fixed: scoped 3D-only preparation with finally restoration; both-world GPU tests verify one command and restored FrameState.                                   |

## Verification and cost boundary

- 14/14 Viewshed GPU / geometry Specs pass under Windows ChromeHeadless WebGL validation.
- 2/2 Globe / Planar street E2E pass; default-on checkbox, independent analysis enable,
  source visibility, observer motion, camera motion, pick and teardown remain functional.
- Whole-range screenshots inspected in both worlds. The guide respects existing terrain
  depth-test policy; Globe terrain occlusion still follows `depthTestAgainstTerrain`.
- Visual follow-up: changed cyan to bright yellow after owner feedback on contrast;
  Globe street E2E passes again and the updated screenshot has been inspected.
- No added observer draws; the helper contributes one native translucent source command,
  with normal OIT processing. Hidden helper contributes none. No new offscreen targets.
- Pose-only updates reuse the VA. Range / angles rebuild it; replacement and stage removal
  release resources. Multiple helpers are independent, and borrowed models remain alive.
- Full `npm run build`, `npm run build-ts`, `npm run tsc` pass; generated declarations include
  both the option and writable property. Generated files are not part of the diff.
- Scoped ESLint / Prettier and diff checks pass; full AgentDocs Markdownlint passes.
  Full AgentDocs Prettier still reports the same 523 pre-existing unrelated files.

## Remaining boundary and handoff

Guide curves use finite segments (maximum angular step PI/64); native lines retain normal
scene depth / display processing. Project owner accepted the yellow guide and requested
its commit on 2026-10-21.
V3 photogrammetry sampling noise and the previously documented Surface test failure remain
unchanged and tracked in the V3 review. No new blocking finding. Refresh the existing HTML
example to inspect the guide and its checkbox; SDK integration is outside this change.
