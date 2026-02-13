"""
Test Answer Completeness Score Metrics
"""
import asyncio
from modules.module_C.answerability import AnswerabilityModule

async def test_answerability_metrics():
    module = AnswerabilityModule()
    
    # Test HTML with questions and answers
    html = """
    <html><body>
    <h2>What is AEO?</h2>
    <p>AEO stands for Answer Engine Optimization. The answer is that it helps optimize content for AI search engines. Therefore, it's important for visibility.</p>
    
    <h2>How does it work?</h2>
    <p>It works by optimizing content structure. The method involves using clear headings and structured data. First, analyze your content. Then, apply optimization techniques.</p>
    
    <p>Why is it important? Because AI systems need clear signals. Therefore, proper optimization improves visibility.</p>
    </body></html>
    """
    
    print("=" * 60)
    print("Testing Answer Completeness Score Metrics")
    print("=" * 60)
    
    result = await module.run_analysis(html)
    
    print(f"\nScore: {result.get('score', 0)}")
    print(f"\nQuestions Found: {len(result.get('questions_found', []))}")
    for i, q in enumerate(result.get('questions_found', [])[:5], 1):
        print(f"  {i}. {q[:80]}...")
    
    print(f"\nAnswers Found: {len(result.get('answers_found', []))}")
    for i, a in enumerate(result.get('answers_found', [])[:5], 1):
        answer_text = a.get('answer', '')[:80] if isinstance(a, dict) else str(a)[:80]
        confidence = a.get('confidence', 'N/A') if isinstance(a, dict) else 'N/A'
        print(f"  {i}. [{confidence}] {answer_text}...")
    
    metrics = result.get('metrics', {})
    print(f"\nMetrics:")
    print(f"  Question Count: {metrics.get('question_count', 0)}")
    print(f"  Answer Count: {metrics.get('answer_count', 0)}")
    print(f"  QA Balance: {metrics.get('qa_balance', 0)}")
    print(f"  % Questions Answered: {metrics.get('percent_questions_answered', 0)}%")
    
    print(f"\nAI Analysis:")
    ai_analysis = result.get('ai_analysis', {})
    print(f"  AI Score: {ai_analysis.get('ai_answerability_score', 0)}")
    print(f"  Answered Questions: {len(ai_analysis.get('answered_questions', []))}")
    print(f"  Missing Answers: {len(ai_analysis.get('missing_answers_gaps', []))}")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    asyncio.run(test_answerability_metrics())
