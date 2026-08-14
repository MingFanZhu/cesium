# Review: I4 Planar Scene API Qualification and Safety

## Metadata

- Status: `approved`
- Manual gate: `passed`
- Requested by: Execution Agent
- Reviewer: Architecture Agent
- Date: `2026-08-14`
- Base: `dfc8be40a92503b01b8ae9938a0e2ae581e3a878`
- Architecture checkpoint: `22bd7e1c29`（`实现平面 Scene API 安全边界`，not pushed）
- Phase plan: [I4](../plans/2026-08-14-phase-i4-planar-scene-api-safety.md)
- ADR: new proposed `ADR-0039`; amended `ADR-0006`; dependency `ADR-0037`
- SGP: proposed `SGP-0007`; existing-purpose `SGP-0001`, `SGP-0002`, `SGP-0004`

## Review request

请Architecture审查I4的Scene API资格矩阵、constructor/frame safety transaction、height/clamp与Camera globe-only guards、
SGP/ADR边界、real-Context evidence及installed delivery。当前working tree未commit/未push，未请求manual gate，未进入I5。

## Architecture review findings

### I4-R001 — Medium — I4 native-sky policy must supersede the earlier E4 public wording consistently

I4的frame-start guard会在任何live non-Globe Scene中拒绝visible native `scene.skyBox`，但
`PlanarWorldGuide.md`仍明确告诉调用方：只显示planar atmosphere时可以保留native generic SkyBox作为background。
`ADR-0036`、`Architecture.md`与`PlanarWorldUpgradeChecklist.md`也继续把已经执行的native SkyBox/SkyAtmosphere opaque mask写成
E4的正常public/upgrade路径。按当前I4实现照旧使用这段文档配置，`Scene.updateFrameState`会在E4 renderer之前同步抛
`DeveloperError`，因此正式文档同时承诺了互斥行为。

统一这些长期契约：明确ADR-0039/I4已取代“planar atmosphere + visible native generic background”的public配置；
`SceneGISPlanarEnvironment`是live non-Globe Scene唯一受支持的sky/atmosphere/body路径。若保留E4 renderer中的opaque mask分支，
只能把它记录为不对应用开放的defensive/private compatibility seam，不得继续指导调用方配置native sky。同步修订
`ADR-0036`、Guide、Architecture与UpgradeChecklist中的相关措辞，并在当前I4 phase/review/handoff记录supersession。
这是文档修正，不修改renderer、Environment或I4 guard，不需要重跑产品测试/build/package/browser。

## Architecture review disposition

- Result: `changes-requested`。
- I4产品实现、failure atomicity、SGP边界与现有自动化证据暂未发现其他阻断项。
- Manual gate在I4-R001关闭前仍不得请求。
- Correction boundary：`ADR-0036`、`Architecture.md`、`PlanarWorldGuide.md`、
  `PlanarWorldUpgradeChecklist.md`及现有I4 AgentDocs；不得修改产品、Specs、Test示例或SGP manifest。
- 只需执行affected docs Prettier/Markdownlint与`git diff --check`；不重跑测试、build、package、browser、full suite、E2E或
  Sandcastle。

## Implementation summary

- `_SceneGISPlanarSceneApi`按live non-Globe primary World提供无CRS推断的共享判定、constructor preflight、Fog
  normalization、frame-start native-effect validation与height/clamp synchronous guard。
- `Scene.js`新增proposed `SGP-0007`；world installation继续使用existing `SGP-0001`。`Camera.js`、
  `CesiumWidget.js`、`Viewer.js`只在`SGP-0004/0001/0002`既有目的内增加最小委托，没有第二个upstream file或nested marker。
- Generic Cartesian screen/drawing-buffer/depth/terrain/ray继续复用Cesium实现；ellipsoid height/clamp、Rectangle/Ellipsoid Camera
  methods、native Earth environment/Fog/Shadow在错误语义前fail-fast。`positionCartographic`和`Scene.ellipsoid`明确为
  internal-only substrate。
- Direct Test只增加中文Scene API safety folder；verifier锁定private hiding、installed JSDoc/API anchors与既有12+12 shader交付。

## Exact changed paths

