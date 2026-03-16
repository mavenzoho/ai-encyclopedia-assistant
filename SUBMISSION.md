# Devpost Submission - Encyclopia

> Use this document to copy/paste into the Devpost submission form fields.

---

## Project Title

Encyclopia - AI Visual Storyteller

## Category

Creative Storyteller

## Short Description (for Devpost tagline)

A voice-powered AI encyclopedia that creates DK Books-style visual pages with interleaved text, AI-generated illustrations, narrated audio, and animated videos - all in real-time.

---

## Full Description (for Devpost text description)

### What It Does

Encyclopia transforms how people explore knowledge. Instead of reading walls of text, users **speak to Encyclopia** - an AI encyclopedia guide - and receive **rich, visual encyclopedia pages** that seamlessly weave together text, AI-generated illustrations, and narrated audio in a single cohesive experience.

**Say "Tell me about volcanoes"** and Encyclopia will:
- Generate a stunning visual encyclopedia page with multiple AI-created illustrations (cross-sections, diagrams, comparison charts)
- Narrate the content in a warm, documentary-style voice
- Display everything in a beautiful DK Books-inspired magazine layout
- Let you click any text, heading, or image to explore deeper topics in new tabs
- Animate any illustration into a short video using Google Veo

### The Problem

Learning online means sifting through text-heavy articles and disconnected image searches. There's no immersive, visual-first experience that feels like flipping through a premium illustrated encyclopedia - one that talks to you, generates custom illustrations on demand, and lets you explore in any direction.

### How We Built It

We created a **Two-Model Bridge Pattern** that connects two Gemini capabilities:

1. **Gemini Live API** (via ADK) handles real-time bidirectional voice streaming. The user speaks naturally, can interrupt at any time (barge-in), and receives spoken responses.

2. **Gemini 2.5 Flash Image** generates interleaved text + image output. A single API call produces rich text with multiple AI-generated illustrations woven throughout.

The ADK agent uses a custom tool (`generate_encyclopedia_page`) that bridges these two models. When the user asks about a topic, the agent calls the tool, which generates an interleaved response from the image model, then publishes the structured content via an in-memory pub/sub system to the frontend's content WebSocket. Meanwhile, the agent provides a spoken narration summary through the voice WebSocket.

**Key Technical Decisions:**
- **Dual WebSocket architecture**: Separate channels for voice (binary PCM audio) and content (JSON with text + base64 images) to avoid blocking
- **AudioWorklet API**: Low-latency audio capture (16kHz) and playback (24kHz) using browser AudioWorklets for professional-quality voice interaction
- **Background tab loading**: New topics load in background tabs while the user continues reading the current page
- **In-memory pub/sub**: `content_store.py` acts as a lightweight message broker between the ADK tool and content WebSocket subscribers
- **Click-to-explore**: Every piece of content (headings, bold terms, paragraphs, images) is clickable, creating an infinite exploration experience

### Technologies Used

- **Google ADK** (Agent Development Kit) - Agent framework with Live API support
- **Google GenAI SDK** - Gemini 2.5 Flash Image for interleaved text+image generation
- **Gemini Live API** - Real-time bidirectional voice streaming with barge-in
- **Google Veo 2.0** - AI video generation from illustrations
- **Google Cloud Run** - Containerized backend hosting
- **Google Cloud Build** - Docker container builds
- **FastAPI** - Python async web framework
- **AudioWorklet API** - Browser-native low-latency audio processing

### What We Learned

- The **interleaved output** capability of Gemini 2.5 Flash Image is remarkably powerful for creating rich multimedia content in a single API call
- **Barge-in handling** requires careful coordination between audio capture and playback - clearing the playback buffer when the user starts speaking is essential for natural conversation
- The **two-model bridge pattern** (Live API for voice + Image model for content) is a powerful architecture for agents that need both real-time interaction and rich content generation
- **Session affinity** on Cloud Run is critical for WebSocket-based applications to maintain persistent connections

### Findings

The most surprising finding was how naturally the interleaved text+image output creates a "magazine-quality" experience when rendered properly. The AI doesn't just generate text and separate images - it creates a narrative where illustrations appear exactly where they make sense in the story, creating a truly seamless multimedia experience.

---

## Testing Instructions

### Online Demo
Visit the deployed application URL (provided in submission).

### Local Setup
1. Clone the repository
2. Create a virtual environment: `python -m venv .venv && source .venv/bin/activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Copy `.env.example` to `.env` and add your Google AI Studio API key
5. Run: `uvicorn backend.main:app --host 0.0.0.0 --port 8080`
6. Open `http://localhost:8080` in Chrome (for AudioWorklet support)
7. Click a suggestion chip or type a topic to generate an encyclopedia page
8. Click the microphone button to use voice interaction
9. Click any heading, bold term, or image to explore in a new tab
10. Click "Create Video" on any illustration to generate an animated video

### Browser Requirements
- Chrome 66+ (for AudioWorklet API)
- Microphone access (for voice features)

---

## Video Description (for YouTube/Vimeo)

Encyclopia - AI Visual Storyteller | Gemini Live Agent Challenge

An AI-powered interactive encyclopedia built for the Gemini Live Agent Challenge hackathon in the Creative Storyteller category. Encyclopia uses Google's Gemini Live API for real-time voice interaction and Gemini 2.5 Flash Image for interleaved text + image generation, creating DK Books-style visual encyclopedia pages with narrated audio and animated videos.

Built with: Google ADK, Gemini Live API, Gemini 2.5 Flash Image, Google Veo, Google Cloud Run, FastAPI, Python

This project was created for the purposes of entering the Gemini Live Agent Challenge hackathon.

#GeminiLiveAgentChallenge #GoogleAI #Gemini #ADK #CloudRun
