# ADR-0075：矢量重复纹理材质

- Status: accepted; implemented
- Date: 2026-09-17
- Plan: [V3D2](../../../AgentDocs/vector-tiles/plans/2026-09-17-v3d2-patterns.md)
- Related: [ADR-0062](ADR-0062-vector-stroke-and-coverage.md)、[ADR-0067](ADR-0067-vector-worker-preparation.md)、[ADR-0074](ADR-0074-vector-fill-extrusion.md)
- SGP: None

## 源码事实与取舍

当前单 sprite 的请求与纹理已在独立符号资源中存在；地图几何由 Worker 生成，ground 将相同几何转换为数值表。
不另外创建逐 tile sprite、副本地图纹理或逐 feature 图元。纹理材质共享 Layer sprite，实例仍按 tile/style/kind 合批。
Sprite 的逻辑尺寸按 pixelRatio 还原，style image 选择可随 feature/zoom 求值；不复用 Cesium Material 的隐式图片请求。

## 决定

接入 background/fill/line/fill-extrusion-pattern，纹理 RGB 替代基础 color，纹理 alpha 与样式 opacity、Layer.opacity 相乘。
图片保持借用关系，由所属 Layer 的 sprite owner exactly-once 释放；异步完成只存 CPU 结果，normal render 才创建 GPU。
未使用 pattern 的样式保持原路径，不增加 sampler、纹理或重复资源请求。

面和背景以 source matrix 连续坐标重复，线沿现有 part 累计距离重复，建筑屋顶使用 XY、墙面使用沿墙距离/相对高度。
使用 tile 局部坐标和拆分原点保持大坐标精度；atlas 子图独立 wrap，不能采到相邻图标。
数据准备与 UV 属性留在 Core/Worker；Renderer 只拥有 GPU，Scene 绑定已就绪 sprite 与视图比例。
Flat、Planar ground、Globe ground 与实体建筑共同使用采样语义；采样 alpha 的 discard 同时作用于颜色和 native pick。
不新增地图颜色 RTT、地形请求、逐要素 command 或主线程几何准备。

Pattern crossfade、任意外部 material、跨瓦片道路全局里程和复杂建筑展开不在本阶段；保留显式能力说明。
资源缺失与损坏必须可诊断，不能静默用纯色伪装图案成功。

## 验证与升级

复用现有 GLSL 自动生成与 vector Worker 三种交付入口，无新构建配置。验证 style/真实 Worker/双世界 WebGL、
透明拾取、atlas 边界、资源共享与生命周期；正式结果回填阶段 review。