1. `.scenegis/upstream-patches.json`
2. `packages/engine/Source/Scene/Scene.js`
3. `packages/engine/Source/Scene/Camera.js`
4. `packages/engine/Source/Widget/CesiumWidget.js`
5. `packages/widgets/Source/Viewer/Viewer.js`
6. `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarSceneApi.js`
7. `packages/engine/Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js`
8. `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarSceneApiCesiumWidgetSpec.js`
9. `packages/engine/Specs/SceneGIS/Widget/SceneGISPlanarCameraCesiumWidgetSpec.js`
10. `packages/engine/Specs/SceneGIS/Widget/SceneGISWorldCesiumWidgetSpec.js`
11. `packages/widgets/Specs/SceneGIS/SceneGISPlanarViewerSpec.js`
12. `Documentation/SceneGIS/Decisions/ADR-0039-planar-scene-api-qualification-and-safety.md`
13. `Documentation/SceneGIS/Decisions/ADR-0006-planar-viewer-and-widget-integration.md`
14. `Documentation/SceneGIS/Architecture.md`
15. `Documentation/SceneGIS/DevelopmentGuide.md`
16. `Documentation/SceneGIS/PlanarWorldGuide.md`
17. `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
18. `Test/平面API集成.html`
19. `scripts/scenegis/verify-planar-packages.mjs`
20. `AgentDocs/planar-api-integration/README.md`
21. `AgentDocs/planar-api-integration/plans/README.md`
22. `AgentDocs/planar-api-integration/plans/2026-08-14-planar-api-integration-extension.md`
23. `AgentDocs/planar-api-integration/plans/2026-08-14-phase-i4-planar-scene-api-safety.md`
24. `AgentDocs/planar-api-integration/reviews/README.md`
25. `AgentDocs/planar-api-integration/reviews/2026-08-14-i4-planar-scene-api-safety.md`
26. `Documentation/SceneGIS/Decisions/ADR-0036-planar-atmosphere-skybox.md`（I4-R001 correction）

Architecture-owned `AgentDocs/planar-viewer-bootstrap/README.md`与其extension plan baseline不属于I4，保持原样。
Owner `Test/地形.html`未读取、修改或暂存。

## Automated evidence

| Scope                                               | Result                                                 |
| --------------------------------------------------- | ------------------------------------------------------ |
| Scene API real-Context and safety                   | `TOTAL: 3 SUCCESS`                                     |
| World constructor preflight                         | `TOTAL: 25 SUCCESS`                                    |
| public Camera real-Context guard                    | `TOTAL: 3 SUCCESS`                                     |
| private planar Camera aggregate                     | `TOTAL: 68 SUCCESS`                                    |
| live/declarative planar Viewer                      | `TOTAL: 23 SUCCESS`                                    |
| upstream Camera                                     | `TOTAL: 241 SUCCESS`                                   |
| upstream CesiumWidget                               | `TOTAL: 75 SUCCESS`                                    |
| upstream Scene include aggregate                    | `TOTAL: 392 SUCCESS`                                   |
| build / build-release / build-ts / build-docs / tsc | passed                                                 |
| installed package verifier                          | passed; `12/12` GLSL, `12/12` generated shader modules |
| direct Test blocked-network Chromium                | passed; no page/unexpected console errors              |
| scoped static / diff / official audit / status      | passed; generated=`0`                                  |

The real-Context cases cover same-frame preRender native conflicts, recovery and warm Surface identities; high-DPI screen/drawing-buffer
coordinates; Perspective/Orthographic depth terrain and ordinary ray consistency. Existing Content/Viewer qualification remains the actual
pick/drill-object evidence; I4 deliberately does not duplicate that matrix. Direct Test smoke exercised both new Chinese actions, confirmed
resolved World identity, false height capability flags, credit-safe compact layout and persisted/non-persisted pagehide lifecycle.

## Ownership, deviations, and remaining gates

- Upstream-owned changed files=`4`: `Scene.js`, `Camera.js`, `CesiumWidget.js`, `Viewer.js`.
- SGP-0007 is proposed and only registers `Scene.js`; reused SGPs keep their existing purposes. Official audit passes; generated status=`0`.
- Public profile and affected-path deviations: none. No fifth upstream file, forbidden renderer/helper, generated file or parallel facade was added.
- Unrun: full suite, E2E, Sandcastle, public-network success, 3D Tiles MostDetailed, I5 delivery matrix.
- Remaining gates: Architecture/code review, then project-owner manual Test gate if approved. No commit/push/publish/I5 entry.

## Execution response to I4-R001

- ADR-0039/I4现明确supersede E4早期“planar atmosphere + visible native generic background”的public说明；live non-Globe
  Scene的sky、atmosphere和body只允许`SceneGISPlanarEnvironment`。
- ADR-0036、Architecture、Guide与UpgradeChecklist已同步。Atmosphere renderer保留的underground opaque-mask branch仅记录为
  defensive/private compatibility seam，不对应用开放，也不再作为正常upgrade path。
- 本轮只修改上述正式文档和I4 AgentDocs；没有修改产品、Specs、Test、SGP manifest或generated files。Affected docs
  Prettier/Markdownlint及`git diff --check`通过；未重跑tests/build/package/browser/full suite/E2E/Sandcastle。
- I4-R001已addressed，请求Architecture focused re-review。Review metadata暂保持`changes-requested`，manual gate未请求，
  working tree未commit/未push，未进入I5。

## Architecture focused re-review

- I4-R001：`closed`。ADR-0036、Architecture、Guide与UpgradeChecklist现已一致声明ADR-0039/I4取代visible native generic
  background与planar atmosphere共存的public配置；live non-Globe Scene只支持`SceneGISPlanarEnvironment`的
  sky/atmosphere/body。
- Retained underground opaque-mask branch已准确收缩为private defensive compatibility seam，不再构成应用配置或正常upgrade
  promise；正式文档中未发现旧public建议残留。
- Architecture/code review：`approved`。接受既有产品、自动化、build/package、SGP/ownership与generated=`0`证据；
  Architecture未重复Execution测试。
- 下一gate仅为项目负责人在`Test/平面API集成.html`执行I4中文manual gate。通过前不commit、不push、不进入I5。

## Owner manual gate

- 项目负责人已在`Test/平面API集成.html`完成人工验收并明确通过。
- Gate覆盖中文Scene API安全边界、screen/window/drawing-buffer与terrain/depth状态、height/clamp和Camera globe-only拒绝后的
  页面恢复、I1-I3 Camera/framing/tracking non-regression及compact panel/Credit。
- Architecture/code review保持`approved`，I4-R001保持`closed`。Architecture已创建I4独立本地checkpoint `22bd7e1c29`
  （`实现平面 Scene API 安全边界`，not pushed）；I4 completed。当前等待Architecture amend状态回写，I5尚未进入。
