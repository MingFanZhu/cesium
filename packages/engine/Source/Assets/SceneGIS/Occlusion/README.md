# Directional occlusion references

Small analytic routines are adapted in SceneGIS GLSL; no reference renderer
is bundled.

- Intel XeGTAO, `a5b1686c7ea37788eeb3576b5be47f7c03db532c`,
  `Source/Rendering/Shaders/XeGTAO.hlsli`, Algorithm 2 visibility moment.
  Copyright (C) 2016-2021, Intel Corporation. See `XeGTAO-LICENSE.txt` (MIT).
  <https://github.com/GameTechDev/XeGTAO>
- Google Filament, `6fb6c921a46dca9edbcbb2594bd196a8b593721a`,
  `shaders/src/surface_ambient_occlusion.fs`, spherical cap overlap and
  specular cone.
  See `Filament-LICENSE.txt` (Apache-2.0).
  <https://github.com/google/filament>

SceneGIS changes (2026): adapt moments to the existing eye-space slice basis;
retain geometric bilateral guidance, separate scalar diffuse and directional
specular visibility, convert Cesium perceptual roughness to alpha, preserve open
apertures, use current-frame deferred depth and native base/coat SSR
composition.
Original research: Jimenez et al., Practical Real-Time Strategies for Accurate
Indirect Occlusion; Oat and Sander, Ambient Aperture Lighting.

These text notices are copied with the normal engine Assets build. No runtime
asset fetch, new binary data, compute shader dependency or temporal history.
