// テーマ管理: 選択はSupabaseのユーザーメタデータに保存され、全端末で同期される。
import { supabase } from "./supabaseClient.js";

export const THEMES = {
  classic:  { label: "深海",  desc: "クラシック",     preview: "linear-gradient(180deg, #03111f, #071e32)" },
  ink:      { label: "墨",    desc: "モノトーン",     preview: "linear-gradient(180deg, #0b0b0e, #1e1e26)" },
  sunset:   { label: "夕凪",  desc: "夕暮れの海",     preview: "linear-gradient(180deg, #1a0f2e, #8a4038)" },
  tropical: { label: "南国",  desc: "エメラルド",     preview: "linear-gradient(180deg, #01262b, #056059)" },
};

export function applyTheme(name) {
  if (name && name !== "classic" && THEMES[name]) {
    document.body.dataset.theme = name;
  } else {
    delete document.body.dataset.theme;
  }
}

/** ログイン済みユーザーの保存テーマを適用して名前を返す */
export async function applyUserTheme() {
  const { data: { session } } = await supabase.auth.getSession();
  const name = session?.user?.user_metadata?.theme ?? "classic";
  applyTheme(name);
  return name;
}

/** テーマを保存して即時適用 */
export async function saveTheme(name) {
  applyTheme(name);
  const { error } = await supabase.auth.updateUser({ data: { theme: name } });
  if (error) throw new Error(error.message);
}
