# P5 Planar Far Aerial Review

## Metadata

- Type: `review`; status: `accepted`; created/updated: `2026-09-12`
- Reviewer: current Architecture role under owner visual delegation
- Plan: [P5](../plans/2026-09-12-phase-p5-planar-far-aerial-quality.md)
- Predecessor: P4 `b0ed3e2149`; upstream delta budget: zero

## Findings and repair

- Fixed, high: the atmosphere's obsolete 300 km clip removed the dense lower
  path from shallow distant ground rays. At camera Z=10 km, actual GPU red T
  fell to 0.315 at 300 km, then rose to 0.604 at 20,000 km. Full analytic slab
  transport gives 0.0995 at 600 km, 0.0214 at 1,000 km and zero at 20,000 km.
  Remove only this clip; cloud and fog march budgets remain unchanged.
- Fixed, medium: Planar absolute aerial scale and background scale created a
  10:1 daytime source-domain discontinuity at default settings. Both finite and
  cloud aerial now consume background scale times relative aerial scale, as
  Globe already does. ADR-0044 and public JSDoc document this semantic change;
  defaults, ranges and property shape remain unchanged.

The new actual-GPU fixture failed on the original source for complete-segment
coverage, red-T monotonicity/reference, sky/finite endpoint matching and cloud
aerial scaling. It passes after the two repairs. This provides independent
causal checks rather than an image-only comparison.

## Validation

Nine focused cases pass in Chrome 152: the new P5 GPU fixture plus eight
regressions covering Planar final medium composition, horizontal/shallow/high
paths in both projections, P4 night, P2 Beer/surface and atlas lifetime, warm
scale setters, shader contract and Globe aerial/physical surface endpoints.

Full build, build-ts and tsc pass. Build-ts retains existing unrelated JSDoc
warnings. Changed ESLint/Prettier, full AgentDocs markdownlint and upstream
audit pass. Full AgentDocs Prettier retains the same 16 historical failures.
No generated module, LUT asset, generator or upstream file is changed.

Six interleaved GPU elapsed pairs for the same frozen real aerial inputs at
1724 x 1150 give medians 0.148 ms before and 0.147 ms after. Original samples
range 0.124–0.650 ms, including an outlier; repaired samples range 0.144–0.147 ms.
This is a bounded single-pass comparison, not a full-frame/FPS claim. The first
diagnostic attempt used cleared post-frame borrowed input slots; the valid
measurement freezes the actual sampler values from the completed frame and
restores the command afterward. No product hook was introduced for timing.

Resources, history, passes, texture lookups and LUT bytes have zero increment.
Removing the cap does not add raymarch work because this path is analytic.
Native shadow controls, direct lighting and Globe shader behavior are unchanged.

The real page remains ready/HDR with zero reported render/browser errors.
The original fixed 10 km view loses the daytime gray hard edge and distant
ground rebrightening. Near native red models retain their material and top/side
contrast; the 120 km view still intersects the flat atmosphere from vacuum.
The final fixed night view retains readable cloud/ground contrast and a dark
distant background. User camera and effect parameters are restored.

## Acceptance and remaining limits

Architecture accepts the bounded transport/continuity repair and creates an
independent local checkpoint. No upstream-owned files changed; consume-only
SGP-0008. No new owner visual gate is pending.

The infinite fixed-Z slab retains a sharp horizon when viewed from above its
top, and extremely distant clouds retain some hue variation. This stage does
not claim complete cloud material parity: morphology/detail, cloud radiometry,
crepuscular rays and Moon remain successor work owned by the current agent.
The original P4 transport finding is closed by the causal fixes above; remaining
cloud appearance must be assessed in its material/lighting phase.
