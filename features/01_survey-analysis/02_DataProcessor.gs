/**
 * ====================================================================
 * データ前処理モジュール
 * ====================================================================
 * 生データのカラム正規化、カテゴリ分類、リピーター判定を実行
 */

// ===== カラムマッピング: 元のカラム名 → 正規化名 =====
const COLUMN_MAP = {
  'タイムスタンプ': 'タイムスタンプ',
  '参加した勉強会を選択してください': '勉強会名',
  'メールアドレス': 'メールアドレス',
  'お名前': '氏名',
  '電話番号': '電話番号',
  'どのようにして本イベントを知りましたか？': '認知経路_原文',
  'お知り合いの方からのご紹介の場合、ご紹介者の方のお名前をご記入ください。': '紹介者名',
  'あなたの職業を教えてください': '職業',
  'その他を選択した方はご記入をお願いします。': '職業_その他',
  '今回参加した目的をご記載ください': '参加目的',
  'その目的の達成度を教えて下さい。': '目的達成度',
  '今日の勉強会から実行すると決められたことを一言お聞きください。': '実行アクション',
  'ご感想・講師へのメッセージがあればぜひご記入お願いします。': '感想・メッセージ',
  '特に学びになったことがあれば教えてください。': '特に学びになったこと',
  '会社の従業員数を教えてください。': '従業員数',
  'もっと聞きたかったこと・深掘りしてほしかったことがあれば教えてください。': '深掘りリクエスト',
};

// 部分一致で検索するカラム（質問文にURLが含まれるため完全一致できない）
const PARTIAL_COLUMN_MAP = {
  'LINE': 'LINE登録状況',
  'Facebook': 'Facebook登録状況',
  '頂点への道.*受講': '頂点への道_受講状況',
  '頂点への道.*（3日間）': '頂点への道_今後の意向',
  '次回への申込': '次回申込状況',
  'AI社長サービス': 'AI社長サービス_興味',
  'AIリーダーズクラブ': 'AIリーダーズクラブ_興味',
};

// ===== 出力カラム順序 =====
const OUTPUT_COLUMNS = [
  'タイムスタンプ', '開催月', '勉強会名', '開催イベント', '氏名', 'メールアドレス', '電話番号',
  '参加者キー', '参加回数累計', '参加月数', '初参加月', '最新参加月', 'リピーター頻度帯',
  '認知経路', '認知経路_原文', '紹介者名',
  'LINE登録状況', 'Facebook登録状況', '次回申込状況',
  '頂点への道_受講状況', '頂点への道_今後の意向',
  '職業', '職業_その他', '従業員数',
  '参加目的', '参加目的カテゴリ_主', '参加目的カテゴリ_全', '目的達成度',
  '実行アクション', '実行アクションカテゴリ',
  '感想・メッセージ', '特に学びになったこと', '深掘りリクエスト',
  'AI社長サービス_興味', 'AIリーダーズクラブ_興味',
  'リピーターフラグ'
];

/**
 * 生データの前処理メイン関数
 */
function preprocessData_(headers, rows) {
  // カラムインデックスのマッピングを構築
  const colIndex = buildColumnIndex_(headers);

  // 全行を処理
  const processedRows = rows.map(row => {
    const record = extractRecord_(row, colIndex);
    enrichRecord_(record);
    return record;
  });

  // リピーター判定（全行が必要）
  markRepeaters_(processedRows);

  return {
    headers: OUTPUT_COLUMNS,
    rows: processedRows
  };
}

/**
 * カラムインデックスの構築
 */
function buildColumnIndex_(headers) {
  const index = {};

  headers.forEach((header, i) => {
    const headerStr = String(header).trim();

    // 完全一致チェック
    for (const [key, value] of Object.entries(COLUMN_MAP)) {
      if (headerStr === key || headerStr.startsWith(key)) {
        index[value] = i;
      }
    }

    // 部分一致チェック
    for (const [pattern, value] of Object.entries(PARTIAL_COLUMN_MAP)) {
      if (new RegExp(pattern).test(headerStr)) {
        index[value] = i;
      }
    }
  });

  Logger.log('Column mapping: ' + JSON.stringify(index));
  return index;
}

/**
 * 1行分のデータを抽出
 */
function extractRecord_(row, colIndex) {
  const record = {};

  for (const [name, idx] of Object.entries(colIndex)) {
    let value = row[idx];
    if (value instanceof Date) {
      record[name] = value;
    } else if (value === '' || value === undefined || value === null) {
      record[name] = '';
    } else {
      record[name] = String(value).trim();
    }
  }

  return record;
}

/**
 * レコードにカテゴリ分類等の付加情報を追加
 */
