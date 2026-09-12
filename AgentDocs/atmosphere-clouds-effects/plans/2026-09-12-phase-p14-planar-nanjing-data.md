# P14 Planar Nanjing Public Data Sample

## Metadata

- Type: `phase`; status: `completed`; created: `2026-09-12`
- Owner: current Architecture / Execution role; design review: `confirmed`
- Parent: [extension](2026-08-14-atmosphere-clouds-effects-extension.md)
- Predecessor: P13 `301916e4a5`
- Upstream-owned files / SGP delta: none

## Scope and source facts

The owner explicitly requests default public EPSG:3857 imagery and terrain,
an initial view of Nanjing Zijin Mountain, and Nanjing's atmospheric reference.
Reuse the existing planar URL-template imagery and LERC heightmap providers,
with the resolved World's canonical tiling scheme. Service metadata confirms
Esri World Imagery and WorldElevation3D/Terrain3D use 102100/3857, XYZ addressing;
terrain levels 0–16 and global heights -450 to 8700 m. Existing Planar examples
use its 257-by-257 boundary-sampled LERC tiles. No new provider implementation.

Use an explicit WGS84 mountain reference near 118.8406°E / 32.0725°N, projected
to metric Web Mercator only by the sample's camera setup. Astronomical reference
uses those angles directly. Start below the cloud base with a mountain-facing
view; cloud/high-altitude presets remain centered on this area. Existing isolated
model diagnostics remain available. Shift day/evening/night and the timeline
day to Beijing time while retaining native UTC timeline labels and help text.
Use sample surface radiance scale 1: the previous high diagnostic scale visibly
overexposes actual satellite imagery, while scale 1 preserves terrain texture.

Public requests are best effort, with visible status, provider attribution and
the existing base-color/flat local fallback. Provider errors are not render
errors and do not prevent environment or Clock startup. Remove owned error
listeners before Viewer destruction; the providers expose no destroy method.

## Verification and exit

- Extend the existing deterministic E2E: default providers/tiling identity,
  projected camera/reference, Beijing preset lighting, blocked-network fallback,
  preserved Clock semantics and provider-listener cleanup.
- On the live page verify actual imagery and decoded non-flat terrain at Zijin
  Mountain, source credits, camera composition and empty render errors.
- Scoped lint/format, mandatory document checks and ownership audit; self-review
  and independent local checkpoint. No engine/API/shader/build change or push.

## Completion

The sample uses the existing public provider adapters at levels 0–16 with
on-screen Esri attribution. The initial camera is 3500 m south of the projected
mountain point at Z=1200 m, looking toward Z=430 m. Astronomical reference uses
118.8406°E / 32.0725°N; presets are 10:30, 18:45 and 21:00 Beijing time.
The cloud/high-altitude views remain over Nanjing; isolated model diagnostics
retain their original coordinates. Surface radiance is explicitly initialized
to 1 after live comparison showed the former high value washed out imagery.

The extended deterministic E2E passes in 26.5 s with public requests blocked:
provider type/canonical tiling, Nanjing camera/reference, failure status without
render errors, local-day/night lighting, clock controls, unchanged camera and
zero tick/provider listeners after repeated destroy. Existing decoder/terrain
qualification is reused. Live public loading reaches tilesLoaded with no provider
or render failure; the mountain reference returns approximately 439.82 m and the
image visibly shows the wooded ridge and surrounding Nanjing urban area.

Scoped lint/format and ownership checks pass; full AgentDocs Markdown lint
passes and full Prettier retains the same 16 unrelated baseline warnings.
See the [accepted review](../reviews/2026-09-12-p14-planar-nanjing-data.md).
The containing commit is the independent local checkpoint; no push.
