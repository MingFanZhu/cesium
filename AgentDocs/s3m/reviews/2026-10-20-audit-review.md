# Review: S3M audit evidence

## Metadata

- Status: `approved`，仅评估结论的证据边界
- Reviewer role: `architecture`，本任务自检，非独立 Agent review
- Created / Updated: `2026-10-20`
- Review target: `AgentDocs/s3m/**` 与隔离探针结果
- Related plan: [兼容性评估](../plans/2026-10-20-compatibility-audit.md)

## Findings

| ID      | Severity | Status | Owner role   | Finding                            | Disposition / evidence                                 | Follow-up                                                                              |
| ------- | -------- | ------ | ------------ | ---------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| S3M-A01 | high     | open   | architecture | 原样加载器不满足渲染及全局状态契约 | 两组绘制被 deferred 校验拒绝；导入替换 Scene.pick      | [渲染适配](../discussions/2026-10-20-loading-boundaries.md#rendering-and-lifecycle)    |
| S3M-A02 | high     | open   | architecture | 新版与压缩组合证据不足             | 9 个模型文件均为 1.0；新版 metadata 不证明普通模型解码 | [格式边界](../discussions/2026-10-20-loading-boundaries.md#format-and-coordinate-gaps) |
| S3M-A03 | high     | open   | architecture | 平面坐标不适用 scene mode 启发式   | 平面仍使用 SCENE3D，会被套经纬度 ENU                   | [坐标契约](../discussions/2026-10-20-loading-boundaries.md#format-and-coordinate-gaps) |

## Validation reviewed

- 官方源码固定 commit；55 个 JS 文件的相对 import 未发现缺失。
- 开发构建版本为 1.144.0；官方 9 个旧模型文件均可解析。
- 两次 Scene 绘制记录失败原因，没有冒充视觉验收通过。
- 用户 CBD 根瓦片与官方样例一致；CORS 响应单独记录。
- 只新增评估文档；upstream-owned files / SGP 均为 None。
- 全部 `AgentDocs/**/*.md` 的 markdownlint 通过。Prettier 全目录检查有
  507 个既有文件告警，均不在本次新增的 `AgentDocs/s3m/**` 中；未修改无关文档。

## Conclusion

评估足够确认“解析可复用，但不能原样插入”。open finding 是实现准入条件，
不会因评估完成而关闭。尚无性能、完整 LOD、材质、拾取或球面 / 平面画面验收。
