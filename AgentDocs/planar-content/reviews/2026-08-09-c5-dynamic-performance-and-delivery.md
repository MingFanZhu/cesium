# Review：C5 动态更新、批量性能与交付

## Metadata

- Status: `approved`
- Reviewer role: `architecture`
- Created: `2026-08-09`
- Updated: `2026-08-09`
- Review target: branch `feature/planar-content`相对planning checkpoint
  `37039ad9cbae63587708bcf0a2225f8cc544840b`的完整working-tree diff
- Related plan:
  [C5 phase plan](../plans/2026-08-09-phase-c5-dynamic-performance-and-delivery.md)
- Related ADR:
  [ADR-0017](../../../Documentation/SceneGIS/Decisions/ADR-0017-planar-content-qualification-and-batching-boundary.md)
- Related patch: None；C5 SGP=`0`

## Review target

请Architecture Agent评审：

1. 固定moderate profile的initial/warm/local mutation/terrain refresh和三次small lifecycle baseline；
2. baseline未显示可重复private hotspot时保持product runtime delta=`0`，没有引入跨Entity batching；
3. local dev/release E2E的automatic CustomDataSource、六类内容、selection、dynamic/remove/destroy与zero-network；
4. `scenegis-planar-content` Sandcastle的EPSG:3857、六类content、高度、local Model、有限控件、Credit与
   best-effort网络边界；
5. installed-tarball private runtime delivery、non-underscore runtime absence、underscore soft-private JS export与
   declarations/API隐藏，以及zero-upstream/zero-SGP/generated-clean审计。

## Implementation summary

- 新增qualification suite，固定`256` Point、`128` Billboard、`128` Label、`64` Polyline、`32`
  Polygon，另以两个共享local glTF Model验证async/transform/release；`20` warm frames、`5` mutation rounds和
  `3`轮small Point+Polyline lifecycle baseline均通过。Show/availability、remove/re-add与Model stale/late边界
  明确复用C2/C4 approved Specs，不计入C5 direct。
- Baseline没有可重复SceneGIS runtime热点；C1-C4 product runtime完全未修改，product runtime delta=`0`。
- 新增local-only Playwright和稳定Sandcastle；新增installed-tarball private file、non-underscore runtime absence、
  underscore soft-private JS presence与declarations/API absence断言；更新PlanarContentGuide和upgrade checklist。
- C5 direct unique cases=`4`：qualification`3`、E2E`1`。C4 callback`8`、engine Widget`4`、widgets Viewer
  `2`是aggregate regression，不重复计数。

## Validation evidence

- Qualification `3/3`、C4 callback `8/8`、C4 engine Widget `4/4`、C4 widgets Viewer `2/2`，均Exit `0`。
- Timing：Chrome `151.0.0.0`、Windows、real WebGL、`256×256`；20 warm frames后五组四调用归一化，
  update median/P95=`1.525/1.650 ms`，render median/P95=`0.575/0.700 ms`。只作同机baseline，不设硬阈值。
- `npm run build`、`build-release`、`build-ts`、`build-docs`、`tsc`均Exit `0`；`build-ts`只有仓库既有
  TSD-JSDoc warnings。
- dev bundle E2E `1/1`、release bundle E2E `1/1`；临时static server/config/artifacts位于仓库外并已清理，
  公网attempt、pageerror与未过滤console error均为`0`。
- `node scripts/scenegis/verify-planar-packages.mjs` Exit `0`：bare ESM/CJS、tar content、non-underscore runtime
  absence、underscore soft-private JS presence、declarations/API exact absence和broken-entry fixture通过。
- no-embedding gallery Exit `0`，processed `307` examples；no-embedding Sandcastle build Exit `0`，仅既有
  plugin timing和large chunk warning。
- Scoped ESLint、JS/HTML/YAML/Markdown Prettier、Markdownlint与`git diff --check`均Exit `0`；diff check
  只输出既有LF/CRLF转换warning。Official upstream audit Exit `0`：`3`个历史registered upstream-owned
  entries、current delivery upstream-owned entries=`0`、`86` marker tokens、generated status=`0`。

## Ownership and delivery audit

- Upstream-owned product/test/build files=`0`；C5 SGP=`0`；new `SCENEGIS_PATCH` markers=`0`。
- `packages/engine/Source/Scene/Scene.js`、`packages/engine/Source/Widget/CesiumWidget.js`、
  `packages/widgets/Source/Viewer/Viewer.js`、`.scenegis/upstream-patches.json`和`SGP-0001/0002` hunks unchanged。
- Public API delta=`0`。七个C1-C4 private content modules存在于engine tarball；其underscore symbols可由自动
  JS barrel导出但不受支持，exact symbols在engine/root/Cesium d.ts与API HTML命中`0`，对应non-underscore
  spellings在engine/root runtime为undefined。
- Generated files、Build、SpecList、timing/profile、Playwright artifact、temporary tarball/config/server均不进入
  working-tree delivery；commit/push/tag/publish均未执行。

