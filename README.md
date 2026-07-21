# Yasi Words · 雅思单词拼写训练器

[![CI Status](https://img.shields.io/github/actions/workflow/status/meisijiya/IELTS_WORDS/ci.yml?branch=main&style=flat-square&logo=github&label=CI)](https://github.com/meisijiya/IELTS_WORDS/actions/workflows/ci.yml)
[![Docker Image](https://img.shields.io/badge/docker-阿里云镜像-blue?style=flat-square&logo=docker)](https://github.com/meisijiya/IELTS_WORDS/pkgs/container/ielts_words)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)

> 为雅思机考的键盘操作习惯设计的本地优先单词训练工具。

## ✨ 特性

- **Flash-then-Spell 模式** — 显示中英文 → 英文渐变消失 → 键盘拼写，贴合真实机考节奏
- **自适应渐进提示** — 新词给 2 个字母提示，复习词给 1 个，已掌握不提示
- **自动 SM-2 升级** — 答对 +1 / 答错 -1，跨 session 累积到 level=5 自动掌握
- **错词本会话 FIFO 重出** — 错的词反复出现直到答对
- **10,686 词双库** — 雅思词汇真经（3,611）+ IELTS（7,075）
- **真人发音 + 双口音** — 闪现阶段播放 + 反馈时再播一次，每个 word 听 2 次（默认 US，可在 settings 切换 UK）
- **音效反馈** — 答对双音 ding / 答错双音 buzz（Web Audio API 合成，零资源）
- **动效反馈** — 答错时拼写 div 抖动（shake）+ 红色 / 答对时弹入（pop-in）+ 绿色
- **单日打卡记录** — 一键导出 PNG 发给老师
- **3 状态进度可视化** — 新词 / 学习中 / 已掌握
- **错词榜 Top N** — 可重新练习 / 标记已熟
- **未完成会话恢复** — 强制 1 个 active session per wordbook
- **本地优先 + 云部署就绪** — 一键 Docker 部署到国内云服务器；可选 audio bundle 烤进 image

## 🖼️ 预览

```
┌─ 主页 ──────────────────────────────────────┐   ┌─ 练习界面 ──────────────────────┐
│  Yasi Words                                  │   │                                 │
│  📅 打卡  📊 分析  ⚙️ 设置                   │   │       v. 监督                   │
│                                              │   │                                 │
│  ┌─────────────────────────────────────┐  │   │    a t t _ t _ _ _ _             │
│  │ 雅思词汇真经（精简版）   [常规]      │  │   │                                 │
│  │ 开始于 14:23  已练 12 词（9 正确）  │  │   │  ┌──────────────────────────┐  │
│  │ [继续] [结束]                        │  │   │  │ attitide_                │  │
│  └─────────────────────────────────────┘  │   │  └──────────────────────────┘  │
│                                              │   │                                 │
│  ┌──────────────┐    ┌──────────────┐      │   │  ┌──────────┐  ┌──────────────┐ │
│  │ 雅思词汇真经 │    │  IELTS       │      │   │  │ 提交 Enter│  │  下一个 →   │ │
│  │  3,611 词    │    │  7,075 词   │      │   │  └──────────┘  └──────────────┘ │
│  └──────────────┘    └──────────────┘      │   │                                 │
└──────────────────────────────────────────────┘   └─────────────────────────────────┘

┌─ 学习分析 ──────────────────────────────┐    ┌─ 单日打卡（可截图） ─────────────┐
│  掌握进度 1,234 / 10,686 (12%)         │    │   2026-07-20  周一 [TODAY]      │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │    │                                 │
│  ■ 已掌握  ■ 学习中  ■ 新词           │    │   今日学习        今日掌握      │
│                                        │    │   ┌────────┐      ┌────────┐   │
│  累计尝试 5,678   正确率 78%         │    │   │   45   │      │   12   │   │
│                                        │    │   └────────┘      └────────┘   │
│  错词 Top 5                            │    │                                 │
│  1. atmosphere  ✗ 4 ✓ 1               │    │   准确率 78%  正确 39  错误 11  │
│  2. perspective ✗ 3 ✓ 0               │    │                                 │
│  3. undertake    ✗ 2 ✓ 1               │    │   [📷 下载打卡图 PNG]            │
│  ...                                   │    │                                 │
└────────────────────────────────────────┘    └──────────────────────────────────┘
```

## 🚀 快速开始

### 方式 A · Docker（推荐 · 1 分钟）

```bash
git clone https://github.com/meisijiya/IELTS_WORDS.git yasi-words
cd yasi-words
cp .env.docker.example .env
nano .env  # 改密码
docker compose up -d --build
open http://localhost:3000
```

### 方式 B · 本地开发

```bash
# 前置要求：Node.js 22+, Python 3.10+（仅 PDF 提取用）

npm install
pip install -r tools/requirements.txt

npx prisma db push
npx tsx prisma/seed.ts

cp .env.example .env
# 编辑 .env，至少修改 ADMIN_PASSWORD

npm run dev
open http://localhost:3000
```

## 🧰 常用命令

```bash
npm run dev          # 开发模式
npm run build        # 生产构建
npm start            # 生产服务器（需先 build）
npm run typecheck    # TypeScript 类型检查
npm run lint         # ESLint
npm run test:parser  # Python parser 测试（18 tests）
npm run gate         # 数据准确率验证

# Docker
docker compose up -d --build
docker compose logs -f app
docker compose down
```

## 📚 文档

- 📦 [腾讯云轻量级部署](docs/deploy-tencent-cloud.md) — 裸机部署
- 🐳 [Docker 一键部署](docs/deploy-docker.md) — 国内镜像源优化
- 📄 [PDF 提取规则](docs/grammar.md) — 数据准确率 100% 的来由
- 🤖 [GitHub Actions CI/CD](#-cicd) — 自动化测试 + 部署

## 🏗️ 技术栈

| 层 | 选型 |
|---|---|
| **框架** | Next.js 15 (App Router) + TypeScript 5 |
| **ORM** | Prisma 6 + SQLite (dev) / PostgreSQL (prod) |
| **UI** | React 19 + Tailwind CSS 3 + 自定义"冬天旭日"主题 |
| **认证** | Web Crypto HMAC-signed cookie (Edge-safe) |
| **图表** | Recharts（分析页） + html2canvas（打卡图导出） |
| **测试** | Vitest (TS) + pytest (Python parser) |
| **部署** | Docker Compose + 阿里云容器镜像 + 腾讯云服务器 |

## 📂 项目结构

```
.
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── page.tsx        # 主页（词库选择 + 未完成会话 + 今日打卡入口）
│   │   ├── login/          # 登录页
│   │   ├── practice/[wordbook]/  # 练习页 + PracticeClient
│   │   ├── analytics/      # 学习分析仪表盘
│   │   ├── checkin/[date]/ # 单日打卡记录
│   │   ├── settings/       # 设置页（每日单词量 + 闪现时长 + 重置）
│   │   └── api/            # API routes
│   ├── lib/                # 工具库（auth / db）
│   └── components/         # 共享组件
├── prisma/
│   ├── schema.prisma       # Wordbook / Word / Session / Attempt / UserSettings
│   └── seed.ts             # 从 seed JSON 导入
├── seed/                   # 10,686 词 JSON（精简 3,611 + 完整 7,075）
├── tools/                  # PDF 提取 + 解析 + 校验（Python）
├── docker/
│   └── entrypoint.sh       # 自动等 DB + migrate + seed
├── docs/                   # 部署 / 提取规则文档
├── Dockerfile
├── docker-compose.yml
└── .github/workflows/     # CI / CD
```

## 🔍 数据来源与准确率

- **词源**：用户提供的《雅思词汇真经》+《IELTS》两本 PDF（共 10,686 词）
- **提取方式**：双引擎交叉验证（PyMuPDF + pdfplumber）+ 人工校对
- **准确率**：抽样 1000/1000 = 100% PASS ✅
- **审核工具**：`tools/audit.py` 生成全量 TSV，`audit/sample_review.html` 抽样对比

## 🚢 部署

### 国内云服务器（推荐）

详见 [docs/deploy-docker.md](docs/deploy-docker.md)。所有镜像源已配置阿里云镜像：
- Docker 镜像：`registry.cn-hangzhou.aliyuncs.com`
- Alpine apk：`mirrors.aliyun.com`
- npm：`registry.npmmirror.com`
- GitHub：`ghproxy.com`

### CI/CD（自动化部署）

详见下方 [🤖 CI/CD](#-cicd) 章节。

## 📜 License

MIT © 2026 Yasi Words contributors

---

<p align="center">
  <sub>Built with ❤️ for IELTS learners fighting the keyboard.</sub>
</p>