# ADR-0174: S3M model loading through the native Model pipeline

- Status: accepted for implementation; qualification pending
- Date: 2026-10-20
- Plan: [S3M loading](../../../AgentDocs/s3m/plans/2026-10-20-s3m-loading.md)
- Upstream seams: None planned

## Context and decision

SuperMap's Apache-2.0 JS SDK provides reusable S3MB decoding, but its loader mutates
Scene.pick and emits commands incompatible with the SceneGIS deferred material
contract. Its planar scene-mode heuristic is incompatible with a fixed-XYZ World.

Adapt the pinned SDK's S3M 1.0 binary layout into private SceneGIS Core code. Decode
and convert each PageLOD to an in-memory GLB in a dedicated, layer-owned
TaskProcessor. Use native Model loading, materials, GPU instancing and feature
metadata, rather than copying the S3M shaders or patching native draw commands.
No global registration, hidden projection, alternate lighting pass or runtime
dependence on the upstream checkout is permitted.

The initial profile covers standard triangle meshes, 17-float affine instances,
DXT1/DXT5 textures and JSON SCP from the official model samples. Unsupported
versions, compression, instance layouts and data types fail explicitly. Gaussian
splatting is excluded. Native PBR receives derived normals when absent; legacy
diffuse materials map to nonmetallic rough surfaces. This is a documented material
mapping, not a claim of commercial iClient appearance parity. The official JS
shader currently samples the first texture only; do not invent a second-texture
lighting interpretation in this profile.

DXT decoding produces ordinary PNG images inside the GLB. This trades decode work
and GPU texture size for native loader ownership and broad WebGL compatibility;
measure the bounded sample cost. Preserve feature IDs through native structural
metadata. Geometry without authored IDs remains pickable with explicit synthetic
tile/geometry identity, never a fabricated business ID.

## Runtime and World boundaries

S3M retains its own PageLOD hierarchy, range modes and requests. It must not pose
as a Cesium3DTileset or reinterpret all ranges as geometric error. Keep parent
coverage until replacement content is ready. Native Resource / RequestScheduler,
Model and Camera remain responsible for their existing lower-level contracts.

The planned public SceneGISS3MLayer uses explicit live planar World binding and
an application-supplied local-to-World modelMatrix. Globe geographic insertion
uses the explicit SCP Degree position with ENU, matching the qualified official
loader; other CRS placement requires an explicit matrix. World identity is checked
before resource mutation. Bounding spheres support native Camera framing in both
worlds. No Viewer prototype changes are required.

## Build and ownership

Approve the exact new owned entry
`packages/engine/Source/Workers/SceneGISS3mWorker.js`.
It delegates to `Source/SceneGIS/Core/_private/**` through the existing
createTaskProcessorWorker adapter. The current build scans Source/Workers for ESM,
release and inline workers, excludes these entries from the normal barrel, and
ships Source / Build in the engine package. No build-script patch is needed.

Decoder provenance and the Apache-2.0 license ship in
`Source/Assets/SceneGIS/S3M/`. Local model fixtures and their provenance live under
`Test/S3M/data/`; they are development assets, not runtime dependencies.
Record upstream commit `462cf06b95857fe2410dce9aecbfd8e4c16e84fc`. On upgrades,
compare supported parser sections and native Model / feature / Worker contracts;
do not automatically import new upstream formats or global behavior.

## Validation

Use deterministic official fine-model and instance fixtures, and a bounded
official oblique subtree. Specs cover decode, native feature IDs, transforms,
unsupported profiles, lifecycle and scheduling. Real WebGL checks both worlds,
LOD replacement, picking, camera framing and stable warm resources. Build/type
checks verify exports and Worker delivery. Visual review remains a separate
owner gate; decode success alone is not rendering acceptance.
