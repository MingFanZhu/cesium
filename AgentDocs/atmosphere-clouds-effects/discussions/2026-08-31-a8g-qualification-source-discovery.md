# A8-G Globe Qualification and Delivery Source Discovery

## Metadata

- Status: `resolved; A8-G activated`
- Date: `2026-08-31`
- Owner: Architecture Agent
- Scope: Globe qualification, release delivery and direct Test restructuring;
  Planar product qualification remains deferred
- Frozen predecessor checkpoint:
  A7-G=`6f70b54c80ce174bf7befe49fe37262230288e61`
- Phase plan:
  [A8-G Globe qualification and delivery](../plans/2026-08-31-phase-a8g-globe-qualification-delivery.md)

## Current delivery facts

- A2 through A7 already own the accepted Globe atmosphere, aerial perspective,
  exponential height fog, volumetric cloud, cloud shadow, participating-medium
  rays, temporal stabilization, quality policy, Bloom and lens artifacts. A8-G
  is a qualification phase, not a new rendering feature phase.
- The A7-G checkpoint is clean and frozen. A8-G may not silently repair or
  recalibrate predecessor product behavior. A reproduced product defect must be
  returned to Architecture as a focused finding before any runtime edit.
- `SGP-0008` owns the advanced background/HDR Scene slot in `Scene.js`.
  `SGP-0009` owns the three-path Globe surface-lighting seam. Both are audit-only
  in A8-G; no new upstream hunk or SGP is required for qualification.
- Existing SceneGIS Specs already cover the controller, actual-GPU effects,
  private render pipeline, atmosphere reference frame, advanced render slot and
  Globe surface provider seam. A8-G needs a focused delivery smoke, not another
  synonymous shader or resource matrix.
- Root build entry points already provide development build, release build,
  TypeScript generation/checking and API documentation generation. The existing
  installed-package verifier covers root and engine exports, types, API docs,
  private hiding, 26 GLSL modules and deterministic environment assets.
- Playwright already has separate development and release configurations. A
  single local, deterministic Globe delivery spec can exercise both without an
  all-browser or full-E2E run.

## Direct Test diagnosis

The current `Test/高级环境.html` is a 5,175-line, roughly 203 KiB dual-world
page. It contains product controls, historical phase observations, evidence
JSON, owner-gate helpers and both Globe and Planar lifecycle ownership in one
document. It was useful during A2-A7 development, but it is not a clear
release-facing sample and previously allowed evidence panels to obscure the
owner viewport.

The repository already vendors unmodified `lil-gui 0.21.0` under
`Test/lib/lil-gui/`, with MIT license and provenance recorded in
`Test/lib/README.md`. Existing Test pages establish the supported local ESM
import and cleanup pattern. No network loader or new dependency is needed.

## Adopted Test structure

A8-G will replace the monolithic release entry with:

1. `Test/高级环境.html` — lightweight Chinese navigation and capability status;
2. `Test/高级环境-球面.html` — the authoritative Globe A2-A8 direct sample and
   manual qualification states;
3. `Test/高级环境-平面.html` — the separated Planar sample, clearly labelled as
   retained/deferred rather than A8-qualified;
4. small shared ESM/CSS files under `Test/AdvancedEnvironment/` for lifecycle,
   common controls and presentation without duplicating Cesium runtime identity.

Both world pages use the local `lil-gui` bundle. Historical per-finding JSON,
hash/replay/convergence machinery and obsolete owner-gate buttons are not
release UI. Representative named observations and compact live status remain.

## Qualification boundary

Minimal sufficient evidence is:

- the existing focused SceneGIS/Globe Spec authorities;
- sequential development/release/type/docs/package builds;
- installed-package and upstream-patch audits;
- one focused local Playwright spec executed once against development and once
  against release output;
- one bounded Globe manual matrix using the release-facing page.

A8-G does not add screenshot hashes, FPS thresholds, replay loops, settling
frames, all-browser runs, full Jasmine, a second resource audit framework or a
Planar visual gate. No new ADR is required unless qualification discovers a
new long-lived product or delivery contract.
