import os
import time
import httpx

PLACES_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
PLACES_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


async def check_google_business_profile(company_name: str, url: str) -> dict:
    """
    Search Google Places for the company.
    Step 1: Find Place → get place_id
    Step 2: Place Details → get reviews, opening_hours
    """
    if not PLACES_API_KEY:
        return {"found": False, "error": "API-nyckel saknas"}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Step 1: Find Place
            resp = await client.get(PLACES_SEARCH_URL, params={
                "input": company_name,
                "inputtype": "textquery",
                "fields": "place_id,name,formatted_address,rating,user_ratings_total,business_status",
                "key": PLACES_API_KEY,
            })
            data = resp.json()

            candidates = data.get("candidates", [])
            if not candidates:
                return {"found": False}

            place = candidates[0]
            place_id = place.get("place_id")

            # Step 2: Place Details for reviews + opening hours
            reviews = []
            latest_review_ts = None
            if place_id:
                det_resp = await client.get(PLACES_DETAILS_URL, params={
                    "place_id": place_id,
                    "fields": "reviews,opening_hours",
                    "language": "sv",
                    "key": PLACES_API_KEY,
                })
                det = det_resp.json().get("result", {})
                raw_reviews = det.get("reviews", [])
                for r in raw_reviews:
                    reviews.append({
                        "rating": r.get("rating"),
                        "text": r.get("text", "").strip(),
                        "relative_time": r.get("relative_time_description", ""),
                        "time": r.get("time"),
                    })
                if reviews:
                    latest_review_ts = max(r["time"] for r in reviews if r.get("time"))

        # Recency: days since latest review
        days_since_review = None
        if latest_review_ts:
            days_since_review = int((time.time() - latest_review_ts) / 86400)

        return {
            "found": True,
            "name": place.get("name"),
            "address": place.get("formatted_address"),
            "rating": place.get("rating"),
            "review_count": place.get("user_ratings_total"),
            "status": place.get("business_status"),
            "place_id": place_id,
            "reviews": reviews,
            "days_since_review": days_since_review,
        }

    except Exception as e:
        return {"found": False, "error": str(e)}
