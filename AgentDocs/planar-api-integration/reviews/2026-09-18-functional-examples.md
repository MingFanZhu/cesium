# 平面功能示例整理评审

- Type: review
- Status: approved（技术自审；上手体验交付负责人查看）
- Updated: 2026-09-18
- Author / owner: 当前 Agent，architecture/execution 自审，非独立评审
- Target: [standalone plan](../plans/2026-09-18-functional-examples.md)
- Upstream-owned files / SGP: 无

## Findings

- Fixed：综合 API、公开数据与诊断混在四个大页面。现有八个独立中文 HTML/JS，只展示所属公共 API；
  原综合页归入明确的 tests 入口，旧 URL 导向功能页，根目录改为功能目录导航。
- Fixed：新示例仅用外层 controls 容器定位默认 lil-gui，说明独立；无诊断计数、断言或销毁按钮。
- Fixed：当前浏览器 ImageBitmap 不能解码 SVG 高程图，导致 flat fallback。替换为有源码的原创 PNG fixtures；
  E2E 实际检查中心地形超过 2500 米，避免只验证页面打开。
- Fixed：日月 controller 必需初始方向；surface 导航下向上相机无法被 controller 采纳。
  使用显式日月方向、南京天文参考与有效的近水平向下相机，检查实际 direction 和可见日落画面。
- Accepted：公开服务示例保留网络依赖与失败提示，其余页面完全本地；本地合成数据不代表真实地图。

## 验证与交付

8 项页面 E2E 通过，覆盖所有入口、代表控件实际改变对象、地形高度、天空时间轴、外网隔离、
BFCache 保留、离开后释放与重复销毁。天空相机最后调整后其单项重新通过；代表截图已自查。
ESLint 与修改范围格式检查通过；本次没有产品行为变化，不重复 engine/release 全量验证。
本地 checkpoint 后继续用户已授权的高级环境示例整理；后续记录在其已有扩展中。
产品 I1–I5 的原验收、风险和 deferred 范围不变。
