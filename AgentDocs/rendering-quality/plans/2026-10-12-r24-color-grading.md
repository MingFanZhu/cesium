# R24: HDR color grading and street presets

- Type: `phase plan`; status: `completed; owner visually accepted`; date: `2026-10-12`
- Author / owner: current task, architecture and execution
- Parent: [extension roadmap](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: `69c3f4f098`; decision: ADR-0154; seam: SGP-0044
- Review: [approved](../reviews/2026-10-12-r24-color-grading.md); no open design question

## Authorization and source facts

The owner approves white balance, contrast, saturation and selectable picture presets.
Same-view inspection finds little aerial-perspective contribution to the reported haze;
changing the native tone mapper alone retains blue shadows. This is not proof of a
lighting defect. Preserve camera, Clock, light, material, fog and automatic-metering state.

Native user stages run after tone mapping. All five native tone shaders expose a common
linear, exposed RGB location before their curve and inverse gamma. Assemble an optional
owned grading function at that explicit seam; no shader text replacement or copied mapper.

## Implementation

- Add optional Scene-owned `SceneGISColorGrading`, disabled by default: daylight white
  temperature (4000–25000 K, neutral 6500), green/magenta tint, luminance contrast around
  0.18 and luminance-preserving saturation. Bradford chromatic adaptation is computed on
  CPU parameter changes, with exact neutral bypass. No automatic white balance.
- Configure native stages before first update; uniforms remain live. Preserve native
  manual/automatic exposure, alpha, tone-curve selection and output gamma. Apply grading
  after exposure, before tone mapping; auto metering and TAA remain upstream and unchanged.
- Reuse native stage resources. No additional framebuffer, texture, geometry or color pass.
- Add a street picture folder with neutral, clear and soft-film presets, custom status,
  reset, tone mapper and direct controls. Presets change grading/tone mapper only; exposure
  compensation remains independently controllable in the existing HDR folder.
- Persist picture settings in example export. Keep shared Sponza behavior unchanged.

## Verification and exit

GPU Specs: neutral equality, temperature/tint direction and known-white adaptation,
contrast pivot/black, saturation, HDR-before-compression behavior, all native mappers,
automatic-exposure independence, uniform-only changes and disable/destroy lifecycle.
Two-world Bistro E2E: preset/custom/reset, preserved camera/time/light/exposure, export
and teardown. One bounded same-view GPU measurement and inspected street captures.
Run native collection/exposure regressions, release/type generation, tsc and patch audit.
Record technical review and request owner visual acceptance before a phase checkpoint.

## Limits

Global white balance cannot neutralize mixed sun/sky illumination independently or
recover missing sky visibility. Daylight approximation does not cover tungsten below
4000 K. Negative out-of-gamut RGB is clipped before grading; no HDR display output, LUT,
local exposure or GI is introduced. Presets are starting points, not calibrated looks.

## Result

Nine development/release GPU cases, 51 native/exposure regressions, two-world Bistro
E2E, release/types/tsc and patch audit pass. Bounded native tone-stage median is 0.017408 ms
both off/on in the current view, with no extra pass or target. The refreshed owner page
preserves camera/time/light/exposure and selects clear. See review for full evidence,
upstream paths, retained tooling debt and mixed-light limits. On 2026-10-12 the owner
accepts the picture controls and presets and authorizes the independent phase checkpoint.
