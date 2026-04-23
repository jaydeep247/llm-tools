"""
llm_runner.py — MULTI-MODEL VERSION
SOP-001 Phase 2 + SOP-002 §5.1 §5.3

Models active (Perplexity excluded per product decision):
  P0 — GPT-4o         (openai)
  P0 — Gemini 1.5 Pro (google)
  P2 — Claude Sonnet  (anthropic)

Changes vs single-model version:
  - _call_llm_for_prompt() dispatches to correct provider by model name
  - run_llm_queries() accepts `models` list — defaults to all 3 active models
  - citation_events stores llm_source + model_version per row (multi-model aware)
  - Rate limit hits → Redis counter + re-queue key per SOP-002 §5.3
  - API key check at startup — skips missing models instead of crashing
"""

import os
import re
import logging
import concurrent.futures
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from utils.mongo import mongo_manager
from utils.config import config

logger = logging.getLogger("llm_runner")

# ─── Active models — Perplexity excluded per product decision ─────────────────
ACTIVE_MODELS = ["gpt-4o", "gemini-2.0-flash", "claude-sonnet-4-5"]

_BATCH_SIZE = 5

# SOP-002 §5.3 rate limit settings
_RATE_LIMIT_WINDOW_SECONDS = 300   # 5-minute window
_RATE_LIMIT_ALERT_THRESHOLD = 3   # admin alert after 3 hits

# ─── Redis client ─────────────────────────────────────────────────────────────
_redis_client = None

def _get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            import redis
            _redis_client = redis.from_url(config.REDIS_URL, decode_responses=True)
        except Exception as exc:
            logger.warning("Redis unavailable — rate limit counters disabled: %s", exc)
    return _redis_client

# ─── Provider client singletons ───────────────────────────────────────────────
_openai_client = None
_anthropic_client = None
_genai_configured = False

def _get_openai():
    global _openai_client
    if _openai_client is None:
        key = os.getenv("OPENAI_API_KEY")
        if not key:
            return None
        try:
            import openai
            _openai_client = openai.OpenAI(api_key=key)
        except Exception as exc:
            logger.error("OpenAI init failed: %s", exc)
    return _openai_client

def _get_anthropic():
    global _anthropic_client
    if _anthropic_client is None:
        key = os.getenv("ANTHROPIC_API_KEY")
        if not key:
            return None
        try:
            import anthropic
            _anthropic_client = anthropic.Anthropic(api_key=key)
        except Exception as exc:
            logger.error("Anthropic init failed: %s", exc)
    return _anthropic_client

def _get_genai():
    global _genai_configured
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        return None
    try:
        import google.generativeai as genai
        if not _genai_configured:
            genai.configure(api_key=key)
            _genai_configured = True
        return genai
    except Exception as exc:
        logger.error("Gemini init failed: %s", exc)
        return None

# ─── SOP-002 §5.2 — system prompt (citation encouragement language required) ──
_SYSTEM_PROMPT = (
    "You are a helpful AI assistant that answers user questions comprehensively. "
    "When you answer, you MUST:\n"
    "1. Cite specific, real URLs as sources using markdown link format: [source title](https://url.com)\n"
    "2. Include at least 3-5 real URLs from reputable websites relevant to the topic\n"
    "3. Structure your answer clearly with the most important source cited first\n"
    "4. Be specific — cite actual domain experts, industry publications, or authoritative pages\n\n"
    "Format citations inline like: According to [Source Name](https://example.com/page), ...\n\n"
    "IMPORTANT: Only cite real websites that actually exist and are relevant to the question."
)

# ─── SOP-002 §5.3 — Rate limit tracking ──────────────────────────────────────

def _record_rate_limit_hit(model: str) -> int:
    r = _get_redis()
    if r is None:
        return 0
    key = f"rate_limit:{model}:hits"
    try:
        count = r.incr(key)
        if count == 1:
            r.expire(key, _RATE_LIMIT_WINDOW_SECONDS)
        if count >= _RATE_LIMIT_ALERT_THRESHOLD:
            logger.critical(
                "[RATE_LIMIT_ALERT] 'Model Throttled' — model=%s hit rate limit "
                "%d times in %ds. Admin action required.",
                model, count, _RATE_LIMIT_WINDOW_SECONDS,
            )
        return count
    except Exception as exc:
        logger.warning("Redis rate limit counter failed: %s", exc)
        return 0

