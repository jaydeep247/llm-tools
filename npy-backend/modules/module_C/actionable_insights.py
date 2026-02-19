import re
import logging
from typing import Dict, List, Any
from bs4 import BeautifulSoup

logger = logging.getLogger("module_c.actionable_insights")

class ActionableInsightsModule:
    """
    Analyzes content and provides specific improvement recommendations for LLM performance.
    Ported from node-backend/src/services/ActionableInsightsService.ts
    """
    
    def __init__(self):
        pass

    async def run_analysis(self, html_content: str, url: str = None) -> Dict:
        """
        Analyze page content and generate actionable improvement recommendations.
        """
        try:
            if not html_content:
                return {"error": "No content provided for analysis"}

            soup = BeautifulSoup(html_content, 'html.parser')
            text_content = soup.get_text().lower()

            # 1. Analyze heuristics first
            analysis_results = {
                'direct_answers': self._analyze_direct_answers(soup, text_content),
                'faq_section': self._analyze_faq_section(soup, text_content),
                'headings': self._analyze_heading_structure(soup),
                'entities': self._has_entity_mentions(text_content),
                'long_paras': self._has_long_paragraphs(text_content),
                'structure': self._analyze_structured_data(soup),
                'definitions': self._has_definitions(text_content),
                'examples': self._analyze_examples(text_content),
                'contact': self._analyze_contact_info(soup),
                'depth': self._analyze_content_depth(soup),
                'meta': self._has_meta_description(html_content),
                'links': self._has_internal_linking_context(html_content)
            }

            # 2. Generate improvement actions
            actions = self._generate_improvement_actions(analysis_results)
            
            # 3. Calculate scores
            current_score = self._calculate_current_score(analysis_results, actions)
            predicted_score = self._calculate_predicted_score(current_score, actions)
            improvement = predicted_score - current_score

            # 4. Count actions by priority
            priority_breakdown = {
                "high": len([a for a in actions if a['priority'] == 'High']),
                "medium": len([a for a in actions if a['priority'] == 'Medium']),
                "low": len([a for a in actions if a['priority'] == 'Low'])
            }

            return {
                "totalActions": len(actions),
                "priorityBreakdown": priority_breakdown,
                "currentScore": int(current_score),
                "predictedScore": int(predicted_score),
                "improvement": int(improvement),
                "actions": actions
            }
        except Exception as e:
            logger.error(f"Error in ActionableInsightsModule.run_analysis: {str(e)}")
            return {"error": f"Failed to analyze page: {str(e)}"}

    def _generate_improvement_actions(self, res: Dict) -> List[Dict]:
        actions = []

        # 1. Direct Answers
        if not res['direct_answers']['found']:
            actions.append({
                "id": "direct-answers",
                "type": "Add Direct Answer Sections",
                "description": f"Missing direct answers for {', '.join(res['direct_answers']['missingPatterns'])}. Create clear answer blocks at the top of sections.",
                "priority": "High",
                "impact": 10 if res['direct_answers']['criticalMissing'] else 6,
                "category": "Content Structure"
            })

        # 2. FAQ Section
        if not res['faq_section']['found']:
            actions.append({
                "id": "add-faq",
                "type": "Add FAQ Section",
                "description": f"No FAQ section detected. Add Q&A format for {', '.join(res['faq_section']['suggestedQuestions'])} to improve LLM understanding.",
                "priority": "High",
                "impact": 8 if res['faq_section']['questionPatterns'] > 3 else 5,
                "category": "Content Structure"
            })

        # 3. Headings
        if not res['headings']['isGood']:
            actions.append({
                "id": "improve-headings",
                "type": "Fix Heading Hierarchy",
                "description": f"{'. '.join(res['headings']['issues'])}. Current: H1({res['headings']['counts']['h1']}), H2({res['headings']['counts']['h2']}), H3({res['headings']['counts']['h3']}).",
                "priority": "High" if res['headings']['severity'] == "critical" else "Medium",
                "impact": 8 if res['headings']['severity'] == "critical" else 4,
                "category": "Content Structure"
            })

        # 4. Entities
        if not res['entities']:
            actions.append({
                "id": "add-entities",
                "type": "Add Entity Mentions",
                "description": "Include clear mentions of brands, products, locations, and key entities",
                "priority": "High",
                "impact": 5,
                "category": "Content Optimization"
            })

        # 5. Paragraphs
        if res['long_paras']:
            actions.append({
                "id": "break-paragraphs",
                "type": "Break Up Long Paragraphs",
                "description": "Divide lengthy paragraphs into scannable chunks for better LLM comprehension",
                "priority": "Medium",
                "impact": 3,
                "category": "Readability"
            })

        # 6. Structured Data
        if not res['structure']['sufficient']:
            actions.append({
                "id": "add-structured-data",
                "type": "Add Structured Lists/Tables",
                "description": f"{', '.join(res['structure']['missing'])}. Current: {res['structure']['counts']['lists']} lists, {res['structure']['counts']['tables']} tables. Add {', '.join(res['structure']['recommendations'])}.",
                "priority": "High" if res['structure']['counts']['total'] == 0 else "Medium",
                "impact": 7 if res['structure']['counts']['total'] == 0 else 4,
                "category": "Content Structure"
            })

        # 7. Definitions
        if not res['definitions']:
            actions.append({
                "id": "add-definitions",
                "type": "Add Clear Definitions",
                "description": "Include clear definitions of key terms and concepts",
                "priority": "High",
                "impact": 7,
                "category": "Content Clarity"
            })

        # 8. Examples
        if not res['examples']['sufficient']:
            actions.append({
                "id": "add-examples",
                "type": "Include Concrete Examples",
                "description": f"{'. '.join(res['examples']['issues'])}. Found: {', '.join(res['examples']['types']) or 'none'}. Add: {', '.join(res['examples']['suggestions'])}.",
                "priority": "High" if res['examples']['abstractContent'] else "Medium",
                "impact": 7 if res['examples']['abstractContent'] else 4,
                "category": "Content Clarity"
            })

        # 9. Contact
        if not res['contact']['sufficient']:
            actions.append({
                "id": "add-contact",
                "type": "Add Contact Information",
                "description": f"{', '.join(res['contact']['missing'])}. Found: {', '.join(res['contact']['found']) or 'none'}. Essential for business/location queries.",
                "priority": "Medium" if res['contact']['businessContent'] else "Low",
                "impact": 4 if res['contact']['businessContent'] else 2,
                "category": "Business Information"
            })

        # 10. Depth
        if res['depth']['needsExpansion']:
            actions.append({
                "id": "expand-content",
                "type": "Expand Content Depth",
                "description": f"Content too shallow: {res['depth']['wordCount']} words, {res['depth']['paragraphCount']} paragraphs. {'. '.join(res['depth']['suggestions'])}.",
                "priority": "High" if res['depth']['wordCount'] < 100 else "Medium",
                "impact": 8 if res['depth']['wordCount'] < 100 else 5,
                "category": "Content Depth"
            })

        return actions

    def _analyze_direct_answers(self, soup: BeautifulSoup, text: str) -> Dict:
        question_words = ['what', 'how', 'why', 'when', 'where', 'which', 'who']
        answer_patterns = [
            r'\b(is|means|refers to|defined as)\b',
            r':.*?[a-z]{10,}',
            r'answer:?\s*[a-z]',
            r'explanation:?\s*[a-z]'
        ]
        
        question_count = 0
        found_questions = []
        missing_patterns = []
        
        for word in question_words:
            regex = rf'\b{word}\s+[a-z\s]{{3,50}}[\?\.]'
            matches = re.findall(regex, text, re.I)
            question_count += len(matches)
            if matches:
                found_questions.append(word)
            else:
                missing_patterns.append(f"{word}-questions")
        
        answer_count = 0
        for pattern in answer_patterns:
            matches = re.findall(pattern, text, re.I)
            answer_count += len(matches)
            
        qa_sections = 0
        for tag in soup.find_all(True):
            tag_text = tag.get_text().strip().lower()
            if re.match(r'^(q:|question:|a:|answer:)', tag_text):
                qa_sections += 1
                
        has_good_structure = qa_sections >= 2 or (question_count >= 2 and answer_count >= 2)
        critical_missing = question_count == 0 and answer_count == 0
        
        return {
            "found": has_good_structure,
            "missingPatterns": missing_patterns,
            "criticalMissing": critical_missing
        }

    def _analyze_faq_section(self, soup: BeautifulSoup, text: str) -> Dict:
        faq_headings = [h for h in soup.find_all(['h1', 'h2', 'h3', 'h4']) 
                       if re.search(r'faq|frequently asked|common questions|questions and answers', h.get_text(), re.I)]
        
        question_patterns = [
            r'how (do|does|can|to)',
            r'what (is|are|does)',
            r'why (do|does|is|are)',
            r'when (do|does|should)',
            r'where (can|do|is)',
            r'which (one|type)'
        ]
        
        total_question_patterns = 0
        suggested_questions = []
        suggestions_pool = ['How to get started', 'What is the main benefit', 'Why choose this', 'When to use', 'Where to find more info', 'Which option is best']
        
        for i, pattern in enumerate(question_patterns):
            matches = re.findall(pattern, text, re.I)
            total_question_patterns += len(matches)
            if not matches:
                suggested_questions.append(suggestions_pool[i])
                
        q_elements = len([t for t in soup.find_all(True) if re.match(r'^Q\d*[.:]|^Question\d*[.:]?', t.get_text().strip(), re.I)])
        a_elements = len([t for t in soup.find_all(True) if re.match(r'^A\d*[.:]|^Answer\d*[.:]?', t.get_text().strip(), re.I)])
        
        has_explicit_faq = len(faq_headings) > 0
        has_question_structure = q_elements >= 2 and a_elements >= 2
        has_implicit_faq = total_question_patterns >= 5
        
        return {
            "found": has_explicit_faq or has_question_structure or has_implicit_faq,
            "questionPatterns": total_question_patterns,
            "suggestedQuestions": suggested_questions[:3]
        }

    def _analyze_heading_structure(self, soup: BeautifulSoup) -> Dict:
        counts = {
            'h1': len(soup.find_all('h1')),
            'h2': len(soup.find_all('h2')),
            'h3': len(soup.find_all('h3')),
            'h4': len(soup.find_all('h4')),
            'h5': len(soup.find_all('h5')),
            'h6': len(soup.find_all('h6'))
        }
        issues = []
        severity = 'minor'
        if counts['h1'] == 0:
            issues.append('Missing main H1 heading')
            severity = 'critical'
        elif counts['h1'] > 1:
            issues.append(f"Too many H1 headings ({counts['h1']})")
            severity = 'major'
        if counts['h2'] == 0 and (counts['h3'] > 0 or counts['h4'] > 0):
            issues.append('Skipped H2 level - jumping from H1 to H3+')
            if severity != 'critical': severity = 'major'
        if counts['h2'] < 2 and sum(counts.values()) > 0:
            issues.append('Need more H2 sections for better content organization')
            if severity == 'minor': severity = 'major'
        if counts['h4'] > 0 and counts['h3'] == 0:
            issues.append('Skipped H3 level')
        total_headings = sum(counts.values())
        is_good = not issues and counts['h1'] == 1 and counts['h2'] >= 2 and total_headings >= 3
        return {"isGood": is_good, "issues": issues, "severity": severity, "counts": counts}

    def _has_entity_mentions(self, text: str) -> bool:
        patterns = [
            r'\b[A-Z][a-z]+\s+(?:Inc|LLC|Corp|Company|Ltd|Limited|Co)\b',
            r'\b[A-Z][a-z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd)\b',
            r'\$[\d,]+(?:\.\d{2})?', r'@[a-zA-Z0-9_]+', r'\b[A-Z]{2,}\b',
            r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
            r'\b(?:CEO|CTO|CFO|VP|President|Manager|Director)\b'
        ]
        count = 0
        for p in patterns: count += len(re.findall(p, text, re.I))
        return count >= 3

    def _has_long_paragraphs(self, text: str) -> bool:
        paragraphs = re.split(r'\n\s*\n|\.  ', text)
        long_paras = [p for p in paragraphs if len(p.strip()) > 400]
        return len(long_paras) > 2

    def _analyze_structured_data(self, soup: BeautifulSoup) -> Dict:
        lists = soup.find_all(['ul', 'ol'])
        tables = soup.find_all('table')
        dl = soup.find_all('dl')
        li = soup.find_all('li')
        counts = {'lists': len(lists), 'tables': len(tables), 'total': len(lists) + len(tables) + len(dl)}
        missing = []
        recs = []
        if counts['lists'] == 0:
            missing.append('bullet/numbered lists')
            recs.append('add bullet lists for key points')
        if counts['tables'] == 0 and len(li) > 6:
            missing.append('comparison tables')
            recs.append('convert lists to comparison tables')
        text = soup.get_text().lower()
        if re.search(r'\b(step|phase|stage)\s*(\d+|one|two|three)', text) and counts['lists'] == 0:
            recs.append('convert steps to numbered lists')
        sufficient = counts['total'] >= 2 and (counts['lists'] >= 1 or counts['tables'] >= 1)
        return {"sufficient": sufficient, "missing": missing, "counts": counts, "recommendations": recs}

    def _has_definitions(self, text: str) -> bool:
        patterns = [r'is\s+(?:defined\s+as|a\s+type\s+of|an?\s+)', r'refers\s+to', r'\bmeans\b', r'definition', r':\s*[A-Z][a-z][^.!?]{10,}[.!?]']
        count = 0
        for p in patterns: count += len(re.findall(p, text, re.I))
        return count >= 2

    def _analyze_examples(self, text: str) -> Dict:
        patterns = [r'for\s+example', r'such\s+as', r'including', r'\be\.g\.', r'for\s+instance', r'examples?\s+include', r'like\s+\w+', r'consider\s+\w+']
        count = 0
        found_types = []
        type_names = ['explicit examples', 'comparisons', 'inclusions', 'abbreviations', 'instances', 'lists', 'analogies', 'considerations']
        for i, p in enumerate(patterns):
            matches = re.findall(p, text, re.I)
            count += len(matches)
            if matches: found_types.append(type_names[i])
        abstract_words = r'(concept|theory|principle|methodology|framework|approach|strategy)'
        concrete_words = r'(example|case|instance|demonstration|illustration|sample)'
        abstract_count = len(re.findall(abstract_words, text, re.I))
        concrete_count = len(re.findall(concrete_words, text, re.I))
        abstract_content = abstract_count > concrete_count * 2
        issues = []
        suggestions = []
        if count == 0:
            issues.append('No examples found')
            suggestions.append('concrete use cases')
        if abstract_content:
            issues.append('Too much abstract content')
            suggestions.append('specific examples')
        sufficient = count >= 2 and not abstract_content
        return {"sufficient": sufficient, "issues": issues, "types": found_types, "suggestions": suggestions, "abstractContent": abstract_content}

    def _analyze_contact_info(self, soup: BeautifulSoup) -> Dict:
        text = soup.get_text()
        elements = {'phone': r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', 'email': r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
                    'address': r'\d+\s+[A-Za-z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd)',
                    'social': r'@[a-zA-Z0-9_]+|facebook\.com|twitter\.com|linkedin\.com',
                    'contactSection': r'contact|reach\s+us|get\s+in\s+touch'}
        found = []
        missing = []
        total = 0
        for t, p in elements.items():
            matches = re.findall(p, text, re.I)
            total += len(matches)
            if matches: found.append(f"{t} ({len(matches)})")
            else: missing.append(t)
        biz = len(re.findall(r'\b(company|business|service|product|buy|purchase|order|contact|office|location)\b', text, re.I)) >= 3
        sufficient = total >= 2 or (not biz and total >= 1)
        return {"sufficient": sufficient, "missing": missing, "found": found, "businessContent": biz}

    def _analyze_content_depth(self, soup: BeautifulSoup) -> Dict:
        text = soup.get_text()
        words = [w for w in text.split() if len(w) > 2]
        word_count = len(words)
        paragraphs = soup.find_all('p')
        para_count = len(paragraphs)
        suggestions = []
        if word_count < 150: suggestions.append('Content too short - need at least 300-500 words')
        elif word_count < 300: suggestions.append('Content shallow - expand with more details')
        if para_count < 3: suggestions.append('Add more paragraphs for better organization')
        needs_expansion = word_count < 300 or para_count < 3
        return {"needsExpansion": needs_expansion, "wordCount": word_count, "paragraphCount": para_count, "suggestions": suggestions}

    def _has_meta_description(self, html: str) -> bool:
        patterns = [r'<meta\s+name=["\']description["\'][^>]*content=["\'][^"\']{10,}["\'][^>]*>',
                    r'<meta\s+content=["\'][^"\']{10,}["\'][^>]*name=["\']description["\'][^>]*>']
        for p in patterns:
            if re.search(p, html, re.I): return True
        return False

    def _has_internal_linking_context(self, html: str) -> bool:
        patterns = [r'<a\s+href=["\'][^"\']*/[^"\']*["\'][^>]*>', r'read\s+more', r'learn\s+more', r'see\s+also', r'related\s+(?:articles?|posts?|content)']
        count = 0
        for p in patterns: count += len(re.findall(p, html, re.I))
        return count >= 2

    def _calculate_current_score(self, res: Dict, actions: List[Dict]) -> float:
        score = 100
        action_ids = [a['id'] for a in actions]
        
        # Deduction map matching Node.js exactly
        deductions = {
            'direct-answers': 20 if res['direct_answers']['criticalMissing'] else 12 if not res['direct_answers']['found'] else 0,
            'add-faq': 15 if not res['faq_section']['found'] else 0,
            'improve-headings': 18 if res['headings']['severity'] == 'critical' else 8 if not res['headings']['isGood'] else 0,
            'add-structured-data': 15 if res['structure']['counts']['total'] == 0 else 6 if not res['structure']['sufficient'] else 0,
            'expand-content': 16 if res['depth']['wordCount'] < 100 else 8 if res['depth']['needsExpansion'] else 0,
            'add-entities': 10 if not res['entities'] else 0,
            'add-definitions': 12 if not res['definitions'] else 0,
            'add-examples': 8 if not res['examples']['sufficient'] else 0,
            'break-paragraphs': 5 if res['long_paras'] else 0,
            'add-contact': 3 if not res['contact']['sufficient'] else 0,
            'improve-meta': 4 if not res['meta'] else 0,
            'improve-internal-links': 5 if not res['links'] else 0
        }

        total_deduction = 0
        # Only deduct for items that are actually missing (or have issues)
        for val in deductions.values():
            total_deduction += val
            
        score = max(10, score - total_deduction)
        return round(score)

    def _calculate_predicted_score(self, current_score: float, actions: List[Dict]) -> float:
        total_improvement = 0
        for action in actions:
            impact = action.get('impact', 0)
            if action['priority'] == 'High': scaled_impact = impact
            elif action['priority'] == 'Medium': scaled_impact = impact * 0.8
            else: scaled_impact = impact * 0.6
            total_improvement += scaled_impact
            
        multiplier = 1.2 if current_score < 30 else 1.1 if current_score < 50 else 1.0
        adjusted_improvement = total_improvement * multiplier
        return round(min(95, current_score + adjusted_improvement))
