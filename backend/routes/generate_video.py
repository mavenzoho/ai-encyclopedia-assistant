import asyncio
import base64
import logging
import time

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from google import genai
from google.genai import types as genai_types

from backend.config import GOOGLE_API_KEY

logger = logging.getLogger(__name__)
router = APIRouter()

_client = genai.Client(api_key=GOOGLE_API_KEY)
VIDEO_MODEL = "veo-2.0-generate-001"


class VideoRequest(BaseModel):
    image_data: str  # base64-encoded image
    mime_type: str = "image/png"
    topic: str = ""


@router.post("/api/generate-video")
async def generate_video(request: VideoRequest):
    """Generate a short video from an image using Google Veo.

    Takes a base64-encoded image and animates it into a short video clip.
    Uses polling to wait for the video generation to complete.
    """
    logger.info(f"Video generation request for topic: {request.topic}")

    try:
        # Decode the base64 image
        image_bytes = base64.b64decode(request.image_data)

        image_part = genai_types.Part.from_bytes(
            data=image_bytes,
            mime_type=request.mime_type,
        )

        prompt = f"Gently animate this illustration about {request.topic}. Add subtle motion, " \
                 "parallax depth, and natural movement. Keep it smooth and educational."

        # Start video generation
        operation = _client.models.generate_videos(
            model=VIDEO_MODEL,
            prompt=prompt,
            image=image_part,
            config=genai_types.GenerateVideosConfig(
                aspect_ratio="16:9",
                number_of_videos=1,
            ),
        )

        # Poll until complete (max 120 seconds)
        max_wait = 120
        start = time.time()
        while not operation.done:
            if time.time() - start > max_wait:
                return JSONResponse(
                    content={"status": "error", "message": "Video generation timed out"},
                    status_code=504,
                )
            await asyncio.sleep(5)
            operation = _client.operations.get(operation)

        # Extract the generated video
        if operation.response and operation.response.generated_videos:
            video = operation.response.generated_videos[0].video
            if video and video.uri:
                # Download the video from the URI
                video_file = _client.files.download(file=video)
                video_bytes = video_file
                video_b64 = base64.b64encode(video_bytes).decode("utf-8")

                logger.info(f"Video generated successfully for: {request.topic}")
                return JSONResponse(content={
                    "status": "success",
                    "video_data": video_b64,
                    "video_mime_type": "video/mp4",
                })

        return JSONResponse(
            content={"status": "error", "message": "No video was generated"},
            status_code=500,
        )

    except Exception as e:
        logger.error(f"Video generation error: {e}", exc_info=True)
        return JSONResponse(
            content={"status": "error", "message": str(e)},
            status_code=500,
        )
