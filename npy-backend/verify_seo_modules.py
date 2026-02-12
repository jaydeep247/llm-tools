from module_A.Wordcount_analysis import wordcount_extractor
from module_A.Broken_links_checker import broken_link_checker
from module_A.Redirects_audit import redirect_audit

def test_wordcount():
    html = """
    <html>
    <head><title>Test Page</title></head>
    <body>
        <h1>Main Header</h1>
        <p>This is a test paragraph with some words. It has two sentences.</p>
        <h2>Sub Header</h2>
        <p>Short content here.</p>
        <script>var x = 1;</script>
        <style>.css { color: red; }</style>
    </body>
    </html>
    """
    results = wordcount_extractor.extract_wordcount_analysis(html, "https://example.com/blog/test", "test")
    print("Wordcount Results:", results)
    assert results['visibleWordCount'] > 0
    assert results['sentenceCount'] >= 2
    assert results['wordCountDistribution']['isBlog'] == True

def test_broken_links():
    links = [
        {'url': 'https://ok.com', 'status_code': 200, 'is_internal': True},
        {'url': 'https://broken.com', 'status_code': 404, 'is_internal': False}
    ]
    results = broken_link_checker.analyze_broken_links(links)
    print("Broken Links Results:", results)
    assert results['totalBrokenLinks'] == 1
    assert results['brokenExternalLinks'] == 1

def test_redirects():
    hops = [
        {'url': 'http://example.com', 'status_code': 301},
        {'url': 'https://example.com', 'status_code': 200}
    ]
    results = redirect_audit.analyze_redirects(hops)
    print("Redirects Results:", results)
    assert results['has301Redirect'] == True
    assert results['chainLength'] == 1

if __name__ == "__main__":
    test_wordcount()
    test_broken_links()
    test_redirects()
    print("All unit tests passed!")