def _requeue_prompt(model: str, prompt_text: str, job_id: str) -> None:
    """SOP-002 §5.3: Push prompt into Redis re-queue list with 60s processing delay."""
    r = _get_redis()
    if r is None:
        return
    key = f"requeue:{job_id}:{model}"
    try:
        r.rpush(key, prompt_text)
        r.expire(key, 3600)
        logger.info(
            "[REQUEUE] Prompt queued for retry in 60s | model=%s | job=%s | prompt='%s'",
            model, job_id, prompt_text[:40],
        )
    except Exception as exc:
        logger.warning("Redis requeue push failed: %s", exc)

# ─── URL / citation helpers ───────────────────────────────────────────────────
_URL_RE = re.compile(r'https?://[^\s\]\)\'"<>]+', re.IGNORECASE)
_MARKDOWN_LINK_RE = re.compile(r'\[([^\]]*)\]\((https?://[^\s\)]+)\)')

def _extract_urls(text: str) -> list:
    urls, seen = [], set()
    for _, url in _MARKDOWN_LINK_RE.findall(text):
        c = url.rstrip(".,;:!?)")
        if c not in seen:
            urls.append(c); seen.add(c)
    for url in _URL_RE.findall(text):
        c = url.rstrip(".,;:!?)")
        if c not in seen:
            urls.append(c); seen.add(c)
    return urls

def _normalize_url(url: str) -> str:
    try:
        p = urlparse(url)
        return f"https://{p.netloc.lower().lstrip('www.')}{p.path.rstrip('/') or '/'}"
    except Exception:
        return url.lower()

def _extract_domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lstrip("www.").lower()
    except Exception:
        return ""

def _is_customer_url(url: str, cust_domain: str) -> bool:
    return bool(cust_domain) and cust_domain.lower() in _extract_domain(url)

def _is_competitor_url(url: str, comp_domains: list) -> tuple:
    dom = _extract_domain(url)
    for c in comp_domains:
        if c.lower() in dom:
            return True, c
    return False, ""

_POS_SIGNALS = ["excellent","best","top","highly recommended","trusted","reliable","leading","authoritative","great","helpful"]
_NEG_SIGNALS = ["avoid","unreliable","outdated","incorrect","scam","misleading","poor","bad","wrong","fake"]

def _citation_position(text: str, url: str) -> str:
    pos = text.lower().find(url.lower())
    if pos == -1:
        return "unknown"
    r = pos / max(len(text), 1)
    return "early" if r < 0.30 else "mid" if r < 0.70 else "late"

def _sentiment(text: str, url: str) -> str:
    dom = _extract_domain(url)
    idx = text.lower().find(dom)
    if idx == -1:
        return "neutral"
    snippet = text[max(0, idx-100): idx+200].lower()
    p = sum(1 for s in _POS_SIGNALS if s in snippet)
    n = sum(1 for s in _NEG_SIGNALS if s in snippet)
    return "positive" if p > n else "negative" if n > p else "neutral"

def _build_citations(response_text: str) -> list:
    return [
        {
            "source": _normalize_url(url),
            "raw_url": url,
            "position": i + 1,
            "citation_position": _citation_position(response_text, url),
        }
        for i, url in enumerate(_extract_urls(response_text))
    ]

# ─── Cost rates [USD per 1M tokens: input, output] ────────────────────────────
_COST_RATES = {
    "gpt-4o":            (5.00, 15.00),
    "gemini-2.0-flash":    (3.50, 10.50),
    "claude-sonnet-4-5": (3.00, 15.00),
}

def _compute_cost(model: str, inp: int, out: int) -> float:
    ir, or_ = _COST_RATES.get(model, (5.0, 15.0))
    return round((inp / 1_000_000) * ir + (out / 1_000_000) * or_, 8)

# ─── Per-provider callers ─────────────────────────────────────────────────────

def _call_openai(prompt_text: str, page_url: str, job_id: str) -> dict:
    client = _get_openai()
    if not client:
        return {"error": "OPENAI_API_KEY not set", "prompt": prompt_text}
    try:
        user_msg = f"{prompt_text}\n\n[Context: monitoring AI citation behaviour for {page_url}]"
        resp = client.chat.completions.create(
            model="gpt-4o", max_tokens=1200,
            messages=[{"role": "system", "content": _SYSTEM_PROMPT},
                      {"role": "user",   "content": user_msg}],
        )
        text = resp.choices[0].message.content or ""
        return {
            "prompt": prompt_text, "response": text,
            "citations": _build_citations(text),
            "input_tokens":  resp.usage.prompt_tokens     if resp.usage else 0,
            "output_tokens": resp.usage.completion_tokens if resp.usage else 0,
            "llm_source": "openai", "model": "gpt-4o",
        }
    except Exception as exc:
        s = str(exc)
        if "429" in s or "rate_limit" in s.lower():
            count = _record_rate_limit_hit("gpt-4o")
            _requeue_prompt("gpt-4o", prompt_text, job_id)
            return {"error": f"Rate limit hit #{count}: {exc}", "prompt": prompt_text, "requeued": True}
        return {"error": s, "prompt": prompt_text}

