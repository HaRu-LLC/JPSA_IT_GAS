# AGENT.md

このファイルは、`features/02_gmail-slack-notifier` を変更するエージェント向けの作業ガイドです。

## 1. 機能概要
- Gmail 上で `AI返信作成済` ラベルが付いたスレッドを定期監視する。
- Slack Incoming Webhook へ、送信者・件名・本文・返信下書き本文を構造化して通知する。
- 通知済みスレッドには `Slack通知済` ラベルを付与し、再通知を防ぐ。

## 2. 変更時の重要ルール
- Slack Webhook URL はコードへ直書きしない。Script Properties の `SLACK_WEBHOOK_URL` を使う。
- 通知成功前に `Slack通知済` ラベルを付けない。
- Gmail の検索条件を変える場合は、README の説明も更新する。
- トリガー設定は `setupHourlySlackNotificationTrigger` に集約し、重複トリガーを残さない。

## 3. 手動確認チェックリスト
- `AI返信作成済` ラベル付き、`Slack通知済` 未付与の対象メールが検索される。
- Slack に送信者、件名、本文、返信下書き本文が表示される。
- 通知成功後、対象スレッドへ `Slack通知済` ラベルが付く。
- `setupHourlySlackNotificationTrigger` 実行後、1時間ごとの time-driven trigger が1件だけ存在する。
