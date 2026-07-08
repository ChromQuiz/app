## 概要

SF Symbols風のカスタムアイコンを設計・レビュー・SVG制作用指示生成できる、ZCode / Codex / Claude Code 3環境で共有可能なSkillを作成する。

## 調査結果に基づく設計の核

公式資料（HIG, developer.apple.com, WWDC）から確定した要点をSkillの柱にする：

- **造形**: 9ウェイト（Ultralight→Black）がSFテキストウェイトと1:1対応。3スケール（Small/Medium-default/Large）はキャップハイト基準で線幅を変えず垂直範囲のみ変える。
- **キャンバス**: 45×45はSF Symbolsアプリの設計グリッド。エクスポートテンプレートは独自座標系+transform使用、cap height（S=13/M=16/L=19）が垂直アライメントの真理。「必ず公式テンプレートから開始」が唯一の確実指針。
- **塗り優先**: テンプレートはfilled paths。SVG strokeは使わない（ウェイト補間が壊れる）。
- **レンダリング**: Monochrome / Hierarchical（1色の不透明度ティア）/ Palette（明示複数色）/ Multicolor（焼き込み意味色）+ Variable Color。
- **命名文法**: `base → .slash → .circle/.square/.rectangle/.capsule → .fill → .badge.X`
- **法的制約**: 商標/ロゴ/製品アイコン模倣禁止、再配布禁止、Apple製品グリフはカスタマイズ不可。

## 配置構成（ui-ux-pro-maxの既存パターンに準拠）

```
~/.codex/skills/sf-symbols-design/        ← 本体（実ディレクトリ）
├── SKILL.md                               ← コア（短いdescription）
├── agents/openai.yaml                     ← UI用メタデータ
├── references/
│   ├── design_language.md                 ← 造形: 線幅/角丸/端点/塗り線/光学補正/抽象化
│   ├── structure.md                       ← 構造: 4レンダリングモード/バリアント/命名/VariableColor/Effects
│   ├── svg_workflow.md                    ← 実務: テンプレート/SVG構造/レイヤー設計/小サイズ/アクセシビリティ
│   ├── constraints.md                     ← 禁止・法的: 商標/写実/再配布/IP
│   └── output_formats.md                  ← 出力形式A/B/C完全テンプレート+具体例
└── scripts/
    └── symbol_name_check.py               ← 命名文法チェッカー

~/.zcode/skills/sf-symbols-design          ← symlink → 本体

~/.claude/skills/sf-symbols-design/        ← 実ディレクトリ（references/scriptsは本体からコピー）
├── SKILL.md                               ← Claude用: キーワード詰め長description、bodyは同一
├── references/  (5ファイル、本体と同じ内容)
└── scripts/symbol_name_check.py           (本体と同じ内容)
```

ZCodeはcodex本体へのsymlinkで完全同期。ClaudeのみSKILL.mdを別管理（descriptionで発火性向上）、参照リソースとスクリプトは本体と同一内容を配置。

## SKILL.md の構成（500行以内、日本語ベース・技術用語は英語）

**Frontmatter（Codex/ZCode版）**
- `name: sf-symbols-design`
- `description`: 短く「何を/いつ使う」を記述（1-2文）

**Frontmatter（Claude版）**
- `name: sf-symbols-design`
- `description`: 同一内容+トリガーキーワードを詰めた長文（カスタムアイコン設計、SF Symbols風、シンボル、アイコン、SVG、SwiftUI、hierarchical、palette、Apple HIG 等）

**Body構成**
1. Skill概要（1段落）
2. ワークフロー（依頼タイプ別ルーティング）
   - 新規アイコン設計 → design_language.md + output_formats.md(形式A)
   - SVG制作指示 → design_language.md + svg_workflow.md + output_formats.md(形式B)
   - 既存案レビュー → design_language.md + constraints.md + output_formats.md(形式C)
   - バリアント派生 → structure.md
   - 命名提案 → structure.md + scripts/symbol_name_check.py
