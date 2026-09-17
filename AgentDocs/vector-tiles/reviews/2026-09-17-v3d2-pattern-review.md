# V3D2 纹理材质自审

- Date: 2026-09-17
- Reviewer: 当前 Agent，architecture/execution 自审，非独立评审
- Decision: approved；技术 checkpoint，负责人视觉 gate 随四项增强最终汇总
- Plan: [V3D2](../plans/2026-09-17-v3d2-patterns.md)
- ADR: [0075](../../../Documentation/SceneGIS/Decisions/ADR-0075-vector-pattern-materials.md)
- Upstream-owned files: None；与官方基线路径交集为空
- SGP: None

## 实现

四类 pattern 复用 Layer 单 sprite。元数据一次配置至各 Worker，geometry 增量携带 rect/size；
面/背景、线与楼栋使用各自坐标，按原 tile/style 合批。Flat、Planar/Globe ground、extrusion 支持。
材质替代 color，保留 opacity、光照、native pick；atlas 独立 wrap、预乘插值避免透明黑边及邻图串色。
无 pattern 的分支不增加 sampler/请求；有 symbol 共用资源，无 symbol 独立拥有并释放。

两个中文本地 Test 页面共用组装代码，使用默认 lil-gui；Liberty 增至 109/111，
湿地的额外 fill-translate-anchor 继续显式排除。未改动测试数据之外的源样式。

## 验证

- 12 项新 pattern Specs：真实 Worker transfer、不同图案同批、普通/sdf/missing 元数据、
  Planar/Globe 四类 WebGL、真实地形、alpha hole native pick、预乘透明边缘、邻图隔离、共享/销毁与 warm command identity 通过。
- Vector 全组共 210 项，207 项首轮通过；旧 line-pattern 拒绝断言更新为 line-gradient，
  两项受并行浏览器负载影响的 5 秒加载超时在无并行负载的 21 项 Layer 专项均通过。
  不是把 timeout 通过增加 settling/retry 或放宽产品阈值掩盖。
- 8 项相关 E2E 已覆盖通过：新增两世界页面、六项 public 回归；Liberty 初次失败揭示 translate-anchor，
  保留显式排除后单项复核通过。截图已检查，道路与楼栋纹理可见；细密水面在远处有过滤走样。
- root build、engine workspace build、release build；installed engine、release ESM/IIFE 实际消费 pattern 的
  Worker 准备、颜色、atlas 释放通过。最终透明插值 Shader 又经 engine build 与 12 项 WebGL 专项验证。
- scoped ESLint/Prettier、提交 hook 检查；不新增公开 API 签名。类型生成留待紧随的状态 API 阶段统一更新。

## 已接受边界

不含图像注册/available-images、pattern crossfade、跨瓦片道路全局里程和复杂建筑展开。
首轮采用连续 zoom 比例和普通双线性采样；不提供各向异性 mipmap，远景细密纹理可走样。
不宣称完整 MapLibre 像素一致；最终负责人手工视觉尚未完成，不能以本次自审替代。
无阻塞发现；按已授权路线继续 V3D3，保持原大阶段 deferred finding，不删除历史记录。
