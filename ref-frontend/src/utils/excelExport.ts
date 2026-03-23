import * as XLSX from 'xlsx'

/** Style definitions for header rows */
function applyHeaderStyle(ws: XLSX.WorkSheet, range: XLSX.Range) {
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c: C })
    if (!ws[addr]) continue
    ws[addr].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1E1E2E' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        bottom: { style: 'thin', color: { rgb: '444466' } },
        right: { style: 'thin', color: { rgb: '444466' } },
      },
    }
  }
}

/** Set column widths based on header label lengths (minimum 12, max 40 chars) */
function setColumnWidths(ws: XLSX.WorkSheet, headers: string[]) {
  ws['!cols'] = headers.map((h) => ({
    wch: Math.min(40, Math.max(12, h.length + 4)),
  }))
}

/** Download a workbook as an .xlsx file */
export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

/** Create a workbook with multiple sheets */
export function createWorkbook() {
  return XLSX.utils.book_new()
}

/** Append a JSON array as a sheet to a workbook */
export function addSheet(wb: XLSX.WorkBook, data: Record<string, any>[], sheetName: string) {
  if (!data || data.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([['No data available']])
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    return
  }

  const ws = XLSX.utils.json_to_sheet(data)
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  applyHeaderStyle(ws, range)

  const headers = Object.keys(data[0])
  setColumnWidths(ws, headers)
  ws['!freeze'] = { xSplit: 0, ySplit: 1 } // freeze top row

  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)) // Excel sheet name limit 31 chars
}

// ─── Module A helpers ────────────────────────────────────────────────────────