3. 設計判断の基本原則（5-7項目の簡潔な指針、詳細は各referenceへ誘導）
4. 参照リソースのナビゲーション（各references/*.mdをいつ読むかの明示）
5. 出力形式の使い分け（A=設計仕様 / B=SVG用プロンプト / C=レビュー結果）

## references/ 各ファイルの内容

**design_language.md** — 造形の詳細
- ウェイト×スケールの行列（9×3、補間の仕組み）
- 線幅の一貫性、SFステム重量との対応
- 角丸の傾向（generous/consistent、目安値は[推定]と明記）
- 端点処理（round cap/join、[推定]）
- 塗りvs線（1グリフ内は1言語、hierarchicalは例外）
- 幾何vs光学補正（ネガティブマージンが公式の光学補正機構）
- 光学中心vs幾何中心（キャップハイト基準中心）
- 抽象化度（recognizable & highly simplified、輪郭優先、内部線は最小限）
- 小サイズ生存条件（Heavy/Black at small scaleが下限保証）
- 各ルールに[公式]/[推定]の根拠ラベル

**structure.md** — 構造とバリアント
- 4レンダリングモード（Monochrome/Hierarchical/Palette/Multicolor）の定義・使い分け・API
- Variable Color（0.0-1.0、cumulative/iterative）
- Fill vs Outline（アクティブ/選択状態のセマンティクス）
- 修飾パターン（circle/square/rectangle/capsule/badge/slash、配置規則）
- 命名文法（base→slash→shape→fill→badge、camelCase、具体例）
- スケール3種（small/medium-large、どこで使うか）
- Effects概要（bounce/pulse/replace等、カスタムシンボル対応要件）

**svg_workflow.md** — 実務ルール
- テンプレートワークフロー（Export Template → 編集 → 再インポート）
- SVG構造要件（Symbols/Alignmentsグループ、9×3=27バリアント、Regular-Mがマージンガイド）
- fills not strokes（ストロークは塗りアウトラインに変換、fill-rule保持）
- レンダリングモード対応のレイヤー設計（別々の選択可能path groupに分割）
- 小サイズ・アクセシビリティ制約（意味の明確性、色のみに依存しない）
- よくある失敗8パターン
- Xcode統合（Symbol Image Set、Image("name")）

**constraints.md** — 禁止・法的
- SF Symbolsのコピー/再配布禁止
- 商標・ロゴ・製品アイコンの模倣禁止
- Apple製品グリフはカスタマイズ不可
- 写実表現の回避（装飾<意味伝達）
- UI文脈に合わない個性化の回避
- SDKライセンスの要点と参照URL

**output_formats.md** — 出力形式A/B/C
- 形式A「アイコン設計仕様」: Symbol name / Intended meaning / Platform & context / Base metaphor / Shape structure / Stroke & fill guidance / Optical adjustments / Variants / Accessibility note
- 形式B「SVG制作用プロンプト」: Canvas & grid / Primary shape / Secondary shape / Stroke behavior / Corner radius / Negative space / Layer structure / Export notes
- 形式C「レビュー結果」: SF Symbolsらしい点 / 違和感のある点 / 修正優先度 / 改善案 / 命名案
- 各形式に1つ具体例を付記（例: 「通知オフ」アイコン、bell.slash 相当の設計）

## scripts/symbol_name_check.py

- 引数: シンボル名（複数可、または--file）
- 検証内容:
  - camelCase + ドット区切りか
  - セグメント順序（base→slash→shape→fill→badge）が正当か
  - 各shape/circle/square/rectangle/capsuleが許可リスト内か
  - badgeセグメントの存在確認
- 出力: 各名前について ✅/⚠️/❌ + 理由 + 推奨形
- 実装: 標準ライブラリのみ（re, argparse, sys）、外部依存なし
- `python3 scripts/symbol_name_check.py "heart.circle.fill" "play.slash.badge"` で実行
- 実装後に実際に実行して動作確認

## 実装ステップ

1. `scripts/init_skill.py sf-symbols-design --path ~/.codex/skills --resources scripts,references` で雛形生成
2. references/ の5ファイルを作成（調査内容を整理して記述、[公式]/[推定]ラベル付き）
3. scripts/symbol_name_check.py を実装し、実行テスト
4. SKILL.md を記述（日本語ベース、ナビゲーション中心、500行以内）
5. `scripts/generate_openai_yaml.py` で agents/openai.yaml 生成
6. `scripts/quick_validate.py` でバリデーション
7. ZCode symlink作成: `ln -s ~/.codex/skills/sf-symbols-design ~/.zcode/skills/sf-symbols-design`
8. Claude用ディレクトリ作成: references/scripts をコピー、SKILL.md は長description版を別途作成
9. 3環境すべてでSKILL.mdとスクリプトの整合性を確認

## 検証

- `quick_validate.py` でYAML・命名・必須項目チェック
- `symbol_name_check.py` を正常系/異常系で実行し動作確認
- `find` で3環境のファイル構成一致を確認（ClaudeのSKILL.md以外）
- 依頼例を想定したforward-test: 新規アイコン設計依頼で形式Aが出力できるか、レビュー依頼で形式Cが出力できるか

## 制約・注意

- このタスクはSkill作成のみで、CIQリポジトリのコード変更は行わない
- `~/.codex` `~/.zcode` `~/.claude` への書き込みはSkill配置のみ
- AGENTS.mdの「Do not commit .DS_Store」「無関係変更を混ぜない」を遵守
- 公式情報と推定情報を明確に区別（Skill内で[公式]/[推定]ラベル）
