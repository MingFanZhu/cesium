# ADR-0056: Planar Moonlight Authority

- Status: Accepted
- Date: 2026-09-12
- Related: ADR-0039, ADR-0053, ADR-0054, ADR-0055
- Upstream changes / SGP: none

## Context

Planar provides metric fixed-Z atmosphere and effective Sun/Moon directions,
but its advanced directional lighting remained Sun-only. It supports arbitrary
projected/custom coordinates and cannot infer lunar phase from world XY.

## Decision

Share Globe primary-light radiometry: Sun twilight from -6 to -12 degrees,
Moon horizon fade from 0 to 3 degrees, Lambert phase and full-phase readable
irradiance RGB (0.12, 0.16, 0.22). Planar phase angle is the arccosine of the
negative dot product of its effective Sun/Moon unit directions. This is the
directional approximation; no inferred latitude, ECEF or artificial sphere.
Existing `showMoonlight` and `moonlightIntensity` apply to both world types.

A single primary direction and RGB energy scale drive clouds, Beer shadows,
surface/model direct light and directional fog/haze. Physical sky LUTs and
ambient night remain functions of the actual Sun. Daylight preserves the
configured Planar Sun color/intensity. Moon illumination is a readable rendering
calibration, not an absolute photometric claim.

The advanced renderer lends a private owner/state pair to Planar Environment.
That Environment remains sole owner of its stable native DirectionalLight;
releasing advanced lighting restores its configured Sun and disconnecting the
Environment restores the captured caller light. No prototype mutation or second
light owner. Temporal histories include primary direction and energy.

## Consequences and boundaries

No new public control, render pass or GPU resource is introduced. Existing
cloud-shadow and volumetric-light flags remain independent. Planar native
geometry shadows remain unsupported under ADR-0039; this decision does not
change the Cesium shadow switch or its qualification guard. Rendering a detailed
Moon disc and ground bounce remain separate work.

Implementation and verification are tracked by
[P11](../../../AgentDocs/atmosphere-clouds-effects/plans/2026-09-12-phase-p11-planar-moonlight.md).

## 2026-09-18 amendment: planar geometry shadows

[ADR-0083](ADR-0083-planar-cascaded-shadows.md) supersedes the planar geometry-shadow exclusion
and disabled-shadow guard in this decision. It retains native switches and adds fixed-Z stable
cascades through SGP-0013. Other qualification and physical-lighting boundaries are unchanged.
