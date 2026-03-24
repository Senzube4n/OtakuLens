"""Full pipeline test — uploads all downloaded Naver chapters and translates them.

Usage:
    python -m backend.tests.test_full_pipeline

This script:
1. Creates a series
2. Uploads all chapters from naver_raws
3. Waits for each chapter's pipeline to complete
4. Reports results (text regions found, translations, errors)
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

# Fix Windows console encoding
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import httpx

BASE_URL = "http://localhost:8000"
RAWS_DIR = Path("backend/data/naver_raws/844063")
MAX_CONCURRENT = 1  # Process one chapter at a time to avoid overloading
START_FROM_EP = int(os.environ.get("START_FROM", "1"))  # Resume from this episode


async def main():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        # Health check
        r = await client.get("/api/health")
        if r.status_code != 200:
            print("ERROR: Backend not running!")
            return
        print("Backend is healthy\n")

        # Create or reuse series
        r = await client.get("/api/series/")
        existing = r.json()
        if existing:
            series = existing[0]
            series_id = series["id"]
            print(f"Reusing series: {series['title']} ({series_id})\n")
        else:
            r = await client.post("/api/series/", json={
                "title": "Villain's Sponsor",
                "source_language": "ko",
                "target_language": "en",
            })
            series = r.json()
            series_id = series["id"]
            print(f"Created series: {series['title']} ({series_id})\n")

        # Find episodes with content
        episodes = sorted([
            d for d in RAWS_DIR.iterdir()
            if d.is_dir() and list(d.glob("*.jpg"))
        ], key=lambda d: d.name)

        print(f"Found {len(episodes)} episodes with content\n")
        print("=" * 80)

        results = []
        for ep_dir in episodes:
            ep_num = int(ep_dir.name.split("_")[1])
            if ep_num < START_FROM_EP:
                continue
            pages = sorted(ep_dir.glob("*.jpg"))

            print(f"\n{'=' * 80}")
            print(f"EPISODE {ep_num}: {len(pages)} pages")
            print(f"{'=' * 80}")

            # Upload chapter
            start = time.time()
            files = [("files", (p.name, p.read_bytes(), "image/jpeg")) for p in pages]

            try:
                r = await client.post(
                    f"/api/series/{series_id}/chapters/upload",
                    data={"chapter_number": str(ep_num)},
                    files=files,
                    timeout=120.0,
                )
                if r.status_code != 201:
                    print(f"  UPLOAD FAILED: {r.status_code} {r.text[:200]}")
                    results.append({"ep": ep_num, "status": "upload_failed", "error": r.text[:200]})
                    continue
            except Exception as e:
                print(f"  UPLOAD ERROR: {e}")
                results.append({"ep": ep_num, "status": "upload_error", "error": str(e)})
                continue

            chapter = r.json()
            chapter_id = chapter["id"]
            upload_time = time.time() - start
            print(f"  Uploaded in {upload_time:.1f}s — Chapter ID: {chapter_id}")

            # Wait for pipeline to complete
            pipeline_start = time.time()
            last_status = ""
            timeout_at = time.time() + 900  # 15 minute timeout per chapter

            while time.time() < timeout_at:
                try:
                    r = await client.get(f"/api/chapters/{chapter_id}")
                    status = r.json()["status"]
                except Exception:
                    await asyncio.sleep(5)
                    continue

                if status != last_status:
                    elapsed = time.time() - pipeline_start
                    print(f"  [{elapsed:6.1f}s] Status: {status}")
                    last_status = status

                if status in ("completed", "failed"):
                    break

                await asyncio.sleep(5)

            pipeline_time = time.time() - pipeline_start

            if last_status == "completed":
                # Get results
                try:
                    r = await client.get(f"/api/chapters/{chapter_id}/pages")
                    pages_data = r.json()

                    total_regions = 0
                    translated_regions = 0
                    for page in pages_data:
                        for region in page.get("text_regions", []):
                            total_regions += 1
                            if region.get("translated_text"):
                                translated_regions += 1

                    print(f"  COMPLETED in {pipeline_time:.1f}s")
                    print(f"  Text regions: {total_regions} detected, {translated_regions} translated")

                    results.append({
                        "ep": ep_num,
                        "status": "completed",
                        "pages": len(pages),
                        "regions": total_regions,
                        "translated": translated_regions,
                        "time": round(pipeline_time, 1),
                    })
                except Exception as e:
                    print(f"  Result fetch error: {e}")
                    results.append({"ep": ep_num, "status": "completed", "time": round(pipeline_time, 1)})
            else:
                error_msg = "unknown"
                try:
                    r = await client.get(f"/api/chapters/{chapter_id}")
                    error_msg = r.json().get("error_message") or "timeout/unknown"
                except Exception:
                    pass
                print(f"  FAILED after {pipeline_time:.1f}s: {error_msg[:200]}")
                results.append({
                    "ep": ep_num,
                    "status": last_status,
                    "error": error_msg[:200],
                    "time": round(pipeline_time, 1),
                })

        # Summary
        print(f"\n\n{'=' * 80}")
        print("FULL TEST SUMMARY")
        print(f"{'=' * 80}")

        completed = [r for r in results if r["status"] == "completed"]
        failed = [r for r in results if r["status"] != "completed"]

        print(f"Total episodes: {len(results)}")
        print(f"Completed: {len(completed)}")
        print(f"Failed: {len(failed)}")

        if completed:
            total_regions = sum(r.get("regions", 0) for r in completed)
            total_translated = sum(r.get("translated", 0) for r in completed)
            total_time = sum(r.get("time", 0) for r in completed)
            print(f"Total text regions: {total_regions}")
            print(f"Total translated: {total_translated}")
            print(f"Total processing time: {total_time:.0f}s ({total_time/60:.1f}min)")
            if total_regions > 0:
                print(f"Translation rate: {total_translated/total_regions*100:.1f}%")

        if failed:
            print(f"\nFailed episodes:")
            for r in failed:
                print(f"  Episode {r['ep']}: {r.get('error', 'unknown')}")

        # Save results
        with open("backend/tests/full_pipeline_results.json", "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nDetailed results saved to backend/tests/full_pipeline_results.json")


if __name__ == "__main__":
    asyncio.run(main())
