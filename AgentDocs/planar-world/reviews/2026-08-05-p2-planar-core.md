# Review Request：P2 平面坐标与瓦片 Core

## Metadata

- Status：`approved`
- Requester role：`execution`
- Reviewer role：`architecture`
- Created：`2026-08-05`
- Updated：`2026-08-05`
- Review target：`feature/planar-world` working tree relative to `2554e3882d`
- Related plan：
  [P2 planar core plan](../plans/2026-08-05-phase-2-planar-core.md)
- ADR：
  [ADR-0002 planar coordinate and tiling contract](../../../Documentation/SceneGIS/Decisions/ADR-0002-planar-coordinate-and-tiling-contract.md)
- SGP：无

## Scope

- `SceneGISPlanarExtent` 的只读矩形范围、clone、exact equals、inclusive contains
  和错误输入。
- `SceneGISPlanarCoordinateSystem` 的 extent ownership、strict-square、米制固定轴向
  和 opaque CRS。
- `SceneGISPlanarTilingScheme` 的单 root、northwest-origin XYZ、boundary math、
  `maximumSafeLevel`、点寻址和 result reuse。
- 公共根导出、生成 types/API docs、SceneGIS-owned 路径与 upstream/SGP 审计。

P3 的 world、surface renderer、quadtree、SSE、cache、camera、picking、provider、
Widget、Viewer 和 Sandcastle 不在本 review 范围。

## Expected behavior

- Extent 允许矩形且 getter-only；coordinate system clone extent 并严格要求正方形，
  CRS 仅保留可选非空原字符串。
- Level 0 为 `1 × 1`，Level L 两轴均为 `2 ** level`；tile X 向东、tile Y 向南，
  不 wrap。
- tile 边界从 root extent 和整数 boundary index 直接计算；outer boundary 必须精确
  保留配置值且 inclusive，内部 X/Y boundary 分别归东/归南。
- extent 的派生 width/height 必须 finite。`maximumSafeLevel` 不超过 52，并保证
  accepted level 的全部边界可区分；所有寻址方法拒绝更高层级。
- `positionToTileXY` 只用 X/Y 寻址但验证有限 Z；outside 返回 `undefined`，可复用
  `Cartesian2` result。

## Affected paths

- 三个 `packages/engine/Source/SceneGIS/Core/SceneGISPlanar*.js` 公共源码文件。
- 三个对应的 `packages/engine/Specs/SceneGIS/Core/*Spec.js`。
- P2 必需的 `AgentDocs/planar-world/**` 状态、结果和本 review request。

Upstream-owned files：0。P2 SGP：0。`.scenegis/upstream-patches.json` 未修改。

## Validation evidence

- Extent Specs：9/9 success。
- Coordinate system Specs：7/7 success。
- Tiling scheme Specs：21/21 success；三组共 37/37 success。
- `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`：
  均 Exit 0；`build-ts` 只有仓库既有 TSD-JSDoc warnings。
- scoped ESLint、两组 Prettier、Markdownlint、`git diff --check`：均 Exit 0。
- 根 export 与生成声明包含三个类型；生成 API docs 包含三个类型；生成文件没有进入
  Git diff/status。

逐条命令、首次失败与修正记录见 P2 plan 的“偏差与结果”。

## Findings

| ID      | Severity | Status  | Owner role               | Location                                                                | Finding                                                                        | Required disposition / evidence                                                                                                                                                                       | Follow-up |
| ------- | -------- | ------- | ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| P2-R001 | `high`   | `fixed` | `execution`              | `SceneGISPlanarTilingScheme.js`；tiling scheme Specs                    | Boundary helper 未固定 outer edge，且 `size * index / count` 会中间 overflow。 | index `0`/`count` 直接返回原始端点；内部改为 `size * (index / count)`。`[-1e16, 1]` Level 0 exact 与 `[0, 1e308]` Level 1 四瓦片 finite/shared/outer-exact Specs 通过；tiling 21/21。                 | P2        |
| P2-R002 | `high`   | `fixed` | `architecture/execution` | `SceneGISPlanarTilingScheme.js`；ADR-0002；P2 plan；tiling scheme Specs | 首末 sampling 不能保证中间 boundary 可区分。                                   | 改用 `idealSpacing > ULP(size) + max(ULP(min), ULP(max))` 的全域保守上界，并单独验证 outer-adjacent boundaries。反例上限降至 31；最高层首、内部、末代表 tiles 可构造，Level 32 被拒绝；tiling 21/21。 | P2        |
| P2-R003 | `medium` | `fixed` | `architecture/execution` | `SceneGISPlanarExtent.js`；ADR-0002；P2 plan；extent Specs              | finite endpoints 可能产生 Infinity span。                                      | extent 构造期统一拒绝 non-finite width/height；X/Y 两个 `±Number.MAX_VALUE` overflow Specs 通过，既有负坐标、EPSG:3857 和大坐标小 extent 回归通过；extent 9/9、tiling 21/21。                         | P2        |
| P2-R004 | `low`    | `fixed` | `execution`              | P2 plan 与本 review validation evidence                                 | 原结果把 33 个 Specs 误记为 35。                                               | 已按最终 runner 输出记录 Extent 9/9、CoordinateSystem 7/7、TilingScheme 21/21，总计 37/37。                                                                                                           | P2        |

