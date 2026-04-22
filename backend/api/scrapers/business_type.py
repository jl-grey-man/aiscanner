import re
import json

# Schema.org types that indicate a local/physical business
LOCAL_SCHEMA_TYPES = {
    "LocalBusiness", "Store", "Restaurant", "Hotel", "Dentist", "Physician",
    "Hospital", "LegalService", "AccountingService", "FinancialService",
    "AutomotiveBusiness", "HealthAndBeautyBusiness", "HomeAndConstructionBusiness",
    "FoodEstablishment", "MedicalBusiness", "ProfessionalService",
    "RealEstateAgent", "TravelAgency", "Pharmacy", "GroceryStore",
    "CafeOrCoffeeShop", "BarOrPub", "NightClub", "ClothingStore",
    "ElectronicsStore", "HomeGoodsStore", "SportingGoodsStore",
    "BookStore", "ConvenienceStore", "DepartmentStore", "ShoeStore",
}


def detect_business_type(soup, schema_types: list, social_links: dict) -> dict:
    """
    Detect whether the business is local (physical presence) or national/online.
    Returns {"is_local": bool, "signals": [...], "score": int}
    """
    signals = []
    local_score = 0

    # 1. Schema @type matches a known local type (+3)
    local_type_match = [t for t in schema_types if t in LOCAL_SCHEMA_TYPES]
    if local_type_match:
        signals.append(f"Schema-typ indikerar lokalt företag: {local_type_match[0]}")
        local_score += 3

    # 2. JSON-LD has a streetAddress (+3)
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, list):
                data = data[0]
            addr = data.get("address", {})
            if isinstance(addr, dict) and addr.get("streetAddress"):
                signals.append(f"Gatuadress i schema: {addr['streetAddress']}")
                local_score += 3
                break
        except Exception:
            pass

    # 3. Google Maps link present (+2)
    if "Google Maps" in social_links:
        signals.append("Google Maps-länk finns på sidan")
        local_score += 2

    page_text = soup.get_text(separator=" ")

    # 4. Swedish postal code visible (e.g. "123 45" or "12345") (+1)
    if re.search(r'\b\d{3}\s\d{2}\b', page_text):
        signals.append("Postnummer synligt på sidan")
        local_score += 1

    # 5. Swedish phone number (+1)
    if re.search(r'(?:\+46|0\d{1,3})[-\s]?\d{2,4}[-\s]?\d{2,4}', page_text):
        signals.append("Telefonnummer synligt på sidan")
        local_score += 1

    # 6. City/location keywords in nav or footer text (+1)
    footer = soup.find("footer")
    footer_text = footer.get_text() if footer else ""
    city_pattern = re.compile(
        r'\b(stockholm|göteborg|malmö|uppsala|västerås|örebro|linköping|helsingborg|jönköping|norrköping)\b',
        re.IGNORECASE,
    )
    if city_pattern.search(footer_text):
        signals.append("Stad/ort omnämnd i sidfoten")
        local_score += 1

    is_local = local_score >= 3

    return {
        "is_local": is_local,
        "label": "Lokalt företag" if is_local else "Nationellt/online",
        "signals": signals,
        "score": local_score,
    }
