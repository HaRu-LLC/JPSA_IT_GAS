/**
 * ====================================================================
 * ワードクラウド & テキスト分析モジュール
 * ====================================================================
 */

// ===== ストップワード（除外する一般的な語） =====
const STOP_WORDS = new Set([
  'する', 'ある', 'いる', 'なる', 'れる', 'できる', 'くる', 'いく',
  'ため', 'こと', 'もの', 'ところ', 'よう', 'たち', 'さん', 'から',
  'まで', 'より', 'ほど', 'ごと', 'ずつ', 'など', 'とか', 'くらい',
  'です', 'ます', 'した', 'して', 'され', 'でき', 'あり', 'なり',
  'とても', 'とても', 'すごく', 'かなり', 'ちょっと', 'もっと',
  'ありがとう', 'ございます', 'ございました', 'お願い', 'します',
  'ました', 'ません', 'ください', 'いただき', 'おります',
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'was', 'are',
]);

/**
 * ワードクラウドデータを更新
 */
function updateWordCloud() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const processedSheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);

  if (!processedSheet) {
    Logger.log('Processed sheet not found');
    return;
  }

  const data = processedSheet.getDataRange().getValues();
  const headers = data[0];

  // テキスト分析対象カラム
  const textColumns = ['参加目的', '実行アクション', '感想・メッセージ', '特に学びになったこと', '深掘りリクエスト'];
  const textIndices = textColumns.map(col => headers.indexOf(col)).filter(i => i >= 0);

  // 全テキストを結合
  const allTexts = [];
  for (let r = 1; r < data.length; r++) {
    for (const idx of textIndices) {
      const val = data[r][idx];
      if (val && String(val).trim()) {
        allTexts.push(String(val));
      }
    }
  }

  // ワード抽出 & カウント
  const wordCounts = extractWords_(allTexts.join(' '));

  // 月別ワードクラウドも生成
  const monthIdx = headers.indexOf('開催月');
  const monthWords = {};

  for (let r = 1; r < data.length; r++) {
    const month = data[r][monthIdx] || '不明';
    if (!monthWords[month]) monthWords[month] = [];

    for (const idx of textIndices) {
      const val = data[r][idx];
      if (val && String(val).trim()) {
        monthWords[month].push(String(val));
      }
    }
  }

  // シートに書き込み
  writeWordCloudSheet_(ss, wordCounts, monthWords);
}

/**
 * テキストからワードを抽出しカウント
 */
function extractWords_(text) {
  const counts = {};

  // カタカナ語（2文字以上）
  const katakana = text.match(/[ァ-ヶー]{2,}/g) || [];
  // 英字語（2文字以上）+ 特別な短い語
  const english = text.match(/[a-zA-Z]{2,}/g) || [];
  // 特別な短い語
  const special = text.match(/\bAI\b|\bIT\b|\bAT\b|\bCT\b/g) || [];
  // 漢字語（2〜6文字）
  const kanji = text.match(/[\u4e00-\u9fff]{2,6}/g) || [];

  const allWords = [...katakana, ...english, ...special, ...kanji];

  for (const word of allWords) {
    const w = word.trim();
    if (w.length < 2 && !['AI', 'IT', 'AT', 'CT'].includes(w)) continue;
    if (STOP_WORDS.has(w.toLowerCase())) continue;

    counts[w] = (counts[w] || 0) + 1;
  }

  // 出現回数順にソート
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80);
}

/**
 * ワードクラウドシートに書き込み
 */
function writeWordCloudSheet_(ss, wordCounts, monthWords) {
  let sheet = ss.getSheetByName(CONFIG.SHEETS.WORDCLOUD);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(CONFIG.SHEETS.WORDCLOUD);
  }

  // メインワードクラウド
  const wcHeaders = ['ワード', '出現回数', 'フォントサイズ'];
  const maxCount = wordCounts.length > 0 ? wordCounts[0][1] : 1;

  const wcData = wordCounts.map(([word, count]) => [
    word,
    count,
    Math.round(12 + (count / maxCount) * 36)  // 12〜48ptのフォントサイズ
  ]);

  sheet.getRange(1, 1, 1, 3).setValues([wcHeaders]);
  if (wcData.length > 0) {
    sheet.getRange(2, 1, wcData.length, 3).setValues(wcData);
  }

  // 月別ワードクラウド（右側に配置）
  let colOffset = 5;
  const months = Object.keys(monthWords).sort();

  for (const month of months) {
    const texts = monthWords[month];
    const mWordCounts = extractWords_(texts.join(' ')).slice(0, 30);

    sheet.getRange(1, colOffset).setValue(`${month} ワード`);
    sheet.getRange(1, colOffset + 1).setValue('出現回数');

    if (mWordCounts.length > 0) {
      const mData = mWordCounts.map(([word, count]) => [word, count]);
      sheet.getRange(2, colOffset, mData.length, 2).setValues(mData);
    }

    colOffset += 3;
  }

  sheet.setFrozenRows(1);
  Logger.log(`Word cloud: ${wordCounts.length} words`);
}
