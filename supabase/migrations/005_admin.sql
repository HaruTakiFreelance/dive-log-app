-- 005: 管理者用メンバー統計RPC
-- Supabase SQL Editor にそのまま貼り付けて実行する。
-- プライバシー方針: 投稿の「内容」ではなく件数・日付などの統計のみを返す。

create or replace function public.admin_member_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 管理者以外には何も返さない
  if auth.uid() is distinct from 'f56a560d-37d2-49bb-aaeb-5b03fd79f05b'::uuid then
    return null;
  end if;

  return (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    from (
      select
        u.id,
        u.email,
        u.created_at,
        u.last_sign_in_at,
        (u.raw_app_meta_data ->> 'provider')                                    as provider,
        (select count(*)    from dives d           where d.user_id = u.id)      as dive_count,
        (select count(*)    from photos p          where p.user_id = u.id)      as photo_count,
        (select count(*)    from fish f            where f.user_id = u.id)      as fish_count,
        (select count(*)    from session_reviews r where r.user_id = u.id)      as review_count,
        (select max(d.date) from dives d           where d.user_id = u.id)      as last_dive_date,
        exists(select 1 from shares s where s.user_id = u.id)                   as has_share_link
      from auth.users u
    ) t
  );
end;
$$;

revoke all on function public.admin_member_stats() from public;
grant execute on function public.admin_member_stats() to authenticated;
