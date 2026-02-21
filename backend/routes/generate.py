import json
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from backend.encyclopedia_agent.tools import generate_encyclopedia_page
from backend.services.content_store import content_store

logger = logging.getLogger(__name__)
router = APIRouter()


class GenerateRequest(BaseModel):
    topic: str
    focus: str = "general overview"
    session_id: str = ""


@router.post("/api/generate")
async def generate_page(request: GenerateRequest):
    """HTTP endpoint to generate an encyclopedia page directly.

    This bypasses the voice WebSocket/Live API and calls the
    image generation tool directly. Used as a reliable fallback
    for text-based requests (suggestion chips, typed input).
    """
    logger.info(f"Generate request: topic={request.topic}, session={request.session_id}")

    try:
        result = generate_encyclopedia_page(
            topic=request.topic,
            focus=request.focus,
        )

        # If the tool didn't publish via content_store (no tool_context),
        # we need to generate and publish the full page data ourselves
        if result.get("status") == "success" and request.session_id:
            # The tool already generated the page but couldn't publish
            # because there was no tool_context with session info.
            # Re-generate and publish via content_store.
            import base64
            from google import genai
            from google.genai import types as genai_types
            from backend.config import IMAGE_GEN_MODEL, GOOGLE_API_KEY
            from backend.encyclopedia_agent.prompts import ENCYCLOPEDIA_GENERATION_PROMPT

            client = genai.Client(api_key=GOOGLE_API_KEY)
            prompt = ENCYCLOPEDIA_GENERATION_PROMPT.format(
                topic=request.topic, focus=request.focus
            )

            response = client.models.generate_content(
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
                "topic": request.topic,
                "focus": request.focus,
                "sections": sections,
            }

            content_store.publish(request.session_id, page_data)

            return {
                "status": "success",
                "topic": request.topic,
                "section_count": len(sections),
                "image_count": sum(len(s["images"]) for s in sections),
            }

        return result

    except Exception as e:
        logger.error(f"Generate endpoint error: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}
