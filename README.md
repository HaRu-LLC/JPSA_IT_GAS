# JPSA IT部会 リポジトリ

このリポジトリは、JPSA IT部会で扱う複数機能を全体整合の前提で管理する親リポジトリです。

## ディレクトリ方針
- `features/`: 機能単位のコード、設定、運用資料を置く。
- ルート: 全体README、全体方針、横断的なガイドのみを置く。

## 現在の機能
- `features/01_survey-analysis`
  - 勉強会アンケート分析の Google Apps Script 機能。
  - 旧トップレベルの Apps Script 一式をそのままこの機能へ整理したもの。
- `features/02_gmail-slack-notifier`
  - Gmail のラベル付きメールを Slack に通知する Google Apps Script 機能。

## 今後の追加方針
- 次の新規機能は `features/02_*` として追加する。
- 機能固有の README / AGENT / 運用スクリプト / メモは、必ずその機能ディレクトリ配下に置く。
- 複数機能で共有するルールだけをルートに残す。
