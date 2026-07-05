// ダイブコンピューターCSVのパースと照合（lib/csv_import.py の移植）
// エンコーディングは shift_jis(cp932) → utf-8 の順で試す。

/** クォート対応の素朴なCSVパーサ（1文字ずつ走査） */
function parseCsvText(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function decodeBytes(buf) {
  for (const enc of ["shift_jis", "utf-8"]) {
    try {
      const text = new TextDecoder(enc, { fatal: true }).decode(buf);
      return text;
    } catch { /* 次のエンコーディングを試す */ }
  }
  // fatalなしのutf-8で最後のフォールバック
  return new TextDecoder("utf-8").decode(buf);
}

function parseDt(s) {
  const m = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (!m) throw new Error(`日時フォーマット不明: ${s}`);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

const pad = n => String(n).padStart(2, "0");
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function parseDepth(raw) {
  if (!raw) return [];
  try {
    const val = JSON.parse(raw.replace(/'/g, '"'));   // Pythonリスト表記 [1, 2.5, ...] に対応
    return Array.isArray(val) ? val.map(Number).filter(v => !Number.isNaN(v)) : [];
  } catch { return []; }
}

const toFloat = s => {
  const v = parseFloat(String(s ?? "").trim());
  return Number.isNaN(v) ? null : v;
};

/** CSVバイト列 → ダイブ辞書の配列 */
export function parseDiveCsv(arrayBuffer) {
  const rows = parseCsvText(decodeBytes(arrayBuffer));
  if (rows.length < 2) return [];

  const header = rows[0].map(h => h.trim());
  const idx = name => header.indexOf(name);
  const get = (row, name) => { const i = idx(name); return i >= 0 ? (row[i] ?? "").trim() : ""; };

  const dives = [];
  for (const row of rows.slice(1)) {
    const entryStr = get(row, "エントリー時刻");
    const exitStr  = get(row, "エキジット時刻") || get(row, "エグジット時刻");
    if (!entryStr) continue;

    const entryDt = parseDt(entryStr);
    const exitDt  = exitStr ? parseDt(exitStr) : null;
    const duration = exitDt ? Math.round((exitDt - entryDt) / 60000) : null;

    dives.push({
      computer_id: get(row, "ID"),
      date:        fmtDate(entryDt),
      start_time:  fmtTime(entryDt),
      end_time:    exitDt ? fmtTime(exitDt) : "",
      duration,
      max_depth:   toFloat(get(row, "最大水深")),
      avg_depth:   toFloat(get(row, "平均水深")),
      water_temp:  toFloat(get(row, "最深水温")),
      warning:     get(row, "警告"),
      depth_profile: parseDepth(get(row, "深度")),
      location:    get(row, "場所"),
      point:       get(row, "ポイント名"),
    });
  }
  return dives;
}

/**
 * 照合プラン作成（まだ更新しない）。
 * 同日のCSV行と「Max Depth未入力」のダイブを出現順（本数順）で1対1に対応させる。
 * findUnmatched: (date) => Promise<dive[]>
 */
export async function buildMatchPlan(csvDives, findUnmatched) {
  const byDate = new Map();
  for (const d of csvDives) {
    if (!byDate.has(d.date)) byDate.set(d.date, []);
    byDate.get(d.date).push(d);
  }

  const plan = [];
  for (const [date, list] of byDate) {
    const targets = await findUnmatched(date);
    list.forEach((csvDive, i) => {
      plan.push({
        csv:    csvDive,
        target: targets[i] ?? null,   // null = 対応するNotion側エントリなし
      });
    });
  }
  return plan;
}
