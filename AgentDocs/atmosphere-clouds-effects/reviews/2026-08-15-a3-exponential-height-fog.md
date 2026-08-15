# A3 Exponential Height Fog Implementation Review

## Metadata

- Status: `approved`; project-owner visual gate passed
- Phase: A3 — Exponential height fog
- Role: Execution Agent handoff for Architecture/code review
- Branch: `feature/atmosphere-clouds-effects`
- Exact implementation base and current HEAD:
  `7f041ccb041261f6eb4fc34211c7999dee89d8e6`
- Predecessor A2 checkpoint: `da2eb55743a46423e65b2047965907c05ea260b7`
- Review target: retained uncommitted working-tree diff
- Governing decision:
  [ADR-0045](../../../Documentation/SceneGIS/Decisions/ADR-0045-dual-world-exponential-height-fog.md)
- Corrected-gate discussion:
  [A3 Default Height-fog Washout](../discussions/2026-08-15-a3-default-fog-washout.md)

## Architecture review — 2026-08-15

Decision：`changes-required`。Public/controller、native authority、resource/pass
边界、fixed-reference source、Globe/Planar target ROI证明和package/upstream
scope未发现额外blocker，但以下两项阻止owner gate。

### A3-AR-001 — Planar analytic integral在近水平短segment发生float32 cancellation（blocking）

`SceneGISExponentialHeightFog.glsl`当前对非horizontal分支计算
`(startDensity - endDensity) / (heightFalloff * viewDirection.z)`。两个density
先在GLSL float32中分别求值；当`heightFalloff * viewDirection.z * distance`
很小时，相减会失去全部或大部分有效位。现有CPU fixture使用JavaScript
double并复制同一公式，只覆盖`0.001 × 50/150/300 km`，没有验证shader精度或
horizontal threshold邻域，因此不能证明phase plan要求的“数值稳定”。

Architecture用default density/falloff、height=`1000 m`和与shader相同的
`Math.fround`复现：`viewDirection.z=1.01e-7`、segment=`250 m`时实现值为
`0`，reference optical depth为`0.00163746`；`1000 m`时实现/reference比为
`3.437`。在public maximum density下，这个threshold discontinuity会从可见fog
直接跳为identity，不能作为小量roundoff接受。

Required correction：使用以
`x = heightFalloff * viewDirection.z * segmentLength`为自变量的稳定解析形式
`startDensity * segmentLength * (1 - exp(-x)) / x`，并对small `abs(x)`使用明确
Taylor/limit branch；或者提交数值等价且可证明连续的实现。不得只扩大当前
`abs(viewDirection.z)`阈值。新增float32/shader-backed fixtures覆盖threshold两侧、
`250/1000 m`短segment、positive/negative vertical、falloff=`0`和public high-density，
证明finite、nonzero、连续且与double reference误差有界。

### A3-AR-002 — “final” visual artifacts包含未被smoke捕获的Planar render error（blocking）

Architecture逐张检查review列出的六张artifact。至少
`a3-ground-day-combined-final.png`、
`a3-ground-sunset-combined-final.png`和
`a3-high-day-combined-final.png`在Planar viewer中明确显示：
`DeveloperError: The camera frustum has invalid bounds`，其余相关Planar画面已停止
或为black。它们与review/phase plan中的“24-state passed、page errors 0”直接冲突。
Cesium widget会捕获`Scene.renderError`并显示error panel；只监听browser
`pageerror`/console不足以发现该失败。Execution记录表明frustum按钮缺口后来被
修正，但列为final的artifact仍来自失败状态，不能作为owner gate输入。

Required correction：最终smoke必须对两个Scene注册`renderError`并把任一事件作为
hard failure，同时检查visible Cesium error panel；每次projection/preset切换后证明
两个Scene都有新的successful render且frustum bounds finite/ordered。用最终源码重新
生成全部列出的artifact，禁止复用失败前文件，并在review记录其生成顺序与零
`renderError`证据。所有截图必须无error overlay且双viewer都有与state一致的画面。

### Independent evidence boundary

- Architecture检查了完整product diff、A3 review/discussion/ADR、public setters、
  renderer uniform/pass paths、shared GLSL、focused fixtures及Globe target projection/
  containment/non-overlap/distance proof。
