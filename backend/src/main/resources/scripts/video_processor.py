import argparse
import concurrent.futures
import html
import json
import math
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple


YOUTUBE_ID_RE = re.compile(
    r"(?:youtube\.com/(?:watch\?.*?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})"
)
RAW_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


def resolve_ffmpeg(explicit: Optional[str] = None) -> str:
    if explicit and os.path.isfile(explicit):
        return explicit
    which_ffmpeg = shutil.which("ffmpeg")
    if which_ffmpeg:
        return which_ffmpeg
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.isfile(exe):
            return exe
    except Exception:
        pass
    raise RuntimeError("FFmpeg executable not found")


def extract_youtube_id(url: str) -> Optional[str]:
    u = (url or "").strip()
    if RAW_ID_RE.match(u):
        return u
    m = YOUTUBE_ID_RE.search(u)
    return m.group(1) if m else None


def normalize_media_url(url: str) -> str:
    vid = extract_youtube_id(url)
    if vid:
        return f"https://www.youtube.com/watch?v={vid}"
    return (url or "").strip()


def probe_media_duration_seconds(file_path: str, ffmpeg_exe: str) -> float:
    # Prefer PyAV for fast exact duration without needing separate ffprobe
    try:
        import av

        with av.open(file_path) as container:
            if container.duration is not None:
                return max(0.0, float(container.duration) / 1_000_000.0)
            for stream in container.streams:
                if stream.duration and stream.time_base:
                    return max(0.0, float(stream.duration * stream.time_base))
    except Exception:
        pass

    # Fallback: parse Duration: HH:MM:SS.ms from ffmpeg stderr
    proc = subprocess.run(
        [ffmpeg_exe, "-i", file_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="ignore",
    )
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", proc.stderr or "")
    if m:
        h, mins, secs = int(m.group(1)), int(m.group(2)), float(m.group(3))
        return h * 3600.0 + mins * 60.0 + secs
    return 0.0


def classify_ytdlp_error(msg: str) -> str:
    low = (msg or "").lower()
    if any(k in low for k in ("private video", "members-only", "sign in to confirm", "drm", "age-restricted", "login")):
        return "PRIVATE_OR_DRM"
    if any(k in low for k in ("video unavailable", "removed", "been deleted", "does not exist", "terminated")):
        return "VIDEO_UNAVAILABLE"
    if "unsupported url" in low:
        return "UNSUPPORTED_SOURCE"
    return "EXTRACTION_FAILED"


def resolve_ytdlp_cookies_file() -> Optional[str]:
    candidates = [
        (os.environ.get("TOEIC_YTDLP_COOKIES") or "").strip(),
        (os.environ.get("TOEIC_YTDLP_COOKIES_FILE") or "").strip(),
        "/app/data/youtube_cookies.txt",
        "/opt/toeic/data/youtube_cookies.txt",
        os.path.join("data", "youtube_cookies.txt"),
        "youtube_cookies.txt",
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate) and os.path.getsize(candidate) > 0:
            return candidate
    return None


def make_temp_cookies_copy(cookies_src: Optional[str]) -> Optional[str]:
    if not cookies_src:
        return None
    try:
        fd, tmp_path = tempfile.mkstemp(prefix="yt_cookies_", suffix=".txt")
        os.close(fd)
        shutil.copyfile(cookies_src, tmp_path)
        return tmp_path
    except Exception:
        return cookies_src


def apply_ytdlp_deploy_env(opts: Dict[str, Any], cookie_path: Optional[str] = None) -> Dict[str, Any]:
    effective_cookies = cookie_path or resolve_ytdlp_cookies_file()
    if effective_cookies and os.path.isfile(effective_cookies):
        opts["cookiefile"] = effective_cookies
    proxy_url = (os.environ.get("TOEIC_YTDLP_PROXY") or "").strip()
    if proxy_url:
        opts["proxy"] = proxy_url
    return opts


def extract_ytdlp_info(url: str, allow_playlist: bool = False) -> Dict[str, Any]:
    import yt_dlp

    canonical = normalize_media_url(url)
    last_err = None
    cookies_src = resolve_ytdlp_cookies_file()
    temp_cookies = make_temp_cookies_copy(cookies_src)
    client_profiles = (
        [None, ["web"], ["mweb"], ["tv_embedded"], ["android", "web"]]
        if temp_cookies
        else [["android", "web"], ["tv_embedded"], ["ios"], None]
    )
    try:
        for profile in client_profiles:
            opts: Dict[str, Any] = apply_ytdlp_deploy_env({
                "quiet": True,
                "no_warnings": True,
                "noplaylist": not allow_playlist,
                "skip_download": True,
                "socket_timeout": 12,
            }, temp_cookies)
            if profile is not None:
                opts["extractor_args"] = {"youtube": {"player_client": profile, "skip": ["dash", "hls"]}}
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(canonical, download=False)
                if info and "entries" in info and info["entries"]:
                    info = info["entries"][0]
                if info:
                    return info
            except Exception as exc:
                last_err = str(exc)
                code = classify_ytdlp_error(last_err)
                if code == "VIDEO_UNAVAILABLE" or (not temp_cookies and code == "PRIVATE_OR_DRM"):
                    raise RuntimeError(f"{code}:{last_err}") from exc
        raise RuntimeError(f"{classify_ytdlp_error(str(last_err))}:{last_err}")
    finally:
        if temp_cookies and temp_cookies != cookies_src and os.path.isfile(temp_cookies):
            try:
                os.remove(temp_cookies)
            except OSError:
                pass


def _is_muxed_video_audio(fmt: Dict[str, Any]) -> bool:
    vcodec = str(fmt.get("vcodec") or "").strip().lower()
    acodec = str(fmt.get("acodec") or "").strip().lower()
    return bool(fmt.get("url")) and bool(vcodec) and vcodec != "none" and bool(acodec) and acodec != "none"


def pick_best_progressive_mp4_url(info: Dict[str, Any]) -> Optional[str]:
    """Select a muxed (video + audio) stream URL compatible with mobile ExoPlayer/AVPlayer."""
    formats = info.get("formats") or []
    progressive_mp4 = [
        f
        for f in formats
        if _is_muxed_video_audio(f)
        and str(f.get("ext") or "").lower() == "mp4"
        and "m3u8" not in str(f.get("protocol") or "").lower()
    ]
    if progressive_mp4:
        # Prefer <=720p H.264 + AAC progressive MP4 for reliable hardware decoding and instant startup
        progressive_mp4.sort(
            key=lambda f: (
                1 if "avc" in str(f.get("vcodec") or "").lower() or "h264" in str(f.get("vcodec") or "").lower() else 0,
                1 if (f.get("height") or 0) <= 720 else 0,
                f.get("height") or 0,
                f.get("tbr") or 0,
            ),
            reverse=True,
        )
        return progressive_mp4[0].get("url")

    # Fallback 1: any progressive combined (video + audio) non-HLS format
    progressive_any = [
        f
        for f in formats
        if _is_muxed_video_audio(f)
        and "m3u8" not in str(f.get("protocol") or "").lower()
    ]
    if progressive_any:
        progressive_any.sort(key=lambda f: (f.get("height") or 0, f.get("tbr") or 0), reverse=True)
        return progressive_any[0].get("url")

    # Fallback 2: top-level info URL ONLY if it contains both video and audio
    direct_url = info.get("url")
    if direct_url and _is_muxed_video_audio(info) and not str(direct_url).endswith(".m3u8"):
        return direct_url

    # Fallback 3: combined muxed HLS stream
    hls_muxed = [f for f in formats if _is_muxed_video_audio(f)]
    if hls_muxed:
        hls_muxed.sort(key=lambda f: (f.get("height") or 0, f.get("tbr") or 0), reverse=True)
        return hls_muxed[0].get("url")
    return None


def cmd_metadata(args: argparse.Namespace) -> Dict[str, Any]:
    raw_url = (args.url or "").strip()
    vid = extract_youtube_id(raw_url)
    is_direct_media = bool(re.search(r"\.(mp4|webm|mp3|wav|m4a|ogg)(\?|$)", raw_url, re.I))

    if is_direct_media and not vid:
        ffmpeg_exe = resolve_ffmpeg(args.ffmpeg_bin)
        dur = probe_media_duration_seconds(raw_url, ffmpeg_exe)
        title = os.path.basename(urllib.parse.urlparse(raw_url).path) or "Direct English Media"
        return {
            "videoUid": f"media_{abs(hash(raw_url))}",
            "canonicalUrl": raw_url,
            "platform": "DIRECT_MEDIA",
            "title": title,
            "description": "",
            "authorName": urllib.parse.urlparse(raw_url).netloc or "Direct Source",
            "thumbnailUrl": "",
            "streamVideoUrl": raw_url,
            "audioLanguage": "en",
            "durationSeconds": int(round(dur)),
            "hasCaptions": False,
        }

    info = extract_ytdlp_info(raw_url, allow_playlist=getattr(args, "allow_playlist", False))
    video_uid = info.get("id") or vid or f"vid_{abs(hash(raw_url))}"
    platform = (info.get("extractor_key") or ("YOUTUBE" if vid else "EXTERNAL")).upper()
    duration = int(round(float(info.get("duration") or 0)))
    subtitles = info.get("subtitles") or {}
    auto_caps = info.get("automatic_captions") or {}
    has_en_subs = any(k.lower().startswith("en") for k in list(subtitles.keys()) + list(auto_caps.keys()))
    stream_url = pick_best_progressive_mp4_url(info) or ""
    raw_desc = (info.get("description") or "").strip()
    if len(raw_desc) > 1500:
        raw_desc = raw_desc[:1500].strip()

    return {
        "videoUid": video_uid,
        "canonicalUrl": info.get("webpage_url") or normalize_media_url(raw_url),
        "platform": platform,
        "title": info.get("title") or f"Video ({video_uid})",
        "description": raw_desc,
        "authorName": info.get("uploader") or info.get("channel") or "English Channel",
        "thumbnailUrl": info.get("thumbnail") or (f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if vid else ""),
        "streamVideoUrl": stream_url,
        "audioLanguage": info.get("language") or "en",
        "durationSeconds": duration,
        "hasCaptions": has_en_subs,
    }


STAGE_TAG_RE = re.compile(
    r"[\[\(]\s*(?:music|applause|laughter|laughing|cheering|sound|noise|inaudible|singing|audio|âm nhạc|nhạc|vỗ tay|cười|tiếng động)[^\]\)]*[\]\)]",
    re.I,
)
SPEAKER_ARROW_RE = re.compile(r"(?:>>+|<<+|&gt;&gt;|&lt;&lt;|[♪♫]+)")


def clean_caption_fragment(raw: str) -> str:
    txt = html.unescape(raw or "").replace("\n", " ")
    txt = STAGE_TAG_RE.sub(" ", txt)
    txt = SPEAKER_ARROW_RE.sub(" ", txt)
    txt = re.sub(r"^\s*[-–—•]+\s*", "", txt)
    return re.sub(r"\s+", " ", txt).strip()


def split_raw_cue_parts(start: float, dur: float, raw_text: str) -> List[Tuple[float, float, str]]:
    """Split a YouTube cue on speaker markers (>>) or mid-cue sentence boundaries so lines stay short and synced."""
    unescaped = html.unescape(raw_text or "").replace("\n", " ")
    # First split on explicit speaker turn markers (>>)
    raw_turns = [t.strip() for t in re.split(r">>+", unescaped) if clean_caption_fragment(t)]
    if not raw_turns:
        return []

    pieces: List[str] = []
    for turn in raw_turns:
        cleaned = clean_caption_fragment(turn)
        if not cleaned:
            continue
        # Further split long cues that pack multiple sentences together
        sub_sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
        for sub in sub_sentences:
            words = sub.split()
            if len(words) > 9:
                chunk_size = 7 if len(words) >= 14 else (len(words) + 1) // 2
                for i in range(0, len(words), chunk_size):
                    part = " ".join(words[i : i + chunk_size]).strip()
                    if part:
                        pieces.append(part)
            else:
                pieces.append(sub)

    if not pieces:
        return []
    safe_start = max(0.0, float(start))
    safe_dur = max(0.8, float(dur or max(1.6, len(pieces) * 1.4)))
    total_chars = max(1, sum(len(p) for p in pieces))
    out: List[Tuple[float, float, str]] = []
    cursor = safe_start
    for idx, piece in enumerate(pieces):
        share = safe_dur * (len(piece) / total_chars)
        p_dur = max(0.65, share)
        if idx == len(pieces) - 1:
            p_end = max(cursor + 0.65, safe_start + safe_dur)
            p_dur = p_end - cursor
        out.append((cursor, p_dur, piece))
        cursor += p_dur
    return out


def merge_caption_cues_to_sentences(raw_cues: List[Tuple[float, float, str]]) -> List[Dict[str, Any]]:
    if not raw_cues:
        return []

    # Expand and sanitize cues first
    expanded: List[Tuple[float, float, str]] = []
    for start, dur, text in raw_cues:
        expanded.extend(split_raw_cue_parts(start, dur, text))

    merged: List[Dict[str, Any]] = []
    cur_start: Optional[float] = None
    cur_end: float = 0.0
    cur_tokens: List[str] = []

    def flush_current() -> None:
        nonlocal cur_start, cur_end, cur_tokens
        if not cur_tokens or cur_start is None:
            cur_start = None
            cur_end = 0.0
            cur_tokens = []
            return
        combined = clean_caption_fragment(" ".join(cur_tokens))
        if combined:
            merged.append(
                {
                    "start_time": round(cur_start, 2),
                    "end_time": round(max(cur_end, cur_start + 0.9), 2),
                    "english_text": combined,
                    "confidence": 0.94,
                    "uncertain": False,
                }
            )
        cur_start = None
        cur_end = 0.0
        cur_tokens = []

    for start, dur, cleaned in expanded:
        start = max(0.0, float(start))
        end = max(start + 0.65, start + float(dur or 1.8))

        # Break cleanly on noticeable speech pauses (> 1.1s gap)
        if cur_start is not None and start - cur_end >= 1.1:
            flush_current()

        if cur_start is None:
            cur_start = start

        joined_so_far = " ".join(cur_tokens)
        if joined_so_far and cleaned.lower() == joined_so_far.lower():
            cur_end = max(cur_end, end)
            continue

        cur_tokens.append(cleaned)
        cur_end = max(cur_end, end)
        combined = " ".join(cur_tokens).strip()
        word_count = len(combined.split())
        ends_sentence = combined.endswith((".", "!", "?"))
        ends_clause = combined.endswith((",", ";", ":"))
        span = cur_end - cur_start

        if (
            (ends_sentence and word_count >= 3)
            or (ends_clause and word_count >= 6)
            or word_count >= 9
            or span >= 4.2
        ):
            flush_current()

    flush_current()

    for idx in range(1, len(merged)):
        if merged[idx]["start_time"] < merged[idx - 1]["end_time"]:
            merged[idx - 1]["end_time"] = round(merged[idx]["start_time"], 2)
        if merged[idx - 1]["end_time"] <= merged[idx - 1]["start_time"]:
            merged[idx - 1]["end_time"] = round(merged[idx - 1]["start_time"] + 0.7, 2)
        if merged[idx]["end_time"] <= merged[idx]["start_time"]:
            merged[idx]["end_time"] = round(merged[idx]["start_time"] + 1.0, 2)

    return merged


def fetch_raw_youtube_captions(vid: Optional[str]) -> Tuple[List[Dict[str, Any]], str]:
    if not vid:
        return [], "NOT_YOUTUBE"

    raw_cues: List[Tuple[float, float, str]] = []
    source_engine = "YOUTUBE_TRANSCRIPT_API"

    try:
        from youtube_transcript_api import YouTubeTranscriptApi

        ytt = YouTubeTranscriptApi()
        transcript_list = ytt.list(vid)
        chosen = None
        for t in transcript_list:
            if not t.is_generated and t.language_code.lower().startswith("en"):
                chosen = t
                break
        if chosen is None:
            for t in transcript_list:
                if t.language_code.lower().startswith("en"):
                    chosen = t
                    source_engine = "YOUTUBE_AUTO_CAPTIONS"
                    break
        if chosen is not None:
            fetched = chosen.fetch()
            for item in fetched:
                raw_cues.append((float(item.start), float(item.duration), str(item.text)))
    except Exception:
        raw_cues = []

    segments = merge_caption_cues_to_sentences(raw_cues)
    return segments, source_engine


def cmd_fetch_captions(args: argparse.Namespace) -> Dict[str, Any]:
    vid = extract_youtube_id(args.url)
    expected_duration = max(0, int(args.expected_duration or 0))
    if not vid:
        return {"available": False, "complete": False, "segments": [], "reason": "NOT_YOUTUBE"}

    segments, source_engine = fetch_raw_youtube_captions(vid)
    if not segments:
        return {"available": False, "complete": False, "segments": [], "reason": "NO_CAPTIONS"}

    max_end = max(seg["end_time"] for seg in segments)
    coverage_ok = expected_duration <= 90 or max_end >= expected_duration * 0.72
    return {
        "available": True,
        "complete": coverage_ok,
        "coverageEndSeconds": round(max_end, 2),
        "expectedDurationSeconds": expected_duration,
        "engine": source_engine,
        "segmentCount": len(segments),
        "segments": segments,
    }


def cmd_metadata_and_captions(args: argparse.Namespace) -> Dict[str, Any]:
    raw_url = (args.url or "").strip()
    vid = extract_youtube_id(raw_url)
    skip_captions = bool(getattr(args, "skip_captions", False))

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        meta_future = pool.submit(cmd_metadata, args)
        cap_future = pool.submit(fetch_raw_youtube_captions, vid) if (vid and not skip_captions) else None

        meta = meta_future.result()
        segments: List[Dict[str, Any]] = []
        source_engine = "NO_CAPTIONS"
        if cap_future is not None:
            segments, source_engine = cap_future.result()

    expected_duration = max(0, int(meta.get("durationSeconds") or 0))
    if segments:
        max_end = max(seg["end_time"] for seg in segments)
        coverage_ok = expected_duration <= 90 or max_end >= expected_duration * 0.72
        captions_payload = {
            "available": True,
            "complete": coverage_ok,
            "coverageEndSeconds": round(max_end, 2),
            "expectedDurationSeconds": expected_duration,
            "engine": source_engine,
            "segmentCount": len(segments),
            "segments": segments,
        }
    else:
        captions_payload = {"available": False, "complete": False, "segments": [], "reason": source_engine}

    return {
        "metadata": meta,
        "captions": captions_payload,
    }


def cmd_prepare_audio(args: argparse.Namespace) -> Dict[str, Any]:
    ffmpeg_exe = resolve_ffmpeg(args.ffmpeg_bin)
    workdir = pathlib.Path(args.workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    chunks_dir = workdir / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    raw_url = (args.url or "").strip()
    expected_duration = max(0, int(args.expected_duration or 0))
    chunk_seconds = max(30, int(args.chunk_seconds or 300))

    vid = extract_youtube_id(raw_url)
    is_direct = bool(re.search(r"\.(mp4|webm|mp3|wav|m4a|ogg)(\?|$)", raw_url, re.I)) and not vid

    if is_direct:
        downloaded_path = workdir / "source_direct.bin"
        if not downloaded_path.exists():
            urllib.request.urlretrieve(raw_url, str(downloaded_path))
        source_file = str(downloaded_path)
    else:
        import yt_dlp

        out_tmpl = str(workdir / "downloaded_audio.%(ext)s")
        existing = list(workdir.glob("downloaded_audio.*"))
        if existing:
            source_file = str(existing[0])
        else:
            last_err = None
            source_file = ""
            cookies_src = resolve_ytdlp_cookies_file()
            temp_cookies = make_temp_cookies_copy(cookies_src)
            dl_profiles = (
                (None, ["web"], ["mweb"], ["tv_embedded"], ["android", "web"])
                if temp_cookies
                else (["android", "web"], ["tv_embedded"], ["ios"], None)
            )
            try:
                for profile in dl_profiles:
                    opts: Dict[str, Any] = apply_ytdlp_deploy_env({
                        "format": "bestaudio[ext=m4a]/bestaudio/best",
                        "outtmpl": out_tmpl,
                        "noplaylist": True,
                        "quiet": True,
                        "no_warnings": True,
                        "concurrent_fragment_downloads": 4,
                        "socket_timeout": 15,
                    }, temp_cookies)
                    if profile is not None:
                        opts["extractor_args"] = {"youtube": {"player_client": profile}}
                    try:
                        with yt_dlp.YoutubeDL(opts) as ydl:
                            ydl.download([normalize_media_url(raw_url)])
                        found = list(workdir.glob("downloaded_audio.*"))
                        if found:
                            source_file = str(found[0])
                            break
                    except Exception as exc:
                        last_err = str(exc)
            finally:
                if temp_cookies and temp_cookies != cookies_src and os.path.isfile(temp_cookies):
                    try:
                        os.remove(temp_cookies)
                    except OSError:
                        pass
            if not source_file:
                raise RuntimeError(f"AUDIO_DOWNLOAD_FAILED:{last_err}")

    # Fast exact duration probe via PyAV/FFmpeg on source audio
    actual_duration = probe_media_duration_seconds(source_file, ffmpeg_exe)
    actual_int = int(round(actual_duration))

    # Strict duration verification: reject silent truncation to 60s
    if expected_duration > 90 and actual_duration > 0 and actual_duration < expected_duration * 0.85:
        raise RuntimeError(
            f"DURATION_MISMATCH: expected={expected_duration}s actual={actual_int}s (truncated media)"
        )

    existing_chunks = sorted(chunks_dir.glob("chunk_*.mp3"))
    if not existing_chunks:
        # Single-pass FFmpeg audio conversion + chunk segmentation (much faster than 2-step encode+split)
        seg_pattern = str(chunks_dir / "chunk_%04d.mp3")
        proc = subprocess.run(
            [
                ffmpeg_exe,
                "-y",
                "-i",
                source_file,
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-b:a",
                "32k",
                "-f",
                "segment",
                "-segment_time",
                str(chunk_seconds),
                "-reset_timestamps",
                "1",
                seg_pattern,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
        if proc.returncode != 0:
            raise RuntimeError(f"FFMPEG_EXTRACT_FAILED:{(proc.stderr or '')[-400:]}")
        existing_chunks = sorted(chunks_dir.glob("chunk_*.mp3"))

    if not existing_chunks:
        raise RuntimeError("FFMPEG_EXTRACT_FAILED: No audio chunks produced")

    # Compute verified duration from produced chunks if source container lacked duration header
    total_chunk_dur = 0.0
    chunks_meta: List[Dict[str, Any]] = []
    running_offset = 0.0
    for idx, chunk_file in enumerate(existing_chunks):
        c_dur = probe_media_duration_seconds(str(chunk_file), ffmpeg_exe)
        if c_dur <= 0:
            c_dur = float(chunk_seconds)
        chunks_meta.append(
            {
                "chunkIndex": idx,
                "offsetSeconds": round(idx * float(chunk_seconds), 2),
                "durationSeconds": round(c_dur, 2),
                "filePath": str(chunk_file),
            }
        )
        running_offset += c_dur
        total_chunk_dur += c_dur

    if actual_duration <= 0:
        actual_duration = total_chunk_dur
        actual_int = int(round(actual_duration))

    if expected_duration > 90 and actual_duration < expected_duration * 0.85:
        raise RuntimeError(
            f"DURATION_MISMATCH: expected={expected_duration}s actual={actual_int}s (truncated media)"
        )

    return {
        "audioFilePath": str(source_file),
        "actualDurationSeconds": actual_int,
        "expectedDurationSeconds": expected_duration,
        "chunkDurationSeconds": chunk_seconds,
        "chunkCount": len(chunks_meta),
        "chunks": chunks_meta,
    }


def cmd_transcribe_chunk(args: argparse.Namespace) -> Dict[str, Any]:
    from faster_whisper import WhisperModel

    chunk_path = args.audio
    offset = float(args.offset or 0.0)
    model_name = args.model or "tiny.en"
    cpu_threads = max(2, min(8, os.cpu_count() or 4))

    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=cpu_threads)
    segments_iter, info = model.transcribe(
        chunk_path,
        language="en",
        beam_size=1,
        vad_filter=True,
        condition_on_previous_text=True,
    )

    out_segments: List[Dict[str, Any]] = []
    confs: List[float] = []
    uncertain_count = 0

    for seg in segments_iter:
        raw_text = re.sub(r"\s+", " ", (seg.text or "")).strip()
        if not raw_text:
            continue
        start_abs = round(max(0.0, offset + float(seg.start)), 2)
        end_abs = round(max(start_abs + 0.5, offset + float(seg.end)), 2)
        avg_logprob = float(getattr(seg, "avg_logprob", -0.3) or -0.3)
        no_speech_prob = float(getattr(seg, "no_speech_prob", 0.0) or 0.0)
        conf = round(max(0.05, min(0.99, math.exp(avg_logprob * 0.65))), 3)
        uncertain = avg_logprob < -1.05 or no_speech_prob > 0.6

        sub_parts = split_raw_cue_parts(start_abs, end_abs - start_abs, raw_text)
        if not sub_parts:
            continue

        for p_start, p_dur, p_text in sub_parts:
            p_st = round(max(0.0, p_start), 2)
            p_en = round(max(p_st + 0.5, p_st + p_dur), 2)
            if uncertain:
                uncertain_count += 1
            confs.append(conf)
            out_segments.append(
                {
                    "start_time": p_st,
                    "end_time": p_en,
                    "english_text": p_text,
                    "confidence": conf,
                    "uncertain": uncertain,
                }
            )

    return {
        "detectedLanguage": getattr(info, "language", "en") or "en",
        "languageProbability": round(float(getattr(info, "language_probability", 1.0) or 1.0), 3),
        "asrEngine": f"FASTER_WHISPER_{model_name.upper()}",
        "averageConfidence": round(sum(confs) / len(confs), 3) if confs else 0.0,
        "uncertainSegmentCount": uncertain_count,
        "segments": out_segments,
    }


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="TOEIC Video & Audio Processing Bridge")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_meta = sub.add_parser("metadata")
    p_meta.add_argument("--url", required=True)
    p_meta.add_argument("--allow-playlist", action="store_true")
    p_meta.add_argument("--ffmpeg-bin", default="")

    p_cap = sub.add_parser("fetch-captions")
    p_cap.add_argument("--url", required=True)
    p_cap.add_argument("--expected-duration", type=int, default=0)

    p_fast = sub.add_parser("metadata-and-captions")
    p_fast.add_argument("--url", required=True)
    p_fast.add_argument("--allow-playlist", action="store_true")
    p_fast.add_argument("--ffmpeg-bin", default="")
    p_fast.add_argument("--skip-captions", action="store_true")

    p_prep = sub.add_parser("prepare-audio")
    p_prep.add_argument("--url", required=True)
    p_prep.add_argument("--workdir", required=True)
    p_prep.add_argument("--chunk-seconds", type=int, default=300)
    p_prep.add_argument("--expected-duration", type=int, default=0)
    p_prep.add_argument("--ffmpeg-bin", default="")

    p_asr = sub.add_parser("transcribe-chunk")
    p_asr.add_argument("--audio", required=True)
    p_asr.add_argument("--offset", type=float, default=0.0)
    p_asr.add_argument("--model", default="tiny.en")

    args = parser.parse_args()
    try:
        if args.cmd == "metadata":
            res = cmd_metadata(args)
        elif args.cmd == "fetch-captions":
            res = cmd_fetch_captions(args)
        elif args.cmd == "metadata-and-captions":
            res = cmd_metadata_and_captions(args)
        elif args.cmd == "prepare-audio":
            res = cmd_prepare_audio(args)
        elif args.cmd == "transcribe-chunk":
            res = cmd_transcribe_chunk(args)
        else:
            raise ValueError(f"Unknown command: {args.cmd}")
        print(json.dumps(res, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
