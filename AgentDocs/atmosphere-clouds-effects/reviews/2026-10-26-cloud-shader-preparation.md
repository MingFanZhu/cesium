# 体积云异步准备技术自审

- Type: review
- Status: completed; no open code finding, owner approved the local checkpoint on 2026-10-26
- Author: implementation / architecture self-review
- Updated: 2026-10-26
- Target: [standalone plan](../plans/2026-10-26-cloud-shader-preparation.md)
- Decision: ADR-0190; upstream patch SGP-0069

## 已定位问题

1. **P1 / cancellation / fixed**：实际 ANGLE 大程序编译未完成时，仅直接删除 shader/program
   会产生延迟 `INVALID_VALUE`。原生 pending 清理显式 `detachShader` 后再删除两 shader 和
   program；无轮询等待或重试。实际 Planar resolve 改名冷源复现取消调用为 0 ms，最终 GL error 0；
   环境 hide / disable / failure 生命周期回归通过。未初始化 `_program` 不再传入 deleteProgram。
2. **P2 / binding contract / fixed**：原生 sampler 初始化改变 GL 当前 program。
   private `_prepare` 在初始化前后保存 / 恢复当前绑定，保持准备入口不改变调用者绑定的契约；
   普通 `_bind` 行为不变。原生 Context 每次 draw 仍会显式 bind，不能把云 MRT fixture 的
   draw failure 归因于 Context 缓存。当前绑定与原有绿像素 draw 的回归通过。
3. **P2 / fixture lifecycle / fixed**：既有 lazy MRT fixture 手动连接 controller，随后
   直接连续 render、未逐帧 update；阴影历史读写索引不推进，resolve 发生 framebuffer feedback。
   fixture 现显式驱动 controller，并在深度模式切换后等待当前变体，不改产品 history 策略。
   原像素、history、两世界 quality resize 断言全部通过；异步等待需使用明确的 120 s 测试预算，
   而非依赖同步阻塞阻止 Jasmine 的 30 s timeout 执行。

## 验证边界

Chrome Headless 155 / Windows；本轮只运行新增准备生命周期与相关原生、云 MRT 回归，
不运行全库测试。Owner 的既有画质待办不由本轮关闭。

- `gulp test --includeName SceneGISShaderPreparation --browsers ChromeHeadless --webglValidation --failTaskOnError`：6/6。
  覆盖 pending 查询、反射、实际像素、绑定、共享缓存、同步互操作、无扩展、取消及失败。
- 同参数 `--includeName SceneGISCloudPreparation`：3/3；当前深度三程序、原子发布、资产复用、
  深度切换、warm 开关、取消、失败一次上报及可选 shadow 准备 / 回收。
- 同参数 `--includeName Renderer/Shader`：129/129。
- 同参数 `--includeName "executes one lazy cloud MRT and resizes only for quality"`：1/1，76.24 s；
  保留原像素和 history assertions，覆盖 Planar 与 Globe、深度切换与 quality resize。
- `npm run build-release`、`npm run build-ts`、`npm run tsc` 通过。类型生成保留原有 TSD-JSDoc warnings。
- changed-source ESLint、owned-source / 新文档 Prettier、Markdownlint、`git diff --check` 通过。
  全 AgentDocs Prettier 的既有历史格式差异不扩大修复；README 只更新局部索引。
- `node scripts/scenegis/audit-upstream-patches.mjs` 通过；当前交付 upstream-owned file 1，generated status 0。

## 受控性能与画面

设备为 RTX 3060 Ti / ANGLE Direct3D11，支持 KHR_parallel_shader_compile。
从已创建 Planar 场景取当前 log-depth 三个实际程序，分别一致重命名所有 `u_` uniforms，
保持计算不变且绕过 Cesium ShaderCache。每组使用一个新命名空间；同一异步组再重复一次。
测量时暂时关闭 Viewer 渲染循环，保留浏览器 rAF 心跳，结束后恢复；没有清空驱动缓存。

| 路径                     | 总完成时间 | 主线程准备总耗时 | 最大单次调用 | rAF 最大间隔 |
| ------------------------ | ---------: | ---------------: | -----------: | -----------: |
| 三个新源同步 bind        | 12961.2 ms |       12960.3 ms |    7416.9 ms |   12950.4 ms |
| 三个等价新源异步 prepare |  8605.3 ms |           8.7 ms |       0.7 ms |      17.3 ms |
| 同一异步源重复           |   265.8 ms |           2.7 ms |       0.7 ms |      16.8 ms |

全部完成后 GL error 0。同步组和异步组都为首次使用其源名字，不能称为彻底清空驱动缓存的
全场景冷启动。该对照验证消除了同步状态查询造成的秒级主线程等待，不承诺跨设备总时间。
另一次原始源缓存可用的真实 Planar 页面启用总计约 664.5 ms，准备调用最大 106.8 ms；
该调用还包含纹理上传与 occupancy 构建，说明这部分 CPU / upload 工作仍是残余开销。

Globe / Planar 综合页按正式 GUI 开启体积云及云影，ready=true，GL error 0，控制台无 warning/error；
云层、地表、遮挡和云影可见。临时截图位于 `Build/cloud-preparation-globe.png` 和
`Build/cloud-preparation-planar.png`，不提交生成图片。没有改动用户原有页面。

## 剩余限制

无扩展的设备仍同步编译当前三个程序；KHR 也不保证 compile/link 调用在所有驱动上完全无耗时。
未预计算 occupancy、未改大型 GLSL，也未隐藏纹理上传成本。等待中的云会在当前变体完成后出现；
深度模式首次切换时同样等待，已有天空与场景继续绘制。未在所有 GPU 上建立性能保证。

无 SDK、GLSL、asset、采样预算、texture 数量或上游 Scene hook 变更。
唯一 upstream-owned 改动为 `packages/engine/Source/Renderer/ShaderProgram.js`，SGP-0069。
2026-10-26 负责人要求提交当前云优化，启动准备作为独立本地检查点；不推送。
