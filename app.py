from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import git
from analyzer import analyze_repo
from dotenv import load_dotenv
import os
import google.generativeai as genai
import hashlib
import json
from pathlib import Path
import traceback

app = FastAPI()

CACHE_FILE = "summary_cache.json"


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

    return hashlib.md5(
        content.encode("utf-8")
    ).hexdigest()



load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

genai.configure(api_key=GEMINI_API_KEY)

model = genai.GenerativeModel("gemini-2.5-flash")

summary_cache = {}

app = FastAPI()

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

        git.Repo.clone_from(
            repo_url,
            temp_dir
        )

        result = analyze_repo(temp_dir)

        print("Nodes:", len(result["nodes"]))
        print("Edges:", len(result["edges"]))

        return result

    except Exception as e:

        print("ERROR:", e)
        traceback.print_exc()

        return {
            "error": str(e)
        }
    

@app.get("/summary")
def get_summary(file_path: str):

    try:

        with open(
            file_path,
            "r",
            encoding="utf-8",
            errors="ignore"
        ) as f:

            code = f.read()

        current_hash = get_file_hash(code)

        # CACHE HIT
        if file_path in summary_cache:

            cached = summary_cache[file_path]

            if cached["hash"] == current_hash:

                print("CACHE HIT:", file_path)

                return {
                    "summary": cached["summary"]
                }

        print("CACHE MISS:", file_path)

        prompt = f"""
        You are a senior software engineer.

        Explain this file in simple English.

        Include:
        1. What the file does.
        2. Main technologies/frameworks used.
        3. Why it is important.

        Code:

        {code[:10000]}
        """

        response = model.generate_content(prompt)

        summary = response.text

        summary_cache[file_path] = {
            "hash": current_hash,
            "summary": summary
        }

        save_cache(summary_cache)

        print("Cache saved successfully")

        return {
            "summary": summary
        }

    except Exception as e:

        return {
            "summary": "Gemini quota exceeded. Please try again later."
        }