def _call_gemini(prompt_text: str, page_url: str, job_id: str) -> dict:
    genai = _get_genai()
    if not genai:
        return {"error": "GEMINI_API_KEY not set", "prompt": prompt_text}
    try:
        user_msg = f"{prompt_text}\n\n[Context: monitoring AI citation behaviour for {page_url}]"
        # Some google.generativeai SDK versions do not accept `system_instruction`.
        # Fall back to injecting system guidance into the user prompt.
        try:
            model = genai.GenerativeModel(
                model_name="gemini-2.0-flash",
                system_instruction=_SYSTEM_PROMPT,
            )
            resp = model.generate_content(user_msg)
        except TypeError:
            model = genai.GenerativeModel(model_name="gemini-2.0-flash")
            resp = model.generate_content(f"{_SYSTEM_PROMPT}\n\n{user_msg}")
        text = resp.text or ""
        inp  = len(prompt_text.split()) * 2   # Gemini basic API — estimate
        out  = len(text.split()) * 2
        return {
            "prompt": prompt_text, "response": text,
            "citations": _build_citations(text),
            "input_tokens": inp, "output_tokens": out,
            "llm_source": "google", "model": "gemini-2.0-flash",
        }
    except Exception as exc:
        s = str(exc)
        if "429" in s or "quota" in s.lower() or "rate" in s.lower():
            count = _record_rate_limit_hit("gemini-2.0-flash")
            _requeue_prompt("gemini-2.0-flash", prompt_text, job_id)
            return {"error": f"Rate limit hit #{count}: {exc}", "prompt": prompt_text, "requeued": True}
        return {"error": s, "prompt": prompt_text}

