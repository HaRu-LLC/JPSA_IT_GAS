/**
 * ====================================================================
 * 指定月 特別分析モジュール
 * ====================================================================
 * 任意の月を指定して、その月に特化した深掘り分析シートを生成する。
 * Looker Studioの5番目のページ「指定月 特別分析」のデータソース。
 *
 * 依存: pct_() → 04_Summary.gs, extractWords_() → 03_WordCloud.gs
 *       （GASではすべてのファイルが同一スコープにマージされます）
 */

/**
 * 指定月の特別分析を実行（メニューから呼ばれる）
 */
function runMonthAnalysis() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const processedSheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);
  if (!processedSheet) {
    ui.alert('エラー', '処理済みデータが見つかりません。先に「全データを再処理する」を実行してください。', ui.ButtonSet.OK);
    return;
  }

  // 利用可能な月の一覧を取得
  const data = processedSheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  const monthIdx = headers.indexOf('開催月');

  const months = [...new Set(rows.map(r => normalizeMonthValue_(r[monthIdx])).filter(m => m && m !== '不明'))]
    .sort((a, b) => parseMonthLabelSortKey_(a) - parseMonthLabelSortKey_(b));

  if (months.length === 0) {
    ui.alert('エラー', 'データに開催月が含まれていません。', ui.ButtonSet.OK);
    return;
  }

  // 月選択ダイアログ
  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: 'Google Sans', Arial, sans-serif; padding: 20px; color: #202124; }
      h2 { color: #1a73e8; margin-bottom: 16px; }
      select {
        width: 100%; padding: 12px; font-size: 16px; border: 2px solid #1a73e8;
        border-radius: 8px; margin: 12px 0; background: white;
      }
      .btn {
        display: block; width: 100%; padding: 12px; border: none; border-radius: 8px;
        font-size: 16px; font-weight: 500; cursor: pointer; margin: 8px 0;
      }
      .btn-primary { background: #1a73e8; color: white; }
      .btn-secondary { background: #f1f3f4; color: #5f6368; }
      .info { background: #e8f0fe; padding: 12px; border-radius: 8px; margin: 12px 0; font-size: 14px; }
    </style>

    <h2>🔍 指定月 特別分析</h2>
    <div class="info">
      分析したい月を選択してください。<br>
      その月に特化した詳細分析シートが生成されます。
    </div>

    <select id="monthSelect">
      ${months.map(m => `<option value="${m}">${m}</option>`).join('')}
    </select>

    <button class="btn btn-primary" onclick="analyze()">分析を実行 →</button>
    <button class="btn btn-secondary" onclick="google.script.host.close()">キャンセル</button>

    <script>
      // 最新月をデフォルト選択
      const sel = document.getElementById('monthSelect');
      sel.selectedIndex = sel.options.length - 1;

      function analyze() {
        const month = sel.value;
        google.script.run
          .withSuccessHandler(() => {
            google.script.host.close();
          })
          .withFailureHandler((err) => {
            alert('エラー: ' + err.message);
          })
          .generateMonthAnalysis(month);
      }
    </script>
  `).setWidth(380).setHeight(320);

  ui.showModalDialog(html, '月を選択');
}

/**
 * 指定月の分析データを生成
 */
function generateMonthAnalysis(targetMonth) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const processedSheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);
  if (!processedSheet) return;

  const data = processedSheet.getDataRange().getValues();
  const headers = data[0];
  const allRows = data.slice(1);
  const getCol = (name) => headers.indexOf(name);

  // 指定月のデータを抽出
  const normalizedTarget = normalizeMonthValue_(targetMonth);
  const monthRows = allRows.filter(r => normalizeMonthValue_(r[getCol('開催月')]) === normalizedTarget);

  if (monthRows.length === 0) {
    throw new Error(`${normalizedTarget} のデータが見つかりません。`);
  }

  // シート準備
  const sheetName = '指定月分析';
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(sheetName);
  }

  let currentRow = 1;

  // ===== セクション1: 基本情報 =====
  sheet.getRange(currentRow, 1).setValue(`📊 ${normalizedTarget} 特別分析レポート`);
  sheet.getRange(currentRow, 1).setFontSize(14).setFontWeight('bold').setFontColor('#1a73e8');
  currentRow += 2;

  // 全体との比較KPI
  const allSat = allRows.map(r => Number(r[getCol('目的達成度')])).filter(n => !isNaN(n));
  const monthSat = monthRows.map(r => Number(r[getCol('目的達成度')])).filter(n => !isNaN(n));
  const allAvg = allSat.length > 0 ? (allSat.reduce((a, b) => a + b, 0) / allSat.length) : 0;
  const monthAvg = monthSat.length > 0 ? (monthSat.reduce((a, b) => a + b, 0) / monthSat.length) : 0;

  const kpiHeaders = ['指標', `${normalizedTarget}`, '全体平均', '差分', '評価'];
  const kpiData = [];

  // 回答数
  kpiData.push(['回答数', monthRows.length, allRows.length, '-', '-']);

  // 平均達成度
  const satDiff = (monthAvg - allAvg).toFixed(2);
  kpiData.push([
    '平均達成度',
    monthAvg.toFixed(2),
    allAvg.toFixed(2),
    satDiff > 0 ? `+${satDiff}` : satDiff,
    satDiff >= 0 ? '✅ 良好' : '⚠️ 要改善'
  ]);

  // 達成度5の割合
  const monthSat5 = pct_(monthSat.filter(s => s === 5).length, monthSat.length);
  const allSat5 = pct_(allSat.filter(s => s === 5).length, allSat.length);
  kpiData.push([
    '達成度5の割合',
    `${monthSat5}%`,
    `${allSat5}%`,
    `${(monthSat5 - allSat5).toFixed(1)}pt`,
    monthSat5 >= allSat5 ? '✅' : '⚠️'
  ]);

  // LINE登録率
  const monthLine = monthRows.filter(r => r[getCol('LINE登録状況')] === '登録済み').length;
  const monthLineRate = pct_(monthLine, monthRows.length);
  const allLine = allRows.filter(r => r[getCol('LINE登録状況')] === '登録済み').length;
  const allLineRate = pct_(allLine, allRows.length);
  kpiData.push([
    'LINE登録率',
    `${monthLineRate}%`,
    `${allLineRate}%`,
    `${(monthLineRate - allLineRate).toFixed(1)}pt`,
    monthLineRate >= allLineRate ? '✅' : '⚠️'
  ]);

  // Facebook登録率
  const monthFb = monthRows.filter(r => r[getCol('Facebook登録状況')] === '登録済み').length;
  const monthFbRate = pct_(monthFb, monthRows.length);
  kpiData.push(['Facebook登録率', `${monthFbRate}%`, '-', '-', '-']);

  // 次回申込率
  const monthNext = monthRows.filter(r => r[getCol('次回申込状況')] === '登録済み').length;
  const monthNextRate = pct_(monthNext, monthRows.length);
  const allNext = allRows.filter(r => r[getCol('次回申込状況')] === '登録済み').length;
  const allNextRate = pct_(allNext, allRows.length);
  kpiData.push([
    '次回申込率',
    `${monthNextRate}%`,
    `${allNextRate}%`,
    `${(monthNextRate - allNextRate).toFixed(1)}pt`,
    monthNextRate >= allNextRate ? '✅' : '⚠️'
  ]);

  // リピーター数
  const monthRepeaters = monthRows.filter(r => r[getCol('リピーターフラグ')] === 'リピーター').length;
  kpiData.push(['リピーター数', monthRepeaters, '-', '-', `${pct_(monthRepeaters, monthRows.length)}%`]);

  sheet.getRange(currentRow, 1, 1, kpiHeaders.length).setValues([kpiHeaders]);
  sheet.getRange(currentRow, 1, 1, kpiHeaders.length)
    .setBackground(CONFIG.COLORS.HEADER_BG)
    .setFontColor(CONFIG.COLORS.HEADER_FONT)
    .setFontWeight('bold');
  currentRow++;

  sheet.getRange(currentRow, 1, kpiData.length, kpiData[0].length).setValues(kpiData);
  currentRow += kpiData.length + 2;

  // ===== セクション2: 職業分布 =====
  sheet.getRange(currentRow, 1).setValue('📋 職業分布').setFontWeight('bold').setFontSize(12);
  currentRow++;

  const jobCounts = {};
  monthRows.forEach(r => {
    const job = r[getCol('職業')] || 'その他';
    jobCounts[job] = (jobCounts[job] || 0) + 1;
  });

  sheet.getRange(currentRow, 1, 1, 3).setValues([['職業', '人数', '割合']]);
  sheet.getRange(currentRow, 1, 1, 3).setBackground('#E8F0FE').setFontWeight('bold');
  currentRow++;

  const jobData = Object.entries(jobCounts).sort((a, b) => b[1] - a[1]);
  for (const [job, count] of jobData) {
    sheet.getRange(currentRow, 1, 1, 3).setValues([[job, count, `${pct_(count, monthRows.length)}%`]]);
    currentRow++;
  }
  currentRow += 2;

  // ===== セクション3: 認知経路分布 =====
  sheet.getRange(currentRow, 1).setValue('📣 認知経路分布').setFontWeight('bold').setFontSize(12);
  currentRow++;

  const channelCounts = {};
  monthRows.forEach(r => {
    const ch = r[getCol('認知経路')] || 'その他';
    channelCounts[ch] = (channelCounts[ch] || 0) + 1;
  });

  sheet.getRange(currentRow, 1, 1, 3).setValues([['認知経路', '人数', '割合']]);
  sheet.getRange(currentRow, 1, 1, 3).setBackground('#E8F0FE').setFontWeight('bold');
  currentRow++;

  for (const [ch, count] of Object.entries(channelCounts).sort((a, b) => b[1] - a[1])) {
    sheet.getRange(currentRow, 1, 1, 3).setValues([[ch, count, `${pct_(count, monthRows.length)}%`]]);
    currentRow++;
  }
  currentRow += 2;

  // ===== セクション4: 参加目的カテゴリ =====
  sheet.getRange(currentRow, 1).setValue('🎯 参加目的カテゴリ').setFontWeight('bold').setFontSize(12);
  currentRow++;

  const purposeCounts = {};
  monthRows.forEach(r => {
    const p = r[getCol('参加目的カテゴリ_主')] || 'その他';
    purposeCounts[p] = (purposeCounts[p] || 0) + 1;
  });

  sheet.getRange(currentRow, 1, 1, 3).setValues([['カテゴリ', '人数', '割合']]);
  sheet.getRange(currentRow, 1, 1, 3).setBackground('#E8F0FE').setFontWeight('bold');
  currentRow++;

  for (const [p, count] of Object.entries(purposeCounts).sort((a, b) => b[1] - a[1])) {
    sheet.getRange(currentRow, 1, 1, 3).setValues([[p, count, `${pct_(count, monthRows.length)}%`]]);
    currentRow++;
  }
  currentRow += 2;

  // ===== セクション5: 満足度分布 =====
  sheet.getRange(currentRow, 1).setValue('⭐ 達成度分布').setFontWeight('bold').setFontSize(12);
  currentRow++;

  sheet.getRange(currentRow, 1, 1, 3).setValues([['達成度', '人数', '割合']]);
  sheet.getRange(currentRow, 1, 1, 3).setBackground('#E8F0FE').setFontWeight('bold');
  currentRow++;

  for (const score of [5, 4, 3, 2, 1]) {
    const count = monthSat.filter(s => s === score).length;
    sheet.getRange(currentRow, 1, 1, 3).setValues([[`${score}`, count, `${pct_(count, monthSat.length)}%`]]);
    currentRow++;
  }
  currentRow += 2;

  // ===== セクション6: 月固有の質問（あれば） =====
  const specialCols = ['従業員数', 'AI社長サービス_興味', 'AIリーダーズクラブ_興味',
                       '特に学びになったこと', '深掘りリクエスト'];

  const availableSpecial = specialCols.filter(col => {
    const idx = getCol(col);
    if (idx < 0) return false;
    return monthRows.some(r => r[idx] && String(r[idx]).trim());
  });

  if (availableSpecial.length > 0) {
    sheet.getRange(currentRow, 1).setValue('🔍 月固有の質問項目').setFontWeight('bold').setFontSize(12);
    currentRow++;

    for (const col of availableSpecial) {
      const idx = getCol(col);
      const values = monthRows.map(r => r[idx]).filter(v => v && String(v).trim());

      if (values.length === 0) continue;

      sheet.getRange(currentRow, 1).setValue(`▸ ${col}`).setFontWeight('bold').setFontColor('#5f6368');
      currentRow++;

      // 数値的な値ならカウント集計、テキストなら原文一覧
      const isNumeric = values.every(v => !isNaN(Number(v)));
      const isShortCategory = values.every(v => String(v).length < 30);

      if (isShortCategory && !isNumeric) {
        // カテゴリカル → 集計
        const counts = {};
        values.forEach(v => { counts[String(v)] = (counts[String(v)] || 0) + 1; });

        sheet.getRange(currentRow, 1, 1, 3).setValues([['回答', '人数', '割合']]);
        sheet.getRange(currentRow, 1, 1, 3).setBackground('#FEF7E0').setFontWeight('bold');
        currentRow++;

        for (const [val, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
          sheet.getRange(currentRow, 1, 1, 3).setValues([[val, count, `${pct_(count, values.length)}%`]]);
          currentRow++;
        }
      } else {
        // テキスト → 原文一覧
        sheet.getRange(currentRow, 1, 1, 2).setValues([['No.', '回答内容']]);
        sheet.getRange(currentRow, 1, 1, 2).setBackground('#FEF7E0').setFontWeight('bold');
        currentRow++;

        values.forEach((v, i) => {
          sheet.getRange(currentRow, 1, 1, 2).setValues([[i + 1, String(v)]]);
          currentRow++;
        });
      }

      currentRow += 1;
    }
    currentRow += 1;
  }

  // ===== セクション7: ワードクラウド（月別） =====
  sheet.getRange(currentRow, 1).setValue('☁️ 頻出ワード（この月）').setFontWeight('bold').setFontSize(12);
  currentRow++;

  const textColumns = ['参加目的', '実行アクション', '感想・メッセージ', '特に学びになったこと', '深掘りリクエスト'];
  const monthTexts = [];
  for (const col of textColumns) {
    const idx = getCol(col);
    if (idx < 0) continue;
    monthRows.forEach(r => {
      if (r[idx] && String(r[idx]).trim()) monthTexts.push(String(r[idx]));
    });
  }

  if (monthTexts.length > 0) {
    const wordCounts = extractWords_(monthTexts.join(' ')).slice(0, 30);

    sheet.getRange(currentRow, 1, 1, 2).setValues([['ワード', '出現回数']]);
    sheet.getRange(currentRow, 1, 1, 2).setBackground('#E8F0FE').setFontWeight('bold');
    currentRow++;

    for (const [word, count] of wordCounts) {
      sheet.getRange(currentRow, 1, 1, 2).setValues([[word, count]]);
      currentRow++;
    }
    currentRow += 2;
  }

  // ===== セクション8: テキスト原文一覧 =====
  const textSections = [
    { col: '参加目的', label: '📝 参加目的（原文）' },
    { col: '実行アクション', label: '💪 実行アクション（原文）' },
    { col: '感想・メッセージ', label: '💬 感想・メッセージ（原文）' },
  ];

  for (const sec of textSections) {
    const idx = getCol(sec.col);
    if (idx < 0) continue;

    const texts = monthRows.map(r => r[idx]).filter(v => v && String(v).trim());
    if (texts.length === 0) continue;

    sheet.getRange(currentRow, 1).setValue(sec.label).setFontWeight('bold').setFontSize(12);
    currentRow++;

    sheet.getRange(currentRow, 1, 1, 3).setValues([['No.', '回答内容', 'カテゴリ']]);
    sheet.getRange(currentRow, 1, 1, 3).setBackground('#E8F0FE').setFontWeight('bold');
    currentRow++;

    const catCol = sec.col === '参加目的' ? '参加目的カテゴリ_主' :
                   sec.col === '実行アクション' ? '実行アクションカテゴリ' : '';
    const catIdx = catCol ? getCol(catCol) : -1;

    texts.forEach((text, i) => {
      const row = monthRows.find(r => r[idx] === text);
      const cat = catIdx >= 0 && row ? row[catIdx] : '';
      sheet.getRange(currentRow, 1, 1, 3).setValues([[i + 1, String(text), cat]]);
      currentRow++;
    });

    currentRow += 2;
  }

  // フリーズ & フォーマット
  sheet.setFrozenRows(0);
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 350);
  sheet.setColumnWidth(3, 100);

  // 生成情報を設定シートに記録
  let configSheet = ss.getSheetByName(CONFIG.SHEETS.CONFIG);
  if (configSheet) {
    const lastRow = configSheet.getLastRow() + 1;
    configSheet.getRange(lastRow, 1, 1, 2).setValues([
      ['最終分析月', `${normalizedTarget} (${new Date().toLocaleString('ja-JP')})`]
    ]);
  }

  // 完了メッセージ
  SpreadsheetApp.getUi().alert('完了',
    `✅ ${normalizedTarget} の特別分析レポートを生成しました！\n\n` +
    `「指定月分析」シートをご確認ください。\n` +
    `Looker Studioの5ページ目のデータソースとしてもご利用いただけます。`,
    SpreadsheetApp.getUi().ButtonSet.OK);

  Logger.log(`Month analysis generated: ${normalizedTarget}, ${monthRows.length} rows`);
}
