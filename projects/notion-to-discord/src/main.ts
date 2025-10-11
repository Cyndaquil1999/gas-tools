/** =========================
 * Notion → Discord 通知 (A方式: COLUMN MAP を Script Properties で管理)
 * =========================
 * 必須 Script Properties:
 *  - NOTION_API_TOKEN
 *  - DATABASE_ID
 *  - DISCORD_WEBHOOK_URL
 *  - NOTION_COLUMN_MAP  ← JSONでプロパティ名マッピングを保存
 *
 * 例: NOTION_COLUMN_MAP
 * {
 *   "title": "名前",
 *   "date": "Date",
 *   "status": "Status",
 *   "tags": "Tags",
 *   "description": "Description",
 *   "url": "URL"
 * }
 */

// ===== 型（最小限） =====
type NotionTitleProperty = { title?: Array<{ plain_text?: string }> };
type NotionDateProperty = { date?: { start?: string | null } | null };
type NotionRecord = {
  properties: { [key: string]: any };
};

// ===== 環境変数 =====
const DISCORD_WEBHOOK_URL: string | null =
  PropertiesService.getScriptProperties().getProperty("DISCORD_WEBHOOK_URL");
const NOTION_API_TOKEN: string | null =
  PropertiesService.getScriptProperties().getProperty("NOTION_API_TOKEN");
const DATABASE_ID: string | null =
  PropertiesService.getScriptProperties().getProperty("DATABASE_ID");

// ===== カラムマッピング（A方式）=====
type ColumnMapping = {
  title: string; // Notionのtitle系プロパティ（表示名）
  date: string; // 日付プロパティ（表示名）
  status?: string;
  tags?: string;
  description?: string;
  url?: string;
};


