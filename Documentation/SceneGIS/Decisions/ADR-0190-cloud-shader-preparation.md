# ADR-0190：体积云按需与异步 Shader 准备

- Status: accepted for implementation
- Date: 2026-10-26
- Patch: SGP-0069
- Related: ADR-0040, ADR-0046, ADR-0048

## 决策

在原生 ShaderProgram 增加 private `_prepare`：提交 compile/link 后只查询
`KHR_parallel_shader_compile.COMPLETION_STATUS_KHR`；完成后沿用原生链接错误处理、
uniform/attribute 反射和 sampler 初始化。未支持扩展时沿用原生同步初始化。
同步 bind/getter 可以完成同一候选程序，不重复创建；缓存引用计数和 finalDestroy
拥有全部 pending program/shader handles，业务层不得访问原始 WebGL。

这是 ADR-0040 所要求的独立 Renderer integration decision，不扩写 SGP-0008。
唯一上游实现路径为 `packages/engine/Source/Renderer/ShaderProgram.js`；SGP-0069
在上游提供等价缓存内异步准备和取消生命周期后可移除。

环境 Controller 正常启动先发布已就绪的无云大气，按当前 native depth encoding 准备
cloud / resolve / aerial 三个程序。全部成功后原子发布云资源；另一深度模式首次使用时
再准备，完成后保留以便复用。可选云阴影两程序亦在准备完成前不执行。
异步候选由 renderer 拥有，失败、代际替换或取消释放；已发布资源继续沿用原生命周期。
公开 ready 表示大气及已启用云的当前变体就绪；不承诺所有未使用变体均已编译。

GLSL、预计算资产、材质、预算与渲染顺序保持原契约。原有 private 同步整代发布仍适用于
显式原子替换，正常启动不再调用其包含云的路径。无 timer、Worker 或常驻渲染循环。
仅 pending 状态请求下一帧，不能以 Promise 包装同步 bind 冒充非阻塞编译。

## 验证与限制

用真实 Context 验证完成查询先于链接/反射、同步调用互操作、错误、缓存、取消和绘制。
环境验证首轮三程序、深度切换、资源发布、禁用/销毁以及双世界画面。
性能报告区分缓存条件、主线程最大调用时间与总 ready 时间，不将 warm Globe 与 cold Planar 对比。
扩展减少等待查询造成的阻塞，但不能保证浏览器 compile/link 调用本身完全无耗时，亦不保证总编译时间下降。

参考：[Khronos extension specification](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/)。
