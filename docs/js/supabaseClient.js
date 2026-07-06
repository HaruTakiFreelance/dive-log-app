import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** 現在のページから web ルートへの相対パス（record/ や admin/ 配下は1階層上） */
export function relativeRoot() {
  return (location.pathname.includes("/record/") || location.pathname.includes("/admin/"))
    ? "../" : "./";
}

/**
 * ログイン済みユーザーを返す。未ログインならログイン画面へ飛ばす。
 * 各ページの先頭で呼ぶ。
 */
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const here = location.pathname + location.search;
    location.href = relativeRoot() + "login.html?next=" + encodeURIComponent(here);
    return null;
  }
  return session.user;
}

export async function signOut() {
  await supabase.auth.signOut();
  location.href = relativeRoot() + "login.html";
}
