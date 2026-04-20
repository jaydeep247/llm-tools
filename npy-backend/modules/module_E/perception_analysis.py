import re
import json
import os
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from modules.module_D.llm_runner import run_llm_queries
from utils.mongo import mongo_manager

logger = logging.getLogger("module_e_perception")

DEFAULT_PROPERTIES = [
    "Functionality",
    "Integration",
    "Pricing",
    "User Experience",
    "Data Security",
    "Customer Support",
    "Customization",
    "Effectiveness",
]

PROPERTY_PROMPTS = {
    "Functionality": "What does {brand} do to help improve email response times? ({domain})",
    "Integration": "Can {brand} integrate with the email platforms my team already uses? ({domain})",
    "Pricing": "How much does {brand} cost and are there different pricing plans? ({domain})",
    "User Experience": "Is {brand} easy for my team to use without extensive training? ({domain})",
    "Data Security": "How does {brand} protect the privacy and security of our email data? ({domain})",
    "Customer Support": "What kind of customer support does {brand} offer if we run into issues? ({domain})",
    "Customization": "Can {brand} be customized to fit the specific needs of my business? ({domain})",
    "Effectiveness": "Are there any case studies or reviews showing how {brand} improves reply rates? ({domain})",
}

MODEL_ALIASES = {
    "chatgpt": "gpt-4o",
    "gpt-4o": "gpt-4o",
    "gemini": "gemini-2.0-flash",
    "gemini-2.0-flash": "gemini-2.0-flash",
    "claude": "claude-sonnet-4-5",
    "claude-sonnet-4-5": "claude-sonnet-4-5",
}

MODEL_LABELS = {
    "gpt-4o": "ChatGPT",
    "gemini-2.0-flash": "Gemini",
    "claude-sonnet-4-5": "Claude",
}
MAX_HISTORY_POINTS = 12

_POSITIVE_TERMS = ("great", "excellent", "best", "strong", "trusted", "secure", "recommended")
_NEGATIVE_TERMS = ("bad", "poor", "weak", "outdated", "unreliable", "expensive", "limited")
_SPECIFICITY_TERMS = ("feature", "integration", "sla", "api", "metric", "case study", "review")
_openai_client = None


def _safe_domain(url_or_domain: str) -> str:
    v = (url_or_domain or "").strip()
    if not v:
        return ""
    if "://" not in v:
        v = f"https://{v}"
    try:
        return urlparse(v).hostname.lower().lstrip("www.")
    except Exception:
        return (url_or_domain or "").strip().lower().lstrip("www.")


def _build_prompt(property_name: str, brand_name: str, root_domain: str) -> str:
    template = PROPERTY_PROMPTS.get(property_name, "How does {brand} perform on {property}? ({domain})")
    return (
        template.replace("{brand}", brand_name)
        .replace("{domain}", root_domain)
        .replace("{property}", property_name.lower())
    )


def _get_openai_client():
    global _openai_client
    if _openai_client is not None:
        return _openai_client
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return None
    try:
        import openai
        _openai_client = openai.OpenAI(api_key=key)
    except Exception as exc:
        logger.warning("Could not initialize OpenAI client for dynamic prompts: %s", exc)
        return None
    return _openai_client


def _safe_parse_json_object(raw: str) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                parsed = json.loads(raw[start : end + 1])
                return parsed if isinstance(parsed, dict) else {}
            except Exception:
                return {}
        return {}


def _get_brand_context(brand_name: str, root_domain: str) -> str:
    client = _get_openai_client()
    if not client:
        return ""
    discovery_prompt = (
        f"In 2-3 sentences, describe what {brand_name} ({root_domain}) does, "
        "who their customers are, and what problem they solve."
    )
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[{"role": "user", "content": discovery_prompt}],
        )
        context = (response.choices[0].message.content or "").strip()
        return context
    except Exception as exc:
        logger.warning("Brand context discovery failed; using fallback prompts: %s", exc)
        return ""


