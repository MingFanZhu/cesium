# M1 普通面材质 review

- Type: review
- Status: technical passed
- Owner / reviewer: 当前任务（architecture / execution，自审）
- Created / Updated: 2026-10-21
- Target: [M1](../plans/2026-10-21-m1-ordinary-materials.md)
- ADR: ADR-0178；upstream-owned files / SGP: None。

## Findings

| ID    | Severity | Finding                                               | Disposition / evidence                                                          |
| ----- | -------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| M1-01 | high     | 原生默认 translucent 基础混合状态与不透明 pass 不一致 | fixed：内部 MaterialAppearance 基础混合关闭，动态 alpha/材质替换 GPU 回归       |
| M1-02 | medium   | 原 Color-only 挤出侧面绕序未定义材质外法线            | fixed：材质几何按 outer/hole 绕向校正，CPU 外法线与 finite TBN 回归             |
| M1-03 | low      | Material 图片由原生 update 分两步发布，首帧是默认纹理 | accepted：测试等待实际纹理发布；保留原生异步加载语义，不增加产品 settling frame |

## Validation

新增 5 项材质 Specs；128 实例同批保持 1 VA / 1 color command，uniform/show 变化保持 VA/program。
Image 方向像素、孔洞拾取、独立 ID、材质替换、透明分流、调用方材质/纹理存活均覆盖。
原 Primitive 16 项、相关 Core 126 项通过，Chrome Headless 155 / Windows。
材质几何 CPU 增加面分离属性，颜色不增加；不承诺全场容量或 GPU timing 提升。
完整 build、build-ts、tsc 通过；最终材质 5/5 复验通过，定向 ESLint / Markdown 检查通过。

一次过宽的 SceneGISPlanar 筛选触发环境/Widget 既有契约相关失败并中止；
该范围超出本轮几何/材质影响面，未声明全量通过，也未修改环境或测试基础设施。
后续验证限定本轮相关 suites。最终视觉验收在 M3 示例中进行。

## Remaining boundaries

主轴投影在切换轴的边缘有接缝，路线网格不承诺连续展开。
图片透明性仍须通过原生 Material.translucent 正确声明，Image 默认仅按 color.alpha 判断。
本轮不承诺任意外层 Appearance Shader；无新资源管理系统或 upstream 修改。
