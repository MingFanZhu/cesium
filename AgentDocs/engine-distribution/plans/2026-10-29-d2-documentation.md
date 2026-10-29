# D2 source-derived API documentation and SDK handoff

- Type: phase plan
- Status: completed
- Owner: Execution Agent; design/review: Architecture Agent (current task)
- Date: 2026-10-29
- Parent: [extension](2026-10-29-extension.md)
- Prerequisite: D1 committed at `99c7ce81ca`
- Architecture review: approved
- ADR/SGP: ADR-0205 / SGP-0073 (existing task export seam only)

## Source facts

Native Tools/jsdoc/conf.json includes current engine/Widgets sources and excludes
ThirdParty, Workers and underscore/private files. cesiumTags preserves internalConstructor,
performance, demo, experimental and optional. Native publish prunes doclets, assigns links,
renders copied tmpl/static assets and writes types.txt. Layout and member/method templates
hardcode Cesium branding; no configurable publisher metadata hook exists.

## Design and execution

1. Owned CLI derives the native JSDoc config, copies the native template into ignored
   staging, applies bounded presentation changes there, then calls native JSDoc.
   An owned CommonJS publisher composes native publish, sharing its real final link map.
   Do not edit/copy-maintain upstream templates or reimplement their rendering.
2. Preserve canonical longname/kind/memberof/scope and all semantic doclet fields. Remove
   AST, raw comments, file-local undocumented values and absolute source paths. Assign
   SceneGIS displayName and actual native export aliases from D1's barrel mapping.
3. Produce versioned JSON envelopes with doclets and a deduplicated search symbol index.
   Page URLs/anchors use native publisher allocations. Metadata and examples reflect this
   source version; VERSION is synthesized from the generated root barrel version.
4. Deliver Documentation assets and metadata in Build/SceneGIS; copy the SDK integration
   guide to its README. Expose focused docs task and make full target include docs.
5. Verify real metadata coverage (all public native/Widgets/extension roots, typedefs,
   events, enums, inheritance, examples/custom tags), local links/anchors, search and
   offline static resources. Compile downstream type imports against delivered package.
6. Run retained native docs task, final branded build and existing focused tests as
   appropriate; review, document remaining limits and create independent D2 checkpoint.

## Risks and exit

Canonical IDs must not depend on source line numbers, build paths or renamed namespaces.
Display mapping must not rename Cesium3DTileset/CesiumWidget classes or modify source.
JSDoc describes public API only; private barrel exports remain outside docs/types.
No SDK, registry publishing, runtime lock or automatic compatibility validator.

Exit: complete standalone docs and usable metadata shipped with one engine artifact,
SDK handoff guide, focused coverage/link/browser/type evidence and no generated Git edits.

## Completion and deviations

[Architecture review approved](../reviews/2026-10-29-d2-documentation.md). Complete branded and
native docs/types builds pass; 6 Node tests and 7 browser cases pass. All 7,943 metadata links
resolve. Fifteen malformed owned JSDoc getters were corrected after the exhaustive link test
identified their actual failure; no rendering/runtime algorithm changed. The branded docs use
native flat navigation plus owned full-member search, and omit source-checkout links.
