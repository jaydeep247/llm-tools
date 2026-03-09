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
    'Meta Description': p.metaDescription || p.description || '',
    'Meta Description Length': p.descriptionLength ?? 0,
    'Meta Description Pixel Width': p.descriptionPixelWidth ?? 0,
    'Status Code': p.statusCode ?? 0,
    'Response Time (ms)': p.responseTime ?? 0,
    'Content Type': p.contentType || '',
    'Word Count': p.wordCount ?? 0,
    'Sentence Count': p.sentenceCount ?? 0,
    'Crawl Depth': p.crawlDepth ?? 0,
    'Folder Depth': p.folderDepth ?? 0,
    Indexable: p.indexable ? 'Yes' : 'No',
    'Indexability Status': p.indexabilityStatus || '',
    'Meta Robots': p.metaRobots || '',
    'X-Robots-Tag': p.xRobotsTag || '',
    'Canonical URL': p.canonicalUrl || '',
    'Redirect URL': p.redirectUrl || '',
    'Redirect Type': p.redirectType || '',
    'Unique Outlinks': p.uniqueOutlinks ?? 0,
    'Unique External Outlinks': p.uniqueExternalOutlinks ?? 0,
    'Size (bytes)': p.sizeBytes ?? 0,
    'Transferred (bytes)': p.transferredBytes ?? 0,
    'CO2 (mg)': p.co2Mg ?? 0,
    'Carbon Rating': p.carbonRating || '',
    'Text to HTML Ratio': p.textToHtmlRatio ?? 0,
    'Flesch Reading Ease': p.fleschReadingEase ?? 0,
    'Readability Level': p.readabilityLevel || '',
    'Content Hash': p.contentHash || '',
    'Near Duplicate Count': p.nearDuplicateCount ?? 0,
    'Link Score': p.linkScore ?? 0,
    'Error Message': p.errorMessage || '',
    Timestamp: p.timestamp || '',
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
    'Canonical URL': p.canonicalUrl || '',
    'Canonical Status': p.canonicalValidationStatus || '',
    'Meta Keywords': p.metaKeywords || '',
    'Meta Keywords Length': p.metaKeywordsLength ?? 0,
    'Content Type': p.contentType || '',
    'Resource Type': p.resourceType || '',
    'Has Tables': p.hasTables ? 'Yes' : 'No',
    'Table Count': p.tableCount ?? 0,
    'Has FAQs': p.hasFaqs ? 'Yes' : 'No',
    'FAQ Count': p.faqCount ?? 0,
    'FAQ Score': p.faqScore ?? 0,
    'FAQ Schema Present': p.faqSchemaPresent ? 'Yes' : 'No',
    'Has Mixed Content': p.hasMixedContent ? 'Yes' : 'No',
    'Mixed Content Severity': p.mixedContentSeverity || '',
    'Active Mixed Content': p.activeMixedContentCount ?? 0,
    'Passive Mixed Content': p.passiveMixedContentCount ?? 0,
    'Page Size (bytes)': p.pageSizeBytes ?? p.sizeBytes ?? 0,
    'Total Word Count': p.totalWordCount ?? 0,
    'Last Modified': p.lastModified || '',
    Timestamp: p.timestamp || '',
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
    'Duplicate Content': p.duplicateContent ? 'Yes' : 'No',
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