function enrichRecord_(record) {
  // 開催月の抽出
  record['開催月'] = extractMonth_(record['勉強会名'] || '', record['タイムスタンプ']);
  record['開催イベント'] = normalizeEventLabel_(record['勉強会名'] || '');

  // 認知経路の簡略化
  record['認知経路'] = simplifyChannel_(record['認知経路_原文'] || '');

  // 基本項目の空値補完（フィルター選択肢が空になることを防ぐ）
  record['職業'] = record['職業'] || '未回答';
  record['頂点への道_受講状況'] = record['頂点への道_受講状況'] || '未回答';
  record['頂点への道_今後の意向'] = record['頂点への道_今後の意向'] || '未回答';
  record['LINE登録状況'] = record['LINE登録状況'] || '未回答';
  record['Facebook登録状況'] = record['Facebook登録状況'] || '未回答';
  record['次回申込状況'] = record['次回申込状況'] || '未回答';

  // 参加目的のカテゴリ分類
  const purposeCats = categorizePurpose_(record['参加目的'] || '');
  record['参加目的カテゴリ_主'] = purposeCats[0] || 'その他';
  record['参加目的カテゴリ_全'] = purposeCats.join(', ') || 'その他';

  // 実行アクションのカテゴリ分類
  record['実行アクションカテゴリ'] = categorizeAction_(record['実行アクション'] || '');

  // 参加者関連派生列は後で一括処理
  record['参加者キー'] = '';
  record['参加回数累計'] = 0;
  record['参加月数'] = 0;
  record['初参加月'] = '';
  record['最新参加月'] = '';
  record['リピーター頻度帯'] = '';
  record['リピーターフラグ'] = '';
}

/**
 * 勉強会名から開催月を抽出
 */
function extractMonth_(eventName, timestamp) {
  const text = String(eventName || '').trim();

  // 1) 勉強会名に「YYYY年M月」がある場合
  let m = text.match(/(\d{4})年\s*(\d{1,2})月/);
  if (m) return normalizeMonthLabel_(Number(m[1]), Number(m[2]));

  // 2) 勉強会名に「M月」のみある場合はタイムスタンプ年を補完
  m = text.match(/(\d{1,2})月/);
  if (m) {
    const month = Number(m[1]);
    const year = (timestamp instanceof Date && !isNaN(timestamp)) ?
      timestamp.getFullYear() : new Date().getFullYear();
    return normalizeMonthLabel_(year, month);
  }

  // 3) タイムスタンプから算出
  if (timestamp instanceof Date && !isNaN(timestamp)) {
    return normalizeMonthLabel_(timestamp.getFullYear(), timestamp.getMonth() + 1);
  }

  return '不明';
}

function normalizeMonthLabel_(year, month) {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return '不明';
  if (month < 1 || month > 12) return '不明';
  return `${year}年${month}月`;
}

