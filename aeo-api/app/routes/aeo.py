from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import requests
import logging
from ..services.aeo_services_consolidated import AEOServiceOrchestrator
from ..services.schema_generator import SchemaGenerator

router = APIRouter(prefix="/api/aeo", tags=["AEOCHECKER"])

class AnalyzeRequest(BaseModel):
    url: str
    competitor_urls: Optional[List[str]] = []

class AnalyzeResponse(BaseModel):
    success: bool
    results: dict
    error: Optional[str] = None

class StructuredDataRequest(BaseModel):
    url: str
    html_content: Optional[str] = None

class SchemaGenerateRequest(BaseModel):
    url: str
    html_content: Optional[str] = None
    schema_type: Optional[str] = 'auto'  # auto, Organization, LocalBusiness, Article, etc.

# Initialize service orchestrator
aeo_orchestrator = AEOServiceOrchestrator()
schema_generator = SchemaGenerator()

# Suppress InsecureRequestWarning
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_aeo(request: AnalyzeRequest):
    """
    AEOCHECKER analysis endpoint
    Analyzes AI presence, competitor landscape, knowledge base, answerability, 
    crawler accessibility, and structured data
    """
    import time
    start_time = time.time()
    
    try:
        logging.info("="*50)
        logging.info("AEO ANALYZE REQUEST RECEIVED")
        logging.info(f"URL: {request.url}")
        logging.info(f"Competitor URLs: {request.competitor_urls}")
        logging.info("="*50)
        
        # Add protocol if missing
        url = request.url
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
            logging.info(f"Added protocol: {url}")
        
        # Get HTML content for analysis
        logging.info("Fetching HTML content...")
        fetch_start = time.time()
        try:
            # Disable SSL verification to allow analyzing sites with self-signed or invalid certs
            html_response = requests.get(url, timeout=10, verify=False)
            html_content = html_response.text
            fetch_duration = time.time() - fetch_start
            logging.info(f"HTML fetched successfully in {fetch_duration:.2f}s ({len(html_content)} bytes)")
        except requests.exceptions.SSLError:
            logging.error("SSL Error occurred")
            raise HTTPException(status_code=400, detail="Security Certificate Error: The website's SSL certificate could not be verified. It may be invalid or expired.")
        except requests.exceptions.ConnectionError:
            logging.error("Connection Error occurred")
            raise HTTPException(status_code=400, detail="Connection Failed: Could not connect to the website. Please check if the URL is correct and the site is reachable.")
        except requests.exceptions.Timeout:
            logging.error("Timeout Error occurred")
            raise HTTPException(status_code=400, detail="Request Timed Out: The website took too long to respond. Please try again later.")
        except requests.exceptions.TooManyRedirects:
            logging.error("Too Many Redirects Error occurred")
            raise HTTPException(status_code=400, detail="Too Many Redirects: The website is redirecting in a loop.")
        except requests.exceptions.RequestException as e:
            logging.error(f"Request Exception: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Website Unreachable: Unable to access the website ({str(e)})")
        except Exception as e:
            logging.error(f"Unexpected error fetching URL: {str(e)}")
            raise HTTPException(status_code=400, detail=f'Failed to fetch URL: {str(e)}')
        
        # Run complete analysis using orchestrator
        logging.info("Starting complete AEOCHECKER analysis...")
        analysis_start = time.time()
        results = aeo_orchestrator.run_complete_analysis(
            url=url,
            html_content=html_content,
            competitor_urls=request.competitor_urls
        )
        analysis_duration = time.time() - analysis_start
        logging.info(f"Analysis completed in {analysis_duration:.2f}s")
        
        if 'error' in results:
            logging.error(f"Analysis returned error: {results['error']}")
            raise HTTPException(status_code=400, detail=results['error'])
        
        total_duration = time.time() - start_time
        logging.info("="*50)
        logging.info(f"AEO ANALYZE REQUEST COMPLETE - Total time: {total_duration:.2f}s")
        logging.info(f"Overall score: {results.get('overall_score', 'N/A')}")
        logging.info(f"Grade: {results.get('grade', 'N/A')}")
        logging.info("="*50)
        
        return AnalyzeResponse(success=True, results=results)
        
    except HTTPException as e:
        total_duration = time.time() - start_time
        logging.error(f"HTTPException after {total_duration:.2f}s: {e.detail}")
        return AnalyzeResponse(success=False, results={}, error=str(e.detail))
    except Exception as e:
        total_duration = time.time() - start_time
        logging.exception(f"Analysis failed after {total_duration:.2f}s")
        error_msg = str(e)
        if not error_msg:
            error_msg = "An unexpected error occurred during analysis"
        return AnalyzeResponse(success=False, results={}, error=error_msg)

