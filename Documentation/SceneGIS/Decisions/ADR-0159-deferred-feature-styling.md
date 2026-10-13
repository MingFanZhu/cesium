# ADR-0159: Preserve native feature styling in deferred WebGL lighting

- Status: accepted; technical qualification and owner visual gate passed
- Date: 2026-10-13
- Depends on: [ADR-0156](ADR-0156-webgl-deferred-lighting-experiment.md), [ADR-0158](ADR-0158-shared-deferred-depth.md)
- Upstream seam: SGP-0048

## Context

Native mesh Model / 3D Tiles evaluate feature REPLACE/MIX in MaterialStage,
HIGHLIGHT after lighting in CPUStylingStage, then model-wide ModelColorStage.
The four material targets do not encode the per-pixel post-lighting multiplier.
Moving all styling to base color changes specular, emission and transport semantics.
The owner explicitly chose an optional fifth attachment over compressed channels
and reconfirmed native behavior after discussing pre-lighting-only coloring.

## Decision

Retain the private experiment and existing APIs, feature tables, loaders, visibility,
translucent routing and picking. No feature ID or pick ID is stored in the G-buffer.
Model.color uses native ModelColorPipelineStage and per-model lighting uniforms.
Opaque native Models with selected feature IDs require a fifth RGBA16F target,
recording the multiplier through one explicit CPUStylingStageFS hook (SGP-0048).
Fullscreen lighting applies it once to lit color and AO/SSR/SSIL responses, before
native model color blending. This adds no geometry or fullscreen pass.

The fifth texture has an independent owned manager. Four base targets survive
layout changes; the framebuffer borrows native depth and never owns it. Capture
shader variants include layout identity; unstyled content writes neutral values.
Only selected-feature lighting groups sample the extra target. Release it when no
eligible opaque feature commands remain, on disable or destruction; resize replaces
owned textures. Check both MRT limits before compiling or allocating this layout.
Ordinary content retains the four-attachment requirement; diagnostic P1 qualification
remains separate. Selected-feature content requires at least five renderable targets.
At 1280x800 this adds 7.8125 MiB, at 1920x1080 15.8203125 MiB, plus bandwidth.
Subsequent lighting-response MRT limits remain independent.

## Qualification and limits

Compare native HDR for model and feature HIGHLIGHT/REPLACE/MIX, direct feature
edits, style evaluation, show/alpha transitions, PBR/unlit and AO/SSR/SSIL responses.
Verify native picking, instancing/feature textures, resize, visibility/unload and
four/five layout transitions. Measure fixed-content GPU cost without changing quality.
Use the independent example and owner visual gate before the phase checkpoint.
No classification, point-cloud styling, outline, silhouette, clipping-edge or
multifrustum coverage is implied. SGP-0048 can retire when native rendering exposes
an equivalent post-lighting style capture or this private experiment is removed.
