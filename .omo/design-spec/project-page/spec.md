# Design Spec — Yasi Words · Project GitHub Pages

> 该文件是 Project GitHub Pages 静态展示页的**硬合同**。任何实现必须按此规范进行；偏离需先更新此文件。  
> 维护者：项目作者；审阅者：frontend agent（如使用 OMO `visual-engineering`）必读。

---

## 1. Design Read（一行定位）

> Project marketing/技术 showcase 单页，面向开源项目访客与英语学习者，使用「冬日旭日 × 技术编辑」语言，以中文为主、英文为辅，落地在 Project GitHub Pages。

## 2. 设计旋钮

| 旋钮 | 数值 | 说明 |
|---|---|---|
| `DESIGN_VARIANCE` | 8 | 强反对居中 Hero；以分屏/不对称/编辑式层叠为主。 |
| `MOTION_INTENSITY` | 4 | 仅在 Hero、滚动 reveal 与代码块 hover 处使用克制动画；不做 hero 物理动效。 |
| `VISUAL_DENSITY` | 6 | 截图、代码块、表格并存，需要清晰的视觉层级。 |

## 3. 色彩系统（冬日旭日 × 深色技术画布）

| 用途 | Token | Hex | 备注 |
|---|---|---|---|
| 主背景 | `--ink-paper` | `#FAF7F2` | 暖白纸感，承载主体叙事 |
| 次背景 | `--ink-snow` | `#F1ECE4` | 区块底色 |
| 主文字 | `--ink-ash` | `#1F1B16` | 非纯黑，接近墨灰 |
| 弱化文字 | `--ink-mist` | `#5C544A` | 副标题、说明 |
| 描边 | `--ink-line` | `#E2DBCF` | 区块分割线 |
| 强调 1 | `--sunrise-core` | `#E35A2A` | 日出橙，CTA / 数字 / 关键标记 |
| 强调 2 | `--sunrise-warm` | `#F4A65A` | 数据曲线、次级点缀 |
| 深色画布 | `--ink-night` | `#0F141B` | 代码区、架构图背景 |
| 深色文字 | `--ink-snow-on-night` | `#E9E2D1` | 代码区主文字 |
| 代码强调 | `--ink-ember` | `#FF8A4C` | 代码关键字（accent on dark） |

> 调色规则：**accent lock**——所有强调色必须来自 `--sunrise-core` / `--sunrise-warm`，其它色不得充当强调。  
> 不使用纯黑 `#000`、不使用 AI 默认紫蓝渐变、不使用奶油 + 黄铜的“premium warm-craft”默认色组。

## 4. 字体

| 层级 | 字体 | Fallback | 加载 |
|---|---|---|---|
| 标题（display） | `Newsreader` (variable italic) | `'Source Serif 4', 'Noto Serif SC', serif` | `next/font` 不适用，使用 Google Fonts CSS + `font-display: swap`，加 `preconnect` |
| 正文（sans） | `Inter Tight` | `'Inter', 'Helvetica Neue', system-ui, sans-serif` | 同上 |
| 代码（mono） | `JetBrains Mono` | `ui-monospace, 'SFMono-Regular', Menlo, monospace` | 同上 |

**字号尺度（桌面）**：

| 角色 | 桌面 | 移动 |
|---|---|---|
| H1 | 64 / 72 | 40 / 44 |
| H2 | 40 / 48 | 28 / 32 |
| H3 | 24 / 32 | 20 / 24 |
| Body | 16 / 24 | 15 / 22 |
| Caption | 13 / 20 | 12 / 18 |

**反默认规则**：禁止以 `Inter` 作为唯一 sans（已使用 `Inter Tight` 作为变体以避免 AI default）；禁止 `Fraunces` / `Instrument_Serif`；中文混排使用 `Noto Serif SC` / 思源宋体。

## 5. 信息架构（IA）

1. **Nav** — 左：Logo「Yasi Words」；右：`功能 / 代码解剖 / 部署 / Star`（Star 链 GitHub）。
2. **Hero** — 左：H1「为雅思键盘手设计的拼写训练器」 + 一行定位 + 双 CTA（`在线 Demo` 指向 README 截图占位 / `GitHub Star`）；右：PracticeClient 真实截图嵌入 + 鼠标浮动的 streak banner 视觉提示。
3. **三大功能（zigzag 展示）**
   - Flash-then-Spell 模式：练习截图 + 时序示意图。
   - 三路集合分区（wrong / learning / mastered）：错题榜截图 + 集合切换 tab。
   - 打卡 + 排行榜：checkin 截图 + leaderboard 卡片截图。
4. **代码解剖**
   - 模块关系图（Mermaid 渲染 + SVG fallback）：Practice → API → Prisma。
   - 关键代码片段 4 段，每段独立卡片：① `requireUser()` 鉴权 ② `GET /api/words` 加权拉取 ③ `POST /api/attempts` SM-2 简化 ④ `checkin-snapshot` 三桶语义。
   - 数据模型片段：Prisma schema 关键字段。
5. **部署与 CI/CD** — 时间线展示 ACR push → SSR deploy → backup pipeline；左侧 SVG 流程图，右侧 commands。
6. **路线 / 数据准确率 / 致谢** — 短段落 + 链接。
7. **Footer** — MIT License / GitHub / Issue / Docs 链接。

> **Zigzag 上限 2** —— 三大功能段之间不能连用 image+text-split，第三个改为 bento 风格。

## 6. 布局规则

- 容器最大宽度 `1280px`，两侧 padding 24 / 32。
- 断点：`md 720` / `lg 1024` / `xl 1280`。移动优先，单列堆叠。
- 区块上下留白：桌面 96，移动 64。
- Hero 顶部 padding 上限 `pt-24`，下方紧贴 stats 行；CTA 一次只允许一个主操作。
- Nav 高度 64 px，单行不换。

