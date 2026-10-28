# ADR-0195: Persistent FFT whitecaps and editable optical colors

- Status: accepted, 2026-10-28.
- Related: ADR-0101, ADR-0194; existing SGP-0017 unchanged.

`SceneGISWindWaves.foamHalfLife` is mutable, measured in simulation seconds,
defaults to 2 and accepts [0, 30]. Zero selects instantaneous Jacobian coverage.
Foam uses maximum injection and exponential decay, advected at 3% of local wind
speed. This is an appearance model, not a mass-conserving foam solver. Only base
and long bands generate whitecaps; the fine ripple band still affects normals.
History resets on rewind, time-scale change or wave configuration change. A
forward time jump ages history by the full elapsed interval. Pause executes no
additional FFT work. Half-life changes are applied on the next update without
regenerating the spectrum.

Each band owns one additional RGBA16F normal/history texture. Two framebuffers
share displacement without sharing ownership. Finalize reads the previous normal
and writes the next; consumers keep using normal alpha. No additional GPU pass,
per-frame CPU readback or surface sampler is required. At resolution 128, three
extra mipmapped textures cost approximately 0.5 MiB.

The example exposes sRGB transmission/scattering colors. Transmission color is
the unscattered absorption transmittance at a reference distance; absorption is
`-log(linearColor) / distance`. Scattering color times concentration gives RGB
scattering coefficients. Black transmission is clamped to 1e-4 for a finite
opaque appearance. These controls do not represent final pixel color or alpha:
lighting, path length, reflection and scattering still determine the image.
Presets fill editable controls, with legacy waterColor available independently.

Shore foam still uses opaque screen depth. Stable bathymetry, breaking-wave
transport and submerged transparency remain separate capabilities.
