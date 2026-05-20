/**
 * ====================================================================
 * WebApp ダッシュボード — サーバーサイド
 * ====================================================================
 * GAS WebAppとしてHTMLダッシュボードを公開する。
 * google.script.run 経由でクライアントからデータを取得する。
 *
 * デプロイ方法:
 *   1. Apps Script エディタ → 「デプロイ」→「新しいデプロイ」
 *   2. 種類: 「ウェブアプリ」
 *   3. 実行ユーザー: 「自分」
 *   4. アクセスできるユーザー: 「組織内の全員」または「リンクを知っている全員」
 *   5. 「デプロイ」をクリック → URLが発行される
 */

/**
 * WebAppエントリーポイント
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Dashboard')
    .setTitle('JPSA IT部会 勉強会アンケート分析')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ===== データ取得API =====

const DASHBOARD_META_ = Object.freeze({
  revision: 'sprint0-dashboard-config-meta-20260513',
  savedAt: '2026-05-13'
});

const DASHBOARD_CONFIG_ITEMS_ = Object.freeze([
  { key: 'nextApplicationRateTarget', label: '次回申込済率目標', defaultValue: 0.35 },
  { key: 'intentIncludedApplicationRateTarget', label: '意向込み申込率目標', defaultValue: 0.70 },
  { key: 'lineRegistrationRateTarget', label: 'LINE登録率目標', defaultValue: 0.85 },
  { key: 'averageAchievementLowerLimit', label: '平均達成度下限', defaultValue: 4.40 },
  { key: 'highSatisfactionAchievementScore', label: '高満足判定_目的達成度', defaultValue: 4 },
  { key: 'smallSegmentThreshold', label: '少数セグメント閾値', defaultValue: 5 },
  { key: 'monthOverMonthWarningPt', label: '前月比警告pt', defaultValue: 5 },
  { key: 'followUpCondition', label: '要フォロー条件', defaultValue: '高満足かつ次回申込未完了' }
]);

const DASHBOARD_PII_COLUMNS_ = Object.freeze([
  '氏名',
  'メールアドレス',
  '電話番号',
  '参加者キー',
  '紹介者名'
]);

function getDashboardConfig() {
  const ss = getDataSpreadsheet_();
  const sheetName = CONFIG.SHEETS.CONFIG;
  const sheet = ss.getSheetByName(sheetName);
  const configValues = {};

  if (sheet && sheet.getLastRow() > 1) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    rows.forEach(row => {
      const name = String(row[0] || '').trim();
      if (name) configValues[name] = row[1];
    });
  }

  const items = DASHBOARD_CONFIG_ITEMS_.map(item => {
    const hasValue = Object.prototype.hasOwnProperty.call(configValues, item.label) &&
      configValues[item.label] !== '' &&
      configValues[item.label] !== null &&
      configValues[item.label] !== undefined;
    const value = hasValue ? parseDashboardConfigValue_(configValues[item.label], item.defaultValue) : item.defaultValue;
    return {
      key: item.key,
      label: item.label,
      value: value,
      defaultValue: item.defaultValue,
      source: hasValue ? 'sheet' : 'default',
      missing: !hasValue
    };
  });

  const values = {};
  items.forEach(item => { values[item.key] = item.value; });

  return {
    sheetName: sheetName,
    sheetFound: !!sheet,
    items: items,
    values: values,
    generatedAt: formatDashboardTimestamp_(new Date())
  };
}

function getDashboardMeta() {
  return {
    revision: DASHBOARD_META_.revision,
    savedAt: DASHBOARD_META_.savedAt,
    generatedAt: formatDashboardTimestamp_(new Date())
  };
}

function parseDashboardConfigValue_(value, defaultValue) {
  if (typeof defaultValue === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : defaultValue;
  }
  return String(value || '').trim() || defaultValue;
}

function formatDashboardTimestamp_(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
}

/**
 * 全データを取得（フィルター適用前）
 */
