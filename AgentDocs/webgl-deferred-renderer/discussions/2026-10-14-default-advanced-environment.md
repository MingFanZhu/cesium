# Default advanced environment ownership

## Metadata

- Type: discussion
- Status: owner-approved; implementation and technical validation complete, visual gate pending
- Created / Updated: 2026-10-14
- Parent: [P4d](../plans/2026-10-14-p4d-opaque-pipeline-consolidation.md)
- ADR / SGP: ADR-0161 / SGP-0046

## Confirmed direction

负责人允许自动创建高级环境。默认开启物理大气、空气透视与指数高度雾；体积云等高开销部分默认关闭。禁止用原生雾 / 大气 / 旧 Globe daylight 回退；保留材质、阴影、拾取与高级环境需要的 Moon / 星历基础。

现代码 showClouds=false 仍无条件下载 CloudCore 的五项资源并创建 cloud shape / detail / occupancy / weather / turbulence / STBN 纹理及 shader。轻量默认必须先把这些资源改为首次启用云时才加载 / 分配，不能只不提交 cloud draw。默认也关闭 cloud shadows、crepuscular rays、HDR bloom、lens flare；它们仍可显式启用。

## Approved access and lifecycle

- 新增只读 `scene.environmentEffects`，返回当前有效的 `SceneGISEnvironmentEffects`。存在 Globe / Planar world 时，Scene 懒创建默认实例；调用方使用现有 `enabled` / `show*` 属性控制它。无主 World 的 Scene 不推断环境模式。
- Scene 只拥有自动实例；场景销毁或 World 更换时注销并释放它。默认创建本身不启动网络 / GPU，首次正常帧才激活资源与管线。
- 继续接受 `viewer.addController(explicitEffects)`：注册的显式环境优先，自动实例让位并释放自有 GPU，不覆盖 / 销毁显式控制器。显式实例 disabled 时也不擅自启用默认实例。
- 移除显式实例后，恢复自动实例原有 enabled 状态；用户已关闭的默认实例保持关闭。自动实例属性在同一个 World 内保留。已有多显式实例冲突仍报错。
- Globe 使用既有 primary celestial light；Planar 仍使用明确的 World 与固定 Z 坐标，不根据位置猜模式。需核对并复用已有 Planar light authority，避免双 Controller 竞争。
- 显示 HDR 开关继续控制 tone mapping；高级环境计算使用延迟管线的线性浮点空间，不借自动创建静默改写 caller 的显示设置。

## Budget and checks

不含云的基础大气 LUT 为 8,527,872 bytes（8.13 MiB）；1280×800 的 RGBA16F 空气透视 / 雾合成目标为 7.8125 MiB。深度优先借用延迟统一深度。上述是可核算基础项，最终预算须以实际分配清单补齐；不能宣称仅关闭 showClouds 就已零云成本。

验证默认启用、显式接管 / 移除、手动关闭、World 更换、销毁、资源首次加载失败与 requestRender。云验证冷启不下载 / 不分配、首次启用按需加载、关闭不绘制及最终释放。保留默认画面的浏览器 / 成本和负责人视觉 gate，不先提交 P4d。

2026-10-14 负责人接受 scene.environmentEffects 与显式接管规则。Planar 无手动 light authority 时使用默认固定 Z 向上的 Sun / 向下的 Moon；不推断地理原点。显式 PlanarEnvironment 注册时默认 light authority 让位，移除后恢复。默认 disabled 时不持有 light authority。

## Implementation result

已完成上述契约。自动实例采用 surfaceRadianceScale=1，兼顾默认 LDR 地表；手动实例的构造默认值保持不变。高级环境活跃时 Planar 原轻量天空提前返回，避免重复准备和绘制。冷启动不分配云纹理、云 Shader 或云阴影图集；首次开云升级保留同一 LUT，关闭保留热资源直到断开 / 销毁。

六项默认环境 GPU Specs 与 Globe / Planar 两项浏览器 E2E 有通过证据，完整 release / types / tsc 通过。浏览器另外复现并修正 Planar 同开空气透视与高度雾时不作用于地表的问题；具体根因边界、像素证据及自审见 [最新 review](../reviews/2026-10-14-p4d-entry-audit.md#default-advanced-environment--technical-verification-complete)。1280×800 基础 LUT 为 8,527,872 bytes、合成目标 8,192,000 bytes、星点 buffer 98,336 bytes；固定 Primitive 夹具无 cloud / shadow atlas / bloom / sky-reflection 分配，模型可能按需请求 sky-reflection，不能把零分配外推。

默认环境的新画面待负责人视觉确认。高级 Globe 原有自定义 scene.light 冲突仍在，需随 P4d 最终 API 边界审计记录；本讨论未批准改变显式光源所有权。P4d 未提交。

负责人在视觉检查时发现首次开云的 Planar 天空变黑。已修正 clear-depth 视线重建，新增修复前失败的 GPU 用例和两项浏览器开云 / HDR 检查通过，资源与调度预算不变。当前七项专用 GPU 用例有通过证据，重新视觉验收待完成；详见 review 的 cloud-enabled sky 节。

2026-10-15 状态核对：上述 pending 是历史增量状态。负责人后续确认开云和自定义主光画面通过，已接受显式 DirectionalLight 所有权方案；P4d 已提交 `4ba2e217c7`。最终结论见 [P4d review](../reviews/2026-10-14-p4d-entry-audit.md) 和 [ADR-0161](../../../Documentation/SceneGIS/Decisions/ADR-0161-unified-opaque-deferred-direction.md)。此讨论不再有未解决决定。
