/** Web UI */
function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createTemplateFromFile("index")
    .evaluate()
    .setTitle("Schedule Add for Notion")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename: string): string {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** 列名マッピング（未設定時はデフォルト） */
function getColumnMapping(): NotionColumnMapping {
  const ps = PropertiesService.getScriptProperties();
  const raw = ps.getProperty("NOTION_COLUMN_MAP");
  const fallback: NotionColumnMapping = {
    title: "名前",
    date: "Date",
    status: "Status",
  };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<NotionColumnMapping>;
    return {
      title: parsed.title ?? fallback.title,
      date: parsed.date ?? fallback.date,
      status: parsed.status ?? fallback.status,
    };
  } catch {
    return fallback;
  }
}

/** 互換: 追加専用 */
function submitJsonToNotion(jsonInput: unknown): SubmitResult {
  return applyJsonToNotion(jsonInput, "create");
}

/** 追加 or 削除（archive）を実行 */
function applyJsonToNotion(
  jsonInput: unknown,
  action: "create" | "delete"
): SubmitResult {
  const dbId =
    PropertiesService.getScriptProperties().getProperty("DATABASE_ID");
  const token =
    PropertiesService.getScriptProperties().getProperty("NOTION_API_TOKEN");
  if (!dbId || !token)
    throw new Error(
      "スクリプトプロパティに NOTION_API_TOKEN / DATABASE_ID を設定してください。"
    );

  const rows: unknown[] = Array.isArray(jsonInput) ? jsonInput : [jsonInput];
  const validRows = rows.map((r, i) => {
    if (r && typeof r === "object") return r as Record<string, unknown>;
    throw new Error(`#${i}: JSONオブジェクトではありません`);
  });

  const map = getColumnMapping();
  const schema = getDbSchema_(dbId); // 追加時に使う（status/select判定）
  const out: SubmitResult["results"] = [];

  validRows.forEach((row, i) => {
    try {
      if (action === "delete") {
        const ids = findPageIdsForRow_(dbId, row, map);
        if (ids.length === 0) {
          out.push({ index: i, ok: false, error: "一致レコードなし" });
        } else {
          ids.forEach((id) => notionArchivePage_(id));
          out.push({ index: i, ok: true, id: ids.join(",") });
        }
      } else {
        const page = createPageFromGenericJson_(dbId, row, map, schema);
        out.push({ index: i, ok: true, id: page?.id });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      out.push({ index: i, ok: false, error: msg });
    }
  });

  return { ok: out.every((r) => r.ok), count: validRows.length, results: out };
}

/** デバッグ */
function debugProps(): void {
  const ps = PropertiesService.getScriptProperties();
  Logger.log("NOTION_API_TOKEN? %s", !!ps.getProperty("NOTION_API_TOKEN"));
  Logger.log("DATABASE_ID?      %s", !!ps.getProperty("DATABASE_ID"));
  Logger.log("NOTION_COLUMN_MAP=%s", ps.getProperty("NOTION_COLUMN_MAP"));
}
