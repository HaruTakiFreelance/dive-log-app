-- dive-log-app 初期スキーマ
-- Supabase SQL Editor にそのまま貼り付けて実行する。
-- 全テーブル: user_id による行レベルセキュリティ(RLS)で「本人のデータしか見えない」を保証。

-- ══════════════════════════════════════════
-- テーブル定義
-- ══════════════════════════════════════════

create table public.dives (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  date         date not null,
  dive_number  integer,                -- 通算何本目か
  location     text not null,          -- 場所（例: 大瀬崎）
  point        text,                   -- ポイント名（例: 湾内）
  start_time   text,                   -- "HH:MM"
  end_time     text,                   -- "HH:MM"
  duration     numeric,                -- 潜水時間（分）
  max_depth    numeric,                -- 最大水深（m）
  avg_depth    numeric,                -- 平均水深（m）
  weight       numeric,                -- ウェイト（kg）
  water_temp   numeric,                -- 水温（℃）
  weather      text,                   -- 晴れ/曇り/雨/雪
  wave_height  numeric,                -- 波の高さ（m）
  cost         numeric,                -- かかった金額（円）
  comment      text,
  buddy        text,
  video_links  text,                   -- 改行区切りのURL
  created_at   timestamptz not null default now()
);

create table public.fish (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,       -- 和名
  english_name    text,
  scientific_name text,
  category        text,                -- 魚類/甲殻類/軟体動物/棘皮動物/爬虫類/哺乳類/その他
  order_name      text,                -- 目
  family          text,                -- 科
  genus           text,                -- 属
  rarity          text,                -- レア度（★表記）
  popularity      text,                -- 人気（★表記）
  photo_ease      text,                -- 撮りやすさ（★表記）
  memo            text,
  first_seen      date,                -- 初目撃日
  thumbnail_url   text,                -- 外部URL または Storage パス
  created_at      timestamptz not null default now(),
  unique (user_id, name)
);

create table public.dive_fish (
  dive_id  uuid not null references public.dives (id) on delete cascade,
  fish_id  uuid not null references public.fish (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  primary key (dive_id, fish_id)
);

create table public.session_reviews (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  date      date not null,
  location  text not null,
  text      text not null default '',
  unique (user_id, date, location)
);

create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  date          date not null,
  location      text not null,
  caption       text,
  storage_path  text not null,         -- photos バケット内のパス（{user_id}/...）
  created_at    timestamptz not null default now()
);

create table public.depth_profiles (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users (id) on delete cascade,
  dive_id   uuid not null references public.dives (id) on delete cascade,
  profile   jsonb not null,            -- 深度の配列 [0, 3.2, 5.1, ...]
  warning   text,                      -- ダイコン警告（"DECO" 等）
  unique (dive_id)
);

-- 検索用インデックス
create index dives_user_date_idx on public.dives (user_id, date desc, dive_number desc);
create index fish_user_name_idx on public.fish (user_id, name);
create index photos_user_session_idx on public.photos (user_id, date, location);

-- ══════════════════════════════════════════
-- RLS: 全テーブル「本人のみ」ポリシー
-- ══════════════════════════════════════════

alter table public.dives           enable row level security;
alter table public.fish            enable row level security;
alter table public.dive_fish       enable row level security;
alter table public.session_reviews enable row level security;
alter table public.photos          enable row level security;
alter table public.depth_profiles  enable row level security;

-- select/insert/update/delete すべて auth.uid() = user_id に限定
create policy "own rows" on public.dives
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.fish
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.dive_fish
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.session_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.depth_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ══════════════════════════════════════════
-- Storage: photos / fish-thumbs バケット
-- パスの先頭フォルダ = 本人の user_id のみ読み書き可
-- ══════════════════════════════════════════

insert into storage.buckets (id, name, public) values
  ('photos', 'photos', false),
  ('fish-thumbs', 'fish-thumbs', false);

create policy "own folder read" on storage.objects
  for select using (
    bucket_id in ('photos', 'fish-thumbs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own folder write" on storage.objects
  for insert with check (
    bucket_id in ('photos', 'fish-thumbs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own folder update" on storage.objects
  for update using (
    bucket_id in ('photos', 'fish-thumbs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own folder delete" on storage.objects
  for delete using (
    bucket_id in ('photos', 'fish-thumbs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