function parseMonthLabelSortKey_(label) {
  const m = String(label || '').match(/(\d{4})年(\d{1,2})月/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * 100 + Number(m[2]);
}

/**
 * 認知経路の簡略化
 */
function simplifyChannel_(text) {
  if (!text) return '不明';
  if (text.includes('JPSA') && text.includes('紹介')) return 'JPSA紹介';
  if (text.includes('アチーブメント')) return 'AT社員紹介';
  if (text.includes('前回')) return '前回の案内';
  if (text.includes('SNS')) return 'SNS';
  return 'その他';
}

/**
 * 参加目的のカテゴリ分類（複数カテゴリ対応）
 */
function categorizePurpose_(text) {
  if (!text) return ['未回答'];

  const t = text.toLowerCase();
  const cats = [];

  const rules = [
    { cat: 'IT/AI学習', keywords: ['ai', 'it', '学び', '学ぶ', '勉強', '技術', 'テクノロジー', '知識', 'notebooklm', 'ツール', 'デジタル', 'テック'] },
    { cat: 'ビジネス活用', keywords: ['ビジネス', '事業', '業務', '活用', '経営', '売上', '効率', '導入', '課題', '会社', 'サービス', '顧客', '仕事'] },
    { cat: '自己成長', keywords: ['成長', '目標', '理念', '自分', '挑戦', '向上', '人生', '志', '覚悟'] },
    { cat: '部会支援', keywords: ['運営', '部会', 'お祝い', '設立', '応援', 'サポート', 'jpsa', '発展', '貢献'] },
    { cat: 'ネットワーキング', keywords: ['人脈', 'つながり', '交流', '仲間', 'ネットワーク', '紹介', 'コミュニティ'] },
    { cat: '興味・好奇心', keywords: ['興味', '好奇心', '面白', '楽しみ', '好き', '気になる'] },
  ];

  for (const rule of rules) {
    if (rule.keywords.some(kw => t.includes(kw))) {
      cats.push(rule.cat);
    }
  }

  return cats.length > 0 ? cats : ['その他'];
}

/**
 * 実行アクションのカテゴリ分類
 */
function categorizeAction_(text) {
  if (!text) return '未回答';

  const t = text.toLowerCase();
  const rules = [
    { cat: 'AI/ツール活用', keywords: ['ai', 'chatgpt', 'claude', 'notebooklm', 'notebook', 'nlm', 'ツール', '生成', 'プロンプト', 'gemini', 'copilot'] },
    { cat: '業務への導入', keywords: ['社内', '共有', '導入', '業務', '提案', '仕事', 'マニュアル', '会社'] },
    { cat: '継続参加', keywords: ['参加', '次回', '申込', '継続'] },
    { cat: '学習継続', keywords: ['学', '勉強', '知識', '理解', '調べ', '情報', '研究'] },
    { cat: '自己実践', keywords: ['理念', '目的', '目標', '自分', '人生', '決意', '素直', '実践', '挑戦', '覚悟', '行動'] },
  ];

  for (const rule of rules) {
    if (rule.keywords.some(kw => t.includes(kw))) return rule.cat;
  }
  return 'その他';
}

/**
 * リピーター判定（メールアドレスで複数月参加を検出）
 */
function markRepeaters_(records) {
  const grouped = {};

  records.forEach((r, idx) => {
    const key = buildParticipantKey_(r, idx + 1);
    r['参加者キー'] = key;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

  Object.values(grouped).forEach(groupRows => {
    groupRows.sort(compareParticipantRecordOrder_);
    const months = [...new Set(groupRows.map(r => String(r['開催月'] || '').trim()).filter(Boolean))];
    const firstMonth = months.slice().sort((a, b) => parseMonthLabelSortKey_(a) - parseMonthLabelSortKey_(b))[0] || '';
    const latestMonth = months.slice().sort((a, b) => parseMonthLabelSortKey_(b) - parseMonthLabelSortKey_(a))[0] || '';
    const totalCount = groupRows.length;
    const monthCount = months.length;
    const freqBand = toRepeatFrequencyBand_(totalCount);

    groupRows.forEach((row, idx) => {
      row['参加回数累計'] = idx + 1;
      row['参加月数'] = monthCount;
      row['初参加月'] = firstMonth;
      row['最新参加月'] = latestMonth;
      row['リピーター頻度帯'] = freqBand;
      row['リピーターフラグ'] = totalCount > 1 ? 'リピーター' : '初回参加';
    });
  });
}

function normalizeEventLabel_(name) {
  const s = String(name || '').replace(/\s+/g, ' ').trim();
  return s || '不明';
}

function buildParticipantKey_(record, fallbackIndex) {
  const email = normalizeEmailForKey_(record['メールアドレス']);
  if (email) return `email:${email}`;

  const name = normalizeNameForKey_(record['氏名']);
  const phone = normalizePhoneForKey_(record['電話番号']);
  if (name || phone) return `profile:${name || 'unknown'}|${phone || 'unknown'}`;

  const ts = record['タイムスタンプ'] instanceof Date && !isNaN(record['タイムスタンプ'])
    ? Utilities.formatDate(record['タイムスタンプ'], 'Asia/Tokyo', 'yyyyMMddHHmmss')
    : String(record['タイムスタンプ'] || '').trim();
  const month = String(record['開催月'] || '').trim() || '不明';
  return `anonymous:${month}:${ts || 'na'}:${fallbackIndex}`;
}

function normalizeEmailForKey_(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email === '未回答') return '';
  return email;
}

function normalizeNameForKey_(value) {
  return String(value || '').replace(/[ 　]/g, '').trim();
}

function normalizePhoneForKey_(value) {
  return String(value || '').replace(/[^\d]/g, '').trim();
}

function compareParticipantRecordOrder_(a, b) {
  const am = parseMonthLabelSortKey_(a['開催月']);
  const bm = parseMonthLabelSortKey_(b['開催月']);
  if (am !== bm) return am - bm;

  const at = toTimestampNumber_(a['タイムスタンプ']);
  const bt = toTimestampNumber_(b['タイムスタンプ']);
  return at - bt;
}

function toTimestampNumber_(value) {
  if (value instanceof Date && !isNaN(value)) return value.getTime();
  const d = new Date(value);
  if (!isNaN(d)) return d.getTime();
  return Number.MAX_SAFE_INTEGER;
}

function toRepeatFrequencyBand_(count) {
  const n = Number(count) || 0;
  if (n >= 4) return '4回以上';
  if (n === 3) return '3回';
  if (n === 2) return '2回';
  return '1回';
}

/**
 * 処理済みデータをシートに書き込み
 */
function writeProcessedSheet_(ss, processed) {
  let sheet = ss.getSheetByName(CONFIG.SHEETS.PROCESSED);
  if (sheet) {
    removeSheetFilter_(sheet);
    sheet.clear();
  } else {
    sheet = ss.insertSheet(CONFIG.SHEETS.PROCESSED);
  }

  // ヘッダー書き込み
  sheet.getRange(1, 1, 1, processed.headers.length).setValues([processed.headers]);

  // データ書き込み
  if (processed.rows.length > 0) {
    const data = processed.rows.map(record =>
      processed.headers.map(col => {
        const val = record[col];
        if (val instanceof Date) return val;
        return val !== undefined && val !== null ? val : '';
      })
    );
    sheet.getRange(2, 1, data.length, data[0].length).setValues(data);
  }

  // フリーズ & フィルター
  sheet.setFrozenRows(1);
  if (processed.rows.length > 0) {
    removeSheetFilter_(sheet);
    sheet.getRange(1, 1, processed.rows.length + 1, processed.headers.length)
      .createFilter();
  }

  Logger.log(`Processed sheet: ${processed.rows.length} rows written`);
}

function removeSheetFilter_(sheet) {
  const filter = sheet.getFilter();
  if (filter) {
    filter.remove();
  }
}
