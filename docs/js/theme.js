// テーマ管理: カラープリセット × 背景写真（自分の写真） × フォント。
// 選択はSupabaseのユーザーメタデータに保存され、全端末で同期される。
import { supabase } from "./supabaseClient.js";
import { SUPABASE_URL } from "./config.js";

export const THEMES = {
  classic:  { label: "深海",  desc: "クラシック", preview: "linear-gradient(180deg, #03111f, #071e32)" },
  ink:      { label: "墨",    desc: "モノトーン", preview: "linear-gradient(180deg, #0b0b0e, #1e1e26)" },
  sunset:   { label: "夕凪",  desc: "夕暮れの海", preview: "linear-gradient(180deg, #1a0f2e, #8a4038)" },
  tropical: { label: "南国",  desc: "エメラルド", preview: "linear-gradient(180deg, #01262b, #056059)" },
};

export const FONTS = {
  auto:   { label: "おまかせ", desc: "テーマ標準", family: null },
  serif:  { label: "Playfair", desc: "欧文セリフ", family: "'Playfair Display', Georgia, serif" },
  mincho: { label: "明朝",     desc: "しっとり",   family: '"Hiragino Mincho ProN", "Yu Mincho", serif' },
  gothic: { label: "ゴシック", desc: "すっきり",   family: '"Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif' },
  maru:   { label: "丸ゴシック", desc: "やわらか", family: '"Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif' },
};

function photoUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/photos/${path}`;
}

/** 現在の設定をまとめて適用する */
export function applyPrefs({ theme, bg_photo, font } = {}) {
  // カラープリセット
  if (theme && theme !== "classic" && THEMES[theme]) {
    document.body.dataset.theme = theme;
  } else {
    delete document.body.dataset.theme;
  }

  // 背景写真（固定レイヤー + 暗めオーバーレイで文字とカードを読みやすく保つ）
  let layer = document.getElementById("bg-photo-layer");
  if (bg_photo) {
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "bg-photo-layer";
      layer.className = "bg-photo-layer";
      document.body.prepend(layer);
    }
    layer.style.backgroundImage =
      `linear-gradient(180deg, rgba(4,12,22,0.78) 0%, rgba(4,12,22,0.66) 45%, rgba(4,12,22,0.82) 100%), url("${photoUrl(bg_photo)}")`;
  } else if (layer) {
    layer.remove();
  }

  // フォント
  if (font && FONTS[font]?.family) {
    document.body.style.setProperty("--font-body", FONTS[font].family);
  } else {
    document.body.style.removeProperty("--font-body");
  }
}

/** ログイン済みユーザーの保存設定を適用して返す */
export async function applyUserTheme() {
  const { data: { session } } = await supabase.auth.getSession();
  const meta = session?.user?.user_metadata ?? {};
  const prefs = {
    theme:    meta.theme ?? "classic",
    bg_photo: meta.bg_photo ?? null,
    font:     meta.font ?? "auto",
  };
  applyPrefs(prefs);
  return prefs;
}

/** 設定を部分更新して保存・即時適用 */
export async function savePrefs(current, patch) {
  const next = { ...current, ...patch };
  applyPrefs(next);
  const { error } = await supabase.auth.updateUser({
    data: { theme: next.theme, bg_photo: next.bg_photo, font: next.font },
  });
  if (error) throw new Error(error.message);
  return next;
}
