# WebGIS street reflection scope review

- Type: `review`; status: `accepted; closed`; date: `2026-10-12`
- Owner / reviewer: current task, implementation and architecture self-review
- Target: [Standalone](../plans/2026-10-12-street-reflection-scope.md)
- Upstream-owned files / SGP delta: none

## Findings and disposition

- Resolved: Bistro removes the manual probe folder and diagnostic capture entry.
  Its controls no longer depend on a capture button return value. Probe maps were
  already created only on demand, so this change makes no performance-gain claim.
- Preserved: Sponza uses its existing reference-control branch and capture function.
  Engine API, shader bindings, probe Specs and the independent probe page are unchanged.
- Accepted scope: dynamic capture, spatial placement and streaming invalidation are
  deferred. Existing R17 visual limitations remain in its review; possible reuse by
  GI does not turn specular cubemaps into diffuse transport or promise a GI design.

## Verification

- Globe and Planar Bistro E2E pass: absent probe controls/collection, existing Clock,
  exposure, lighting, navigation, export and destruction contracts.
- Shared Planar Sponza E2E passes, including its retained capture action, reversible
  effects, navigation, configuration export and destruction. Three total E2E cases pass.
- Changed JavaScript ESLint, source/HTML Prettier and whitespace checks pass. The
  combined HTML ESLint invocation stops in the existing `eslint-plugin-html` /
  `eslint-seatbelt` processor configuration (`Expected string ... pluginName/processorName`).
  The changed HTML contains prose only; inline script is unchanged. No lint configuration
  or dependency changes are included, and HTML ESLint is not reported as passing.
- Full AgentDocs Markdown lint passes. Global Prettier retains the same 398 historical
  file warnings; new records and the index pass scoped formatting. The first pass caught
  the new index table row alignment; formatting that index resolved the discrepancy.

## Delivery boundary

Only owned examples, one existing E2E file and collaboration records change. No new
GPU resources, pipeline, public API, asset or generated output is included; a full
engine build and GPU benchmark are unnecessary for this workflow change. Existing
user-tab camera/time/settings remain untouched; reloading loads the revised panel.
Architecture self-review is complete. Code and records form one local checkpoint;
no push or following rendering phase is included.
