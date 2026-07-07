// Supabase データアクセス層。全クエリはRLSにより自動的に「本人の行」に限定される。
import { supabase } from "./supabaseClient.js";
import { SUPABASE_URL } from "./config.js";

function throwIf(error) {
  if (error) throw new Error(error.message);
}

// ── ダイブ ──────────────────────────────────────────

export async function getLastDive() {
  const { data, error } = await supabase
    .from("dives")
    .select("date, dive_number, location, weight, buddy")
    .order("date", { ascending: false })
    .order("dive_number", { ascending: false })
    .limit(1);
  throwIf(error);
  return data[0] ?? null;
}

export async function listDives() {
  const { data, error } = await supabase
    .from("dives")
    .select("*, dive_fish(fish_id)")
    .order("date", { ascending: true })
    .order("dive_number", { ascending: true });
  throwIf(error);
  return data.map(d => ({ ...d, fish_ids: d.dive_fish.map(r => r.fish_id) }));
}

export async function addDive(userId, dive, fishIds) {
  const { data, error } = await supabase
    .from("dives").insert({ ...dive, user_id: userId }).select("id").single();
  throwIf(error);
  if (fishIds.length) {
    const rows = fishIds.map(fid => ({ dive_id: data.id, fish_id: fid, user_id: userId }));
    const { error: e2 } = await supabase.from("dive_fish").insert(rows);
    throwIf(e2);
  }
  return data.id;
}

export async function listRecentDives(limit = 50) {
  const { data, error } = await supabase
    .from("dives")
    .select("id, date, dive_number, location, point, video_links, dive_fish(fish_id)")
    .order("date", { ascending: false })
    .order("dive_number", { ascending: false })
    .limit(limit);
  throwIf(error);
  return data;
}

export async function appendFishToDive(userId, diveId, fishIds) {
  const rows = fishIds.map(fid => ({ dive_id: diveId, fish_id: fid, user_id: userId }));
  // 重複(既に紐づけ済み)は無視
  const { error } = await supabase
    .from("dive_fish")
    .upsert(rows, { onConflict: "dive_id,fish_id", ignoreDuplicates: true });
  throwIf(error);
}

export async function appendVideoLink(diveId, url) {
  const { data, error } = await supabase
    .from("dives").select("video_links").eq("id", diveId).single();
  throwIf(error);
  const existing = (data.video_links || "").split("\n").map(s => s.trim()).filter(Boolean);
  if (!existing.includes(url.trim())) existing.push(url.trim());
  const { error: e2 } = await supabase
    .from("dives").update({ video_links: existing.join("\n") }).eq("id", diveId);
  throwIf(e2);
}

// ── 魚図鑑 ──────────────────────────────────────────

export async function searchFish(query) {
  const { data, error } = await supabase
    .from("fish")
    .select("id, name")
    .ilike("name", `%${query}%`)
    .limit(20);
  throwIf(error);
  return data;
}

export async function listFish() {
  const { data, error } = await supabase
    .from("fish").select("*").order("name");
  throwIf(error);
  return data;
}

export async function addFish(userId, fish) {
  const { data, error } = await supabase
    .from("fish").insert({ ...fish, user_id: userId }).select("id").single();
  throwIf(error);
  return data.id;
}

export async function updateFishThumbnail(fishId, thumbnailUrl) {
  const { error } = await supabase
    .from("fish").update({ thumbnail_url: thumbnailUrl }).eq("id", fishId);
  throwIf(error);
}

export async function updateFish(fishId, patch) {
  const { error } = await supabase.from("fish").update(patch).eq("id", fishId);
  throwIf(error);
}

export async function updateDive(diveId, patch) {
  const { error } = await supabase.from("dives").update(patch).eq("id", diveId);
  throwIf(error);
}

// ── マスター図鑑（全員共通の参照データ） ─────────────

export async function listFishMaster() {
  // 1320件程度なのでページングで全件取得
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("fish_master").select("*").order("name")
      .range(offset, offset + 999);
    throwIf(error);
    all.push(...data);
    if (data.length < 1000) break;
  }
  return all;
}

export async function searchFishMaster(query) {
  const { data, error } = await supabase
    .from("fish_master")
    .select("id, name, family, category")
    .ilike("name", `%${query}%`)
    .limit(15);
  throwIf(error);
  return data;
}

export async function getFishMaster(masterId) {
  const { data, error } = await supabase
    .from("fish_master").select("*").eq("id", masterId).single();
  throwIf(error);
  return data;
}

/** マスターから個人図鑑にコピーを作成（コピーオンライトの起点） */
export async function addFishFromMaster(userId, masterId, firstSeen) {
  const m = await getFishMaster(masterId);
  const { data, error } = await supabase.from("fish").insert({
    user_id:         userId,
    master_id:       m.id,
    name:            m.name,
    english_name:    m.english_name,
    scientific_name: m.scientific_name,
    category:        m.category,
    order_name:      m.order_name,
    family:          m.family,
    genus:           m.genus,
    rarity:          m.rarity,
    popularity:      m.popularity,
    photo_ease:      m.photo_ease,
    memo:            m.memo,
    first_seen:      firstSeen ?? null,
  }).select("id").single();
  throwIf(error);
  return data.id;
}

/** マスターのサムネイル更新（管理者のみRLSで許可される） */
export async function updateMasterThumbnail(masterId, thumbnailUrl, attribution = null) {
  const { error } = await supabase.from("fish_master")
    .update({ thumbnail_url: thumbnailUrl, thumb_attribution: attribution })
    .eq("id", masterId);
  throwIf(error);
}

