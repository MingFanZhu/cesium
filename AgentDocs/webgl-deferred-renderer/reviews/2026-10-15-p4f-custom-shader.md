# P4f CustomShader 资格与阶段评审

- Type: review；Status: completed；Created / Completed: 2026-10-15。
- Target: P4e `60cedcbb7b` 后的原生 CustomShader 资格。
- Reviewer / owner: 当前 Architecture / execution 任务自审。
- Plan: [P4f](../plans/2026-10-15-p4f-custom-shader.md)。

| ID         | Priority | Status | Finding / evidence required                                                                                                                  |
| ---------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| WDR-P4F-01 | medium   | fixed  | 七项 GPU Specs 覆盖两种材质模式、顶点 / varying、uniform / texture 更新、discard、动态替换、Model / Tileset 拾取与资源所有权；详见下方证据。 |
| WDR-P4F-02 | medium   | fixed  | 强制透明 / 不透明路由、透明前向受光、OIT 与不透明深度通过 GPU 测试；接入说明和 ADR-0161 区分普通透明合成与矢量当前表面限制。                 |
| WDR-P4F-03 | medium   | fixed  | 实际页面和成本证据通过，2026-10-15 负责人确认画面与拾取通过并授权提交；无新增产品分支或资源预算。                                            |

图谱提供 CustomShader / pipeline / OIT 符号，prototype process 和 owned 新实现索引不足处由当前源文件补读。ModelFS 的调用顺序已确认：materialStage → customShaderStage → lightingStage；capture 记录 CustomShader 之后的材质。当前没有原生 CustomShader 的统一拒绝门禁，尚不能把缺少组合证据等同于产品失败。

## Technical qualification

2026-10-15，当前任务完成自审。测试没有暴露产品缺口；未添加任何产品 fallback、材质附件、专用通道或运行时开关。

- `SceneGISDeferredCustomShaderSpec.js`：Edge 155 / WebGL2，WebGL validation 开启，7 / 7 通过。MODIFY / REPLACE 两种模式均捕获光照前材质；动态数值和 TextureUniform 更新不增加附件，替换纹理释放旧资源，移除模型后 CustomShader 仍属调用者。
- vertexMain / varying / discard 在线性与日志深度下同时影响颜色、对象拾取和 pickPosition。强制 TRANSLUCENT 保持前向 PBR / UNLIT，OIT 混合在交换提交顺序后稳定，前方不透明表面正确遮挡；OPAQUE / TRANSLUCENT / 移除 shader 的切换没有遗留材质 group。
- Tileset featureId 输入、选中要素着色及替换 / 移除 CustomShader 后的 feature identity 通过。已有 MASK / 扩展材质用例仍以 P4d review 为依据，不声称七项新用例穷举原生 API 的全部组合。
- 首轮测试夹具曾错误假设 Box 的 forward axis、沿用不适合 Tileset 的正交近远平面，以及假设仅透明内容时基础材质目标立即释放。均按实际原生轴向、相机和既有保留 / 清空契约修正；产品实现未改。模型移除及 CustomShader 显式销毁的释放断言保留。
- 完整开发 `npm run build` 通过。无运行时、公共类型或构建实现变化，不重复 P4e 已通过的 release / types 全量检查。
- 变更文件的 Prettier、ESLint、Markdownlint 与 `git diff --check` 通过；全 AgentDocs Markdownlint 通过。按目录规则运行的全 AgentDocs Prettier 返回 420 个既存未修改文件的格式提示，与本轮变更交集为零；未顺手格式化其他扩展。

## Browser and cost evidence

`scenegis-deferred-custom-shader.spec.js` 在 1280 × 800 / Edge / 本地资产通过。检查材质模式、PBR / UNLIT、纹理替换、顶点位移、孔洞、透明度、遮挡板、HDR 与移除 / 恢复 shader；无 page / WebGL 错误，模型拾取通过。页面离开时销毁 viewer、调用者 Shader 及共享 IBL。正常与透明 / 变形 / 孔洞截图均已检查；负责人已确认画面和拾取通过。

基础页面材质提交 4、屏幕光照 3，材质目标 45,056,000 bytes（42.96875 MiB）；这是现有目标总量，不是新增预算。切换材质 / uniform 不增加提交或显存；左侧模型转半透明后不透明材质提交 4 → 3，屏幕光照 3 → 2。扩展材质附加提交始终为 0。前方遮挡板显示时只增加该物体本身的提交。

## Change boundary and final architecture gate

本阶段仅修改 SceneGIS-owned Specs、验收页 / E2E 配置、接入说明、ADR 与 AgentDocs。改动过的 upstream-owned files：无；新增或变更 SGP：无。既有 SGP-0045 / 0046 仅作为捕获与调度依据。

2026-10-15 负责人明确确认“画面和拾取通过，提交 P4f”。当前 Architecture 任务据技术、自审与视觉证据关闭三个 findings，阶段 gate 通过，本轮全部十一条路径共同形成独立本地 checkpoint；无未解决的阶段问题。

原生 API 的输入 / 所有权约束继续生效；任意外层 fragment main / MRT / framebuffer、逐层精确透明折射和多表面矢量贴附没有扩大范围。普通透明模型继续走前向专用通道，不属于这些保留边界。全 AgentDocs 的 420 个既存格式提示不涉及本阶段文件，保留原状。