export function transformCrawledDataForExcel(pages: any[]) {
  return pages.map((p) => ({
    URL: p.url || '',
    Title: p.title || '',
    'Title Length': p.titleLength ?? 0,
    'Title Pixel Width': p.titlePixelWidth ?? 0,
    'Title Status': p.titleStatus || '',
    'Meta Description': p.metaDescription || p.description || '',
    'Meta Description Length': p.descriptionLength ?? 0,
    'Meta Description Pixel Width': p.descriptionPixelWidth ?? 0,
    'Meta Description Status': p.metaDescriptionStatus || '',
    // Heading fields (Screaming Frog style)
    'H1-1': p.h1_1 || '',
    'H1-1 Length': p.h1_1Length ?? 0,
    'H1-2': p.h1_2 || '',
    'H1-2 Length': p.h1_2Length ?? 0,
    'H2-1': p.h2_1 || '',
    'H2-1 Length': p.h2_1Length ?? 0,
    'H2-2': p.h2_2 || '',
    'H2-2 Length': p.h2_2Length ?? 0,
    'Heading Tags': (() => {
      try {
        const hs = p.headingTags ? JSON.parse(p.headingTags) : []
        return Array.isArray(hs) ? hs.length : 0
      } catch { return 0 }
    })(),
    'Status Code': p.statusCode ?? 0,
    'Status': p.status || '',
    'Response Time (s)': p.responseTime ?? 0,
    'Content Type': p.contentType || '',
    'Language': p.language || '',
    'Word Count': p.wordCount ?? 0,
    'Sentence Count': p.sentenceCount ?? 0,
    'Average Words Per Sentence': p.averageWordsPerSentence ?? 0,
    'Flesch Reading Ease': p.fleschReadingEase ?? 0,
    'Text Ratio': p.textToHtmlRatio ?? 0,
    'Crawl Depth': p.crawlDepth ?? 0,
    'Folder Depth': p.folderDepth ?? 0,
    'Indexable': p.indexable ? 'Yes' : 'No',
    'Indexability Status': p.indexabilityStatus || '',
    'Meta Robots': p.metaRobots || '',
    'X-Robots-Tag': p.xRobotsTag || '',
    'Meta Refresh': p.metaRefresh || '',
    'HTTP Version': p.httpVersion || '',
    'Canonical URL': p.canonicalUrl || '',
    'Canonical Status': p.canonicalValidationStatus || '',
    'Pagination Tags (rel next)': p.relNext || '',
    'Pagination Tags (rel prev)': p.relPrev || '',
    'HTTP Rel Next': p.httpRelNext || '',
    'HTTP Rel Prev': p.httpRelPrev || '',
    'amphtml Link Element': p.amphtmlUrl || '',
    'Mobile Alternate Link': p.mobileAlternateUrl || '',
    'Redirect URL': p.redirectUrl || '',
    'Redirect Type': p.redirectType || '',
    'Cookies': p.cookies || '',
    'Viewport Present': p.viewportPresent ? 'Yes' : 'No',
    'Viewport Content': p.viewportContent || '',
    'Viewport Status': p.viewportStatus || '',
    'Structured Data Present': p.structuredDataPresent ? 'Yes' : 'No',
    'Structured Data Types': p.structuredDataTypes || '',
    'Has Tables': p.hasTables ? 'Yes' : 'No',
    'Table Count': p.tableCount ?? 0,
    'Has FAQs': p.hasFaqs ? 'Yes' : 'No',
    'FAQ Count': p.faqCount ?? 0,
    'OG Title': p.ogTitle || '',
    'OG Description': p.ogDescription || '',
    'OG Image': p.ogImage || '',
    // Inlinks
    'Inlinks': p.inlinks ?? 0,
    'Unique Inlinks': p.uniqueInlinks ?? 0,
    'Unique JS Inlinks': p.uniqueJsInlinks ?? 0,
    // Outlinks
    'Outlinks': p.outlinks ?? 0,
    'Unique Outlinks': p.uniqueOutlinks ?? 0,
    'Unique JS Outlinks': p.uniqueJsOutlinks ?? 0,
    'External Outlinks': p.externalOutlinks ?? 0,
    'Unique External Outlinks': p.uniqueExternalOutlinks ?? 0,
    'Unique External JS Outlinks': p.uniqueExternalJsOutlinks ?? 0,
    // Sizes
    'Size (bytes)': p.sizeBytes ?? 0,
    'HTML Size (bytes)': p.htmlSizeBytes ?? 0,
    'Transferred (bytes)': p.transferredBytes ?? 0,
    'Total Transferred (bytes)': p.totalTransferredBytes ?? p.transferredBytes ?? 0,
    'CO2 (mg)': p.co2Mg ?? 0,
    'Carbon Rating': p.carbonRating || '',
    // Near duplicates
    'Content Hash': p.contentHash || '',
    'No. Near Duplicates': p.nearDuplicateCount ?? 0,
    'Closest Near Duplicate Match': p.closestDuplicateUrl || '',
    'Near Duplicate Similarity': p.closestDuplicateSimilarity ?? 0,
    // Semantic similarity
    'Closest Semantically Similar Address': p.closestSemanticallySimilarAddress || '',
    'Semantic Similarity Score': p.semanticSimilarityScore ?? 0,
    'No. Semantically Similar': p.semanticallySimilarCount ?? 0,
    'Semantic Relevance Score': p.semanticRelevanceScore ?? 0,
    // Other
    'Link Score': p.linkScore ?? 0,
    'Last Modified': p.lastModified || '',
    'Error Message': p.errorMessage || '',
    'URL Encoded Address': p.urlEncodedAddress || p.url || '',
    'Crawl Timestamp': p.timestamp || '',
  }))
}

