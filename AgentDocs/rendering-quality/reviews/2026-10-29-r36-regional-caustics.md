# R36 implementation and technical review

- Type: review; 2026-10-29.
- Status: technical review approved; owner visual gate pending.
- Owner / reviewer: current architecture and implementation task, source-based self-review.
- Target: [R36](../plans/2026-10-29-r36-regional-caustics.md), ADR-0201, regional
  preparation, WaterField, receiver transforms/shaders and both examples.
- Upstream-owned files: none. SGP-0017 unchanged; SDK untouched.

## Findings and disposition

| Finding                                                                                | Severity | Owner        | Disposition / evidence                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | -------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zero-height bed and camera-relative receiver XY cannot represent a curved/sloped field | P1       | execution    | Fixed. Explicit copied upright frame and original-profile maps; water and underwater share eye-to-field. Both-world render comparisons exercise actual opaque receivers.                                             |
| Coarse large field filters away small caustic structure                                | P2       | execution    | Fixed in the examples by reducing the patch to 48 m at 257 samples, about 0.1875 m spacing. No wave physics or light changes hide the sampling limit. Close captures show actual focusing. Documented grid tradeoff. |
| Earth-scale chart subtraction loses small wind displacement                            | P2       | execution    | Fixed before delivery: reduce the fixed wind origin by the same four-period cycle as water tiles before recovering displacement; river retains its original transported phase.                                       |
| One LDR pixel can quantize an actual caustic change to the same byte                   | P2       | execution    | Test corrected to compare a bounded receiver region, while independent field values and calm-unit area ratios remain directly checked. No product branch or settling frames.                                         |
| Finite regional approximation, static source and opaque-only receiver limits           | P2       | architecture | Accepted and documented in ADR-0201 and DevelopmentGuide. No implicit terrain extraction, off-screen refractive shadows, transparent submerged receivers or overlapping media.                                       |

No blocking findings remain. Source review confirms Surface owns all field maps,
targets and mesh; Underwater borrows the profile. Constant-height underwater keeps
the R34 fast path even when a field prepares a CPU domain. Existing wind ownership,
original geometry, pick scheduling and exactly-once medium composition remain.
No new full-screen target or native hook. Local descriptors remain compatible.

## Verification

- Four new development GPU cases pass after the final phase change, and 69 related
  release GPU cases pass with WebGL validation and failure exit. An earlier full
  development run passed 68 cases before the additional mask case.
- Calm sloping/curved area ratios, actual wind/current FFT evolution, source flow,
  frame/grid validation, hole/corridor mask, camera invariance, changed sun direction,
  paused above/below receiver pictures and full field release are covered.
- Build, buildRelease, buildTs and tsc pass; scoped JS lint/Prettier and diff checks
  pass. Full AgentDocs markdownlint passes; pre-existing full-tree Prettier debt
  remains separately recorded in R34.
- Three new browser cases cover lake Globe and directed river Globe/Planar, plus
  eight existing curved/river cases. Pause is pixel-stable; moving the camera
  produces no field draw. Example destruction releases all field textures.
  Above/underwater pictures are inspected. Owner visual gate stays open.

## Cost / limitations

Chrome / RTX 3060 Ti, 1185 x 800. A 48 m square patch uses 257 x 257 depth samples,
512 x 512 caustic map and 256 x 256 refracted cells. Six GPU queries isolate the
caustic mesh draw: approximately 0.35 ms lake, 0.50 ms directed river. Clear,
mipmap, foam, FFT, capture and composition are excluded; these are not full-frame
times or device guarantees. Frozen time and unchanged light reuse the field.

Field textures occupy 7023338 bytes lake / 8080122 bytes river, excluding the
approximately 2 MiB refracted mesh, original profile, existing FFT and scene capture.
Static CPU preparation is synchronous; total river construction measured about
83 ms Planar / 144 ms Globe for this 257-square example, versus about 1 ms before
adding the patch. Do not recreate it per frame. Larger coarse patches cannot retain fine
waves; bounded fixed-grid sampling and three bed projection iterations remain
approximations. Build-local evidence is untracked. Previous R33/R34/R35 owner
visual findings retain their independent status.
