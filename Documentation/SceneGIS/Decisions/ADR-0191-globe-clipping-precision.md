# ADR-0191：球面多边形裁剪的近景精度

- Status: accepted
- Date: 2026-10-26
- Related: SGP-0070, ADR-0081, ADR-0189

## 问题

原生 ClippingPolygonCollection 以 Float32 存绝对球面角度，距离场 Shader 又将纹理
UV 还原为绝对角度。118.78° 经度附近的 Float32 间隔对应约 1.3 m，远大于近景精度。
GlobeVS 合成 ECEF 后计算球面角度，在瓦片顶点间插值归一化角度；两步又分别引入绝对坐标
舍入与非线性插值误差。裙边是同一地形管线的几何，不是上述坐标误差的根因。

## 决定

1. 保留原生球面角度、区域合并、凹多边形距离场、inverse 与 collection 资源所有权。
   CPU 使用实际上传的 Float32 extent 原点和比例，在 double 中先归一化顶点和独立 polygon
   bounds，再转 Float32；SDF 生成全程使用区域归一化坐标。采样协议仍是原生 extent 与 atlas。
2. Globe 传递 Cartesian RTC position，fragment 再计算球面坐标，避免角度的三角形插值。
   tile center 增加低位 uniform；SceneGIS-owned GLSL 用 compensated arithmetic 保留低位，
   直到减去 extent 原点。使用原生 fastApproximateAtan2 的相同多项式及象限约定。
   ANGLE D3D 实测会把误差补偿算式重结合为 0，因此使用固定为 1 的 uniform 作为
   舍入屏障；真实 GPU 数值测试约束该编译行为，不能改回普通常量。
3. 不增加纹理分辨率、不改变地形几何、不全局关裙边、不修改 SDK 坑壁。实际地形高度、
   曲率、exaggeration 仍来自原生地形位置；Planar 独立路径保持原协议。

## 边界与成本

SGP-0070 仅接入 collection packing、SDF、Globe VS/FS、shader composition 和 tile uniform。
新增低位 uniform 由 tile uniform map 持有，无逐帧 GPU 回读、无新纹理或 GPU 资源。
仅启用 polygon clipping 的地形 shader 增加逐片元补偿运算。测试覆盖近景误差、移动/LOD、
凹区/多区/inverse、非零地形高度、纹理复用与销毁，并记录实际渲染成本。

Model 仍使用原生坐标计算，但共享更精确的距离场；其近景世界坐标精度不是本次范围。
原生日期变更线/极点语义不作额外扩展。原生实现提供等价精度后可以删除本集成。