function getFullData() {
  const ss = getDataSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);
  if (!sheet || sheet.getLastRow() <= 1) return { headers: [], rows: [] };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const keepIndexes = headers
    .map((header, index) => ({ header: String(header || '').trim(), index }))
    .filter(item => !DASHBOARD_PII_COLUMNS_.includes(item.header));
  const participantSourceIndexes = {
    key: headers.indexOf('参加者キー'),
    email: headers.indexOf('メールアドレス'),
    name: headers.indexOf('氏名'),
    phone: headers.indexOf('電話番号')
  };
  const namePatterns = buildDashboardNamePatterns_(data.slice(1), participantSourceIndexes.name);

  return {
    headers: keepIndexes.map(item => item.header).concat(['参加者ID']),
    rows: data.slice(1).map((row, rowIndex) => keepIndexes.map(item => {
      const cell = row[item.index];
      return cell instanceof Date ? Utilities.formatDate(cell, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss') : maskDashboardPublicText_(cell, namePatterns);
    }).concat([buildDashboardParticipantId_(row, rowIndex, participantSourceIndexes)]))
  };
}

function maskDashboardPublicText_(value, namePatterns) {
  let s = String(value === null || value === undefined ? '' : value);
  (namePatterns || []).forEach(name => {
    s = s.split(name).join('[氏名非表示]');
  });
  return s
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[メール非表示]')
    .replace(/(?:\+81[-\s]?)?0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}/g, '[電話番号非表示]')
    .replace(/([一-龥々ぁ-んァ-ンー]{1,8})(さん|さま|様|社長|シニア)/g, '[氏名非表示]');
}

function buildDashboardParticipantId_(row, rowIndex, indexes) {
  const raw = [indexes.key, indexes.email, indexes.name, indexes.phone]
    .filter(idx => idx >= 0)
    .map(idx => String(row[idx] || '').trim().toLowerCase())
    .filter(Boolean)
    .join('|') || `row:${rowIndex + 1}`;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return `participant:${Utilities.base64EncodeWebSafe(digest).slice(0, 16)}`;
}

function buildDashboardNamePatterns_(rows, nameIndex) {
  if (nameIndex < 0) return [];
  const names = {};
  const suffixes = ['さん', 'さま', '様', '氏', '先生', '講師', '代表', '社長', 'シニア'];
  const addName = name => {
    const safe = String(name || '').trim();
    if (safe.length < 2) return;
    names[safe] = true;
    suffixes.forEach(suffix => { names[safe + suffix] = true; });
  };
  rows.forEach(row => {
    const raw = String(row[nameIndex] || '').trim();
    if (raw.length < 2) return;
    addName(raw);
    const compact = raw.replace(/[ 　]/g, '');
    addName(compact);
    raw.split(/[ 　]+/).forEach(part => addName(part));
  });
  return Object.keys(names).sort((a, b) => b.length - a.length);
}

function buildDashboardNamePatternsFromProcessedSheet_() {
  const ss = getDataSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return buildDashboardNamePatterns_(data.slice(1), headers.indexOf('氏名'));
}

/**
 * サマリー統計を取得
 */
function getSummaryData() {
  const ss = getDataSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.SUMMARY);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

/**
 * 月次トレンドを取得
 */
function getTrendData() {
  const ss = getDataSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.MONTHLY_TREND);
  if (!sheet || sheet.getLastRow() <= 1) return { headers: [], rows: [] };

  const data = sheet.getDataRange().getValues();
  return { headers: data[0], rows: data.slice(1) };
}

/**
 * ワードクラウドデータを取得
 */
function getWordCloudData() {
  return [];
}

/**
 * 利用可能な月一覧を取得
 */
function getAvailableMonths() {
  const ss = getDataSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const monthIdx = headers.indexOf('開催月');
  if (monthIdx < 0) return [];

  const months = [...new Set(data.slice(1).map(r => normalizeMonthValue_(r[monthIdx])).filter(m => m && m !== '不明'))];
  return months.sort((a, b) => parseMonthLabelSortKey_(a) - parseMonthLabelSortKey_(b));
}

/**
 * フィルターオプション一覧を取得
 */
