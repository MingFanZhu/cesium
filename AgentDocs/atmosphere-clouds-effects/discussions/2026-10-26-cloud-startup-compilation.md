# 体积云首次创建耗时调查

- Type: discussion / source and runtime investigation
- Status: diagnosis completed；优化尚未实施
- Owner: 当前任务 execution / architecture self-review，非独立 Agent review
- Created / Updated: 2026-10-26
- Baseline: `2d777b0ebe`，`scenegis/develop`
- Parent: [扩展计划](../plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Related decisions: ADR-0046 / ADR-0048；当前冷加载边界见 Architecture 的 WebGL 默认高级环境章节
- Upstream-owned files changed / SGP delta: 无

## 结论

已复现平面首次启云的长时间主线程停顿。主要成本是六个程序在同一资源发布调用内串行同步编译、链接，
尤其是平面云空间 / 时间重建程序；预计算文件实际已加载并上传。未发现重复生成云噪声或 warm toggle
重新创建资源的行为。没有编译失败或产品运行错误。

本项是调查记录，不声称修复完成，也不以减少采样、关闭深度检查或关闭历史重建掩盖创建成本。

后续缓存对照已确认球面程序有明显编译缓存收益。下面的 Globe / Planar 数据没有统一浏览器和驱动缓存状态，
不得据此推断球面冷编译显著快于平面；同步编译阻塞以及预计算资源已被使用的结论保持成立。

## 测量条件与结果

入口为 `Test/AdvancedEnvironment/综合环境.html?world=globe|planar`，使用本地开发构建。
环境默认已 ready，再首次设置 `showClouds=true`；保持默认 high 云质量、云影 / 体积光关闭。
GPU 为 NVIDIA GeForce RTX 3060 Ti，ANGLE Direct3D11。通过临时浏览器诊断记录
`publishCloudResources`、WebGL 编译 / 链接 / 纹理调用及 Resource Timing；球面另采集 CPU profile。
所有诊断包装恢复，独立编译候选销毁，不修改产品源码。

| 指标                                           |            Globe |             Planar |
| ---------------------------------------------- | ---------------: | -----------------: |
| 云资源同步发布                                 |        1664.1 ms |         26188.2 ms |
| 六次 `getProgramParameter(LINK_STATUS)` 总等待 |        1591.6 ms |         26118.4 ms |
| 云 raymarch：linear / log                      | 156.1 / 337.2 ms | 3522.0 / 3556.3 ms |
| 云 resolve：linear / log                       | 187.9 / 396.4 ms | 7414.5 / 7560.9 ms |
| aerial 合成：linear / log                      | 250.0 / 264.0 ms | 2068.0 / 1996.7 ms |

- 球面 CPU profile 中 `createCloudOccupancySource` 约 59 ms；静态纹理上传不是主要阻塞。
- 平面五个 CloudCore 请求并行完成，单项 29.4–55.6 ms；此次命中 HTTP 缓存验证，不能用来承诺远程冷下载时间。
  解码后的数据合计 4,292,608 bytes，五个纹理分别为 shape、detail、weather、turbulence、STBN。
- 同一平面 Scene 关闭再开启：包含一次 `viewer.render()` 的同步时间约 1.6 ms，
  `compileShader` 次数为 0，CloudCore 新请求为 0，资源对象 identity 不变。
- 上述为本机该次首次实例化观察；没有清空浏览器 / 驱动的持久 Shader 缓存，不能视作跨设备基准或硬性阈值。
  没有 GPU 每帧时间测量，不能据此评价运行帧率。

## 缓存对照补测

负责人指出球面可能已经命中缓存后，重新打开独立球面页面 / Context，首次启云仍约 1638.1 ms。
对其中的 `cloudResolveLogDepthProgram` 使用直接构造的原生 ShaderProgram 执行受控编译，
绕过 Cesium `ShaderCache` 对象复用；每个候选均 `_bind()` 完成链接后 `finalDestroy()`。
不执行候选绘制，不替换 Scene 的程序，也不清理用户全局浏览器或驱动缓存。

| 程序输入                                   | 新建及编译 / 链接 |
| ------------------------------------------ | ----------------: |
| 原始球面 resolve log 源码                  |          387.7 ms |
| 所有 `u_` uniform 一致改名的等价变体，首次 |         5070.3 ms |
| 完全相同的改名变体，再次新建               |          192.2 ms |

改名仅作用于临时诊断字符串，保留分支、采样和计算逻辑，改变实际程序名称；不是只加注释。
相同变体在不同 ShaderProgram 对象间从约 5.07 秒降到 0.19 秒，证明 Cesium 对象缓存之外存在显著编译缓存收益。
无法进一步把收益精确归属到 Chromium、ANGLE 或显卡驱动中的某一层。

该补测证明此前 1.66 秒不能作为球面无缓存创建基准；它没有测量六个球面程序的完整冷启动总时间，
也未统一两个世界的全部持久缓存。后续性能修复必须分别记录新源码首次编译、相同源码重复创建和同场景 warm toggle，
不能通过页面刷新或关闭 HTTP cache 宣称清除了 GPU 程序缓存。

## 源码链路

1. `Source/SceneGIS/Scene/SceneGISEnvironmentEffects.js` 的 `fetchEnvironmentAssets` 使用
   `Promise.all` 加载 `Assets/SceneGIS/Environment/CloudCore/globe-*.bin`。
   当前平面也使用这些已审计的 authored assets，但保留自己的坐标、过滤和传输算法。
2. `publishPendingResources` 在正常更新中调用 owned renderer 的 `publishCloudResources`。
3. `_SceneGISEnvironmentEffectsRenderer.js` 的 `createCloudResources` 创建 cloud / cloudResolve
   各自 linear、log 两个程序；随后 `publishCloudResources` 再创建带云合成的 aerial 两个程序。
4. `createProgram` 每次 `ShaderProgram.fromCache` 后立即 `_bind()`。
   原生 `Source/Renderer/ShaderProgram.js` 在 `linkProgram` 后读取 `LINK_STATUS`，等待编译 / 链接完成。
   六个程序因此串行阻塞；当前 `frameState.useLogDepth=true`，实际执行只选择每对中的 log 程序。
5. shape / detail / weather / turbulence / STBN 均读取预计算 bytes。
   occupancy 的保守 max hierarchy 仍由 CPU 根据真实 shape 构建，部分普通 mip 由 GPU 生成；
   这些是剩余初始化工作，但本次量级不足以解释 26 秒停顿。
6. 本机 Context 支持 `KHR_parallel_shader_compile`，当前 `ShaderProgram` 没有使用该扩展完成异步编译状态轮询。
   仅删除 `_bind()` 会把等待移到首次 draw，不能等价为消除卡顿。

## 已排除的简化解释

`createProgram` 向各个 pass 拼入较多公共库。为验证是否只是未使用函数太多，独立编译了一个平面
cloudResolve log 对照程序：保留原 resolve 主体、深度 / phase helper、shadow packing 和必要常量，
去掉未使用的大气、雾、云密度 / raymarch 库。最终 GLSL 由 136,253 字符降至 40,421 字符，
成功链接仍花费 7456.7 ms，与原程序的 7560.9 ms 接近。

因此不能把“缩短 Shader 文本”作为已证实的主要优化。实际 resolve 中的邻域重建、平面接收面检查、
历史有效性判断与分支才构成编译器处理的主要有效程序。具体由哪个循环展开 / 内联规则造成昂贵优化，
本次没有进一步定论，不把驱动内部行为当作已证实根因。
此精简实验也是单次且未统一缓存状态的观察，只能说明此次精简未获得明显收益，不能替代受控冷编译对比。

## 后续优化方向与边界

负责人为后续环境实现任务；进入实现前单独建立 standalone / phase plan，并保留本记录作为基线。

1. 优先评估只准备当前深度模式的程序，另一模式在实际需要时创建。当前平面线性深度三项合计
   约 13.0 秒，但按需创建只减少初次工作，不能解决剩余程序本身耗时或切换时的等待。
2. 在统一缓存条件下调查两世界 resolve / raymarch 的编译优化复杂度，保留所有遮挡、历史拒绝、
   采样数量和光学语义；需要同场景画面、稳定帧 GPU 成本及资源生命周期回归。
3. 若接入原生 ShaderProgram 的异步编译，必须正式设计 candidate / ready / failure / destroy
   状态和不支持扩展时的行为，登记新的或适用的 SGP。不能用 raw GL 私有副本绕过 Renderer 所有权，
   也不能只做延迟 `_bind()` 或把等待包装为 Promise。
4. occupancy 离线化只能作为次要优化；先解决秒级程序编译，不增加新的资源协议来追逐约 60 ms 的次要成本。

本项只更新本调查及扩展索引，未修改引擎、Shader、SDK、资源或上游文件，未提交。
已有大气视觉验收、strict-WebGL fixtures 等事项维持原状态。

文档验证：新调查 Prettier、全 AgentDocs Markdownlint、`git diff --check` 通过。
全 AgentDocs Prettier 仍报告 595 个历史文件格式告警（含原扩展索引），未重排无关文档。
本次没有运行产品 Specs 或构建；产品源码未变，验证范围为上述浏览器性能调查和文档检查。
