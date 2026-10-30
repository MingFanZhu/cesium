# T3 Rendering translation review

- Type: phase review
- Status: approved
- Date: 2026-10-30
- Owner: Architecture Agent (current task); execution: same task
- Target: [T3](../plans/2026-10-30-t3-rendering-translation.md)
- ADR: [0207](../../../Documentation/SceneGIS/Decisions/ADR-0207-chinese-source-api-documentation.md)
- SGP: none; no upstream-owned file changed

## Assessment and findings

Seven catalogs add 1,560 records, completing all 1,713 fields across 80 rendering roots.
Preserved world/eye/model coordinates, pixel/metre sizing, shader uniform contracts, texture
sharing, lifecycle ownership, animation timing, GPU upload costs, depth and clipping behavior.
Reviewed all 69 exact reused texts in context. Literal code, CSS, images, tags and link targets
remain unchanged; example captions and ordinary explanatory text are Chinese.

Resolved editorial findings, owned by the current architecture/execution task:

- Fixed: ClassificationPrimitive shares GroundPolylinePrimitive's asynchronous creation sentence,
  including an erroneous terrain-height initialization requirement. ClassificationPrimitive builds
  its Primitive directly; GroundPolylinePrimitive explicitly checks ApproximateTerrainHeights and
  invokes its initializer. Their records now express different requirements, covered by a test.
- Fixed: EllipsoidSurfaceAppearance constructs its default state with closed equal to the inverse
  of aboveGround. Appearance enables back-face culling for closed. Chinese corrects the source
  prose's reversed aboveGround behavior and states this class's closed property is false.
- Fixed: DebugAppearance maps normalized vector components with `(v + 1) * 0.5`, hence the output
  is [0, 1], not the erroneous (-1, 1). Horizontal/vertical origins align the named object edge to
  the anchor; shader origin translation and enum signs confirm the original directional typo.
- Fixed: Brightness.glsl multiplies RGB brightness rather than saturation. Material.PolylineDashType
  is PolylineDash, not glow. TextureUniform repeat defaults true, with false using CLAMP_TO_EDGE.
- Fixed: Particle.update invokes one callback with particle and dt in seconds; updateCallback is
  not an array. CustomShaderTranslucencyMode spelling is corrected in prose only. SkyBox.sources
  describes its six source faces rather than an unrelated primitive object.

Accepted inherited metadata limitations (low severity, architecture owner): ConeEmitter.angle
has an erroneous CircleEmitter memberof; ClippingPolygon source links contain copied plane/union
names. Canonical doclet identity and protected link targets are intentionally preserved in this
editorial phase. Chinese identifies the polygon collection/inverse and does not invent a runtime
method. These source metadata inconsistencies predate translation; a future explicitly scoped
metadata correction may address them. No new broken metadata URL or anchor is introduced.

## Validation and gate

- Docs build passes: 9,653/15,294 translated (63.1%), 5,641 missing, zero stale/unused.
- Twenty-five Node checks pass; the new semantic case was rerun after fixing its multiline regex.
  All 178 reviewed roots are complete, every generated symbol page/anchor exists, and owned-source
  provenance and protected-token/hash checks pass.
- Focused nested browser case passes without page/resource errors. Screenshot reviewed at
  CustomShader, showing Chinese signatures/tables and application-owned destruction requirements.
- Before/after comparison preserves all 7,943 symbols' non-prose metadata, signatures, example
  bodies and URLs. Runtime/type/GPU rebuilds are outside this catalog-only phase's risk boundary.
- Scoped ESLint/Prettier and Markdown checks pass. Whole-tree AgentDocs formatting retains only
  inherited warnings outside this extension. No generated artifact, SDK or upstream file included.

No unresolved new implementation finding. Approved for the T3 local checkpoint. Inspect current
inventory before activating data/property/geometry scope. Continuous translation remains active.
