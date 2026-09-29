# P3: Approximate surface wetness and thin snow

- Type: phase; status: completed implementation, owner visual acceptance pending; created/updated: 2026-09-29
- Parent: [extension](2026-09-29-gpu-particles.md); entry checkpoint: 781e2a9d90
- Architecture/execution/review: current task, self-review; architecture entry confirmed
- ADR-0104; SGP-0028

## Owner direction and source facts

Owner accepts approximate GIS wetness/snow based on existing data, without extra authored material properties. Native models evaluate material before lighting; Phong primitives and Globe/Planar terrain have explicit lighting seams. Existing derived-command scheduling supports material-local changes shared by normal draws, SSR MRT/replay and probe capture. Current terrain is Lambertian rather than PBR. Particle precipitation remains independent.

## Design and scope

Add Scene-owned SceneGISSurfaceWeather with enabled, wetness, snowCoverage, patchScale and snowColor. No asset requirements, extra draws, attachments or simulation. Use geometry slope and world-fixed procedural coverage; Globe uses geodetic up, Planar fixed Z. CPU camera-origin reduction keeps procedural coordinates stable at large coordinate magnitudes. Modify PBR diffuse/roughness/normal/specular before all lighting consumers and existing specular filtering; snow removes metallic/coat response. Preserve alpha and emission. Phong receives analogous diffuse/gloss changes; terrain mixes albedo before lighting and adds a bounded approximate wet directional highlight using its existing light source. Unlit models, translucent objects, classification and water are excluded. No shelter, true puddles, thickness or drainage claims.

Amounts are caller-controlled and independent of particle visibility/type/time. Examples expose dry/wet/snow presets and controls; a separate local fixture example isolates the effect while the ion aerial page exercises real data. Keep default rendering unchanged. Upstream changes are limited to Scene scheduling/lifecycle, model lighting, Globe surface and Phong seams; implementation stays owned.

## Steps and acceptance

1. Register ADR/SGP, implement public setting and cached derived shader path, then connect qualified material seams.
2. GPU Specs verify default/disabled equivalence, wet/snow material response and slope in both worlds, terrain/Phong, emission/alpha exclusions, SSR material agreement, large-coordinate stability and lifecycle. Inspect examples and errors.
3. Record bounded enabled/disabled timing and unchanged command/target counts. Run focused development/release Specs, full release build/types, lint and patch audit. Record self-review and create one P3 checkpoint.

## Risks

No roof shelter or semantic road/vegetation mask; imagery can become snowy even where photographed trees/water exist. Thin snow cannot change silhouettes. Material approximation cannot infer porosity or drainage. ShaderCache owns derived programs; disabling must restore original commands. Owner visual judgment remains final; no automatic quality fallback.

## Completion and handoff

Implemented the public setting, owned shader response and four registered upstream seams. Both-world PBR, Phong and terrain use existing material/normal/position data. SSR MRT/replay and explicit probe capture receive the same weather material evaluation. Particle simulation remains unchanged. No design deviation or extra authored asset input was required.

Ten targeted GPU Specs pass in development and release with WebGL validation; five example E2E cases pass. Full buildRelease, buildTs and tsc pass. Focused source/Markdown checks and upstream patch audit pass. Interleaved off/wet/snow timing shows unchanged five frame commands in the bounded local fixture; the review records measurements and limitations. Independent Globe/Planar pages visibly show slope-dependent snow and preserved colored walls. The online desktop scene loaded buildings/terrain but reported a world-imagery network failure; online E2E independently passed, and no silent fallback was introduced.

The [P3 self-review](../reviews/2026-09-29-p3-surface-weather.md) approves the architecture/code gate and separate local checkpoint. Owner visual acceptance remains pending. No further phase is activated.
