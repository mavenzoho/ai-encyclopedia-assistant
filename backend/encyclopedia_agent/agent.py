from google.adk.agents import Agent

from backend.config import LIVE_API_MODEL
from backend.encyclopedia_agent.prompts import SYSTEM_INSTRUCTION
from backend.encyclopedia_agent.tools import generate_encyclopedia_page

root_agent = Agent(
    name="atlas_encyclopedia_guide",
    model=LIVE_API_MODEL,
    description=(
        "Atlas — a passionate visual storyteller and encyclopedia guide who creates "
        "rich, narrated encyclopedia experiences with interleaved text, images, and "
        "audio. Speaks with warmth and authority, handles interruptions naturally, "
        "and draws connections across topics for a fluid exploration journey."
    ),
    instruction=SYSTEM_INSTRUCTION,
    tools=[generate_encyclopedia_page],
)
