# ADR-0194: Optional homogeneous water-medium optics

- Date: 2026-10-28; status: implemented, owner visual acceptance pending.
- Phase: [R31](../../../AgentDocs/rendering-quality/plans/2026-10-28-r31-water-optics.md).
- Predecessors: ADR-0087, ADR-0101, ADR-0179, ADR-0180.
- Upstream integration: SGP-0017, unchanged.

## Context and decision

WaterSurface already owns single-layer composition after opaque lighting. Preserve
its HDR inputs, Fresnel/GGX, reflection tracing and geometry. A replacement renderer
or a global color adjustment would not address missing medium parameters.

Add optional `scattering: Cartesian3` with nonnegative finite RGB coefficients in
inverse meters, and `scatteringAnisotropy` in [-0.9, 0.9], default 0. Both are mutable
uniforms. Constructor coefficients are copied. Undefined scattering preserves the
legacy waterColor model; defined scattering selects coefficient optics and ignores
waterColor. Zero scattering means absorption only, not legacy mode. RiverSurface
forwards the same properties. Invalid updates fail before GPU publication.

Use extinction sigmaT = absorption + scattering. The accepted screen-space bottom
sample supplies both its lit color and the geometric water-to-bottom distance;
rejected samples restore both. No opaque bottom means an optically deep medium,
not a fabricated finite bottom. Contact foam keeps the unperturbed depth.

For the new model integrate single scattering in a locally planar homogeneous
slab analytically. The direct source uses normalized Henyey-Greenstein scattering;
positive g is forward along light travel. The sky is an isotropic upper-hemisphere
radiance approximation with a mean downward cosine of 2/3. Both incident sources
attenuate with depth; the view path attenuates with distance. Use the existing
physical beam and sky source units. Captured bottom color is attenuated once and
never relit. The outgoing interface retains existing Fresnel weighting.

This is a bounded real-time approximation: uniform medium, single scattering,
screen-space refraction, local slab lighting for curved water. It does not solve
multiple scattering, volumetric geometry shadows, water-bottom illumination,
recursive refraction, submerged camera rendering or bathymetric light transport.
Missing opaque depth retains the existing semi-infinite-water interpretation.

## References and ownership

- [Epic Single Layer Water](https://dev.epicgames.com/documentation/unreal-engine/single-layer-water-shading-model-in-unreal-engine): separate absorption, scattering and phase controls on an opaque scene capture.
- [PBRT phase functions](https://pbr-book.org/4ed/Volume_Scattering/Phase_Functions): normalized HG and direction conventions.

Independently written GLSL; no engine implementation is copied. Existing water
Shader source compilation, public barrel/type generation and native tests apply.
No additional texture, draw, capture, runtime readback or resource owner. Legacy
Fluid optical helpers remain unchanged. New presets are example configurations,
not measurements of a named water body or engine-wide default changes.

## Validation

Compare GPU transport to independent numerical integration, including zero and
deep limits and phase orientation. Exercise both-world live mutation, refraction
depth steps, existing water/river/curved geometry and destruction. Record actual
visual and timing evidence in the phase review; build development/release and types.

Implementation evidence: [R31 review](../../../AgentDocs/rendering-quality/reviews/2026-10-28-r31-water-optics.md).
