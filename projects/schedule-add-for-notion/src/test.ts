/**
 * JSON を受け取り、JST(+09:00) に正規化した時間をログ出力するテスト関数。
 * - 引数は配列でも1件オブジェクトでもテキスト(JSON文字列)でもOK
 * - Notion に送るときの「start/end（オフセット無し）+ time_zone」 と
 *   検索フィルタ用の「ISO(+09:00)」の両方を出力します
 *
 * 使い方:
 *   testLogJstFromJson(MY_JSON);
 *   testLogJstFromJson('[{ "title":"X", "date":{ "start":"2025-09-08 19:00", "end":"2025-09-08 19:45" } }]');
 */
function testLogJstFromJson(jsonInput: unknown): void {
  const rows: any[] = normalizeInputToArray_(jsonInput);

  rows.forEach((row, i) => {
    const title = String(row?.title ?? "(no title)");
    const date = row?.date;

    // Notion フィールド用（time_zone を使う。start/end はオフセット無し）
    const notionPayload = buildNotionDatePayloadForTest_(date);

    // 検索フィルタ用（+09:00 の ISO）
    const startIso = date
      ? toJstIsoWithOffsetTest_(
          typeof date === "object" && "start" in date ? date.start : date
        )
      : null;
    const endIso =
      date && typeof date === "object" && "end" in date && date.end
        ? toJstIsoWithOffsetTest_(date.end)
        : null;

    Logger.log("#%s title=%s", i, title);
    Logger.log("  input.date      : %s", JSON.stringify(date));
    Logger.log("  notion.date     : %s", JSON.stringify(notionPayload)); // { start?: "...", end?: "...", time_zone:"Asia/Tokyo" }
    Logger.log("  filter.startIso : %s", startIso);
    Logger.log("  filter.endIso   : %s", endIso);
  });
}

/* =========================================
 *  以下、テスト用のユーティリティ実装
 *  （本番コードと衝突しないよう *_Test_ 接尾辞を付けています）
 * ========================================= */

/** テキスト/1件/配列 を配列<any> に整形 */
function normalizeInputToArray_(input: unknown): any[] {
  if (input == null) return [];
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      throw new Error("JSON文字列の解析に失敗しました");
    }
  }
  return Array.isArray(input) ? input : [input];
}

/** "YYYY-MM-DD" 判定 */
function isDateOnlyString_(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** 入力値（文字列/Date）→ Date に変換（素の "YYYY-MM-DD HH:mm" は JST として解釈） */
function toDateTest_(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const s = value.trim();
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return new Date(s); // TZ付き
    let m = s.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})[ T](\d{2}):(\d{2})$/);
    if (m) {
      const [, Y, M, D, H, Min] = m;
      return new Date(
        Number(Y),
        Number(M) - 1,
        Number(D),
        Number(H),
        Number(Min),
        0,
        0
      ); // ローカル=JST
    }
    m = s.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})$/);
    if (m) {
      const [, Y, M, D] = m;
      return new Date(Number(Y), Number(M) - 1, Number(D), 0, 0, 0, 0);
    }
    return new Date(s);
  }
  return new Date();
}

/** フィールド用：JST ローカル文字列（オフセット無し）"yyyy-MM-dd'T'HH:mm:ss" */
function toJstLocalStringTest_(value: unknown): string {
  const d = toDateTest_(value);
  return Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss");
}

/** フィールド用：日付のみ "yyyy-MM-dd" */
function toJstDateOnlyTest_(value: unknown): string {
  const d = toDateTest_(value);
  return Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd");
}

/** フィルタ用：+09:00 を付けた ISO "yyyy-MM-dd'T'HH:mm:ss+09:00" */
function toJstIsoWithOffsetTest_(value: unknown): string {
  const d = toDateTest_(value);
  const s = Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ssZ"); // +0900
  return s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"); // → +09:00
}

/** Notion の date プロパティに入れる形を作る（time_zone を固定で付与） */
function buildNotionDatePayloadForTest_(
  dateVal: any
): {
  start?: string | null;
  end?: string | null;
  time_zone: "Asia/Tokyo";
} | null {
  if (!dateVal) return null;

  if (typeof dateVal === "object" && ("start" in dateVal || "end" in dateVal)) {
    const start = dateVal.start
      ? typeof dateVal.start === "string" && isDateOnlyString_(dateVal.start)
        ? toJstDateOnlyTest_(dateVal.start)
        : toJstLocalStringTest_(dateVal.start)
      : null;
    const end = dateVal.end
      ? typeof dateVal.end === "string" && isDateOnlyString_(dateVal.end)
        ? toJstDateOnlyTest_(dateVal.end)
        : toJstLocalStringTest_(dateVal.end)
      : null;
    return { start, end, time_zone: "Asia/Tokyo" };
  }

  // 文字列1本
  const isDateOnly = typeof dateVal === "string" && isDateOnlyString_(dateVal);
  const start = isDateOnly
    ? toJstDateOnlyTest_(dateVal)
    : toJstLocalStringTest_(dateVal);
  return { start, time_zone: "Asia/Tokyo" };
}
