---
title: "Crawl-Independent Executive Dashboard"
description: "Mapping of dashboard-ready fields to modules, DataForSEO/AI APIs, and file locations"
---

# Crawl-Independent Executive Dashboard

This document defines the executive-level fields we can surface on the dashboard **immediately when a user starts a session or clicks “Start Crawl”**, without depending on any crawl data (no HTML, no `aggregated_text`, no on-page scans).

It combines:
- **Existing crawl-independent fields** already implemented in the codebase, and
- **New, cost-effective DataForSEO-powered fields** that are not yet implemented but are recommended.

For each field, we list:
- **Card Name** – how it should appear on the dashboard
- **Module** – logical module in the backend
- **Source** – function and file
- **External API** – DataForSEO or AI endpoint/provider
- **Key Payload/Fields** – what we read/write
- **Why It’s Valuable** – executive-level rationale

---

## 1. Existing Crawl-Independent Fields (Already Implemented)

These fields already exist in the backend and use only brand name, domain, and external APIs (DataForSEO or LLMs). They do **not** depend on crawl HTML or `aggregated_text`.

### 1.1 Brand Mentions & Sentiment Overview

- **Card Name**  
  **Brand Mentions & Sentiment (Last 12 Months)**

- **Module**  
  Module E – Brand Analysis

- **Backend API (Node)**  
  - Fetch combined Module E data: `GET /module-e/jobs/:jobId`  
  - Trigger brand-only analysis: `POST /module-e/jobs/:jobId/run-brand`  
    - Controller: `ModuleEController.runBrandAnalysis`  
    - File: `nnode-backend/src/modules/module_E/moduleE.controller.ts`

