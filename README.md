# AI Encyclopedia Assistant

An AI-powered interactive encyclopedia inspired by DK Books (Dorling Kindersley) that creates rich, visual encyclopedia pages from voice commands. Built for the **Gemini Live Agent Challenge** hackathon in the **Creative Storyteller** category.

## What It Does

Speak to the AI Encyclopedia and it will:
- **Listen** to your voice in real-time using Gemini's Live API
- **Generate** rich, visual encyclopedia pages with interleaved text and illustrations
- **Display** content in a DK Books-inspired visual layout with diagrams, infographics, and educational illustrations
- **Respond** naturally - you can interrupt, ask for more details, or switch topics at any time

## Architecture

```
Browser (HTML/CSS/JS)
  |-- WebSocket /ws/voice/{session}    --> ADK Agent (Gemini 2.5 Flash, Live API)
  |-- WebSocket /ws/content/{session}  <-- Encyclopedia content (text + images)
                                            |
                                            v
                                    Tool: generate_encyclopedia_page()
                                            |
                                            v
                                    Gemini 2.5 Flash Image
                                    (interleaved TEXT + IMAGE output)
```

### Two-Model Bridge Pattern

The application bridges two Gemini capabilities:
1. **Live API** (`gemini-2.5-flash`) - Real-time bidirectional voice streaming via ADK
2. **Image Generation** (`gemini-2.5-flash-image`) - Interleaved text + image output

The ADK agent's custom tool calls the image generation model, processes the interleaved response, and delivers it to the frontend via a separate content WebSocket while the agent provides a voice summary.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Agent Framework | Google ADK (Agent Development Kit) |
| Voice Interaction | Gemini Live API via ADK bidi-streaming |
| Visual Content | Gemini 2.5 Flash Image (interleaved output) |
| Backend | Python FastAPI + uvicorn |
| Frontend | Vanilla HTML/CSS/JS + AudioWorklet API |
| Deployment | Google Cloud Run |

## Prerequisites

- Python 3.11+
- A [Google AI Studio API key](https://aistudio.google.com/apikey)
- (For deployment) Google Cloud project with billing enabled

## Quick Start - Local Development

### 1. Clone and set up

```bash
git clone <your-repo-url>
cd googleaiagent

# Create virtual environment
python -m venv .venv

# Activate (Linux/Mac)
source .venv/bin/activate
# Activate (Windows)
.venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env and add your API key
# GOOGLE_API_KEY=your-key-here
```

### 4. Run the application

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

### 5. Open in browser

Navigate to `http://localhost:8080`

- Click the microphone button to start speaking
- Or click a suggestion chip to explore a topic
- The AI will generate a rich visual encyclopedia page

## Deploy to Google Cloud Run

### Automated deployment (recommended)

```bash
# Set your environment variables
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_API_KEY=your-api-key

# Run the deployment script
chmod +x deploy.sh
./deploy.sh
```

### Manual deployment

```bash
gcloud run deploy ai-encyclopedia \
    --source . \
    --region us-central1 \
    --project your-project-id \
    --allow-unauthenticated \
    --set-env-vars="GOOGLE_API_KEY=your-key,GOOGLE_CLOUD_PROJECT=your-project" \
    --memory=1Gi \
    --cpu=2 \
    --timeout=300 \
    --session-affinity
```

### Docker (local testing)

```bash
docker build -t ai-encyclopedia .
docker run -p 8080:8080 --env-file .env ai-encyclopedia
```

## Project Structure

```
googleaiagent/
├── backend/
│   ├── main.py                      # FastAPI application
│   ├── config.py                    # Environment configuration
│   ├── encyclopedia_agent/
│   │   ├── agent.py                 # ADK Agent definition
│   │   ├── tools.py                 # Encyclopedia page generation tool
│   │   └── prompts.py              # System instructions & prompts
│   ├── routes/
│   │   ├── voice_ws.py             # Voice streaming WebSocket
│   │   ├── content_ws.py           # Content delivery WebSocket
│   │   └── health.py               # Health check
│   └── services/
│       ├── image_generator.py       # GenAI SDK wrapper
│       └── content_store.py         # In-memory pub/sub
├── frontend/
│   ├── index.html                   # Main page
│   ├── css/
│   │   ├── styles.css              # Global styles
│   │   └── encyclopedia.css        # DK Books visual design
│   └── js/
│       ├── app.js                   # App controller
│       ├── voice.js                 # Voice/audio manager
│       ├── renderer.js             # Encyclopedia page renderer
│       └── worklets/
│           ├── pcm-recorder.js     # Mic capture (16kHz PCM)
│           └── pcm-player.js       # Audio playback (24kHz PCM)
├── Dockerfile
├── requirements.txt
├── deploy.sh                        # Cloud Run deployment script
├── .env.example
└── README.md
```

## Google Cloud Services Used

- **Google Cloud Run** - Hosting the application backend
- **Google Cloud Build** - Building the container image
- **Gemini API** (via Google AI Studio) - AI model inference

## Hackathon Category

**Creative Storyteller** - Multimodal Storytelling with Interleaved Output

This project demonstrates Gemini's native interleaved output by generating encyclopedia pages that seamlessly weave text explanations with AI-generated illustrations, diagrams, and infographics in a single cohesive visual experience.

## License

MIT
