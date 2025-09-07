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
