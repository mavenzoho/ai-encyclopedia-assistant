import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.config import PORT
from backend.routes.health import router as health_router
from backend.routes.voice_ws import router as voice_router
from backend.routes.content_ws import router as content_router
from backend.routes.generate import router as generate_router
from backend.routes.generate_video import router as video_router

app = FastAPI(title="AI Encyclopedia Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(health_router)
app.include_router(voice_router)
app.include_router(content_router)
app.include_router(generate_router)
app.include_router(video_router)

# Serve frontend static files
app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
async def serve_frontend():
    return FileResponse("frontend/index.html")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
