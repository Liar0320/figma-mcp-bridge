# 平台与视觉指导

平台规则优先于通用 UI 推荐。执行具体项目时读取当时的官方资料；本文件提供方向，不固定某一版本的组件 API。

## 公开 Landing Page / Apple-inspired

明确为公开 Landing Page 或产品发布页、且要求苹果官网气质时，使用 [Landing / Apple-inspired](landing-apple.md)。该模式的叙事、展示字阶与章节留白优先于下面的后台密度起点；品牌、业务事实和可访问性要求仍然优先。

Apple-inspired 不是第三种宿主平台，也不是 Apple 官方认证。Shopify 商家应用的公开介绍页可以使用该模式，但安装后的 Admin 界面继续使用下一节规范。其他品牌的 Landing 不默认启用 Apple 风格。

## Shopify Admin Embedded App

来源：
- https://shopify.dev/docs/apps/design
- https://shopify.dev/docs/apps/design/app-structure
- https://shopify.dev/docs/apps/design/layout
- https://shopify.dev/docs/api/polaris

规则：
- 使用 Shopify 宿主导航、App header、Page header 和 App body 的分工，不增加独立营销导航或全屏品牌外壳。
- 遵循当前 Polaris 组件、语义颜色、密度与原生交互。4 px 网格组织间距。
- 设置页按用途与配置分区；资源列表使用适合列数据的宽度；表单强调单一任务。
- 主区域突出一个主要行动，表格行操作使用次级样式。
- 窄屏遵从宿主移动导航；字段堆叠，结果保留状态、原因和必要上下文，次要信息可展开。
- 不把应用自己的成功状态与宿主安装、Webhook 或授权成功混为一谈。
- 不照搬营销 Hero、客户 Logo、转化率指标或大面积品牌装饰。

## 通用 B2B 后台

- 先识别用户角色、核心对象、使用频次与任务风险，再决定导航和密度。
- 高频操作优先可扫描、可定位与键盘效率；低频高风险操作优先解释影响和确认。
- Dashboard 只有在汇总真正帮助决策时才出现。没有真实指标不要用装饰图表填空。
- 表格展示跨记录比较；详情页展示单个对象；状态进展使用步骤或时间线，不强行套表格。
- 筛选与返回保留上下文。没有批量操作业务需求，不擅自添加多选、导出或重试。
- 未提供品牌时采用中性、清晰的基础视觉，声明为本次选择，不伪称已有品牌标准。

## 通用视觉底线

- 应用正文通常以 14–16 px 为起点；公开 Landing 正文通常以 16–18 px 为起点，结合平台密度、语言与屏幕实际阅读检查。不能为塞入内容持续缩小字号。
- 正常文本对比度至少 4.5:1；大文本及非文本交互边界按适用可访问性规范检查。状态有文字，焦点可见。
- 触控目标以至少 44×44 为设计起点；平台有更严格要求时服从平台。区分视觉尺寸和实际触达区域。
- 空间表达分组；少用嵌套卡片。颜色不承担全部层级。
- 图标使用一致且来源明确的矢量体系；不以 emoji 代替功能图标，不凭记忆画第三方 Logo。无必要可直接使用文字按钮。
- 动态效果必须有用途，尊重减少动态效果偏好；静态设计不能宣称已经验证动画与键盘实现。

## 外部辅助 skill

UI UX Pro Max： https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

可用来补充视觉方向和交互检查，但返回结果必须与产品类型核对。后台页面若得到 Hero + Features + CTA 等营销推荐，应拒绝该结构；真正的公开 Landing 可以采用价值与转化叙事，但仍需产品证据，不能机械套模板。

Apple-inspired 模式的社区 skill 与官方产品页来源、采用范围及限制见 [landing-apple.md](landing-apple.md)，不另外安装同名 skill。
