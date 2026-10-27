# B2 材质渲染自审

- Type: review
- Status: completed; architecture gate passed
- Date: 2026-10-27
- Author / owner: 当前 Agent，architecture / implementation / self-review
- Target: [B2](../plans/2026-10-27-b2-material-rendering.md)
- Related: ADR-0192；upstream-owned / SGP：无

## 发现与处置

| Severity | Finding                                                                | Status / evidence                                                                                  |
| -------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| P1       | 原生建筑阴影与旧 vector receiver 的 uniform / cascade builtin 重复声明 | fixed；私有 uniform 隔离，级联区间直接计算；两世界真实环境、原生阴影、SSR、SSIL、AO 和透明组合通过 |
| P2       | 纯矢量场景没有 Model 触发 BRDF LUT 初始化                              | fixed；借用 Scene generator，正常帧按需更新，材质不拥有 LUT                                        |
| P2       | JSDoc 嵌套 style 参数会把现有开放 Style 对象收窄到仅材质字段           | fixed；保留原 constructor object 参数，独立 BuildingMaterial typedef 与文档描述                    |
| Info     | 同深度 extrusion 沿用三维深度测试，不具备后画样式覆盖契约              | test corrected；以 1 米高差验证混合材质深度、style tag 和拾取，不修改旧产品语义                    |
| Info     | 扩大回归发现旧 render probe 和私有 pick command 用例失败               | confirmed existing；B1 运行同一 Tile 范围 39 通过 / 10 失败，失败名称与模式一致；不删除或跳过用例  |

## 验证

ChromeHeadless 156 / WebGL validation：新增材质 18/18 通过，含双世界参数 G-buffer、真实图片通道、
法线、太阳方向、自发光、动态选择、混合深度与 tag、拾取、真实物理环境 / SSR / SSIL / AO、
透明场景、纹理共享、warm frame、预算错误和迟到图片/Worker 销毁。
完整 `SceneGIS/Scene/SceneGISVector` 范围 213 项：203 通过、10 失败，B1 checkpoint 对照复现相同 10 项失败（gamma 输出探针、过期 ground-volume 输入、私有 pick command 位置），无新增失败。
development build、buildTs / tsc 和 scoped eslint、Markdown 检查通过；最终公开交付在 B3 重建类型与 release。

一次复测遇到 Windows 虚拟内存不足，构建进程 VirtualAlloc 失败及 GPU context 不可用；
释放后复测定位到实际 uniform 冲突。未通过重试、产品降级或等待固定帧掩盖失败。

## 剩余范围

实景楼层比例、反射观感、远景/接缝、性能对照与负责人视觉判断留在 B3。
保留 D2 人工 gate。材质使用物理天空与屏幕可见反射，不含局部 Model probe、透射或纹理库热替换。
