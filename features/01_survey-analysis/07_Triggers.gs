/**
 * ====================================================================
 * トリガー & 自動化モジュール
 * ====================================================================
 */

/**
 * 自動更新トリガーを設定
 */
function setupAutoTrigger() {
  const ui = SpreadsheetApp.getUi();

  // 既存トリガーの確認
  const existingTriggers = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'autoProcessData');

  if (existingTriggers.length > 0) {
    const response = ui.alert('確認',
      `既に自動更新トリガーが ${existingTriggers.length} 件設定されています。\n` +
      '既存のトリガーを削除して再設定しますか？',
      ui.ButtonSet.YES_NO);

    if (response === ui.Button.YES) {
      existingTriggers.forEach(t => ScriptApp.deleteTrigger(t));
    } else {
      return;
    }
  }

  // 毎週月曜日 午前9時にトリガー設定
  ScriptApp.newTrigger('autoProcessData')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();

  // フォーム送信トリガーも設定
  const ss = getDataSpreadsheet_();
  ScriptApp.newTrigger('onFormSubmitHandler')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  ui.alert('完了',
    '以下のトリガーが設定されました:\n\n' +
    '1. 毎週月曜 9:00 — 全データを自動再処理\n' +
    '2. フォーム送信時 — 新回答を自動検知\n\n' +
    '※ トリガーの管理: 拡張機能 > Apps Script > トリガー',
    ui.ButtonSet.OK);
}

/**
 * 自動処理（トリガーから呼ばれる）
 */
function autoProcessData() {
  try {
    const ss = getDataSpreadsheet_();
    const rawSheet = ss.getSheetByName(CONFIG.SHEETS.RAW);
    if (!rawSheet) return;

    const rawData = rawSheet.getDataRange().getValues();
    const headers = rawData[0];
    const rows = rawData.slice(1);

    // データ前処理
    const processed = preprocessData_(headers, rows);
    writeProcessedSheet_(ss, processed);

    // 各分析を更新
    updateWordCloud();
    updateSummaryStats();
    updateMonthlyTrend();
    formatAllSheets_(ss);

    Logger.log(`Auto process completed: ${processed.rows.length} rows`);

    // 通知メール送信（オプション）
    sendNotificationEmail_(processed.rows.length);

  } catch (e) {
    Logger.log('Auto process error: ' + e.message);
    // エラー通知
    try {
      MailApp.sendEmail(
        Session.getActiveUser().getEmail(),
        '[JPSA IT部会] 自動処理エラー',
        `自動データ処理中にエラーが発生しました:\n\n${e.message}\n\n${e.stack}`
      );
    } catch (mailErr) {
      Logger.log('Mail notification failed: ' + mailErr.message);
    }
  }
}

/**
 * フォーム送信ハンドラー
 */
function onFormSubmitHandler(e) {
  try {
    Logger.log('New form submission detected');
    // フォーム送信時は即時処理せず、ログに記録
    // 全データ再処理は週次トリガーで実行
    const ss = (e && e.source) ? e.source : getDataSpreadsheet_();
    const rawSheet = ss.getSheetByName(CONFIG.SHEETS.RAW);
    const processedSheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);

    if (rawSheet && processedSheet) {
      const rawCount = rawSheet.getLastRow() - 1;
      const processedCount = processedSheet.getLastRow() - 1;
      const diff = rawCount - processedCount;

      if (diff > 0) {
        Logger.log(`${diff} new responses pending processing`);
      }
    }
  } catch (e) {
    Logger.log('Form submit handler error: ' + e.message);
  }
}

/**
 * 処理完了通知メール（オプション）
 */
function sendNotificationEmail_(rowCount) {
  try {
    const email = Session.getActiveUser().getEmail();
    if (!email) return;

    const ss = getDataSpreadsheet_();
    const url = ss.getUrl();

    MailApp.sendEmail({
      to: email,
      subject: '[JPSA IT部会] データ自動更新完了',
      htmlBody: `
        <div style="font-family: 'Google Sans', Arial, sans-serif; max-width: 480px;">
          <h2 style="color: #1a73e8;">📊 データ更新完了</h2>
          <p>JPSA IT部会 勉強会アンケートの自動データ処理が完了しました。</p>
          <table style="border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px 16px; background: #e8f0fe; font-weight: bold;">処理件数</td>
              <td style="padding: 8px 16px;">${rowCount} 件</td>
            </tr>
            <tr>
              <td style="padding: 8px 16px; background: #e8f0fe; font-weight: bold;">処理日時</td>
              <td style="padding: 8px 16px;">${new Date().toLocaleString('ja-JP')}</td>
            </tr>
          </table>
          <p><a href="${url}" style="color: #1a73e8;">スプレッドシートを開く →</a></p>
        </div>
      `
    });
  } catch (e) {
    Logger.log('Notification email failed: ' + e.message);
  }
}