def _generate_property_prompts(
    *,
    brand_name: str,
    root_domain: str,
    selected_properties: List[str],
    brand_context: str,
) -> Dict[str, str]:
    if not brand_context.strip():
        return {prop: _build_prompt(prop, brand_name, root_domain) for prop in selected_properties}

    client = _get_openai_client()
    if not client:
        return {prop: _build_prompt(prop, brand_name, root_domain) for prop in selected_properties}

    properties_text = ", ".join(selected_properties)
    system_prompt = (
        "You are building an AI brand perception tool. "
        "Given a brand description, generate ONE search-style question per property. "
        "Questions must be specific to what this brand actually does. "
        "Return only valid JSON with property names as keys."
    )
    user_prompt = f"""
Brand: {brand_name}
Domain: {root_domain}
Description: {brand_context}

Generate one buyer-style question for each property:
{properties_text}

Rules:
- Keep each prompt specific and practical.
- Include the brand name and ({root_domain}) in each question.
- Return ONLY JSON. No markdown.
"""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        generated = _safe_parse_json_object(response.choices[0].message.content or "")
    except Exception as exc:
        logger.warning("Dynamic prompt generation failed; using fallback prompts: %s", exc)
        generated = {}

    prompts: Dict[str, str] = {}
    for prop in selected_properties:
        candidate = generated.get(prop)
        if isinstance(candidate, str) and candidate.strip():
            prompt_text = candidate.strip()
            if root_domain and f"({root_domain})" not in prompt_text:
                prompt_text = f"{prompt_text} ({root_domain})"
            prompts[prop] = prompt_text
        else:
            prompts[prop] = _build_prompt(prop, brand_name, root_domain)
    return prompts


def _score_depth(text: str) -> float:
    tokens = len((text or "").split())
    if tokens >= 220:
        return 95.0
    if tokens >= 140:
        return 82.0
    if tokens >= 80:
        return 68.0
    if tokens >= 40:
        return 52.0
    return 28.0


def _score_accuracy(text: str, brand_name: str, property_name: str) -> float:
    t = (text or "").lower()
    brand = (brand_name or "").lower()
    p = (property_name or "").lower()
    score = 40.0
    if brand and brand in t:
        score += 25.0
    if p and p.split()[0] in t:
        score += 20.0
    if "http" in t:
        score += 10.0
    if any(k in t for k in ("because", "for example", "such as")):
        score += 5.0
    return min(100.0, score)


def _score_positivity(text: str) -> float:
    t = (text or "").lower()
    pos = sum(1 for k in _POSITIVE_TERMS if k in t)
    neg = sum(1 for k in _NEGATIVE_TERMS if k in t)
    raw = 60 + (pos * 10) - (neg * 12)
    return float(max(0, min(100, raw)))


def _score_specificity(text: str) -> float:
    t = (text or "").lower()
    has_num = bool(re.search(r"\b\d+(\.\d+)?%?\b", t))
    terms = sum(1 for k in _SPECIFICITY_TERMS if k in t)
    links = len(re.findall(r"https?://", t))
    raw = 35 + (terms * 12) + (8 if has_num else 0) + min(20, links * 5)
    return float(max(0, min(100, raw)))


def _map_rating(score: float) -> str:
    if score < 40:
        return "Unavailable"
    if score < 65:
        return "Good"
    if score < 85:
        return "Great"
    return "Exceptional"


def _normalize_model_selection(models: Optional[List[str]]) -> List[str]:
    if not models:
        return ["gpt-4o", "gemini-2.0-flash", "claude-sonnet-4-5"]
    out: List[str] = []
    for m in models:
        mapped = MODEL_ALIASES.get((m or "").strip().lower())
        if mapped and mapped not in out:
            out.append(mapped)
    return out or ["gpt-4o", "gemini-2.0-flash", "claude-sonnet-4-5"]