@router.post("/analyze-structured-data", response_model=AnalyzeResponse)
async def analyze_structured_data(request: StructuredDataRequest):
    """
    Analyze structured data (JSON-LD, Microdata, RDFa) for a given URL
    """
    try:
        # Add protocol if missing
        url = request.url
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        # Run structured data analysis
        logging.info(f"Running structured data analysis for {url}")
        results = aeo_orchestrator.analyze_structured_data(
            url=url,
            html_content=request.html_content
        )
        
        if 'error' in results:
            raise HTTPException(status_code=400, detail=results['error'])
        
        return AnalyzeResponse(success=True, results=results)
        
    except HTTPException as e:
        return AnalyzeResponse(success=False, results={}, error=str(e.detail))
    except Exception as e:
        logging.exception("Structured data analysis failed")
        error_msg = str(e)
        if not error_msg:
            error_msg = "An unexpected error occurred during analysis"
        return AnalyzeResponse(success=False, results={}, error=error_msg)

@router.post("/generate-schema", response_model=AnalyzeResponse)
async def generate_schema(request: SchemaGenerateRequest):
    """
    Generate Schema.org markup for a given URL using AI
    """
    try:
        # Add protocol if missing
        url = request.url
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url

        print(f"DEBUG: Received schema generation request for {url} (type: {request.schema_type})")
        
        # If HTML content is provided, use it
        if request.html_content:
            html_content = request.html_content
            print(f"DEBUG: Using provided HTML content (length: {len(html_content)})")
        else:
            # Fetch the URL
            print(f"DEBUG: Fetching URL: {url}")
            try:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
                response = requests.get(url, headers=headers, timeout=30, verify=False)
                response.raise_for_status()
                html_content = response.text
                print(f"DEBUG: Fetched HTML content (length: {len(html_content)})")
            except Exception as e:
                print(f"ERROR: Failed to fetch URL: {str(e)}")
                return AnalyzeResponse(
                    success=False,
                    results={},
                    error=f"Failed to fetch user provided URL: {str(e)}"
                )

        # Generate schema
        print(f"DEBUG: Calling schema generator...")
        result = schema_generator.generate_schema(
            html=html_content,
            url=url,
            schema_type=request.schema_type or 'auto'
        )
        print(f"DEBUG: Schema generator returned: {result.keys() if isinstance(result, dict) else result}")
        
        # Validate result structure
        if not isinstance(result, dict):
            print(f"ERROR: Invalid result type: {type(result)}")
            return AnalyzeResponse(
                success=False, 
                results={},
                error="Internal Error: Generator returned invalid format"
            )
            
        final_response = AnalyzeResponse(
            success=result.get('success', False),
            results=result if result.get('success') else {},
            error=result.get('error')
        )
        
        import json
        try:
            # Verify JSON serializability
            json_str = json.dumps(final_response.model_dump()) # Use model_dump for Pydantic v2
            print(f"DEBUG: Sending response (length: {len(json_str)})")
        except Exception as e:
            print(f"ERROR: Response is not JSON serializable: {e}")
            return AnalyzeResponse(
                success=False,
                results={},
                error=f"Serialization Error: {str(e)}"
            )

        return final_response
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR: Schema generation failed: {str(e)}")
        return AnalyzeResponse(
            success=False,
            results={},
            error=str(e)
        )

