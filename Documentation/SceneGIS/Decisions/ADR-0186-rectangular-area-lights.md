# ADR-0186: Rectangular area lights

- Status: accepted; date: 2026-10-23.
- Owner: current task, architecture self-review.
- Related: ADR-0090, ADR-0157, ADR-0030; SGP: none.
- Plan: [R30](../../../AgentDocs/rendering-quality/plans/2026-10-23-r30-rect-area-light.md).

## Contract and integration

`SceneGISRectAreaLight` is a borrowed mutable descriptor in the existing
`SceneGISLightCollection`, sharing its 256-entry capacity and lifecycle. Position
uses World coordinates (ECEF or Planar meters); direction is the emission normal.
The width axis is normalize(cross(direction, up)), and the height axis is
cross(widthAxis, direction). Direction and up must be finite, nonzero and
independent; width/height/range are positive. Inputs are cloned. Live edits are
validated during rendering, and request-render callers request their next frame.

Intensity is linear HDR emitted radiance, not the point/spot irradiance-at-one-meter
scale and not a calibrated photometric unit. At fixed radiance, larger panels emit
more energy. `range` uses the same smooth center-distance fade as other local
lights, multiplied after integration. The default is one-sided; `twoSided` permits
both faces. The descriptor creates no visible geometry, local shadows or media/GI.

Use horizon-clipped polygon integration for Lambert diffuse, and Linearly
Transformed Cosines for isotropic GGX specular and clearcoat. Preserve material
specular weights, emission, directional-shadow composition, unlit handling and
existing SSIL diffuse-source recording. Phong maps shininess to GGX perceptual
roughness via `(2 / (shininess + 2)) ** 0.25`; this is an approximation. Anisotropic
materials use isotropic area-light specular. Textured emitters and anisotropic LTC
are outside this contract.

The existing four-row point/spot payload is unchanged. Active rectangles add two
axis rows plus 32 rows of LUTs, 136 KiB, to the same RGBA32UI texture. Headers move
behind these rows and use an explicit row uniform. CPU candidate bounds still use
the center-range sphere, matching the fragment cutoff exactly. The two LUTs are
bilinearly interpolated with integer texel fetches, without another sampler. LUT
upload occurs on texture allocation or reactivation after the point-only header
layout has occupied those rows; ordinary light mutation reuses storage.
No new draw pass or render target. Growth is retained until the collection becomes
inactive or is destroyed, as in ADR-0157.

## Reference, license and delivery

Reference: Heitz, Dupuy, Hill and Neubelt, _Real-Time Polygonal-Light Shading with
Linearly Transformed Cosines_, ACM TOG 35(4), SIGGRAPH 2016.
[Project](https://eheitzresearch.wordpress.com/415-2/),
[reference implementation](https://github.com/selfshadow/ltc_code).
Pinned revision: `31e5e96b54f98f33098f8503003119ba2231a1c6`.

The private `_SceneGISLtcData.js` contains the published `fit/results/ltc.js`
numeric tables, with an ES module wrapper and Float32 packing only. These are
vendored reference source data, not repository build outputs. Polygon integration
uses the published edge-integral approximation with explicit horizon clipping.
The custom BSD-style license (including paper attribution) is retained beside the
source data and in `Assets/SceneGIS/LocalLights/LICENSE.txt`, which follows the
existing asset copy/package route. On upstream fit updates, review the fit axes,
matrix layout, amplitude/Fresnel normalization and matching GPU tests together.

Runtime modules and GLSL use existing automatic build discovery, development,
release and npm Source delivery. No build generator, upstream-owned source, or new
SGP is needed. Public type/build and real GPU validation are required before the
phase checkpoint. Detailed results and remaining visual gate belong to R30 review.
