import base64
import logging

from google import genai
from google.genai import types

from backend.config import IMAGE_GEN_MODEL, GOOGLE_API_KEY
from backend.encyclopedia_agent.prompts import ENCYCLOPEDIA_GENERATION_PROMPT
from backend.services.content_store import content_store

logger = logging.getLogger(__name__)

# Initialize a dedicated genai client for image generation
_image_client = genai.Client(api_key=GOOGLE_API_KEY)


def generate_encyclopedia_page(
    topic: str,
    focus: str = "general overview",
    tool_context=None,
) -> dict:
    """Generates a rich, visual DK Books-style encyclopedia page about the given topic.

    This tool creates an illustrated encyclopedia page with interleaved text and images.
    It produces educational diagrams, infographics, and detailed illustrations alongside
    informative text content. Use this whenever the user asks about a topic, wants to
    learn about something, or requests visual information.

    Args:
        topic: The main subject for the encyclopedia page (e.g., "volcanoes",
               "solar system", "ancient Egypt").
        focus: Optional specific aspect to emphasize (e.g., "eruption types",
               "inner planets", "pyramids"). Defaults to "general overview".

    Returns:
        dict: A status dictionary confirming the page was generated, with section
              and image counts.
    """
    # Get session_id from ADK ToolContext if available
    session_id = ""
    if tool_context is not None:
        try:
            session_id = tool_context.session.id
        except Exception:
            pass

    try:
        prompt = ENCYCLOPEDIA_GENERATION_PROMPT.format(topic=topic, focus=focus)

        response = _image_client.models.generate_content(
            model=IMAGE_GEN_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(
                    aspect_ratio="16:9",
                ),
            ),
        )

        # Process interleaved response into structured sections
        sections = []
        current_section = {"text": "", "images": []}

        for part in response.parts:
            if part.text is not None:
                # If we already have images in the current section, start a new one
                if current_section["images"] and current_section["text"]:
                    sections.append(current_section)
                    current_section = {"text": "", "images": []}
                current_section["text"] += part.text
            elif part.inline_data is not None:
                img_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                current_section["images"].append(
                    {
                        "data": img_b64,
                        "mime_type": part.inline_data.mime_type or "image/png",
                    }
                )

        # Don't forget the last section
        if current_section["text"] or current_section["images"]:
            sections.append(current_section)

        page_data = {
            "type": "encyclopedia_page",
            "topic": topic,
            "focus": focus,
            "sections": sections,
        }

        # Publish to content WebSocket subscribers
        if session_id:
            content_store.publish(session_id, page_data)

        section_count = len(sections)
        image_count = sum(len(s["images"]) for s in sections)

        return {
            "status": "success",
            "topic": topic,
            "section_count": section_count,
            "image_count": image_count,
            "message": (
                f"Encyclopedia page generated with {section_count} sections "
                f"and {image_count} illustrations about {topic}."
            ),
        }

    except Exception as e:
        logger.error(f"Encyclopedia generation failed: {e}", exc_info=True)
        return {
            "status": "error",
            "message": f"Failed to generate encyclopedia page: {str(e)}",
        }