@router.get("/health")
async def health_check():
    """AEOCHECKER health check"""
    return {
        "status": "healthy",
        "service": "AEOCHECKER - AI Search Engine Optimization Analyzer",
        "version": "1.0.0",
        "features": [
            "AI Presence Analysis",
            "Structured Data Analysis",
            "Competitor Analysis",
            "Knowledge Base Analysis",
            "Answerability Analysis",
            "Crawler Accessibility Analysis",
            "Schema.org Markup Generator"
        ]
    }

# ------------------------------------------------------------------------------
# Module E: Website Score (Multi-Model)
# ------------------------------------------------------------------------------
from ..services.website_score_service import WebsiteScoreService, WebsiteScoreRequest

@router.post("/website-score")
async def get_website_score(request: WebsiteScoreRequest):
    """
    Analyzes aggregated content to get scores from OpenAI, Claude, and Gemini.
    """
    try:
        scores = await WebsiteScoreService.calculate_scores(request.content)
        return {"success": True, "scores": scores}
    except Exception as e:
        return {"success": False, "error": str(e)}

# ... existing imports ...
from app.services.entity_coverage_service import EntityCoverageService
from ..services.content_consistency_service import ContentConsistencyService

# ... (inside router)

class ExpectedEntitiesRequest(BaseModel):
    topic_context: str
    fallback_context: str = None

class ObservedEntitiesRequest(BaseModel):
    content_batch: str

class CompareEntitiesRequest(BaseModel):
    expected_list: List[str]
    observed_list: List[str]

@router.post("/entity/generate-expected")
async def generate_expected_entities(request: ExpectedEntitiesRequest):
    """
    Step 1: Get the list of entities the site SHOULD have.
    """
    entities = await EntityCoverageService.generate_expected_entities(request.topic_context, request.fallback_context)
    return {"success": True, "entities": entities}

@router.post("/entity/extract-observed")
async def extract_observed_entities(request: ObservedEntitiesRequest):
    """
    Step 2: Extract entities from a batch of pages.
    """
    entities = await EntityCoverageService.extract_observed_entities(request.content_batch)
    return {"success": True, "entities": entities}

@router.post("/entity/compare-coverage")
async def compare_entity_coverage(request: CompareEntitiesRequest):
    """
    Step 3: Calculate the score.
    """
    result = EntityCoverageService.compare_entity_coverage(request.expected_list, request.observed_list)
    return {"success": True, "result": result}

# ------------------------------------------------------------------------------
# Content Consistency & Brand Analysis
# ------------------------------------------------------------------------------

class TopicRequest(BaseModel):
    context: str

class BatchScoreRequest(BaseModel):
    topic: str
    audience: str = "General"
    tone: str = "Neutral"
    content: str

@router.post("/entity/consistency/generate-topic")
async def generate_topic(req: TopicRequest):
    """
    Generates the Canonical Content Mandate (Topic, Audience, Tone, Brand).
    """
    result = await ContentConsistencyService.generate_canonical_topic(req.context)
    return {"success": True, **result}

@router.post("/entity/consistency/score-batch")
async def score_consistency_batch(req: BatchScoreRequest):
    """
    Scores a content batch against the Mandate (0-100).
    """
    score = await ContentConsistencyService.calculate_batch_consistency(
        req.topic, 
        req.audience, 
        req.tone, 
        req.content
    )
    return {"success": True, "score": score}

from ..services.brand_analysis_service import BrandAnalysisService

class BrandAnalysisRequest(BaseModel):
    brand_name: str

@router.post("/analyze-brand")
async def analyze_brand(req: BrandAnalysisRequest):
    """
    Analyzes Brand Metrics (Mentions, Frequency, Sentiment) using DataForSEO.
    """
    result = BrandAnalysisService.analyze_brand(req.brand_name)
    if "error" in result:
        return {"success": False, "error": result["error"]}
    return {"success": True, "data": result}
