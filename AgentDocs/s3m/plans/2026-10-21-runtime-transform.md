# Standalone Plan: Runtime S3M placement

## Metadata

- Plan type: standalone
- Status: completed；实现、自检和自动验证完成，负责人已确认提交
- Owner role: execution / architecture self-review
- Architecture review: confirmed
- Created / Updated: 2026-10-21
- Parent context: completed S2; current source includes V2 viewshed selection
- ADR: 0174 amendment; SGP: none planned

## Source facts and contract

`fromUrl` 接收 modelMatrix，但 Layer 没有公开矩阵属性；当前 root / PageLOD
包围球与 range 已按初始矩阵烘焙，Model 只在异步创建时接收矩阵。
新增 `layer.modelMatrix`：返回 live Matrix4，赋值 clone，支持原位修改。
矩阵始终是完整 local-to-World 放置，球面默认值包含 SCP ENU，不改成额外 offset。
赋值主动 requestRender；原位修改由调用方在 request-render 模式请求一帧。

## Implementation

- 保留 root / page 的局部包围球与原始 range，重新从源计算，避免重复变换误差。
- 公共 boundingSphere 使用当前矩阵，即使隐藏或尚未 render 也能正确定位。
- 正常帧在选取前发布矩阵快照，更新全部缓存 / pending Model、包围体及
  distance / geometric-error range；pixel range 不缩放。未变帧只比较矩阵。
- pick/depth-only 不发布新变换、不选级、不请求，重放上一正常帧结果。
- 异步 Model 完成在下一正常帧应用当前快照，避免旧姿态回流；不重新解码、
  不清缓存、不取消有效请求。观察点选级复用更新后的状态。
- 沿用已有有限 affine、非零 maximum scale 校验与严格 World 绑定。
- 示例补局部平移、绕 Z 旋转和统一缩放；记录 SDK 调用及完整矩阵语义。

## Verification

Specs 覆盖赋值 / 原位修改、立即 bounds、非法值、三类 range、缓存与
迟到 Model、pick replay。实际精模 / 实例化双世界 GPU 检查移动后定位、拾取和
矩阵恢复，无重复请求或资源重建。运行完整 build、build-ts、tsc、scoped lint。
不新增格式资格或扩大真实数据全树范围；记录有限证据与 review 后交付。

## Outcome

实现与上述方案一致，无上游修改。13 项 Layer Specs 通过；精模和实例化双世界
4 个 WebGL E2E 通过，变换后命中原对象 ID、恢复原位，且保持 Model 身份、请求数、
缓存和 GPU 字节数不变。完整 build、build-ts、tsc 与 scoped ESLint 通过。
构建保留项目既有 JSDoc 警告。详细证据、限制与交接见
[runtime transform review](../reviews/2026-10-21-runtime-transform-review.md)。
