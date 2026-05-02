"""
Uber Driver Trip Scraper
Logs into drivers.uber.com and extracts all trip history week by week.

Usage:
    pip install playwright pandas openpyxl
    playwright install chromium
    python uber_scraper.py --email your@email.com --password yourpassword
"""

import argparse
import csv
import time
from datetime import datetime, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


OUTPUT_CSV = "data/uber_trips_raw.csv"

FIELDNAMES = [
    "date", "start_time", "end_time", "pickup", "dropoff",
    "distance_km", "fare", "status", "trip_id"
]


def login(page, email: str, password: str) -> None:
    page.goto("https://drivers.uber.com/en/trips")
    page.wait_for_load_state("networkidle")

    # Email
    page.fill('input[type="email"]', email)
    page.click('button[type="submit"]')
    page.wait_for_timeout(2000)

    # Password
    page.fill('input[type="password"]', password)
    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    # Handle SMS/2FA if needed
    if "verify" in page.url or "otp" in page.url:
        print("\n>>> Verification required. Check your phone/email.")
        print(">>> Waiting up to 60 seconds for you to complete 2FA...")
        page.wait_for_url("**/trips**", timeout=60000)

    print("Login successful.")


def get_week_ranges(start_date: datetime, end_date: datetime):
    """Generate (week_start, week_end) tuples from end_date back to start_date."""
    current = end_date
    while current > start_date:
        week_start = current - timedelta(days=6)
        if week_start < start_date:
            week_start = start_date
        yield week_start, current
        current = week_start - timedelta(days=1)


def scrape_week(page, week_start: datetime, week_end: datetime) -> list[dict]:
    """Navigate to a specific week on drivers.uber.com/en/trips and extract trips."""
    s = week_start.strftime("%Y-%m-%d")
    e = week_end.strftime("%Y-%m-%d")
    url = f"https://drivers.uber.com/en/trips?from={s}&to={e}"
    page.goto(url)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    trips = []

    # Scroll down to load all trips for this week
    prev_count = 0
    for _ in range(10):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        page.wait_for_timeout(1000)
        rows = page.query_selector_all('[data-testid="trip-row"], .trip-row, [class*="TripRow"]')
        if len(rows) == prev_count:
            break
        prev_count = len(rows)

    rows = page.query_selector_all('[data-testid="trip-row"], .trip-row, [class*="TripRow"]')

    for row in rows:
        try:
            trip = extract_trip_data(page, row)
            if trip:
                trips.append(trip)
        except Exception as e:
            print(f"  Warning: could not parse a row — {e}")

    return trips


def extract_trip_data(page, row) -> dict | None:
    """Click on a trip row and extract detailed info including distance."""
    try:
        row.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

        def get_text(selector: str) -> str:
            el = page.query_selector(selector)
            return el.inner_text().strip() if el else ""

        # Try multiple selectors (Uber changes their DOM periodically)
        date      = get_text('[data-testid="trip-date"], [class*="tripDate"]')
        start_t   = get_text('[data-testid="start-time"], [class*="startTime"]')
        end_t     = get_text('[data-testid="end-time"],   [class*="endTime"]')
        pickup    = get_text('[data-testid="pickup-address"],  [class*="pickup"]')
        dropoff   = get_text('[data-testid="dropoff-address"], [class*="dropoff"]')
        distance  = get_text('[data-testid="trip-distance"],   [class*="distance"]')
        fare      = get_text('[data-testid="trip-fare"],       [class*="fare"]')
        status    = get_text('[data-testid="trip-status"],     [class*="status"]')
        trip_id   = page.url.split("/")[-1].split("?")[0]

        # Fallback: grab all visible text blocks
        if not date and not pickup:
            return None

        page.go_back()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1000)

        return {
            "date": date,
            "start_time": start_t,
            "end_time": end_t,
            "pickup": pickup,
            "dropoff": dropoff,
            "distance_km": distance,
            "fare": fare,
            "status": status,
            "trip_id": trip_id,
        }

    except PlaywrightTimeout:
        page.go_back()
        return None


def save_trips(trips: list[dict], path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    file_exists = Path(path).exists()
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        if not file_exists:
            writer.writeheader()
        writer.writerows(trips)


def main():
    parser = argparse.ArgumentParser(description="Scrape Uber trip history to CSV")
    parser.add_argument("--email",    required=True,  help="Uber account email")
    parser.add_argument("--password", required=True,  help="Uber account password")
    parser.add_argument("--from",     dest="from_date", default="2023-01-01",
                        help="Start date YYYY-MM-DD (default: 2023-01-01)")
    parser.add_argument("--to",       dest="to_date",
                        default=datetime.today().strftime("%Y-%m-%d"),
                        help="End date YYYY-MM-DD (default: today)")
    parser.add_argument("--output",   default=OUTPUT_CSV, help="Output CSV path")
    parser.add_argument("--headless", action="store_true", help="Run browser headless")
    args = parser.parse_args()

    start_date = datetime.strptime(args.from_date, "%Y-%m-%d")
    end_date   = datetime.strptime(args.to_date,   "%Y-%m-%d")

    weeks = list(get_week_ranges(start_date, end_date))
    print(f"Scraping {len(weeks)} weeks from {args.from_date} to {args.to_date}")

    total = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless, slow_mo=200)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        login(page, args.email, args.password)

        for i, (ws, we) in enumerate(weeks, 1):
            print(f"[{i}/{len(weeks)}] Week {ws.date()} → {we.date()} ...", end=" ", flush=True)
            trips = scrape_week(page, ws, we)
            if trips:
                save_trips(trips, args.output)
                total += len(trips)
                print(f"{len(trips)} trips  (total: {total})")
            else:
                print("0 trips")

        browser.close()

    print(f"\nDone. {total} trips saved to {args.output}")
    print("Now run:  python uber_trips_to_excel.py data --output uber_trips.xlsx")


if __name__ == "__main__":
    main()