export function transformPageMetricsForExcel(pages: any[]) {
  return pages.map((p) => ({
    URL: p.url || '',
    Title: p.title || '',
    'Title Length': p.titleLength ?? 0,
    'Title Status': p.titleStatus || '',
    'Meta Description': p.description || '',
    'Meta Description Length': p.descriptionLength ?? 0,
    'Meta Description Status': p.metaDescriptionStatus || '',
    // Heading fields
    'H1-1': p.h1_1 || '',
    'H1-1 Length': p.h1_1Length ?? 0,
    'H1-2': p.h1_2 || '',
    'H1-2 Length': p.h1_2Length ?? 0,
    'H2-1': p.h2_1 || '',
    'H2-1 Length': p.h2_1Length ?? 0,
    'H2-2': p.h2_2 || '',
    'H2-2 Length': p.h2_2Length ?? 0,
    'Heading Tags': (() => {
      try {
        const hs = p.headingTags ? JSON.parse(p.headingTags) : []
        return Array.isArray(hs) ? hs.length : 0
      } catch { return 0 }
    })(),
    'Canonical URL': p.canonicalUrl || '',
    'Canonical Status': p.canonicalValidationStatus || '',
    'Meta Keywords': p.metaKeywords || '',
    'Meta Keywords Length': p.metaKeywordsLength ?? 0,
    'Meta Refresh': p.metaRefresh || '',
    'Meta Robots': p.metaRobots || '',
    'X-Robots-Tag': p.xRobotsTag || '',
    'Content Type': p.contentType || '',
    'Resource Type': p.resourceType || '',
    'Language': p.language || '',
    'HTTP Version': p.httpVersion || '',
    'Pagination Tags (rel next)': p.relNext || '',
    'Pagination Tags (rel prev)': p.relPrev || '',
    'HTTP Rel Next': p.httpRelNext || '',
    'HTTP Rel Prev': p.httpRelPrev || '',
    'amphtml Link Element': p.amphtmlUrl || '',
    'Mobile Alternate Link': p.mobileAlternateUrl || '',
    'Cookies': p.cookies || '',
    'Viewport Present': p.viewportPresent ? 'Yes' : 'No',
    'Viewport Content': p.viewportContent || '',
    'Viewport Status': p.viewportStatus || '',
    'Structured Data Present': p.structuredDataPresent ? 'Yes' : 'No',
    'Structured Data Format': p.structuredDataFormat || '',
    'Structured Data Types': p.structuredDataTypes || '',
    'Has Tables': p.hasTables ? 'Yes' : 'No',
    'Table Count': p.tableCount ?? 0,
    'Has FAQs': p.hasFaqs ? 'Yes' : 'No',
    'FAQ Count': p.faqCount ?? 0,
    'Has Mixed Content': p.hasMixedContent ? 'Yes' : 'No',
    'Mixed Content Severity': p.mixedContentSeverity || '',
    'OG Title': p.ogTitle || '',
    'OG Description': p.ogDescription || '',
    'OG Image': p.ogImage || '',
    'Inlinks': p.inlinks ?? 0,
    'Unique Inlinks': p.uniqueInlinks ?? 0,
    'Unique JS Inlinks': p.uniqueJsInlinks ?? 0,
    'Page Size (bytes)': p.sizeBytes ?? 0,
    'Total Word Count': p.totalWordCount ?? 0,
    'Last Modified': p.lastModified || '',
    'URL Encoded Address': p.urlEncodedAddress || p.url || '',
    'Crawl Timestamp': p.timestamp || '',
  }))
}

export function transformContentMetricsForExcel(pages: any[]) {
  return pages.map((p) => ({
    URL: p.url || '',
    'Meta Title': p.metaTitle || '',
    'Title Length': p.metaTitleLength ?? '',
    'Title Width (px)': p.metaTitlePx ?? '',
    'Meta Description': p.cmMetaDescription || '',
    'Description Length': p.cmMetaDescriptionLength ?? '',
    'H1 Text': p.h1Text || '',
    'H1 Count': p.h1Count ?? '',
    'H1 Issues': p.h1Issues || '',
    'Heading Structure Valid': p.headingStructureValid ? 'Yes' : p.headingStructureValid === false ? 'No' : '',
    'Keyword Density (%)': p.cmKeywordDensity ?? '',
    'Keyword Count': p.cmKeywordCount ?? '',
    'Total Word Count': p.cmTotalWordCount ?? '',
    'Keyword Density Pass': p.keywordDensityPass ? 'Yes' : p.keywordDensityPass === false ? 'No' : '',
    'KW in H1': p.kwInH1 ? 'Yes' : p.kwInH1 === false ? 'No' : '',
    'KW in First 100 Words': p.kwInFirst100 ? 'Yes' : p.kwInFirst100 === false ? 'No' : '',
    'KW in URL': p.kwInUrlSlug ? 'Yes' : p.kwInUrlSlug === false ? 'No' : '',
    'KW in H2': p.kwInH2 ? 'Yes' : p.kwInH2 === false ? 'No' : '',
    'KW in Meta Title': p.kwInMetaTitle ? 'Yes' : p.kwInMetaTitle === false ? 'No' : '',
    'KW in Meta Description': p.kwInMetaDescription ? 'Yes' : p.kwInMetaDescription === false ? 'No' : '',
    'Schema Types': p.schemaTypes || '',
    'Self-Canonical': p.canonicalIsSelf ? 'Yes' : p.canonicalIsSelf === false ? 'No' : '',
    'Flesch Score': p.readabilityFlesch ?? '',
    'Readability Label': p.readabilityLabel || '',
    'Total Images': p.totalImages ?? '',
    'Missing Alt': p.missingAlt ?? '',
    'Alt Coverage (%)': p.altCoveragePct ?? '',
    'URL Structure Valid': p.urlStructureValid ? 'Yes' : p.urlStructureValid === false ? 'No' : '',
    'URL Issues': p.urlStructureIssues || '',
    'Internal Links': p.internalLinksCount ?? '',
    'External Links': p.externalLinksCount ?? '',
    'Link Ratio': p.linkRatio ?? '',
  }))
}

