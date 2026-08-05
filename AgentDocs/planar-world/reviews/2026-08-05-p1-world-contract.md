# Review Request：P1 SceneWorld 契约与集成缝隙

## Metadata

- Status：`approved`
- Requester role：`execution`
- Reviewer role：`architecture`
- Created：`2026-08-05`
- Updated：`2026-08-05`
- Review target：`feature/planar-world` working tree（P1 implementation）
- Related plan：
  [P1 world contract](../plans/2026-08-05-phase-1-world-contract.md)
- ADR：
  [ADR-0001 Scene primary world contract](../../../Documentation/SceneGIS/Decisions/ADR-0001-scene-world-contract.md)
- SGP：`SGP-0001`

## Review scope

- `SceneGISWorld` 的 P1 required structural contract 是否保持最小范围。
- `Scene` 的 `_world`/`_globe` alias、listener、替换与销毁所有权。
- `CesiumWidget` 的 default Globe、`globe: false`、`world: false` 和 custom world
  构造分支。
- custom world 的 Globe-only option 错误和默认 Earth resource 隔离。
- `SGP-0001` paired hunks、ADR、公共根导出和生成声明。

P2 及之后的坐标、瓦片、surface/LOD、camera、picking、raster、Viewer 和
Sandcastle 不在本 review 范围。

## Expected behavior

- 默认 widget 满足 `scene.world === scene.globe`；no-world 和 custom world
  路径不会创建 `Globe`。
- custom world 只收到既有顺序的 frame lifecycle，并以 `tilesLoaded` 驱动
  request-render。
- custom world 与 `Globe` 互斥；默认 Globe 仍可运行时替换或移除。
- primary world、Globe listener 都只释放一次，错误路径不改变 active world。
- custom world 不自动创建 Earth skybox、Sun、Moon、sky atmosphere、imagery 或
  terrain，显式通用 environment option 仍可用。

## Upstream hunks

| File                                            | Purpose                                                                | Marker            |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ----------------- |
| `packages/engine/Source/Scene/Scene.js`         | primary world slot、只读访问器、共同生命周期、集中所有权与内部构造入口 | `SGP-0001` paired |
| `packages/engine/Source/Widget/CesiumWidget.js` | `world` option、互斥校验和 non-Globe default-resource isolation        | `SGP-0001` paired |

没有第三个 upstream-owned file，也没有 `manifest-only` hunk。

## Validation evidence

- SceneGIS contract Specs：2/2 success。
- SceneGIS widget integration Specs：16/16 success。
- `CesiumWidget`：91/91 success。
- `Globe`：126/126 success。
- `Scene/Scene`：143/143 success。
- `npm run build`、`npm run build-ts`、`npm run tsc`：Exit 0。
- scoped ESLint、两组 Prettier、Markdownlint、`git diff --check`：Exit 0。
- 根 export 与生成声明已确认包含 `SceneGISWorld`、`Scene.world` 和
  `ConstructorOptions.world`；生成文件未进入 Git diff。

逐条命令、首次失败与修正记录见 P1 plan 的“偏差与结果”。

## Findings

| ID      | Severity | Status  | Owner role  | Location                                                                                                                                           | Finding                                                                                                                                                                                                                                                                                                         | Disposition / evidence                                                                                                                                                                                                     | Follow-up |
| ------- | -------- | ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| P1-R001 | `high`   | `fixed` | `execution` | `packages/engine/Source/Widget/CesiumWidget.js`；`packages/engine/Specs/SceneGIS/Widget/SceneGISWorldCesiumWidgetSpec.js`                          | `world` 与 `world: false` 路径虽然不创建默认 skybox，却仍因 `undefined !== false` 进入现有分支并执行 `scene.sun = new Sun()`。这违反 `world: false` 的公共说明“no default Earth environment”。P1 plan 还把首次失败的 `Sun` 断言删除，并错误记录为“`Sun` 由 `Scene` 自身初始化”；实际创建点就在 `CesiumWidget`。 | skybox 分支改为仅在 `skyBox` 已定义且非 `false` 时安装 skybox/Sun；恢复 custom world 与 `world: false` 的 `scene.sun` 空值 Specs，并锁定 default Globe 与 `globe: false` 仍有 Sun。integration 16/16、CesiumWidget 91/91。 | P1        |
| P1-R002 | `medium` | `fixed` | `execution` | `packages/engine/Source/Widget/CesiumWidget.js`；生成的 `packages/engine/index.d.ts`、`Source/Cesium.d.ts`、`Build/Documentation/**`               | `SCENEGIS_PATCH` 标记写进 constructor JSDoc 正文，因此进入生成声明和公共 API 文档。补丁审计元数据不应出现在 npm 类型提示或 API 文档中。                                                                                                                                                                         | paired marker 已移到完整 constructor JSDoc 外；`build-ts` 与 `build-docs` Exit 0，两个生成声明和生成 HTML 中 `SCENEGIS_PATCH` 命中数均为 0，源码 marker 仍可搜索并配对。                                                   | P1        |
| P1-R003 | `medium` | `fixed` | `execution` | `packages/engine/Source/Scene/Scene.js`；`packages/engine/Source/Widget/CesiumWidget.js`；`packages/engine/Source/SceneGIS/Scene/SceneGISWorld.js` | 新增的 `scene.globe` 冲突错误、`CesiumWidget` option 冲突/Globe-only option 错误及接口直接实例化错误没有完整的 `@exception {DeveloperError}` 公共 JSDoc，不符合 engine 公共 API 文档约束。                                                                                                                      | 三处公共 JSDoc 均补齐英文 `@exception {DeveloperError}`；异常实现未变。`build-ts`、`build-docs`、`tsc` 均 Exit 0，并检查生成声明/API 文档。                                                                                | P1        |