function getFilterOptions() {
  const ss = getDataSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);
  if (!sheet || sheet.getLastRow() <= 1) return {};

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);

  const getUnique = (colName) => {
    const idx = headers.indexOf(colName);
    if (idx < 0) return [];
    return [...new Set(rows.map(r => r[idx]).filter(v => v !== '' && v !== null && v !== undefined))]
      .map(v => String(v).trim())
      .filter(v => v)
      .sort();
  };

  const monthValues = [...new Set(getUnique('開催月').map(v => normalizeMonthValue_(v)).filter(v => v && v !== '不明'))]
    .sort((a, b) => parseMonthLabelSortKey_(a) - parseMonthLabelSortKey_(b));

  const studyStatusRaw = getUnique('頂点への道_受講状況');
  const studyStatus = [...studyStatusRaw];
  if (!studyStatus.includes('未受講以外')) studyStatus.push('未受講以外');

  return {
    months: monthValues,
    jobs: getUnique('職業'),
    channels: getUnique('認知経路'),
    purposes: getUnique('参加目的カテゴリ_主'),
    studyStatus: studyStatus,
    repeater: ['全員', 'リピーター', '初参加'],
    satisfaction: ['全て', '5', '4', '3', '2', '1']
  };
}

function getDataHealth() {
  const ss = getDataSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);
  if (!sheet || sheet.getLastRow() <= 1) {
    return {
      ok: false,
      message: '処理済みデータシートが未作成、またはデータ行がありません。',
      counts: {}
    };
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  const getCol = (name) => headers.indexOf(name);
  const countNonEmpty = (name) => {
    const idx = getCol(name);
    if (idx < 0) return 0;
    return rows.filter(r => r[idx] !== '' && r[idx] !== null && r[idx] !== undefined).length;
  };

  const counts = {
    totalRows: rows.length,
    months: countNonEmpty('開催月'),
    jobs: countNonEmpty('職業'),
    channels: countNonEmpty('認知経路'),
    studyStatus: countNonEmpty('頂点への道_受講状況')
  };

  const missing = [];
  ['開催月', '職業', '認知経路', '頂点への道_受講状況'].forEach(name => {
    if (getCol(name) < 0) missing.push(`列なし: ${name}`);
    else if (counts[name === '開催月' ? 'months' :
                   name === '職業' ? 'jobs' :
                   name === '認知経路' ? 'channels' : 'studyStatus'] === 0) {
      missing.push(`値なし: ${name}`);
    }
  });

  return {
    ok: missing.length === 0,
    message: missing.length === 0 ? 'データ健全性チェックOK' : `要確認: ${missing.join(', ')}`,
    counts: counts
  };
}

/**
 * 指定月の詳細分析データを取得
 */
