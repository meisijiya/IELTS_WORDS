# AUDIT DOMAIN KNOWLEDGE BASE

## SCOPE

`/home/ljh2923/opencode-project/English_YASI/audit/` 保存离线审计脚本、可提交的审计报告，以及仅供本地人工复核的生成物。
这里关注词条质量、音频资产完整性和外部词典抽样，不是应用运行时目录。

## TRACKING BOUNDARY

- Git 跟踪 `/home/ljh2923/opencode-project/English_YASI/audit/*-audit.py`。
- Git 跟踪 `/home/ljh2923/opencode-project/English_YASI/audit/*-report.md`。
- Git 忽略 `/home/ljh2923/opencode-project/English_YASI/audit/*.tsv`。
- Git 忽略 `/home/ljh2923/opencode-project/English_YASI/audit/sample_review.html`。
- TSV 和 HTML 是本地人工复核材料，可由脚本重新生成，不作为报告事实源提交。

## SCRIPT INVENTORY

### `/home/ljh2923/opencode-project/English_YASI/audit/word-audit.py`

- 检查词条 schema 完整性，包括 spelling、POS 和 glosses。
- 汇总空释义、异常拼写及跨词书同拼写词的一致性。
- 统计各词书的 POS 分布和释义数量分布。
- 写入 `/home/ljh2923/opencode-project/English_YASI/audit/word-audit-report.md`。

### `/home/ljh2923/opencode-project/English_YASI/audit/audio-audit.py`

- 检查每个词的 US、UK 音频文件是否存在，以及是否至少有一种口音可用。
- 检查零字节文件，并通过系统 `file` 命令抽样验证 MP3 magic bytes。
- 汇总音频文件大小分布，标出过小、过大和损坏文件。
- 写入 `/home/ljh2923/opencode-project/English_YASI/audit/audio-audit-report.md`。

### `/home/ljh2923/opencode-project/English_YASI/audit/spot-check.py`

- 按词书做确定性抽样，将本地释义与有道词典建议接口对比。
- 这是联网脚本，会实时请求 `dict.youdao.com`，无网络时结果会缺少外部参照。
- 匹配判断是启发式抽查，不等同于严格正确性证明。
- 写入 `/home/ljh2923/opencode-project/English_YASI/audit/spot-check-report.md`。

## OVERLAP WITH TOOLS

`/home/ljh2923/opencode-project/English_YASI/tools/audit.py` 与 `/home/ljh2923/opencode-project/English_YASI/audit/word-audit.py` 是两个不同脚本。
前者从解析中间产物整理全量人工复核表，写入 `/home/ljh2923/opencode-project/English_YASI/audit/all_words.tsv`，并生成分词书 TSV。
后者直接生成词级质量统计 Markdown。两者都涉及词条审计，但产物和检查目标不同，不能互相替代。

## RE-RUN BEHAVIOR

从项目根目录运行对应 Python 脚本。
重新运行 `word-audit.py`、`audio-audit.py` 或 `spot-check.py` 会覆盖各自受 Git 跟踪的 `*-report.md`。
报告含生成时间和当前统计值，因此重跑后出现 Git diff 是正常结果，应审阅差异再决定是否提交。
重新运行 `/home/ljh2923/opencode-project/English_YASI/tools/audit.py` 会重建被忽略的 TSV，不应期待这些文件进入提交。
