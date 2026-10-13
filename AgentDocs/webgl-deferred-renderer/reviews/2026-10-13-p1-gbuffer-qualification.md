# Review: P1 原生材质 G-buffer 资格

## Metadata

- Status: `approved`，技术与负责人视觉 gate 均通过
- Reviewer role: `architecture`，当前任务自审；未启用独立评审 Agent
- Created / Updated: `2026-10-13`
- Review target: P0 checkpoint `bb9b16eba0` 后的 P1 实现
- Related plan: [P1](../plans/2026-10-13-p1-gbuffer-prototype.md)
- Related decision: [ADR-0155](../../../Documentation/SceneGIS/Decisions/ADR-0155-webgl-gbuffer-prototype.md)，SGP-0045

## Scope and findings

原型只采集原生材质，不替换主光照。没有新公共 API 或 AA 默认值变化。

| ID        | Severity            | Status                 | Owner role    | Finding / evidence                                                                                                                                       | Follow-up                                                                                                 |
| --------- | ------------------- | ---------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| WDR-P1-01 | medium              | fixed                  | execution     | 清空 primitives 后原生 Scene 不进入视锥循环，旧材质和线性深度仍可读取。复用 preRender/postRender 使 readiness 失效并清空未采集帧；卸载 GPU Spec 已通过。 | 无                                                                                                        |
| WDR-P1-02 | high for production | deferred               | architecture  | 4× MSAA 边缘实测 coverage 为 0.25/0.5/0.75，材质是样本平均；不能将其直接照明后声称边缘等价。P1 只显示诊断数据。                                          | [总体计划 P2](../plans/2026-10-13-webgl-deferred-renderer-extension.md)，取得同质量证据后确认正式 AA 路线 |
| WDR-P1-03 | gate                | accepted               | project owner | 负责人于 2026-10-13 接受独立街道原型并批准阶段提交，视觉 gate 通过。                                                                                     | 形成 P1 checkpoint                                                                                        |
| WDR-P1-04 | note                | accepted for prototype | architecture  | 重放几何、未压缩四附件以及逐命令检查均是诊断成本；普通非 Model opaque 只记录遮挡，透明不采集。特殊层状材质/样式不作兼容声明。                            | 正式主通道和范围扩展另开 phase，不能把 P1 当作全面延迟完成                                                |

## Validation reviewed

- 开发构建、完整 `npm run build-release`、`npm run build-ts`、`npm run tsc` 通过。
  类型生成仍输出既有 Cesium3DTileContent/Check 等 JSDoc 警告；新私有模块未进入公开声明。
- Chrome Headless 155、真实 WebGL、开启 `--webglValidation --failTaskOnError`：
  G-buffer Specs **7/7**，AO **14/14**，SSR **13/13**，SSIL **13/13**。
  G-buffer 覆盖已知材质值、1×/4× 四附件、MASK、unlit、非 Model 遮挡、
  主颜色/拾取一致性、正交/透视日志深度、MSAA 边缘、resize/disable/destroy、空场景和 clearcoat 拒绝。
- Edge 155.0.4283.45 / ANGLE D3D11 / NVIDIA RTX 3060 Ti，Bistro E2E **1/1**：
  真实四附件读取、主画面/漫反射/法线/自发光/深度截图、相机横移、22:00 Clock、
  1×/4× 切换与 Scene 销毁；无 renderError / pageerror / GL error。
- MRT resolve 提取保留原算法与绑定恢复，已有三个消费者的 40 项回归均通过。
- 补丁审计通过：本轮仅 2 个 upstream-owned 路径，均登记 SGP-0045，生成物改动为 0。
- root / engine `npm pack --dry-run --ignore-scripts` 清单确认新私有模块、GLSL、生成 Shader JS
  与 dev/release bundle 均进入既有交付路径；没有为原型修改构建入口。
- 改动 JS ESLint、改动文档/示例 Prettier、完整 AgentDocs Markdownlint 与相对链接检查结果见 phase 收尾记录。
  原 ESLint 10.12 与仓库声明的 10.4.1 均复现 eslint-plugin-html / eslint-seatbelt 的 processor
  克隆错误。提交时仅在本地依赖副本的 createNewConfig 中保留 originalConfig.processor 对象，
  与其现有 plugins/languageOptions 处理一致，完整 JS/HTML lint 随后通过，规则与 seatbelt 未禁用。
  依赖副本修正未提交；正常提交钩子继续执行。正式工具链兼容修复属于后续维护风险。
- 完整 AgentDocs Markdownlint 通过；Prettier 全目录仍为 P0 已记录的 415 个既有文件问题，
  本扩展无格式警告，未改无关文件。34 个仓库相对链接存在，`git diff --check` 通过。

## Cost evidence

固定 Bistro 交付纹理、餐馆街景、1280×800、2026-03-20 14:00 UTC、TAA 开启，
Edge 155 / RTX 3060 Ti。每种配置编译后测量 12 帧，使用 EXT_disjoint_timer_query_webgl2，
无 disjoint；表为上中位数。不是多设备性能资格，也不是最终延迟收益。

| 配置         | 原型额外 draws | 原型附件估算 | 整帧 GPU 中位数 |
| ------------ | -------------: | -----------: | --------------: |
| 原型关闭、1× |              0 |            0 |         17.4 ms |
| 原型开启、1× |            627 |     39.1 MiB |         21.0 ms |
| 原型开启、4× |            627 |    179.7 MiB |         24.2 ms |

4× 同时改变主场景 MSAA，不能从第一行相减推导原型在 4× 下的独立成本。
预算只计算 4 个 RGBA16F、深度/模板、R32F 线性深度与多样本存储，不包含驱动开销、
调试后处理目标和原场景资源。正式管线应评估主通道直接写材质和压缩布局，避免永久双重几何提交。

## Reproduction and ownership

在此分支构建，使用独立开发服务打开 `Test/Rendering/GBuffer原型.html?world=globe`。
本机验收端口为 8083，原质量页面 8082 仍属于原工作目录。本地 Bistro 资产按
`Test/Rendering/pbr-data/Bistro.md` 准备，不随提交保存。

GPU Spec 使用 `npm run test -- --includeName SceneGISGBuffer --browsers ChromeHeadless --webglValidation --failTaskOnError`。
E2E 使用 `npx playwright test -c Test/Rendering/playwright.gbuffer.config.mjs`；
可设置 `SCENEGIS_TEST_BASE_URL` 指定独立端口，`SCENEGIS_TEST_BROWSER_CHANNEL` 选择已安装浏览器。
输出位于 `Build/Specs`，不提交原始日志或图片。

本轮所有 upstream-owned 改动：

- `packages/engine/Source/Scene/Scene.js`：重放入口、派生命令拦截、Scene 生命周期释放。
- `packages/engine/Source/Shaders/Model/LightingStageFS.glsl`：原生材质采集缝隙。

对应 SGP 均为 **SGP-0045**。其余实现、GLSL、Specs、E2E、示例与文档属于 SceneGIS。

## Conclusion

技术与负责人视觉 gate 均通过，当前架构任务确认 P1 completed，并形成独立本地提交。
本次验收只覆盖原型范围；P2 尚未激活。生产 MSAA 与材质/命令覆盖风险继续保留，
后续阶段独立设计与确认；本轮无直接光照或 GI 提升声明。
