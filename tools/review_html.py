"""Generate audit/sample_review.html for quick human spot-check.

Loads audit/all_words.tsv, picks a stratified sample (start/middle/end of
each book + first/multiline-gloss), and renders a two-column HTML:

    | PDF context (raw text)         | Parsed record                |
    | ------------------------------ | ---------------------------- |
    | atmosphere n. 大气层, 大气, 空气 | atmosphere / n. / 大气层, 大气... |
    | ...                            | ...                          |

A reviewer can open this in a browser and skim the diff column-by-column.

Usage:
    python3 tools/review_html.py
Writes:
    audit/sample_review.html
"""
from __future__ import annotations

import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIT = ROOT / "audit"

SAMPLE_PER_BOOK = 50
RANDOM_SEED = 42


def main() -> None:
    src = AUDIT / "all_words.tsv"
    if not src.exists():
        print(f"[err] {src} not found. Run tools/audit.py first.")
        return

    rows_by_book: dict[str, list[dict]] = {}
    with src.open(encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            rows_by_book.setdefault(row["wordbook"], []).append(row)

    random.seed(RANDOM_SEED)
    samples: list[dict] = []
    for book, rows in rows_by_book.items():
        n = min(SAMPLE_PER_BOOK, len(rows))
        indices = sorted(random.sample(range(len(rows)), n))
        for i in indices:
            samples.append(rows[i])

    html = render(samples, rows_by_book)
    out = AUDIT / "sample_review.html"
    out.write_text(html, encoding="utf-8")
    print(f"[ok] wrote {len(samples)} samples → {out}")


def render(samples: list[dict], all_by_book: dict[str, list[dict]]) -> str:
    body_rows = []
    for s in samples:
        body_rows.append(
            f"""
            <tr>
              <td class="meta">{s['wordbook']}<br/>p.{s['found_on_page']}</td>
              <td class="spelling">{escape(s['spelling'])}</td>
              <td class="pos">{escape(s['pos'])}</td>
              <td class="glosses">{escape(s['glosses'])}</td>
              <td class="context">{highlight(s['spelling'], s['context'])}</td>
            </tr>
            """
        )

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>Yasi Words · 全量抽样审核</title>
<style>
  :root {{
    --bg: #F8FAFC; --surface: #FFFFFF; --fg: #0F172A;
    --muted: #64748B; --border: #E2E8F0; --accent: #E8845F;
  }}
  body {{
    margin: 0; padding: 32px;
    font-family: Inter, -apple-system, system-ui, sans-serif;
    background: var(--bg); color: var(--fg);
  }}
  header {{ max-width: 1280px; margin: 0 auto 24px; }}
  h1 {{ font-size: 28px; margin: 0 0 4px; }}
  p {{ color: var(--muted); margin: 0; font-size: 14px; }}
  .summary {{
    max-width: 1280px; margin: 0 auto 16px;
    padding: 12px 16px;
    background: #FDE7DA; border: 1px solid #E8845F;
    border-radius: 8px; color: var(--fg);
    font-size: 14px;
  }}
  table {{
    width: 100%; max-width: 1280px; margin: 0 auto;
    border-collapse: separate; border-spacing: 0;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; overflow: hidden;
  }}
  th, td {{
    padding: 12px 14px; text-align: left;
    border-bottom: 1px solid var(--border); vertical-align: top;
    font-size: 14px;
  }}
  th {{ background: #F1F5F9; color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }}
  tr:last-child td {{ border-bottom: none; }}
  td.meta {{ color: var(--muted); font-size: 12px; width: 70px; }}
  td.spelling {{ font-family: ui-monospace, "JetBrains Mono", Menlo, monospace; font-weight: 600; color: var(--accent); white-space: nowrap; }}
  td.pos {{ color: var(--muted); font-family: ui-monospace, monospace; font-size: 12px; white-space: nowrap; }}
  td.glosses {{ color: var(--fg); max-width: 280px; }}
  td.context {{
    font-family: ui-monospace, "JetBrains Mono", Menlo, monospace;
    font-size: 12px; color: var(--muted);
    background: #F8FAFC; max-width: 480px;
  }}
  mark {{ background: #FDE7DA; color: var(--fg); padding: 1px 4px; border-radius: 3px; font-weight: 600; }}
  .legend {{ max-width: 1280px; margin: 16px auto; padding: 12px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; color: var(--muted); }}
  .legend strong {{ color: var(--fg); }}
  .nav {{ position: sticky; top: 0; background: var(--bg); padding: 12px 0; z-index: 10; }}
</style>
</head>
<body>
<div class="nav">
  <header>
    <h1>Yasi Words · 全量抽样审核</h1>
    <p>从 {sum(len(r) for r in all_by_book.values())} 个词中随机抽 {len(samples)} 个，请逐行核对"原文 vs 解析"。</p>
  </header>
</div>

<div class="summary">
  <strong>核对方法：</strong>右侧"PDF 原文"是高亮（橙色）的单词所在行；左侧是程序解析结果。<br/>
  请确认：单词拼写是否一致、词性是否正确、中文释义是否完整对应（标点差异如 <code>;</code> vs <code>，</code> 属正常）。
</div>

<div class="legend">
  <strong>字段含义：</strong>
  <code>spelling</code> 单词 · <code>pos</code> 词性（n./v./adj.）· <code>glosses</code> 中文释义 ·
  <code>context</code> PDF 原文 ±80 字符窗口。
</div>

<table>
  <thead>
    <tr>
      <th>来源</th>
      <th>单词</th>
      <th>词性</th>
      <th>中文释义</th>
      <th>PDF 原文（高亮=单词）</th>
    </tr>
  </thead>
  <tbody>
    {''.join(body_rows)}
  </tbody>
</table>
</body>
</html>
"""


def escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def highlight(spelling: str, context: str) -> str:
    """Insert <mark> around occurrences of spelling in context."""
    escaped = escape(context)
    if not spelling or not context:
        return escaped
    safe = escape(spelling)
    return escaped.replace(safe, f"<mark>{safe}</mark>")


if __name__ == "__main__":
    main()