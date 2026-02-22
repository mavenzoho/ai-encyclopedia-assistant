import asyncio
import json
import logging
import re

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.genai import types

from backend.config import APP_NAME
from backend.encyclopedia_agent import root_agent

logger = logging.getLogger(__name__)
router = APIRouter()

# Shared services - initialized once at module level
session_service = InMemorySessionService()
runner = Runner(
    app_name=APP_NAME,
    agent=root_agent,
    session_service=session_service,
)


def _is_agent_reasoning(text: str) -> bool:
    """Filter out internal agent reasoning/tool-calling text.

    The ADK agent outputs its thinking process as text parts, including
    tool call decisions and markdown formatting. We only want to forward
    clean spoken responses to the user.
    """
    t = text.strip()
    # Agent reasoning patterns - markdown, tool calls, internal logic
    if re.search(r'\*\*.*\*\*', t):  # **bold markdown**
        return True
    if '`' in t:  # backtick code references
        return True
    if 'generate_encyclopedia_page' in t:
        return True
    if re.search(r"I've decided|I will now|I'm going to|Let me|I'll proceed", t, re.I):
        return True
    if re.search(r'tool|function|argument|parameter|calling', t, re.I) and len(t) > 50:
        return True
    return False


@router.websocket("/ws/voice/{session_id}")
async def voice_websocket(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for bidirectional voice streaming via ADK Live API.

    Handles:
    - Binary messages: PCM audio from microphone (16-bit, 16kHz, mono)
    - Text messages: JSON commands (e.g., text input, control signals)

    Sends back:
    - Binary messages: PCM audio response (16-bit, 24kHz)
    - Text messages: JSON events (transcriptions, tool status, etc.)
    """
    await websocket.accept()
    user_id = "default_user"

    try:
        # Create or get session
        session = await session_service.get_session(
            app_name=APP_NAME, user_id=user_id, session_id=session_id
        )
        if not session:
            session = await session_service.create_session(
                app_name=APP_NAME, user_id=user_id, session_id=session_id
            )
    except Exception as e:
        logger.error(f"Session creation error: {e}", exc_info=True)
        await websocket.send_text(json.dumps({
            "type": "error",
            "data": f"Session error: {str(e)}",
        }))
        await websocket.close()
        return

    # Configure for bidirectional audio streaming
    run_config = RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name="Kore",
                )
            )
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
    )

    live_request_queue = LiveRequestQueue()
    logger.info(f"Voice WebSocket connected for session: {session_id}")

    # Signal to coordinate shutdown between upstream/downstream
    shutdown_event = asyncio.Event()

    async def upstream():
        """Receive audio/text from browser, forward to ADK agent."""
        try:
            while not shutdown_event.is_set():
                raw = await websocket.receive()

                if "bytes" in raw and raw["bytes"]:
                    # Binary PCM audio from microphone
                    audio_blob = types.Blob(
                        mime_type="audio/pcm;rate=16000",
                        data=raw["bytes"],
                    )
                    live_request_queue.send_realtime(audio_blob)

                elif "text" in raw and raw["text"]:
                    msg = json.loads(raw["text"])

                    if msg.get("type") == "text":
                        # Text input (from suggestion chips or typed)
                        content = types.Content(
                            parts=[types.Part(text=msg["data"])]
                        )
                        live_request_queue.send_content(content)

                    elif msg.get("type") == "audio_end":
                        # User paused speaking
                        live_request_queue.send_realtime(
                            types.ActivityEnd(activity=types.Activity.LISTEN)
                        )

        except WebSocketDisconnect:
            logger.info(f"Upstream disconnected for session: {session_id}")
        except Exception as e:
            logger.error(f"Upstream error: {e}", exc_info=True)
        finally:
            shutdown_event.set()

    async def downstream():
        """Stream ADK agent events back to browser."""
        try:
            # Notify client that voice session is ready
            await websocket.send_text(json.dumps({
                "type": "voice_ready",
                "data": "Voice session established",
            }))

            async for event in runner.run_live(
                user_id=user_id,
                session_id=session_id,
                live_request_queue=live_request_queue,
                run_config=run_config,
            ):
                if not event.content or not event.content.parts:
                    continue

                for part in event.content.parts:
                    # Audio response - send as binary
                    if (
                        part.inline_data
                        and part.inline_data.mime_type
                        and "audio" in part.inline_data.mime_type
                    ):
                        await websocket.send_bytes(part.inline_data.data)
                        continue

                    # Text part - filter out agent reasoning, only send clean speech
                    if part.text and not _is_agent_reasoning(part.text):
                        await websocket.send_text(
                            json.dumps({
                                "type": "transcription",
                                "data": part.text,
                                "is_output": True,
                            })
                        )

                # Send transcription events
                if hasattr(event, "input_transcription") and event.input_transcription:
                    await websocket.send_text(
                        json.dumps({
                            "type": "input_transcription",
                            "data": event.input_transcription,
                            "partial": getattr(event, "partial", False),
                        })
                    )

                if hasattr(event, "output_transcription") and event.output_transcription:
                    await websocket.send_text(
                        json.dumps({
                            "type": "output_transcription",
                            "data": event.output_transcription,
                        })
                    )

        except WebSocketDisconnect:
            logger.info(f"Downstream disconnected for session: {session_id}")
        except Exception as e:
            logger.error(f"Downstream error: {e}", exc_info=True)
            # Send error to client so they know what happened
            try:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "data": f"Voice stream error: {str(e)}",
                }))
            except Exception:
                pass
        finally:
            shutdown_event.set()

    try:
        await asyncio.gather(upstream(), downstream())
    finally:
        live_request_queue.close()
        logger.info(f"Voice WebSocket closed for session: {session_id}")
