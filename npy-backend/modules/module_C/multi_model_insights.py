import re
import math
from typing import Dict, List, Any, Set

class MultiModelInsights:
    """
    Analyzes multiple LLM responses to extract comparison insights.
    Ported from node-backend/src/services/compare.service.ts
    """

    def perform_analysis(self, responses: Dict[str, str]) -> Dict[str, Any]:
        """
        Main entry point for multi-model analysis.
        """
        # Filter out error responses and non-answers
        valid_responses = {}
        for p, r in responses.items():
            if not r or r.startswith("Error:"):
                continue
            
            # Detect "not found" style responses using regex
            not_found_patterns = [
                r"information (not found|is not available)",
                r"not mentioned in (the )?provided content",
                r"does not (provide|contain) information",
                r"i (don't|do not) know",
                r"not found in (the )?provided content",
                r"no information (is|was)? found",
                r"unable to find (any)? information"
            ]
            if any(re.search(pat, r, re.I) for pat in not_found_patterns) and len(r) < 200:
                continue
                
            valid_responses[p] = r
        
        if not valid_responses:
            # Check if all non-error responses agreed on "Not Found"
            actual_responses = [r for r in responses.values() if r and not r.startswith("Error:")]
            if actual_responses and all(any(ind in r.lower() for ind in ["not found", "not mentioned", "don't know", "no information"]) for r in actual_responses):
                return {
                    "agreement": {
                        "outcome_level": {"agreement": "same", "score": 1.0, "note": "All models agreed information is missing"},
                        "reasoning_level": {"similarity": 1.0, "approach": "same"},
                        "specificity_level": {"depth_score": 0.0, "completeness_score": 0.0, "example_count": 0},
                        "tone_analysis": {"confidence": "neutral", "risk_posture": "neutral"}
                    },
                    "claim_matrix": [],
                    "coverage_gaps": [],
                    "scores": {p: {"agreement": 1.0, "depth": 0, "overall": 0.25} for p in responses.keys() if not responses[p].startswith("Error:")}
                }

            return {
                "agreement": {},
                "claim_matrix": [],
                "coverage_gaps": [],
                "scores": {}
            }

        agreement = self.analyze_agreement(valid_responses)
        claim_matrix = self.build_claim_matrix(valid_responses)
        scores = self.score_responses(valid_responses)
        coverage_gaps = self.analyze_coverage_gaps(valid_responses, claim_matrix)

        return {
            "agreement": agreement,
            "claim_matrix": claim_matrix,
            "coverage_gaps": coverage_gaps,
            "scores": scores
        }

    # =========================================================================
    # Agreement Analysis Logic
    # =========================================================================

    def analyze_agreement(self, responses: Dict[str, str]) -> Dict[str, Any]:
        response_texts = list(responses.values())
        
        return {
            "outcome_level": self._analyze_outcome_agreement(response_texts),
            "reasoning_level": self._analyze_reasoning_agreement(response_texts),
            "specificity_level": self._analyze_specificity(response_texts),
            "tone_analysis": self._analyze_tone(response_texts)
        }

    def _analyze_outcome_agreement(self, responses: List[str]) -> Dict[str, Any]:
        conclusions = [self._extract_conclusion(r) for r in responses]
        similarities = self._calculate_pairwise_similarities(conclusions)
        avg_similarity = sum(similarities) / len(similarities) if similarities else 1.0

        agreement = "contradictory"
        if avg_similarity > 0.8:
            agreement = "same"
        elif avg_similarity > 0.4:
            agreement = "compatible"

        return {"agreement": agreement, "score": round(avg_similarity, 2)}

    def _analyze_reasoning_agreement(self, responses: List[str]) -> Dict[str, Any]:
        reasoning_depths = [self._assess_reasoning_depth(r) for r in responses]
        avg_depth = sum(reasoning_depths) / len(reasoning_depths) if reasoning_depths else 0
        depth_variance = self._calculate_variance(reasoning_depths)

        reasoning_approaches = [self._extract_reasoning_approach(r) for r in responses]
        approach_similarity = self._calculate_text_similarity(" ".join(reasoning_approaches), " ".join(reasoning_approaches))

        approach = "different"
        if depth_variance > 0.3:
            approach = "shallow_vs_detailed"
        elif approach_similarity > 0.6:
            approach = "same"

        return {
            "similarity": round(approach_similarity, 2),
            "approach": approach
        }

    def _analyze_specificity(self, responses: List[str]) -> Dict[str, Any]:
        depth_scores = [self._assess_reasoning_depth(r) for r in responses]
        avg_depth_score = sum(depth_scores) / len(depth_scores) if depth_scores else 0

        example_counts = [self._count_examples(r) for r in responses]
        total_examples = sum(example_counts)

        completeness_scores = [self._assess_completeness(r) for r in responses]
        avg_completeness = sum(completeness_scores) / len(completeness_scores) if completeness_scores else 0

        return {
            "depth_score": round(avg_depth_score, 2),
            "completeness_score": round(avg_completeness, 2),
            "example_count": total_examples
        }

    def _analyze_tone(self, responses: List[str]) -> Dict[str, Any]:
        confidence_scores = [self._assess_confidence_level(r) for r in responses]
        avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.5

        risk_scores = [self._assess_risk_posture(r) for r in responses]
        avg_risk_score = sum(risk_scores) / len(risk_scores) if risk_scores else 0.5

        confidence = "moderate"
        if avg_confidence < 0.4:
            confidence = "hedged"
        elif avg_confidence > 0.7:
            confidence = "assertive"

        risk_posture = "neutral"
        if avg_risk_score < 0.4:
            risk_posture = "cautious"
        elif avg_risk_score > 0.7:
            risk_posture = "aggressive"

        return {"confidence": confidence, "risk_posture": risk_posture}

    # =========================================================================
    # Scoring Logic
    # =========================================================================

    def score_responses(self, responses: Dict[str, str]) -> Dict[str, Any]:
        scores = {}
        all_texts = list(responses.values())

        for provider, response in responses.items():
            agreement_score = self._calculate_agreement_score(response, all_texts)
            depth_score = self._assess_reasoning_depth(response)
            actionability_score = self._assess_actionability(response)
            assumptions_score = self._assess_assumptions_stated(response)

            overall = (agreement_score + depth_score + actionability_score + assumptions_score) / 4

            scores[provider] = {
                "agreement": round(agreement_score, 2),
                "depth": round(depth_score, 2),
                "actionability": round(actionability_score, 2),
                "assumptions_stated": round(assumptions_score, 2),
                "overall": round(overall, 2)
            }

        return scores

    # =========================================================================
    # Claim Matrix Logic
    # =========================================================================

    def build_claim_matrix(self, responses: Dict[str, str]) -> List[Dict[str, Any]]:
        all_claims = {}

        for provider, response in responses.items():
            all_claims[provider] = self._extract_claims(response, provider)

        normalized_claims = self._normalize_claims(all_claims)
        return self._create_matrix(normalized_claims, list(responses.keys()))

    def _extract_claims(self, response: str, provider: str) -> List[Dict[str, Any]]:
        claims = []
        sentences = self._split_into_sentences(response)

        for i, sentence in enumerate(sentences):
            if self._is_significant_claim(sentence):
                claims.append({
                    "id": f"{provider}-{i}",
                    "content": sentence.strip(),
                    "confidence": self._assess_confidence(sentence),
                    "category": self._categorize_claim(sentence),
                    "source": provider
                })
        return claims

    def _normalize_claims(self, all_claims: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        claim_map = {}

        for provider, claims in all_claims.items():
            for claim in claims:
                normalized_text = self._normalize_claim_text(claim["content"])
                
                if normalized_text not in claim_map:
                    claim_map[normalized_text] = {
                        "claim": claim["content"], # keep original for display
                        "providers": set(),
                        "category": claim["category"],
                        "importance": claim["confidence"]
                    }
                
                claim_map[normalized_text]["providers"].add(provider)
                claim_map[normalized_text]["importance"] = (claim_map[normalized_text]["importance"] + claim["confidence"]) / 2

        result = []
        for text, data in claim_map.items():
            result.append({
                "claim": data["claim"],
                "providers": data["providers"],
                "category": data["category"],
                "importance": data["importance"]
            })
        return result

    def _create_matrix(self, normalized_claims: List[Dict[str, Any]], all_providers: List[str]) -> List[Dict[str, Any]]:
        matrix = []
        for claim_data in normalized_claims:
            providers_map = {}
            for p in all_providers:
                providers_map[p] = p in claim_data["providers"]
            
            matrix.append({
                "claim": claim_data["claim"],
                "providers": providers_map,
                "category": claim_data["category"],
                "importance": round(claim_data["importance"], 2)
            })
        return matrix

    # =========================================================================
    # Coverage Gap Analysis Logic
    # =========================================================================

    def analyze_coverage_gaps(self, responses: Dict[str, str], claim_matrix: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        gaps = []
        providers = list(responses.keys())

        # 1. Analyze claim gaps (missing from some models but present in others)
        for claim in claim_matrix:
            present_providers = [p for p, present in claim["providers"].items() if present]
            missing_providers = [p for p, present in claim["providers"].items() if not present]

            if missing_providers and present_providers:
                gaps.append({
                    "type": self._map_category_to_gap_type(claim["category"]),
                    "description": f"Missing perspective: {claim['claim'][:100]}...",
                    "missing_from": missing_providers,
                    "present_in": present_providers,
                    "severity": self._assess_gap_severity(claim["importance"], len(missing_providers), len(providers))
                })

        # 2. Analyze pattern-based content gaps (heuristic)
        gap_patterns = {
            "missing_risk": {
                "keywords": ['risk', 'danger', 'threat', 'vulnerability', 'concern', 'caution', 'warning'],
                "description": 'Risk analysis and potential threats'
            },
            "missing_stakeholder": {
                "keywords": ['stakeholder', 'customer', 'user', 'team', 'management', 'executive', 'client', 'partner'],
                "description": 'Stakeholder identification and impact'
            }
        }

        for gap_type, pattern in gap_patterns.items():
            coverage = self._analyze_pattern_coverage(responses, pattern["keywords"])
            missing = [p for p, present in coverage.items() if not present]
            present = [p for p, present in coverage.items() if present]

            if missing and present:
                gaps.append({
                    "type": gap_type,
                    "description": pattern["description"],
                    "missing_from": missing,
                    "present_in": present,
                    "severity": self._assess_gap_severity(0.7, len(missing), len(providers))
                })

        # Sort by severity
        severity_weights = {"high": 3, "medium": 2, "low": 1}
        gaps.sort(key=lambda x: severity_weights.get(x["severity"], 0), reverse=True)
        
        return gaps

    # =========================================================================
    # Helpers (Ported Utilities)
    # =========================================================================

    def _extract_conclusion(self, response: str) -> str:
        lines = response.split('\n')
        keywords = ['conclusion', 'summary', 'in summary', 'overall', 'finally']
        for i in range(len(lines) - 1, -1, -1):
            if any(k in lines[i].lower() for k in keywords):
                return " ".join(lines[i:])
        return " ".join(lines[-3:])

    def _assess_reasoning_depth(self, response: str) -> float:
        indicators = [
            r'because|since|due to|as a result|therefore|thus',
            r'consider|analysis|evaluate|examine',
            r'factor|aspect|dimension|component',
            r'implication|consequence|impact|effect'
        ]
        score = 0
        for pattern in indicators:
            matches = re.findall(pattern, response, re.I)
            score += len(matches)
        
        return min(1.0, score / (len(response) / 100 + 1))

    def _extract_reasoning_approach(self, response: str) -> str:
        sentences = self._split_into_sentences(response)
        reasoning_patterns = [
            r'because|since|due to|as a result|therefore|thus',
            r'consider|analysis|evaluate|examine',
            r'this suggests|this indicates|this implies'
        ]
        reasoning = [s for s in sentences if any(re.search(p, s, re.I) for p in reasoning_patterns)]
        return " ".join(reasoning)

    def _count_examples(self, response: str) -> int:
        patterns = [r'for example|for instance|such as|e\.g\.', r'\d+\.|•|\*\s', r'case study|scenario|situation']
        count = 0
        for p in patterns:
            count += len(re.findall(p, response, re.I))
        return count

    def _assess_completeness(self, response: str) -> float:
        indicators = ['stakeholder', 'risk', 'benefit', 'cost', 'time', 'resource', 'requirement']
        found = [i for i in indicators if i in response.lower()]
        return len(found) / len(indicators)

    def _assess_confidence_level(self, response: str) -> float:
        hedge = ['might', 'could', 'possibly', 'perhaps', 'likely', 'seems']
        conf = ['will', 'must', 'definitely', 'clearly', 'certainly']
        lower = response.lower()
        h_count = sum(1 for w in hedge if w in lower)
        c_count = sum(1 for w in conf if w in lower)
        score = (c_count - h_count + len(response) / 200) / 10
        return max(0.0, min(1.0, score))

    def _assess_risk_posture(self, response: str) -> float:
        cautious = ['careful', 'caution', 'risk', 'danger', 'warning', 'concern']
        aggressive = ['opportunity', 'advantage', 'benefit', 'growth', 'potential']
        lower = response.lower()
        c_count = sum(1 for w in cautious if w in lower)
        a_count = sum(1 for w in aggressive if w in lower)
        score = (a_count - c_count + 5) / 10
        return max(0.0, min(1.0, score))

    def _assess_actionability(self, response: str) -> float:
        words = ['should', 'recommend', 'suggest', 'implement', 'execute', 'action', 'step', 'plan']
        lower = response.lower()
        count = sum(1 for w in words if w in lower)
        return min(1.0, count / 5)

    def _assess_assumptions_stated(self, response: str) -> float:
        patterns = [r'assuming|assume|given that|provided that', r'if we assume|based on the assumption']
        count = 0
        for p in patterns:
            count += len(re.findall(p, response, re.I))
        return min(1.0, count / 3)

    def _calculate_agreement_score(self, response: str, all_texts: List[str]) -> float:
        if not all_texts: return 1.0
        similarities = [self._calculate_text_similarity(response, other) for other in all_texts]
        return sum(similarities) / len(similarities)

    def _calculate_pairwise_similarities(self, texts: List[str]) -> List[float]:
        sims = []
        for i in range(len(texts)):
            for j in range(i + 1, len(texts)):
                sims.append(self._calculate_text_similarity(texts[i], texts[j]))
        return sims

    def _calculate_text_similarity(self, text1: str, text2: str) -> float:
        words1 = set(re.findall(r'\w+', text1.lower()))
        words2 = set(re.findall(r'\w+', text2.lower()))
        if not words1 or not words2: return 0.0
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        return len(intersection) / len(union)

    def _calculate_variance(self, numbers: List[float]) -> float:
        if not numbers: return 0.0
        mean = sum(numbers) / len(numbers)
        variance = sum((x - mean)**2 for x in numbers) / len(numbers)
        return math.sqrt(variance)

    def _split_into_sentences(self, text: str) -> List[str]:
        return [s.strip() for s in re.split(r'[.!?]+', text) if len(s.strip()) > 10]

    def _is_significant_claim(self, sentence: str) -> bool:
        significant_patterns = [r'\b(should|must|need|recommend|important|critical|key)\b', r'\b(risk|benefit|challenge)\b']
        return any(re.search(p, sentence, re.I) for p in significant_patterns) or len(sentence) > 50

    def _assess_confidence(self, sentence: str) -> float:
        hedge = ['possibly', 'might', 'could', 'may', 'likely']
        conf = ['definitely', 'clearly', 'must', 'will']
        lower = sentence.lower()
        score = 0.5
        score += sum(0.2 for w in conf if w in lower)
        score -= sum(0.15 for w in hedge if w in lower)
        return max(0.1, min(1.0, score))

    def _categorize_claim(self, sentence: str) -> str:
        categories = {
            'recommendation': r'\b(should|recommend|suggest|advise)\b',
            'risk': r'\b(risk|danger|threat|warning|caution)\b',
            'benefit': r'\b(benefit|advantage|opportunity|positive)\b',
            'requirement': r'\b(must|need|require|necessary|essential)\b'
        }
        for cat, pattern in categories.items():
            if re.search(pattern, sentence, re.I): return cat
        return 'general'

    def _normalize_claim_text(self, text: str) -> str:
        return re.sub(r'[^a-z0-9\s]', '', text.lower()).strip()

    def _map_category_to_gap_type(self, category: str) -> str:
        mapping = {'risk': 'missing_risk', 'benefit': 'missing_benefit', 'requirement': 'missing_requirement'}
        return mapping.get(category, 'other')

    def _assess_gap_severity(self, importance: float, missing_count: int, total: int) -> str:
        ratio = missing_count / total
        score = importance * ratio
        if score > 0.6: return 'high'
        if score > 0.3: return 'medium'
        return 'low'

    def _analyze_pattern_coverage(self, responses: Dict[str, str], keywords: List[str]) -> Dict[str, bool]:
        coverage = {}
        for p, r in responses.items():
            coverage[p] = any(k in r.lower() for k in keywords)
        return coverage
