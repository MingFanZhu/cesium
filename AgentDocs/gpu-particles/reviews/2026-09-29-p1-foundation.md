# P1 review: Programmable GPU particles

## Metadata

- Status: approved; created/updated: 2026-09-29
- Reviewer: current task, architecture/code self-review; no independent reviewer
- Target: codex/gpu-particles changes after 8573092c89
- Parent: [P1](../plans/2026-09-29-p1-foundation.md); [ADR-0102](../../../Documentation/SceneGIS/Decisions/ADR-0102-gpu-particle-foundation.md)
- Upstream-owned files: none; SGP: none

## Scope and conclusion

Generic user GLSL initialization/update, circular birth schedule, persistent float MRT state, instanced transparent quads, both-world placement, lifecycle, public types and independent example. Architecture gate approves the P1 local checkpoint; project-owner visual acceptance remains pending. Weather stays a candidate phase.

Core does not integrate velocity or apply forces. Position, velocity, color, size, rotation and life are caller-controlled state; age/seed and slot scheduling belong to the engine. Four native float MRT attachments and two persistent targets avoid native ComputeEngine's per-execute framebuffer and single-target limitation without introducing renderer hooks. Numeric readback occurs in tests only. Collection removal releases owned resources; optional image upload is owned and source/uniform resources are borrowed.

## Findings

| ID    | Severity | Status   | Owner        | Finding                                                                      | Evidence and disposition                                                                                                             |
| ----- | -------- | -------- | ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| P1-01 | medium   | fixed    | execution    | Adding float seed offset near 2^24 loses odd integers before modulo.         | Use uint addition and mask before conversion; capacity rollover Spec uses seed 16777215 and verifies distinct successive GPU seeds.  |
| P1-02 | low      | fixed    | execution    | Inline multi-tag JSDoc is not a reliable public declaration source.          | Expand property tags; generated declaration contains required shader/bounds, read-only keys and lifecycle methods; buildTs/tsc pass. |
| P1-03 | note     | accepted | architecture | GPU-resident state still has fixed-capacity and transparent fill-rate costs. | Capacity is explicit, bytes are observable, no implicit sorting/low-resolution rendering or automatic capacity growth is claimed.    |

## Validation reviewed

- Ten focused Specs pass in development and release, Chrome Headless 154 on Windows, with WebGL validation. They cover exact custom integration, an empty update with nonzero velocity, dynamic uniforms, subframe births/overflow/seed wrap, fractional emission, reset/rewind/freeze/pick, paused/hidden time, resource reuse/destruction, invalid shader candidate cleanup and unsupported context rejection.
- The same Specs render and pick particles in Globe ENU and large Planar coordinates, check opaque depth occlusion and borrowed image ownership. One readonly particle-state readback helper exists only in Specs.
- Both browser examples render without console errors. Preset change replaces the primitive; pause is exercised; fountain/orbit/volume use distinct caller shaders. The Globe example uses the same API and controls. Browser benchmark changes were discarded by reloading the example.
- Full buildRelease, buildTs, tsc, focused ESLint/Prettier and changed Markdown checks pass. buildTs emits existing upstream documentation warnings; none names SceneGISGpuParticleSystem.
- Official 1.144 baseline comparison finds zero changed upstream-owned paths; no generated files are tracked in this change.

## Bounded timing evidence

Local Windows / Codex Chromium / ANGLE D3D11 / NVIDIA RTX 3060 Ti, 1185×667, MSAA 1, FXAA, native OIT. Same fixed view, opaque floor and two boxes. Native and GPU cases use 32,768 live 0.15-meter white sprites tinted cyan at alpha 0.5, a 40×40-meter grid, upward unit velocity and 100-second life. Native ParticleBurst creates the exact count; GPU circular emission fills exactly one capacity, then both stop emission. The native CPU case retains native billboard rendering; this is a system comparison, not an isolated arithmetic benchmark or pixel-identical image test.

After 15 warmup frames, record 40 manual Scene.initializeFrame/render calls advancing 1/60 second. CPU timing surrounds the frame; EXT_disjoint_timer_query_webgl2 surrounds submitted GPU work, with asynchronous availability polling and invalid disjoint samples excluded. Query intervals may include GPU idle time waiting for CPU submission, so they are not isolated shader execution durations. Use task yields instead of animation-frame cadence; background in-app tab RAF throttling made the first attempt unsuitable. No universal FPS inference is made.

| Case                    | CPU frame median / p95 (ms) | GPU elapsed median / p95 (ms) | Simulation texture memory          |
| ----------------------- | --------------------------- | ----------------------------- | ---------------------------------- |
| Native CPU, 32,768 live | 6.5 / 8.0                   | 6.65 / 9.64                   | Not the same state layout          |
| GPU, 32,768 live        | 0.3 / 0.4                   | 0.83 / 1.13                   | 4,216,576 bytes, including padding |
| GPU, 262,144 live       | 0.2 / 0.4                   | 1.24 / 1.55                   | 33,554,432 bytes                   |

CPU medians below a millisecond are subject to timer granularity; the 256K row does not imply it is cheaper than 32K. Main conclusion: CPU no longer iterates every particle; fixed pool size and sprite coverage still determine GPU cost. The diagnostic script/logs/screenshots remain ignored Build artifacts.

## Remaining limits and follow-up

Caller shaders must preserve finite attributes and conservative local bounds. No GPU append/free list, per-particle sorting/picking, collision, lighting/shadows, arbitrary mesh particles or motion vectors. WebGL2 plus float MRT is required and fails explicitly if unavailable. Large transparent sprites and TAA ghosting remain scene-dependent risks. Future weather design belongs to P2 and has not started.