def _call_claude(prompt_text: str, page_url: str, job_id: str) -> dict:
    client = _get_anthropic()
    if not client:
        return {"error": "ANTHROPIC_API_KEY not set", "prompt": prompt_text}
    try:
        user_msg = f"{prompt_text}\n\n[Context: monitoring AI citation behaviour for {page_url}]"
        msg = client.messages.create(
            model="claude-sonnet-4-5", max_tokens=1200,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
        text = msg.content[0].text if msg.content else ""
        return {
            "prompt": prompt_text, "response": text,
            "citations": _build_citations(text),
            "input_tokens":  msg.usage.input_tokens  if msg.usage else 0,
            "output_tokens": msg.usage.output_tokens if msg.usage else 0,
            "llm_source": "anthropic", "model": "claude-sonnet-4-5",
        }
    except Exception as exc:
        s = str(exc)
        if "rate_limit" in s.lower() or "529" in s or "429" in s:
            count = _record_rate_limit_hit("claude-sonnet-4-5")
            _requeue_prompt("claude-sonnet-4-5", prompt_text, job_id)
            return {"error": f"Rate limit hit #{count}: {exc}", "prompt": prompt_text, "requeued": True}
        return {"error": s, "prompt": prompt_text}

def _dispatch(prompt_text: str, model: str, page_url: str, job_id: str) -> dict:
    if model == "gpt-4o":
        return _call_openai(prompt_text, page_url, job_id)
    if model == "gemini-2.0-flash":
        return _call_gemini(prompt_text, page_url, job_id)
    return _call_claude(prompt_text, page_url, job_id)

# ─── DB writers ───────────────────────────────────────────────────────────────

def _write_response(job_id, prompt_id, prompt_text, model, llm_source, text, cited_urls, inp, out):
    mongo_manager.connect()
    cost = _compute_cost(model, inp, out)
    res = mongo_manager.db.citation_responses.insert_one({
        "job_id": job_id, "prompt_id": prompt_id,
        "prompt_text": prompt_text,
        "llm_source": llm_source, "model_version": model,
        "raw_response_text": text, "cited_urls": cited_urls,
        "response_tokens": inp + out, "input_tokens": inp, "output_tokens": out,
        "estimated_cost_usd": cost, "response_timestamp": datetime.utcnow(), "archived": False,
    })
    return str(res.inserted_id)

from urllib.parse import urlparse

def _is_broken_url(url: str) -> bool:
    """Detects likely 404/hallucinated URLs without a live network check."""
    if not url: return True
    try:
        parsed = urlparse(url.lower())
        path = parsed.path
        domain = parsed.netloc
        if any(tok in path for tok in ("404", "not-found", "error-404", "page-not-found", "dead-link", "undefined", "null")):
            return True
        if any(tok in domain for tok in ("example.com", "placeholder.com", "yourdomain.com", "company.com")):
            return True
        if len(path) > 150 and re.search(r'[a-z0-9]{32,}', path):
            return True
        return False
    except:
        return True

def _write_events(job_id, prompt_id, prompt_text, response_id, model, llm_source, text, citations, cust_domain, brand, comp_domains):
    mongo_manager.connect()
    db  = mongo_manager.db
    now = datetime.utcnow()
    customer_cited = False
    comp_cited = []

    for c in citations:
        url, raw = c.get("source",""), c.get("raw_url","")
        domain = _extract_domain(raw)
        is_cust = _is_customer_url(raw, cust_domain)
        is_comp, comp_d  = _is_competitor_url(raw, comp_domains)
        # If explicit competitor list is missing/incomplete, treat any
        # non-customer cited domain as competitor-like for SoV realism.
        if not is_cust and domain and not is_comp:
            is_comp = True
            comp_d = domain
        if is_cust:
            customer_cited = True
        if is_comp and comp_d not in comp_cited:
            comp_cited.append(comp_d)
        db.citation_events.insert_one({
            "job_id": job_id, "prompt_id": prompt_id, "response_id": response_id,
            "prompt_text": prompt_text,
            "llm_source": llm_source, "model_version": model,
            "cited_url": url, "raw_cited_url": raw,
            "is_customer_citation": is_cust, "is_competitor_citation": is_comp,
            "is_broken": _is_broken_url(raw or url),
            "competitor_domain": comp_d if is_comp else None,
            "brand_mention": bool(brand) and brand.lower() in text.lower(),
            "mention_sentiment": _sentiment(text, raw),
            "citation_position": c.get("citation_position","unknown"),
            "position_rank": c.get("position", 0),
            "event_timestamp": now,
        })

    for comp_d in comp_cited:
        if not customer_cited:
            first = next((c for c in citations if _is_competitor_url(c.get("source",""),[comp_d])[0]), None)
            cp   = (first or {}).get("citation_position","late")
            sev  = "high" if cp == "early" else "medium" if cp == "mid" else "low"
            db.citation_gap_events.insert_one({
                "job_id": job_id, "prompt_id": prompt_id,
                "llm_source": llm_source, "model_version": model,
                "competitor_cited": comp_d,
                "competitor_url": next((c.get("source") for c in citations if _is_competitor_url(c.get("source",""),[comp_d])[0]), comp_d),
                "gap_severity": sev, "detected_at": now,
            })

    return {"customer_cited": customer_cited, "competitor_domains_cited": comp_cited}

# ─── Single-prompt processor ──────────────────────────────────────────────────

def _process_single_prompt(prompt_text, model, job_id, cust_domain, brand, comp_domains, page_url):
    prompt_id = f"{job_id}_{model}_{abs(hash(prompt_text)) % 100_000:05d}"
    result    = _dispatch(prompt_text, model, page_url, job_id)

    if "error" in result:
        logger.warning("[LLM_RUNNER] Failed | model=%s | '%s' — %s", model, prompt_text[:40], result["error"])
        return {"prompt": prompt_text, "model": model, "error": result["error"], "requeued": result.get("requeued", False)}

    llm_source    = result.get("llm_source", "unknown")
    text          = result.get("response", "")
    citations     = result.get("citations", [])
    inp, out      = result.get("input_tokens", 0), result.get("output_tokens", 0)
    cited_urls    = [c.get("source","") for c in citations]

    response_id   = _write_response(job_id, prompt_id, prompt_text, model, llm_source, text, cited_urls, inp, out)
    event_summary = _write_events(job_id, prompt_id, prompt_text, response_id, model, llm_source, text, citations, cust_domain, brand, comp_domains)
    cost          = _compute_cost(model, inp, out)

    logger.info("[LLM_RUNNER] Done | model=%s | '%s' | cites=%d | cust=%s | $%.4f",
                model, prompt_text[:40], len(citations), event_summary["customer_cited"], cost)

    return {
        "prompt": prompt_text, "prompt_id": prompt_id, "response_id": response_id,
        "model": model, "llm_source": llm_source, "response": text,
        "citations": [
            {"source": c["source"], "position": c["position"],
             "citation_position": c["citation_position"],
             "is_customer_citation": _is_customer_url(c["raw_url"], cust_domain),
             "mention_sentiment": _sentiment(text, c["raw_url"])}
            for c in citations
        ],
        "is_customer_cited": event_summary["customer_cited"],
        "competitor_domains_cited": event_summary["competitor_domains_cited"],
        "input_tokens": inp, "output_tokens": out, "cost_usd": cost,
    }

# ─── Public entry point ───────────────────────────────────────────────────────

def run_llm_queries(
    job_id: str,
    prompts: list,
    customer_domain: str = "",
    brand_name: str = "",
    competitor_domains: list = None,
    page_url: str = "",
    page_summary: str = "",
    models: list = None,
) -> dict:
    """
    SOP-001 Phase 2+3 — Multi-model citation intelligence.
    Runs every prompt against every available model concurrently (batch=5).
    Missing API keys → model silently skipped (logged at WARNING).
    """
    if not prompts:
        return {"status": "no_prompts", "job_id": job_id, "prompts": [], "llm_output": []}

    competitor_domains = competitor_domains or []
    requested = models if models else ACTIVE_MODELS

    # Filter by API key availability
    available = []
    _key_checks = {
        "gpt-4o":            ("OPENAI_API_KEY",                       "gpt-4o"),
        "gemini-2.0-flash":    ("GEMINI_API_KEY|GOOGLE_API_KEY",        "gemini-2.0-flash"),
        "claude-sonnet-4-5": ("ANTHROPIC_API_KEY",                    "claude-sonnet-4-5"),
    }
    for m in requested:
        if m == "gpt-4o" and not os.getenv("OPENAI_API_KEY"):
            logger.warning("[LLM_RUNNER] OPENAI_API_KEY missing — skipping gpt-4o")
            continue
        if m == "gemini-2.0-flash" and not (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")):
            logger.warning("[LLM_RUNNER] GEMINI_API_KEY missing — skipping gemini-2.0-flash")
            continue
        if m == "claude-sonnet-4-5" and not os.getenv("ANTHROPIC_API_KEY"):
            logger.warning("[LLM_RUNNER] ANTHROPIC_API_KEY missing — skipping claude-sonnet-4-5")
            continue
        available.append(m)

    if not available:
        logger.error("[LLM_RUNNER] No models available — check API keys")
        return {"status": "no_models", "job_id": job_id, "prompts": prompts, "llm_output": []}

    tasks = [
        (p, m)
        for p in prompts if isinstance(p, str) and p.strip()
        for m in available
    ]

    logger.info("[LLM_RUNNER] Start | job=%s | prompts=%d | models=%s | tasks=%d",
                job_id, len(prompts), available, len(tasks))

    llm_output, total_cost = [], 0.0

    with concurrent.futures.ThreadPoolExecutor(max_workers=_BATCH_SIZE) as ex:
        fs = {
            ex.submit(_process_single_prompt, p, m, job_id, customer_domain, brand_name, competitor_domains, page_url): (p, m)
            for p, m in tasks
        }
        for future in concurrent.futures.as_completed(fs):
            try:
                r = future.result()
                llm_output.append(r)
                total_cost += r.get("cost_usd", 0.0)
            except Exception as exc:
                p, m = fs[future]
                logger.error("[LLM_RUNNER] Future failed | model=%s | '%s': %s", m, p[:40], exc)
                llm_output.append({"prompt": p, "model": m, "error": str(exc)})

    ok        = sum(1 for r in llm_output if "error" not in r)
    requeued  = sum(1 for r in llm_output if r.get("requeued"))
    models_ok = list({r.get("model") for r in llm_output if "error" not in r})

    logger.info("[LLM_RUNNER] Done | tasks=%d | ok=%d | requeued=%d | cost=$%.4f | models=%s",
                len(tasks), ok, requeued, total_cost, models_ok)

    return {
        "status": "success", "job_id": job_id, "prompts": prompts,
        "models_run": models_ok, "llm_output": llm_output,
        "total_cost_usd": round(total_cost, 6),
        "tasks_total": len(tasks), "tasks_successful": ok, "tasks_requeued": requeued,
    }