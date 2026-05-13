/**
 * ====================================================================
 * JPSA IT部会 勉強会アンケート分析 — Google Apps Script
 * ====================================================================
 *
 * このスクリプトは以下を自動化します:
 *   1. 生データの前処理（カラム名の正規化、カテゴリ分類、リピーター判定）
 *   2. ワードクラウド用データの生成
 *   3. サマリー統計の自動計算
 *   4. Looker Studio連携用URLの生成
 *   5. 毎月のデータ追加の自動処理
 *   6. 指定月の特別分析レポート生成
 *
 * セットアップ:
 *   1. Google スプレッドシートを開く
 *   2. 拡張機能 > Apps Script
 *   3. このファイル群をコピー&ペースト
 *   4. カスタムメニュー「IT部会分析」から操作
 *
 * ====================================================================
 */

// ===== グローバル定数 =====
const CONFIG = {
  SHEETS: {
    RAW: 'フォームの回答 1',
    PROCESSED: 'アンケート回答',
    WORDCLOUD: 'ワードクラウドデータ',
    SUMMARY: 'サマリー統計',
    MONTHLY_TREND: '月次トレンド',
    CONFIG: '設定'
  },
  COLORS: {
    HEADER_BG: '#1A73E8',
    HEADER_FONT: '#FFFFFF',
    LIGHT_BLUE: '#E8F0FE',
    LIGHT_GREEN: '#E6F4EA',
    LIGHT_YELLOW: '#FEF7E0',
    LIGHT_RED: '#FCE8E6',
    BORDER: '#E8EAED'
  },
  PROPERTIES: {
    DATA_SPREADSHEET_ID: 'DATA_SPREADSHEET_ID',
    GEMINI_API_KEY: 'GEMINI_API_KEY'
  }
};

// ===== カスタムメニュー =====
function onOpen() {
  cacheDataSpreadsheetId_();

  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔧 IT部会分析')
    .addItem('📊 全データを再処理する', 'processAllData')
    .addSeparator()
    .addItem('➕ 新しい月のデータを追加処理', 'processNewMonthData')
    .addItem('🔄 ワードクラウドを更新', 'updateWordCloud')
    .addItem('📈 サマリー統計を更新', 'updateSummaryStats')
    .addItem('📅 月次トレンドを更新', 'updateMonthlyTrend')
    .addSeparator()
    .addItem('🔍 指定月の特別分析', 'runMonthAnalysis')
    .addSeparator()
    .addItem('🖥️ レポートページを開く', 'openReportPage')
    .addItem('🔑 Gemini APIキーを設定', 'openGeminiApiKeyDialog')
    .addItem('🧩 データ接続を再設定', 'repairDataSpreadsheetConnection')
    .addItem('🔗 Looker Studio連携URLを生成', 'generateLookerStudioLink')
    .addItem('⏰ 自動更新トリガーを設定', 'setupAutoTrigger')
    .addSeparator()
    .addItem('ℹ️ 使い方ガイド', 'showHelp')
    .addToUi();
}

// ===== メイン処理: 全データ再処理 =====
function processAllData() {
  const ss = getDataSpreadsheet_();
  const ui = SpreadsheetApp.getUi();

  try {
    ui.alert('処理開始', '全データの再処理を開始します。完了までお待ちください...', ui.ButtonSet.OK);

    // Step 1: 生データ読み込み
    const rawSheet = ss.getSheetByName(CONFIG.SHEETS.RAW);
    if (!rawSheet) {
      ui.alert('エラー', `「${CONFIG.SHEETS.RAW}」シートが見つかりません。Google Formsの回答シート名を確認してください。`, ui.ButtonSet.OK);
      return;
    }

    const rawData = rawSheet.getDataRange().getValues();
    const headers = rawData[0];
    const rows = rawData.slice(1);

    Logger.log(`生データ: ${rows.length}行 × ${headers.length}列`);

    // Step 2: データ前処理
    const processed = preprocessData_(headers, rows);

    // Step 3: 処理済みシートに出力
    writeProcessedSheet_(ss, processed);

    // Step 4: ワードクラウドデータ生成
    updateWordCloud();

    // Step 5: サマリー統計生成
    updateSummaryStats();

    // Step 6: 月次トレンド生成
    updateMonthlyTrend();

    // Step 7: フォーマット適用
    formatAllSheets_(ss);

    ui.alert('完了',
      `✅ 処理が完了しました！\n\n` +
      `・処理済みデータ: ${processed.rows.length}件\n` +
      `・ワードクラウド: 更新済み\n` +
      `・サマリー統計: 更新済み\n` +
      `・月次トレンド: 更新済み\n\n` +
      `次のステップ: メニュー「IT部会分析」→「Looker Studio連携URLを生成」`,
      ui.ButtonSet.OK);

  } catch (e) {
    ui.alert('エラー', `処理中にエラーが発生しました:\n${e.message}\n\n${e.stack}`, ui.ButtonSet.OK);
    Logger.log(e);
  }
}

