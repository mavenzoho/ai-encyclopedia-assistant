import base64
import logging

from google import genai
from google.genai import types

from backend.config import IMAGE_GEN_MODEL, GOOGLE_API_KEY

logger = logging.getLogger(__name__)


class ImageGenerator:
    """Wraps the Google GenAI SDK for interleaved text + image generation."""

    def __init__(self):
        self.client = genai.Client(api_key=GOOGLE_API_KEY)

    def generate_interleaved(
        self, prompt: str, aspect_ratio: str = "16:9"
    ) -> list[dict]:
        """Generate interleaved text + images from a prompt.

        Returns a list of parts, each being either:
          {"type": "text", "content": "..."}
          {"type": "image", "data": "<base64>", "mime_type": "image/png"}
        """
        response = self.client.models.generate_content(
            model=IMAGE_GEN_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(aspect_ratio=aspect_ratio),
            ),
        )

        parts = []
        for part in response.parts:
            if part.text is not None:
                parts.append({"type": "text", "content": part.text})
            elif part.inline_data is not None:
                img_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                parts.append(
                    {
                        "type": "image",
                        "data": img_b64,
                        "mime_type": part.inline_data.mime_type or "image/png",
                    }
                )
        return parts


image_generator = ImageGenerator()
