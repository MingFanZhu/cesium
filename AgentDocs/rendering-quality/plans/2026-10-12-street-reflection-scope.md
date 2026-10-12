# WebGIS street reflection scope

- Type: `standalone`; status: `completed`; date: `2026-10-12`
- Parent: [Rendering quality](2026-09-18-rendering-quality-extension.md)
- Owner / Architecture review: current task; confirmed
- Related: ADR-0096 / ADR-0097; no upstream-owned files or SGP changes

## Decision and boundary

The owner questions manual/static reflection probes in frequently changing WebGIS
scenes and prefers retaining infrastructure for possible future work. Remove local
probe controls from the Bistro street acceptance page. Keep the engine API, Specs,
independent probe example and existing Sponza reference fixture. Automatic placement,
capture scheduling and GI expansion are not part of the WebGL quality mainline.

Current probe collections are constructed only on explicit capture, so an untouched
street page already has no probe maps or capture work. This change simplifies the
accepted workflow; it does not claim a frame-time improvement. Capture/resource
management may inform future GI; specular cubemaps and capture-point visibility do
not provide diffuse transport or a complete GI representation.

## Implementation and verification

1. Remove the probe group and its argument/return coupling from the owned street GUI.
   Stop exposing probe controls through the street example diagnostic object; preserve
   the shared Sponza branch and its explicit capture action.
2. Correct Bistro capability text. Record this priority change in the extension index
   and roadmap without closing older probe visual findings.
3. Run existing Globe/Planar Bistro control E2E and shared Planar Sponza regression.
   Verify the street has no probe controls/collection and retains SSR/Clock controls;
   retain the reference fixture's probe entry. No shader/build/type changes require a
   full engine build or GPU benchmark.
4. Run scoped source formatting/lint, AgentDocs checks and whitespace validation;
   record review and form one local checkpoint.

Exit: street workflow no longer advertises or exposes local probe capture; preserved
reference fixtures still load; checks and self-review complete.

## Delivery

Globe/Planar Bistro and shared Planar Sponza E2E pass (three cases). Street controls
and diagnostics have no capture entry or collection; Sponza retains its capture
action. Changed JavaScript lint and source formatting pass. Global AgentDocs Markdown
lint passes; 398 historical formatting warnings and the HTML lint processor issue
remain documented in the [review](../reviews/2026-10-12-street-reflection-scope.md).
All changed paths are absent from the official baseline; no upstream/SGP changes.
This maintenance forms a local checkpoint without activating a new rendering phase.
