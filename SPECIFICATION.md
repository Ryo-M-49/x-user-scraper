# X User Scraper 仕様書

## 概要

X（旧Twitter）上で特定条件に合致するユーザーを検索・リストアップし、TSV形式でエクスポートするCLIツール。
ブラウザ自動操作により、ログイン済みセッションを利用してデータを収集する。

---

## 技術スタック

| 項目 | 技術 |
|------|------|
| 言語 | TypeScript |
| ランタイム | Node.js (v18+) |
| ブラウザ自動操作 | Playwright |
| パッケージ管理 | pnpm |
| ビルド | tsx (実行) / tsup (ビルド) |

### Playwrightを選択する理由
- Puppeteerより高機能（複数ブラウザ対応、自動待機）
- TypeScriptサポートが充実
- 既存のブラウザプロファイル（ログイン状態）を利用可能

---

## 機能要件

### 1. ユーザー検索・フィルタリング

#### 1.1 キーワード検索
- プロフィール（bio）に対する部分一致検索
- 大文字・小文字を区別しない

#### 1.2 フォロワー数フィルター
- 最小フォロワー数の指定
- 最大フォロワー数の指定

### 2. 取得対象データ

| フィールド | 説明 |
|-----------|------|
| username | ユーザー名（@以降） |
| displayName | 表示名 |
| bio | プロフィール文 |
| followersCount | フォロワー数 |
| followingCount | フォロー数 |
| profileUrl | プロフィールURL |

### 3. 出力形式

- TSV形式（タブ区切り）
- UTF-8エンコーディング
- 標準出力またはファイル出力

---

## アーキテクチャ

```
x-user-scraper/
├── src/
│   ├── index.ts          # CLIエントリーポイント
│   ├── browser.ts        # Playwright ブラウザ制御
│   ├── scraper.ts        # スクレイピングロジック
│   ├── filter.ts         # フィルタリング処理
│   ├── exporter.ts       # TSV出力
│   └── types.ts          # 型定義
├── package.json
├── tsconfig.json
└── SPECIFICATION.md
```

---

## CLI仕様

```bash
# 基本使用法
npx x-user-scraper --keyword "エンジニア" --min-followers 1000 --max-followers 10000

# オプション
Options:
  --keyword, -k        検索キーワード（プロフィール部分一致）
  --min-followers      最小フォロワー数 (default: 0)
  --max-followers      最大フォロワー数 (default: Infinity)
  --output, -o         出力ファイルパス (default: stdout)
  --limit, -l          最大取得件数 (default: 100)
  --source, -s         データソース: "search" | "followers" | "following"
  --target-user        フォロワー/フォロイー取得時の対象ユーザー
  --headed             ブラウザを表示して実行（デバッグ用）
  --help, -h           ヘルプ表示
```

### 使用例

```bash
# キーワード検索
npx x-user-scraper -k "TypeScript" --min-followers 500 -o results.tsv

# 特定ユーザーのフォロワーから抽出
npx x-user-scraper -s followers --target-user elonmusk -k "AI" --limit 50
```

---

## 処理フロー

```
1. CLI引数パース
       ↓
2. Playwright起動（既存プロファイル使用）
       ↓
3. X.comへアクセス（ログイン状態確認）
       ↓
4. データソースページへ遷移
   - search: 検索結果ページ
   - followers: ユーザーのフォロワー一覧
   - following: ユーザーのフォロー一覧
       ↓
5. スクロール & DOM解析
   - ユーザーカード要素を取得
   - プロフィール情報を抽出
       ↓
6. フィルタリング
   - キーワード部分一致
   - フォロワー数範囲チェック
       ↓
7. TSV出力
```

---

## ブラウザプロファイル設定

Playwrightで既存のChromeプロファイル（ログイン済み）を使用：

```typescript
import { chromium } from 'playwright';

const browser = await chromium.launchPersistentContext(
  '/path/to/chrome/profile', // Chromeのユーザーデータディレクトリ
  {
    headless: false, // ログイン状態確認のため最初は表示推奨
    channel: 'chrome', // システムのChromeを使用
  }
);
```

### プロファイルパス例
- **Windows**: `C:\Users\<user>\AppData\Local\Google\Chrome\User Data`
- **macOS**: `~/Library/Application Support/Google/Chrome`
- **Linux**: `~/.config/google-chrome`

---

## DOM解析対象（参考）

X.comのユーザーカード構造（変更される可能性あり）：

```typescript
// セレクタ例（実装時に要確認）
const selectors = {
  userCard: '[data-testid="UserCell"]',
  userName: '[data-testid="User-Name"]',
  userBio: '[data-testid="UserDescription"]',
  // フォロワー数等は個別ページ遷移が必要な場合あり
};
```

---

## 依存パッケージ

```json
{
  "dependencies": {
    "playwright": "^1.40.0",
    "commander": "^11.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsx": "^4.7.0",
    "@types/node": "^20.0.0"
  }
}
```

---

## 制約事項・注意点

### 利用規約について
- X/Twitterは自動化ツールの使用を規約で制限している
- ログイン状態でのブラウザ操作でも、自動化は検出・制限される可能性あり
- 以下を推奨：
  - 短時間での大量リクエストを避ける
  - 人間らしい操作間隔（ランダムな待機時間）
  - 個人利用の範囲に留める

### 技術的制約
- X.comのDOM構造は頻繁に変更される
- レート制限による取得数の制限
- 一部データ（正確なフォロワー数等）は詳細ページ遷移が必要

---

## 開発手順

```bash
# 1. プロジェクト初期化
pnpm init
pnpm add playwright commander
pnpm add -D typescript tsx @types/node

# 2. Playwright ブラウザインストール
pnpm exec playwright install chromium

# 3. 実行
pnpm exec tsx src/index.ts --keyword "test" --headed
```
