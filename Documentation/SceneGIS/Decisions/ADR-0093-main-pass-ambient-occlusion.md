# ADR-0093: Main-pass Ambient Occlusion MRT

- Date: `2026-09-19`; status: `accepted; implemented and technically verified`
- Phase: [R14](../../../AgentDocs/rendering-quality/plans/2026-09-19-r14-main-pass-ao.md)
- SGP: `SGP-0014`, `SGP-0016`; amends ADR-0084/0091/0092

## Decision

Share main opaque color/depth attachment ownership between AO and SSR. For qualified linear-HDR
single-frustum rendering, capture the final material-weighted indirect contribution via MRT during
the original draw, then compute current-frame AO and blend its signed indirect-only correction.
Direct light and emission are not AO inputs. SSR reads the corrected opaque source and applies
the same visibility to material reflection replacement. Preserve native MSAA and resolve weighted
energy rather than independently averaged factors. Compose before water, translucency and aerial
effects; keep alpha and borrowed native framebuffer resources unchanged.

AO remains independent of the SSR public controller. AO alone needs two color outputs; base SSR
with AO needs five, and clearcoat SSR with AO needs eight. The shared owned manager carries only
enabled outputs and releases its attachments on resize/layout replacement/destruction. The AO
estimator reuses the supplied linear depth without allocating a redundant raw depth target.

Existing nonlinear LDR, multi-frustum and classification/post-lighting contracts retain their
verified prepass behavior until independently integrated. Capability/layout qualification precedes
draw submission. Do not approximate whole-color darkening, use previous-frame depth, reduce quality
or introduce a new caller switch. Existing controls and native build/ShaderCache ownership remain.

## Upgrade and acceptance

Recheck native Model/Phong/surface indirect algebra, clearcoat and styling, native attachment
sample ownership and per-frustum ordering. Validate strict GPU pictures, no extra geometry on the
qualified path, effect independence, resize/toggle/destruction and real-scene performance. Record
special-path limits and memory cost explicitly. Owner visual acceptance remains the picture gate.

## Outcome

The qualified real scene eliminates 1574 AO geometry draws while retaining 4x MSAA and all effects.
Paired frame time drops about 18%; estimated net added storage with base SSR is 27.5 MiB at 1097 x 822. Strict AO/SSR/water regressions and build/types pass. The [R14 review](../../../AgentDocs/rendering-quality/reviews/2026-09-19-r14-main-pass-ao.md)
records retained compatibility paths and resource/measurement boundaries.
