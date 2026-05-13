# AGENT.md

このファイルは、`features/01_survey-analysis` を変更するエージェント向けの作業ガイドです。

## 1. 機能概要
- Google Apps Script で、勉強会アンケート回答を前処理・集計し、Google Sheets / Looker Studio / WebApp ダッシュボードへ連携する。
- 実行起点はカスタムメニュー（`onOpen`）とトリガー（`autoProcessData`, `onFormSubmitHandler`）。
- ファイルは GAS 側で同一スコープにマージされる前提。

## 2. ファイル責務
- `01_Main.gs`: メニュー定義、全体処理のオーケストレーション、`CONFIG` 定義。
- `02_DataProcessor.gs`: カラム正規化、カテゴリ分類、リピーター判定、処理済みシート書き込み。
- `03_WordCloud.gs`: ワード抽出とワードクラウドシート生成。
- `04_Summary.gs`: サマリー統計・月次トレンド集計。
- `05_Formatting.gs`: 各シートの書式設定。
- `06_LookerStudioLink.gs`: Looker Studio Linking API URL 生成と設定シート保存。
- `07_Triggers.gs`: 定期/フォーム送信トリガー作成と通知メール。
- `08_MonthAnalysis.gs`: 指定月の深掘り分析シート生成。
- `09_WebApp.gs`: WebApp API（`doGet`, 各 `get*` 関数）。
- `Dashboard.html`: WebApp UI（Chart.js 利用、5タブ構成）。

## 3. 変更時の重要ルール
- **関数名を勝手に変えない**: メニュー・トリガー・`google.script.run` から文字列で呼ばれている。
- **`CONFIG.SHEETS` 名を勝手に変えない**: ほぼ全ファイルで参照している。
- **列定義は一貫更新**:
  - `COLUMN_MAP` / `PARTIAL_COLUMN_MAP` / `OUTPUT_COLUMNS`
  - 集計系（`04_Summary.gs`）
  - 指定月分析（`08_MonthAnalysis.gs`）
  - WebApp API/UI（`09_WebApp.gs`, `Dashboard.html`）
- **表示文言は日本語運用前提**: シート名・UIラベルを変更する場合は README も更新する。
- **トリガー作成ロジックは重複作成に注意**: `setupAutoTrigger` の既存削除フローを壊さない。

## 4. よくある修正の進め方
- Google Forms の質問文が変わった:
  1. `02_DataProcessor.gs` のマッピングを更新
  2. 必要ならカテゴリ分類ルール更新
  3. 集計/ダッシュボードの該当列参照を更新
  4. `README.md` の説明を更新
- 新しい分析列を追加したい:
  1. `OUTPUT_COLUMNS` へ追加
  2. 生成ロジック（前処理/集計/指定月分析）追加
  3. WebApp API と `Dashboard.html` の表示追加
  4. フォーマット定義（必要なら）追加
- シートを増やす:
  1. `CONFIG.SHEETS` へ追加
  2. 生成関数を追加
  3. `formatAllSheets_` と Looker 連携対象へ反映

## 5. 手動確認チェックリスト（変更後）
- `onOpen` でメニューが表示される。
- `processAllData` 実行で以下が更新される:
  - `アンケート回答`
  - `ワードクラウドデータ`
  - `サマリー統計`
  - `月次トレンド`
- `runMonthAnalysis` で `指定月分析` が生成できる。
- `generateLookerStudioLink` が URL を生成し、`設定` シートへ保存される。
- WebApp（`doGet`）で `Dashboard.html` が表示され、主要チャートが描画される。

## 6. 実装スタイル
- 既存コードは「内部ヘルパーは末尾 `_`」命名を採用。新規関数も合わせる。
- GAS の標準 API（`SpreadsheetApp`, `ScriptApp`, `HtmlService`, `MailApp`）前提で実装する。
- 外部依存は最小限（現状フロントは Chart.js CDN のみ）。
- 例外時は UI アラートまたは `Logger.log` で原因が追える形にする。

## 7. デプロイ安全ルール（厳守）
- このプロジェクトでは `clasp` は **push専用** とする。
- **禁止**: Webアプリ運用中IDに対する `clasp redeploy` / `clasp deploy`。
- 更新手順は以下に固定:
  1. エージェントが `clasp push --force` を実行
  2. ユーザーが Apps Script UI の「デプロイを管理」で「ウェブアプリ」更新を実行
  3. エージェントが固定URLの表示確認を実行
- 理由: `clasp redeploy` 後に `No web app entry point found.` となり、Webアプリ種別が壊れる再発実績があるため。
