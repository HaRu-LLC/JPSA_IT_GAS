/**
 * ====================================================================
 * サマリー統計 & 月次トレンドモジュール
 * ====================================================================
 */

/**
 * サマリー統計を更新
 */
function updateSummaryStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const processedSheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);
  if (!processedSheet) return;

  const data = processedSheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const getCol = (name) => headers.indexOf(name);
  const getValues = (colName) => rows.map(r => r[getCol(colName)]).filter(v => v !== '' && v !== null && v !== undefined);

  // 基本統計
  const totalResponses = rows.length;
  const months = getValues('開催月');
  const monthCounts = countValues_(months);
  const satisfaction = getValues('目的達成度').map(Number).filter(n => !isNaN(n));
  const avgSatisfaction = satisfaction.length > 0 ? (satisfaction.reduce((a, b) => a + b, 0) / satisfaction.length).toFixed(2) : 0;

  // 月別満足度
  const monthSat = {};
  rows.forEach(r => {
    const m = r[getCol('開催月')];
    const s = Number(r[getCol('目的達成度')]);
    if (m && !isNaN(s)) {
      if (!monthSat[m]) monthSat[m] = [];
      monthSat[m].push(s);
    }
  });

  // 登録率
  const lineReg = getValues('LINE登録状況');
  const fbReg = getValues('Facebook登録状況');
  const nextReg = getValues('次回申込状況');
  const lineRate = pct_(lineReg.filter(v => v === '登録済み').length, lineReg.length);
  const fbRate = pct_(fbReg.filter(v => v === '登録済み').length, fbReg.length);
  const nextRate = pct_(nextReg.filter(v => v === '登録済み').length, nextReg.length);

  // リピーター
  const repeaters = getValues('リピーターフラグ').filter(v => v === 'リピーター').length;
  // リピーターは各月でカウントされるので、ユニーク数はメールで計算
  const emails = {};
  rows.forEach(r => {
    const e = r[getCol('メールアドレス')];
    const m = r[getCol('開催月')];
    if (e) {
      if (!emails[e]) emails[e] = new Set();
      emails[e].add(m);
    }
  });
  const repeaterCount = Object.values(emails).filter(s => s.size > 1).length;
  const uniqueParticipants = Object.keys(emails).length;

  // 職業分布
  const jobs = countValues_(getValues('職業'));

  // 目的カテゴリ分布
  const purposeCats = countValues_(getValues('参加目的カテゴリ_主'));

  // 満足度分布
  const satDist = countValues_(satisfaction.map(String));

  // シートに書き込み
  let sheet = ss.getSheetByName(CONFIG.SHEETS.SUMMARY);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(CONFIG.SHEETS.SUMMARY);
  }

  const output = [
    ['カテゴリ', '指標', '値', '補足'],
    ['全体', '総回答数', totalResponses, ''],
    ['全体', 'ユニーク参加者数', uniqueParticipants, ''],
    ['全体', '平均目的達成度', avgSatisfaction, '5段階中'],
    ['全体', 'リピーター数', repeaterCount, `${pct_(repeaterCount, uniqueParticipants)}%`],
    ['登録率', 'LINE登録率', `${lineRate}%`, `${lineReg.filter(v => v === '登録済み').length}/${lineReg.length}`],
    ['登録率', 'Facebook登録率', `${fbRate}%`, `${fbReg.filter(v => v === '登録済み').length}/${fbReg.length}`],
    ['登録率', '次回申込率(登録済み)', `${nextRate}%`, `${nextReg.filter(v => v === '登録済み').length}/${nextReg.length}`],
    ['登録率', '次回申込率(今回登録含む)', `${pct_(nextReg.filter(v => v !== '登録しない').length, nextReg.length)}%`, ''],
  ];

  // 月別統計
  for (const [month, count] of Object.entries(monthCounts).sort((a, b) =>
    parseMonthLabelSortKey_(a[0]) - parseMonthLabelSortKey_(b[0])
  )) {
    const mSat = monthSat[month] || [];
    const mAvg = mSat.length > 0 ? (mSat.reduce((a, b) => a + b, 0) / mSat.length).toFixed(2) : 'N/A';
    output.push(['月別', `${month} 回答数`, count, '']);
    output.push(['月別', `${month} 平均達成度`, mAvg, '']);
  }

  // 満足度分布
  for (const score of ['5', '4', '3', '2', '1']) {
    const count = satDist[score] || 0;
    output.push(['満足度分布', `達成度 ${score}`, count, `${pct_(count, satisfaction.length)}%`]);
  }

  // 職業分布
  for (const [job, count] of Object.entries(jobs).sort((a, b) => b[1] - a[1])) {
    output.push(['職業', job, count, `${pct_(count, totalResponses)}%`]);
  }

  // 目的カテゴリ
  for (const [cat, count] of Object.entries(purposeCats).sort((a, b) => b[1] - a[1])) {
    output.push(['参加目的', cat, count, '']);
  }

  sheet.getRange(1, 1, output.length, output[0].length).setValues(output);
  sheet.setFrozenRows(1);

  Logger.log('Summary stats updated');
}

