# ADR-0205: SceneGIS branded single-source distribution

- Status: accepted and implemented
- Date: 2026-10-29
- Owner: Architecture Agent
- Related extension: [engine-distribution](../../../AgentDocs/engine-distribution/README.md)
- Upstream patches: SGP-0073, SGP-0074

## Context

The root generated Cesium barrel already combines native engine, Widgets and SceneGIS
extensions. Existing builders handle embedded/module Workers, static assets, CSS and
JSDoc/tsd-jsdoc. IIFE global/file names and buildModuleUrl script detection assume Cesium.
The SDK needs a self-contained branded artifact and source-derived API data, without
depending on the source checkout or loading a second engine module.

## Decision

Generate `Build/SceneGIS` using the existing source barrels and native builders. Emit
SceneGIS.js (IIFE global SceneGIS), index.js (one ESM named-export entry), SceneGIS.d.ts
(external module with `export as namespace SceneGIS`) and index.d.ts (relative-entry shim).
Generated package metadata declares ESM, its single export/types entry and asset paths.
All original symbol/class names, including Scene, ImageryLayer, I3SLayer, Panorama and
VERSION, remain unchanged. SDK naming composition belongs downstream. No version lock
or automatic runtime compatibility checks are introduced.

SGP-0073 minimally parameterizes the native bundler's global name and extends native URL
resolution. SCENEGIS_BASE_URL precedes CESIUM_BASE_URL; absent globals, direct ESM uses
import.meta.url and IIFE recognizes SceneGIS.js as well as Cesium.js. Explicit setBaseUrl
retains its existing cached override behavior. Configure a resource root before first
resource use when renaming/rebundling files. Original Cesium targets retain their defaults.
Worker embedded identifiers and native workspace packages remain unchanged.

Owned orchestration and generators live in `scripts/scenegis/**`; generated artifacts
stay ignored under Build. The JSDoc target reuses the current source include/exclude and
custom tags. Brand display and links are mapped at generation, never by rewriting the
source tree. Canonical doclet longnames remain stable; display names are SceneGIS-qualified.
Static pages, metadata, images, scripts and styles are delivered together under Documentation.
Metadata excludes AST/code/comment internals and absolute build-machine paths while
preserving public parameters, returns, typedefs, enums, events, inheritance, examples and
custom tags. SDK consumers use the package ESM and metadata only.

## Verification and upgrade boundary

Retain native build, release and type checks. Verify exported public declaration values,
both globals/module imports, actual Worker/WASM/images at root and nested mounts, both
World lifecycles, static search, type/anchor links and extension coverage. Audit all
upstream hunks against SGP-0073 and SGP-0074. Recheck bundler option forwarding, inline Worker injection,
JSDoc helper pruning/link allocation and declaration postprocessing on upstream upgrades.

This adds packaging/documentation cost only; it does not change simulation/render algorithms,
rename native types, publish an npm package or modify the SDK. Rebundled ESM requires an
explicit asset URL because import.meta.url then belongs to the downstream output.

## Implementation outcome

D1 checkpoint `99c7ce81ca` implements branded runtime/resources/types. D2 delivers 533 pages
and 7,943 canonical symbol records using a composed native publisher, a generated template,
and member-level static search. All metadata URLs resolve; source AST, raw comments and
machine paths are excluded. Actual barrel exportName is optional for type-only global symbols.
The branded publisher uses native flat navigation and omits source-checkout links; native docs
remain unchanged. Fifteen malformed owned getter tags were fixed at source. BASE_URL globals
are declared for TypeScript. Full target and docs-only target include the SDK handoff README.

Integration and metadata details: [Distribution](../Distribution.md). Review evidence:
[D1](../../../AgentDocs/engine-distribution/reviews/2026-10-29-d1-runtime.md),
[D2](../../../AgentDocs/engine-distribution/reviews/2026-10-29-d2-documentation.md).

## Static asset stream correction

SGP-0074 filters directory Vinyl entries in the native copyFiles stream. The source
exclusion globs previously retained directory Vinyl entries, producing empty Core/Scene/
Shaders/SceneGIS trees even though their JS/GLSL files were correctly bundled and excluded.
Only real files are copied; gulp.dest creates their parents. Existing resource selections,
bytes, widget remapping and runtime URLs remain unchanged. This applies to native Cesium
targets as well as SceneGIS and requires no post-build deletion or separate asset whitelist.

## Product support notices

Native source prose describes Cesium behavior, while ADR-0161 replaces specific native
environment visuals in the SceneGIS WebGL deferred profile. The owned publisher appends
explicit Chinese support notices by canonical symbol ID after native translation/report
generation and before brand mapping, HTML and SDK metadata generation. Notices identify
the affected path, retained roles, supported replacement and absence of native fallback.
They are product annotations, not translations or deprecation of whole native types.
Keep them in scripts/scenegis/documentation-notices.cjs; owned API constraints remain in
source JSDoc. Preserve upstream comments, native buildDocs, source hashes and report counts.
No runtime gate, compatibility checker, export or new SGP is introduced.
