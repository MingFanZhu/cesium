# Phase Plan: A8-G Globe Qualification and Delivery

## Metadata

- Plan type: `phase`
- Status: `active; implementation pending`
- Parent extension:
  [2026-08-14-atmosphere-clouds-effects-extension.md](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor:
  [2026-08-28-phase-a7g-globe-hdr-bloom-lens-flare.md](2026-08-28-phase-a7g-globe-hdr-bloom-lens-flare.md)
- Frozen predecessor checkpoint:
  A7-G=`6f70b54c80ce174bf7befe49fe37262230288e61`
- Owner role: Execution Agent
- Reviewer role: Architecture Agent
- Created: `2026-08-31`
- Updated: `2026-08-31`
- Branch: `feature/atmosphere-clouds-effects`
- Source discovery:
  [A8-G qualification source discovery](../discussions/2026-08-31-a8g-qualification-source-discovery.md)
- Decisions: inherited `ADR-0040` through `ADR-0049`; no new runtime decision
  planned
- Upstream patches: active `SGP-0008` and `SGP-0009`, both audit-only
- Open review findings: `none; implementation pending`
- Owner visual gate: `pending`

## Goal

Qualify and package the accepted A2-A7 Globe advanced-environment stack for
delivery. Produce clear Chinese release samples, deterministic build/package
evidence, a focused local end-to-end smoke, an upgrade checklist and a bounded
project-owner visual matrix without reopening predecessor rendering design.

## Frozen predecessor

- A7-G checkpoint `6f70b54c80ce174bf7befe49fe37262230288e61`
  is immutable.
- A2-A7 product JS/GLSL, public API/defaults/ranges, radiometry, depth authority,
  temporal policy, quality tiers, resource topology, assets and SGP seams are
  frozen.
- A8-G starts with no authorized product runtime edit. A reproduced defect must
  be reported as a focused Architecture finding before changing predecessor
  code.
- Planar product formulas, calibration, visual qualification and parity claims
  remain deferred. Separating the retained Planar Test UI does not activate the
  Planar product track.
- No push is authorized.

## Deliverables

### 1. Release-facing direct Test pages

Refactor the existing monolithic page into:

- `Test/高级环境.html`: a lightweight navigation hub with links and an explicit
  statement that Globe is the A8-qualified path while Planar is retained and
  deferred;
- `Test/高级环境-球面.html`: Globe-only A2-A8 controls and observations;
- `Test/高级环境-平面.html`: Planar-only retained controls, without Globe/A8
  qualification claims;
- shared CSS/ESM under `Test/AdvancedEnvironment/` where it genuinely removes
  duplicated lifecycle, presentation or control logic.

Both world pages must import the existing local
`/Test/lib/lil-gui/lil-gui.esm.min.js` and use `lil-gui` consistently. Update
`Test/lib/README.md` usage metadata only; do not modify the vendored bundle.
Use one `/Build/CesiumUnminified/index.js` ESM runtime per page and preserve the
required BFCache-aware, idempotent ownership cleanup.

The release pages retain useful named camera/time/surface/quality presets and
compact live readiness/error/resource status. Do not carry forward historical
finding JSON, hashes, replay/convergence helpers, settling loops, parameter
sweeps or obsolete owner-gate panels. The refactor must not change controller
values or product behavior.

### 2. Bounded Globe visual matrix

Expose one direct A8 observation group on the Globe page with these fixed
representative states:

1. ground, high Sun, fully combined, medium/cumulus;
2. above cloud, high Sun, fully combined, medium/mixed;
3. ground, true sunset, fully combined;
4. ground, no-moon night;
5. near space, high Sun;
6. one explicit `medium -> low -> high` quality observation using the existing
   caller-owned tiers.

The matrix reports existing ready/HDR state, selected tier, measured solar
elevation, finite/storage status and browser/render errors. It is an interactive
manual observation, not a pixel gate. Public World Imagery/Terrain stays an
optional best-effort selector with the existing offline fallback.

### 3. Resource and performance qualification

Record one consolidated inventory of the already frozen resource ownership:
A4 cloud MRT/history, A5 BSM tier sizes, A6 two-target history and A7 three-FBO
HDR graph. Confirm stable resource identities through one existing lifecycle
authority, viewport resize, quality change, disable and destroy. Use the
existing tier tables and byte formulas; do not add timing readback, automatic
quality changes, FPS thresholds or another GPU metric framework.

### 4. Focused development and release E2E

Add `Specs/e2e/scenegis-globe-environment.spec.js` and run the same focused file
once in development mode and once in release mode. It must use local data and
cover only delivery risks:

- the hub links to both release samples;
- the Globe page starts one controller, reaches `ready · HDR`, renders without
  page/console errors or external requests, and has terrain-depth lifecycle
  ownership active;
- disable/destroy releases SceneGIS-owned resources and restores caller-owned
  state;
- the separated Planar page receives only a navigation/startup smoke. This is
  not a Planar effects qualification or visual assertion.

Do not add screenshot baselines, hashes, retries, warm-up searches, multiple
viewports or an all-browser matrix.

### 5. Build, types, docs and package delivery

Run sequentially on final source:

- `npm run build`
- `npm run build-release`
- `npm run build-ts`
- `npm run tsc`
- `npm run build-docs`
- `node scripts/scenegis/verify-planar-packages.mjs`
- `node scripts/scenegis/audit-upstream-patches.mjs`

The installed-package verifier must continue to prove root and engine exports,
types, API docs, private-runtime hiding, shader modules and exact deterministic
assets. Do not rename or duplicate the verifier solely because its historical
filename mentions Planar; amend it only if a concrete A8 delivery gap is
reproduced.

### 6. Upgrade checklist

Create `Documentation/SceneGIS/GlobeEnvironmentUpgradeChecklist.md` covering:

- Cesium baseline and build/type/package entry points;
- `SGP-0008` and `SGP-0009` markers, paths and focused tests;
- generated-file boundaries;
- deterministic LUT/cloud assets and provenance checks;
- public exports/types/API docs/private hiding;
- frozen resource/tier budgets;
- focused dev/release E2E and manual Globe matrix;
- checkpoint/rollback expectations.

This is an operational checklist, not a new architecture authority. No new ADR
is required unless implementation changes a long-lived contract.

## Expected changed paths

- `Test/高级环境.html`
- `Test/高级环境-球面.html`
- `Test/高级环境-平面.html`
- `Test/AdvancedEnvironment/**`
- `Test/lib/README.md`
- `Specs/e2e/scenegis-globe-environment.spec.js`
- `Documentation/SceneGIS/GlobeEnvironmentUpgradeChecklist.md`
- current A8-G `AgentDocs/**` records

No `packages/engine/Source/**`, Shader, public API, upstream-owned, generated or
asset path is expected to change. If a concrete qualification failure requires
one, Execution stops and returns the finding before editing.

## Minimal sufficient validation

Run sequentially; shared `Build/**` output must not be mutated concurrently.

1. Existing focused Specs:
   - `SceneGIS/Scene/SceneGISEnvironmentEffects`
   - `SceneGIS/Scene/_private/SceneGISEnvironmentEffectsPipeline`
   - `SceneGIS/Scene/_private/SceneGISAtmosphereReferenceFrame`
   - `SceneGIS/Scene/SceneGISAdvancedEnvironmentRenderSlot`
   - `Scene/GlobeSurfaceTileProvider`
2. The six build/type/docs/package/audit commands listed above.
3. `npm run test-e2e -- Specs/e2e/scenegis-globe-environment.spec.js`.
4. `npm run test-e2e-release -- Specs/e2e/scenegis-globe-environment.spec.js`.
5. Focused ESLint/Prettier/Markdownlint and `git diff --check` for changed
   scope.
6. One direct project-owner pass through the six fixed Globe observations.

Do not run full Jasmine, full E2E, all browsers, repeated build matrices, FPS
gates, replay/hash comparisons or extra generator tests once these direct
authorities pass.

## Acceptance criteria

- Development and release builds, types, API docs and installed packages expose
  the same accepted public Globe API and load all deterministic assets.
- The focused dev/release E2E is local, deterministic and free of page/console
  errors, with exact lifecycle cleanup.
- Resource counts, byte formulas, quality tiers and SGP path sets match the
  frozen A4-A7 contracts without growth.
- The three release Test entries are clear, use local `lil-gui`, avoid historical
  evidence clutter and retain correct ownership cleanup.
- The project owner accepts the bounded Globe visual matrix.
- Architecture review has no open finding and creates the isolated local A8-G
  checkpoint. Only then may Architecture source-discover the Planar track.

## Stop conditions

Stop and return to Architecture if qualification reveals a product/rendering
defect, requires an upstream/generated path edit, changes a public/runtime
contract, grows resource topology, makes a network dependency mandatory or
would activate Planar product calibration. Do not work around such a finding in
Test, E2E, package scripts or documentation.
