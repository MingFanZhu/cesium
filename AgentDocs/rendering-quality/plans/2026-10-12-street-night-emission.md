# Street night emission diagnosis

- Type: `standalone`; status: `completed; owner visually accepted`; date: `2026-10-12`; updated: `2026-10-13`
- Owner / Architecture review: current task; confirmed
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Previous checkpoint: `2e09227156` (owner-accepted R24)
- Related: ADR-0090 / ADR-0100; no new engine API or upstream seam

## Reproduced cause and boundary

At Greenwich, 2026-03-20 22:00 UTC, the original restaurant view displays emissive
bulbs but little glow. Both source GLB and delivered glTF contain ten emissive
materials, factor [1,1,1], no emissive-strength extension and texture channels at
most 1. Native shading preserves emission separately from direct light and AO.
The page disables bloom; its inherited threshold 10 excludes these low-intensity
emitters even when enabled. Bloom thresholds unexposed HDR; automatic exposure
reaches its gain ceiling of 64 in this view, brightening the whole street without
making the source cross that threshold. Source material restoration did not lose
an emissive-strength extension.

Same-view threshold 0.1 and intensity 0.15 produce visible, bounded bulb halos.
Change only the Bistro example's optional bloom parameters and label the threshold
space. Keep bloom disabled at startup to preserve the accepted daytime picture.
Do not modify assets, physical lights, exposure, tone mapping or engine defaults.
Halo is an appearance effect; lighting nearby geometry remains a local-light or
indirect-lighting concern. Do not infer authored source radiometric intensities.

## Implementation and verification

1. Configure Bistro bloom threshold/intensity explicitly and allow fine threshold
   adjustment in the existing HDR folder. Explain night inspection in fixture notes.
2. Extend the existing both-world Bistro E2E to render at night: inherited threshold
   10 must have no bloom signal, the page threshold must produce a nonzero actual
   bloom buffer, and export/control restoration must retain the chosen parameters.
3. Reinspect the owner's same-view night picture, restore unrelated settings and
   record review. No engine rebuild, type generation or new GPU benchmark is needed
   for example-only parameters; the existing optional bloom resource cost is unchanged.
4. Run scoped lint/format and required AgentDocs checks. Preserve older visual gates.

Exit: actual bulbs contribute to optional bloom at the supplied material scale,
with no hidden time/exposure/material changes and explicit owner visual acceptance.

## Result

Both-world Bistro E2E passes (Planar 44.0 s, Globe 48.4 s), including real bloom-buffer
readback and restoration. The owner page is intentionally left at 22:00 with optional
bloom enabled for comparison; camera, grading and original automatic-exposure settings
are restored. Source checks and retained limits are recorded in the
[technical review](../reviews/2026-10-12-street-night-emission.md). No next phase is active.
The owner visually accepts this adjustment on 2026-10-13, completing the local checkpoint gate.