// ===== 追加: 最小のエスケープ =====
function escapeHtml(s: any): string {
  const str = String(s ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ===== 追加: HTML整形（今日のタスクをカード表示） =====
function buildHtml(records: NotionRecord[], targetDate: Date): GoogleAppsScript.HTML.HtmlOutput {
  const map = getColumnMapping();
  const day = Utilities.formatDate(targetDate, "Asia/Tokyo", "yyyy/MM/dd (EEE)");

  // 時刻昇順（未設定は末尾）
  const sorted = records.slice().sort((a, b) => {
    const aStart = (a.properties?.[map.date]?.date?.start) ?? null;
    const bStart = (b.properties?.[map.date]?.date?.start) ?? null;
    const ta = aStart ? new Date(aStart).getTime() : Number.POSITIVE_INFINITY;
    const tb = bStart ? new Date(bStart).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  const items = sorted.map((rec, i) => {
    const title = (rec.properties?.[map.title]?.title?.[0]?.plain_text) ?? "（無題）";
    const start = (rec.properties?.[map.date]?.date?.start) ?? null;
    const time  = start ? Utilities.formatDate(new Date(start), "Asia/Tokyo", "HH:mm") : "—";
    // Notionページ直URL（top-level url 優先、なければ列）
    const pageUrl = (rec as any)?.url ?? (map.url ? (rec.properties?.[map.url]?.url ?? "") : "");
    const linkOpen = pageUrl ? `<a href="${escapeHtml(pageUrl)}" target="_blank" rel="noopener">` : "";
    const linkClose = pageUrl ? `</a>` : "";

    return `
      <li class="item">
        <div class="time">${escapeHtml(time)}</div>
        <div class="title">${linkOpen}${escapeHtml(title)}${linkClose}</div>
      </li>
    `;
  }).join("");

  const empty = `
    <div class="empty">
      <div class="emoji">✅</div>
      <div>本日タスクはありません</div>
    </div>
  `;

  const html = `
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(day)} のタスク</title>
<style>
  :root { --bg:#0b0b0c; --card:#141416; --fg:#e9eaec; --sub:#a4a7ae; --accent:#4da3ff; --border:#26272b; }
  @media (prefers-color-scheme: light) {
    :root { --bg:#f7f7f8; --card:#ffffff; --fg:#0c0d10; --sub:#5b5f67; --accent:#007aff; --border:#e6e7ea; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg);
    font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans JP","Helvetica Neue",Arial,sans-serif;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  }
  .wrap { padding:20px 16px 28px; max-width:720px; margin:0 auto; }
  .header { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:16px; }
  h1 { font-size:20px; margin:0; }
  .date { color:var(--sub); font-size:13px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:8px; }
  ul.list { list-style:none; padding:0; margin:0; }
  .item { display:grid; grid-template-columns:64px 1fr; gap:8px; padding:12px; border-radius:10px; }
  .item + .item { border-top:1px solid var(--border); }
  .time { font-variant-numeric:tabular-nums; color:var(--sub); width:56px; text-align:right; }
  .title a { color:var(--fg); text-decoration:none; }
  .title a:hover { color:var(--accent); text-decoration:underline; }
  .empty { text-align:center; color:var(--sub); padding:32px 12px; }
  .emoji { font-size:28px; margin-bottom:8px; }
  .foot { margin-top:14px; display:flex; justify-content:space-between; align-items:center; color:var(--sub); font-size:12px; padding:0 4px; }
  .btns { display:flex; gap:8px; }
  button { background:var(--card); color:var(--fg); border:1px solid var(--border); border-radius:10px; padding:8px 12px; font-size:14px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>今日のタスク</h1>
      <div class="date">${escapeHtml(day)}</div>
    </div>

    <div class="card">
      ${records.length ? `<ul class="list">${items}</ul>` : empty}
    </div>

    <div class="foot">
      <div>${records.length}件</div>
      <div class="btns">
        <button onclick="location.reload()">更新</button>
        <button onclick="window.history.length>1?history.back():location.reload()">戻る</button>
      </div>
    </div>
  </div>
</body>
</html>`;
  return HtmlService.createHtmlOutput(html).setTitle(`${day}のタスク`);
}




// ===== 追加: 公開GET用トークン（任意） =====
const PUBLIC_GET_TOKEN: string | null =
  PropertiesService.getScriptProperties().getProperty("PUBLIC_GET_TOKEN");

// ===== 追加: テキスト出力（時系列＋URL付き）=====
function buildText(records: NotionRecord[], targetDate: Date): string {
  const map = getColumnMapping();
  const day = Utilities.formatDate(targetDate, "Asia/Tokyo", "yyyy/MM/dd");
  if (!records.length) return `**${day} のタスク**\nなし`;

  // 既存の送信と同じく日付昇順（未設定は末尾）
  const sorted = records.slice().sort((a, b) => {
    const aStart =
      (a.properties[map.date] as NotionDateProperty | undefined)?.date?.start ?? null;
    const bStart =
      (b.properties[map.date] as NotionDateProperty | undefined)?.date?.start ?? null;
    const ta = aStart ? new Date(aStart).getTime() : Number.POSITIVE_INFINITY;
    const tb = bStart ? new Date(bStart).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  const lines = sorted.map((rec, i) => {
    const title =
      (rec.properties[map.title] as NotionTitleProperty | undefined)?.title?.[0]?.plain_text ??
      "（無題）";
    const start =
      (rec.properties[map.date] as NotionDateProperty | undefined)?.date?.start ?? null;
    const dateStr = start ? formatDate(start) : "日付未設定";
    // Notionのページ直URL（APIの top-level url があればそれ優先）
    const pageUrl =
      // @ts-ignore: Notionのレスポンスはページ直URLを top-level url に持つ
      (rec as any)?.url ??
      (map.url ? (rec.properties[map.url]?.url ?? null) : null);
    const urlPart = pageUrl ? `  ${pageUrl}` : "";
    return `${i + 1}. ${title}\t${dateStr}${urlPart}`;
  });

  return `**${day} のタスク（時系列）**\n` + lines.join("\n");
}

// ===== 追加: JSON簡略整形 =====
function toSlimJson(records: NotionRecord[]) {
  const map = getColumnMapping();
  return records.map((rec) => {
    const title =
      (rec.properties[map.title] as NotionTitleProperty | undefined)?.title?.[0]?.plain_text ??
      "（無題）";
    const start =
      (rec.properties[map.date] as NotionDateProperty | undefined)?.date?.start ?? null;
    const url =
      // @ts-ignore
      (rec as any)?.url ?? (map.url ? (rec.properties[map.url]?.url ?? null) : null);
    // @ts-ignore
    const id = (rec as any)?.id ?? null;
    return { id, title, start, url };
  });
}

// ===== 差し替え: 公開 GET エンドポイント（既定: html） =====
function doGet(e: GoogleAppsScript.Events.DoGet) {
  try {
    // 簡易認証
    const token = e?.parameter?.token ?? "";
    if (PUBLIC_GET_TOKEN && token !== PUBLIC_GET_TOKEN) {
      return HtmlService.createHtmlOutput("<h3>Forbidden</h3>");
    }

    // ?date=YYYY-MM-DD（省略時は今日 in JST）
    let targetDate = new Date();
    const dateParam = e?.parameter?.date;
    if (dateParam) {
      const [y, m, d] = dateParam.split("-").map(Number);
      targetDate = new Date(y, (m - 1), d);
    }

    const records = getTasksForDate(targetDate);
    const format = (e?.parameter?.format ?? "html").toLowerCase();

    if (format === "json") {
      const out = JSON.stringify({
        date: Utilities.formatDate(targetDate, "Asia/Tokyo", "yyyy-MM-dd"),
        count: records.length,
        tasks: toSlimJson(records),
      });
      return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
    }

    if (format === "text") {
      const text = buildText(records, targetDate);
      return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
    }

    // 既定: HTML
    return buildHtml(records, targetDate);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return HtmlService.createHtmlOutput(`<pre>ERROR: ${escapeHtml(msg)}</pre>`);
  }
}


function getColumnMapping(): ColumnMapping {
  const ps = PropertiesService.getScriptProperties();
  const raw = ps.getProperty("NOTION_COLUMN_MAP");

  // デフォルト（保険）
  const fallback: ColumnMapping = {
    title: "名前",
    date: "Date",
    status: "Status",
    tags: "Tags",
    description: "Description",
    url: "URL",
  };

  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    // 想定外のキーは無視しつつ上書き
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

// ===== Notion クエリ（指定日付のタスク取得）=====
function getTasksForDate(targetDate: Date): NotionRecord[] {
  if (!DATABASE_ID) {
    Logger.log("DATABASE_ID が未設定です");
    return [];
  }
  if (!NOTION_API_TOKEN) {
    Logger.log("NOTION_API_TOKEN が未設定です");
    return [];
  }

  const map = getColumnMapping();

  const url = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;

  // ターゲット日の 00:00:00.000〜23:59:59.999 (UTC基準) を +09:00 として投げる
  const startOfDayUTC = new Date(
    Date.UTC(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate()
    )
  );
  const endOfDayUTC = new Date(startOfDayUTC);
  endOfDayUTC.setUTCHours(23, 59, 59, 999);

  const start = startOfDayUTC.toISOString().slice(0, -1) + "+09:00";
  const end = endOfDayUTC.toISOString().slice(0, -1) + "+09:00";

  const payload = {
    filter: {
      and: [
        { property: map.date, date: { on_or_after: start } },
        { property: map.date, date: { before: end } },
      ],
    },
  };

  Logger.log(
    "Filter: on_or_after=%s  before=%s  (prop=%s)",
    start,
    end,
    map.date
  );

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post" as GoogleAppsScript.URL_Fetch.HttpMethod,
    headers: {
      Authorization: `Bearer ${NOTION_API_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText()) as {
      results?: NotionRecord[];
    };
    return data.results ?? [];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.log("Notion APIエラー: %s", msg);
    return [];
  }
}

// ===== 日付フォーマット（時刻が無ければ「時刻未設定」）=====
function formatDate(dateString: string): string {
  if (!dateString) return "時刻未設定";
  const isTimeIncluded = dateString.includes("T");
  if (!isTimeIncluded) return "時刻未設定";
  const d = new Date(dateString);
  return Utilities.formatDate(d, "Asia/Tokyo", "yyyy/MM/dd HH:mm");
}

// ===== Discordへ送信 =====
function sendToDiscord(records: NotionRecord[], targetDate: Date): void {
  const map = getColumnMapping();

  // 日付昇順ソート（start未設定は末尾へ）
  const sortedRecords = records.sort((a, b) => {
    const aStart =
      (a.properties[map.date] as NotionDateProperty | undefined)?.date?.start ??
      null;
    const bStart =
      (b.properties[map.date] as NotionDateProperty | undefined)?.date?.start ??
      null;
    const ta = aStart ? new Date(aStart).getTime() : Number.POSITIVE_INFINITY;
    const tb = bStart ? new Date(bStart).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  const day = Utilities.formatDate(targetDate, "Asia/Tokyo", "yyyy/MM/dd");
  let message = `**${day}のタスク（時系列順）:**\n`;

  if (sortedRecords.length === 0) {
    message += "タスクはありません。";
  } else {
    sortedRecords.forEach((rec, idx) => {
      const title =
        (rec.properties[map.title] as NotionTitleProperty | undefined)
          ?.title?.[0]?.plain_text ?? "（無題）";
      const start =
        (rec.properties[map.date] as NotionDateProperty | undefined)?.date
          ?.start ?? null;
      const dateStr = start ? formatDate(start) : "日付未設定";
      message += `${idx + 1}. **${title}**\t${dateStr}\n`;
    });
  }

  Logger.log("送信するメッセージ: %s", message);

  if (!DISCORD_WEBHOOK_URL) {
    Logger.log("DISCORD_WEBHOOK_URL が未設定です");
    return;
  }

  const payload = { content: message };
  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post" as GoogleAppsScript.URL_Fetch.HttpMethod,
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const resp = UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, options);
    Logger.log("Discord送信結果: %s", resp.getContentText());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.log("Discord送信エラー: %s", msg);
  }
}

// ===== メイン処理 =====
function sendNotionDataToDiscord(): void {
  const targetDate = new Date();
  const records = getTasksForDate(targetDate);
  sendToDiscord(records, targetDate);
}

// ===== デバッグ補助（任意）=====
function debugProps(): void {
  const ps = PropertiesService.getScriptProperties();
  Logger.log("WEBHOOK   = %s", !!ps.getProperty("DISCORD_WEBHOOK_URL"));
  Logger.log("NOTION    = %s", !!ps.getProperty("NOTION_API_TOKEN"));
  Logger.log("DB        = %s", !!ps.getProperty("DATABASE_ID"));
  Logger.log("COL MAP   = %s", ps.getProperty("NOTION_COLUMN_MAP"));
}
