from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv("../.env")

app = FastAPI(title="AI Search Scanner")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://100.72.180.20"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}