## Findings

- `C5-R001`（medium，fixed）：qualification与交付文档对lifecycle hard gate的表述强于直接证据。
  三次cycle目前只在remove后检查`EntityCollection` listener，并在Widget destroy后检查DOM；没有检查
  `source._primitives`回到baseline或`ControllerHost`恢复。phase中计划的show/availability、remove/re-add和
  async Model stale settlement也没有出现在C5 direct suite中。鉴于C5 product runtime delta=`0`，不要求重新建立
  六类内容的大型lifecycle矩阵；应补最小primitive/controller断言，并把其余边界明确引用到已批准的C2/C4
  Specs，或收窄C5结果措辞，不能把未执行项写成C5 direct hard-gate evidence。

  Execution disposition：三轮cycle锁定`source._primitives` remove-release baseline=`0`并保存ControllerHost
  引用/count baseline；remove后primitive container/listener恢复，Widget destroy后controller count/DOM恢复。
  Phase/review/guide将它收窄为small
  lifecycle baseline，并明确show/availability、remove/re-add、Model stale/late settlement复用C2/C4 approved
  Specs而非C5 direct evidence。Qualification `3/3` Exit `0`。

- `C5-R002`（medium，fixed）：Sandcastle的batch控制没有处理`DataSourceCollection.add`始终通过Promise完成的
  语义。`addBatch`在`await`前就报告成功；快速重复Add或Add后立即Remove时，`contains(batch)`仍可能为false，
  从而产生重复/迟到add，Remove也可能无法撤销pending add。有限动态运行到120步后再次勾选也只执行一个step，
  不是可重复的有限控制。应序列化add/remove或显式维护pending状态，并让每次重新启用有限动态都从确定状态开始。

  Execution disposition：示例以`batchDesiredPresent`和唯一`batchSyncPromise`串行收敛add/remove；重复Add只复用
  pending operation，Add后立即Remove会等待add后再移除，成功status只在对应Promise/remove完成后更新，failure
  清理未加入batch entities。每次重新勾选dynamic toggle都重置point/label和`dynamicStep=0`，随后最多执行120步。
  No-embedding Sandcastle build Exit `0`。

- `C5-R003`（medium，fixed）：installed-package smoke把non-underscore public spelling与真正的underscore private
  symbol混在`privateNames`中。当前声明/API检查只搜索`SceneGISPlanarPositionResolver`等名称，无法发现
  `_SceneGISPlanarPositionResolver`泄漏；与此同时生成JS barrel按既定soft-private规则确实导出underscore
  symbol，因此phase中“symbol不进入root exports”的表述也不准确。应分离两组断言：non-underscore spelling
  不得成为runtime public入口；underscore exact symbol不得进入`.d.ts`或API HTML；JS barrel中的underscore
  export只记录为不受支持的构建产物，不要求物理隐藏。

  Execution disposition：smoke拆分`nonPublicSpellings`与`softPrivateContentSymbols`。前者继续在installed engine/
  root ESM和root CJS断言undefined；后者明确断言自动JS barrel存在，同时在installed engine/root/Cesium d.ts及
  API HTML按exact underscore name断言不存在，tar file presence保持。Package smoke Exit `0`。

## Accepted risks

- Timing是单机调查数据，不是跨机器performance threshold；当前没有candidate runtime delta。
- Sandcastle的OSM/LERC为best-effort人工展示，受公网、CORS与服务策略影响；自动化完全本地且不预取。
- Buffer collections仍为experimental upgrade-sensitive dependency；upgrade checklist已记录，private symbol不构成
  supported public API。
- 项目负责人尚未完成真实浏览器/GPU Sandcastle视觉与交互门禁。

## Focused re-review

- Architecture逐项复核`C5-R001`～`C5-R003`的代码与文档处置，确认small lifecycle baseline、异步batch
  desired-state收敛、可重复有限动态，以及soft-private runtime/declaration/API边界均符合裁决。
- Architecture独立复跑
  `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarContentQualification"`：`3/3 SUCCESS`，Exit
  `0`；仅既有Node `DEP0060` warning。
- Architecture独立复跑`node scripts/scenegis/verify-planar-packages.mjs`：Exit `0`；installed ESM/CJS、
  tar presence、underscore soft-private JS presence、exact declaration/API absence和broken-entry fixture通过。
- Sandcastle修复只改变示例控制状态机；Architecture代码复核确认pending add会继续收敛到最新desired state，
  Execution提供的no-embedding Sandcastle build Exit `0`证据可接受，不重复扩大构建矩阵。

## Conclusion

Architecture focused re-review确认`C5-R001`～`C5-R003`全部关闭，C5 architecture/code/release-evidence
review结论为`approved`。C5实现可形成独立本地提交检查点；C5 phase与extension仍保持`active`，下一门禁为
项目负责人的真实浏览器/GPU Sandcastle人工验收。未经明确人工批准不得标记extension `completed`，不push。
