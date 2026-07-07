-- 004: マスター図鑑（全メンバー共通の参照データ）
-- Supabase SQL Editor にそのまま貼り付けて実行する。

create table public.fish_master (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,   -- 和名
  english_name     text,
  scientific_name  text,
  category         text,                   -- 魚類/甲殻類/軟体動物/...
  order_name       text,                   -- 目
  family           text,                   -- 科
  genus            text,                   -- 属
  rarity           text,
  popularity       text,
  photo_ease       text,
  memo             text,                   -- 生息・分布など
  thumbnail_url    text,                   -- storage:master/... or 外部URL
  thumb_attribution text,                  -- 写真クレジット「(c) 撮影者 (CC BY-NC)」
  source_url       text,                   -- 出典ページ
  created_at       timestamptz not null default now()
);

create index fish_master_family_idx on public.fish_master (family);
create index fish_master_name_idx on public.fish_master (name);

alter table public.fish_master enable row level security;

-- 全ログインユーザーが閲覧可能
create policy "read for authenticated" on public.fish_master
  for select to authenticated using (true);

-- 書き込みは管理者のみ
create policy "admin write" on public.fish_master
  for all using (auth.uid() = 'f56a560d-37d2-49bb-aaeb-5b03fd79f05b'::uuid)
  with check (auth.uid() = 'f56a560d-37d2-49bb-aaeb-5b03fd79f05b'::uuid);

-- 個人図鑑エントリとマスターの紐付け
alter table public.fish
  add column master_id uuid references public.fish_master (id) on delete set null;

create index fish_master_id_idx on public.fish (master_id);