/**
 * 月次トレンドを更新
 */
function updateMonthlyTrend() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const processedSheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);
  if (!processedSheet) return;

  const data = processedSheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  const getCol = (name) => headers.indexOf(name);

  // 月別に集計
  const monthStats = {};

  rows.forEach(r => {
    const month = r[getCol('開催月')];
    if (!month) return;

    if (!monthStats[month]) {
      monthStats[month] = {
        count: 0, satisfaction: [], line: 0, fb: 0, next: 0,
        repeater: 0, jobs: {}, purposes: {}, channels: {}
      };
    }

    const ms = monthStats[month];
    ms.count++;

    const sat = Number(r[getCol('目的達成度')]);
    if (!isNaN(sat)) ms.satisfaction.push(sat);

    if (r[getCol('LINE登録状況')] === '登録済み') ms.line++;
    if (r[getCol('Facebook登録状況')] === '登録済み') ms.fb++;
    if (r[getCol('次回申込状況')] === '登録済み') ms.next++;
    if (r[getCol('リピーターフラグ')] === 'リピーター') ms.repeater++;

    const job = r[getCol('職業')] || 'その他';
    ms.jobs[job] = (ms.jobs[job] || 0) + 1;

    const purpose = r[getCol('参加目的カテゴリ_主')] || 'その他';
    ms.purposes[purpose] = (ms.purposes[purpose] || 0) + 1;

    const channel = r[getCol('認知経路')] || 'その他';
    ms.channels[channel] = (ms.channels[channel] || 0) + 1;
  });

  // シートに書き込み
  let sheet = ss.getSheetByName(CONFIG.SHEETS.MONTHLY_TREND);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(CONFIG.SHEETS.MONTHLY_TREND);
  }

  const trendHeaders = [
    '開催月', '回答数', '平均達成度', '達成度5の割合',
    'LINE登録率', 'Facebook登録率', '次回申込率',
    'リピーター数', '経営者率', '会社員率',
    'JPSA紹介率', '前回案内率', 'SNS率',
    'IT/AI学習率', 'ビジネス活用率', '自己成長率'
  ];

  const trendData = Object.entries(monthStats)
    .sort((a, b) => parseMonthLabelSortKey_(a[0]) - parseMonthLabelSortKey_(b[0]))
    .map(([month, ms]) => {
      const avgSat = ms.satisfaction.length > 0 ?
        (ms.satisfaction.reduce((a, b) => a + b, 0) / ms.satisfaction.length).toFixed(2) : '';
      const sat5 = pct_(ms.satisfaction.filter(s => s === 5).length, ms.satisfaction.length);

      return [
        month, ms.count, avgSat, `${sat5}%`,
        `${pct_(ms.line, ms.count)}%`, `${pct_(ms.fb, ms.count)}%`, `${pct_(ms.next, ms.count)}%`,
        ms.repeater / 2,  // リピーターは各月で重複カウントされるため
        `${pct_(ms.jobs['経営者・役員'] || 0, ms.count)}%`,
        `${pct_(ms.jobs['会社員'] || 0, ms.count)}%`,
        `${pct_(ms.channels['JPSA紹介'] || 0, ms.count)}%`,
        `${pct_(ms.channels['前回の案内'] || 0, ms.count)}%`,
        `${pct_(ms.channels['SNS'] || 0, ms.count)}%`,
        `${pct_(ms.purposes['IT/AI学習'] || 0, ms.count)}%`,
        `${pct_(ms.purposes['ビジネス活用'] || 0, ms.count)}%`,
        `${pct_(ms.purposes['自己成長'] || 0, ms.count)}%`,
      ];
    });

  sheet.getRange(1, 1, 1, trendHeaders.length).setValues([trendHeaders]);
  if (trendData.length > 0) {
    sheet.getRange(2, 1, trendData.length, trendData[0].length).setValues(trendData);
  }

  sheet.setFrozenRows(1);
  Logger.log('Monthly trend updated');
}

// ===== ユーティリティ =====

function countValues_(arr) {
  const counts = {};
  arr.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  return counts;
}

function pct_(num, den) {
  if (den === 0) return 0;
  return Math.round(num / den * 1000) / 10;
}
