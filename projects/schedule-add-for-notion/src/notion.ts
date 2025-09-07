/** =========================
 * Notion API 呼び出し & JSON→properties 変換
 * - Date: JST(+09:00) で正しくISO化（TZ付き）
 * - Status: DBスキーマから status/select を自動判定
 * - Delete(archive): タイトル+日時で一致するページを検索してアーカイブ
 * ========================= */

const NOTION_VERSION = "2022-06-28";
const NOTION_BASE = "https://api.notion.com/v1";

/** JST(+09:00) で ISO 文字列（末尾 +09:00）を生成 */
function formatAsJstIso(d: Date): string {
  // +0900 を +09:00 に直す
  const s = Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ssZ"); // 例: +0900
  return s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"); // 例: +09:00
}

/** 文字列/Date を JST(+09:00) の ISO へ正規化
 *  - 既にTZ付き文字列: その瞬間を JST へ変換して +09:00 で表現
 *  - "YYYY-MM-DD HH:mm" / "YYYY/MM/DD HH:mm": JST解釈
 *  - "YYYY-MM-DD" / "YYYY/MM/DD": JSTで 00:00:00 を付与
 */
function toJstIso(value: unknown): string {
  if (value instanceof Date) {
    return formatAsJstIso(value);
  }
  if (typeof value === "string") {
    const s = value.trim();

    // 既にタイムゾーン付き（Z or ±HH[:]MM）→ その瞬間を Date 化して JST で再フォーマット
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
      const d = new Date(s);
      return formatAsJstIso(d);
    }

    // YYYY-MM-DD HH:mm
    let m = s.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})[ T](\d{2}):(\d{2})$/);
    if (m) {
      const [, Y, M, D, H, Min] = m;
      const d = new Date(
        Number(Y),
        Number(M) - 1,
        Number(D),
        Number(H),
        Number(Min),
        0,
        0
      ); // JST ローカル
      return formatAsJstIso(d);
    }

    // YYYY-MM-DD
    m = s.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})$/);
    if (m) {
      const [, Y, M, D] = m;
      const d = new Date(Number(Y), Number(M) - 1, Number(D), 0, 0, 0, 0); // JST で 00:00
      return formatAsJstIso(d);
    }

    // その他（ISO想定）: Date化してJSTで再フォーマット
    const d = new Date(s);
    return formatAsJstIso(d);
  }
  // 想定外 → 現在時刻で保険
  return formatAsJstIso(new Date());
}

/** ISO(+09:00) 文字列に分分加算（比較用フィルタの上限境界に使用） */
function addMinutesJst(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return formatAsJstIso(d);
}

/** DB スキーマ取得 */
function getDbSchema_(databaseId: string): any {
  return notionRequest_(`/databases/${databaseId}`, "get");
}

/** JSON 1件 → Notion ページ作成（schema を渡すと高速） */
function createPageFromGenericJson_(
  databaseId: string,
  input: Record<string, unknown>,
  map: NotionColumnMapping,
  schema?: any
): any {
  const props = buildProperties_(input, map, schema);
  const payload = { parent: { database_id: databaseId }, properties: props };
  return notionRequest_("/pages", "post", payload);
}

/** 入力JSON → Notion properties（Status型を自動判定／日付範囲対応） */
function buildProperties_(
  row: Record<string, unknown>,
  map: NotionColumnMapping,
  schema?: any
): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  // タイトル
  props[map.title] = {
    title: [{ type: "text", text: { content: String(row.title ?? "") } }],
  };

  // 日付（単発 or 範囲）— JST(+09:00)
  if ("date" in row) {
    const v: any = (row as any).date;
    if (!v) {
      props[map.date] = { date: null };
    } else if (typeof v === "object" && ("start" in v || "end" in v)) {
      const start = v.start ? toJstIso(v.start) : null;
      const end = v.end ? toJstIso(v.end) : null;
      const datePayload: any = { start, end };
      if (typeof v.time_zone === "string" && v.time_zone)
        datePayload.time_zone = v.time_zone;
      props[map.date] = { date: datePayload };
    } else {
      props[map.date] = { date: { start: toJstIso(v) } };
    }
  }

  // ステータス（未指定なら Not Started）— status / select をスキーマで出し分け
  const statusVal = (row as any).status ?? "Not Started";
  let statusPropKey: "status" | "select" = "status";
  const p =
    schema && schema.properties ? schema.properties[map.status] : undefined;
  const detected = p && typeof p.type === "string" ? p.type : null;
  if (detected === "select") statusPropKey = "select";
  else if (detected === "status") statusPropKey = "status";

  props[map.status] = { [statusPropKey]: { name: String(statusVal) } };

  return props;
}

/** タイトル(+日付)で一致するページを検索 → ページID配列を返す */
function findPageIdsForRow_(
  databaseId: string,
  row: Record<string, unknown>,
  map: NotionColumnMapping
): string[] {
  const title = String(row.title ?? "").trim();
  if (!title) return [];

  const filters: any[] = [{ property: map.title, title: { equals: title } }];

  if ("date" in row && (row as any).date) {
    const v: any = (row as any).date;
    // start を基準に ±1分の範囲で一致させる（分解能の差異を吸収）
    const startIso =
      typeof v === "object" && v.start ? toJstIso(v.start) : toJstIso(v);
    const upperIso =
      typeof v === "object" && v.end
        ? toJstIso(v.end)
        : addMinutesJst(startIso, 1);

    filters.push({ property: map.date, date: { on_or_after: startIso } });
    filters.push({ property: map.date, date: { before: upperIso } });
  }

  const payload = { filter: { and: filters }, page_size: 100 };
  const res = notionRequest_(`/databases/${databaseId}/query`, "post", payload);
  const results = Array.isArray(res?.results) ? res.results : [];
  return results.map((r: any) => r.id).filter(Boolean);
}

/** ページをアーカイブ（擬似削除） */
function notionArchivePage_(pageId: string): any {
  return notionRequest_(`/pages/${pageId}`, "patch", { archived: true });
}

/** Notion API 共通呼び出し */
function notionRequest_(
  path: string,
  method: GoogleAppsScript.URL_Fetch.HttpMethod,
  payload?: object
): any {
  const raw =
    PropertiesService.getScriptProperties().getProperty("NOTION_API_TOKEN") ||
    "";
  const token = raw
    .replace(/^[\s\u200B\uFEFF]+|[\s\u200B\uFEFF]+$/g, "")
    .replace(/^['"]|['"]$/g, "");
  if (!token) throw new Error("NOTION_API_TOKEN が未設定です。");

  const res = UrlFetchApp.fetch(NOTION_BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json; charset=utf-8",
    },
    payload: payload ? JSON.stringify(payload) : undefined,
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code >= 200 && code < 300) return text ? JSON.parse(text) : {};
  throw new Error(`Notion API Error ${code}: ${text}`);
}

/** デバッグ: プロパティ型確認 */
function debugNotionPropertyTypes(): void {
  const dbId = (
    PropertiesService.getScriptProperties().getProperty("DATABASE_ID") || ""
  ).trim();
  const map = getColumnMapping();
  const schema = getDbSchema_(dbId);
  const props = schema?.properties || {};
  Logger.log("title.type=%s", props[map.title]?.type);
  Logger.log("date.type=%s", props[map.date]?.type);
  Logger.log("status.type=%s", props[map.status]?.type);
}
