# GAS 自動運用フロー（Schema Change -> Smoke -> Push）

このプロジェクトでは、Skillベースの実行器 `ops/run_schema_change_pipeline.sh` を使って、スキーマ変更時の標準フローを一括実行する。

## 1. 前提

- `clasp` 認証済み
- `~/.codex/skills` に以下Skillが存在
  - `gas-clasp`
  - `gas-schema-sync`
  - `gas-smoke-test`

## 2. 主要コマンド

- スモークのみ:
  - `make smoke`
- スキーマ影響調査のみ:
  - `make schema-scan OLD="旧質問文" NEW="新質問文" CANONICAL="正規化列名"`
  - 任意の追加検索語を入れる場合: `SCAN_TERM="追加語"`
  - `NEW` が未実装でも既定では警告継続（厳格に止めたい場合は直接実行で `--strict-scan` を付与）
- 一括実行（scan + smoke + clasp status + optional push/version/deploy）:
  - `make pipeline OLD="旧質問文" NEW="新質問文" CANONICAL="正規化列名" PUSH=1`

## 3. 推奨運用手順

1. コード変更（`COLUMN_MAP` / `OUTPUT_COLUMNS` / 集計/UI 追従）
2. `make schema-scan ...` で影響箇所の確認
3. `make smoke` で契約チェック
4. 問題なければ `make pipeline ... PUSH=1` 実行
5. 必要ならバージョン/デプロイ
   - `make pipeline ... PUSH=1 VERSION_DESC="schema update 2026-03-03"`
   - `make pipeline ... PUSH=1 VERSION_DESC="..." REDEPLOY_ID="<id>"`

## 4. 直接実行（Makefileを使わない場合）

- scan:
  - `ops/run_schema_change_pipeline.sh --mode scan --old "A" --new "B" --canonical "C"`
- smoke:
  - `ops/run_schema_change_pipeline.sh --mode smoke`
- pipeline:
  - `ops/run_schema_change_pipeline.sh --mode pipeline --old "A" --new "B" --canonical "C" --push`

## 5. レポート

- 実行ログは `ops/reports/pipeline-YYYYMMDD-HHMMSS.log` に出力される。
- 失敗時はレポートを開き、失敗ステップとコマンドを確認する。
