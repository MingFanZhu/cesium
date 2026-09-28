# FidelityFX reference attribution

SceneGIS hierarchical SSR traversal and virtual-image reprojection adapt
AMD FidelityFX SDK v1.1.4, commit `c6efa6bf7f2027b3ec94f28578bb5965eabb9e55`:

- Repository: <https://github.com/GPUOpen-LibrariesAndSDKs/FidelityFX-SDK>
- Source: `sdk/include/FidelityFX/gpu/sssr/ffx_sssr_intersect.h`
- Source: `sdk/include/FidelityFX/gpu/denoiser/ffx_denoiser_reflections_reproject.h`
- License: [MIT notice](FidelityFX-LICENSE.txt),
  Copyright (C) 2024 Advanced Micro Devices, Inc.

Adaptations use WebGL2 fragment passes, separate depth levels, deterministic rays,
camera-only reprojection and reduced-resolution history. They are not the full FidelityFX
implementation and do not use its compute/wave/indirect-dispatch interfaces.
