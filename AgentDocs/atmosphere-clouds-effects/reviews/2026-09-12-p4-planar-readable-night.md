# P4 Planar Readable Night Review

## Metadata

- Type: `review`; status: `accepted`; created/updated: `2026-09-12`
- Reviewer: current Architecture role under owner visual delegation
- Plan: [P4](../plans/2026-09-12-phase-p4-planar-readable-night.md)
- Predecessor: P3 `9d21e17de0`; upstream delta budget: zero

## Review and evidence

The three source consumers use fixed +Z and the existing explicit Sun. The
shared surface helper also serves native PBR; authored light/SH/emissive remain
owned by the model. Cloud night irradiance enters before the existing solar
normalization. Fog night irradiance enters ambient only. No final RGB lift,
directional source, shadow authority or Globe branch changes were introduced.

Actual GPU: 5/5 focused cases pass in Chrome 152. P4 verifies the real surface,
native Planar PBR, fixed-Z/large-XY invariance, full-night and twilight boundary,
nonzero physical day exact identity, three ambient consumers, Beer independence
and finite RGBA16F storage. Regression covers Globe readable night and native
geometry shadows, native Globe PBR and the Planar P2 Beer/surface/lifetime case.
The initial P4 fixture attempted to assign to the published frozen frame record;
fixed by using a test-owned shallow copy for probe uniforms. Product code did
not change to accommodate the fixture.

Source review establishes zero new program/pass/texture/FBO/history/uniform or
GPU bytes. The increment is one fixed-source smoothstep/add at each existing
ambient input, with no additional texture lookup. Warm resource identity and
existing atlas/model borrowed-texture destruction checks pass. This is bounded
resource/regression evidence, not a new total-frame timing claim.

Full build, changed ESLint/Prettier and upstream audit pass; no public/type/API
change requires another build-ts run. Full AgentDocs markdownlint passes; full
AgentDocs Prettier retains the same 16 unrelated historical failures.

Actual page is ready/HDR with zero reported browser/render errors. Fixed native
model night view retains top/side contrast; natural cloud-above view at 10 km
shows cool low-light cloud and ground separation. Intermediate Sun.z=-0.15 is
dimmer; full night Sun.z approximately -0.436 retains the same source plateau.
Day and native shadow behavior remain unchanged. User camera and effects are
restored after inspection.

## Findings and remaining scope

- Deferred, medium, current agent: a narrow distant hue band is visible near
  the extreme Planar horizon, also present in the unchanged daytime result.
  Disabling aerial perspective removes the colored band; source/color transport
  diagnosis belongs to the successor far-medium/cloud quality work. The exact
  numerical cause has not been established. It does not invalidate the bounded
  ambient-source contract, but overall Planar visual parity is not complete.
- Existing coarse cloud morphology/brightness, crepuscular rays and Moon
  geometry/directional moonlight remain successor work. Legacy giant debug
  Primitives use their authored native appearance and remain outside the PBR
  source integration; they must not be mistaken for physical model evidence.

P5 follow-up: the [far-aerial review](2026-09-12-p5-planar-far-aerial-quality.md)
closes the transport finding above after identifying the 300 km path clip and
background/aerial source mismatch, with failing/passing GPU and visual evidence.
Residual extreme-distance cloud hue remains part of successor cloud quality.

Architecture accepts P4 under delegation and creates its independent local
checkpoint. No upstream-owned files changed; SGP-0008 and SGP-0010 are consumed
without new hunks. The current agent retains ownership of the roadmap limits.
