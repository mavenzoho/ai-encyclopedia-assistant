import os
from dotenv import load_dotenv

load_dotenv()

# Models
LIVE_API_MODEL = os.getenv("LIVE_API_MODEL", "gemini-2.5-flash")
IMAGE_GEN_MODEL = os.getenv("IMAGE_GEN_MODEL", "gemini-2.5-flash-image")

# Google Cloud
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")
GOOGLE_CLOUD_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# App
APP_NAME = "encyclopedia-assistant"
PORT = int(os.getenv("PORT", 8080))
