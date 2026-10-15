# P4g：全部 DrawCommand 生产者接入

## Metadata

- Type: phase plan；Status: completed；Created: 2026-10-15。
- Parent: [extension plan](2026-10-13-webgl-deferred-renderer-extension.md)。
- Entry checkpoint: P4f `8f3baba438`，技术、自审、负责人视觉与提交钩子通过。
- Owner / architecture / execution / self-review: 当前任务。
- Architecture review: confirmed，全模块核对后只针对实际缺口设计修正。
- Review: [全命令审计](../reviews/2026-10-15-p4g-all-draw-command-producers.md)。
- Inventory: [全部生产者矩阵](../reviews/2026-10-15-p4g-command-producer-matrix.md)。
- Approved decision: [点云 EDL 深度 / 提交预算](../discussions/2026-10-15-point-edl-depth-budget.md)，负责人已于 2026-10-15 批准；实施、技术验证与点云画面 / 拾取验收已完成。
- Related ADR: 0155、0156、0160、0161；新增资源 / 提交预算和重大语义仍先交负责人确认。

## Scope correction

负责人明确要求：不以此前列举的 Entity / Primitive / Model / Tiles 等内容清单为完成边界；所有创建或派生 DrawCommand 的模块均须适配当前延迟与透明前向管线。只有已被现有同类型模块覆盖、且有明确提前拒绝 / 门禁证据的路径可以排除。不得把未知模块、一般 framebuffer 校验失败、历史未列举或缺少测试当作排除理由。

审计包含直接构造、shallowClone、createViewportQuadCommand 的工厂调用，以及委托这些生产者的公共入口；覆盖不透明材质、透明、分类、影子、拾取、屏幕处理、环境、离屏捕获和诊断。必要非表面通道按用途验证，不强行把计算 / 拾取转换为颜色 G-buffer。既有 A 的设备与场景配置决定不是遗漏模块的理由。

2026-10-15 负责人进一步明确：反射探针不启用，仅作为技术积累，现阶段暂缓。此例外包含显式局部探针的六面捕获及其启用后的主视图采样器容量问题，不扩大到正常运行的物理天空反射、SSR、局部灯或其他离屏命令。保留问题记录，P4g 可以在其他生产者完成后关闭，但不得声称探针已适配。

## Initial source facts (historical)

2026-10-15 负责人确认透明物体的水面 SSR 倒影暂缓，不作为 P4g 关闭条件。当前水面保留不透明 / MASK 反射输入与物理天空；不把透明层未进入 SSR 输入描述为透明前向绘制未适配，也不声称该反射能力已经实现。

1. P4f 的 TypeScript AST 审计得到 75 个直接生产者模块、208 个创建 / 派生点。加入 owned 点深度 helper 后，当前 tracked 与未跟踪源文件共 76 个模块、210 个调用点（74 construct、76 derive、60 screen factory）。生成 Shader 和第三方源不作为独立生产者；工厂与委托入口还须逐项追踪。
2. `PointCloudEyeDomeLighting.update` 将不透明点命令导向独立 FBO 并加入混合全屏命令；当前 DeferredLayout 拒绝二者。原生 EDL 三项测试已有 2 失败 / 1 通过的复现，不能继续声称点云能力全部适配。
3. `TimeDynamicPointCloud` 使用独立旧 PointCloud；该模块仍在 VS 根据 normalShading 求光并以 passthrough 写入当前材质目标。P4d 的 Model 点云资格没有覆盖它。
4. ReflectionProbes 另有显式六面离屏几何受光，需审查其与统一材质 / 灯光的关系；尚不把专用离屏命令视为已通过或自动排除。
5. 默认高级环境 discussion 中的视觉 pending 已过期；P4d 最终 review 与用户确认是后继结论，需补链接而非删除历史。

## Implementation and validation

