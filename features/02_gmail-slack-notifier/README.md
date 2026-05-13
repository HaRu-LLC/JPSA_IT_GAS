# Gmail Slack Notifier

このディレクトリは、全体リポジトリ配下の「その2機能」です。

## 機能概要
- Script Properties の `TARGET_MAILBOX` に設定した宛先メールを監視する。
- `AI返信作成済` ラベルが付いたスレッドを対象にする。
- `Slack通知済` ラベルが付いたスレッドは対象外にする。
- Slack へ以下を構造化して通知する。
  - 送信者
  - 件名
  - 本文
  - 返信下書き本文
- 通知成功後に `Slack通知済` ラベルを付与する。
- 1時間ごとの time-driven trigger で定期実行する。

## ファイル
- `01_Main.gs`: Gmail検索、Slack通知、トリガー設定の本体。
- `appsscript.json`: Apps Script マニフェスト。
- `.clasp.json`: 対象 Apps Script プロジェクトへの紐付け設定。公開リポジトリでは管理しない。
- `.claspignore`: push 対象ファイルの制御。

## 初期設定
1. Apps Script プロジェクトに `01_Main.gs` と `appsscript.json` を配置する。
2. Apps Script の `プロジェクトの設定` から `スクリプト プロパティ` を開く。
3. `TARGET_MAILBOX` というキーで監視対象メールアドレスを保存する。
4. `SLACK_WEBHOOK_URL` というキーで Incoming Webhook URL を保存する。
5. `saveSlackWebhookUrl` を使って保存してもよい。
6. `setupHourlySlackNotificationTrigger` を一度実行して、1時間トリガーを作成する。

## clasp 反映
- このディレクトリで `clasp push --force` を実行すると Apps Script 側へ反映できる。
- 対象 scriptId はローカルの `.clasp.json` で管理する。公開リポジトリには含めない。

## 実行関数
- `notifyPreparedAiRepliesToSlack`
  - 監視対象メールを検索し、Slack通知後に `Slack通知済` ラベルを付ける。
- `setupHourlySlackNotificationTrigger`
  - 既存の同名トリガーを削除してから1時間トリガーを再作成する。
- `saveSlackWebhookUrl`
  - Webhook URL を Script Properties に保存する。

## Gmail検索条件
- `label:"AI返信作成済" -label:"Slack通知済" to:<TARGET_MAILBOX>`

## 補足
- 返信下書き本文は Gmail の draft から同一スレッドを探して取得する。
- 通知失敗時は `Slack通知済` ラベルを付けない。
- Slack 文字数制限を考慮して、本文と返信下書き本文はそれぞれ最大 2500 文字に切り詰める。
