# E5 Review：联合资格与交付

## Metadata

- Status：`approved`
- Date：`2026-08-14`
- Phase：[E5 phase plan](../plans/2026-08-13-phase-e5-unified-qualification-delivery.md)
- Reviewer：Architecture Agent
- Commit/push/publish：None；working tree intentionally uncommitted
- ADR：None
- SGP：None；current E5 upstream-owned files=`0`

## Review request

请复核：

- Existing first blocked-network Viewer case是否通过公开bundle路径最小联合消费Environment astronomical/native Clock、visible
  Sun/Moon、atmosphere与caller-owned generated planar SkyBox，同时完整保留filter/Material/pick/depth/navigation/network-zero。
- 时间mutation是否保持Environment、body/atmosphere/SkyBox及flat Surface/imagery warm identities；真实terrain mesh由existing
  Widget aggregate覆盖；`rethrowRenderErrors`与page/browser/console error边界是否足够。
- Cleanup是否严格遵守ADR-0036：remove Environment、clear SkyBox reference、caller在live Context destroy SkyBox，再destroy
  Viewer/World；Material独立caller destroy；World/Viewer不拥有Environment/SkyBox。
- Guide/UpgradeChecklist、build/types/docs、installed 12+12 delivery与extension handoff是否足以完成E1-E5统一交付。

## Exact changed paths

- `Specs/e2e/scenegis-planar-release.spec.js`
- `Documentation/SceneGIS/PlanarWorldGuide.md`
- `Documentation/SceneGIS/PlanarWorldUpgradeChecklist.md`
- `AgentDocs/planar-environment/README.md`
- `AgentDocs/planar-environment/plans/README.md`
- `AgentDocs/planar-environment/plans/2026-08-13-planar-environment-extension.md`
- `AgentDocs/planar-environment/plans/2026-08-13-phase-e5-unified-qualification-delivery.md`
- `AgentDocs/planar-environment/reviews/README.md`
- `AgentDocs/planar-environment/reviews/2026-08-13-e5-unified-qualification-delivery.md`

共9个E5 allowlist paths。用户自有未跟踪`Test/地形.html`未读取、修改、暂存或纳入delivery。

## Implementation and deviations

- E5没有产品/API/Shader改动；只扩展既有首个release E2E case、Guide/UpgradeChecklist和AgentDocs。
- E2E以六个同尺寸local canvases创建caller-owned SkyBox，在一次临时sky-facing camera qualification后恢复planar Home，避免
  干扰原有opaque terrain/filter/Material pixel断言。四个environment commands只在该资格窗口包装execute计数并立即恢复。
- Fixed native Clock从`2026-06-21T00:00:00Z`变为`2026-12-21T00:00:00Z`，证明effective Sun变化但stable light、environment
  render resources和Surface/terrain/imagery identities不替换。
- Architecture在实现中纠正cleanup wording；最终E2E已按ADR-0036把SkyBox caller destroy放在Viewer/WebGL Context destroy之前。
- 初始dev/release E2E因PID 23592 existing root `node server.js`占用固定8080/8081而等待owner授权。Owner授权释放端口后的首次
  dev执行进入测试体，但新增identity snapshot错误读取flat tile不存在的`terrainEntry.activeContent.mesh`而失败（含一次retry）。
  Architecture登记E5-R001并批准删除该不适用assertion；release未在确定性test bug下重复执行。修正后dev与release同一focused
  case均1/1 passed，timing case均由grep排除，network/error/ownership/resource assertions全部通过。

## Validation evidence

| Command / evidence                                                                      | Result                                                                              |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run test -- --includeName "SceneGIS/Widget/SceneGISPlanarEnvironmentCesiumWidget"` | TOTAL 10 SUCCESS                                                                    |
| dev `Specs/e2e/scenegis-planar-release.spec.js`                                         | corrected focused headed case 1 passed；2.9s；external attempts=0                   |
| release Windows process-local `release=true` same config/spec                           | corrected focused headed case 1 passed；2.1s；external attempts=0                   |
| `npm run build`、`npm run build-release`                                                | passed                                                                              |
| `npm run build-ts`、`npm run build-docs`、`npm run tsc`                                 | passed；build-ts只有既有TSD-JSDoc warnings                                          |
| `node scripts/scenegis/verify-planar-packages.mjs`                                      | passed；12/12 GLSL、12/12 generated modules、E1-E4 runtime/declarations/API/private |
| changed-scope ESLint/Prettier/Markdownlint、`git diff --check`                          | passed                                                                              |
| `node scripts/scenegis/audit-upstream-patches.mjs`、generated/exact status              | passed；E5 upstream-owned=0、SGP=None、generated=0；9 allowlist paths + owner file  |

未运行full suite、E1-E4 unit/private matrices、Sandcastle/gallery、public-network success、release timing case或无关terrain/
content/styling suites，符合phase boundary。

## Findings

| ID      | Severity | Status    | Finding                                                                                                                                    | Resolution                                                                                                                                                                                                         |
| ------- | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E5-R001 | medium   | addressed | Existing flat-world E2E没有terrain provider，却无条件读取`tile.terrainEntry.activeContent.mesh`，authorized dev首次执行因此TypeError失败。 | 删除不适用的mesh snapshot/assertion；保留tile、Surface command/shader/VA、imagery binding/texture与全部Environment/public行为证据；真实terrain mesh由Widget 10-case aggregate覆盖；修正后dev/release各1/1 passed。 |

## Architecture conclusion

- Architecture/code、dev/release E2E与delivery evidence最终结论为`approved`。E2E只把现有blocked-network Viewer case扩展为
  E1-E4联合bundle资格，没有新增公共API、fixture或重复suite。
- Soft-private Environment/SkyBox/Surface renderer identity只作为升级敏感的回归证据，不提升为public compatibility contract；
  Guide与UpgradeChecklist对其定位正确。Clock mutation、error channels、network-zero和corrected ADR-0036 Context-live SkyBox
  caller cleanup均通过代码复核。
- Architecture接受Execution记录的Widget 10/10、build/release/types/docs/tsc、12/12 installed package与static/audit结果，
  不重复执行这些命令。项目负责人授权释放固定端口后，同一focused Viewer case在headed dev与Windows process-local release中
  各1/1 passed；timing case按phase boundary排除，network/error/ownership/resource assertions全部通过。
- E5-R001是flat-world test evidence错误，删除不适用的terrain mesh assertion后已关闭；产品行为未变，真实terrain mesh证据仍由
  existing Widget aggregate承担。root development service已恢复并验证8080页面与Cesium bundle可访问。
- Review无open finding，E5与`planar-environment`可标记`completed`并创建独立本地checkpoint；不push、不publish。
