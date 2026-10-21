# M3 自审与交付资格

- Status: technical passed; product visual acceptance pending
- Reviewer / owner role: architecture / execution（当前任务自审）
- Date: 2026-10-21
- Target: MaterialProperty 桥、四类 Visualizer、PrimitiveOwner 与综合示例
- Follow-up: 项目负责人检查 `Test/平面材质.html`，反馈画面质量。

## Findings

- M3-01（high，resolved）：Primitive 借用 Material，Entity 必须自行拥有。
  owner 记录其生成的 fill/outline Material，先释放 Primitive，再释放 Material；
  候选构造异常清理。专项验证类型替换、Entity 移除和 getValue 抛错均释放正确，旧 owner 保留。
- M3-02（medium，resolved）：material 类型纳入 signature，同类型 uniform 更新保留 VA；
  复用原生 MaterialProperty 取值与 Image transparent/repeat 语义。
- M3-03（medium，resolved）：Polygon 与 Area stRotation 加入 signature，finite 验证；
  普通与贴地使用同一几何描述，显式 textureCoordinates 继续拒绝。
- M3-04（low，resolved）：测试不能混用外部 index runtime 与直接打包的 Source class；
  新测试统一使用 package exports。CheckerboardMaterialProperty 使用原生 evenColor/oddColor 字段。

## Evidence

- M3 GPU 与生命周期专项 5/5；Polygon 7/7、Area 6/6、Solid 7/7、Route 6/6 原有回归通过。
- M1 新增 5、M2 新增 3，加上本阶段新增 5，共 13 项新增 Specs 通过；
  相关既有回归合计 176 项通过，没有宣称完整全库 suite 通过。
- 完整 build、build-ts、tsc 通过；定向 ESLint 通过。类型生成存在既有 JSDoc warnings。
- AgentDocs 全量 markdownlint 通过。全量 Prettier 报 554 个既有文件格式问题，
  无本扩展文件；本扩展与改动文件定向格式检查通过，不顺手重排其他文档。
- 本地 IAB 查看 55°、90°，以及 10° + 起伏地形；图片、孔洞、透明叠面与 Entity 材质正常显示。
  批对象 85 独立拾取和显隐，128 对象始终 1 VA + 1 stencil/color pair。
- 无 upstream-owned 修改，无 SGP，无生成文件提交。

## Remaining boundaries

三角面主轴 UV 在方向切换处有接缝，不是连续路径展开；贴地深度法线在屏幕边界处有像素尺度误差。
贴地不接外层自定义 Shader，Fabric 不允许 discard，透明通过 alpha，拾取保持完整足迹。
项目负责人视觉验收尚未完成；无未解决技术 finding。
