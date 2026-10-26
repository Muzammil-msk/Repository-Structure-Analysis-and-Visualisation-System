from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import git
from analyzer import analyze_repo
from dotenv import load_dotenv
import os
from google import genai
from google.genai import errors as genai_errors
import hashlib
import json
from pathlib import Path
import traceback
import time

# ── Load .env BEFORE initialising the Gemini client ─────────────────
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. "
        "Make sure a .env file with GEMINI_API_KEY=<your-key> "
        "exists beside app.py."
    )

client = genai.Client(api_key=GEMINI_API_KEY)

# ── Model ────────────────────────────────────────────────────────────
GEMINI_MODEL = "gemini-3.5-flash-lite"

# ── Summary cache ────────────────────────────────────────────────────
CACHE_FILE = "summary_cache.json"

app = FastAPI()
print("### RUNNING THE UPDATED APP.PY ###", flush=True)


def load_cache():
    if Path(CACHE_FILE).exists():
        with open(CACHE_FILE, "r") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)


summary_cache = load_cache()


def get_file_hash(content):
    return hashlib.md5(content.encode("utf-8")).hexdigest()


# ── Gemini helper with bounded exponential backoff ───────────────────
def call_gemini_with_retry(prompt: str, max_attempts: int = 4) -> str:
    """
    Call the Gemini API and retry on transient 503 / 429 errors.
    Uses exponential backoff: 2s, 4s, 8s …  (capped at 3 retries).
    Raises the original exception after all attempts are exhausted.
    """
    delay = 2  # seconds before first retry
    for attempt in range(1, max_attempts + 1):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
            )
            if not response.text:
                raise RuntimeError("Gemini returned an empty response body.")
            return response.text
        except genai_errors.ServerError as exc:
            # 503 Service Unavailable — transient, worth retrying
            if attempt < max_attempts:
                print(
                    f"Gemini 503 on attempt {attempt}/{max_attempts}; "
                    f"retrying in {delay}s…",
                    flush=True,
                )
                time.sleep(delay)
                delay *= 2
            else:
                raise RuntimeError(
                    f"Gemini service unavailable after {max_attempts} attempts "
                    f"(503). Try again later."
                ) from exc
        except genai_errors.ClientError as exc:
            # 429 Resource Exhausted / quota — retry with backoff
            status = getattr(exc, "status_code", None)
            if status == 429 and attempt < max_attempts:
                print(
                    f"Gemini 429 (rate-limit) on attempt {attempt}/{max_attempts}; "
                    f"retrying in {delay}s…",
                    flush=True,
                )
                time.sleep(delay)
                delay *= 2
            elif status == 429:
                raise RuntimeError(
                    f"Gemini quota/rate-limit exceeded after {max_attempts} attempts. "
                    "Wait a moment and try again."
                ) from exc
            else:
                # Any other 4xx (e.g. 401 invalid key, 404 bad model) –
                # do NOT retry; surface a clean message.
                raise RuntimeError(
                    f"Gemini API error ({status}): {exc}"
                ) from exc


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Backend working"}


@app.get("/analyze")
def analyze(repo_path: str):
    return analyze_repo(repo_path)


@app.post("/analyze-github")
def analyze_github(repo_url: str):
    print("Received repo:", repo_url)
    try:
        print("Cloning:", repo_url)
        temp_dir = tempfile.mkdtemp()
        git.Repo.clone_from(repo_url, temp_dir)
        result = analyze_repo(temp_dir)
        print("Nodes:", len(result["nodes"]))
        print("Edges:", len(result["edges"]))
        return result
    except Exception as e:
        print("ERROR:", e)
        traceback.print_exc()
        return {"error": str(e)}


@app.get("/summary")
def get_summary(file_path: str):
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            code = f.read()

        current_hash = get_file_hash(code)

        # ── Cache hit ────────────────────────────────────────────────
        cached = summary_cache.get(file_path)
        if cached and cached.get("hash") == current_hash:
            print("CACHE HIT:", file_path)
            return {"summary": cached["summary"]}

        print("CACHE MISS:", file_path)

        prompt = f"""You are a senior software engineer.
Explain this file in simple English. Include:
1. What the file does.
2. Main technologies/frameworks used.
3. Why it is important.

Code:
{code[:10000]}
"""

        # ── Call Gemini (with retry on 503 / 429) ────────────────────
        summary = call_gemini_with_retry(prompt)

        # ── Update cache ─────────────────────────────────────────────
        summary_cache[file_path] = {
            "hash": current_hash,
            "summary": summary,
        }
        save_cache(summary_cache)
        print("Summary generated and cached successfully")

        return {"summary": summary}

    except FileNotFoundError:
        msg = f"File not found: {Path(file_path).name}"
        print("SUMMARY FAILURE:", msg)
        return {"summary": f"⚠️ {msg}"}

    except Exception as e:
        # Log the full trace server-side but return only a safe message.
        print(f"SUMMARY FAILURE: {type(e).__name__}: {e}")
        traceback.print_exc()
        return {
            "summary": f"⚠️ Summary generation failed: {e}"
        }
