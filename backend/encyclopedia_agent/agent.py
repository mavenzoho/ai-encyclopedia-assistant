from google.adk.agents import Agent

from backend.config import LIVE_API_MODEL
from backend.encyclopedia_agent.prompts import SYSTEM_INSTRUCTION
from backend.encyclopedia_agent.tools import generate_encyclopedia_page

root_agent = Agent(
    name="encyclopedia_assistant",
    model=LIVE_API_MODEL,
    description=(
        "An AI encyclopedia assistant that creates DK Books-style visual "
        "encyclopedia pages with rich illustrations from voice commands."
    ),
    instruction=SYSTEM_INSTRUCTION,
    tools=[generate_encyclopedia_page],
)