- Architecture检查了全部六张列出的local visual artifacts；因此发现A3-AR-002。
- Architecture执行了shader-equivalent float32 numeric reproduction；因此发现
  A3-AR-001。Codebase-memory在fast reindex后仍未收录A2/A3 SceneGIS文件，精确路径
  fallback作为tool-index gap记录。
- Execution报告的`40/40`、build/package/audit结果不因本review被改写，但它们没有
  覆盖上述两个失败面。Architecture未重复full suite或已通过的broad builds。

Execution修复后只需先运行新增numeric fixtures、focused `40/40`边界和严格的
24-state render-error-aware smoke；三者通过后再重跑受改动影响的lint/format/diff、
installed GLSL/package exact check与upstream/generated audit。保留working tree
uncommitted/unpushed并重新发送`review_ready`；不得请求owner gate或进入A4。

## Execution corrections for re-review — 2026-08-15

- A3-AR-001 is execution-fixed. The Planar analytic integral now evaluates
  `startDensity * segmentLength * ratio(x)`, where `ratio(x)` uses the stable
  exponential form outside a small neighborhood and an explicit four-term
  Taylor/limit branch with `O(x^4)` truncation for `abs(x) < 1e-2`. It no longer
  subtracts two nearly equal float32 densities and no longer has the old vertical
  threshold branch.
- Shader-source assertions and shader-equivalent `Math.fround` fixtures cover
  both sides of `1e-7`, `250/1000 m`, positive/negative vertical direction,
  falloff `0`, the corrected default density, and public maximum density. Every
  case is finite and nonzero; relative error against the double-precision
  `expm1` reference is below `2e-6`, and threshold-side continuity is below
  `1e-6` relative difference.
- A3-AR-002 is execution-fixed. Both Test Scenes now retain `renderError`
  evidence, `nextRenderedSamples` rejects on a render failure, and the page
  exposes validation for finite ordered Perspective/Orthographic bounds,
  successful frame counts, and visible Cesium error panels.
- The final-source strict Chromium run separately proved a new successful
  Globe and Planar frame after every projection/preset/light change across all
  `24/24` states. It ended with `renderErrors=0`, visible error panels `0`,
  browser errors `0`, and external requests `0`. Globe fog target distances are
  `11.496 < 39.396 km`, with pixel means `12.161 < 49.553` and margin `37.392`;
  Planar means are `5.728 < 99.470`, margin `93.742`.
- All six named final artifacts were regenerated from the final Test source and
  visually inspected. Neither viewer contains an error overlay, and every image
  shows output consistent with its named lighting/preset state.

## Architecture re-review — approved for owner gate — 2026-08-15

Decision: `approved-for-owner-gate`. A3-AR-001 and A3-AR-002 are closed. No
remaining Architecture/code blocker was found in the retained uncommitted tree.

- The Planar shader now uses
  `startDensity * segmentLength * sceneGISHeightFogExponentialIntegralRatio(x)`.
  The small-`x` branch is continuous, the near-equal-density subtraction and old
  vertical threshold are absent, and the overflow path remains capped before
  storage. Architecture independently repeated the shader-equivalent float32
  matrix: all `20` default/public-maximum cases were finite and nonzero, minimum
  optical depth was `0.0016374616`, maximum relative error was
  `6.4503e-8`, and both threshold-side continuity checks were `0` at float32
  precision.
- Architecture independently reran the focused real-Context filter. It executed
  `41/41` Specs successfully (`34` controller plus `7` A1 pipeline), including
  the new numeric fixture and existing resource/composition regressions.
- The direct Test retains both Scenes' `renderError` events, rejects a pending
  diagnostic read on render failure, counts successful `postRender` frames,
  validates finite ordered Perspective/Orthographic frusta, exposes visible
  Cesium error-panel count, and removes persistent listeners during disposal.
- Architecture inspected all six regenerated final artifacts. Globe and Planar
  both render in every artifact; there is no Cesium error overlay, stopped/black
  viewer, or state-inconsistent frame. This closes the evidence contradiction
  recorded by A3-AR-002.
- `git diff --check`, the exact empty `Scene.js`/upstream-manifest diff, and the
  official audit pass. The audit reports current-delivery upstream-owned `0` and
  generated `0`. Codebase-memory still does not expose the recent A3 symbols, so
  exact-path fallback remains the recorded tool-index limitation.

