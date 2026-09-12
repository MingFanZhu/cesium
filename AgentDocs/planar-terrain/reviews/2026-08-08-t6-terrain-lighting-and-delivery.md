# Review：T6 平面地形基础光照与交付收尾

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-08`
- Updated: `2026-08-08`
- Review target: branch `feature/planar-terrain` 相对
  `1cafd98ed07fda045833b4fca0c14f9004b8e0f6` 的完整working-tree diff
- Related plan:
  [T6 phase plan](../plans/2026-08-08-phase-t6-terrain-lighting-and-delivery.md)
- Related ADR:
  [ADR-0012](../../../Documentation/SceneGIS/Decisions/ADR-0012-planar-terrain-lighting-and-geometric-normals.md)
- Related patch: None；T6 SGP=`0`

## Scope

请Architecture Agent评审：

1. World lighting constructor/property契约、默认兼容和原子validation；
2. private lit/unlit shader source、geometric normal、face-forward、Lambert与imagery合成顺序；
3. layer+lighting cache identity、single command mutation、uniform-only multiplier和depth replay；
4. real Context pixel/warm/below-surface/resource evidence；
5. terrain Sandcastle stable light/toggle/mountain view以及文档/upgrade/Worker结论；
6. 相对base的zero-upstream、zero-SGP、zero-generated delivery边界。

## Implementation summary

- `SceneGISPlanarWorld`新增`enableLighting=false`与`lambertDiffuseMultiplier=0.9`。
- Surface shader按lighting生成独立variant，lit路径从eye-space render triangle求screen-derivative
  normal；baseColor与imagery合成后统一乘light color和Lambert intensity。
- Surface cache key为`layerCount/lighting`，existing tile DrawCommand保持identity；multiplier从stable
  uniform closure读取，depth replay继续精确重放normal-render command。
- Terrain Sandcastle显式配置normalized `DirectionalLight`、默认启用lighting，并提供toggle、mountain
  view和Home。
- Architecture、DevelopmentGuide、PlanarWorldGuide与UpgradeChecklist已按T1-T6真实能力更新。

## Validation evidence

- Shader `3/3`、World `19/19`、Surface suite `25`（aggregate `28/28`含Shader `3`）、terrain Widget
  `1/1`、imagery Widget `9/9`，五个focused suite aggregate合计`57`。相对T5 base新增direct `it`
  cases为`3`（World、Shader、Surface各`1`）；World/Shader/terrain Widget另有既有case扩展断言，imagery
  Widget未修改。
- Real Context固定local fixture证明lit/unlit/ambient pixels不同且finite，single command、warm
  command/shader/uniform identity、allocation/resource counters、below-surface双面和destroy balance。
- `npm run build`、`build-ts`、`build-docs`、`tsc`均Exit 0；build-ts仅仓库既有warnings。
- no-embedding gallery与Sandcastle均Exit 0，gallery processed `306` examples；Vite只有plugin timing与
  large chunk warnings。
- Generated declarations与API HTML包含World两个options/properties；private shader不进入types/API。
- changed-scope ESLint/Prettier、Markdownlint、`git diff --check`均Exit 0；upstream audit Exit 0，
  upstream-owned files=`0`、T6 SGP=`0`、manifest/SGP-0001/0002 unchanged、new markers=`0`、generated
  status=`0`。

## Findings

| ID      | Severity | Status | Owner role | Location                                                                                   | Finding                                                                                                                                                                                                                                      | Disposition / evidence                                                                                                                                                                                                                              | Follow-up                                                             |
| ------- | -------- | ------ | ---------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| T6-R001 | medium   | fixed  | execution  | `Documentation/SceneGIS/PlanarWorldGuide.md`、`Documentation/SceneGIS/DevelopmentGuide.md` | 使用指南仍写成`world.tilesLoaded`“只描述”shown imagery desired tiles；实际Surface契约已在T2/T3扩展为current-view terrain coverage/readiness与shown imagery readiness的合取。应用若据此判断地形是否稳定，会在terrain仍pending时得到错误理解。 | 两份durable docs现将总语义写为current-view terrain coverage/readiness与shown imagery readiness的合取；desired + Level 0 bootstrap/READY ancestor明确只属于imagery contribution，并保留recoverable pending与terminal failure + stable fallback边界。 | Markdown Prettier/Markdownlint、`git diff --check` Exit 0。           |
| T6-R002 | low      | fixed  | execution  | T6 phase plan“Source-to-Spec mapping”、本review“Validation evidence”                       | `57`是五个focused suite的aggregate case数，其中base已存在World 18、Shader 2、Surface 24、terrain Widget 1和未修改imagery Widget 9；它不是T6新增的`direct unique`总数。当前写法会把既有回归用例误记为本阶段新增证据。                         | Phase/review现将`57`标为focused aggregate cases；另记T6新增direct `it` cases=`3`（World、Shader、Surface各`1`），并区分既有World/Shader/terrain Widget扩展断言与未修改imagery回归。                                                                 | AgentDocs Markdown Prettier/Markdownlint、`git diff --check` Exit 0。 |

Architecture reviewer独立核对了相对T5 checkpoint的完整working-tree diff、World→Surface状态传递、
lit/unlit shader source、shader/command/uniform cache更新、normal-render/depth replay顺序、真实Context像素与
Sandcastle组装。独立focused复核结果：World `19/19`、Surface/Shader aggregate `28/28`、terrain Widget
`1/1`，均Exit 0。代码实现、资源生命周期、公开API、允许路径与zero-upstream/zero-SGP边界没有发现
未解决问题；本轮changes request仅限上述文档事实与证据计数修正。

### Architecture focused re-review evidence

Architecture reviewer逐项确认两份durable docs中的`tilesLoaded`联合语义、imagery contribution边界和
recoverable/terminal状态均已纠正；phase/review也已准确区分`57`个focused aggregate cases、`3`个T6
新增direct cases与既有case扩展。独立运行四份affected Markdown的Markdownlint及`git diff --check`，
均Exit 0。`T6-R001`与`T6-R002`均确认为`fixed`，没有unresolved code或documentation finding；因本轮
仅修改文档，没有重复产品Specs或build矩阵。

## Accepted risks 与人工验收

- Per-triangle geometric normals和LOD replacement可能有明暗变化；不承诺smooth normals。
- Public terrain/imagery service仍受CORS、policy和SLA影响；自动化不访问公网。
- `0.287 s`只是Chrome 151下完整real-Context case的粗粒度runner timing，不构成lighting性能阈值。
- 没有可重复的main-thread阻断证据，T6不引入Worker或byte budget。
- 项目负责人已在真实浏览器/GPU打开terrain Sandcastle，确认页面与地形画面可用，并在讨论固定
  `DirectionalLight`、默认SunLight不具有任意planar CRS语义后明确批准T6。人工completion gate已关闭。

## Conclusion

Architecture/code review结论为`approved`。World lighting API、fragment geometric normal、shader/
command/uniform生命周期、真实Context证据、Sandcastle组装、durable docs与zero-upstream边界均成立，
`T6-R001`和`T6-R002`已由Architecture reviewer确认修复。项目负责人真实浏览器/GPU人工验收已通过，
并接受固定`DirectionalLight`与未改造planar Sun语义的既定边界。T6与`planar-terrain` extension可以
标记为`completed`并形成独立阶段提交。
