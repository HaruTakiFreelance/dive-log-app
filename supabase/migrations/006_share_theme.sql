-- 006: 共有ページにオーナーのテーマ設定（背景写真・カラー・フォント）を反映する
-- shared_logbook 関数を差し替え（prefs を追加）

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
    'profiles',  (select coalesce(jsonb_agg(to_jsonb(dp)), '[]'::jsonb) from depth_profiles dp where dp.user_id = uid),
    'prefs',     (select jsonb_build_object(
                    'theme',    u.raw_user_meta_data ->> 'theme',
                    'bg_photo', u.raw_user_meta_data ->> 'bg_photo',
                    'font',     u.raw_user_meta_data ->> 'font'
                  ) from auth.users u where u.id = uid)
  );
end;
$$;
