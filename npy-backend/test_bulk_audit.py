"""
Test script for Bulk AEO Audit functionality
Run this to verify the bulk audit service works correctly.
"""

import asyncio
import json
from modules.module_C.runner import runner


async def test_bulk_audit():
    """Test bulk audit with a small set of URLs"""
    
    # Test URLs - using a small set for quick testing
    test_urls = [
        "https://yogreet.com",
        "https://yogreet.com/about",
        "https://yogreet.com/contact"
    ]
    
    print("=" * 60)
    print("Testing Bulk AEO Audit")
    print("=" * 60)
    print(f"Analyzing {len(test_urls)} URLs...")
    print()
    
    try:
        # Run bulk audit
        result = await runner.run_bulk_audit(test_urls, job_id="test_bulk")
        
        # Display results
        print("SUMMARY:")
        print("-" * 60)
        summary = result.get('summary', {})
        print(f"Total Pages:              {summary.get('total_pages', 0)}")
        print(f"Successful Scans:         {summary.get('successful_scans', 0)}")
        print(f"Average LLM Score:        {summary.get('average_llm_score', 0)}")
        print(f"Average Readability:      {summary.get('average_readability', 0)}")
        print(f"Average Entity Coverage:  {summary.get('average_entity_coverage', 0)}")
        print(f"Missing Entities Ratio:   {summary.get('missing_entities_ratio', 0)}%")
        print(f"Weak Content Ratio:       {summary.get('weak_content_ratio', 0)}%")
        print()
        
        print("DETAILED RESULTS:")
        print("-" * 60)
        for detail in result.get('details', []):
            print(f"\nURL: {detail.get('url', 'N/A')}")
            print(f"  Status:          {detail.get('status', 'N/A')}")
            print(f"  LLM Score:       {detail.get('llm_score', 0)}")
            print(f"  Readability:     {detail.get('readability', 0)}")
            print(f"  Entity Coverage: {detail.get('entity_coverage', 0)}")
            print(f"  Overall Score:   {detail.get('overall_score', 0)}")
            if 'error' in detail:
                print(f"  Error:           {detail['error']}")
        
        print()
        print("=" * 60)
        print("Test completed successfully!")
        print("=" * 60)
        
        # Also save to file for inspection
        with open('/tmp/bulk_audit_test_results.json', 'w') as f:
            json.dump(result, f, indent=2)
        print("\nFull results saved to: /tmp/bulk_audit_test_results.json")
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_bulk_audit())