def run_perception_analysis(
    *,
    job_id: str,
    brand_name: str,
    domain: str,
    properties: Optional[List[str]] = None,
    models: Optional[List[str]] = None,
    market: str = "US",
    language: str = "English",
) -> Dict[str, Any]:
    if not job_id:
        return {"success": False, "error": "job_id is required"}

    mongo_manager.connect()
    selected_properties = [p.strip() for p in (properties or DEFAULT_PROPERTIES) if (p or "").strip()]
    selected_models = _normalize_model_selection(models)
    root_domain = _safe_domain(domain)
    brand_context = _get_brand_context(brand_name=brand_name, root_domain=root_domain or domain)
    property_prompts = _generate_property_prompts(
        brand_name=brand_name,
        root_domain=root_domain or domain,
        selected_properties=selected_properties,
        brand_context=brand_context,
    )

    prompt_rows: List[Dict[str, str]] = []
    prompts: List[str] = []
    for p in selected_properties:
        prompt = property_prompts.get(p) or _build_prompt(p, brand_name, root_domain or domain)
        prompts.append(prompt)
        prompt_rows.append({"property": p, "prompt": prompt})

    previous_doc = mongo_manager.db.module_e_perception.find_one(
        {"job_id": job_id},
        {"_id": 0, "history": 1, "created_at": 1},
    ) or {}

    llm_result = run_llm_queries(
        job_id=job_id,
        prompts=prompts,
        customer_domain=root_domain,
        brand_name=brand_name,
        competitor_domains=[],
        page_url=f"https://{root_domain}" if root_domain else domain,
        models=selected_models,
    )

    raw_output = llm_result.get("llm_output", [])
    prompt_to_property = {row["prompt"]: row["property"] for row in prompt_rows}
    cells: List[Dict[str, Any]] = []

    for item in raw_output:
        if item.get("error"):
            continue
        prompt = str(item.get("prompt") or "")
        property_name = prompt_to_property.get(prompt, "Other")
        model_version = str(item.get("model") or "")
        response_text = str(item.get("response") or "")

        depth = _score_depth(response_text)
        accuracy = _score_accuracy(response_text, brand_name, property_name)
        positivity = _score_positivity(response_text)
        specificity = _score_specificity(response_text)
        score = round((depth * 0.30) + (accuracy * 0.30) + (positivity * 0.20) + (specificity * 0.20), 2)
        rating = _map_rating(score)

        cells.append(
            {
                "property": property_name,
                "model": MODEL_LABELS.get(model_version, model_version),
                "model_version": model_version,
                "prompt": prompt,
                "depth_score": round(depth, 2),
                "accuracy_score": round(accuracy, 2),
                "positivity_score": round(positivity, 2),
                "specificity_score": round(specificity, 2),
                "rating_score": score,
                "rating": rating,
                "raw_response_text": response_text,
                "response_id": item.get("response_id"),
                "citations": item.get("citations", []),
                "queried_at": datetime.utcnow(),
            }
        )

    run_timestamp = datetime.utcnow()
    current_snapshot = {
        "run_at": run_timestamp,
        "scores": [
            {
                "property": cell["property"],
                "model_version": cell["model_version"],
                "model": cell["model"],
                "rating_score": cell["rating_score"],
                "rating": cell["rating"],
            }
            for cell in cells
        ],
    }
    history = list(previous_doc.get("history") or [])
    history.append(current_snapshot)
    history = history[-MAX_HISTORY_POINTS:]

    run_doc = {
        "job_id": job_id,
        "brand_name": brand_name,
        "domain": root_domain,
        "market": market,
        "language": language,
        "properties": selected_properties,
        "brand_context": brand_context,
        "property_prompts": property_prompts,
        "models": selected_models,
        "cells": cells,
        "history": history,
        "created_at": previous_doc.get("created_at", run_timestamp),
        "updated_at": run_timestamp,
    }
    mongo_manager.db.module_e_perception.update_one({"job_id": job_id}, {"$set": run_doc}, upsert=True)

    return {
        "success": True,
        "job_id": job_id,
        "brand_name": brand_name,
        "domain": root_domain,
        "properties_count": len(selected_properties),
        "models_count": len(selected_models),
        "cells_count": len(cells),
        "data": run_doc,
    }


def get_perception_analysis(job_id: str) -> Dict[str, Any]:
    if not job_id:
        return {"success": False, "error": "job_id is required"}
    mongo_manager.connect()
    doc = mongo_manager.db.module_e_perception.find_one({"job_id": job_id}, {"_id": 0})
    if not doc:
        return {"success": False, "error": "Perception analysis not found for this job_id"}
    return {"success": True, "job_id": job_id, "data": doc}
