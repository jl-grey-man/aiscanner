import json
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from api.analyzer import run_free_analysis, run_premium_analysis
from api.rate_limiter import is_rate_limited

load_dotenv("../.env")

app = FastAPI(title="AI Search Scanner")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://100.72.180.20"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    url: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest, request: Request):
    ip = request.client.host

    if is_rate_limited(ip):
        return JSONResponse(
            status_code=429,
            content={"error": "För många förfrågningar. Vänta en timme och försök igen."},
        )

    url = str(req.url)
    if not url.startswith("http"):
        url = f"https://{url}"

    try:
        result = await run_free_analysis(url)
        return JSONResponse(
            content=result,
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "Analysen misslyckades", "detail": str(e)},
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )


@app.post("/api/full-scan")
async def full_scan(req: AnalyzeRequest, request: Request):
    ip = request.client.host

    if is_rate_limited(ip):
        return JSONResponse(
            status_code=429,
            content={"error": "För många förfrågningar. Vänta en timme och försök igen."},
        )

    url = str(req.url)
    if not url.startswith("http"):
        url = f"https://{url}"

    try:
        result = await run_premium_analysis(url)
        return JSONResponse(
            content=result,
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "Full scan misslyckades", "detail": str(e)},
            headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
        )
