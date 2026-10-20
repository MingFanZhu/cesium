# 平面方向性多次散射技术评审

- Type：implementation / architecture self-review
- Status：implementation verified；项目负责人视觉判断保留
- Owner：当前任务，Architecture / execution
- Created / Updated：2026-10-20
- Target：[standalone plan](../plans/2026-10-20-planar-directional-scattering.md)
- Related：ADR-0042；无 upstream-owned file / SGP 增量

## 实现与审查结论

Version 4 将所有入射方向平均后乘散射系数，丢失高阶相函数方向性。Version 5 使用
degree 16 实余弦球谐表示散射源，分别按 Rayleigh、Cornette–Shanks Mie 的解析 Legendre
moments 做归一化卷积。源表保持 32×32 height/Sun，光路仍为 fixed +Z flat slab；
高阶只读取上一阶，ground boundary 只读取 n-2 阶照度，没有重复加入单次散射或累计照度。
系数沿路径积分后再按方向求值，复用同一光路的 8 个输出方向。

球谐为离线内部表示，不进入运行时。Canonical generator 重新生成 scattering.bin、
irradiance.bin、provenance.json；同步批准哈希及 package verifier。Transmittance 和 Globe
资产不变，现有 packing、三纹理总量 8,527,872 bytes、Shader、lookup、pass、公共 API、
曝光、物理系数与高度雾参数均未因本项修改。

技术自审未发现新的阻塞项。没有调用独立评审 Agent，不能将本记录表述为独立评审通过。

## 验证与成本

- Node 17/17：直接角积分、方向性、相函数 moments、实球谐正交归一化、ground feedback
  及 order recurrence、night/zero path、水平极限、dense 单次散射、irradiance、binary16、
  精确资产与 provenance、全量确定性重建、tamper 和原子发布。
- 独立 128×128 midpoint 角积分在 58.594 m、太阳高度约 2.74° / 45.39°、六个观察方向
  检查二阶 source，最大逐通道相对误差 1.4073%，阈值 2%。只共享已由 dense integral
  验证的 L1 光程，角积分直接使用真实相函数，不使用待验证的 harmonic convolution。
  这不是对所有高度、方向与完整模型的统一误差保证。
- 12 阶初选与 20 阶加密对照，在低太阳高度的部分 source 上有约 3.9% 差异；因此采用
  16 阶。没有用 clamp、调色、密度或俯角阈值掩盖差异。完整 canonical 输出均有限非负。
- 相同本机完整离线构建：旧版 46.84 s，新版 55.88 s（约增加 19%）；并行构建期间的
  确定性重建测试为 64.37 s。最终进程 RSS 约 132 MiB，该值不是峰值测量。
- 实际 ChromeHeadless / WebGL validation 4/4：planar Texture3D warm/re-register/dispose、
  horizon continuity、finite endpoint/slab exit、frozen-grid diffuse irradiance。后一测试先因
  version 4 固定参考数失效，再按新 binary16 资产和独立解析 direct subtraction 重算，
  保持原 0.0003 容差；未通过放宽容差处理失败。
- 南京当前 1001×826、RTX 3060 Ti / ANGLE，雾关闭、有矢量地物、相同输入和 Shader，
  旧 / 新 LUT 交替各 24 次：Background median 均为 0.053248 ms，Aerial median 均为
  0.038912 ms。P90 分别为 0.056320 / 0.057344 ms 和 0.041984 / 0.043008 ms。
  GL error 0、无 timer disjoint、环境资源 identity 不变；临时纹理/FBO/program/query 释放。
  此结果只对应该画面中的两个 pass，不代表整帧或其他 GPU。
- 开发与发布构建通过。Source、CesiumUnminified、Cesium 以及实际 engine npm archive
  提取后的 LUT/provenance 全部通过 canonical verifier。全仓 package smoke 的根包打包
  报告 tarball corruption/retry，数分钟未完成，已终止该检查自己的 npm 子进程；根包
  npmignore 允许包含大量 Build 过程产物，但本次没有完成该打包问题的根因定位。
  不声称完整根包 smoke 通过，不为本任务修改上游 npmignore 或删除用户的过程产物。
- Scoped ESLint / Prettier、全量 AgentDocs Markdownlint、diff whitespace 与基线所有权
  检查通过。全量 AgentDocs Prettier 报告 451 个未修改文档的既有格式问题，本次涉及
  文件均通过，不扩大格式化范围。本项没有公共类型变更；此前类型构建结果保留。

## 画面与剩余边界

两页同经纬度、高度 706.353 m、local ENU direction/up、FOV，时间为北京时间
2026-10-20 12:00；关闭高度雾、云、泛光、自动曝光，手动 exposure 1，原物理参数和
白平衡不变。恢复 Planar 刷新前的 Bright 矢量和底色后完成对照，页面均 ready，无环境错误。

平面方向性高阶散射已进入实际 GPU；当前水平视线的 RGB radiance 由约
`[0.24512, 0.22046, 0.23718]` 变为 `[0.25732, 0.22949, 0.24402]`。
这项物理补齐没有自动消除平面近水平暖色过渡。平面水平 T 仍为 0，球面相同射线约
`[0.15173, 0.01639, 0.0001434]`；该光程差异不能通过套用球面数据来消除。
不以两世界逐像素接近作为本次正确性证据，也不宣称暖色过渡已经视觉验收。

仍保留四阶截断、离线源网格与角展开、输出 8 个 scattering-cosine samples 的近似。
既有 strict background fixture 问题仍按历史 review 记录，不因本次相关测试通过而关闭。
证据位于忽略目录 `Build/planar-directional-scattering/`，未提交生成缓存或截图。
所有改动过的 upstream-owned files：无；SGP：无新增或修改。2026-10-20 按负责人后续要求独立提交，未推送。