export function transformTextQualityForExcel(pages: any[]) {
  return pages.map((p) => ({
    URL: p.url || '',
    Title: p.title || '',
    'Total Word Count': p.totalWordCount ?? 0,
    'Visible Word Count': p.visibleWordCount ?? 0,
    'Unique Word Count': p.uniqueWordCount ?? 0,
    'Sentence Count': p.sentenceCount ?? 0,
    'Average Sentence Length': p.averageSentenceLength ?? 0,
    'Paragraph Count': p.paragraphCount ?? 0,
    'Average Paragraph Length': p.averageParagraphLength ?? 0,
    'Keyword Density': p.keywordDensity ?? 0,
    'Text to HTML Ratio': p.textToHtmlRatio ?? 0,
    'Thin Content': p.thinContent ? 'Yes' : 'No',
    'Thin Content Reason': p.thinContentReason || '',
    'Duplicate Content': p.duplicateContent ? 'Yes' : 'No',
    'Duplicate With URLs': Array.isArray(p.duplicateWithUrls) ? p.duplicateWithUrls.join(', ') : '',
    'Grammar Errors': p.grammarErrors ?? 0,
    'Spelling Errors': p.spellingErrors ?? 0,
    'Flesch Reading Ease': p.fleschReadingEase ?? 0,
    'Readability Level': p.readabilityLevel || '',
    'Content Type': p.contentType || '',
    Timestamp: p.timestamp || '',
  }))
}

export function transformWordCountForExcel(pages: any[]) {
  return pages.map((p) => ({
    URL: p.url || '',
    'Total Word Count': p.totalWordCount ?? 0,
    'Visible Word Count': p.visibleWordCount ?? 0,
    'Unique Word Count': p.uniqueWordCount ?? 0,
    'Text to HTML Ratio': p.textToHtmlRatio ?? 0,
    'Sentence Count': p.sentenceCount ?? 0,
    'Paragraph Count': p.paragraphCount ?? 0,
    'Average Sentence Length': p.averageSentenceLength ?? 0,
    'Average Paragraph Length': p.averageParagraphLength ?? 0,
    'Keyword Density': p.keywordDensity ?? 0,
    'Thin Content': p.thinContent ? 'Yes' : 'No',
    'Thin Content Reason': p.thinContentReason || '',
    'Duplicate Content': p.duplicateContent ? 'Yes' : 'No',
    'Duplicate With URLs': Array.isArray(p.duplicateWithUrls) ? p.duplicateWithUrls.join(', ') : '',
    Timestamp: p.timestamp || '',
  }))
}

export function transformLinksForExcel(linksMap: Record<string, any[]>) {
  const rows: Record<string, any>[] = []
  Object.entries(linksMap).forEach(([sourceUrl, links]) => {
    links.forEach((link) => {
      rows.push({
        'Source URL': sourceUrl,
        'Target URL': link.target_url || link.targetUrl || '',
        'Anchor Text': link.anchor_text || link.anchorText || '',
        'Is Internal': link.is_internal ?? link.isInternal ? 'Yes' : 'No',
        Nofollow: link.nofollow ? 'Yes' : 'No',
        'Status Code': link.status_code || link.statusCode || '',
        'Link Type': link.link_type || link.linkType || '',
        'Error Message': link.error_message || link.errorMessage || '',
      })
    })
  })
  return rows
}

export function transformBrokenLinksForExcel(brokenLinks: {
  brokenInternalLinks: { links: any[] }
  brokenExternalLinks: { links: any[] }
  missingPages: { links: any[] }
  serverErrors: { links: any[] }
  timeoutUnreachable: { links: any[] }
}) {
  const makeRow = (link: any, category: string) => ({
    Category: category,
    URL: link.url || '',
    'Source URL': link.sourceUrl || '',
    'Status Code': link.statusCode || '',
    'Error Type': link.errorType || '',
    Error: link.error || '',
  })

  return [
    ...brokenLinks.missingPages.links.map((l) => makeRow(l, 'Missing Pages (404)')),
    ...brokenLinks.brokenInternalLinks.links.map((l) => makeRow(l, 'Broken Internal Links')),
    ...brokenLinks.brokenExternalLinks.links.map((l) => makeRow(l, 'Broken External Links')),
    ...brokenLinks.serverErrors.links.map((l) => makeRow(l, 'Server Errors (5xx)')),
    ...brokenLinks.timeoutUnreachable.links.map((l) => makeRow(l, 'Timeout / Unreachable')),
  ]
}

