import puppeteer from 'puppeteer';

interface PageContent {
  title: string;
  headings: string[];
  paragraphs: string[];
  fullText: string;
  url: string;
}

export class WebCrawler {
  async crawlPage(url: string): Promise<PageContent> {
    let browser;
    try {
      browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      await page.goto(url, { 
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      
      const content = await page.evaluate(() => {
        const title = document.title || '';
        
        const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
          .map(h => h.textContent?.trim())
          .filter(text => text && text.length > 0) as string[];
        
        const paragraphs = Array.from(document.querySelectorAll('p'))
          .map(p => p.textContent?.trim())
          .filter(text => text && text.length > 20) as string[];
        
        const fullText = document.body.innerText || '';
        
        return {
          title,
          headings,
          paragraphs,
          fullText,
          url: window.location.href
        };
      });
      
      await browser.close();
      return content;
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      console.error('Error crawling page:', error);
      throw new Error(`Failed to crawl page: ${url} - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const webCrawler = new WebCrawler();