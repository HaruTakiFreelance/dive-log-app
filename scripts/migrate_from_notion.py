"""
migrate_from_notion.py — 旧dive-log(Notion)から新アプリ(Supabase)へデータ移行する。

移行対象:
  - ダイブログ（詳細ログDB）        → dives
  - 魚図鑑（サムネイル含む）        → fish + fish-thumbs Storage
  - 見れた魚リレーション            → dive_fish
  - セッション総評                  → session_reviews
  - 写真ログ（ローカル画像）        → photos + photos Storage
  - 深度プロファイル(JSONファイル)  → depth_profiles

Usage:
  python3 migrate_from_notion.py --dry-run   # 件数確認のみ
  python3 migrate_from_notion.py             # 本実行

service_role キーを使うためRLSをバイパスする。TARGET_USER_ID の本人データとして投入される。
"""

import argparse
import json
import mimetypes
import os
import sys
from pathlib import Path

import requests as http
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

NOTION_TOKEN     = os.getenv("NOTION_TOKEN")
SUPABASE_URL     = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
TARGET_USER_ID   = os.getenv("TARGET_USER_ID")
OLD_PROJECT_DIR  = Path(os.getenv("OLD_PROJECT_DIR", ""))

for name in ("NOTION_TOKEN", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TARGET_USER_ID"):
    if not os.getenv(name):
        sys.exit(f"❌ {name} が未設定（scripts/.env を確認）")
if not OLD_PROJECT_DIR.exists():
    sys.exit(f"❌ OLD_PROJECT_DIR が見つかりません: {OLD_PROJECT_DIR}")

from notion_client import Client as NotionClient
from supabase import create_client

notion = NotionClient(auth=NOTION_TOKEN)
sb     = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

ids = json.loads((OLD_PROJECT_DIR / "data" / "notion_ids.json").read_text())
PHOTOS_DIR   = OLD_PROJECT_DIR / "docs"                    # photos/xxx.jpg の相対パス基準
THUMBS_DIR   = OLD_PROJECT_DIR / "docs" / "fish_thumbs"
PROFILES_DIR = OLD_PROJECT_DIR / "data" / "depth_profiles"


# ── Notionプロパティ取得ヘルパー（build_logbook.py と同一） ──────────────────
def _txt(props, key):
    p = props.get(key, {})
    rt = p.get("rich_text") or p.get("title") or []
    return rt[0]["plain_text"] if rt else ""

def _num(props, key):
    p = props.get(key)
    return p["number"] if p and p.get("number") is not None else None

def _date(props, key):
    p = props.get(key)
    return p["date"]["start"] if p and p.get("date") else None

def _select(props, key):
    p = props.get(key)
    return p["select"]["name"] if p and p.get("select") else None

def _relation_ids(props, key):
    return [r["id"] for r in props.get(key, {}).get("relation", [])]

def _files(props, key):
    out = []
    for f in props.get(key, {}).get("files", []):
        if f.get("type") == "external":
            out.append(f["external"]["url"])
        elif f.get("file"):
            out.append(f["file"]["url"])
    return out


def query_all(db_id: str) -> list:
    results, cursor = [], None
    while True:
        kw = {"database_id": db_id, "page_size": 100}
        if cursor:
            kw["start_cursor"] = cursor
        res = notion.databases.query(**kw)
        results.extend(res["results"])
        if not res["has_more"]:
            break
        cursor = res["next_cursor"]
    return results


def upload_to_storage(bucket: str, dest_path: str, data: bytes, content_type: str):
    sb.storage.from_(bucket).upload(
        dest_path, data,
        file_options={"content-type": content_type, "upsert": "true"},
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="件数確認のみ（書き込みなし）")
    args = parser.parse_args()

    report = {"dry_run": args.dry_run}

    # ── 1. Notionから全データ取得 ─────────────────────
    print("📥 Notionからデータ取得中...")
    raw_dives   = query_all(ids["dive_log_db"])
    raw_fish    = query_all(ids["fish_db"])
    raw_photos  = query_all(ids["photo_db"]) if ids.get("photo_db") else []
    raw_reviews = query_all(ids["review_db"]) if ids.get("review_db") else []
    print(f"  ダイブ {len(raw_dives)} / 魚 {len(raw_fish)} / 写真ログ {len(raw_photos)} / 総評 {len(raw_reviews)}")

    profile_files = sorted(PROFILES_DIR.glob("*.json")) if PROFILES_DIR.exists() else []
    print(f"  深度プロファイル {len(profile_files)}件")

    report["notion_counts"] = {
        "dives": len(raw_dives), "fish": len(raw_fish),
        "photo_logs": len(raw_photos), "reviews": len(raw_reviews),
        "depth_profiles": len(profile_files),
    }

    if args.dry_run:
        print("\n--dry-run のため書き込みは行いません")
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return

    uid = TARGET_USER_ID

    # ── 2. 魚図鑑（サムネイル → Storage） ─────────────
    print("\n🐠 魚図鑑を移行中...")
    fish_id_map = {}   # notion_id → supabase uuid
    thumb_ok = thumb_skip = 0
    for page in raw_fish:
        p = page["properties"]
        name = _txt(p, "名前")
        if not name:
            continue

        row = {
            "user_id":         uid,
            "name":            name,
            "english_name":    _txt(p, "英名") or None,
            "scientific_name": _txt(p, "学名") or None,
            "category":        _select(p, "分類"),
            "order_name":      _txt(p, "目") or None,
            "family":          _txt(p, "科") or None,
            "genus":           _txt(p, "属") or None,
            "rarity":          _txt(p, "レア度") or None,
            "popularity":      _txt(p, "人気") or None,
            "photo_ease":      _txt(p, "撮りやすさ") or None,
            "memo":            _txt(p, "メモ") or None,
            "first_seen":      _date(p, "初目撃日"),
        }
        res = sb.table("fish").insert(row).execute()
        new_id = res.data[0]["id"]
        fish_id_map[page["id"]] = new_id

        # サムネイル: ローカルキャッシュ優先 → NotionのURL
        thumbs = _files(p, "サムネイル")
        data, ext = None, "jpg"
        cache = THUMBS_DIR / f"{page['id'].replace('-', '')}.jpg"
        if cache.exists():
            data = cache.read_bytes()
        elif thumbs:
            try:
                r = http.get(thumbs[0], timeout=20)
                r.raise_for_status()
                data = r.content
                guessed = mimetypes.guess_extension(r.headers.get("content-type", "")) or ".jpg"
                ext = guessed.lstrip(".")
            except Exception as e:
                print(f"  [warn] {name} のサムネイル取得失敗: {e}")

        if data:
            dest = f"{uid}/{new_id}.{ext}"
            upload_to_storage("fish-thumbs", dest, data, f"image/{'jpeg' if ext == 'jpg' else ext}")
            sb.table("fish").update({"thumbnail_url": f"storage:{dest}"}).eq("id", new_id).execute()
            thumb_ok += 1
        else:
            thumb_skip += 1
    print(f"  {len(fish_id_map)}種を移行（サムネ {thumb_ok}件 / なし {thumb_skip}件）")
    report["fish_migrated"] = len(fish_id_map)
    report["thumbs_uploaded"] = thumb_ok

    # ── 3. ダイブ + dive_fish ─────────────────────────
    print("\n🤿 ダイブログを移行中...")
    dive_key_map = {}   # (date, start_time) → dive uuid
    junction_count = 0
    for page in raw_dives:
        p = page["properties"]
        date = _date(p, "日付")
        if not date:
            continue
        row = {
            "user_id":     uid,
            "date":        date,
            "dive_number": _num(p, "何本目か"),
            "location":    _txt(p, "場所"),
            "point":       _txt(p, "ポイント") or None,
            "start_time":  _txt(p, "開始時刻") or None,
            "end_time":    _txt(p, "終了時刻") or None,
            "duration":    _num(p, "潜水時間"),
            "max_depth":   _num(p, "Max Depth"),
            "avg_depth":   _num(p, "平均水深"),
            "weight":      _num(p, "ウェイト"),
            "water_temp":  _num(p, "水温(℃)"),
            "weather":     _select(p, "天気"),
            "wave_height": _num(p, "波の高さ(m)"),
            "cost":        _num(p, "かかった金額"),
            "comment":     _txt(p, "コメント") or None,
            "buddy":       _txt(p, "バディ") or None,
            "video_links": _txt(p, "動画リンク") or None,
        }
        res = sb.table("dives").insert(row).execute()
        dive_id = res.data[0]["id"]
        if row["start_time"]:
            dive_key_map[(date, row["start_time"])] = dive_id

        links = [
            {"dive_id": dive_id, "fish_id": fish_id_map[nid], "user_id": uid}
            for nid in _relation_ids(p, "見れた魚") if nid in fish_id_map
        ]
        if links:
            sb.table("dive_fish").insert(links).execute()
            junction_count += len(links)
    print(f"  ダイブ{len(raw_dives)}本 / 魚リレーション{junction_count}件")
    report["dives_migrated"] = len(raw_dives)
    report["dive_fish_links"] = junction_count

    # ── 4. セッション総評 ─────────────────────────────
    print("\n📝 セッション総評を移行中...")
    review_count = 0
    for page in raw_reviews:
        p = page["properties"]
        date = _date(p, "日付")
        location = _txt(p, "場所")
        text = _txt(p, "総評")
        if not date or not text:
            continue
        sb.table("session_reviews").upsert(
            {"user_id": uid, "date": date, "location": location, "text": text},
            on_conflict="user_id,date,location",
        ).execute()
        review_count += 1
    print(f"  {review_count}件")
    report["reviews_migrated"] = review_count

    # ── 5. 深度プロファイル ───────────────────────────
    print("\n📊 深度プロファイルを移行中...")
    profile_ok = profile_skip = 0
    for f in profile_files:
        data = json.loads(f.read_text())
        key = (data.get("date"), data.get("start_time"))
        dive_id = dive_key_map.get(key)
        if not dive_id:
            print(f"  [warn] 対応ダイブなし: {f.name}")
            profile_skip += 1
            continue
        sb.table("depth_profiles").upsert({
            "user_id": uid, "dive_id": dive_id,
            "profile": data.get("profile", []),
            "warning": data.get("warning") or None,
        }, on_conflict="dive_id").execute()
        profile_ok += 1
    print(f"  {profile_ok}件（スキップ {profile_skip}件）")
    report["profiles_migrated"] = profile_ok

    # ── 6. 写真 ───────────────────────────────────────
    print("\n📷 写真を移行中...")
    photo_ok = photo_external = photo_missing = 0
    for page in raw_photos:
        p = page["properties"]
        date = _date(p, "日付")
        location = _txt(p, "場所")
        raw = _txt(p, "写真")
        if not date:
            continue
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            url, cap = (line.split(" | ", 1) + [""])[:2] if " | " in line else (line, "")
            url = url.strip()
            if not url.startswith("photos/"):
                photo_external += 1   # 外部リンク(Google Photos等)は移行対象外
                continue
            src = PHOTOS_DIR / url
            if not src.exists():
                print(f"  [warn] ファイルなし: {url}")
                photo_missing += 1
                continue
            dest = f"{uid}/{src.name}"
            ctype = mimetypes.guess_type(src.name)[0] or "image/jpeg"
            upload_to_storage("photos", dest, src.read_bytes(), ctype)
            sb.table("photos").insert({
                "user_id": uid, "date": date, "location": location,
                "caption": cap.strip() or None, "storage_path": dest,
            }).execute()
            photo_ok += 1
    print(f"  {photo_ok}枚アップロード（外部リンク{photo_external}件は対象外 / 欠損{photo_missing}件）")
    report["photos_migrated"]  = photo_ok
    report["photos_external_skipped"] = photo_external

    # ── レポート ──────────────────────────────────────
    out = Path(__file__).parent / "migration_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\n✅ 移行完了。レポート: {out}")


if __name__ == "__main__":
    main()