// ===== 新しい月のデータ追加処理 =====
function processNewMonthData() {
  const ss = getDataSpreadsheet_();
  const ui = SpreadsheetApp.getUi();

  try {
    const rawSheet = ss.getSheetByName(CONFIG.SHEETS.RAW);
    const processedSheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);

    if (!rawSheet || !processedSheet) {
      ui.alert('エラー', '必要なシートが見つかりません。先に「全データを再処理する」を実行してください。', ui.ButtonSet.OK);
      return;
    }

    const rawData = rawSheet.getDataRange().getValues();
    const existingData = processedSheet.getDataRange().getValues();

    const rawCount = rawData.length - 1;
    const existingCount = existingData.length - 1;

    if (rawCount <= existingCount) {
      ui.alert('情報', `新しいデータはありません。\n生データ: ${rawCount}件 / 処理済み: ${existingCount}件`, ui.ButtonSet.OK);
      return;
    }

    const newCount = rawCount - existingCount;
    const response = ui.alert('確認',
      `${newCount}件の新しいデータが見つかりました。処理を実行しますか？`,
      ui.ButtonSet.YES_NO);

    if (response === ui.Button.YES) {
      processAllData();
    }

  } catch (e) {
    ui.alert('エラー', e.message, ui.ButtonSet.OK);
  }
}

// ===== ヘルプ表示 =====
function showHelp() {
  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: 'Google Sans', Arial, sans-serif; padding: 16px; color: #202124; }
      h2 { color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 8px; }
      h3 { color: #5f6368; margin-top: 16px; }
      ol { padding-left: 20px; }
      li { margin: 8px 0; line-height: 1.6; }
      .step { background: #e8f0fe; padding: 12px; border-radius: 8px; margin: 8px 0; }
      code { background: #f1f3f4; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    </style>
    <h2>📊 JPSA IT部会 勉強会アンケート分析</h2>

    <h3>初回セットアップ</h3>
    <ol>
      <li>Google Formsの回答がこのスプレッドシートに連携されていることを確認</li>
      <li>メニュー「IT部会分析」→「全データを再処理する」を実行</li>
      <li>メニュー「IT部会分析」→「Looker Studio連携URLを生成」を実行</li>
      <li>生成されたURLをクリックしてLooker Studioでダッシュボードを構築</li>
    </ol>

    <h3>毎月の運用</h3>
    <ol>
      <li>Google Formsで新しい回答が蓄積される</li>
      <li>メニュー「IT部会分析」→「新しい月のデータを追加処理」を実行</li>
      <li>メニュー「IT部会分析」→「レポートページを開く」でWebレポートを表示</li>
    </ol>

    <h3>Gemini連携（AI要約を使う場合）</h3>
    <ol>
      <li>メニュー「IT部会分析」→「Gemini APIキーを設定」を開く</li>
      <li>Gemini APIキーを入力して保存（キー文字列はシートに平文保存されません）</li>
      <li>ダッシュボードの「Geminiで要約更新」ボタンで要約を生成</li>
    </ol>

    <h3>自動化（推奨）</h3>
    <div class="step">
      メニュー「IT部会分析」→「自動更新トリガーを設定」を実行すると、<br>
      毎週月曜日に自動でデータが再処理されます。
    </div>

    <h3>シート構成</h3>
    <ul>
      <li><strong>アンケート回答</strong>: 前処理済みデータ（Looker Studioのメインデータソース）</li>
      <li><strong>ワードクラウドデータ</strong>: 頻出ワードランキング</li>
      <li><strong>サマリー統計</strong>: KPI一覧</li>
      <li><strong>月次トレンド</strong>: 月別のKPI推移</li>
    </ul>
  `).setWidth(560).setHeight(520);

  ui.showModalDialog(html, '使い方ガイド');
}

// ===== レポートページを開く =====
function openReportPage() {
  const ui = SpreadsheetApp.getUi();
  const url = ScriptApp.getService().getUrl();

  if (!url) {
    ui.alert(
      'レポートURLが未設定です',
      'まだWebアプリとしてデプロイされていない可能性があります。\n\n' +
      'Apps Scriptエディタで以下を実行してください:\n' +
      '1) 右上「デプロイ」→「新しいデプロイ」\n' +
      '2) 種類: ウェブアプリ\n' +
      '3) 実行: 自分 / アクセス: 組織内 or リンクを知っている全員\n' +
      '4) デプロイ後、再度このメニューを実行',
      ui.ButtonSet.OK
    );
    return;
  }

  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: 'Google Sans', Arial, sans-serif; padding: 16px; color: #202124; }
      h2 { color: #1a73e8; margin: 0 0 12px; }
      .url-box {
        background: #f1f3f4; border: 1px solid #dadce0; border-radius: 8px;
        padding: 10px; font-size: 12px; word-break: break-all; margin: 12px 0;
      }
      .btn {
        display: inline-block; margin-top: 10px; padding: 10px 16px;
        background: #1a73e8; color: #fff; text-decoration: none; border-radius: 6px;
      }
      .sub { color: #5f6368; font-size: 12px; margin-top: 8px; }
    </style>
    <h2>🖥️ レポートページ</h2>
    <div class="url-box" id="urlBox">${url}</div>
    <a class="btn" href="${url}" target="_blank">レポートを開く</a>
    <div class="sub">このURLを運営メンバーに共有すると、ブラウザから閲覧できます。</div>
    <script>
      const box = document.getElementById('urlBox');
      box.addEventListener('click', () => {
        navigator.clipboard.writeText(box.innerText);
      });
    </script>
  `).setWidth(560).setHeight(300);

  ui.showModalDialog(html, 'レポートページを開く');
}

// ===== データ接続ユーティリティ =====
function cacheDataSpreadsheetId_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    PropertiesService.getScriptProperties().setProperty(
      CONFIG.PROPERTIES.DATA_SPREADSHEET_ID,
      ss.getId()
    );
  } catch (e) {
    Logger.log('cacheDataSpreadsheetId_ failed: ' + e.message);
  }
}

function getDataSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  const id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROPERTIES.DATA_SPREADSHEET_ID);
  if (id) return SpreadsheetApp.openById(id);

  throw new Error(
    'データ連携先のスプレッドシートが未設定です。' +
    'スプレッドシートを開き、メニュー「IT部会分析」→「データ接続を再設定」を実行してください。'
  );
}

function repairDataSpreadsheetConnection() {
  const ui = SpreadsheetApp.getUi();
  try {
    cacheDataSpreadsheetId_();
    const id = PropertiesService.getScriptProperties().getProperty(CONFIG.PROPERTIES.DATA_SPREADSHEET_ID);
    ui.alert('完了', `データ接続先を再設定しました。\nSpreadsheet ID: ${id || '未設定'}`, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('エラー', e.message, ui.ButtonSet.OK);
  }
}

// ===== Gemini APIキー設定 =====
function openGeminiApiKeyDialog() {
  const html = HtmlService.createHtmlOutputFromFile('GeminiApiKeyDialog')
    .setWidth(520)
    .setHeight(360);
  SpreadsheetApp.getUi().showModalDialog(html, 'Gemini APIキー設定');
}

function getGeminiApiKeyStatus() {
  const key = PropertiesService.getScriptProperties().getProperty(CONFIG.PROPERTIES.GEMINI_API_KEY) || '';
  const masked = maskApiKey_(key);
  return {
    configured: Boolean(key),
    maskedKey: masked,
    updatedAt: readConfigValue_('Gemini APIキー更新日時')
  };
}

function saveGeminiApiKey(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('APIキーが空です。');
  if (!/^AIza[0-9A-Za-z_\-]{20,}$/.test(key)) {
    throw new Error('Gemini APIキー形式が正しくありません。先頭が "AIza" のキーを入力してください。');
  }

  PropertiesService.getScriptProperties().setProperty(CONFIG.PROPERTIES.GEMINI_API_KEY, key);
  writeConfigValue_('Gemini APIキー', `設定済み (${maskApiKey_(key)})`);
  writeConfigValue_('Gemini APIキー更新日時', new Date().toLocaleString('ja-JP'));
  return getGeminiApiKeyStatus();
}

function clearGeminiApiKey() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.PROPERTIES.GEMINI_API_KEY);
  writeConfigValue_('Gemini APIキー', '未設定');
  writeConfigValue_('Gemini APIキー更新日時', new Date().toLocaleString('ja-JP'));
  return getGeminiApiKeyStatus();
}

function requireGeminiApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty(CONFIG.PROPERTIES.GEMINI_API_KEY) || '';
  if (!key) {
    throw new Error(
      'Gemini APIキーが未設定です。' +
      'スプレッドシートのメニュー「IT部会分析」→「🔑 Gemini APIキーを設定」から入力してください。'
    );
  }
  return key;
}

function maskApiKey_(key) {
  const s = String(key || '').trim();
  if (!s) return '未設定';
  const tail = s.slice(-4);
  return `****${tail}`;
}

function ensureConfigSheet_() {
  const ss = getDataSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEETS.CONFIG);
    sheet.getRange(1, 1, 1, 2).setValues([['設定項目', '値']]);
    sheet.getRange(1, 1, 1, 2)
      .setBackground(CONFIG.COLORS.HEADER_BG)
      .setFontColor(CONFIG.COLORS.HEADER_FONT)
      .setFontWeight('bold');
  }
  return sheet;
}

function writeConfigValue_(name, value) {
  const sheet = ensureConfigSheet_();
  const data = sheet.getDataRange().getValues();
  let row = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === name) {
      row = i + 1;
      break;
    }
  }
  if (row > 0) {
    sheet.getRange(row, 2).setValue(value);
  } else {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, 2).setValues([[name, value]]);
  }
}

function readConfigValue_(name) {
  const sheet = ensureConfigSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === name) return data[i][1];
  }
  return '';
}
