import sys
import os
import math

# Add parent dir to path to import modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from module_A.WebsiteCrawler.metrics.pixel_width import calculate_pixel_width
from module_A.WebsiteCrawler.metrics.carbon import calculate_carbon
from module_A.WebsiteCrawler.metrics.content_quality import calculate_flesch_reading_ease, check_spelling, check_grammar
from module_A.WebsiteCrawler.metrics.link_analysis import calculate_link_score
from module_A.WebsiteCrawler.metrics.similarity import generate_simhash, hamming_distance, calculate_tf

def test_pixel_width():
    print("\n🔹 Testing Pixel Width...")
    text = "Hello World"
    width = calculate_pixel_width(text)
    print(f"  'Hello World' width: {width}px")
    
    assert width > 0, "Width should be positive"
    assert isinstance(width, (int, float)), "Width should be a number"
    print("  ✅ Pixel Width Test Passed")

def test_carbon():
    print("\n🔹 Testing Carbon Calculator...")
    bytes_transfer = 1024 * 1024
    result = calculate_carbon(bytes_transfer)
    co2 = result['co2_grams']
    rating = result['rating']
    
    print(f"  1MB Transfer -> CO2: {co2:.4f}g, Rating: {rating}")
    
    assert co2 > 0, "CO2 should be positive"
    assert rating in ['A+', 'A', 'B', 'C', 'D', 'E', 'F'], "Invalid rating"
    print("  ✅ Carbon Test Passed")

def test_content_quality():
    print("\n🔹 Testing Content Quality...")
    
    # Readability
    text = "The cat sat on the mat. It was a good cat."
    flesch = calculate_flesch_reading_ease(text, 2, 10) # 2 sentences, 10 words
    print(f"  Simple text Flesch Score: {flesch}")
    assert flesch > 60, "Simple text should have high reading ease"
    
    # Spelling 
    bad_text = "Thls is a tset setntence with errrors."
    spelling_errors = check_spelling(bad_text)
    print(f"  Spelling errors found: {spelling_errors}")
    assert isinstance(spelling_errors, int), "Should return count (int)"

    # Grammar
    grammar_errors = check_grammar(bad_text)
    print(f"  Grammar errors found: {grammar_errors}")
    assert isinstance(grammar_errors, int), "Should return count (int)"
    
    print("  ✅ Content Quality Test Passed")

def test_link_analysis():
    print("\n🔹 Testing Link Analysis...")
    
    # Mock data
    inlinks = [{'sourcePageScore': 50, 'position': 'Main'}] * 10
    crawl_depth = 2
    
    score = calculate_link_score(inlinks, crawl_depth)
    print(f"  Link Score: {score}")
    
    assert 0 <= score <= 100, "Score should be between 0 and 100"
    print("  ✅ Link Analysis Test Passed")

def test_similarity():
    print("\n🔹 Testing Similarity...")
    
    text1 = "This is a sample text for similarity checking."
    text2 = "This is a sample text for similarity checking."
    text3 = "Completely different content about apples and oranges."
    
    # SimHash
    sim1 = generate_simhash(text1)
    sim2 = generate_simhash(text2)
    sim3 = generate_simhash(text3)
    
    dist_same = hamming_distance(sim1, sim2)
    dist_diff = hamming_distance(sim1, sim3)
    
    print(f"  SimHash 1: {sim1}")
    print(f"  Hamming Distance (Identical): {dist_same}")
    print(f"  Hamming Distance (Different): {dist_diff}")
    
    assert dist_same == 0, "Identical text should have 0 distance"
    assert dist_diff > 0, "Different text should have >0 distance"
    
    # Semantic (TF)
    vec1 = calculate_tf(text1)
    print(f"  TF Vector length: {len(vec1)}")
    assert isinstance(vec1, dict), "Vector should be a dictionary"

    print("  ✅ Similarity Test Passed")

if __name__ == "__main__":
    try:
        test_pixel_width()
        test_carbon()
        test_content_quality()
        test_link_analysis()
        test_similarity()
        print("\n🎉 ALL ALGORITHM TESTS PASSED SUCCESSFULLY!")
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
