-- 003: ダイブ単位の写真
-- photos に dive_id を追加。設定されている写真はセッションページの
-- 該当ダイブ内（動画の上）に表示される。null のものは従来どおり
-- セッション上部の写真ストリップに表示される。

alter table public.photos
  add column dive_id uuid references public.dives (id) on delete set null;

create index photos_dive_idx on public.photos (dive_id);
