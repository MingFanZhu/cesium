# ADR-0208：自有分段高斯的视频接收与遮挡

- Status: accepted for phased implementation
- Date: 2026-11-02
- Owner: current task
- Related: ADR-0177, ADR-0188
- SGP: SGP-0065 for the early Gaussian observer capture hook

## Decision

SceneGISVideoProjection.gaussianTargets explicitly borrows native SceneGIS-owned
SceneGISGaussianSegmentedPrimitive instances in the same Scene. A nonempty list selects
Gaussian-only receiving; the existing empty-list opaque receiver path stays separate.
Mesh sources and terrain retain their occluder semantics. Targets also provide Gaussian
occlusion with gaussianAlphaThreshold (default 0.3, range (0,1]). At most four active
projectors can affect one target, in postProcessStages order. No SDK or native Gaussian path.

Extend private selection views with additional projector views. The single Active Cut uses
union visibility and maximum projected error, constrained by existing shared budgets.
Main-camera sorting and atlas identity remain unchanged. Capture consumes the published
cut with independent transforms, without advancing the loader or overwriting main uniforms.
Until the current union view has converged and its resources are published, projection is off.

Gaussian shape does not define an opaque physical surface. The projection sample is the
maximum-density point along a view ray through its 3D Gaussian; alpha falloff and the public
threshold define approximate occluder coverage. Depth and receiving use the same position
rule. Native opaque occluders share the projector depth test. Do not enable depth writes in
the normal Gaussian pass or use terrain behind a splat as its receiver location.

Video is mixed with Gaussian captured RGB before premultiplied alpha compositing, leaving
Gaussian alpha and main opaque depth unchanged. Global display/exposure then affects this
captured appearance; this differs from the existing opaque SDR post-display overlay and is
not a physical projector light or PBR relighting. No modification of stored color/SH pages.

Capture for Gaussian targets must run before their main draw; reuse the existing observer
coordinator with a narrow early dispatch through SGP-0065. Ordinary observer capture retains
its existing schedule. Video uploads remain frame-driven, one texture per projector.
Derived receiver/depth programs belong to the Gaussian renderer; framebuffer/media resources
belong to the projector. Removal, hiding, disable, view/transform changes and destruction
invalidate their respective borrowed references. No GPU-to-CPU field transfer is introduced.

## Qualification

Test union selection / frozen proofs / shared budgets; real video colors, masks, letterboxing,
flip, front/rear Gaussian and opaque blockers, offscreen loading, view/transform/LOD changes,
multiple projectors, missing media/coverage, pause/disable/destroy and Scene teardown.
Provide both World examples, screenshots and bounded resource/timing measurements.
Full build, types and affected observer/Gaussian regressions gate completion; owner retains
final visual judgment. Sparse/low-opacity splats and finite depth/LOD remain approximations.