- **Source**  
  - Function: `BrandAnalyzer.analyze_brand`  
  - File: [brand_analyzer.py](file:///d:/contentlytics/llm-tools/npy-backend/modules/module_E/brand_analyzer.py)

- **External API**  
  - **Provider:** DataForSEO  
  - **Endpoint:** `/v3/content_analysis/phrase_trends/live`  
  - **Call Pattern:**  
    - `keyword = brand_name`  
    - `date_from` ≈ 12 months ago  
    - `date_group = "month"`

- **Key Backend Fields** (stored under `brand_analysis`)  
  - `brand_analysis.brand_name`  
  - `brand_analysis.total_mentions`  
  - `brand_analysis.sentiment.label`  
  - `brand_analysis.sentiment.counts`  
  - `brand_analysis.frequency_trend[]` (monthly counts)  
  - `brand_analysis.top_sources[]` (top domains)

- **Dashboard Usage**  
  Show a single card summarising:
  - Total brand mentions over last 12 months  
  - Sentiment label (“Mostly Positive / Mostly Negative / Positive Leaning / Negative Leaning / No Data”)  
  - Simple sparkline of monthly mentions  
  - Top 3–5 domains mentioning the brand

- **Why It’s Valuable (Executive View)**  
  - Immediate picture of **brand awareness and sentiment** across the web.  
  - No crawl needed; relies entirely on DataForSEO’s content index.  
  - Good “anchor card” for the brand section of the dashboard.

---

### 1.2 AI Brand Sentiment Score

- **Card Name**  
  **AI Brand Sentiment Score (0–100)**

- **Module**  
  Module E – Sentiment & Visibility

- **Backend API (Node)**  
  - Fetch combined Module E data (including `sentiment_tracking`): `GET /module-e/jobs/:jobId`  
  - Trigger sentiment analysis job: `POST /module-e/jobs/:jobId/run-sentiment`  
    - Controller: `ModuleEController.runSentimentAnalysis`  
    - File: `nnode-backend/src/modules/module_E/moduleE.controller.ts`

- **Source**  
  - Function: `SentimentVisibilityTracker.analyze_sentiment_and_visibility`  
  - File: [sentiment_tracker.py](file:///d:/contentlytics/llm-tools/npy-backend/modules/module_E/sentiment_tracker.py)

- **External API**  
  - **Provider:** Orchestrated LLMs via `execute_task`  
  - **Models:** `openai`, `gemini`, `claude`  
  - **Behavior:**  
    - 5 probe questions explicitly mentioning the brand (batched per model).  
    - Industry/service type auto-inferred by an additional OpenAI call.

- **Key Backend Fields** (stored under `sentiment_tracking.sentiment`)  
  - `sentiment_tracking.brand_name`  
  - `sentiment_tracking.industry`  
  - `sentiment_tracking.service_type`  
  - `sentiment_tracking.sentiment.overall_score` (0–100)  
  - `sentiment_tracking.sentiment.distribution` (Positive / Neutral / Negative per model)

- **Dashboard Usage**  
  Single KPI card with:
  - Main number: `overall_score` 0–100  
  - Subtext: “AI-perceived brand sentiment (aggregated across OpenAI, Gemini, Claude)”  
  - Optional mini distribution bar for positive / neutral / negative.

- **Why It’s Valuable (Executive View)**  
  - Shows **how AI systems “feel” about the brand**.  
  - Useful as a strategic perception indicator, independent of organic search or crawl.  
  - Easy to trend over time across sessions.

---

### 1.3 AI Brand Visibility Score & Appearance Rate

- **Card Name**  
  **AI Visibility Score & Appearance Rate**

- **Module**  
  Module E – Sentiment & Visibility

- **Backend API (Node)**  
  - Fetch combined Module E data (including visibility metrics): `GET /module-e/jobs/:jobId`  
  - Trigger visibility + sentiment job (same as above): `POST /module-e/jobs/:jobId/run-sentiment`

- **Source**  
  - Function: `SentimentVisibilityTracker.analyze_sentiment_and_visibility`  
  - File: [sentiment_tracker.py](file:///d:/contentlytics/llm-tools/npy-backend/modules/module_E/sentiment_tracker.py)

- **External API**  
  - **Provider:** `openai`, `gemini`, `claude`  
  - **Behavior:**  
    - 6 generic industry discovery questions where the brand name is *not* in the prompt.  
    - We scan answers for the brand being mentioned.

- **Key Backend Fields** (stored under `sentiment_tracking.visibility`)  
  - `sentiment_tracking.visibility.overall_visibility_score` (0–100 %)  
  - `sentiment_tracking.visibility.overall_appearance_rate` (0–1 float)  
  - `sentiment_tracking.visibility.by_model[]` (per-model visibility stats)

- **Dashboard Usage**  
  Card showing:
  - Main metric: `overall_visibility_score` in %  
  - Secondary metric: `overall_appearance_rate` as “X% of AI answers mention your brand”  
  - Optional tooltip or breakdown by model.

- **Why It’s Valuable (Executive View)**  
  - Measures **organic AI recommendation presence**: how often LLMs bring up the brand when asked about the space.  
  - Gives a clear, non-SEO but highly strategic KPI for AI-era discoverability.  

---

### 1.4 Competitor Mention Share of Voice (SOV)

- **Card Name**  
  **Brand vs Competitors – Mention Share of Voice**

- **Module**  
  Module E – Competitor Analysis

- **Backend API (Node)**  
  - Fetch combined Module E data (including `competitor_mentions`): `GET /module-e/jobs/:jobId`  
  - Trigger competitor analysis job: `POST /module-e/jobs/:jobId/run-competitors`  
    - Controller: `ModuleEController.runCompetitorAnalysis`  
    - File: `nnode-backend/src/modules/module_E/moduleE.controller.ts`

- **Source**  
  - Public entry: `CompetitorAnalyzer.analyze`  
  - Internal function: `CompetitorAnalyzer._analyze_mentions`  
  - File: [competitor_analyzer.py](file:///d:/contentlytics/llm-tools/npy-backend/modules/module_E/competitor_analyzer.py)

- **External API**  
  - **Provider:** DataForSEO  
  - **Endpoints:**  
    - `/v3/dataforseo_labs/google/competitors_domain/live` – discover competitors by shared keyword rankings.  
    - `/v3/content_analysis/phrase_trends/live` – track monthly mentions for brand + competitor domains.

- **Key Backend Fields** (stored under `mentions`)  
  - `mentions.overall_sov` – brand share of voice (%) across all domains  
  - `mentions.data[]` – per-domain:  
    - `name` (domain)  
    - `mentions` (total)  
    - `sentiment` (Positive / Negative / Neutral)  
    - `trend[]` (mention counts over time)  
  - `mentions.raw_dataforseo` – raw JSON for debugging/advanced analysis

- **Dashboard Usage**  
  Card + small table:
  - KPI: brand `overall_sov` vs competitors  
  - Table: each domain’s mentions and sentiment  
  - Optional trend sparkline per domain.

- **Why It’s Valuable (Executive View)**  
  - Immediate **competitive visibility benchmark**: where brand stands vs organic competitors in web mentions.  
  - Uses DataForSEO both for competitor discovery and for content mentions, independent of our crawl.

---

### 1.5 AI Share of Voice vs Competitors

- **Card Name**  
  **AI Share of Voice vs Competitors**

- **Module**  
  Module E – Competitor Analysis (AI SOV)

- **Backend API (Node)**  
  - Fetch combined Module E data (including `ai_sov`): `GET /module-e/jobs/:jobId`  
  - Trigger AI SOV-only job: `POST /module-e/jobs/:jobId/run-ai-sov`  
    - Controller: `ModuleEController.runAiSovAnalysis`  
    - File: `nnode-backend/src/modules/module_E/moduleE.controller.ts`

- **Source**  
  - Public entry: `CompetitorAnalyzer.analyze`  
  - Internal function: `CompetitorAnalyzer._analyze_ai_sov`  
  - File: [competitor_analyzer.py](file:///d:/contentlytics/llm-tools/npy-backend/modules/module_E/competitor_analyzer.py)

- **External API**  
  - **Provider:** `openai`, `gemini`, `claude`  
  - **Behavior:**  
    - Asks generic industry questions where the brand is not named.  
    - Counts mentions of brand vs competitor domains in AI responses.  

- **Key Backend Fields** (stored under `ai_sov`)  
  - `ai_sov.overall_sov` – average SOV across AI models (%)  
  - `ai_sov.brand_terms_checked[]` – brand/domain variants used in matching  
  - `ai_sov.by_model[model].sov` and counts

- **Dashboard Usage**  
  Card combining:
  - KPI: `overall_sov`  
  - Subtext: “Share of AI mentions vs competitors (OpenAI, Gemini, Claude)”  
  - Optional small bar chart: SOV per model.

- **Why It’s Valuable (Executive View)**  
  - Directly answers: **“When AI is asked about this market, how often are we named vs our competitors?”**  
  - Highly differentiating metric that doesn’t rely on organic keywords or crawl.

---

### 1.6 Backlink Authority Score & Top Referring Domains

- **Card Name**  
  **Backlink Authority Score & Top Referring Domains**

- **Module**  
  Module C – Competitor Backlink Landscape

- **Backend API (Node)**  
  - Fetch Module C backlink result for a job: `GET /module-c/jobs/:jobId`  
  - Trigger Module C backlink analysis job: `POST /module-c/jobs/:jobId/run`  
    - Controller: `ModuleCController.runModuleCAnalysis`  
    - File: `nnode-backend/src/modules/module_C/moduleC.controller.ts`

- **Source**  
  - Class: `CompetitorAnalysisModule`  
  - Function: `CompetitorAnalysisModule.analyze_competitors`  
  - File: [competitor_analysis.py](file:///d:/contentlytics/llm-tools/npy-backend/modules/module_C/competitor_analysis.py)

- **External API**  
  - **Provider:** DataForSEO  
  - **Endpoint:** `/v3/backlinks/referring_domains/live`

- **Key Backend Fields**  
  - `competitor_backlinks.score` – simple 0–100 score based on number of referring domains  
  - `competitor_backlinks.referring_domains_count` – total referring domains  
  - `competitor_backlinks.top_referring_domains[]` – top domains

- **Dashboard Usage**  
  Card showing:
  - KPI: Backlink authority score (0–100)  
  - Secondary: number of referring domains  
  - List of top 3–5 referring domains.

- **Why It’s Valuable (Executive View)**  
  - Quick, **off-page authority** snapshot that is independent of our own crawl.  
  - Easy to interpret as “How strong is our backlink profile at a glance?”

---

## 2. New DataForSEO-Powered Fields (Recommended, Not Yet Implemented)

These are **proposed** dashboard fields based on DataForSEO APIs that we are **not yet calling** in the codebase. They are cost-effective because they provide high-level summaries in a single request, and are fully crawl-independent.

### 2.1 Brand Citation Summary (Content Analysis – Summary)

- **Card Name**  
  **Brand Citation Summary (Web Coverage Snapshot)**

- **Planned Module**  
  Module E – Brand Analysis (extended)

- **Backend API (Node, proposed integration)**  
  - Trigger: reuse existing `POST /module-e/jobs/:jobId/run-brand`  
    - Extend Python `BrandAnalyzer` to also call `/v3/content_analysis/summary/live`  
    - Persist additional summary data under `brand_analysis.summary` in `module_e` collection.  
  - Fetch: existing `GET /module-e/jobs/:jobId` (Frontend reads `brand_analysis.summary` section when present).

- **Suggested Backend Entry Point**  
  - New function, e.g. `BrandAnalyzer.summarize_brand`  
  - File target: [brand_analyzer.py](file:///d:/contentlytics/llm-tools/npy-backend/modules/module_E/brand_analyzer.py)

- **External API**  
  - **Provider:** DataForSEO  
  - **Endpoint:** `/v3/content_analysis/summary/live`

- **Recommended Payload Shape**  
  - `keyword = brand_name`  
  - `page_type = ["ecommerce","news","blogs","message-boards","organization"]`  
  - `internal_list_limit` ≈ 5–10  
  - `positive_connotation_threshold` ≈ 0.5 (optional)

- **Key Response Fields to Surface**  
  - `total_count` – total citations for the brand  
  - `connotation_types` – positive / negative / neutral counts  
  - `sentiment_connotations` – emotions (anger, happiness, love, sadness, share, fun)  
  - `top_domains[]` – domains with most citations  
  - `page_types` – distribution across ecommerce/news/blogs/etc.  
  - `countries` – country-level distribution  
  - `languages` – language distribution

- **Dashboard Usage**  
  Multi-metric card (or small section) showing:
  - Total citation count  
  - Sentiment polarity split  
  - Top 3 page types, countries, and languages  
  - Emotions radar or simple list (e.g. “Mostly happiness + fun, low anger”).

- **Why It’s Valuable (Executive View)**  
  - Compresses a lot of brand intelligence into a single call: *where* and *how* the brand is mentioned across the web.  
  - Ideal “web coverage snapshot” without needing deep crawl or SERP scraping.

---

### 2.2 Backlink Health & Risk Summary

- **Card Name**  
  **Backlink Health & Risk Summary**

- **Planned Module**  
  Module C – Competitor Backlink Landscape (extended)

- **Backend API (Node, proposed integration)**  
  - Trigger: reuse existing `POST /module-c/jobs/:jobId/run`  
    - Extend Module C Python runner to call `/v3/backlinks/summary/live`  
    - Persist a new `backlink_summary` block alongside existing `competitor_backlinks`.  
  - Fetch: existing `GET /module-c/jobs/:jobId` (Frontend reads `backlink_summary` section when present).

- **Suggested Backend Entry Point**  
  - New function, e.g. `CompetitorAnalysisModule.summary_for_domain`  
  - File target: [competitor_analysis.py](file:///d:/contentlytics/llm-tools/npy-backend/modules/module_C/competitor_analysis.py)

- **External API**  
  - **Provider:** DataForSEO  
  - **Endpoint:** `/v3/backlinks/summary/live`

- **Key Response Fields to Surface**  
  - `rank` – target rank  
  - `backlinks` – total backlinks  
  - `referring_domains`, `referring_pages`  
  - `backlinks_spam_score`, `target_spam_score`  
  - `broken_backlinks`, `broken_pages`  
  - `referring_links_types` and `referring_links_attributes` (e.g. nofollow, sponsored)  
  - `referring_links_platform_types` (cms, blogs, ecommerce, news, etc.)  

- **Dashboard Usage**  
  Card that explains:
  - High-level backlink strength (rank + counts)  
  - Risk indicators (spam scores, broken links/pages)  
  - Mix of referring platforms and attributes (“how natural vs sponsored/nofollow-heavy is our profile?”).

- **Why It’s Valuable (Executive View)**  
  - Turns raw backlink data into **risk and opportunity signals** that leadership understands.  
  - Single API call replacing large, noisy backlink tables with simple health/risk KPIs.

---

### 2.3 Branded Search Demand (Keywords Data – Search Volume)

- **Card Name**  
  **Branded Search Demand (Google)**

- **Planned Module**  
  Module E – Brand Demand (new logical sub-module)

- **Backend API (Node, proposed integration)**  
  - Option A (attach to brand job):  
    - Trigger: reuse `POST /module-e/jobs/:jobId/run-brand` and extend Module E Python side to also call `/v3/keywords_data/google/search_volume/live`, storing results under `brand_demand`.  
  - Option B (dedicated job type and route):  
    - Add a new route, e.g. `POST /module-e/jobs/:jobId/run-demand` that creates a `MODULE_E_BRAND_DEMAND` job and calls a new `BrandDemandAnalyzer` in Module E.  
  - Fetch (both options): existing `GET /module-e/jobs/:jobId` (Frontend reads `brand_demand` block when populated).

- **Suggested Backend Entry Point**  
  - New module/class, e.g. `BrandDemandAnalyzer`  
  - File target: new file under `npy-backend/modules/module_E` (e.g. `brand_demand_analyzer.py`)

- **External API**  
  - **Provider:** DataForSEO  
  - **Endpoint:** `/v3/keywords_data/google/search_volume/live`

- **Recommended Payload Shape**  
  - `location_name = "United States"` (or job-configurable)  
  - `language_name = "English"` (or job-configurable)  
  - `keywords = [`  
    - `brand_name`,  
    - `"brand_name reviews"`,  
    - `"brand_name pricing"`  
    - (optionally 1–2 additional branded patterns)  
    `]`

- **Key Response Fields to Surface**  
  - Average monthly search volume per keyword  
  - CPC / competition if available and useful for context

- **Dashboard Usage**  
  Card with:
  - Total branded search volume (sum of all branded queries).  
  - Breakdown of **intent mix**: brand vs reviews vs pricing.  
  - Simple bar chart: search volume per branded keyword.

- **Why It’s Valuable (Executive View)**  
  - Shows how much **demand exists for the brand itself** in Google Search.  
  - The intent mix (brand vs reviews vs pricing) helps understand customer journey stage and perception.

---

## 3. Implementation Notes

- All fields in **Section 1** already have backend implementations and can be wired to the dashboard immediately after wiring the API responses to the frontend.  
- Fields in **Section 2** require new backend methods but are **single-call, cost-effective** additions that extend existing modules (Module E and Module C) using DataForSEO.  
- None of these fields require HTML crawl data; they only use:
  - Brand name and/or domain  
  - External APIs (DataForSEO, OpenAI/Gemini/Claude)  
  - Existing MongoDB historical records where applicable.
