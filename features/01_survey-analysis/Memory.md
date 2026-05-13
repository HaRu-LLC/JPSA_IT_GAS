# Memory

## Apps Script運用フロー（固定）
- `clasp` は **pushのみ** に使う（`clasp push --force`）。
- **禁止**: Webアプリ運用中デプロイIDへの `clasp redeploy` / `clasp deploy`。
- Webアプリのバージョン更新は、Apps Script UIの「デプロイを管理」から実施する。
- 手順:
  1. エージェントが `clasp push --force` まで実施
  2. ユーザーが Apps Script UI で「ウェブアプリ」種別のデプロイを更新
  3. エージェントはURL動作確認のみ実施
- 理由: `clasp redeploy` 後に `No web app entry point found.` となる再発実績があるため。

## 固定デプロイ先
- Webアプリ固定デプロイID: `AKfycbxxuPl-FS7Dn8PNka2wot7sNMYSuz3i-70iuGT2Qu_mCBfWVNYfjI2Q17LUs_Q_s6lY`
- 固定URL: `https://script.google.com/a/macros/jpsa-it.org/s/AKfycbxxuPl-FS7Dn8PNka2wot7sNMYSuz3i-70iuGT2Qu_mCBfWVNYfjI2Q17LUs_Q_s6lY/exec`
- 今後の更新手順:
  1. `clasp push --force`
  2. Apps Script UIで当該デプロイIDを「ウェブアプリ」種別のまま更新
  3. 固定URLで表示確認

## AI利用ポリシー
- AI機能を使う場合はGeminiを使用する（他LLMは使わない）。
- Gemini APIキーはユーザーがスプレッドシートUIから入力し、GASに保存する。
