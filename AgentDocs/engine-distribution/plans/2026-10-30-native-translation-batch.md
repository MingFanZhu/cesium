# Native API translation batch

- Type: standalone plan
- Status: completed
- Date: 2026-10-30
- Owner: Execution Agent; architecture/review: current task
- Architecture review: confirmed; existing localization boundary unchanged
- Parent: [distribution](2026-10-29-extension.md), C2 checkpoint `cdbf4ec681`
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; owned catalogs/docs/tests only

## Current facts and scope

Native inventory contains 15,294 natural-language fields: 2,960 translated, 12,334 missing,
zero stale/unused. Source ownership already excludes Chinese SceneGIS APIs. Graph discovery
does not contain current translation helpers; direct inspection confirms inventory/catalog
matching by original ID, selector and exact source hash before branding/rendering.

Complete the remaining 1,327 fields of 18 common API roots: Scene, Camera, Viewer, CesiumWidget,
Globe, ImageryLayer, ImageryLayerCollection, Cesium3DTileset, Cesium3DTileFeature,
Cesium3DTileStyle, Primitive, PrimitiveCollection, GroundPrimitive, Entity, EntityCollection,
GeoJsonDataSource, CustomDataSource and DataSourceCollection. Their 1,476 total fields define
this batch's bounded acceptance. Preserve native comments, runtime, generator and public types.

## Steps and validation

1. Group exact missing source text for editorial reuse; retain per-symbol source-bound records.
   Reuse existing translations only when the original source matches without ambiguity.
2. Author Chinese prose including parameters, returns, constraints, defaults, units and captions.
   Keep markup/attributes, inline targets, code and URLs; use the existing glossary consistently.
3. Validate every entry through the existing translator and add focused catalog acceptance tests
   for complete root coverage, preserved units/constraints and representative output paragraphs.
4. Rebuild documentation only; verify counts, zero stale/unused, all links and preserved metadata.
   Run translation/doc tests and focused browser docs cases; inspect representative Chinese pages.
   No runtime/type/GPU rebuild is needed for catalog-only editorial changes.
5. Record accurate remaining coverage and review; create a local standalone checkpoint.

## Risks

Long descriptions contain important negative conditions, property-event limits, coordinate frames
and performance constraints. Do not shorten away those semantics. Exact text reuse must not be
confused with fuzzy matching. Remaining native APIs outside the selected roots stay English and
continue to appear in the report; no claim of complete native translation is made.

## Outcome and review

Added 1,327 source-bound records in scene-camera.json (629), imagery-tiles.json (352), and
primitives-entities.json (346). All 1,476 fields of the 18 roots are translated. Native totals are
4,287/15,294 translated (28.0%), 11,007 missing, zero stale and zero unused. Seven exact source
texts reuse unambiguous existing translations; repeated style descriptions share an editorial
template during authoring only, with ordinary exact-hash records in the maintained catalogs.

Clarified verified source typos in Chinese: Viewer pitch signs follow Camera's actual offset
conversion; CRS href handlers precede type handlers; imagery magnification/ready descriptions
use their actual provider/filter roles; resumeEvents pairs with suspendEvents. No upstream text,
link target, literal code, runtime or generator is changed. An upstream malformed @example
inside a return description retains its entire code tail verbatim.

buildSceneGISDocs passes. Twenty-two translation/metadata/link tests and three focused browser
documentation cases pass. Before/after metadata agrees for all non-prose semantics, executable
examples, canonical IDs and URLs; screenshot inspection confirms Chinese camera option tables.
[Review](../reviews/2026-10-30-native-translation-batch.md) approves the local checkpoint.
