"""
import_fish_master.py — 「ダイバーの海水魚図鑑」(shiny-ace.com) からマスター図鑑を構築する。

- テキストデータのみ取得（画像は取得しない。画像は fetch_master_images.py でiNaturalistから）
- 「〇〇の1種」「〇〇の一種」のような未同定エントリはスキップ
- 0.4秒間隔の丁寧なアクセス（全体で約10分・原則1回きり）
- name基準でupsertするため再実行可能
- 最後に既存ユーザーの fish 行へ master_id をバックフィル

Usage:
  python3 import_fish_master.py --dry-run   # 件数確認のみ
  python3 import_fish_master.py             # 本実行
"""

import argparse
import os
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL     = os.getenv("SUPABASE_URL")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    sys.exit("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定")

from supabase import create_client
sb = create_client(SUPABASE_URL, SERVICE_ROLE_KEY)

INDEX_URL = "https://shiny-ace.com/sakuin.html"
BASE_URL  = "https://shiny-ace.com/"
HEADERS   = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
DELAY_SEC = 0.4

# 未同定エントリ（「〜の1種」「〜の一種」「〜sp.」等）
UNIDENTIFIED_RE = re.compile(r"の[1一]種|[（(]?sp\.?[）)]?$")

CATEGORY_KEYWORDS: list[tuple[str, list[str]]] = [
    ("軟体動物", ["軟体動物", "頭足綱", "腹足綱", "二枚貝綱", "タコ目", "イカ目"]),
    ("甲殻類",   ["甲殻類", "十脚目", "口脚目", "フジツボ"]),
    ("棘皮動物", ["棘皮動物", "ヒトデ綱", "ウニ綱", "ナマコ綱"]),
    ("爬虫類",   ["爬虫類", "ウミガメ科", "カメ目"]),
    ("哺乳類",   ["哺乳類", "クジラ目", "鯨偶蹄目"]),
]


def fetch_index() -> dict[str, str]:
    resp = requests.get(INDEX_URL, timeout=15, headers=HEADERS)
    soup = BeautifulSoup(resp.content, "html.parser")
    index: dict[str, str] = {}
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        name = a.get_text(strip=True)
        if name and href.startswith("zukan/"):
            index[name] = BASE_URL + href
    return index


def category_from_text(text: str) -> str:
    for cat, keywords in CATEGORY_KEYWORDS:
        if any(kw in text for kw in keywords):
            return cat
    return "魚類"


def extract_fish_page(url: str) -> dict:
    resp = requests.get(url, timeout=15, headers=HEADERS)
    soup = BeautifulSoup(resp.content, "html.parser")
    text = soup.get_text(separator="\n")

    def find_field(label: str) -> str:
        m = re.search(rf"{label}[：:　\s]*([^\n]+)", text)
        return m.group(1).strip() if m else ""

    def find_stars(label: str) -> str:
        m = re.search(rf"{label}[：:　\s]*([★☆\n]+)", text)
        return m.group(1).replace("\n", "").strip() if m else ""

    sci_m = re.search(r"\n([A-Z][a-z]+ [a-z][a-z]+(?:\s+[a-z]+)?)\n", text)
    habitat      = find_field("生息")
    distribution = find_field("分布")

    order_m  = re.search(r"-\s*(.+目)\s*-", text)
    family_m = re.search(r"\n([^\n]+科)\n", text)
    genus_m  = re.search(r"-\s*(.+属)", text)

    memo_parts = [p for p in [habitat, f"分布：{distribution}" if distribution else ""] if p]

    return {
        "english_name":    find_field("英名") or None,
        "scientific_name": (sci_m.group(1).strip() if sci_m else None),
        "category":        category_from_text(text),
        "order_name":      (order_m.group(1).strip() if order_m else None),
        "family":          (family_m.group(1).strip() if family_m else None),
        "genus":           (genus_m.group(1).strip() if genus_m else None),
        "rarity":          find_stars("レア度") or None,
        "popularity":      find_stars("人気") or None,
        "photo_ease":      find_stars("撮り易さ") or None,
        "memo":            ("　".join(memo_parts) or None),
    }


def backfill_master_ids():
    """既存の個人fish行を正規化名でマスターに紐付ける"""
    masters = sb.table("fish_master").select("id, name").execute().data
    by_name = {m["name"].strip(): m["id"] for m in masters}

    fish_rows = sb.table("fish").select("id, name, master_id").is_("master_id", "null").execute().data
    linked = 0
    unmatched = []
    for f in fish_rows:
        mid = by_name.get((f["name"] or "").strip())
        if mid:
            sb.table("fish").update({"master_id": mid}).eq("id", f["id"]).execute()
            linked += 1
        else:
            unmatched.append(f["name"])
    print(f"\n🔗 バックフィル: {linked}件紐付け / 未マッチ {len(unmatched)}件")
    if unmatched:
        print("  未マッチ:", ", ".join(unmatched))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="先頭N件のみ処理（動作確認用）")
    args = parser.parse_args()

    print("📖 索引を取得中...")
    index = fetch_index()
    print(f"  索引エントリ: {len(index)}件")

    skipped_unidentified = [n for n in index if UNIDENTIFIED_RE.search(n.strip())]
    targets = {n: u for n, u in index.items() if not UNIDENTIFIED_RE.search(n.strip())}
    print(f"  未同定エントリのスキップ: {len(skipped_unidentified)}件")
    print(f"  取り込み対象: {len(targets)}件")

    if args.dry_run:
        print("\n--dry-run のため終了。スキップ例:", skipped_unidentified[:10])
        return

    items = list(targets.items())
    if args.limit:
        items = items[: args.limit]

    ok, failed = 0, []
    est = len(items) * DELAY_SEC / 60
    print(f"\n🐠 {len(items)}件をスクレイプします（推定 {est:.0f}分）...")
    for i, (name, url) in enumerate(items, 1):
        try:
            data = extract_fish_page(url)
            row = {"name": name.strip(), "source_url": url, **data}
            sb.table("fish_master").upsert(row, on_conflict="name").execute()
            ok += 1
        except Exception as e:
            failed.append((name, str(e)[:80]))
        if i % 50 == 0:
            print(f"  {i}/{len(items)} 完了 (成功{ok} 失敗{len(failed)})")
        time.sleep(DELAY_SEC)

    print(f"\n✅ 完了: 成功 {ok} / 失敗 {len(failed)}")
    if failed:
        print("  失敗一覧:")
        for name, err in failed:
            print(f"   - {name}: {err}")

    backfill_master_ids()


if __name__ == "__main__":
    main()
