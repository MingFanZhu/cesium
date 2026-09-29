# ADR-0105: Surface rain ripples and lens droplets

- Status: accepted; date: 2026-09-29
- Parent: ADR-0103 / ADR-0104; [P4 plan](../../../AgentDocs/gpu-particles/plans/2026-09-29-p4-rain-details.md)
- Upstream-owned files / SGP: none; existing SGP-0028 seams remain unchanged

## Decision

Extend SceneGISSurfaceWeather with independent rippleIntensity (default zero) and rippleScale in meters. Scene-time analytic rings perturb the existing wet material normal before lighting, specular filtering and SSR material capture. Terrain perturbs only its existing wet directional highlight. Wetness, upward slope, snow exclusion and pixel-footprint filtering bound the response. Camera origin is reduced in double precision; dominant world-axis projection is corrected for the local tangent metric. No simulation texture, displacement, geometry replay, depth capture or water-surface receiver is added.

SceneGISRainLensStage extends native PostProcessStage and is added explicitly to scene.postProcessStages. It borrows a Scene for simulation time, defaults disabled, and exposes intensity, dropletSize (pixels) and distortion (pixels). A single post-tone-map color pass analytically draws stationary beads and falling droplets/trails using local refraction/softening. It preserves original alpha, needs no depth, history or external asset, and inherits native framebuffer/program lifecycle. The caller must add it to the supplied Scene's collection; the collection normally owns destruction. Camera/clock/weather/environment are not modified by either effect.

Examples link both intensities to actual rain and offer independent toggles; snow/clear zero them. Generic particle shaders and explicit water remain unchanged. No shelter, drainage, water depth, real lens fluid or physical precipitation measurement is claimed. Projected world-axis boundaries and far-distance fading are accepted approximations for GIS.

## Alternatives and qualification

Post-lighting surface ripples would not affect material reflections consistently; adding them before existing forward lighting reuses the correct normal path. A ripple simulation, rain collision buffer or lens fluid solver is not justified for this visual scope. Lens distortion is a display-space camera effect, so native ordinary postprocessing is sufficient without a new HDR pipeline seam.

Public exports/types and GLSL follow ADR-0030. Verify wet/dry/snow/wall eligibility, clock/coordinate stability, SSR agreement, native lens removal/destruction, one extra lens pass and zero additional ripple resources. Qualify development/release shaders, public types, dedicated local examples and bounded GPU timing. Native PostProcessStage lifecycle/order and SurfaceWeather material order are the upgrade checks.

## 2026-09-29 lens texture amendment

Owner feedback replaces the analytic lens-circle appearance with a packaged static sprite from SardineFish/raindrop-fx, fixed revision bae4081bc15815bb094ea040a976dca083bbc3a5. Its unchanged 256×256 RGBA8 PNG encodes refraction direction in RG and height in alpha; MIT license/provenance accompany it under Assets/SceneGIS/Weather/RainLens. Native PostProcessStage image uniforms load via buildModuleUrl only when enabled and own GPU lifetime. This adds one 256 KiB sampled texture, no extra render target/pass or public setting. Rain positions, size variation and time remain shader-controlled; ground ripples stay analytic. This supersedes the initial lens no-texture statement, not the surface contract.

The owner subsequently selected the RaindropsOnGlass static/rolling-bead appearance as a visual reference, with an explicit low-cost constraint. SceneGIS independently adds a smooth cap normal (RG is not a surface normal), subtle lower-meniscus attenuation, and one visible-color lookup as an approximate wide-field reflection. The fixed bright glint was rejected during preview and is removed; no synthetic light is added. This is an artistic camera effect with screen-content dependence, not physical environment capture or fluid simulation. Static/rolling beads and small trails remain in the same pass. Sprite rectangle rejection uses explicit LOD and pixel-width coverage, avoiding derivatives in divergent control flow. No proprietary reference material/code is imported. The fixed resource/pass budget remains unchanged.

Native collection removal clears the stage texture cache before destruction; native image-uniform cleanup then skips the owned sprite. The subclass explicitly releases/deletes its sprite before delegating to native destroy. Disable/re-enable still uses the native loader. Upgrade checks cover this narrow ownership dependency with GPU Specs; no upstream file changes.
