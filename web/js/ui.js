// 共通UIヘルパー

export function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function showAlert(msg, type = "success", areaId = "alert-area") {
  const area = document.getElementById(areaId);
  if (!area) return;
  const cls = type === "error" ? "alert-error" : "alert-success";
  area.innerHTML = `<div class="alert ${cls}">${esc(msg)}</div>`;
}

export function fmtNum(v) {
  return v == null ? "—" : String(v);
}

/** 画像をブラウザ内で縦1280pxにリサイズしてJPEG Blobを返す（動画・非画像はそのまま） */
export async function resizeImage(file, maxHeight = 1280) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.height <= maxHeight) { bitmap.close(); return file; }
    const scale  = maxHeight / bitmap.height;
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(bitmap.width * scale);
    canvas.height = maxHeight;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.86));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;   // HEIC等でデコードできない場合は原本のままアップロード
  }
}

/** "YYYY-MM-DD" の今日 */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
