import json
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from api.analyzer import run_checks
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
        return StreamingResponse(
            _error_stream("För många förfrågningar. Vänta en timme och försök igen."),
            media_type="text/event-stream",
        )

    url = str(req.url)
    if not url.startswith("http"):
        url = f"https://{url}"

    return StreamingResponse(
        _stream_analysis(url),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

async def _stream_analysis(url: str):
    async for event in run_checks(url):
        data = json.dumps(event["data"], ensure_ascii=False)
        yield f"event: {event['event']}\ndata: {data}\n\n"

async def _error_stream(message: str):
    data = json.dumps({"message": message}, ensure_ascii=False)
    yield f"event: error\ndata: {data}\n\n"