Previously accepted broad build/package/aggregate evidence was not repeated
because the correction scope is limited to the numeric helper, its focused
fixture, and Test evidence. The project-owner visual gate remains mandatory.
A3 stays active, uncommitted, and unpushed; checkpoint, push, and A4 remain
prohibited until the owner explicitly accepts the live visual result.

## Project-owner visual gate — passed — 2026-08-15

The project owner inspected the live dual-world Test and explicitly reported
`通过`. The required visual gate passes. A3 now has no unresolved Architecture,
code, numeric, render-error, package, upstream, or manual-gate blocker.

The retained implementation, Specs, ADR, direct Test, discussion, and AgentDocs
form the independent local A3 checkpoint in this commit. No push is performed.
A4 remains inactive until Architecture creates its source-based phase plan and a
separate planning checkpoint.

## Implementation

A3 adds one dual-world exponential height-fog layer to the existing A1/A2
environment-effects owner. The controller exposes the frozen nine warm public
options/properties. Architecture's bounded amendment changes only the exact
density/maximum-opacity defaults to `0.000008/0.70` and replaces per-pixel
luminance normalization with fixed top-of-atmosphere reference denominators.
All public ranges and the `0.35/0.15` inscattering defaults remain unchanged.

The shared GLSL implements exact stable planar exponential integration and a
fixed 16-sample Globe Gauss-Legendre integral over the clipped support segment.
Fog consumes the existing world-specific Sun transmittance and ground-occlusion
authority, never either A2 radiance scale. Composition is A2 atmosphere first,
then fog, then the existing final RGBA16F storage guard. Background fog stays in
the existing background command; resolved geometry fog stays in the existing
linear/log aerial variants, and clear depth does not double-apply it.

Incremental resource and pass cost is zero: no new program, FBO, texture, asset,
network request, listener, timer, command slot, or render loop. The new shared
GLSL source is compiled into the existing one background plus two aerial
programs. Aerial allocation remains the existing lazy A2 RGBA16F FBO.

## Exact changed paths

- `packages/engine/Source/SceneGIS/Scene/SceneGISEnvironmentEffects.js`
- `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISExponentialHeightFog.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsBackgroundFS.glsl`
- `packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/SceneGISEnvironmentEffectsAerialFS.glsl`
- `packages/engine/Specs/SceneGIS/Scene/SceneGISEnvironmentEffectsSpec.js`
- `scripts/scenegis/verify-planar-packages.mjs`
- `Test/高级环境.html`
- `Test/index.html`
- `Documentation/SceneGIS/Decisions/ADR-0045-dual-world-exponential-height-fog.md`
- `AgentDocs/atmosphere-clouds-effects/README.md`
- `AgentDocs/atmosphere-clouds-effects/plans/2026-08-14-atmosphere-clouds-effects-extension.md`
- `AgentDocs/atmosphere-clouds-effects/plans/2026-08-15-phase-a3-exponential-height-fog.md`
- `AgentDocs/atmosphere-clouds-effects/discussions/2026-08-15-a3-default-fog-washout.md`
- this review

Generated shader modules, declarations, docs, bundles, and package outputs were
used for validation only and remain ignored/untracked.

## Contract and behavior evidence

- Public Specs cover exact defaults/ranges/types, warm setters, same-value and
  inactive/disconnected request semantics, no resource reload/recompile, and
  native `scene.fog` conflict/retry behavior.
- CPU/source fixtures cover planar horizontal/vertical/base/falloff branches,
  Globe ground/tangent/high transport against an adaptive double reference,
  fixed sample bounds, start distance, 300-km cap, maximum opacity, and finite
  saturation.
- Fixed-reference fixtures prove unattenuated ambient/directional component
  maxima are at most one, decreasing Sun transmittance decreases magnitude, and
  ground occlusion/night is zero.
- Raw-half and real-Context fixtures cover fog identity, fog-only/combined,
  alpha, clear depth, A2 scale isolation, linear/log depth, both frusta, and
  high outside-layer intersecting/nonintersecting rays.
- Lifecycle fixtures retain A2 program/FBO/texture counts and candidate,
  resize, failure, disconnect, retry, and destroy behavior.

## Direct-page evidence

