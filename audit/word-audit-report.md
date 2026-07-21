# Word-Level Audit Report
**Generated**: 2026-07-21T23:26:37
**Books**: concise, full, cet6

## 1. Schema Integrity

| Book | Total | Missing spelling | Missing pos | Empty glosses | No pos on word | No pos on gloss |
|---|---|---|---|---|---|---|
| 雅思词汇真经（精简版） (concise) | 3611 | 0 | 0 | 0 | 0 | 0 |
| IELTS（完整版） (full) | 7076 | 0 | 0 | 0 | 0 | 0 |
| 大学英语六级词汇 (cet6) | 5518 | 0 | 0 | 0 | 5 | 5 |

## 2. Empty / Suspicious Glosses

Words with empty glosses are listed below (should be 0 in clean data).

- **雅思词汇真经（精简版）**: 0 entries with empty glosses ✓
- **IELTS（完整版）**: 0 entries with empty glosses ✓
- **大学英语六级词汇**: 0 entries with empty glosses ✓

## 3. Cross-Book Consistency

Same spelling in multiple books — definitions should match.

**Spelling overlap across books**: 4527 words appear in ≥2 books

**Pos / first-meaning disagreements**: 3891 (sample 30 below)

| Spelling | Field | Ref | Other | In books |
|---|---|---|---|---|
| `atmosphere` | first-meaning | `大气层, 大气, 空气, 氛围` | `气氛; 大气; 空气` | concise, full, cet6 |
| `oxide` | first-meaning | `氧化物` | `[化学] 氧化物` | concise, full, cet6 |
| `hydrogen` | first-meaning | `氢` | `[化学] 氢` | concise, full, cet6 |
| `core` | pos | `n./adj./v.` | `n.` | concise, cet6 |
| `crust` | pos | `n./v.` | `n.` | concise, full, cet6 |
| `longitude` | first-meaning | `经度` | `[地理] 经度; 经线` | concise, full, cet6 |
| `latitude` | first-meaning | `纬度, 纬度地区, 自由度` | `纬度; 界限; 活动范围` | concise, full, cet6 |
| `horizon` | first-meaning | `地平线, 眼界` | `[天] 地平线; 视野; 眼界; 范围` | concise, full, cet6 |
| `altitude` | first-meaning | `海拔高度, 高地` | `高地; 高度; [数] 顶垂线; （等级和地位等的）高级; ` | concise, full, cet6 |
| `disaster` | first-meaning | `灾难` | `灾难, 灾祸; 不幸` | concise, cet6 |
| `jeopardize` | pos | `v.` | `vt.` | concise, full, cet6 |
| `destructive` | first-meaning | `破坏性的, 有害的` | `破坏的; 毁灭性的; 有害的, 消极的` | concise, full, cet6 |
| `greenhouse` | first-meaning | `温室` | `温室造成温室效应的` | concise, full, cet6 |
| `phenomenon` | first-meaning | `现象, 非凡的人` | `现象; 奇迹; 杰出的人才` | concise, full, cet6 |
| `magnet` | first-meaning | `磁铁, 有吸引力的人或物, 小磁铁` | `磁铁; [电磁] 磁体; 磁石` | concise, full, cet6 |
| `ore` | first-meaning | `矿石` | `矿; 矿石` | concise, full, cet6 |
| `mineral` | first-meaning | `矿物, 矿泉水` | `矿物; （英）矿泉水; 无机物; 苏打水（常用复数表示）ad` | concise, full, cet6 |
| `marble` | first-meaning | `大理石, 弹珠, 弹珠游戏, 理智` | `大理石; 大理石制品; 弹珠` | concise, full, cet6 |
| `breeze` | pos | `n./v.` | `n.` | concise, full, cet6 |
| `hurricane` | first-meaning | `飓风` | `飓风, 暴风` | concise, full, cet6 |
| `typhoon` | first-meaning | `台风` | `[气象] 台风` | concise, full, cet6 |
| `erupt` | pos | `v.` | `vi.` | concise, full, cet6 |
| `mist` | pos | `n./v.` | `n.` | concise, full, cet6 |
| `drought` | first-meaning | `干旱, 短缺` | `干旱; 缺乏` | concise, full, cet6 |
| `torrent` | first-meaning | `急流, 激增` | `奔流; 倾注; 迸发; 连续不断; 急流, 激流; （话语、` | concise, full, cet6 |
| `earthquake` | first-meaning | `地震` | `地震; 大动荡` | concise, cet6 |
| `terrain` | first-meaning | `地形` | `[地理] 地形, 地势; 领域; 地带` | concise, full, cet6 |
| `landscape` | pos | `n./v.` | `n.` | concise, cet6 |
| `continent` | pos | `adj./n.` | `n.` | concise, full, cet6 |
| `cave` | first-meaning | `洞穴` | `山洞, 洞穴; 窑洞` | concise, full, cet6 |

> Full disagreement count: 3891. Of 4527 overlapped words.
> Disagreement rate: **86.0%** of overlap

## 4. Anomaly Checks

Spelling-level anomalies (regex / length / encoding):

| Book | Spelling length > 25 | Non-ASCII in spelling | Digit in spelling | No phonetic (cet6 only) |
|---|---|---|---|---|
| 雅思词汇真经（精简版） | 0 | 0 | 0 | 0 |
| IELTS（完整版） | 0 | 0 | 0 | 0 |
| 大学英语六级词汇 | 0 | 0 | 0 | 8 |

### Sample of long / non-ASCII / digit spellings


## 5. POS Distribution

Top 10 word-level POS markers per book:

### 雅思词汇真经（精简版）

| POS | Count |
|---|---|
| `n.` | 1342 |
| `n./v.` | 625 |
| `v.` | 499 |
| `adj.` | 349 |
| `v./n.` | 296 |
| `adj./n.` | 123 |
| `n./adj.` | 82 |
| `adj./n./v.` | 27 |
| `n./vi.` | 24 |
| `vi.` | 24 |
| (None) | 0 |

### IELTS（完整版）

| POS | Count |
|---|---|
| `n.` | 3019 |
| `adj.` | 1469 |
| `v.` | 920 |
| `n./v.` | 574 |
| `v./n.` | 308 |
| `adj./n.` | 210 |
| `adv.` | 151 |
| `n./adj.` | 124 |
| `vi.` | 45 |
| `adj./v.` | 34 |
| (None) | 0 |

### 大学英语六级词汇

| POS | Count |
|---|---|
| `n.` | 3002 |
| `adj.` | 1097 |
| `vt.` | 672 |
| `adv.` | 226 |
| `vi.` | 190 |
| `v.` | 184 |
| `pron.` | 50 |
| `prep.` | 42 |
| `conj.` | 20 |
| `num.` | 14 |
| (None) | 5 |


## 6. Gloss Counts per Word

How many gloss entries does each word have?

| Book | 1 gloss | 2 | 3 | 4 | 5+ |
|---|---|---|---|---|---|
| 雅思词汇真经（精简版） | 2234 | 1220 | 139 | 17 | 1 |
| IELTS（完整版） | 5614 | 1355 | 98 | 9 | 0 |
| 大学英语六级词汇 | 2033 | 1753 | 1064 | 546 | 122 |
