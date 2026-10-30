# T4 Entity data translation review

- Type: phase review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [T4](../plans/2026-10-30-t4-data-translation.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; no upstream-owned file changed

## Assessment and resolved findings

Five catalogs add 1,471 source-bound records, completing all 1,904 fields of 91 entity-data roots.
Preserved Property evaluation, constant/definitionChanged semantics, reference frames, sample
packing and extrapolation, dynamic geometry/material constraints, pixel sizing, CZML planar
binding, GPX/KML load behavior, KML export limits and clustering/resource ownership.
Reviewed all 40 reused source texts and shared contexts before writing ordinary per-symbol records.

Editorial findings fixed by the current task:

- CallbackProperty.Callback shares generic English with Resource.RetryCallback, whose existing
  Chinese intentionally clarifies a source copy error. CallbackProperty now describes returning
  a property value; Resource retains retry semantics. The acceptance test checks both.
- ModelGraphics/ModelVisualizer and tileset counterparts share copied model/glTF sentences.
  Their individual records now describe the correct visibility, URI and updated object type.
  Billboard/label/point visualizer cluster parameter descriptions likewise retain each context.
- CompositeProperty subscribes to interval data's definitionChanged and rebuilds subscriptions
  when intervals change. CompositeMaterialProperty/CompositePositionProperty forward that event;
  TimeIntervalCollectionProperty observes its intervals, while ConstantProperty uses setValue.
  Chinese states the actual triggers rather than claiming all classes expose setValue.
- GeometryUpdater.hasConstantFill/hasConstantOutline check constant visibility, not variation or
  mere component presence. Readonly classification/distance properties no longer claim setters.
  PolylineGeometryUpdater.arcType returns its arc property; hasConstantOutline is always true.
- EllipsoidGeometryUpdater skips model-matrix computation when skipModelMatrix is true, as its
  conditional assignment confirms. CorridorGeometryUpdater passes corridor.width as the geometry
  width, rather than outline width. Generic outline-width descriptions remain correct elsewhere.
- Composite collection event resume calls must match suspension. Polyline depth-fail material
  applies to failed depth tests, including terrain occlusion. Literal newline notation stays
  escaped; all protected tags, link targets, code and image tables remain unchanged.

Inherited source metadata/link limitations recorded in T3 remain unchanged (including Wall#positions
references). No canonical identity or runtime correction is bundled into the translation phase.

## Validation and gate

- Docs build passes: 11,124/15,294 translated (72.7%), 4,170 missing, zero stale/unused.
- Twenty-six Node checks pass, including all 269 reviewed roots, loading/rendering/data contracts,
  complete metadata pages/anchors, source provenance and token/hash safety.
- Focused nested browser case passes with zero page/resource errors; screenshot inspected at
  EntityCluster.destroy, showing resource reuse and Chinese API tables. Sample extrapolation
  displays zero as unlimited, preserving the original time behavior.
- All 7,943 symbols preserve non-prose metadata, signatures, example bodies and URLs in the
  before/after comparison. No runtime/signature/source/generator/SDK change, so no runtime/type/GPU
  rebuild is warranted for this editorial batch.
- Scoped ESLint/Prettier and Markdown checks pass. Whole-tree AgentDocs formatting retains only
  inherited warnings outside this extension. No generated artifact or upstream file committed.

No unresolved new implementation finding. Approved for a local T4 checkpoint. Inspect the latest
inventory before planning geometry/numerics. The full translation goal remains active.
