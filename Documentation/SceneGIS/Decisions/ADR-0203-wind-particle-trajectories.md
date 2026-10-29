# ADR-0203: GPU wind trajectory ribbons

- Status: accepted and implemented; 2026-10-29.
- Parent: ADR-0197 W5; [W6 plan](../../../AgentDocs/urban-wind/plans/2026-10-29-w6-particle-trajectories.md).
- Upstream-owned changes / SGP: none. SDK/distribution untouched.

Wind visualization owns marker integration and optional 3D history independently
of LBM/scalar transport. Generic particles expose no intermediate integration
history. A wind-owned native Renderer runtime stores two RGBA32F head attributes
in ping-pong targets, plus an optional tiled RGBA32F ring of positions and recycle
tokens. Do not publish private generic-particle state or enlarge its public API.
Only the public live wind sampling descriptor and physical timeStep are borrowed.

Per owner clarification, remove particleSize and its aspect path directly, without
compatibility or migration errors. particleWidth=1.4 and particleLength=2.5 separate
head width and length; width units default to drawing-buffer pixels and optionally
select meters, length is meters. showTrails is opt-in. trailDuration uses completed
simulation seconds; trailSegments is immutable fixed capacity. Tail fading is an
age exponent and particleOpacity scales all particle geometry. Display edits do
not rebuild the solver. Capacity is bounded by 128 segments and 64 MiB texture
storage including padding; allocation also checks native context dimensions.

Within a display batch, RK2 uses the final completed velocity field and substeps
no larger than physical timeStep, splitting at uniform history sample boundaries.
Copies store actual integration endpoints, not current-velocity extrapolation.
Old intervals outside the retained duration integrate without retaining samples;
copies per batch are bounded by ring capacity. This is a visualization approximation
for unsteady fields and can vary with batch size; concentration remains independently
computed by conservative transport. Randomness only seeds/recycles particles.

Native instanced triangle ribbons connect history in simulation-local 3D and use
normal opaque depth/OIT, never a screen persistence texture. Reject chords crossing
solid cells, since coarse temporal sampling can otherwise cut obstacle corners.
Tokens prevent connecting any collision/outflow/lifetime rebirth. Pause freezes;
generation/reset/time rewind discards history. Hidden or missed updates discard
old history and consume elapsed time, preventing catch-up on restore. Changing
duration also restarts history; width/length/opacity/fade do not.

Consumer owns all head/history textures, commands and mesh; producer field remains
borrowed and unchanged. History allocates lazily on enable and is reused through
toggle/reset; destroy releases it. Normal frame-number guards prevent repeated
integration, and pick/shadow/display consumers cannot advance LBM. No normal-frame
CPU field/particle readback, Voxel metadata rebuilding or SDK layer dependency.
