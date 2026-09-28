# ADR-0100: Global histogram auto exposure

- Status: Accepted
- Date: 2026-09-28
- Phase: rendering-quality R21
- Upstream seam: SGP-0027

## Context

GIS street scenes span bright outdoor views and shaded passages. Existing manual
exposure cannot adapt across them. Native AutoExposure is disabled and uses a
frame-dependent arithmetic average. All native tone mappers already accept a
GPU texture divisor, so adaptation does not require another color pass.

## Decision

Implement SceneGISAutoExposure as an optional, Scene-owned controller. It exposes
relative gain limits, compensation in stops, separate bright/dark adaptation
speeds, weighted histogram percentiles, center weighting, lock and reset.
Defaults do not change Cesium rendering. The public native exposure multiplier
remains caller-owned and combines with the automatic gain.

Use original WebGL2 GPU reductions: bounded log-luminance samples, 64-bin row
histograms, histogram reduction and 1x1 temporal adaptation. Floating-point
intermediates retain weighted counts and luminance. Percentile trimming uses
partial bins and their measured mean log luminance. Adapt in stops with a
continuous linear/exponential response and elapsed wall time. Compensation
applies after adaptation. Locked gain remains adjustable by compensation.

PostProcessStageCollection is the only upstream-owned integration point: owned
resource preparation, tone-mapper divisor selection, pre-bloom metering and
destruction. Rebuild the tone-mapping shader only on active-state changes;
changing native tone mapper while active preserves the source. Metering never
reads previously exposed output. No full-size buffer, geometry pass or CPU
readback is introduced. Disable releases resources and restores native manual
processing on the next collection update, without changing its exposure value.

Require HDR, WebGL2 and float render targets. Globe and Planar use the same
screen-space algorithm. Request-render mode does not acquire an autonomous
animation loop; the application owns rendering cadence. reset() explicitly
handles camera cuts or content replacement. No pre-exposure, EV100 calibration,
local exposure, dynamic quality selection or speculative fallback is included.

## Reference and consequences

[Unreal Engine auto exposure documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/auto-exposure-in-unreal-engine)
describes 64-bin histogram metering, middle gray, percentile selection, center
weighting and linear/exponential adaptation with separate speeds. This design
uses those published concepts, not UE source code or assets.

Metering reflects visible HDR including earlier atmosphere composition, and
excludes the subsequent native bloom pass. Global gain cannot replace local
contrast control or improve missing lighting. The bounded grid approximates
subpixel highlights. Parameters are relative to Scene radiance; they are not
physical camera settings. SGP-0027 can retire when native post processing offers
an equivalent explicit metering/controller interface.