## Validation reviewed

- 复核了 `Scene` constructor、`setPrimaryWorld`、`scene.globe` setter、四个
  lifecycle 调用点、`tilesLoaded` request-render 和 `Scene.destroy`。
- 复核了 `CesiumWidget` option validation、primary-world 选择和 Earth resource
  构造分支。
- 复核了两个 SceneGIS-owned Specs、`SGP-0001` manifest、全部 paired marker、
  `ADR-0001` 和生成声明。
- Reviewer 重新运行
  `npm run test -- --includeName "SceneGIS/Widget/SceneGISWorldCesiumWidget"`：
  Exit 0，16/16 success。
- Reviewer 重新运行
  `npm run test -- --includeName "SceneGIS/Scene/SceneGISWorld"`：Exit 0，2/2
  success；重新运行 `npm run test -- --includeName "CesiumWidget"`：Exit 0，
  91/91 success。
- Reviewer 重新运行 `npm run build-ts`、`npm run build-docs`、`npm run tsc`
  与 `git diff --check`：均 Exit 0。
- Reviewer 在重新生成后审计 `packages/engine/index.d.ts`、
  `Source/Cesium.d.ts` 与 `Build/Documentation/**/*.html`：
  `SCENEGIS_PATCH` 命中数均为 0。
- Reviewer 确认 constructor marker 位于完整 JSDoc 外，并确认
  `Scene.globe`、`CesiumWidget` constructor 与 `SceneGISWorld` 的英文
  `@exception {DeveloperError}` 已补齐。
- 修复后 16 个 integration Specs 已覆盖 custom world、`world: false` 的空
  `scene.sun`，以及 default Globe、`globe: false` 的既有 Sun 行为。

## Fix validation

- `npm run test -- --includeName "SceneGIS/Scene/SceneGISWorld"`：Exit 0，2/2。
- `npm run test -- --includeName "SceneGIS/Widget/SceneGISWorldCesiumWidget"`：
  Exit 0，16/16。
- `npm run test -- --includeName "CesiumWidget"`：Exit 0，91/91。
- `npm run build`、`npm run build-ts`、`npm run build-docs`、`npm run tsc`：
  均 Exit 0。
- scoped ESLint、两组 Prettier、Markdownlint、`git diff --check`：均 Exit 0。
- 生成的 `packages/engine/index.d.ts`、`Source/Cesium.d.ts` 和
  `Build/Documentation/**/*.html` 均不含 `SCENEGIS_PATCH`。

## Accepted risks

- `Scene.js` 与 `CesiumWidget.js` 仍是 `high` risk 上游升级点；通过
  `SGP-0001` 和 ADR upgrade checkpoint 接受该风险。
- P1 custom world 只具备 lifecycle contract，不支持 camera、picking、
  surface/LOD 或 Viewer；这是批准的阶段边界，不是当前 finding。

## Conclusion

P1-R001 至 P1-R003 均已由 architecture reviewer 复核为 `fixed`，没有新增
finding。P1 architecture/code review 结论为 `approved`，阶段完成门槛已满足。

## Remaining risks

- `Scene.js`、`CesiumWidget.js` 为 `high` risk 升级点；Cesium 升级时必须按
  ADR checkpoint 与 `SGP-0001` 复核。
- P1 custom world 只有 lifecycle contract；camera、picking、surface/LOD 和
  Viewer 仍明确不受支持。
- 未运行全量 Specs、Sandcastle、E2E 或性能测试；当前变更没有对应视觉、交互或
  热路径算法范围。

## Stage gate

P1 已完成。按项目负责人约定，本次评审在阶段边界停止；P2 保持 `pending`，
在下一次架构讨论和明确批准前不得开始实现或创建 phase plan。
