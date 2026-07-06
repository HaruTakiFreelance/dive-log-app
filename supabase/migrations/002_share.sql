-- 002: 公開共有機能（閲覧専用の共有リンク）
-- Supabase SQL Editor にそのまま貼り付けて実行する。

-- ══════════════════════════════════════════
-- 共有トークン（1ユーザー1件。URLを知っている人だけが閲覧できる）
-- ══════════════════════════════════════════

create table public.shares (
  token      uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.shares enable row level security;

create policy "own rows" on public.shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ══════════════════════════════════════════
-- 共有ページ用データ取得関数
-- トークンを知っている人（未ログイン含む）が、そのユーザーの
-- ログブック一式を読み取れる。security definer でRLSをバイパスするが、
-- 有効なトークンがなければ null を返すだけ。
-- ══════════════════════════════════════════

create or replace function public.shared_logbook(share_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  select user_id into uid from shares where token = share_token;
  if uid is null then
    return null;
  end if;
  return jsonb_build_object(
    'dives',     (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from dives d where d.user_id = uid),
    'dive_fish', (select coalesce(jsonb_agg(to_jsonb(df)), '[]'::jsonb) from dive_fish df where df.user_id = uid),
    'fish',      (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from fish f where f.user_id = uid),
    'photos',    (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from photos p where p.user_id = uid),
    'reviews',   (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from session_reviews r where r.user_id = uid),
    'profiles',  (select coalesce(jsonb_agg(to_jsonb(dp)), '[]'::jsonb) from depth_profiles dp where dp.user_id = uid)
  );
end;
$$;

revoke all on function public.shared_logbook(uuid) from public;
grant execute on function public.shared_logbook(uuid) to anon, authenticated;

-- ══════════════════════════════════════════
-- 写真・サムネイルの公開読み取り
-- 共有ページ（未ログイン）で画像を表示するためバケットを公開readに変更。
-- パスは {user_id}/{uuid} 形式で推測不能。アップロード・削除は引き続き本人のみ。
-- ══════════════════════════════════════════

update storage.buckets set public = true where id in ('photos', 'fish-thumbs');