满容量场景已复现：feature style + specular / clearcoat / anisotropy + physical environment / cloud shadow / local lights 的光照程序占 16 samplers，debug tint 再增加一个导致链接失败。将既有扩展材质 RGBA16F 附件改为同格式二维纹理数组各层；MRT 仍逐层写入，光照与反色分类复制统一用一个 sampler2DArray。层数、字节数、附件数、提交次数、精度与 WebGL2 门槛不变；无公共 API 或新预算。owned Renderer 管理数组与借用层视图；SGP-0059 仅接入 Framebuffer 层附件及 sampler uniform 绑定。验证包括真实失败场景、原生材质 BRDF 对照、扩展附件溢出、反色分类、resize / release 和底层二维附件回归。

1. 形成每个生产者唯一一行的持久矩阵，记录公共入口、执行阶段、材质 / 深度 / 所有权、现有证据及缺口；矩阵计数必须与 AST 清单一致。
2. 先闭合点云 EDL 与 TimeDynamicPointCloud 已发现缺口。继续核对其余模块；遇到其他失败同样记录，不能因为前一批完成而提前关闭全阶段。
3. 不透明颜色只提交材质、透明继续专用前向；保留原生属性、动态切换、拾取、阴影与资源所有权。EDL 等屏幕算法复用深度和光照结果，不通过取消校验或偷偷关闭功能来通过。
4. 资源或几何提交增加时先提出可核算方案；未经负责人批准不得落地新增重大预算。上游源改动先读基线 / manifest，并登记最小显式接点。
5. 每项修正添加最小充分 Specs、必要实际页面 / 成本检查、完整构建 / 类型与 SGP 审计。新增画面须负责人验收；全矩阵没有未解决项或有明确合法排除证据后，才允许独立提交并讨论分支使命完成。

## Current handoff

### 最终状态（负责人验收通过）

2026-10-15 负责人在最终验收页确认“画面通过，提交 P4g”。调试着色、Globe 空地伪阴影、Planar 斜向投影与水面不透明反射的最终视觉 gate 已关闭，点云此前验收继续有效。77 个生产者模块 / 217 个创建和派生点的技术审查、Specs、浏览器 / 成本检查、完整 release / types、静态与补丁审计均已完成。本提交为 P4g 独立本地 checkpoint；全分支当前 WebGL2 / SCENE3D 单采样、不透明 / MASK 延迟与透明专用前向目标完成，没有 active phase。反射探针和透明物体水面 SSR 仍按负责人决定暂缓，不宣称这两项已适配。

以下保留此前增量记录；当前未完成项以上述状态和 review 末尾为准。

全量命令审计进行中，不能宣告分支使命完成。SGP-0055 修正仅透明 PointPrimitiveCollection 分流；SGP-0056 分离独立 PointCloud 原色 / 法线与主光；SGP-0057 接入 EDL 点深度并补齐两个处理器所有者的释放；SGP-0058 修正两种点云共享样式时的 Shader 缓存键。恢复 debugCommandFilter 的既有过滤通道，调试着色仍待接入。点云六项新增 GPU、八项生产者回归、192 项原生样式测试和浏览器检查通过，负责人已确认点云画面与拾取通过；这不是全阶段视觉验收。当前源 build、定向静态检查和六个 upstream 文件的补丁审计通过，所有 P4g 改动尚未提交。

EDL 的真实渲染失败已关闭；原生两个测试仍断言旧前向流程额外增加两个命令，不能记作通过。新增 owned 用例验证已批准的点深度 / 延迟光照契约。探针六项原有 GPU 用例中五项通过，256 灯组合在主视图光照链接时超过 16 samplers；负责人已暂缓六面捕获与此容量问题，作为技术积累保留，移出本阶段阻塞项。Buffer 系列三项旧 alpha 数值断言属于 ADR-0161 已改变的线性显示契约，新增三种集合的实际混合 / 前后遮挡 / 拾取 / 资源释放用例通过，不能把旧断言记作通过。

环境生产者继续核对时修正 WDR-P4G-07：高级环境 disabled 不再恢复显式 PlanarEnvironment 的旧天空 / 天体；新增 GPU 由失败转为通过，light authority 保留，无新资源或上游修改。
