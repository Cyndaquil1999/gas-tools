# Schedule Add for Notion

Google Apps Script（GAS）+ TypeScript + clasp で作る  
**「JSON を入力 → Notion DB にページを追加／削除（アーカイブ）」** する Web アプリです。  
**日付は JST（UTC+9）で扱い**、Status は未指定時に **"Not Started"** を補完します。

---

## 主な機能

- **JSON からページ追加**（単発日時／日付のみ／範囲 `{start, end}` に対応）
- **削除（アーカイブ）モード**  
  タイトル一致＋（あれば）日時一致で対象ページを見つけてアーカイブ
- **JST（UTC+9）で正規化**  
  Notion の `date` プロパティには **`start/end` はオフセット無し**、**`time_zone: "Asia/Tokyo"`** を付与  
  検索フィルタは **`+09:00` 付き ISO** を使用
- **Status / Select を自動判定**  
  Notion DB のスキーマを見て、`status` 型/`select` 型を自動で出し分けて送信
- **列名マッピングを外部化**（任意）  
  Script Properties の `NOTION_COLUMN_MAP`（JSON）で  
  `title / date / status` の列名を差し替え可能（デフォルトは `"名前"`, `"Date"`, `"Status"`）

---

## 事前準備

### 1) 依存関係（未インストールなら）

```bash
npm i -D typescript @types/google-apps-script rimraf @google/clasp
```

### 2) Notion 側

- Integration を作成し **Internal Integration Token** を取得
- 対象 **Database を Integration に共有（招待）**
- Database ID を控える

### 3) GAS のスクリプトプロパティ

Apps Script エディタ → 歯車 → **プロジェクトの設定 → スクリプトプロパティ**

| Key                 | Value                                                        |
| ------------------- | ------------------------------------------------------------ |
| `NOTION_API_TOKEN`  | Notion の Integration Token（先頭 `secret_`）                |
| `DATABASE_ID`       | 対象 DB の ID                                                |
| `NOTION_COLUMN_MAP` | ※任意。例 `{"title":"名前","date":"Date","status":"Status"}` |

### 4) clasp の設定

```bash
npx clasp login
```

---

## npm scripts（例）

ルート `package.json` に以下を用意（既存の運用に合わせてください）:

```jsonc
{
  "scripts": {
    "build:proj": "rimraf projects/$npm_config_proj/dist && tsc -p projects/$npm_config_proj",
    "push:proj": "npm run build:proj --proj=$npm_config_proj && cd projects/$npm_config_proj && npx clasp push",
    "open:proj": "cd projects/$npm_config_proj && npx clasp open",

    "build:schedule": "npm run build:proj --proj=schedule-add-for-notion",
    "push:schedule": "npm run push:proj  --proj=schedule-add-for-notion",
    "open:schedule": "npm run open:proj  --proj=schedule-add-for-notion"
  }
}
```

> Windows ネイティブで `$npm_config_proj` が展開されない場合は WSL/Git Bash を推奨。

---

## 使い方

### 1) ビルド & プッシュ

```bash
npm run build:schedule
npm run push:schedule
```

### 2) Web アプリを開く

```bash
npm run open:schedule
```

Apps Script エディタ → **デプロイ** → **新しいデプロイ** → 種類「ウェブアプリ」。

### 3) Web UI

- 左：JSON の直接入力／整形
- 右：JSON ファイル読み込み（自動でテキストに反映）
- モード：**追加 / 削除（アーカイブ）** を選択
- 実行後、結果（成功/失敗、ID など）を表示

---

## JSON 形式

### 単発の日時

```json
{ "title": "会議", "date": "2025-09-08 10:00" }
```

### 期間（範囲）

```json
{
  "title": "会議",
  "date": { "start": "2025-09-08 19:00", "end": "2025-09-08 19:45" }
}
```

### 日付のみ（終日）

```json
{ "title": "終日予定", "date": "2025-09-09" }
```

### 配列で一括登録

```json
[
  {
    "title": "仕事",
    "date": { "start": "2025-09-09 09:00", "end": "2025-09-09 18:00" }
  }
]
```

### 任意プロパティ

- `status`（任意・省略時 `"Not Started"`）
- 列名は Script Properties の `NOTION_COLUMN_MAP` で差し替え可能（`title/date/status` の 3 つ）

---

## 日付・タイムゾーンの扱い（重要）

- **作成時**：Notion の `date` プロパティには
  - `start/end` … **オフセット無しの JST ローカル文字列**（例 `"2025-09-08T19:00:00"`）
  - `time_zone` … **`"Asia/Tokyo"`** を必ず付与  
    → Notion 側で **JST として正しく保存** されます
- **削除時の検索**：フィルタに使う日時は **`+09:00` 付き ISO** で送信
  - 単発：`on_or_after: start` & `before: start+1分`（± を広げたい場合はコードで調整可）
  - 範囲：`on_or_after: start` & `before: end`

---

## デバッグ用ユーティリティ（任意）

- `debugNotionPropertyTypes()`：Notion DB の `title/date/status` の型をログ出力
- `testLogJstFromJson(json)`：入力 JSON を JST に正規化した上で、  
  **Notion フィールド用（time_zone 方式）** と **検索フィルタ用（+09:00 方式）** の双方をログ出力

---

## 連絡先

改善要望・不具合があれば、Issue にてお知らせください。
