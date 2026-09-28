# R19 Technical Review: Geometric Specular Antialiasing

- Target: R19 API, model binding, shader, attribution, Specs and examples
- Architecture reviewer / execution owner: Current task, source-based self-review
- Date: `2026-09-28`; status: `completed`; technical gate: `confirmed`
- Plan: [R19](../plans/2026-09-28-r19-specular-antialiasing.md)
- Decision: ADR-0098; upstream patch: SGP-0025
- Owner visual acceptance: pending; no following phase active

## Findings and disposition

- **Fixed / integration:** place filtering after native/CustomShader material and
  before lighting, so direct, IBL and both SSR lobes agree. A real Model with
  CustomShader verifies direct pixels and base/clearcoat MRT roughness; disabling
  restores pixels without rebuilding native draw commands.
- **Fixed / test fixtures:** native incremental texture completion schedules a
  command rebuild after the first ready frame; native IBL map readiness precedes
  its shader publication. Assertions now wait for those explicit states, not an
  arbitrary frame delay. Raw glTF examples also need unique resource identities;
  individual Blob URLs prevent native cache aliasing and are revoked after load.
- **Accepted / visual scope:** geometric filtering broadens narrow highlights.
  Flat mirrors retain authored roughness; perturbed shading normals, unlit and
  missing-normal paths stay unchanged. Normal-map variance, silhouettes and
  alpha coverage remain outside this algorithm. TAA remains recommended.

## Implementation and ownership

Pinned Three.js r180 commit `0af9729d0c143a86a1d725d6e2c3ad83301f3f34`, MIT,
is recorded in a shipped JSON reference manifest with its license notice.
Use the maximum absolute geometry-normal derivative component for both lobes;
omit Three's PMREM-specific fixed roughness floor. The owned implementation uses
one live uniform, no sampler, target, pass, extra draw or history. Scene publishes
the setting and destroys its attached owner; toggles request rendering.

The following upstream-owned files are the complete R19 change set, all SGP-0025:

- `packages/engine/Source/Scene/Scene.js`: frame setting and destruction.
- `packages/engine/Source/Scene/Model/LightingPipelineStage.js`: owned binding.
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`: prototype and call.
- `packages/engine/Specs/Scene/Model/LightingPipelineStageSpec.js`: binding contract.

No generated artifact or upstream build/asset code is changed. Existing automatic
shader generation and static asset copying deliver the shader and attribution.

## Validation

- Twenty focused dev Specs pass: eight new feature cases, nine existing normal
  mapping regressions and three native lighting pipeline cases. Feature cases
  cover constructor/lifecycle, invalid input, flat preservation, curved-normal
  broadening, upper bound, unlit/missing normals and real CustomShader/direct/SSR.
- All eight new Specs pass against release. Full release build, declaration
  generation and TypeScript check pass. Existing JSDoc warnings remain unrelated.
- Two Chromium E2E cases pass for Planar and Globe: switches, TAA, actual four
  MSAA samples, wheel navigation, stable command count and Scene destruction.
- Scoped ESLint/formatting and patch audit are checked. The mandated global
  AgentDocs Prettier check reports existing formatting debt in historical docs;
  changed phase/index/review/roadmap files are formatted. No mass cleanup.
- Independent fixture and Bistro browser views are inspected. Original Bistro
  tab, camera and render settings remain untouched; comparisons use a temporary
  copy at the same fixed street view. A separate both-world example and Bistro
  experimental switch expose the effect for owner acceptance.

## Bounded GPU evidence

Windows Chromium 153, NVIDIA RTX 3060 Ti, ANGLE D3D11, 1185 x 667. Bistro uses the
same street camera, physical atmosphere, shadows, AO, SSR and TAA. Disjoint GPU
timer queries bracket normal Scene rendering; alternate enabled/disabled blocks,
discard timing warm-up and collect 60 valid frames for each state.

| State    | GPU frame median | Submitted commands |
| -------- | ---------------: | -----------------: |
| Disabled |       12.0105 ms |               1591 |
| Enabled  |       12.0136 ms |               1591 |

The difference is below meaningful measurement precision for this scene. No
whole-frame speedup is claimed. Auxiliary GPU storage and geometry submission
do not increase. One material uniform and derivative/arithmetic work are added.

## Remaining risk and next action

Owner should compare the new fixture and Bistro with the switch at the same
camera. Thin curved highlights become wider and steadier; facade outline/texture
aliasing remains. Manual local probes and diffuse GI remain outside this phase.
