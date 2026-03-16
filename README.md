# Encyclopia - AI Visual Storyteller

> **Gemini Live Agent Challenge** | **Creative Storyteller** Category
>
> An AI-powered interactive encyclopedia that transforms voice commands into rich, visual DK Books-style pages with interleaved text, AI-generated illustrations, and narrated audio - all in real-time.

![Encyclopia](GOOGEL%20AI.png)

## The Problem

Traditional encyclopedias are static. Digital search results are walls of text. Learning should be **visual, immersive, and conversational** - like having a passionate museum guide who can instantly create beautiful illustrated pages about anything you ask.

## The Solution

**Encyclopia** is a next-generation AI agent that you can **talk to naturally**. Say any topic - "Tell me about volcanoes" - and Encyclopia will:

1. **Listen** to your voice in real-time using Gemini's Live API
2. **Generate** a rich, visual encyclopedia page with interleaved text and AI-generated illustrations
3. **Narrate** the content aloud while you explore the visual page
4. **Animate** illustrations into short videos using Google Veo
5. **Connect topics** - click any text, heading, or image to explore deeper in a new tab

The experience seamlessly weaves together **text, images, audio, and video** in a single fluid output stream - the defining feature of the Creative Storyteller category.

## Key Features

| Feature | Description |
|---------|-------------|
| **Real-time Voice** | Speak naturally, interrupt anytime (barge-in support) |
| **Interleaved Output** | Text + AI-generated illustrations woven together in one response |
| **DK Books-Style Layout** | Beautiful, magazine-quality visual encyclopedia pages |
| **Click-to-Explore** | Click any heading, bold term, paragraph, or image to explore in a new tab |
| **Tabbed Navigation** | Browse multiple topics simultaneously with background loading |
| **Video Generation** | Animate any illustration into a short video clip using Google Veo |
| **Audio Narration** | Encyclopia narrates each page section for a documentary-like experience |
| **Topic Continuity** | Encyclopia draws connections between previously explored topics |
| **Themed Visuals** | Color themes adapt to topic categories (space, nature, history, etc.) |
| **Voice Transcription** | Live overlay shows what you're saying and Encyclopia's response |

## Architecture

```
Browser (HTML/CSS/JS)
  |-- WebSocket /ws/voice/{session}    --> ADK Agent (Gemini 2.5 Flash, Live API)
  |-- WebSocket /ws/content/{session}  <-- Encyclopedia content (text + images)
  |-- HTTP POST /api/generate          --> Direct page generation
  |-- HTTP POST /api/generate-video    --> Veo video generation
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
1. **Live API** (`gemini-2.5-flash`) - Real-time bidirectional voice streaming via ADK with barge-in support
2. **Image Generation** (`gemini-2.5-flash-image`) - Interleaved text + image output for rich visual content

The ADK agent's custom tool calls the image generation model, processes the interleaved response, and delivers it to the frontend via a separate content WebSocket while the agent provides a spoken voice summary.

### Architecture Diagram

Open [`architecture.html`](architecture.html) in a browser to view the full interactive SVG architecture diagram showing all components and data flow.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Agent Framework | [Google ADK](https://google.github.io/adk-docs/) (Agent Development Kit) |
| Voice Interaction | Gemini Live API via ADK bidi-streaming |
| Visual Content | Gemini 2.5 Flash Image (interleaved output) |
| Video Generation | Google Veo 2.0 |
| Backend | Python FastAPI + uvicorn |
| Frontend | Vanilla HTML/CSS/JS + AudioWorklet API |
| Deployment | Google Cloud Run + Cloud Build |

## Google Cloud Services Used

- **Google Cloud Run** - Hosting the containerized application backend
- **Google Cloud Build** - Building the Docker container image
- **Gemini API** (via Google GenAI SDK) - AI model inference (Live API + Image Generation)
- **Google Veo** - AI video generation from illustrations

## Prerequisites

- Python 3.11+
- A [Google AI Studio API key](https://aistudio.google.com/apikey)
- (For deployment) Google Cloud project with billing enabled
- (For deployment) [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated

## Quick Start - Local Development

### 1. Clone and set up

```bash
git clone <your-repo-url>
cd Encyclopia

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
- Or type any topic in the search bar
- Or click a suggestion chip to explore a topic
- The AI will generate a rich visual encyclopedia page

