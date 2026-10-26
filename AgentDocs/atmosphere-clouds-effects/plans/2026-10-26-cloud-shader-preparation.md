# 体积云按需与异步 Shader 准备

- Type: standalone plan
- Status: completed; owner approved the local checkpoint on 2026-10-26
- Author: implementation / architecture self-review; updated 2026-10-26
- Decision: [ADR-0190](../../../Documentation/SceneGIS/Decisions/ADR-0190-cloud-shader-preparation.md)
- Evidence: [startup investigation](../discussions/2026-10-26-cloud-startup-compilation.md)

## 目标与范围

首次启用只准备当前 `frameState.useLogDepth` 对应的 cloud、resolve、aerial 三个程序。
支持 KHR_parallel_shader_compile 时分帧查询完成状态，等待期间继续绘制已就绪大气与场景。
切换深度模式按需准备并保留已完成变体。可选云阴影程序使用同一准备机制，避免紧接着同步等待。
不改 GLSL、采样预算、画质、预计算资源、SDK、离线生成器或加载公共 API。

## 源码与所有权

- 原生 ShaderProgram 的 create/link 紧接 LINK_STATUS，导致调用线程等待；用 SGP-0069
  分离提交与完成反射，仍由 ShaderCache 引用计数和 finalDestroy 统一回收。
- 私有 renderer 持有候选程序，全部就绪后一次发布；异步期间不创建云纹理或执行未就绪程序。
- Controller 保留资产 buffer 至发布成功；ready 包含已启用云的当前深度变体。
- 保留私有同步整代资源替换入口及其失败原子性；正常 controller 启动先发布无云大气，再准备云。
- 禁用、重试、销毁和代际替换释放候选引用；场景按需渲染只在准备未完成时请求下一帧。

## 步骤与验收

1. 新 ADR/SGP；原生私有准备入口、缓存和取消测试。
2. renderer 当前深度候选、Controller 资产与 ready 生命周期、可选阴影准备。
3. 实际 WebGL Specs：pending 不查询链接/反射；成功像素；失败与销毁；深度切换与 warm reuse。
4. 双世界实际页面检查与受控等价新源编译测量，分别报告单次调用阻塞和总完成时间。
5. scoped lint/format、上游补丁审计、构建与类型检查；记录技术自审和未解决限制。

不承诺驱动总编译耗时下降；无扩展的设备保持原生同步行为。现有视觉待办不因本项关闭。

## 完成结果

原生 Shader 准备 6 项、云资源生命周期 3 项、原生 Shader 系列 129 项、既有双世界
cloud MRT / history / quality resize 回归 1 项通过。现有手动 controller fixture 增加逐帧
update、当前深度初始化和异步等待，没有修改像素断言。取消路径显式解绑 pending shaders；
初始化保留当前 GL binding。构建、类型、lint 与 SGP 审计通过。

实际 Globe / Planar 综合页启用云及云影后 ready、GL error 0、控制台无错误。
等价新源三程序的隔离编译对照为同步 12.96 s 与异步 8.61 s；异步最大准备调用 0.7 ms，
rAF 最大间隔 17.3 ms。同一异步源重复为 0.266 s，明确保留缓存差异。
这些是编译阶段数据，不是完整冷启动或场景 FPS 保证。详细边界见
[review](../reviews/2026-10-26-cloud-shader-preparation.md)。
