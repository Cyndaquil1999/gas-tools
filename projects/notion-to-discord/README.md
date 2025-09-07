# 📘 Notion to Discord

## 🚀 概要

**Google Apps Script (GAS) + clasp + TypeScript** を使い、  
**今日の Notion データベースのタスクを取得 → 整形 → Discord Webhook に通知**する仕組みです。

カラム名は **Script Properties の `NOTION_COLUMN_MAP`** に JSON 形式で設定できるため、  
コードを変更せず Notion 側の列名に合わせて柔軟に調整可能です。

---

## 📂 ディレクトリ構成

```
.
└── notion-to-discord
    ├── README.md
    ├── dist
    │   ├── main.js
    │   └── test.js
    ├── src
    │   ├── appsscript.json # GAS マニフェスト
    │   ├── main.ts         # 本体 (Notionから取得, Discord送信)
    │   └── test.ts         # 簡易テスト (今日のタスクをログ出力)
    └── tsconfig.json
```

---

## 🔑 前提設定

### 1. セットアップ（依存関係 & clasp ログイン）

```bash
# リポジトリトップで依存関係をインストール
npm install

# clasp ログイン（未認証なら）
npx clasp login
```

### 2. Notion 側

- Integration を作成し **Internal Integration Token** を取得
- データベースを Integration に共有
- Database ID をコピー

### 3. Discord 側

- Discord サーバーで **Webhook** を作成
- Webhook URL をコピー

### 4. GAS 側 (スクリプトプロパティ)

Apps Script エディタ → **プロジェクト設定 > スクリプトプロパティ** に以下を追加：

| Key                   | Value (例)                          |
| --------------------- | ----------------------------------- |
| `NOTION_API_TOKEN`    | Notion Integration のトークン       |
| `DATABASE_ID`         | Notion DB の ID                     |
| `DISCORD_WEBHOOK_URL` | Discord Webhook URL                 |
| `NOTION_COLUMN_MAP`   | JSON 文字列でプロパティ名マッピング |

例:

```json
{
  "title": "名前",
  "date": "Date",
  "status": "Status",
  "tags": "Tags",
  "description": "Description",
  "url": "URL"
}
```

---

## 🛠️ 開発フロー

### ビルド & デプロイ

```bash
# dist にビルド
npm run build:notion2discord

# GAS に push
npm run push:notion2discord
```

---

## ⚡ 主な関数

- `getTasksForDate(targetDate: Date)`  
  Notion DB から指定日のタスクを取得（`NOTION_COLUMN_MAP` の設定に従う）

- `sendToDiscord(records, targetDate)`  
  タスクを日付順に並べ Discord に送信

- `sendNotionDataToDiscord()`  
  今日の日付で Notion → Discord を実行（トリガー用）

- `testGetTasksForDate()`  
  取得結果を GAS のログに出力するテスト

---

## 📝 Discord 送信例

```
**2025/09/07のタスク（時系列順）:**
1. **打合せ**   2025/09/07 10:00
2. **資料作成** 日付未設定
```

---

## ⏰ 定期実行

Apps Script エディタ → 左メニュー「トリガー」から  
関数 `sendNotionDataToDiscord` を選び、**時間主導型トリガー**を設定すると  
毎朝などに自動通知できます。

---

## ⚠️ 注意事項

- **カラム名は `NOTION_COLUMN_MAP` で管理**。DB 側の列名に合わせて JSON を更新してください。
- Notion API の Rate Limit は **3 リクエスト/秒程度**。大量データでは注意してください。
- `clasp push --force` を使うと **dist に無いサーバ上のファイルは削除**されます。