## Deploy to Google Cloud Run

### Automated deployment (recommended)

The project includes an automated deployment script (`deploy.sh`) that handles API enablement, Docker build, and Cloud Run deployment:

```bash
# Set your environment variables
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_API_KEY=your-api-key

# Run the deployment script
chmod +x deploy.sh
./deploy.sh
```

The script will:
1. Enable required Google Cloud APIs (Cloud Run, Cloud Build, Vertex AI)
2. Build and deploy the Docker container to Cloud Run
3. Configure session affinity, memory (1Gi), CPU (2), and timeout (300s)
4. Output the live service URL

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
Encyclopia/
├── backend/
│   ├── main.py                        # FastAPI application & static file serving
│   ├── config.py                      # Environment configuration
│   ├── encyclopedia_agent/
│   │   ├── agent.py                   # ADK Agent definition (Encyclopia persona)
│   │   ├── tools.py                   # Encyclopedia page generation tool
│   │   └── prompts.py                 # System instructions & generation prompts
│   ├── routes/
│   │   ├── voice_ws.py                # Voice streaming WebSocket (bidi audio)
│   │   ├── content_ws.py              # Content delivery WebSocket (pages)
│   │   ├── generate.py                # HTTP API for direct page generation
│   │   ├── generate_video.py          # Veo video generation endpoint
│   │   └── health.py                  # Health check endpoint
│   └── services/
│       ├── image_generator.py         # GenAI SDK wrapper for image generation
│       └── content_store.py           # In-memory pub/sub for content delivery
├── frontend/
│   ├── index.html                     # Main page (DK-style encyclopedia UI)
│   ├── css/
│   │   ├── styles.css                 # Global styles & UI components
│   │   └── encyclopedia.css           # Encyclopedia page visual design
│   └── js/
│       ├── app.js                     # App controller, tabs, narration, video
│       ├── voice.js                   # Voice/audio manager (mic + playback)
│       ├── renderer.js                # Encyclopedia page renderer (click-to-explore)
│       └── worklets/
│           ├── pcm-recorder.js        # Mic capture worklet (16kHz PCM)
│           └── pcm-player.js          # Audio playback worklet (24kHz PCM)
├── architecture.html                  # Interactive SVG architecture diagram
├── Dockerfile                         # Container image definition
├── deploy.sh                          # Automated Cloud Run deployment script
├── requirements.txt                   # Python dependencies
├── .env.example                       # Environment variable template
├── LICENSE                            # MIT License
└── README.md                          # This file
```

## How It Works - Data Flow

1. **User speaks** into the microphone → PCM audio (16kHz) streams via WebSocket to `voice_ws.py`
2. **ADK Agent** processes voice via Gemini Live API → understands intent → calls `generate_encyclopedia_page()` tool
3. **Tool** calls Gemini 2.5 Flash Image with interleaved output → receives text + AI-generated illustrations
4. **Tool publishes** page data to `content_store` → pushed via content WebSocket → `renderer.js` displays the visual page
5. **Agent sends** a voice summary (24kHz audio) back to browser → user hears Encyclopia narrate while seeing the page
6. **User clicks** any content → new tab opens in background → process repeats for the new topic

## Hackathon Category

**Creative Storyteller** - Multimodal Storytelling with Interleaved Output

This project demonstrates Gemini's native interleaved output capabilities by generating encyclopedia pages that seamlessly weave together:
- **Text** - Rich, narrative educational content with markdown formatting
- **Images** - AI-generated illustrations, diagrams, infographics, and cross-sections
- **Audio** - Voice narration of each section for a documentary-like experience
- **Video** - Animated illustrations using Google Veo

The result is an immersive, magazine-quality encyclopedia experience that goes far beyond the traditional text-box paradigm.

## Third-Party Integrations

- **Google Fonts** - Montserrat and Merriweather fonts loaded via Google Fonts CDN for typography
- All other components are built from scratch using Google's official SDKs

## License

MIT - See [LICENSE](LICENSE) for details.

---

*Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) hackathon. #GeminiLiveAgentChallenge*
