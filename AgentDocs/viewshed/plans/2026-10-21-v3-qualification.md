# Phase Plan: V3 example and qualification

## Metadata

- Plan type: phase
- Status: completed (technical; project-owner visual acceptance pending)
- Parent plan: [extension](2026-10-21-extension.md)
- Phase: V3
- Owner role: execution
- Architecture review: confirmed
- Architecture reviewer: current task self-review
- Created / Updated: 2026-10-21
- Entry checkpoint: V2 `c2a91dceb7`
- ADR: 0176
- SGP: SGP-0065

## Objective and source facts

补齐可操作的双世界验收示例和实际 S3M / 3D Tiles 集成证据。
V2 已通过 11 项深度 / 分析 GPU Specs，原生模型 CustomShader 与 clipping
已验证。现有本地数据有 Rendering/AGI HQ、ModelFlatten 双层网格、S3M
CBD / comModel，以及可选缓存的晋江倾斜摄影。直接复用，不新增二进制。

## Design and affected paths

- `Test/可视域分析.html` + `Test/Viewshed/example.js` 仅组装公共 API：
  世界 / 数据切换、观察点位置 / 朝向 / 视角 / 距离、分辨率、主相机定位、
  遮挡源显隐、压平开关、分析状态和 CPU 提交时间。
- 默认本地确定性街区 + World 表面；Globe 使用 ENU 转 ECEF，
  Planar 使用显式大坐标平移。模型数据采用同一放置矩阵。
- 3D Tiles 和 S3M 使用已有本地数据；倾斜 S3M 缓存缺失明确提示，
  不默默切换数据。数据加载期间允许操作，但以 analysisReady 判定结果。
- `Specs/e2e/scenegis-viewshed.spec.js` + owned Playwright config。
  地图 UI 不写复用业务逻辑，产品修复仍在 owned engine / SGP 接点。

## Validation

1. 双世界街区逐帧获取红 / 绿区域，改变主相机、遮挡源和观察点后验证更新；
   校验 pick 不改变分析相机 / 结果，关闭与销毁释放分析目标。
2. 原生 3D Tiles 实际压平影响遮挡；S3M 精模 / 实例化和缓存倾斜完成
   独立 observer LOD，主相机移开仍能捕获，不出现 renderError。
3. 1024 深度图在暖态统计 CPU 提交时间、draw calls 与开 / 关整帧开销；
   区分 CPU 和 GPU 时间，不将某台设备结果作为固定性能承诺。
4. 浏览器截图人工检查；release shader 冒烟；页面卸载 / 重建无残留。
   不重复 V2 已通过的全量 build / type gate，除非本阶段修改产品公共 API。

## Completion criteria and remaining boundary

例子可直接打开，E2E 和自审完成，结果记录到 review，再创建独立 checkpoint。
有限分辨率、透明物体和既有 Surface 测试失败沿用 V2 边界；
最终项目负责人视觉验收和 SDK 集成仍在本阶段交付之后。

## Integration finding

街区 E2E 的显隐 / 移动主相机过程复现主 deferred light 的
`model_specularEnvironmentMapsMaximumLOD` 读取 undefined。
`createGroup` 重新运行原生 lighting pipeline 生成 Shader，却丢弃对应
uniformMap，改用较早的 geometry pipeline uniformMap。程序化 IBL 在两次
准备之间完成时，Shader 与纹理分支不一致。
最小修复位于 owned `_SceneGISDeferredLighting.js`：保留该 lighting
pipeline 同次生成的 uniforms，并在来源 uniformMap 重建时重建组。
不修改上游、调色、曝光、模型 IBL 参数或资源预算；由同一 E2E 复验。

## Results

10/10 dev E2E、3/3 release smoke、21/21 DeferredLighting Specs 通过；
透明地表不再参与 observer readiness，GPU 回归通过。完整 release / declarations
通过。1024 深度图 4 MiB，暖态 CPU / draw 开销见 [V3 review](../reviews/2026-10-21-v3.md)。
街区轮廓通过自查，倾斜摄影粗糙表面的采样噪点与既有 Surface 失败明确保留。
技术 gate 已确认；最终负责人视觉验收与 SDK 集成待后续确认。
