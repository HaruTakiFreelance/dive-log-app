# Dive Log App

サークルメンバー向けのダイビングログアプリ。アカウントでログインすると**自分のログだけ**が見える。

- フロントエンド: 静的サイト（vanilla JS + supabase-js）。Cloudflare Pages で配信（https://bubble-ring.pages.dev）
- バックエンド: Supabase（認証 / Postgres + RLS / 写真ストレージ）
- サーバー運用: 不要（すべてマネージド・無料枠）

## 構成

```
supabase/migrations/   DBスキーマ（Supabase SQL Editorで適用）
docs/                   公開する静的サイト本体
  index.html           ログイン → マイログブック
  session.html         セッション詳細（?date=YYYY-MM-DD&location=場所）
  fish.html            My図鑑
  record/              記録フォーム群
  admin/thumbs.html    魚サムネイル管理（未登録一覧）
  js/                  ロジック（config.js は環境ごとに用意）
scripts/               Notion → Supabase データ移行（1回きり）
```

## 初回セットアップ（管理者）

1. **Supabaseプロジェクト作成**: https://supabase.com/dashboard → New Project（無料枠でOK、リージョンは Tokyo 推奨）
2. **スキーマ適用**: ダッシュボード → SQL Editor で `supabase/migrations/` のSQLを番号順に貼り付けて Run
3. **Googleログイン設定**: Google Cloud ConsoleでOAuthクライアントを作成し、
   Authentication → Sign In / Providers → Google に クライアントID/シークレットを設定。
   「Allow new users to sign up」は **ON**（Googleアカウントがあれば誰でも登録できる）
4. **設定ファイル作成**: `docs/js/config.js` を作成:
   ```js
   export const SUPABASE_URL = "https://xxxx.supabase.co";   // Project Settings → API
   export const SUPABASE_ANON_KEY = "eyJ...";                 // anon (public) key
   ```
   ※ anonキーはブラウザに配る前提の公開キー。データ保護はRLSが担う

## メンバーの使い方

1. サイトURLを開いて「Googleでログイン」を押す（初回で自動的にアカウント作成）
2. スマホならブラウザの「ホーム画面に追加」でアプリのように使える

## データ移行（旧dive-logから・1回きり）

```bash
cd scripts
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # NOTION_TOKEN / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / TARGET_USER_ID を記入
python3 migrate_from_notion.py --dry-run   # 件数確認
python3 migrate_from_notion.py             # 本実行
```

⚠️ `SUPABASE_SERVICE_ROLE_KEY` はRLSを無視できる管理キー。`.env` 以外に置かない・コミットしない。

## デプロイ

```bash
./deploy.sh   # docs/ を bubble-ring.pages.dev に公開（要: wrangler ログイン済み）
```

## ローカル開発

```bash
python3 -m http.server 8080 --directory docs
# → http://localhost:8080
```
