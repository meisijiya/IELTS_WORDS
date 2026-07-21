# 新增单词集 — 开发流程

把一个外部词汇源（PDF / DOCX / 任意表格格式）整合到 Yasi Words 的端到端流程。每一步都有现成工具或最少代码。

适用：扩 4 级、专四、专八、考研词汇、GRE、学科词表（医学/CS/法律）等任何「单词 + 释义 + 可选音标」的源。

---

## 1. 准备源文件

把词汇源放进项目根目录，文件名清晰：

```bash
ls -la 大学英语六级词汇表*.docx      # 或 考研词汇.pdf / gre_*.json 等
```

源文件已**自带音标**就不需要查字典；只有单词+释义（如多数 PDF）则跳到步骤 3 时只填 spelling/pos/glosses。

---

## 2. 解析源文件 → `seed/<slug>.json`

写一个 `tools/parse_<slug>.py`。结构统一：

```python
def extract_rows(source_path) -> list[list[str]]:
    """返回每一行作为一个 list[str]，按列索引访问"""
    ...

def clean_phonetic(raw: str) -> str | None:
    """去音标内多余空白、规范化"""
    ...

def parse_glosses(raw: str) -> tuple[str | None, list[dict]]:
    """释义文本 → [(pos, meaning), ...] + 主 POS"""
    ...
```

**关键决策点**：

| 问题 | 做法 |
|---|---|
| 多 POS 释义挤在一个 cell（"v. 遗弃 n. 放任"） | regex 匹配 POS 标记（v./n./adj. 等），支持「中文后无空格」边界（如 `陷入n.`）。lookbehind 用 `(?:(?<=^)\|(?<=[\s;,，；、])\|(?<=[一-鿿]))` |
| 音标格式杂乱（带空格、加粗、IPA 前后空格） | regex `re.match(r"^\s*/\s*(.*?)\s*/\s*$", raw)` 抽 IPA 段，再 `re.sub(r"\s+", "", inner)` 清空 |
| 重复词（同词不同 POS 出现两次） | dedup by `spelling.lower()`，首次出现的胜出 |
| 词条名不规范（含数字、空格、特殊符号） | regex `^[A-Za-z][A-Za-z\s'/-]*$` 过滤；非法行 skip 不报错 |
| 中文标点（，。；） | 替换为半角 `, ;` — 后续 UI 显示更干净 |

**输出 schema**（与现有 seed 兼容）：

```json
[
  {
    "spelling": "abandon",
    "pos": "v.",
    "glosses": [{"pos":"v.","meaning":"遗弃; 离开; 放弃"}, {"pos":"n.","meaning":"放任, 狂热"}],
    "phonetic": "/əˈbændən/"
  }
]
```

参考 `tools/parse_cet6.py` 完整实现（~100 行，纯 stdlib）。

---

## 3. 注册词库到 DB

3 个文件改动：

**a. `seed/seed_summary.json`** — 加一条：

```json
{
  "book": "book_<x>",
  "filename": "<slug>.json",
  "description": "CET-6 5518词 — 完整版",
  "records": 5518,
  "size_kb": 1613.8
}
```

**b. `prisma/seed.ts`** — `WORDBOOKS` 加一项：

```ts
{
  slug: "cet6",
  name: "大学英语六级词汇",
  description: "CET-6 5518词 · 含真人发音",
  seedFile: "cet6.json",
},
```

**c. 应用 schema + 灌数据**：

```bash
npx prisma db push            # 词库表无需 schema 变更（动态枚举）
npx tsx prisma/seed.ts        # idempotent: 用 upsert 重复跑安全
```

---

## 4. 音频抓取

`tools/fetch_pronunciations.py` 已支持 `--book <slug>`（在 choices 里加新 slug 并在 `file_map` 加路径映射即可）。

```bash
# 后台跑，10-15 min 全程
python3 tools/fetch_pronunciations.py --book cet6 --concurrency 15 2>&1 | tee /tmp/fetch.log

# 完成后看覆盖率
python3 -c "
import json, os, re
data = json.load(open('seed/cet6.json'))
ok = sum(1 for w in data
         if os.path.exists(f'public/audio/{re.sub(r\"[^a-z0-9]+\", \"-\", w[\"spelling\"].lower()).strip(\"-\")}.us.mp3')
         or os.path.exists(f'public/audio/{re.sub(r\"[^a-z0-9]+\", \"-\", w[\"spelling\"].lower()).strip(\"-\")}.uk.mp3'))
print(f'{ok}/{len(data)} ({ok*100//len(data)}%) at least one accent')
"
```

**覆盖率指标**：

| 范围 | 评价 |
|---|---|
| ≥ 95% | 优秀，剩余 5% 多为专有名词（人名、地名），用户极少遇到 |
| 85-95% | 良好，可接受 |
| < 85% | 词源可能有问题；查 FAILED.txt 看哪些词持续失败 |

**音频 fallback**：前端 `practice-client.tsx` 已实现 `US → UK` 自动 fallback，单 accent 缺失用户无感。

---

## 5. UI 集成

**零代码** — 所有页面动态按 `slug` 路由：

| 路由 | 自动可用 |
|---|---|
| `/` (主页) | `prisma.wordbook.findMany()` 枚举，多卡片自动渲染 |
| `/practice/<slug>` | 复用 practice-client |
| `/wrong-words/<slug>` | 复用 wrong-words-client |
| `/learning/<slug>` | 复用 learning-client |
| `/mastered/<slug>` | 复用 mastered-client |
| `/checkin/<date>` | 跨词库聚合，无需改 |

唯一要做的：登录后访问 `/practice/<slug>` 验证单词列表加载。

---

## 6. 验证清单

```bash
# 自动化检查
npm run typecheck && npm run lint && npm test -- --run && npm run build

# 部署后 curl 验证
curl http://localhost:3000/ | grep "<slug 标题>"
curl http://localhost:3000/practice/<slug> -I | head -1
curl http://localhost:3000/wrong-words/<slug> | grep "暂无\|错词"

# 抽样人工核对（关键！OCR 来源尤其重要）
# 抽 30 个词，对比源文档 vs 应用显示
```

---

## 7. 完整时间预算（参考 cet6）

| 步骤 | 时间 |
|---|---|
| 解析 docx → JSON | 30 min（写脚本 20 min，跑通 10 min）|
| 注册 + DB | 5 min |
| 音频抓取 | 10-15 min（含失败重试）|
| 验证 + 修补 | 15-30 min |
| **合计** | **~1 小时** |

---

## 常见坑

1. **音标内空格** — 永远先 `re.sub(r"\s+", "", inner)` 清空，否则 TTS / 显示错位
2. **POS 边界** — 别假设 POS 前必有空格，docx 来源常 `陷入n.` 紧贴中文
3. **dedup 别错** — 同词在不同 wordbook 是正常的（共享/重学习场景），去重只在单本书内
4. **prisma seed 幂等性** — 已用 upsert，可重复跑不会重复数据
5. **音频是 gitignored** — 不要 commit `public/audio/*.mp3`，用 audio bundle tarball + `AUDIO_BUNDLE_URL` 环境变量分发

---

## 后续维护

- **加新词**：编辑源文件 → 重跑 parse → 重跑 fetch（自动 skip 已有）
- **修词义**：编辑 `seed/<slug>.json` → 重跑 `npx tsx prisma/seed.ts`（upsert 更新已有 word）
- **加音频**：手动放 `public/audio/<normalized>.<accent>.mp3`，前端自动识别