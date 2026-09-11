# P2: Planar Physical Lighting and Cloud Shadows

## Metadata

- Type: `phase`; status: `completed`; created/updated: `2026-09-11`
- Parent: [extension plan](2026-08-14-atmosphere-clouds-effects-extension.md)
- Owner/reviewer: current agent executing and reviewing under owner delegation
- Predecessor checkpoint: P1 `4c847d6def`
- Decision: [ADR-0055](../../../Documentation/SceneGIS/Decisions/ADR-0055-planar-physical-lighting-and-cloud-shadows.md)
- Review: [P2 review](../reviews/2026-09-11-p2-planar-lighting-cloud-shadows.md)
- Upstream: consume-only SGP-0008/0010; zero new hunk

## Source facts and implementation

Graph search/trace is stale for private shadow/model helpers; exact source
confirms controller `prepareGlobeLighting` is called before surface/model
commands, and only Globe currently publishes lighting or builds Beer resources.
Existing model source hooks delegate to `_SceneGISModelEnvironmentLighting`;
Planar surface shader cache and normal/material/sampler preflight are owned.

1. Extend renderer preparation/publication to a separate Planar record. Reuse
   atlas allocation, cascade topology, temporal resolve and lifecycle; branch
   only world geometry/material operations. Prepare horizontal-origin-relative
   matrices and camera/history deltas in CPU double precision.
2. Compile a Planar Beer producer from the shared shader with flat top/base
   intersection and the same Planar material/wind/caster layer support. Extend
   shared receiver top-distance geometry without changing Globe output.
3. Add one private Planar lighting-source/binding helper for native model PBR
   and the Planar surface. Separate physical beam and diffuse LUT irradiance;
   shadow only direct source. Preserve authored material/SH/lightColor.
4. Integrate an explicit Planar surface variant with normals, eye position,
   existing material ordering and three-sampler preflight. Preserve command,
   terrain/imagery, normal/depth replay and resource ownership.
5. Add a real local PBR model and the existing cloud-shadow/surface-scale
   controls to the Planar development page. Add no geometry shadow switch.

## Validation and exit

- Compiled Beer producer/receiver at fixed-Z and large XY; wind/camera history.
- Real Planar surface and model direct/sky/cloud attenuation, authored inputs,
  foreground heights, toggles and borrowed-resource lifetime.
- Focused Globe model/shadow regression and relevant native stages.
- Minimal renderer resize/release, surface sampler preflight, build/types,
  changed lint/format, required AgentDocs checks and ownership audit.
- Agent inspects ready/HDR/errors and day/low-Sun/shadow-off/on; bounded GPU
  cost evidence. Record unresolved limits, review and independent checkpoint.
- No repeated owner visual gate; no hidden quality bypass, new assets,
  fullscreen relighting, native shadow switch or unrelated pipeline changes.

## Completion

Implemented all five steps. Architecture has completed source, actual GPU,
day/low-Sun visual and bounded producer-cost review under owner delegation;
see the linked review for findings, fixes, passed checks and accepted limits.
This change forms the independent P2 local checkpoint before successor work.
