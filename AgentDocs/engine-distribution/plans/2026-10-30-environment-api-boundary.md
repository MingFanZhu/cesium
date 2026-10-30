# Environment API support boundary

- Type: standalone plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Extension: [engine-distribution](../README.md)
- ADR: [0205](../../../Documentation/SceneGIS/Decisions/ADR-0205-scenegis-distribution.md),
  [0161](../../../Documentation/SceneGIS/Decisions/ADR-0161-unified-opaque-deferred-direction.md)
- SGP: none; no upstream edit

## Source facts and scope

Scene.updateEnvironment skips native SkyAtmosphere, SkyBox and Sun in the WebGL deferred
profile; the fog frame record retains culling but disables rendering. Globe omits native
ground atmosphere and daylight variants. SceneGISPlanarWorld.renderPlanarEnvironment skips
its lightweight environment drawing in the same profile. These gates do not depend on the
advanced controller's enabled flag. Globe Moon, ephemeris, explicit light and shadow control
are separate retained capabilities under ADR-0161. Current public API prose lacks that boundary.

Document existing behavior without changing runtime, exports, types or native English comments.
Owned public environment JSDoc describes the gates and supported replacement. The branded
publisher appends explicit Chinese product notices to relevant native descriptions after
translation and before rendering/metadata generation. Notices stay outside translation
inventory and catalogs; native buildDocs retains its own path. No deprecated tag is used for
types that still have retained roles. Private bypasses are outside maintained support.

## Steps and verification

1. Add owned JSDoc and a narrow symbol-to-notice publisher pass; document the maintenance
   boundary in ADR-0205 and the distribution guide. Preserve source-hash extraction.
2. Add artifact assertions for notices, retained Fog/lighting roles, links, canonical identities
   and the unchanged native inventory. Rebuild docs and run documentation Node suites.
3. Verify representative native and owned pages in a real browser, then lint/format and review.
   No runtime/GPU/full-type rebuild is needed: only comments and documentation composition change.
4. Record outcome and local checkpoint. Preserve unrelated historical atmosphere maintenance issues.

## Outcome

Owned environment JSDoc and sixteen native symbol descriptions now state the supported
deferred boundary, retained roles and replacement entry. Source/report are byte-identical;
no native translation or runtime edit. Docs build, 37 Node checks and the root/nested
browser link case pass. See the [review](../reviews/2026-10-30-environment-api-boundary.md).
