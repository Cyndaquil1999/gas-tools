// Discord Webhook URL
const DISCORD_WEBHOOK_URL: string | null =
  PropertiesService.getScriptProperties().getProperty("DISCORD_WEBHOOK_URL");

// Notion API トークンとデータベースID
const NOTION_API_TOKEN: string | null =
  PropertiesService.getScriptProperties().getProperty("NOTION_API_TOKEN");
const DATABASE_ID: string | null =
  PropertiesService.getScriptProperties().getProperty("DATABASE_ID");

// --- ざっくり型（必要最低限） ---
type NotionTitleProperty = {
  title?: Array<{ plain_text?: string }>;
};
type NotionDateProperty = {
  date?: { start?: string | null } | null;
};
type NotionRecord = {
  properties: {
    [key: string]: unknown;
    ["名前"]?: NotionTitleProperty;
    ["Date"]?: NotionDateProperty;
  };
};

// 指定した日付のタスクを取得
function getTasksForDate(targetDate: Date): NotionRecord[] {
  if (!DATABASE_ID) {
    Logger.log("DATABASE_ID が未設定です");
    return [];
  }
  if (!NOTION_API_TOKEN) {
    Logger.log("NOTION_API_TOKEN が未設定です");
    return [];
  }

  const url = `https://api.notion.com/v1/databases/${DATABASE_ID}/query`;

  // ターゲット日の開始と終了のUTC時間を計算
  const startOfDayUTC = new Date(
    Date.UTC(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate()
    )
  );
  const endOfDayUTC = new Date(startOfDayUTC);
  endOfDayUTC.setUTCHours(23, 59, 59, 999);

  // Notionに+09:00で投げる（末尾Zを落として付け替え）
  const start = startOfDayUTC.toISOString().slice(0, -1) + "+09:00";
  const end = endOfDayUTC.toISOString().slice(0, -1) + "+09:00";

  const payload = {
    filter: {
      and: [
        { property: "Date", date: { on_or_after: start } },
        { property: "Date", date: { before: end } },
      ],
    },
  };

  Logger.log("on_or_after: %s \t before: %s", start, end);

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

// 日付をフォーマット (時刻がない場合は「時刻未設定」)
function formatDate(dateString: string): string {
  if (!dateString) return "時刻未設定";
  const date = new Date(dateString);
  const isTimeIncluded = dateString.includes("T"); // 時刻情報があるか
  return isTimeIncluded
    ? Utilities.formatDate(date, "Asia/Tokyo", "yyyy/MM/dd HH:mm")
    : "時刻未設定";
}

// Discordにメッセージを送信
function sendToDiscord(records: NotionRecord[], targetDate: Date): void {
  // レコードを日付順（昇順）でソート
  const sortedRecords = records.sort((a: NotionRecord, b: NotionRecord) => {
    const aStart =
      (a.properties["Date"] as NotionDateProperty | undefined)?.date?.start ??
      null;
    const bStart =
      (b.properties["Date"] as NotionDateProperty | undefined)?.date?.start ??
      null;
    const dateA = aStart
      ? new Date(aStart).getTime()
      : Number.POSITIVE_INFINITY;
    const dateB = bStart
      ? new Date(bStart).getTime()
      : Number.POSITIVE_INFINITY;
    return dateA - dateB; // 昇順
  });

  const formattedDate = Utilities.formatDate(
    targetDate,
    "Asia/Tokyo",
    "yyyy/MM/dd"
  );
  let message = `**${formattedDate}のタスク（時系列順）:**\n`;

  if (sortedRecords.length === 0) {
    message += "タスクはありません。";
  } else {
    sortedRecords.forEach((record: NotionRecord, index: number) => {
      const properties = record.properties;
      const title =
        (properties["名前"] as NotionTitleProperty | undefined)?.title?.[0]
          ?.plain_text ?? "（無題）";
      const start =
        (properties["Date"] as NotionDateProperty | undefined)?.date?.start ??
        null;
      const date = start ? formatDate(start) : "日付未設定";
      message += `${index + 1}. **${title}**\t${date}\n`;
    });
  }

  Logger.log("送信するメッセージ: %s", message);

  const payload = { content: message };

  if (!DISCORD_WEBHOOK_URL) {
    Logger.log("DISCORD_WEBHOOK_URL が未設定です");
    return;
  }

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: "post" as GoogleAppsScript.URL_Fetch.HttpMethod,
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, options);
    Logger.log("Discord送信結果: %s", response.getContentText());
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    Logger.log("Discord送信エラー: %s", msg);
  }
}

// メイン処理
function sendNotionDataToDiscord(): void {
  const targetDate = new Date(); // 今日
  const records = getTasksForDate(targetDate);
  sendToDiscord(records, targetDate);
}
