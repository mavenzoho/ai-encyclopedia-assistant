import base64
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from google import genai
from google.genai import types as genai_types

from backend.config import IMAGE_GEN_MODEL, GOOGLE_API_KEY
from backend.encyclopedia_agent.prompts import ENCYCLOPEDIA_GENERATION_PROMPT

logger = logging.getLogger(__name__)
router = APIRouter()

_client = genai.Client(api_key=GOOGLE_API_KEY)


class GenerateRequest(BaseModel):
    topic: str
    focus: str = "general overview"
    session_id: str = ""


@router.post("/api/generate")
async def generate_page(request: GenerateRequest):
    """Generate an encyclopedia page and return it directly in the response.

    Returns the full page data (text + base64 images) as JSON.
    The frontend renders it directly without needing the content WebSocket.
    """
    logger.info(f"Generate request: topic={request.topic}, focus={request.focus}")

    try:
        prompt = ENCYCLOPEDIA_GENERATION_PROMPT.format(
            topic=request.topic, focus=request.focus
        )

        response = _client.models.generate_content(
            model=IMAGE_GEN_MODEL,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=genai_types.ImageConfig(aspect_ratio="16:9"),
            ),
        )

        sections = []
        current_section = {"text": "", "images": []}

        for part in response.parts:
            if part.text is not None:
                if current_section["images"] and current_section["text"]:
                    sections.append(current_section)
                    current_section = {"text": "", "images": []}
                current_section["text"] += part.text
            elif part.inline_data is not None:
                img_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                current_section["images"].append({
                    "data": img_b64,
                    "mime_type": part.inline_data.mime_type or "image/png",
                })

        if current_section["text"] or current_section["images"]:
            sections.append(current_section)

        page_data = {
            "type": "encyclopedia_page",
            "status": "success",
            "topic": request.topic,
            "focus": request.focus,
            "sections": sections,
        }

        logger.info(
            f"Generated: {len(sections)} sections, "
            f"{sum(len(s['images']) for s in sections)} images"
        )

        return JSONResponse(content=page_data)

    except Exception as e:
        logger.error(f"Generate endpoint error: {e}", exc_info=True)
        return JSONResponse(
            content={"status": "error", "message": str(e)},
            status_code=500,
        )
