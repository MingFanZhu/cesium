# Lens texture follow-up

- Type: standalone follow-up to P4; status: implemented, owner visual acceptance pending; date: 2026-09-29
- Architecture/execution/review: current task, self-review
- Entry checkpoint: 279103d298; parent: [extension](2026-09-29-gpu-particles.md)
- ADR-0105 amendment; upstream-owned files / SGP: none planned

## Scope and facts

Owner finds procedural lens drops artificial and authorizes static texture resources. Keep the public lens API, ground ripples and weather composition. Replace analytic circle/rim shading with a pinned redistributable raindrop refraction/height sprite. Candidate is SardineFish/raindrop-fx assets/img/raindrop.png at bae4081bc15815bb094ea040a976dca083bbc3a5, MIT, 256×256 RGBA8 (33,913 bytes). RG stores asymmetric refraction directions and alpha stores the droplet height profile. Copy it unchanged with complete license and a provenance/budget manifest into Assets/SceneGIS/Weather/RainLens.

Native PostProcessStage loads string image uniforms on first enabled update and owns their GPU release. buildModuleUrl and copyEngineAssets already support the owned static asset root through development/release and engine/root npm. No new loader, dependency, image synthesis, simulation buffer or upstream seam is needed.

## Implementation and verification

Owner rejected the refraction-only preview and selected the RaindropsOnGlass visual reference (https://www.fab.com/listings/9054808a-d4d2-454a-bd14-7ee74c302483). Its public description confirms static/rolling drops without scene capture; its material implementation is not in the public example repository. Use the appearance as a reference, without copying proprietary code or buying/importing that package.

Keep the existing MIT sprite and one post-process pass. Use curved-surface visible-color reflection and subtle lower-meniscus attenuation; keep stationary drops and staggered rolling beads. The owner rejected the fixed bright glint during preview, so the final version removes that artificial light entirely. Its normal is separate from the asymmetric RG refraction field. Bound work with sprite-rectangle rejection and explicit base-level samples, with pixel-width coverage rather than derivatives inside divergent branches. No fluid solver, collision/merge simulation, extra capture, history or render target. Preserve source alpha, zero-intensity identity, Scene-time freezing and public API.

Cost gate: use a bounded alternating off/on GPU measurement on the local eight-box fixture. Do not expand into simulation or a multi-pass pipeline to match the commercial reference. Report measured cost and remaining visual approximation; stop escalating if that budget cannot deliver a useful appearance.

Update lens GPU Specs for lazy fetch, sampled texture ownership/reuse, disable/re-enable readiness, frozen animation and identity. Run relevant both-world page checks, visual inspection and a bounded GPU comparison. Verify full release build, asset/license/manifest delivery in source and built root runtimes, and engine npm inclusion; types/API remain unchanged. Full root-tarball installation is deferred because the existing root pack also scans large unrelated fixtures; record that qualification limit rather than claiming a full package test. Record self-review and a local follow-up checkpoint. No water-surface work or rain collision simulation.

## Result and handoff

Implemented with the fixed glint removed after owner feedback. Development and release GPU Specs pass (3 each); two both-world rain-details E2E cases pass. Full release build passes. Desktop inspection qualifies both world modes for further owner review. Final bounded GPU medians are 3.922 ms off / 4.222 ms on at 1001×826 on RTX 3060 Ti, approximately 0.301 ms incremental cost. One native output pass, one 256 KiB sprite and eight scene geometry commands remain; no simulation/capture/history is added.

Native image texture disposal required a subclass destroy override because collection removal clears the native texture-cache reference before texture release. Tests cover disable/re-enable, Scene destruction, texture/program reuse, flat-background attenuation without artificial light, alpha and frozen/animated time. See the [follow-up review](../reviews/2026-09-29-lens-texture.md). Final visual acceptance remains with the owner; do not expand the effect into fluid simulation to chase the commercial reference.