// ─── Module E helpers ────────────────────────────────────────────────────────

export function transformBrandAnalysisForExcel(brandAnalysis: any) {
  if (!brandAnalysis) return []
  return [
    {
      'Brand Name': brandAnalysis.brand_name || '',
      'Total Mentions': brandAnalysis.total_mentions ?? 0,
      'Positive Mentions': brandAnalysis.sentiment?.counts?.positive ?? 0,
      'Negative Mentions': brandAnalysis.sentiment?.counts?.negative ?? 0,
      'Neutral Mentions': brandAnalysis.sentiment?.counts?.neutral ?? 0,
      'Sentiment Label': brandAnalysis.sentiment?.label || '',
      'Top Source 1': brandAnalysis.top_sources?.[0]?.source || '',
      'Top Source 2': brandAnalysis.top_sources?.[1]?.source || '',
      'Top Source 3': brandAnalysis.top_sources?.[2]?.source || '',
    },
  ]
}

export function transformCompetitorMentionsForExcel(mentionsData: any) {
  if (!mentionsData?.data) return []
  return mentionsData.data.map((item: any) => ({
    Competitor: item.name || '',
    Mentions: item.mentions ?? 0,
    Sentiment: item.sentiment || '',
    'Overall SoV (%)': mentionsData.overall_sov ?? 0,
  }))
}

export function transformShareOfVoiceForExcel(sovData: any) {
  if (!sovData?.data) return []
  return sovData.data.map((item: any) => ({
    Entity: item.name || '',
    'Share of Voice (%)': item.percentage ?? 0,
    Mentions: item.mentions ?? 0,
    Category: item.category || '',
  }))
}

export function transformTrendsByModelForExcel(trendsData: any) {
  if (!trendsData?.data) return []
  const rows: Record<string, any>[] = []

  const modelNames: string[] = []
  if (Array.isArray(trendsData.data)) {
    trendsData.data.forEach((entry: any) => {
      Object.keys(entry).forEach((k) => {
        if (k !== 'date' && k !== 'period' && !modelNames.includes(k)) modelNames.push(k)
      })
    })

    trendsData.data.forEach((entry: any) => {
      const row: Record<string, any> = {
        Date: entry.date || entry.period || '',
      }
      modelNames.forEach((m) => {
        row[m] = entry[m] ?? 0
      })
      rows.push(row)
    })
  }

  return rows
}

export function transformHeadingStructureForExcel(pages: any[]) {
  return pages.map((p) => ({
    URL: p.url || '',
    Title: p.title || '',
    'H1-1': p.h1_1 || '',
    'H1-1 Length': p.h1_1Length ?? 0,
    'H1-2': p.h1_2 || '',
    'H1-2 Length': p.h1_2Length ?? 0,
    'H2-1': p.h2_1 || '',
    'H2-1 Length': p.h2_1Length ?? 0,
    'H2-2': p.h2_2 || '',
    'H2-2 Length': p.h2_2Length ?? 0,
    'Heading Tags Count': (() => {
      try {
        const hs = p.headingTags ? JSON.parse(p.headingTags) : []
        return Array.isArray(hs) ? hs.length : 0
      } catch { return 0 }
    })(),
    'Full Heading Structure': p.headingTags || '',
  }))
}

export function transformSemanticDuplicatesForExcel(pages: any[]) {
  return pages.map((p) => ({
    URL: p.url || '',
    Title: p.title || '',
    'Content Hash': p.contentHash || '',
    'Near Duplicate Count': p.nearDuplicateCount ?? 0,
    'Closest Near Duplicate URL': p.closestDuplicateUrl || '',
    'Near Duplicate Similarity': p.closestDuplicateSimilarity ?? 0,
    'No. Semantically Similar': p.semanticallySimilarCount ?? 0,
    'Closest Semantically Similar Address': p.closestSemanticallySimilarAddress || '',
    'Semantic Similarity Score': p.semanticSimilarityScore ?? 0,
    'Semantic Relevance Score': p.semanticRelevanceScore ?? 0,
  }))
}