The final Globe diagnostic uses two opaque same-material targets at explicit
world positions. It refuses comparison unless both projections are finite,
both full `48×48` ROIs are inside the canvas, ROIs do not overlap, and distances
are ordered. No fallback ROI remains for Globe target evidence.

- Globe distances: `11.50 < 39.40 km`;
- Globe fog-only ROI means: `12.17 < 49.51`, margin `37.34`;
- Globe fog-only full-frame/ground ROI: `7.07/3.69`;
- Planar fog-only ROI means: `5.40 < 99.59`, margin `94.19`;
- Planar fog-only full-frame/ground ROI: `15.37/4.37`;
- both near/far target pairs are nonidentity;
- Planar yellow comparison box retains visible A2 color separation.

The page also exposes independent A3 controls, Perspective/Orthographic
switches, day/sunset/night, ground/air/120-km-high/high-miss presets, independent
pass diagnostics, native/simple conflict, and retry. The final 24-state smoke
reports both controllers ready, page errors `0`, and external requests `0`.

Untracked local visual artifacts:

- `a3-ground-day-fog-only-diagnostic-final.png`
- `a3-ground-day-combined-final.png`
- `a3-ground-sunset-combined-final.png`
- `a3-ground-night-combined-final.png`
- `a3-high-day-combined-final.png`
- `a3-high-miss-day-combined-final.png`

## Validation

| Validation                                          | Result                                                    |
| --------------------------------------------------- | --------------------------------------------------------- |
| Focused controller + A1 pipeline real-Context Specs | `41/41` passed (`34` controller + `7` pipeline)           |
| A1 advanced render-slot Specs                       | `5/5` passed                                              |
| A1 reference-frame Specs                            | `4/4` passed                                              |
| `Scene/Scene` aggregate boundary                    | `432/432` passed                                          |
| `npm run build` / `build-release`                   | passed                                                    |
| `npm run build-ts` / `build-docs` / `tsc`           | passed; existing TSD-JSDoc warnings only                  |
| Installed-package verifier                          | passed; `20/20` GLSL/modules and exact runtime/types/docs |
| LUT importer/generator tests                        | `14/14` passed                                            |
| Globe and Planar LUT `--verify-only`                | passed; bytes/hashes unchanged                            |
| Local Chromium narrow gate / 24-state smoke         | `24/24`; render/browser/panel errors `0`, external `0`    |
| Changed-scope ESLint/Prettier/Markdownlint          | passed                                                    |
| `git diff --check` / exact upstream files           | passed                                                    |
| Official upstream/generated audit                   | current-delivery upstream-owned `0`, generated `0`        |

## Deviations and review focus

There is no architecture or resource-scope deviation. Four implementation-time
corrections are recorded for focused review:

1. ADR-0045's Architecture-approved calibration amendment changed the two exact
   defaults and source normalization after the first visual stopping gate.
2. Architecture authorized a Test-only Globe target/framing correction after
   proving the prior fallback ROI was invalid product evidence.
3. The installed-package verifier exposed one-line A3 property JSDoc that did
   not generate public instance declarations. The source comments were expanded
   to the established multiline form; runtime behavior and public names did not
   change.
4. Architecture review exposed float32 cancellation in the Planar analytic
   integral and stale error-bearing screenshots. The stable ratio formulation,
   strict render-error-aware smoke, and final-source artifact regeneration are
   limited to the accepted A3 numeric and Test evidence contracts.

Architecture should independently inspect integral/error fixtures, fixed-source
normalization, composition/clear-depth branches, unchanged resource counts,
public type/docs delivery, and the explicit Globe projection/ROI proof.

## Ownership, SGP, and remaining risks

- A3 working diff upstream-owned files: `0`.
- `packages/engine/Source/Scene/Scene.js`, both SGP-0008 ranges, and
  `.scenegis/upstream-patches.json` are exactly unchanged.
- Active `SGP-0008` is consumed only; no new SGP is required.
- Generated delivery status: `0`.
- Globe and Planar LUT assets/hashes are unchanged.
- Full `16429`-Spec suite was not run. The focused/A1/aggregate boundary is the
  intentional minimum sufficient scope.
- Local screenshots and numeric gates are regression evidence, not the project
  owner's visual judgment. Owner gate remains blocked until Architecture review
  approves this retained tree.
- The working tree is intentionally uncommitted and unpushed. A4 is inactive.