## 7. 组件约束

| 组件 | 规则 |
|---|---|
| 卡片 | 仅在确实表达层级时使用；底色 `--ink-snow`、圆角 12，描边 `1px --ink-line`；不使用 drop-shadow。 |
| 代码块 | 背景 `--ink-night`；圆角 12；行号可选；字号 13/20。 |
| CTA | 主按钮：`--sunrise-core` 背景 + `--ink-paper` 文字，hover 提亮 8%；副按钮：透明底 + `--sunrise-core` 描边。 |
| Eyebrow | 每 3 个区块最多 1 个 eyebrow，本页总量 ≤ 3。 |
| 表格 | 仅用于「拉取加权」「checkin 三桶」这类对照表；行间分隔用 `--ink-line`。 |
| 图示 | 截图 + Mermaid + 真实代码块三类交替；同一类图示不超过 2 次连用。 |

## 8. 反 slop checklist（必跑）

- [ ] Hero 不居中 / H1 ≤ 2 行 / 副文 ≤ 20 字 / CTA 不换行。
- [ ] eyebrow 计数 ≤ 3。
- [ ] 任意连续 2 段后切换布局族。
- [ ] 不使用 `Inter` 单字 / `Fraunces` / `Instrument_Serif`。
- [ ] 不使用 `bg-[#000]`；深色画布用 `--ink-night`。
- [ ] 无 em-dash `—`；使用逗号、冒号或括号。
- [ ] CTA 文案去重：仅 `Star on GitHub` 一类外链。
- [ ] 所有图片使用真实截图（无 `div` 假截图）。
- [ ] 至少 3 张真实界面截图 + 1 张架构图 + 3 段真实代码块。
- [ ] WCAG AA：主文字 vs `--ink-paper` 对比 ≥ 7:1；代码高亮 vs `--ink-night` ≥ 4.5:1。
- [ ] 移动端 Hero 不被键盘弹出导致关键 CTA 不可见。

## 9. 资源来源（必读）

- 应用截图：本地运行 `npm run dev`，通过 Playwright 抓取。
- 架构图：Mermaid 源文件存 `project-page/assets/diagrams/*.mmd`；SVG 备用文件存同目录 `.svg`。
- 代码块：直接引用 `src/` 真实文件片段，不改写，不简化。
- 部署图：自绘 SVG timeline。

## 10. 部署目标

- 路径：`project-page/`（HTML + CSS + assets，与主应用源码隔离）。
- 触发：`.github/workflows/pages.yml`，仅在 `project-page/**` 或 workflow 文件变更时触发；同时支持 `workflow_dispatch` 手动重发。
- URL：`https://meisijiya.github.io/IELTS_WORDS/`

---

**Status**: draft → 待用户最终确认后进入实现阶段。

## 11 · CICD 教材章节外壳

> 本章节外壳规范适用于从本站衍生的 CICD 教材子页面（独立 HTML 文件），继承项目页设计语言 winter-sunrise × technical-editor。每个页面是自包含的 HTML 文件，复用项目页的 CSS 变量与字体。章节子页面通过 pages.yml 条件触发构建，只在 project-page/** 变更时部署。
> 
> 章节子页面不引入新字体。正文沿用 Inter Tight，代码块沿用 JetBrains Mono，标题沿用 Newsreader。字号遵循现有 type scale。

**排版层级**：每个章节 HTML 文件包含三层自上而下结构：
- **面包屑栏**（breadcrumb bar）：位于 H1 上方，占一行，形如「首页 / CICD / 容器构建」。面包屑每一级用斜线分隔，末级不加链接。面包屑使用弱化文字色（`--ink-mist`），字号用 caption 级，不可点击的末级不加 `<a>` 标签。
- **H1**：章节标题。字号使用现有 type scale 中的 H2 级；`var(--fs-h2)` 可作为章节子页面的合理 fallback，无需为章节页面另设 H1 字号。章节标题不带编号，编号仅在面包屑和导航中出现。H1 与面包屑之间间距 8px。
- **元信息栏**（`.meta-bar`）：位于 H1 下方占一行，左对齐显示最后更新日期（格式 YYYY-MM-DD）。元信息栏使用弱化文字色（`--ink-mist`），字号用 caption 级。H1 与元信息栏之间间距 4px。

**字体规则**：正文用 Inter Tight 16/24，代码片段用 JetBrains Mono 13/20。标题使用 Newsreader 斜体变体以示与主页面区隔。

**CSS class 定义**（4 个）：
- `.chapter-shell`：章节页面最外层容器，控制最大宽度 960px 与左右 padding 24px。
- `.chapter-toc`：章节目录区，链接到页面内锚点（h3 级小节），使用无序列表样式。
- `.chapter-prev-next`：底部导航行，放置上一节 / 下一节 / 目录三个链接，flex 布局。
- `.meta-bar`：元信息行，包含最后更新日期，可选附加编辑历史链接。

**前后导航 contract**：每个章节页面末尾必须包含 `<nav class="chapter-prev-next">`，内含三个 `<a>` 链接，顺序固定：「上一节」「下一节」「目录」。三个锚点必须始终存在，不可折叠。当位于第一章或最后一章时，对应的上一节或下一节链接应 disabled 而非隐藏。目录链接始终指向页面内 toc 锚点，不跳转。导航行使用 flex 布局，左右两端分布：上一节居左，目录居中，下一节居右。

**标点规则**：Chapter copy must never use the em-dash character (U+2014). Use comma, colon, or parentheses instead. This is enforced by a grep check at validation time.