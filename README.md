# Yasi Words — 雅思单词拼写训练器

基于云端的雅思词汇拼写训练工具，专为雅思机考的键盘操作习惯设计。

## 核心特性

- **Flash-then-Spell 模式**：显示中文释义 + 英文 → 英文渐变消失 → 用户键入拼写
- **完全严格判定**：贴合机考零容忍
- **自适应渐进提示**：新词给 2 个提示字母，复习词给 1 个，已掌握不提示
- **错词本会话 FIFO 重出**：错的词自动在本会话内重复出现
- **双词库**：雅思词汇真经（3,611 词）+ IELTS（7,076 词）独立进度
- **BI 分析**：错词榜、错误模式（首字母/末尾/中间）、进度统计
- **云部署就绪**：Phase 7 切换 PostgreSQL 即可上云

## 技术栈

| 层 | 选型 |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| ORM | Prisma 6 |
| Database | SQLite (dev) / PostgreSQL (prod) |
| UI | React 19 + Tailwind CSS 3 |
| Auth | Web Crypto API HMAC-signed cookie (Edge-safe) |
| Test | Vitest + 自定义 Python parser tests |

## 快速开始（本地）

### 前置要求

- Node.js 22+
- Python 3.12+ （仅 PDF 数据准备用）
- npm 10+

### 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 准备 Python 工具（仅首次）
python3 -m pip install --user --break-system-packages -r tools/requirements.txt

# 3. 初始化数据库 + 导入词库（仅首次）
npx prisma db push
npx tsx prisma/seed.ts

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env，至少修改 ADMIN_PASSWORD

# 5. 启动开发服务器
npm run dev
# 或生产模式：
npm run build && npm start
```

打开 http://localhost:3000 ，用 `.env` 中的 `ADMIN_PASSWORD` 登录。

### 默认账号

开发环境默认密码：`yasi-2026-dev` （**生产前务必修改**）

## 数据准备（仅首次 / 重新生成词库时）

PDF 数据已经在 `seed/` 目录处理完毕。如果要重新生成：

```bash
# 提取 PDF 文本（双引擎）
npm run extract:full

# 解析 + schema 验证
npm run parse:full

# 导出 seed JSON
npm run seed:export

# 重新导入数据库
npm run db:seed
```

准确率验证：

```bash
npm run gate   # 抽样验证 seed JSON 准确性
```

## 测试

```bash
# TypeScript 类型检查
npm run typecheck

# Python parser 测试（18 tests）
npm run test:parser

# 准确率 gate
npm run gate
```

## 部署到腾讯云轻量级云服务器

### 方式 A：Docker Compose 一键拉起（推荐）

详见 [`docs/deploy-docker.md`](docs/deploy-docker.md)。

```bash
# SSH 到服务器
ssh root@<服务器IP>

# 装 Docker
curl -fsSL https://get.docker.com | sh

# 上传代码并启动
cd /opt
git clone <repo-url> yasi-words
cd yasi-words
cp .env.docker.example .env
nano .env   # 改密码
docker compose up -d --build

# 查看日志（首次启动会跑 schema + seed 10,686 词）
docker compose logs -f app
```

访问 `http://<服务器IP>:3000`，密码为 `.env` 中的 `ADMIN_PASSWORD`。

### 方式 B：手动部署（裸机）

详见 [`docs/deploy-tencent-cloud.md`](docs/deploy-tencent-cloud.md)。

## 项目结构

```
.
├── prisma/
│   ├── schema.prisma         # Wordbook / Word / Session / Attempt
│   └── seed.ts               # 从 seed JSON 导入
├── src/
│   ├── app/
│   │   ├── page.tsx          # 主页（词库列表）
│   │   ├── login/            # 登录页 + form
│   │   ├── practice/[wordbook]/   # 练习页 + PracticeClient
│   │   ├── analytics/        # BI 仪表盘
│   │   └── api/
│   │       ├── auth/         # login/logout
│   │       ├── sessions/     # POST 创建 / PATCH 结束
│   │       ├── attempts/     # POST 拼写尝试
│   │       ├── words/        # GET 词库
│   │       └── analytics/    # GET 聚合数据
│   ├── lib/
│   │   ├── auth.ts           # Web Crypto HMAC cookie
│   │   └── db.ts             # Prisma client
│   └── middleware.ts         # 路由保护
├── seed/
│   ├── yasi_concise.json     # 3,611 词（精简版）
│   └── ielts_full.json       # 7,075 词（完整版，去重后）
├── tools/
│   ├── parser.py             # PDF line → word record
│   ├── extract_full.py       # 双引擎全量抽取
│   ├── parse_full.py         # 全量解析
│   ├── cross_validate.py     # 双引擎交叉验证
│   ├── seed_export.py        # 导出 seed JSON
│   └── gate.py               # 准确率验证
├── schema/
│   └── yasi_word.schema.json # jsonschema
├── docs/
│   ├── grammar.md            # PDF 布局规则
│   └── deploy-tencent-cloud.md
└── tests/
    └── test_parser.py        # 18 parser tests
```

## 数据库切换（dev → prod）

当前 schema 使用 SQLite。生产部署到腾讯云前需要切换到 PostgreSQL：

```bash
# 1. 编辑 prisma/schema.prisma
datasource db {
  provider = "postgresql"   # was: sqlite
  url      = env("DATABASE_URL")
}

# 2. 重置 migration 历史（如果之前跑过 sqlite migrations）
rm -rf prisma/migrations

# 3. 生成新 migration
npx prisma migrate dev --name init

# 4. 导入数据
npx tsx prisma/seed.ts
```

## 安全提示

- **生产前必须修改** `.env` 中的 `ADMIN_PASSWORD` 和 `SESSION_SECRET`
- `SESSION_SECRET` 必须 ≥ 32 字符
- 生产环境启用 HTTPS（cookie 的 `secure` flag 已自动启用）
- 不要把 `.env` 提交到 git

## 维护命令

```bash
npm run dev          # 开发模式
npm run build        # 生产构建
npm start            # 生产服务器（需先 build）
npm run typecheck    # TypeScript 类型检查
npm run lint         # ESLint
npm run test:parser  # Python parser 测试
npm run gate         # 数据准确率验证
npm run db:push      # 推送 schema 到数据库（dev）
npm run db:seed      # 重新导入种子数据
npm run db:studio    # Prisma Studio（可视化 DB）
```

## 已知限制

- PDF 数据中**没有音标**（schema 不含 `phonetic` 字段）
- PDF 数据中**没有例句**（schema 不含 `examples` 字段）
- 单用户设计（密码在 `.env` 中），不适合多用户场景
- Cookie session 不支持主动失效（依赖 30 天 TTL）

## License

MIT