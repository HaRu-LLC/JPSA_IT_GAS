/**
 * ====================================================================
 * シートフォーマットモジュール
 * ====================================================================
 */

/**
 * 全シートにフォーマットを適用
 */
function formatAllSheets_(ss) {
  formatSheet_(ss, CONFIG.SHEETS.PROCESSED);
  formatSheet_(ss, CONFIG.SHEETS.WORDCLOUD);
  formatSheet_(ss, CONFIG.SHEETS.SUMMARY);
  formatSheet_(ss, CONFIG.SHEETS.MONTHLY_TREND);

  Logger.log('All sheets formatted');
}

/**
 * 個別シートのフォーマット適用
 */
function formatSheet_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol === 0) return;

  // ヘッダー行のフォーマット
  const headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FONT)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  // データ範囲の罫線
  if (lastRow > 1) {
    const dataRange = sheet.getRange(1, 1, lastRow, lastCol);
    dataRange.setBorder(
      true, true, true, true, true, true,
      CONFIG.COLORS.BORDER, SpreadsheetApp.BorderStyle.SOLID
    );
  }

  // 交互の背景色（ゼブラストライプ）
  for (let r = 2; r <= lastRow; r++) {
    const rowRange = sheet.getRange(r, 1, 1, lastCol);
    if (r % 2 === 0) {
      rowRange.setBackground(CONFIG.COLORS.LIGHT_BLUE);
    }
  }

  // シート固有のフォーマット
  switch (sheetName) {
    case CONFIG.SHEETS.PROCESSED:
      formatProcessedSheet_(sheet, lastRow, lastCol);
      break;
    case CONFIG.SHEETS.SUMMARY:
      formatSummarySheet_(sheet, lastRow);
      break;
    case CONFIG.SHEETS.WORDCLOUD:
      formatWordCloudSheet_(sheet, lastRow);
      break;
    case CONFIG.SHEETS.MONTHLY_TREND:
      formatTrendSheet_(sheet, lastRow, lastCol);
      break;
  }

  // カラム幅の自動調整
  for (let c = 1; c <= lastCol; c++) {
    sheet.autoResizeColumn(c);
  }
}

/**
 * 処理済みシートのフォーマット
 */
function formatProcessedSheet_(sheet, lastRow, lastCol) {
  if (lastRow <= 1) return;

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // 目的達成度カラムの条件付き書式
  const satIdx = headers.indexOf('目的達成度');
  if (satIdx >= 0) {
    const satRange = sheet.getRange(2, satIdx + 1, lastRow - 1, 1);
    satRange.setHorizontalAlignment('center');

    // 条件付き書式ルール
    const rules = sheet.getConditionalFormatRules();

    // 達成度5: 緑
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenNumberEqualTo(5)
      .setBackground('#E6F4EA')
      .setFontColor('#137333')
      .setRanges([satRange])
      .build());

    // 達成度4: 薄緑
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenNumberEqualTo(4)
      .setBackground('#F0F9E8')
      .setFontColor('#2E7D32')
      .setRanges([satRange])
      .build());

    // 達成度3以下: 黄色
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThanOrEqualTo(3)
      .setBackground('#FEF7E0')
      .setFontColor('#E37400')
      .setRanges([satRange])
      .build());

    sheet.setConditionalFormatRules(rules);
  }

  // リピーターフラグのカラム
  const repIdx = headers.indexOf('リピーターフラグ');
  if (repIdx >= 0) {
    const repRange = sheet.getRange(2, repIdx + 1, lastRow - 1, 1);
    repRange.setHorizontalAlignment('center');

    const rules = sheet.getConditionalFormatRules();
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('リピーター')
      .setBackground('#E8F0FE')
      .setFontColor('#1A73E8')
      .setBold(true)
      .setRanges([repRange])
      .build());
    sheet.setConditionalFormatRules(rules);
  }
}

/**
 * サマリーシートのフォーマット
 */
function formatSummarySheet_(sheet, lastRow) {
  if (lastRow <= 1) return;

  // カテゴリ列でグループ色分け
  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const categoryColors = {
    '全体': CONFIG.COLORS.LIGHT_BLUE,
    '登録率': CONFIG.COLORS.LIGHT_GREEN,
    '月別': CONFIG.COLORS.LIGHT_YELLOW,
    '満足度分布': '#F3E8FD',
    '職業': '#FEF7E0',
    '参加目的': '#E8F7F0'
  };

  for (let r = 0; r < data.length; r++) {
    const cat = data[r][0];
    const color = categoryColors[cat];
    if (color) {
      sheet.getRange(r + 2, 1, 1, 4).setBackground(color);
    }
  }

  // 値列を右寄せ
  sheet.getRange(2, 3, lastRow - 1, 1).setHorizontalAlignment('right');
}

/**
 * ワードクラウドシートのフォーマット
 */
function formatWordCloudSheet_(sheet, lastRow) {
  if (lastRow <= 1) return;

  // フォントサイズ列で条件付き書式（データバー風）
  const countRange = sheet.getRange(2, 2, Math.min(lastRow - 1, 80), 1);

  const rules = sheet.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenNumberGreaterThan(0)
    .setGradientMinpoint('#FFFFFF')
    .setGradientMaxpoint('#1A73E8')
    .setRanges([countRange])
    .build());
  sheet.setConditionalFormatRules(rules);

  // 出現回数を右寄せ
  countRange.setHorizontalAlignment('right');
}

/**
 * 月次トレンドシートのフォーマット
 */
function formatTrendSheet_(sheet, lastRow, lastCol) {
  if (lastRow <= 1) return;

  // パーセンテージ列のフォーマット
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  for (let c = 0; c < headers.length; c++) {
    const h = headers[c];
    if (h.includes('率') || h.includes('割合')) {
      sheet.getRange(2, c + 1, lastRow - 1, 1).setHorizontalAlignment('right');
    }
  }

  // 数値列を中央寄せ
  sheet.getRange(2, 2, lastRow - 1, lastCol - 1).setHorizontalAlignment('center');
}
