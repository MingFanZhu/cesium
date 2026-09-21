# Review: PBR reference scene

- Type: `review`; status: `completed`; date: `2026-09-21`
- Target: [R15 phase](../plans/2026-09-21-r15-pbr-reference-scene.md)
- Owner / reviewer: current task, architecture and execution self-review
- Decision: technical gate passed; owner visual acceptance pending
- ADR / SGP: none; no runtime API, Shader, renderer, build or upstream change

## Findings and disposition

- P1, fixed: Original authoring textures alone require about 6 GiB RGBA8 with mipmaps for
  the main scene. The default 2K derivative is explicitly labeled; original 4K source remains
  local and selectable. glTF/buffers/material definitions are unchanged. Fixture checks prove
  identical glTF, expected buffer sizes, normals/UVs/PBR references and 2K image dimensions.
- P1, fixed: Glass cannot be claimed as supported by loading its core material. Preserve
  transmission/volume in the source assets and show the capability gap beside the scene.
  FlightHelmet lenses share this limitation. No alpha substitution or renderer extension.
- P2, fixed: Planar surface navigation resets the author's upward initial camera. The example
  unregisters the surface controller and composes existing public Camera look/move methods
  for both Worlds. E2E verifies authored local position survives first update and wheel/reset
  works; no delayed-frame workaround or navigation patch is used.
- P2, fixed: Initial material close-up intersected an architectural column. Move the pose
  inside the courtyard and widen its FOV. Inspect actual material, helmet/glass and pool
  views; UI can be hidden for unobstructed visual comparison.
- P2, fixed: Heavy models can finish loading after page disposal. Destroy late models and
  stop subsequent assembly. Tests cover both ready destruction and a held glTF response
  released after destruction; await the actual loading promise. Shared caller-owned IBL,
  custom shaders and input handlers are released; Scene owns models/water/TAA/SSR.
- P2, accepted scope: Source and browser runtime data stay in ignored local directories.
  Versioned URLs/hashes, selective streaming ZIP extraction and pinned sharp preparation
  permit reconstruction. Missing local data is actionable, without a substitute scene or
  runtime network dependency. Intel license text is retained verbatim, including its header
  discrepancy; no claim of unrestricted commercial use or external redistribution is made.

## Verification and boundaries

- Preparation succeeds using the pinned official archives and Khronos commit. The original
  Intel endpoint URLs were checked to deliver the expected resource lengths. Both copies of
  each original glTF match, all referenced normals/UVs/materials/resources are present,
  extension declarations remain intact, and licenses/attribution files are retained.
- Dedicated Playwright suite: **5 passed** (27.9 s on the local run). Covers both-world
  composites, main-only page, effect/camera/lighting/time invariants, exported config, wheel
  input, teardown and missing/pending assets. The initial URL assertion was corrected to
  compare parsed URL semantics because assigning `HTMLAnchorElement.search` resolves its
  href to an absolute URL; no page workaround was needed.
- IAB visual inspection: architectural orientation, curtains, metallic/roughness grid,
  helmet and glass limitation, pool and reflections. The technical result remains subject
  to the owner's visual acceptance, not inferred from automated pixel metrics.
- Scoped ESLint, formatting, diff checks and Markdown validation recorded in the checkpoint.
  AgentDocs-wide Prettier retains the pre-existing 316-file formatting debt from R4; no
  unrelated cleanup. No engine sources, generated outputs or upstream-owned files changed,
  so no engine rebuild/type test or new SGP is required.
- Composite: 6,345,008 imported triangles plus a few boxes/water triangles, roughly 2.0 GiB
  RGBA8 texture budget at 2K. This is a material/lighting fixture, not a city streaming or
  frame-rate benchmark. Original 4K has a roughly 7 GiB texture budget and was not loaded
  alongside other heavy pages during browser review.
- Global IBL is unoccluded; no local probes/GI. Glass remains a documented target. Static
  scene lighting is not the author's original punctual-light or path-traced reference.
  Future rendering changes require their own phase and independent effect example.

## Handoff

Open `Test/Rendering/PBR综合验收.html?world=planar`; the corresponding main-only baseline
and Globe links are on the page. Source preparation and detailed attribution are in
`Test/Rendering/pbr-data/README.md`. No further rendering implementation is authorized by R15.
