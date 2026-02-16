/**
 * Multi-Model LLM Comparison Service
 * 
 * This service compares responses from multiple LLM providers (OpenAI, Claude, Gemini)
 * and provides detailed analysis of answer variation, consistency, and coverage gaps.
 */

## Features

### 1. Content Fetching
- Fetches content from any URL
- Parses and cleans HTML content
- Extracts title, main content, and metadata

### 2. Multi-Model Response Generation
- Parallel API calls to OpenAI, Claude, and Gemini
- Standardized prompt format
- Error handling for unavailable providers

### 3. Analysis Components

#### Agreement Analysis
- **Outcome Level**: Same/Compatible/Contradictory conclusions
- **Reasoning Level**: Similar approaches vs different rationales  
- **Specificity**: Depth, completeness, examples count
- **Tone**: Confidence level and risk posture

#### Claim Extraction & Matrix
- Extracts significant claims from each response
- Normalizes claims for comparison
- Creates coverage matrix showing which models mention which claims
- Categorizes claims (risk, recommendation, requirement, etc.)

#### Coverage Gap Analysis
- Identifies information missing from some models but present in others
- Gap types: risks, stakeholders, steps, constraints, quantification, edge cases, temporal aspects
- Severity assessment (high/medium/low)

#### Model Scoring
- Agreement score (consistency with other models)
- Depth score (reasoning sophistication) 
- Actionability score (concrete recommendations)
- Assumptions stated score (explicit prerequisites)

## API Endpoints

### POST /api/compare
Compare responses from all models for given content.

**Request:**
```json
{
  "sourceUrl": "https://example.com/article",
  "question": "What are the key risks and recommendations?" // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "normalizedPrompt": "Please analyze the following content...",
    "responses": {
      "openai": "Response from OpenAI...",
      "claude": "Response from Claude...", 
      "gemini": "Response from Gemini..."
    },
    "agreement": {
      "outcomeLevel": {
        "agreement": "compatible",
        "score": 0.75
      },
      "reasoningLevel": {
        "similarity": 0.68,
        "approach": "different"
      },
      "specificityLevel": {
        "depthScore": 0.82,
        "completenessScore": 0.71,
        "exampleCount": 12
      },
      "toneAnalysis": {
        "confidence": "moderate",
        "riskPosture": "cautious"
      }
    },
    "claimMatrix": [
      {
        "claim": "regulatory compliance required for data processing",
        "providers": {
          "openai": true,
          "claude": true,
          "gemini": false
        },
        "category": "requirement",
        "importance": 0.9
      }
    ],
    "coverageGaps": [
      {
        "type": "missing_risk",
        "description": "Risk analysis and potential threats",
        "missingFrom": ["gemini"],
        "presentIn": ["openai", "claude"],
        "severity": "high"
      }
    ],
    "scores": {
      "openai": {
        "agreement": 0.85,
        "depth": 0.78,
        "actionability": 0.82,
        "assumptionsStated": 0.65,
        "overall": 0.77
      }
    },
    "metadata": {
      "sourceUrl": "https://example.com/article",
      "processedAt": "2024-02-11T10:30:00Z",
      "processingTime": 15420
    }
  }
}
```

### GET /api/compare/status
Check provider availability.

### POST /api/compare/test/:provider
Test specific provider (openai|claude|gemini).

### GET /api/compare/debug
Get service debug information.

## Environment Variables

Required API keys:
```bash
OPENAI_API_KEY=your_openai_key
CLAUDE_API_KEY=your_claude_key  
GEMINI_API_KEY=your_gemini_key
```

## Architecture

```
Routes (compare.routes.ts)
  ↓
Controller (compare.controller.ts)  
  ↓
Service (compare.service.ts)
  ↓
├── ContentFetcher (contentFetcher.service.ts)
├── Providers (openai|claude|gemini.provider.ts)
├── ClaimExtractor (claimExtraction.service.ts)
├── AgreementAnalyzer (agreementAnalysis.service.ts)
└── GapAnalyzer (coverageGapAnalysis.service.ts)
```

## Usage Examples

### Basic Comparison
```bash
curl -X POST http://localhost:3004/api/compare \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://techcrunch.com/article"
  }'
```

### With Custom Question
```bash
curl -X POST http://localhost:3004/api/compare \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUrl": "https://example.com/business-plan",
    "question": "What are the financial risks and growth opportunities?"
  }'
```

### Test Provider
```bash
curl -X POST http://localhost:3004/api/compare/test/openai \
  -H "Content-Type: application/json" \
  -d '{
    "testPrompt": "Hello, test message"
  }'
```

## Error Handling

The service gracefully handles:
- Invalid URLs
- Network timeouts
- Provider API failures
- Rate limiting
- Malformed content

Failed providers are excluded from analysis, with minimum 2 providers required.

## Extension Points

### Adding New Providers
1. Create provider class implementing `LLMProvider` interface
2. Add to providers map in `CompareService`
3. Update types and validation

### Custom Analysis
- Extend analysis services with domain-specific logic
- Add new gap types and claim categories
- Implement custom scoring algorithms

### Integration
- Webhook notifications for completed analyses
- Batch processing for multiple URLs
- Caching for repeated content analysis