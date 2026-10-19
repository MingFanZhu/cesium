# 固定太阳白点显示校正评审

- Type: technical review / self-review
- Status: implementation verified；负责人视觉验收待定
- Author / Owner: 当前任务，Architecture / execution
- Created / Updated: 2026-10-19
- Target: [standalone plan](../plans/2026-10-19-solar-white-balance.md)
- ADR: [ADR-0169](../../../Documentation/SceneGIS/Decisions/ADR-0169-solar-white-balance.md)
- Upstream: `packages/engine/Source/Scene/PostProcessStageCollection.js`；SGP-0044 / SGP-0046

## 发现与处置

### WB-001 — 物理太阳 RGB 未经过显示白点校正（P2，fixed）

当前白屋顶的暖色不能仅归因于高度雾；关闭雾和空气透视仍存在。
参考 Bruneton demo，将冻结太阳光谱积分得到的 linear sRGB 按算术平均归一，
在显示阶段逐通道相除。既有 Sun 转换系数与太阳样本重建同一光谱积分，
白点约 `(1.082414, 0.967556, 0.950030)`；公共光度单位在归一时抵消。

新增 `SceneGISEnvironmentEffects.whiteBalance`，默认 true，构造 / setter 检查 boolean。
两世界由既有 active lighting record 发布，停用或解绑环境恢复 identity。
通过 existing display stage 同时处理 HDR / LDR，不修改物理 LUT、光照倍率、雾或材质。
HDR 顺序为曝光、固定太阳白点、可选相机调色、tone curve、gamma；LDR 为固定太阳
白点、clamp、gamma。已有 `SceneGISColorGrading` 继续要求 HDR，默认 disabled。

### WB-002 — 白平衡切换不得增加颜色 pass 或重置历史（P2，fixed）

复用原生 collection 的 grading hook。SGP-0046 的 LDR source 配置先执行，随后
SGP-0044 组合共享函数，避免后者被 source 替换丢失；Context 只用于读取本帧 record。
开关只改变 uniform，不增加 FBO / sampler / draw，不重建环境、Shader 或显示目标，
不重置 TAA / cloud history。进入 / 离开 active 环境可以重建现有显示 variant。
注记、unlit、emissive 与整幅场景接收同一显示变换；DOM 控件不受影响。

## 验证

证据保留在忽略目录 `Build/color-shift-diagnosis/`，不提交生成物。

| 检查                                                   | 结果与风险                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `npm run build`、`npm run build-ts`、`npm run tsc`     | 通过；GLSL / dev bundle / API 类型接入                                                                              |
| `SceneGISColorGrading` strict-WebGL Specs              | 13/13；双世界记录、全部 6 个 tone curves 和 LDR、一次校正、alpha / 黑色、日落暖色、HDR 手动调色顺序、资源复用与解绑 |
| `solar white balance as warm state` strict-WebGL Specs | 2/2；真实双世界 renderer 发布、默认 / 类型 / request-render、无重新加载或编译、无 history reset                     |
| 综合环境 E2E                                           | 最终结果见收口记录；覆盖新增控件、默认值恢复及生命周期                                                              |
| scoped ESLint、格式、补丁审计                          | 最终结果见收口记录                                                                                                  |

在用户原白屋顶视角与时刻切换新控件，粉色减轻；`white-balance-off.png` /
`white-balance-on.png` 可复核。正午 04:00 UTC 与低太阳 08:30 UTC 下仍保留照明变化。
Planar 检查了正午 LDR 与低太阳 HDR，环境 ready 且无渲染错误。
原用户页面恢复相机 / 时钟 / 图层 / 其余环境参数，保持新白平衡开启，并展开控制组。
临时验证页面已关闭。最终视觉判断仍由负责人确认。

RTX 3060 Ti / ANGLE D3D11，1001×826，借用实际显示输入，对原 LDR shader 和当前
shader 交替各测 24 次。旧 median / P90 为 0.008192 / 0.008192 ms，新为
0.009216 / 0.010240 ms；中位增加 0.001024 ms。无 disjoint、GL error 为 0，
页面 stage / command identity 不变，临时 query / program / target 均已释放。
这是本机显示 pass 的有界样本，不代表整帧或其他 GPU 性能。

## 最终收口记录

双世界综合环境 E2E 2/2 通过，新增控件的默认 true、关闭发布、恢复默认及销毁均验证。
本机使用临时测试配置复用运行中的开发服务器，Chrome / ANGLE D3D11；仓库通用配置的
Chromium / `--use-angle=gl` 在首次环境绘制时发生 width=0 错误，保留失败日志，
未为该测试环境修改产品代码。临时启动配置位于忽略目录。

scoped ESLint、改动文件格式与 `git diff --check` 通过。AgentDocs 全量 Markdownlint
通过；全量 Prettier 仍有其他 452 个既有文档格式告警，本次文档均通过，不做无关格式化。
构建类型工具有既有 JSDoc 警告但 build-ts / tsc 成功。

官方基线补丁审计通过：当前交付仅一个 upstream-owned file，即
`packages/engine/Source/Scene/PostProcessStageCollection.js`；SGP-0044 / SGP-0046
原有成对标记及清单保持有效。没有脏的生成文件；其余实现、Specs、示例和文档均为
SceneGIS-owned。新增公共属性已进入自动生成类型，生成物不提交。

## 本地提交复核

2026-10-19 清理 MVT 专用水面后复核：13 项调色与 2 项双世界 warm 状态测试通过，
开发 / 发布构建、build-ts / tsc 及补丁审计通过，生成物不含已撤销的 MVT 水面导出。
综合环境平面 E2E 发现原时钟断言对 JulianDate 浮点运算使用严格相等，
实际 3642.9999999999995 秒与目标 3643 秒只相差舍入误差；测试改用纳秒级容差，
保持五个时钟状态和全部控件 / 生命周期契约，未改产品时间逻辑。
受影响的平面用例单独重跑通过；此前球面用例已通过，未重复无关测试。

## 剩余风险与交接

- 固定太阳白点不等同于当前地面混合照明的自动白平衡，不能保证任意时刻的白材质都
  显示为等 RGB。大气暖色和影像中已拍摄进去的光照仍然存在，不继续为白屋顶调倍率。
- 太阳光谱或转换系数变化时须同步复核显示白点和独立 GPU 参考值。
- 保留先前高度雾修复工作区及其评审。既有环境背景 strict-WebGL fixture 问题仍由
  [前次评审](2026-10-15-planar-high-altitude-precision.md)追踪，不宣称完整环境 suite 通过。
- 本次技术自审未发现剩余实现阻塞；负责人视觉判断保留。2026-10-19 负责人明确要求形成独立本地提交，不推送。
