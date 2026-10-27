# B1 材质契约与坐标自审

- Type: review
- Status: completed; architecture gate passed
- Date: 2026-10-27
- Author: 当前 Agent，architecture / implementation / self-review
- Target: [B1](../plans/2026-10-27-b1-material-contract.md)
- Related: ADR-0192；upstream-owned / SGP：无

## 发现与处置

| Severity | Finding                                                                                | Owner      | Status / evidence                                                                                |
| -------- | -------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| P2       | 初次新用例使用不存在的 RuntimeError matcher，地理 metric 期望数近似不准确              | 当前 Agent | fixed；改为带错误消息的标准 matcher 与已知 45° 纬度                                              |
| P2       | Worker 图片维度应在生成 mip 前拒绝非正整数                                             | 当前 Agent | fixed；显式维度契约检查，避免非法资源进入循环                                                    |
| Info     | 广泛 Core 运行的既有 symbol/icon-fit 用例出现 RuntimeError / RuntimeError20 构造器不同 | 当前 Agent | recorded；相应产品和 Spec 文件未修改；与两种导入路径被打包为重复错误类一致，不扩大本阶段修复范围 |

## 证据与边界

首次有效筛选执行 92 项：87 通过、5 失败，其中新用例 3 项已修正，另两项为上述既有用例。
实际 Worker transfer、几何合批、米制比例、父子瓦片/边分段相位已通过。
最终材质专项 9/9 通过（ChromeHeadless 156，真实 Worker，WebGL validation）。所有本阶段 JS scoped eslint 通过，新文档 scoped markdownlint / Prettier 通过。按 AgentDocs 规则运行全目录检查：markdownlint 通过；Prettier 报 598 个既有文档格式问题，未批量改写无关历史。

自审确认：材质选择复用既有表达式；几何追加一个 vec3，保持实例、拾取 token 和 Worker transfer；
Globe 适配不修改材质坐标；原 pattern 的距离/缩放与 sprite mip 不变。
纹理内容、GPU 光照/排序/销毁和公开交付仍在 B2/B3，不以本阶段 Core 测试代替画面验收。
源轮廓、属性/ID 或 terrain anchor 改变仍可能导致差异；原 D2 人工 gate 未关闭。
