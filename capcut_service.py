#!/usr/bin/env python3
"""
CapCut Integration Service Bridge for Node.js Express server.
Provides Text-to-Speech (TTS) and Speech-to-Text (STT) capabilities using CapCut API.
"""

import sys
import json
import argparse
from pathlib import Path

# Ensure UTF-8 output
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from capcut_tts_api import CapCutClient, CapCutError

def handle_voices(lang=None):
    client = CapCutClient()
    catalog_path = Path(__file__).parent / "Voice.json"
    voices = client.list_voices(lang=lang, catalog_path=catalog_path)
    result = [
        {
            "displayName": v.display_name,
            "voiceType": v.voice_type,
            "resourceId": v.resource_id,
            "lang": v.lang,
            "lan": v.lan
        }
        for v in voices
    ]
    return {"success": True, "voices": result}

def handle_tts(text, voice="BV421_vivn_streaming", rate="1.0"):
    if not text or not text.strip():
        return {"success": False, "error": "Văn bản không được để trống"}

    client = CapCutClient()
    # Resolve display name or voice type
    resolved_voice, resolved_res = client.resolve_voice(voice=voice)

    res = client.generate_speech(
        texts=text.strip(),
        voice=resolved_voice,
        resource_id=resolved_res,
        rate=str(rate),
        wait=True,
        timeout=60.0
    )

    tasks = (res.get("data") or {}).get("tasks") or []
    if not tasks:
        return {"success": False, "error": "CapCut không trả về task xử lý"}

    payload_raw = tasks[0].get("payload", "{}")
    payload = json.loads(payload_raw) if isinstance(payload_raw, str) else payload_raw
    audio_subtitles = payload.get("audio_subtitles") or []
    if not audio_subtitles:
        return {"success": False, "error": "Không tìm thấy đường dẫn âm thanh từ CapCut"}

    first_item = audio_subtitles[0]
    return {
        "success": True,
        "audioUrl": first_item.get("speech_url"),
        "durationMs": first_item.get("duration", 0),
        "voiceType": resolved_voice,
        "resourceId": resolved_res
    }

def handle_stt(file_path, language="vi-VN"):
    client = CapCutClient()
    res = client.transcribe_file(
        file_path=file_path,
        language=language,
        wait=True,
        timeout=120.0
    )
    subtitles = client.extract_subtitles(res)
    utterances = [
        {
            "text": u.text,
            "start": u.start_time / 1000.0,
            "end": u.end_time / 1000.0
        }
        for u in subtitles.utterances
    ]
    return {
        "success": True,
        "text": subtitles.full_text,
        "segments": utterances
    }

def main():
    parser = argparse.ArgumentParser(description="CapCut TTS and STT Service")
    subparsers = parser.add_subparsers(dest="action", help="Action to perform")

    # Voices subcommand
    p_voices = subparsers.add_parser("voices", help="List available voices")
    p_voices.add_argument("--lang", default="vi", help="Language filter (e.g. vi, en)")

    # TTS subcommand
    p_tts = subparsers.add_parser("tts", help="Generate Text-to-Speech")
    p_tts.add_argument("--text", required=False, help="Text to convert")
    p_tts.add_argument("--text-file", required=False, help="Path to text file")
    p_tts.add_argument("--voice", default="BV421_vivn_streaming", help="Voice type or display name")
    p_tts.add_argument("--rate", default="1.0", help="Speech rate multiplier")

    # STT subcommand
    p_stt = subparsers.add_parser("stt", help="Transcribe Speech-to-Text")
    p_stt.add_argument("--file", required=True, help="Path to audio file")
    p_stt.add_argument("--lang", default="vi-VN", help="Audio language")

    args = parser.parse_args()

    try:
        if args.action == "voices":
            print(json.dumps(handle_voices(args.lang), ensure_ascii=False))
        elif args.action == "tts":
            text = args.text
            if not text and args.text_file:
                with open(args.text_file, "r", encoding="utf-8") as fp:
                    text = fp.read()
            elif not text and not sys.stdin.isatty():
                try:
                    payload = json.loads(sys.stdin.read())
                    text = payload.get("text", "")
                    if "voice" in payload:
                        args.voice = payload["voice"]
                    if "rate" in payload:
                        args.rate = payload["rate"]
                except Exception:
                    pass
            print(json.dumps(handle_tts(text, args.voice, args.rate), ensure_ascii=False))
        elif args.action == "stt":
            print(json.dumps(handle_stt(args.file, args.lang), ensure_ascii=False))
        else:
            parser.print_help()
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))

if __name__ == "__main__":
    main()
