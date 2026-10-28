# ADR-0102: Programmable GPU particle foundation

- Status: accepted; date: 2026-09-29
- Plan: [P1](../../../AgentDocs/gpu-particles/plans/2026-09-29-p1-foundation.md)
- Upstream files/SGP: none; native ParticleSystem remains independent
- Qualification: [approved P1 review](../../../AgentDocs/gpu-particles/reviews/2026-09-29-p1-foundation.md)

## Context and decision

Cesium 1.144 simulates native particles on CPU and renders BillboardCollection. Existing Renderer already supports WebGL2 floating MRT, vertex texture fetch and instanced quads. Native ComputeEngine is a single-target render-to-texture abstraction, not a compute shader backend. Use persistent owned native Framebuffer/DrawCommand resources for simulation; do not add raw WebGL or Transform Feedback hooks.

Expose SceneGISGpuParticleSystem as a local-meter primitive. Simulation is abstract: caller GLSL initializeParticle and updateParticle functions manipulate a documented SceneGISParticle structure; wind, gravity and emitter geometry are shader examples, not core properties. Optional uniformMap functions bind uniforms declared by the caller shader. Sources and callback-map keys are immutable; values may change. No JS per-particle callback or CPU readback.

Fixed-capacity state uses four RGBA32F attachments in each of two buffers. Age/seed are core-owned; position, velocity, life, color, size and rotation are shader-controlled. Circular scheduled births overwrite oldest slots at saturation, avoiding an unsupported GPU append/free-list promise in WebGL2. Normal Scene time drives one update; hidden/paused periods observed by update do not catch up. Clock rewind/reset clears the state, while forward deltaTime is passed exactly to the shader. Rendering reuses outputs for the same time and picking never advances them.

Caller supplies a conservative local boundingSphere including sprite size and a rigid modelMatrix; local particles move with that matrix. Both worlds use the same contract (Globe ENU, Planar Cartesian). One instanced translucent quad command uses native depth, HDR conversion, OIT and system picking. Image input is an optional decoded image/canvas/bitmap, uploaded and owned by the primitive; default shape is a soft disc. Particle state is private, not a public readback API.

## Alternatives and limits

Transform Feedback would require new renderer state/program seams; WebGPU would require a new backend. Neither is justified for the initial independent-particle workload. Analytic stateless weather and shelter/collision maps may be evaluated in the later weather phase. GPU simulation still costs bandwidth and translucent pixel overdraw. No exact per-particle sorting, physical lighting/shadows, object motion vectors, per-particle picking or weather surface effects are promised.

## Build, lifecycle and validation

Use existing ADR-0030 GLSL conversion and generated exports/types. Only owned source, shaders, Specs, docs and Test examples change. Constructor is allocation-free; first normal update validates WebGL2/float MRT, creates persistent targets/programs/quad/image/pick resources, and cleans candidates on failure. PrimitiveCollection owns removal/destruction; Context is borrowed. Reset reuses resources. Numeric GPU readback exists only in Specs, covering user-function execution, scheduling, temporal controls, both-world rendering/occlusion/pick and ownership. Qualify release/types and bounded comparative timing before handoff.

## Design references

- [AMD GPU Particles](https://github.com/GPUOpen-LibrariesAndSDKs/GPUParticles11): GPU-resident simulation and billboard design. DirectX 11 compute, sorting and collision implementation are not copied or claimed available in WebGL2.
- [NVIDIA GPU Gems 3, Chapter 23](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles): particle overdraw/fill-rate tradeoffs. Low-resolution rendering is not introduced for sharp sprites without measurement.

Implementation is independently written using existing Cesium renderer interfaces; no vendor source/asset is imported.

## P2 amendment: initial fill and draw-local styling

[ADR-0103](ADR-0103-aerial-weather.md) adds optional immutable initialParticles and renderShader. Reset/rewind fills initialParticles instead of always clearing; zero retains P1 behavior. Initial slots start at age zero, and the emission cursor/seed continue after them. The render function styleParticle operates on a vertex-local copy with the same uniformMap; it never changes persistent state. Bounds must include styling. This generic hook supports view-dependent presentation under frozen simulation and contains no weather behavior.

## Urban wind amendment: external simulation clock

[W5](../../../AgentDocs/urban-wind/plans/2026-10-28-w5-particles.md) adds optional immutable
`timeSource(): number`, returning absolute simulation seconds. Default Scene JulianDate arithmetic
is preserved, including precision. External equal values freeze GPU state, rewind resets, and
observed hidden/paused frames consume external time without catching up. Pick never invokes the
callback or advances state. Values must be finite; no implicit dt clamp or force is introduced.
The wind adapter reads completed simulationTime and generation from its public GPU descriptor.
Generic particles do not know about wind, LBM or concentration. Upstream files / SGP: none.