export async function uploadMasterThumb(masterId, file) {
  const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `master/${masterId}.${ext}`;
  const { error } = await supabase.storage.from("fish-thumbs").upload(path, file, {
    contentType: file.type || "image/jpeg", upsert: true,
  });
  throwIf(error);
  return "storage:" + path;
}

// ── セッション総評 ──────────────────────────────────

export async function listReviews() {
  const { data, error } = await supabase.from("session_reviews").select("*");
  throwIf(error);
  return data;
}

export async function upsertReview(userId, date, location, text) {
  const { error } = await supabase
    .from("session_reviews")
    .upsert({ user_id: userId, date, location, text }, { onConflict: "user_id,date,location" });
  throwIf(error);
}

// ── 写真 ────────────────────────────────────────────

export async function uploadPhoto(userId, file, date, location, caption, diveId = null) {
  const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${date}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, {
    contentType: file.type || "image/jpeg",
  });
  throwIf(error);
  const { error: e2 } = await supabase.from("photos").insert({
    user_id: userId, date, location, caption: caption || null,
    storage_path: path, dive_id: diveId,
  });
  throwIf(e2);
  return path;
}

export async function listPhotos() {
  const { data, error } = await supabase
    .from("photos").select("*").order("created_at");
  throwIf(error);
  return data;
}

/** Storage の非公開ファイルを表示するための署名付きURLを一括取得 */
export async function signedPhotoUrls(paths, expiresSec = 3600) {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from("photos")
    .createSignedUrls(paths, expiresSec);
  throwIf(error);
  const map = {};
  data.forEach((r, i) => { if (r.signedUrl) map[paths[i]] = r.signedUrl; });
  return map;
}

export async function uploadFishThumb(userId, fishId, file) {
  const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${fishId}.${ext}`;
  const { error } = await supabase.storage.from("fish-thumbs").upload(path, file, {
    contentType: file.type || "image/jpeg", upsert: true,
  });
  throwIf(error);
  return "storage:" + path;   // thumbnail_url には storage: プレフィックスで保存
}

export async function signedThumbUrls(storagePaths, expiresSec = 3600) {
  if (!storagePaths.length) return {};
  const { data, error } = await supabase.storage.from("fish-thumbs")
    .createSignedUrls(storagePaths, expiresSec);
  throwIf(error);
  const map = {};
  data.forEach((r, i) => { if (r.signedUrl) map[storagePaths[i]] = r.signedUrl; });
  return map;
}

// ── 深度プロファイル ─────────────────────────────────

export async function saveDepthProfile(userId, diveId, profile, warning) {
  const { error } = await supabase.from("depth_profiles").upsert(
    { user_id: userId, dive_id: diveId, profile, warning: warning || null },
    { onConflict: "dive_id" },
  );
  throwIf(error);
}

export async function listDepthProfiles() {
  const { data, error } = await supabase.from("depth_profiles").select("*");
  throwIf(error);
  return data;
}

export async function updateDiveFromComputer(diveId, d) {
  const patch = {};
  if (d.max_depth  != null) patch.max_depth  = d.max_depth;
  if (d.avg_depth  != null) patch.avg_depth  = d.avg_depth;
  if (d.duration   != null) patch.duration   = d.duration;
  if (d.start_time)         patch.start_time = d.start_time;
  if (d.end_time)           patch.end_time   = d.end_time;
  if (d.water_temp != null) patch.water_temp = d.water_temp;
  if (!Object.keys(patch).length) return;
  const { error } = await supabase.from("dives").update(patch).eq("id", diveId);
  throwIf(error);
}

// ── 公開共有 ────────────────────────────────────────

/** 自分の共有トークンを取得（なければ作成） */
export async function getOrCreateShareToken(userId) {
  const { data, error } = await supabase.from("shares").select("token").maybeSingle();
  throwIf(error);
  if (data) return data.token;
  const { data: created, error: e2 } = await supabase
    .from("shares").insert({ user_id: userId }).select("token").single();
  throwIf(e2);
  return created.token;
}

/** 共有トークンからログブック一式を取得（未ログインでも可） */
export async function fetchSharedLogbook(token) {
  const { data, error } = await supabase.rpc("shared_logbook", { share_token: token });
  throwIf(error);
  return data;   // null = 無効なトークン
}

/** 公開バケットのURL（共有ページ用） */
export function publicStorageUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// ── テーマ用壁紙（photosテーブルには登録しない = ログの写真一覧に混ざらない） ──

export async function uploadWallpaper(userId, file) {
  const path = `${userId}/bg_${crypto.randomUUID().slice(0, 8)}.jpg`;
  const { error } = await supabase.storage.from("photos").upload(path, file, {
    contentType: file.type || "image/jpeg",
  });
  throwIf(error);
  return path;
}

export async function deleteWallpaperFile(path) {
  // 壁紙としてアップロードしたファイル(bg_プレフィックス)のみ削除対象
  if (!path || !path.includes("/bg_")) return;
  await supabase.storage.from("photos").remove([path]);
}

/** 指定日の Max Depth 未入力ダイブを本数順で返す（CSV照合用） */
export async function findUnmatchedDivesByDate(date) {
  const { data, error } = await supabase
    .from("dives")
    .select("id, date, dive_number, location, point")
    .eq("date", date)
    .is("max_depth", null)
    .order("dive_number", { ascending: true });
  throwIf(error);
  return data;
}