function getMonthDetailData(targetMonth) {
  const ss = getDataSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);
  if (!sheet || sheet.getLastRow() <= 1) return null;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const allRows = data.slice(1);
  const col = (name) => headers.indexOf(name);
  const namePatterns = buildDashboardNamePatterns_(allRows, col('氏名'));

  const normalizedTarget = normalizeMonthValue_(targetMonth);
  const monthRows = allRows.filter(r => normalizeMonthValue_(r[col('開催月')]) === normalizedTarget);
  if (monthRows.length === 0) return null;

  // -- KPI --
  const allSat = allRows.map(r => Number(r[col('目的達成度')])).filter(n => !isNaN(n));
  const monthSat = monthRows.map(r => Number(r[col('目的達成度')])).filter(n => !isNaN(n));
  const allAvg = allSat.length ? allSat.reduce((a, b) => a + b, 0) / allSat.length : 0;
  const monthAvg = monthSat.length ? monthSat.reduce((a, b) => a + b, 0) / monthSat.length : 0;

  const kpi = {
    count: monthRows.length,
    totalCount: allRows.length,
    avgSatisfaction: monthAvg,
    totalAvgSatisfaction: allAvg,
    sat5Rate: monthSat.length ? (monthSat.filter(s => s === 5).length / monthSat.length * 100) : 0,
    totalSat5Rate: allSat.length ? (allSat.filter(s => s === 5).length / allSat.length * 100) : 0,
    lineRate: monthRows.length ? (monthRows.filter(r => r[col('LINE登録状況')] === '登録済み').length / monthRows.length * 100) : 0,
    nextRate: monthRows.length ? (monthRows.filter(r => r[col('次回申込状況')] === '登録済み').length / monthRows.length * 100) : 0,
    repeaterCount: monthRows.filter(r => r[col('リピーターフラグ')] === 'リピーター').length
  };

  // -- 分布 --
  const countBy = (colName) => {
    const counts = {};
    monthRows.forEach(r => {
      const v = r[col(colName)] || 'その他';
      counts[v] = (counts[v] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  // -- 満足度分布 --
  const satDist = [5, 4, 3, 2, 1].map(s => ({
    score: s,
    count: monthSat.filter(v => v === s).length
  }));

  // -- 受講歴分布 --
  const studyHistoryDistMap = {
    '未受講': 0,
    '受講済み': 0,
    'JPSA会員': 0,
    'その他': 0
  };
  monthRows.forEach(r => {
    const raw = String(r[col('頂点への道_受講状況')] || '').trim();
    const normalized = normalizeStudyStatusValue_(raw);
    studyHistoryDistMap[normalized] = (studyHistoryDistMap[normalized] || 0) + 1;
  });
  const studyHistoryDist = Object.entries(studyHistoryDistMap).filter(([, count]) => count > 0);

  // -- テキスト --
  const getTexts = (colName) => {
    const idx = col(colName);
    if (idx < 0) return [];
    return monthRows.map(r => r[idx]).filter(v => v && String(v).trim()).map(v => maskDashboardPublicText_(v, namePatterns));
  };

  // -- 月固有カラム --
  const specialCols = ['従業員数', 'AI社長サービス_興味', 'AIリーダーズクラブ_興味',
                       '特に学びになったこと', '深掘りリクエスト'];
  const specialData = {};
  for (const sc of specialCols) {
    const idx = col(sc);
    if (idx < 0) continue;
    const vals = monthRows.map(r => r[idx]).filter(v => v && String(v).trim()).map(v => maskDashboardPublicText_(v, namePatterns));
    if (vals.length > 0) specialData[sc] = vals;
  }

  // -- ワード頻度 --
  const textCols = ['参加目的', '実行アクション', '感想・メッセージ', '特に学びになったこと', '深掘りリクエスト'];
  let allText = '';
  for (const tc of textCols) {
    const idx = col(tc);
    if (idx < 0) continue;
    monthRows.forEach(r => {
      if (r[idx] && String(r[idx]).trim()) allText += ' ' + maskDashboardPublicText_(r[idx], namePatterns);
    });
  }
  allText = allText.replace(/\[(?:氏名|メール|電話番号)非表示\]/g, ' ');

  // Simple word extraction (mirrors extractWords_ logic)
  const wordCounts = {};
  const patterns = [
    /[ァ-ヶー]{2,}/g,
    /[a-zA-Z]{2,}/g,
    /AI|IT|DX|ICT/gi,
    /[\u4e00-\u9fff]{2,6}/g
  ];
  const stops = new Set(['する','いる','なる','ある','できる','思う','こと','もの','ため','よう',
    'それ','これ','あれ','どれ','この','その','あの','など','から','まで','について','として',
    'the','and','for','that','this','with','from','have','been']);
  const maskWords = new Set(['氏名非表示','メール非表示','電話番号非表示','非表示','氏名','電話番号']);

  for (const pat of patterns) {
    const matches = allText.match(pat) || [];
    for (const w of matches) {
      const lw = w.toLowerCase();
      if (!stops.has(lw) && !maskWords.has(w) && lw.length >= 2) {
        wordCounts[w] = (wordCounts[w] || 0) + 1;
      }
    }
  }
  const topWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 30);

  return {
    month: normalizedTarget,
    kpi: kpi,
    jobDist: countBy('職業'),
    channelDist: countBy('認知経路'),
    purposeDist: countBy('参加目的カテゴリ_主'),
    studyHistoryDist: studyHistoryDist,
    satDist: satDist,
    specialData: specialData,
    topWords: topWords,
    purposes: getTexts('参加目的'),
    actions: getTexts('実行アクション'),
    comments: getTexts('感想・メッセージ')
  };
}

function normalizeMonthValue_(value) {
  if (value instanceof Date && !isNaN(value)) {
    return normalizeMonthLabel_(value.getFullYear(), value.getMonth() + 1);
  }
  const s = String(value || '').trim();
  if (!s) return '';

  const m = s.match(/(\d{4})年\s*(\d{1,2})月/);
  if (m) return normalizeMonthLabel_(Number(m[1]), Number(m[2]));

  const iso = s.match(/(\d{4})[-\/](\d{1,2})(?:[-\/](\d{1,2}))?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/);
  if (iso) return normalizeMonthLabel_(Number(iso[1]), Number(iso[2]));

  const d = new Date(s);
  if (!isNaN(d)) return normalizeMonthLabel_(d.getFullYear(), d.getMonth() + 1);

  return s;
}

function normalizeStudyStatusValue_(value) {
  const s = String(value || '').trim();
  if (!s) return 'その他';
  if (s.includes('JPSA') || s.includes('会員')) return 'JPSA会員';
  if (s.includes('未受講')) return '未受講';
  if (s.includes('受講')) return '受講済み';
  return 'その他';
}

/**
 * VOCテキストをGeminiで要約
 * @param {{type:string,texts:string[],filters:Object}} payload
 * @returns {string}
 */
function generateGeminiVocSummary(payload) {
  const p = payload || {};
  const type = String(p.type || 'VOC').trim();
  const namePatterns = buildDashboardNamePatternsFromProcessedSheet_();
  const texts = Array.isArray(p.texts)
    ? p.texts.map(text => maskDashboardPublicText_(text, namePatterns)).map(t => t.trim()).filter(Boolean)
    : [];
  const filters = p.filters || {};

  if (!texts.length) return '対象テキストがないため要約を生成できませんでした。';

  const apiKey = requireGeminiApiKey_();
  const model = 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = buildVocSummaryPrompt_(type, texts, filters);

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 700
    }
  };

  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const raw = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error(`Gemini APIエラー (${code}): ${raw.slice(0, 400)}`);
  }

  const json = JSON.parse(raw || '{}');
  const candidates = json.candidates || [];
  if (!candidates.length) {
    throw new Error('Geminiから要約結果を取得できませんでした。');
  }

  const parts = (((candidates[0] || {}).content || {}).parts || []);
  const text = parts.map(p => p.text || '').join('\n').trim();
  if (!text) {
    throw new Error('Geminiの返却テキストが空でした。');
  }
  return text;
}

function buildVocSummaryPrompt_(type, texts, filters) {
  const filterLabel = compactFilterLabel_(filters);
  const samples = texts.slice(0, 120).map((t, i) => `${i + 1}. ${t}`).join('\n');
  return [
    'あなたは日本語のビジネスデータアナリストです。',
    `対象: ${type}`,
    `フィルタ条件: ${filterLabel}`,
    '',
    '以下の回答原文を分析し、次の構成で日本語で出力してください。',
    '1) 全体要約（3-4行）',
    '2) 主な傾向（最大5点、箇条書き）',
    '3) 改善提案（最大3点、実行しやすい順）',
    '',
    '注意:',
    '- 断定しすぎず、観測可能な範囲で要約する。',
    '- 回答者を特定できる情報は出さない。',
    '',
    '回答原文:',
    samples
  ].join('\n');
}

function compactFilterLabel_(filters) {
  const f = filters || {};
  const pairs = [
    ['開催月', f.month || '全て'],
    ['職業', f.job || '全て'],
    ['認知経路', f.channel || '全て'],
    ['受講状況', f.studyStatus || '全て'],
    ['参加者', f.repeater || '全員']
  ];
  return pairs.map(([k, v]) => `${k}=${v}`).join(', ');
}
