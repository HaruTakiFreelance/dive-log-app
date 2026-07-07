"""
fetch_master_images.py — マスター図鑑の写真を iNaturalist API から取得する。

- 学名で検索し、CCライセンス付きの代表写真のみ採用（cc0 / cc-by / cc-by-nc）
- 中サイズ画像をダウンロードして fish-thumbs バケットの master/ にリホスト
- thumb_attribution に撮影者クレジットを保存（図鑑モーダルに表示して遵守）
- 1秒間隔のアクセス（iNaturalist推奨レート内）
- thumbnail_url が未設定のものだけ処理するので再実行可能

Usage:
  python3 fetch_master_images.py --dry-run    # 対象件数の確認
  python3 fetch_master_images.py --limit 20   # 動作確認
  python3 fetch_master_images.py              # 本実行
"""

import argparse
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL     = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    sys.exit("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定")

from supabase import create_client
sb = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

INAT_API = "https://api.inaturalist.org/v1/taxa"
HEADERS  = {"User-Agent": "dive-log-app fish encyclopedia (personal circle app)"}
ALLOWED_LICENSES = {"cc0", "cc-by", "cc-by-nc"}
DELAY_SEC = 1.0


def find_inat_photo(scientific_name: str) -> dict | None:
    """学名からCCライセンス付きの代表写真を探す"""
    resp = requests.get(INAT_API, params={
        "q": scientific_name, "rank": "species", "per_page": 3,
    }, timeout=15, headers=HEADERS)
    resp.raise_for_status()
    for taxon in resp.json().get("results", []):
        photo = taxon.get("default_photo")
        if not photo:
            continue
        license_code = (photo.get("license_code") or "").lower()
        if license_code not in ALLOWED_LICENSES:
            continue
        url = photo.get("medium_url") or photo.get("url", "").replace("square", "medium")
        if not url:
            continue
        return {
            "url": url,
            "attribution": photo.get("attribution") or f"iNaturalist ({license_code})",
        }
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    # thumbnail未設定 かつ 学名あり のマスターを対象に（ページングで全件取得）
    targets, offset = [], 0
    while True:
        page = (sb.table("fish_master")
                .select("id, name, scientific_name")
                .is_("thumbnail_url", "null")
                .not_.is_("scientific_name", "null")
                .order("name")
                .range(offset, offset + 999)
                .execute().data)
        targets.extend(page)
        if len(page) < 1000:
            break
        offset += 1000

    no_sci = sb.table("fish_master").select("id", count="exact") \
        .is_("thumbnail_url", "null").is_("scientific_name", "null").execute().count

    print(f"対象: {len(targets)}件（学名なしのため対象外: {no_sci}件）")
    if args.dry_run:
        print(f"推定所要時間: {len(targets) * DELAY_SEC / 60:.0f}分")
        return

    items = targets[: args.limit] if args.limit else targets
    ok = miss = err = 0
    for i, m in enumerate(items, 1):
        try:
            photo = find_inat_photo(m["scientific_name"])
            if photo:
                img = requests.get(photo["url"], timeout=20, headers=HEADERS)
                img.raise_for_status()
                dest = f"master/{m['id']}.jpg"
                sb.storage.from_("fish-thumbs").upload(
                    dest, img.content,
                    file_options={"content-type": "image/jpeg", "upsert": "true"},
                )
                sb.table("fish_master").update({
                    "thumbnail_url": f"storage:{dest}",
                    "thumb_attribution": photo["attribution"],
                }).eq("id", m["id"]).execute()
                ok += 1
            else:
                miss += 1
        except Exception as e:
            err += 1
            print(f"  [err] {m['name']}: {str(e)[:80]}")
        if i % 50 == 0:
            print(f"  {i}/{len(items)} (取得{ok} 該当なし{miss} エラー{err})")
        time.sleep(DELAY_SEC)

    total = ok + miss + err
    print(f"\n✅ 完了: 取得 {ok} / CC写真なし {miss} / エラー {err}  (ヒット率 {ok/total*100:.0f}%)" if total else "対象なし")
    print("   未設定分は admin/master-thumbs.html から手動で補完できます")


if __name__ == "__main__":
    main()
