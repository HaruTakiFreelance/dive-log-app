# Dive Log App

サークルメンバー向けのダイビングログアプリ。アカウントでログインすると**自分のログだけ**が見える。

- フロントエンド: 静的サイト（vanilla JS + supabase-js）。GitHub Pages で配信
- バックエンド: Supabase（認証 / Postgres + RLS / 写真ストレージ）
- サーバー運用: 不要（すべてマネージド・無料枠）

## 構成

```
supabase/migrations/   DBスキーマ（Supabase SQL Editorで適用）
web/                   公開する静的サイト本体
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
2. **スキーマ適用**: ダッシュボード → SQL Editor → `supabase/migrations/001_schema.sql` の中身を貼り付けて Run
3. **サインアップ無効化（招待制にする）**: Authentication → Sign In / Up → 「Allow new users to sign up」を **OFF**
4. **設定ファイル作成**: `web/js/config.js` を作成:
   ```js
   export const SUPABASE_URL = "https://xxxx.supabase.co";   // Project Settings → API
   export const SUPABASE_ANON_KEY = "eyJ...";                 // anon (public) key
   ```
   ※ anonキーはブラウザに配る前提の公開キー。データ保護はRLSが担う
5. **メンバー招待**: Authentication → Users → Invite user（メールアドレスを入力）
   招待メールのリンクからパスワードを設定してもらえば完了

## メンバーの使い方

1. 管理者から届いた招待メールでパスワードを設定
2. サイトURLを開いてログイン
3. スマホならブラウザの「ホーム画面に追加」でアプリのように使える

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

## ローカル開発

```bash
python3 -m http.server 8080 --directory web
# → http://localhost:8080
```
