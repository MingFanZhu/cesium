# P1 Planar Integrated-medium Source Discovery

## Status

- State: `resolved; P1 activated`
- Date: `2026-09-02`
- Frozen predecessor: A10-G
  `6afba87af181f3cdb7a20aff09b81af11eb302f4`
- Decision:
  [ADR-0052](../../../Documentation/SceneGIS/Decisions/ADR-0052-planar-integrated-medium-restoration.md)

## Owner request

After accepting the native Moon result, the project owner explicitly requested
the next phase. The extension roadmap resumes the deferred Planar adaptation
track after the completed Globe A1–A10 sequence.

## Historical failure and current evidence

The retained 2026-08-27 Planar screenshot showed a large white region and wrong
layering when exponential height fog and volumetric clouds were enabled. That
visual rejected the then-current candidate, but the accepted ADRs deliberately
did not assign a root cause.

Current source discovery on the frozen A10 checkpoint found:

- `executeHdr` runs Cloud MRT and Cloud Resolve before the existing
  full-resolution aerial/fog/cloud composite;
- the final aerial shader keeps a separate non-`SCENEGIS_GLOBE` branch and
  composes finite Planar geometry as atmosphere, then height fog, then cloud;
- Planar height fog still uses the fixed-Z analytic segment integral;
- Planar cloud history retains its pre-A6 same-UV compatibility policy instead
  of Globe world reprojection;
- Globe A5–A10 product paths are macro- or mode-gated and are not required to
  qualify the retained Planar core.

A direct load of `高级环境-平面.html` reached `ready · HDR` with zero browser
errors. Combined, cloud-only, fog-only and atmosphere-only isolation did not
reproduce the historical full-screen white fill exactly. Source inspection of
`Test/AdvancedEnvironment/planar.js` also confirmed that the large gray-green
lower field and yellow rectangle are intentional deterministic plane/box
geometry. They must not be classified as an effects failure without a baseline
pixel comparison.

## Decision

P1 is an evidence-first restoration and requalification phase, not a presumed
shader repair. Execution first establishes one actual-GPU final-composition
authority over immutable Planar color/depth inputs and then changes only the
formula, depth or selection path that the witness proves wrong. A valid outcome
is qualification with no product-code change.

The phase freezes all Globe behavior and resource topology. It also defers
Planar cloud shadows/rays, Globe-style reprojection, HDR bloom/lens flare,
readable-night lighting and celestial bodies. No parameter-only tint/scale,
spherical substitution, Test-only branch or new resource category is accepted.

## Authorized investigation surface

- `_SceneGISEnvironmentEffectsRenderer.js` pass scheduling and Planar uniforms;
- `SceneGISEnvironmentEffectsAerialFS.glsl` final Planar composition;
- `SceneGISExponentialHeightFog.glsl` fixed-Z fog segment/source;
- `SceneGISEnvironmentEffectsCloudFS.glsl`,
  `SceneGISEnvironmentEffectsCloudResolveFS.glsl` and
  `SceneGISVolumetricClouds.glsl` only if the final witness locates the fault in
  Planar Cloud MRT/resolve rather than final composition;
- the existing controller Spec and deterministic Planar direct sample.

Any required path outside this surface is an Architecture stop condition.
