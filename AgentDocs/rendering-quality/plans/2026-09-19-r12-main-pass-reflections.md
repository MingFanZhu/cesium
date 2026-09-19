# Phase R12: Main-pass MRT Reflections

- Type: `phase`; status: `completed`; date: `2026-09-19`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Owner / architecture reviewer: Current task
- Architecture review: `confirmed`
- Previous checkpoint: derived shader maintenance `cbd429e11b`
- Decision: ADR-0091; existing integration seam SGP-0016

## Source facts and scope

The real Viewer scene has one native frustum, 4x MSAA, 1701 commands and 1574 extra SSR capture
draws. AO needs current depth before material lighting. SSR currently shades the entire opaque
scene and subsequently shades it again. The owner's requested MRT optimization targets that
redundant shaded replay first. AO depth sharing and shadow updates remain subsequent work;
do not combine unverified lighting decomposition into this phase.

Main-pass MRT borrows native scene color/depth attachments, preserves MSAA and records evaluated
reflection rays, material response and existing environment contribution. After opaque drawing,
resolve these attachments, trace existing SSR and replace only the weighted specular environment
contribution before water and translucency. Base materials need four color outputs; clearcoat
needs seven. MSAA resolution must resolve each attachment independently.

Retain the existing replay for native multiple-frustum rendering, classification, translucent or
depth-cleared Globe, blended opaque commands and model post-lighting branches not yet given an exact response
contract. This is an explicit compatibility path for already supported native behavior, not a
quality downgrade or a temporal approximation. Native CPU styling and model color must transform
reflection response consistently. Public options, material input and effect ordering remain.

## Implementation and verification

1. Record ADR and SGP additions before upstream changes; implement owned MRT attachment borrowing,
   resolve, shader transport and disposal. Native Scene receives one post-opaque resolve call.
2. Preserve existing SSR/AO/water suites; add tests proving zero capture replays in the qualified
   main path, weighted IBL misses, style changes, MSAA, compatibility transition and borrowed
   attachment lifetime. No test-only product switches.
3. Run strict WebGL affected suites; development/release builds and declaration checks, scoped
   lint/format, patch audit. Inspect both-world existing examples and the unchanged real view.
4. Record actual frame rates, command reduction and resource cost. Technical review precedes an
   independent local checkpoint; owner visual acceptance remains explicit.

## Risks

MRT increases framebuffer bandwidth and MSAA auxiliary storage. Measured draw savings must justify
the tradeoff. Half-float material buffers retain the existing HDR capture precision. Unsupported
post-lighting transformations must stay on the established path rather than acquire incorrect
additive highlights. No WebGPU backend, full deferred renderer or public G-buffer API is introduced.

## Completion

Implementation and architecture/code self-review are complete; see the
[R12 review](../reviews/2026-09-19-r12-main-pass-reflections.md) for findings, bounded GPU/build
validation, measured draw/frame-time reduction and resource costs. Existing public APIs and saved
Viewer settings are unchanged. Main-pass MSAA uses weighted environment energy and a signed delta
blend; this corrects two edge cases found during review. Owner visual acceptance remains pending.
No subsequent phase is active. Create the independent R12 checkpoint before further optimization.
