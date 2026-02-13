"""
Analyze all pages from a job to check question detection
"""
import asyncio
import json
from utils.mongo import MongoManager
from utils.storage import load_raw_html
from modules.module_C.answerability import AnswerabilityModule

async def analyze_all_pages(job_id: str):
    mongo = MongoManager.get_instance()
    module = AnswerabilityModule()
    
    # Get all pages for this job
    pages = list(mongo.pages.find({'job_id': job_id}))
    
    print(f"=" * 80)
    print(f"Analyzing {len(pages)} pages from job: {job_id}")
    print(f"=" * 80)
    
    total_questions = 0
    total_answers = 0
    
    for i, page in enumerate(pages, 1):
        url = page.get('url', 'N/A')
        page_id = str(page.get('_id'))
        
        # Load HTML
        try:
            html_content = await load_raw_html(job_id, page_id)
            if not html_content:
                print(f"\n{i}. {url}")
                print(f"   ❌ No HTML content found")
                continue
            
            # Analyze
            result = await module.run_analysis(html_content)
            
            q_count = result.get('metrics', {}).get('question_count', 0)
            a_count = result.get('metrics', {}).get('answer_count', 0)
            qa_balance = result.get('metrics', {}).get('qa_balance', 0)
            
            total_questions += q_count
            total_answers += a_count
            
            print(f"\n{i}. {url}")
            print(f"   Questions: {q_count}, Answers: {a_count}, Balance: {qa_balance:.2f}")
            
            if q_count > 0:
                print(f"   Sample questions:")
                for q in result.get('questions_found', [])[:3]:
                    print(f"     - {q[:80]}...")
                    
        except Exception as e:
            print(f"\n{i}. {url}")
            print(f"   ❌ Error: {e}")
    
    print(f"\n" + "=" * 80)
    print(f"SUMMARY")
    print(f"=" * 80)
    print(f"Total Pages: {len(pages)}")
    print(f"Total Questions Found: {total_questions}")
    print(f"Total Answers Found: {total_answers}")
    print(f"Average Questions per Page: {total_questions / len(pages) if pages else 0:.1f}")
    print(f"Average Answers per Page: {total_answers / len(pages) if pages else 0:.1f}")

if __name__ == "__main__":
    import sys
    job_id = sys.argv[1] if len(sys.argv) > 1 else "92c5914d-3d35-4ba3-aa54-6c28abca801e"
    asyncio.run(analyze_all_pages(job_id))
