# 次级飞沫评审

- Type: review
- Status: approved
- Author: current task / architecture self-review
- Updated: 2026-10-23
- Target: [次级飞沫计划](../plans/2026-10-23-fluid-spray.md)
- ADR: ADR-0187
- SGP: None

## Findings

### R1：飞沫不能再次被合并成主液体圆团

- Severity: medium
- Owner: execution
- Status: fixed
- Evidence: 独立 GPU 状态和 TRANSLUCENT instanced draw，不参与主液面 depth/thickness
  平滑。示例将主液体半径收紧为 0.026 m，飞沫为毫米级，暂停可开关对比。
- Validation: 双世界实际渲染 Specs 比较开关像素，分别验证 opaque 与主液体遮挡。
- Follow-up: 无。

### R2：关闭、暂停、reset 与资源必须有一致契约

- Severity: medium
- Owner: execution
- Status: fixed
- Evidence: 0 停止出生并隐藏，但保留池并正常老化；暂停/隐藏冻结，reset 清空且复位随机序列。
  资源归 solver / surface 所有，透明 command owner 不带 water 标记。
- Validation: GPU Specs 验证静止/失活不产生、确定性出生、弹道、过期、盒碰撞及主流体重吸收；
  Primitive Specs 验证参数、暂停/隐藏、reset、纹理复用和销毁。新 pass 不调用 readPixels。
- Follow-up: 无。

### R3：不能将细节层表述为提高了真实解算分辨率

- Severity: low
- Owner: architecture
- Status: accepted
- Evidence: API、ADR、指南明确其为被动视觉水滴，无双向质量交换、泡沫/气泡或任意网格碰撞。
  主液体仍为原 PBF 采样与前层屏幕空间重建。
- Follow-up: 视觉判断交由项目负责人；若仍需要近距离薄膜与复杂破碎，另行评估主模拟分辨率/运动。

## Verification

- 24/24 严格 SceneGISFluid Specs 通过，保留既有 TAA、背景透射、椭球/法线回归。
- Scoped ESLint、完整 release build、build-ts / tsc 通过。类型生成保留既有 upstream JSDoc warnings。
- 所有本次及前轮待提交文件的 Prettier、完整 AgentDocs markdownlint、git diff --check 通过。
  完整 AgentDocs Prettier 仍报告 569 个既有未修改文件，与前轮一致，未扩大格式化范围。
- 本机 Chrome 155 / RTX 3060 Ti / ANGLE D3D11，1001×826，8192 槽，近看视角。
  四组交替开关，每次先推进 60 个 1/60 s 步使上次飞沫过期；整帧 GPU 中位关闭 2.648 ms、
  开启 3.172 ms，范围 2.597～2.748 / 2.789～3.595 ms。CPU 0.9～1.8 ms。
  关闭仍有已分配池的老化 pass；不是首次未启用基线。solver+shape 均 101 draw；
  开启提交一个透明实例 draw，OIT 使用 Scene 共享资源。次级池 524288 bytes。
- Planar 暂停开关与运行画面、Globe 破管与原喷泉已检查，无浏览器错误。

## Ownership and remaining risk

全部 26 个待提交文件已对官方基线审计；upstream-owned files 为零、SGP 为 None，未修改 SDK。
次级查询仍受密集邻域成本影响；固定映射槽池利用率有限，透明水滴是光学近似。
此改动改善细节层，主水团近看仍受采样和平滑限制，不宣称已消除所有果冻感。
前轮喷口/表面改动与本轮保持未提交，等待项目负责人视觉验收。