## Validation reviewed

- Reviewer 重新运行
  `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanar"`：Exit 0，
  33/33 success。现有 Specs 通过，但不覆盖 P2-R001 至 P2-R003 的数值反例。
- Reviewer 确认 source dependencies 只指向 Cesium Core/SceneGIS Core；公共 basename、
  default export、生成声明和 readonly 类型形状符合 engine 规则。
- Reviewer 以 `2554e3882d` 审计 status、tracked diff 与 untracked files：实现文件
  全部位于 `packages/engine/Source/SceneGIS/Core`、镜像 Specs 或 AgentDocs；
  upstream-owned files 为 0，P2 SGP 为 0，`.scenegis/upstream-patches.json` 未变。
- Reviewer 复现 P2-R001：`[-1e16, 1]` 的 Level 0 root `maximumX` 为 `0` 而不是
  `1`；`[0, 1e308]` 的 Level 1 中三个 tiles 无法构造。
- Reviewer 复现 P2-R002：上述现实量级 fixture 报告 `maximumSafeLevel === 32`，
  但合法内部 tile index `2968473518` 仍因 boundary collapse 抛出
  `DeveloperError`。
- Reviewer 复现 P2-R003：finite endpoints 从 `-Number.MAX_VALUE` 到
  `Number.MAX_VALUE` 被 coordinate system 接受，但派生 span 为 Infinity，Level 0
  tile 无法构造。

## Fix validation

- Reviewer 重新运行
  `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanar"`：Exit 0，
  37/37 success。
- `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarExtent"`：Exit 0，
  9/9 success。
- `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarCoordinateSystem"`：
  Exit 0，7/7 success。
- `npm run test -- --includeName "SceneGIS/Core/SceneGISPlanarTilingScheme"`：
  Exit 0，21/21 success；三组总计 37/37。
- `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`：
  均 Exit 0；`build-ts` 仅输出仓库既有 TSD-JSDoc warnings。
- scoped ESLint、两组 Prettier、Markdownlint、`git diff --check`：均 Exit 0。
- 生成 root exports/types/API HTML 均包含三个 P2 类型，生成文件未进入 diff/status。
- 相对 `2554e3882d` 的 upstream-owned files 为 0，P2 SGP 为 0，
  `.scenegis/upstream-patches.json` 无差异。
- Reviewer 确认原内部边界反例现在得到 `maximumSafeLevel === 31`，Level 31 的首、
  内部和末代表瓦片均有效，Level 32 由公共入口拒绝。
- Reviewer 以固定随机序列对 83,284 个跨 JavaScript `Number` 指数范围的有限 extent
  执行 review-only 数值压力检查，覆盖 20,813,082 个 accepted boundaries；未发现
  边界坍缩或非有限值。
- Reviewer 重新运行 scoped ESLint、code Prettier、Markdownlint 和
  `git diff --check`：均 Exit 0。

## Accepted risks

- strict-square 不使用 epsilon，调用方必须自行归一化外部范围。
- `maximumSafeLevel` 只表达数学寻址安全，不表达 provider 数据可用性。
- 公共 `tileXYToExtent` 每次分配只读 extent；P2 不为未测量的后续热路径引入
  public result mutation。

P2-R001 至 P2-R003 的数值正确性问题不是 accepted risk。

## Conclusion

P2-R001 至 P2-R004 已由 Architecture Agent 复核为 `fixed`，没有新增 finding。
P2 architecture/code review 结论为 `approved`，阶段完成门槛已满足。

## Remaining risks

- 未运行完整 Specs、WebGL、Sandcastle、E2E、像素或性能测试；P2 是纯 Core 数学，
  没有 DOM、WebGL、资源或渲染行为。
- P3 必须把 provider `maximumLevel` 与本类型的 `maximumSafeLevel` 分离，但该设计
  不在本 review 或 implementation 范围。

## Stage gate

P2 已完成。按项目负责人约定，Architecture Agent 先提交本阶段代码与文档，然后
停在阶段边界讨论 P3；P3 在 phase plan 获批前保持 `pending`，不得开始实现。
