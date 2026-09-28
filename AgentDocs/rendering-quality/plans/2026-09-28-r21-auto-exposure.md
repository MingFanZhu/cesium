# R21: Global Auto Exposure

- Type: `phase`; status: `completed`; date: `2026-09-28`
- Architecture / execution owner: Current task; architecture review: `confirmed`
- Parent: [roadmap](2026-09-18-rendering-quality-extension.md)
- Decision: ADR-0100; seam: SGP-0027; open discussions: none
- Previous checkpoint: `2bd5a2598f`; R20 example visually accepted by owner

## Scope and source facts

Add optional global eye adaptation, shared by Globe and Planar. Local exposure,
physical camera calibration, pre-exposure and lighting changes are excluded.
Native PostProcessStageCollection already supports an AUTO_EXPOSURE divisor in
all tone mappers, but its disabled private reducer uses untrimmed arithmetic
luminance and frame-dependent adaptation. Reuse the tone-mapping interface;
keep the native manual path and exposure value intact when disabled.

## Design

SceneGISAutoExposure is explicitly attached to one Scene and owned by its post
process collection. Default disabled. Public controls: enabled, locked,
exposureCompensation (stops), minimumExposure/maximumExposure (linear gains),
speedUp/speedDown (stops per second), lowPercent/highPercent (CDF fractions),
centerWeight, ready and reset(). Native exposure remains an additional positive
multiplier. Lock freezes metered gain; compensation still applies.

Meter pre-exposure HDR before native bloom/tone mapping. Advanced atmosphere
and its composition already precede this hook. Use a bounded 128-pixel long-edge
log-luminance grid, 64-bin weighted histogram with percentile clipping, and a
1x1 ping-pong exposure target. Four tiny GPU passes; no geometry replay, CPU
readback or full-resolution target. Use original WebGL2 shaders informed by the
published UE eye-adaptation design, without copying engine source.

Adapt log2 gain with linear travel outside 1.5 stops and exponential convergence
inside, using actual elapsed wall time. First frame/reset meters immediately.
Do not request hidden settling frames: request-render scenes advance only on
application-rendered frames. Camera cuts/loading can explicitly reset history.
Require HDR/WebGL2/float render targets; never silently substitute manual mode.
Disable and destruction release owned targets and commands.

## Implementation and verification

1. Register plan, ADR and SGP; implement API, small GPU targets and native seams.
2. GPU Specs cover metering/outlier rejection, center weights, adaptation and
   frame-rate invariance, limits/compensation/manual multiplier, lock/reset,
   lifecycle/resize, tone-mapping integration and unsupported configurations.
3. Independent bright/dark example and Bistro controls, both worlds. Preserve
   existing user tabs, camera and settings. Check example behavior in isolated tabs.
4. Focused tone-mapping/TAA regressions, full release/types, patch audit and
   actual GPU cost/target budget. Source review and independent local checkpoint.

## Risks and exit

Global metering cannot simultaneously recover a very dark alley and a bright
sky. Sky still contributes according to its weighted coverage; percentile and
center weighting reduce isolated outliers rather than identify semantics.
Exposure is relative, not calibrated EV100, and cannot recover clipped HDR.
Owner visual acceptance remains separate from technical tests.

## Completion and handoff

Implementation and [technical review](../reviews/2026-09-28-r21-auto-exposure.md) are complete. Eleven feature GPU cases pass in development/release, with 52 existing regressions and two E2E cases. Release/types and patch audit pass. Bistro preserves manual default exposure; the independent example starts automatic. Isolated metering/adaptation cost is 0.0512 ms median on the measured desktop GPU; owner visual review is pending. No next phase is active.
