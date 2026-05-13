/**
 * ====================================================================
 * Looker Studio Linking API 連携モジュール
 * ====================================================================
 * Looker StudioのLinking APIを使用して、1クリックでダッシュボードを
 * 作成できるURLを生成します。
 *
 * 参考: https://developers.google.com/looker-studio/integrate/linking-api
 */

/**
 * Looker Studio連携URLを生成
 */
function generateLookerStudioLink() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const spreadsheetId = ss.getId();

  // データソースURLの構築
  const baseUrl = 'https://lookerstudio.google.com/reporting/create';

  // メインデータソース（アンケート回答シート）
  const mainDsConfig = {
    'ds.ds0.connector': 'googleSheets',
    'ds.ds0.datasourceName': 'アンケート回答',
    'ds.ds0.spreadsheetId': spreadsheetId,
    'ds.ds0.sheetId': getSheetId_(ss, CONFIG.SHEETS.PROCESSED),
    'ds.ds0.type': 'TABLE',
    'ds.ds0.refreshFields': 'true'
  };

  // ワードクラウドデータソース
  const wcDsConfig = {
    'ds.ds1.connector': 'googleSheets',
    'ds.ds1.datasourceName': 'ワードクラウドデータ',
    'ds.ds1.spreadsheetId': spreadsheetId,
    'ds.ds1.sheetId': getSheetId_(ss, CONFIG.SHEETS.WORDCLOUD),
    'ds.ds1.type': 'TABLE',
    'ds.ds1.refreshFields': 'true'
  };

  // 月次トレンドデータソース
  const trendDsConfig = {
    'ds.ds2.connector': 'googleSheets',
    'ds.ds2.datasourceName': '月次トレンド',
    'ds.ds2.spreadsheetId': spreadsheetId,
    'ds.ds2.sheetId': getSheetId_(ss, CONFIG.SHEETS.MONTHLY_TREND),
    'ds.ds2.type': 'TABLE',
    'ds.ds2.refreshFields': 'true'
  };

  // サマリー統計データソース
  const summaryDsConfig = {
    'ds.ds3.connector': 'googleSheets',
    'ds.ds3.datasourceName': 'サマリー統計',
    'ds.ds3.spreadsheetId': spreadsheetId,
    'ds.ds3.sheetId': getSheetId_(ss, CONFIG.SHEETS.SUMMARY),
    'ds.ds3.type': 'TABLE',
    'ds.ds3.refreshFields': 'true'
  };

  // 指定月分析データソース
  const monthAnalysisDsConfig = {};
  const monthAnalysisSheetId = getSheetId_(ss, '指定月分析');
  if (monthAnalysisSheetId !== null) {
    monthAnalysisDsConfig['ds.ds4.connector'] = 'googleSheets';
    monthAnalysisDsConfig['ds.ds4.datasourceName'] = '指定月分析';
    monthAnalysisDsConfig['ds.ds4.spreadsheetId'] = spreadsheetId;
    monthAnalysisDsConfig['ds.ds4.sheetId'] = monthAnalysisSheetId;
    monthAnalysisDsConfig['ds.ds4.type'] = 'TABLE';
    monthAnalysisDsConfig['ds.ds4.refreshFields'] = 'true';
  }

  // レポート設定
  const reportConfig = {
    'c.reportName': 'JPSA IT部会 勉強会アンケート分析',
    'c.mode': 'edit'
  };

  // URL構築
  const params = {
    ...mainDsConfig,
    ...wcDsConfig,
    ...trendDsConfig,
    ...summaryDsConfig,
    ...monthAnalysisDsConfig,
    ...reportConfig
  };

  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const fullUrl = `${baseUrl}?${queryString}`;

  // 設定シートに保存
  saveUrlToConfigSheet_(ss, fullUrl);

  // ダイアログで表示
  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: 'Google Sans', Arial, sans-serif; padding: 16px; color: #202124; }
      h2 { color: #1a73e8; }
      .url-box {
        background: #f1f3f4; padding: 12px; border-radius: 8px;
        word-break: break-all; font-size: 12px; margin: 12px 0;
        max-height: 120px; overflow-y: auto; border: 1px solid #dadce0;
      }
      .btn {
        display: inline-block; padding: 10px 24px; border-radius: 4px;
        text-decoration: none; font-weight: 500; margin: 4px;
      }
      .btn-primary { background: #1a73e8; color: white; }
      .btn-secondary { background: #f1f3f4; color: #202124; border: 1px solid #dadce0; }
      .info { background: #e8f0fe; padding: 12px; border-radius: 8px; margin: 12px 0; }
      .ds-list { margin: 8px 0; padding-left: 20px; }
      .ds-list li { margin: 4px 0; }
    </style>

    <h2>🔗 Looker Studio 連携URL</h2>

    <div class="info">
      <strong>接続データソース:</strong>
      <ul class="ds-list">
        <li>📊 アンケート回答（メインデータ）</li>
        <li>☁️ ワードクラウドデータ</li>
        <li>📈 月次トレンド</li>
        <li>📋 サマリー統計</li>
        ${monthAnalysisSheetId !== null ? '<li>🔍 指定月分析</li>' : ''}
      </ul>
    </div>

    <div class="url-box" id="urlBox">${fullUrl}</div>

    <div style="text-align: center; margin-top: 16px;">
      <a href="${fullUrl}" target="_blank" class="btn btn-primary">
        Looker Studioで開く →
      </a>
      <button class="btn btn-secondary" onclick="copyUrl()">
        URLをコピー
      </button>
    </div>

    <h3 style="color: #5f6368; margin-top: 20px;">📝 次のステップ</h3>
    <ol style="line-height: 1.8;">
      <li>上のボタンをクリックしてLooker Studioを開く</li>
      <li>データソースの接続を承認</li>
      <li>「構築ガイド」に従ってダッシュボードを設計</li>
      <li>5ページ構成のレポートを作成</li>
    </ol>

    <script>
      function copyUrl() {
        const url = document.getElementById('urlBox').innerText;
        navigator.clipboard.writeText(url).then(() => {
          alert('URLをクリップボードにコピーしました');
        });
      }
    </script>
  `).setWidth(560).setHeight(560);

  ui.showModalDialog(html, 'Looker Studio 連携');
}

/**
 * シートIDを取得
 */
function getSheetId_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  return sheet ? sheet.getSheetId() : null;
}

/**
 * URLを設定シートに保存
 */
function saveUrlToConfigSheet_(ss, url) {
  let configSheet = ss.getSheetByName(CONFIG.SHEETS.CONFIG);
  if (!configSheet) {
    configSheet = ss.insertSheet(CONFIG.SHEETS.CONFIG);
    configSheet.getRange(1, 1, 1, 2).setValues([['設定項目', '値']]);
    configSheet.getRange(1, 1, 1, 2)
      .setBackground(CONFIG.COLORS.HEADER_BG)
      .setFontColor(CONFIG.COLORS.HEADER_FONT)
      .setFontWeight('bold');
  }

  // 既存のURL行を探す
  const data = configSheet.getDataRange().getValues();
  let urlRow = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === 'Looker Studio URL') {
      urlRow = i + 1;
      break;
    }
  }

  if (urlRow > 0) {
    configSheet.getRange(urlRow, 2).setValue(url);
  } else {
    const newRow = configSheet.getLastRow() + 1;
    configSheet.getRange(newRow, 1, 1, 2).setValues([['Looker Studio URL', url]]);
  }

  // 生成日時も記録
  const dateRow = configSheet.getLastRow() + 1;
  configSheet.getRange(dateRow, 1, 1, 2).setValues([
    ['最終URL生成日時', new Date().toLocaleString('ja-JP')]
  ]);
}
