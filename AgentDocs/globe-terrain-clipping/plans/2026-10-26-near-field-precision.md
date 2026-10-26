# 球面地表裁剪近景精度

- Type: standalone plan
- Status: completed; project owner approved submission on 2026-10-26
- Author: implementation / architecture self-review
- Date: 2026-10-26
- Parent: [extension index](../README.md)
- Related: ADR-0081, ADR-0189, ADR-0191 / SGP-0070
- Discussion: [coordinate precision](../discussions/2026-10-26-coordinate-precision.md)
- Review: [implementation review](../reviews/2026-10-26-near-field-precision.md)

## 复现与范围

ENU 原点 118.78° / 32.04° / 0 m；矩形 (-40,-110)、(40,-110)、(40,110)、(-40,110)，
坑深 30 m；相机 (38,-5,5)，观察 (40,20,-2)。原生 ClippingPolygonCollection 同样出现
裁剪边缘与直壁不贴合，排除 SDK。quality=2 无法解决主要缺口；关闭裙边仅消除部分台阶。
以本地椭球及确定性非平坦 terrain 分别复现，不依赖公网数据。

## 已发现源码链路

Collection 将绝对近似球面角度存为 RG Float32，按合并 extents 生成 4096² R32F 距离场。
GlobeVS 将 tile-local position 加 u_center3D，随后算近似球面角度和归一化 UV；UV 在
三角形内插值，regionIndex 为 flat varying。GlobeFS 按该 UV 采样 SDF 并 discard。
原地形裙边通过相同 vertex / fragment 路径。Planar 走独立重基 XY 边测试，与此不同。

## 调查与实施

1. 原生本地示例保留直壁、真实椭球和控制变量，复现 polygon / plane、裙边、质量、LOD。
2. 测量 CPU 打包与 GPU 球面转换误差，隔离距离场量化、UV 插值和裙边贡献。
3. 根据证据选择最小修复；主体优先 SceneGIS-owned，必要上游集成登记 SGP 并成对标记。
4. 回归近景贴合、移动与 LOD、凹环、多区域、inverse、曲率 / 高程、默认未裁剪路径、资源释放。
5. 最小充分 GPU / native Specs、实际画面、热路径成本与 release build；记录 review / ADR。

不更换成仅支持凸区的 clipping planes，不全局关闭 skirts，不通过增加质量或扩大墙体遮盖问题。
不修改 SDK，不提交生成文件。项目负责人于 2026-10-26 确认提交本次修复。

## 实施与验证结果

CPU 归一化后才转 Float32；SDF 不还原绝对角度。Globe 改为插值 RTC 位置、片元中使用
高低位球面投影，保留原生近似 atan 的多项式。ANGLE 的优化会消除补偿低位，实测确认后
增加固定为 1 的 uniform 舍入屏障。地形 mesh、skirt、provider、分辨率和墙体宽度未修改。

4 项新增 WebGL regression、54 项原生 clipping regression、7 项 Planar Model regression
通过。release build、tsc、作用域 ESLint 通过；补丁和文档检查结果见 review。
两组近景相机及实际不同 LOD 的边缘与 ENU 平面对照误差不超过 2 px，skirts 保持开启。
非平坦 terrain 在边界两侧 ±0.1 m 正确分类且保留约 20 m 高程；凹环、多区和 inverse 通过。
同场景原生/修复版 Globe shader GPU median 为 4.29 / 4.22 ms，无明显回退。
