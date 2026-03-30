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

type ContentAuditExportColumn = {
  group: string
  label: string
  value: (row: any) => string | number | null
}

function firstDefined(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }

  return null
}

function getNestedValue(source: any, path: string[]) {
  return path.reduce<any>((current, key) => current?.[key], source)
}

function getContentAuditValue(row: any, key: string, nestedPaths: string[][] = []) {
  const fields = row?.fields ?? {}
  return firstDefined(
    row?.[key],
    fields?.[key],
    ...nestedPaths.map((path) => getNestedValue(fields, path)),
  )
}

function formatDateOnly(value: any) {
  if (!value) return ''
  const stringValue = String(value)
  return stringValue.includes('T') ? stringValue.split('T')[0] : stringValue
}

function formatPublishedUpgrade(row: any) {
  const published = formatDateOnly(firstDefined(
    row?.publishedDate,
    row?.fields?.publishedDate,
    row?.fields?.content_matrix?.publishedDate,
    row?.fields?.page_matrix?.publishedDate,
  ))
  const upgrade = formatDateOnly(firstDefined(
    row?.upgradeDate,
    row?.fields?.upgradeDate,
    row?.fields?.content_matrix?.upgradeDate,
    row?.fields?.page_matrix?.upgradeDate,
  ))

  if (published && upgrade) return `${published} / ${upgrade}`
  return published || upgrade || ''
}

function normalizeCellValue(value: any) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return value
}

const CONTENT_AUDIT_GROUP_COLORS: Record<string, string> = {
  'Page Metrics': 'FFF2CC',
  'Keyword Metrics': 'DAEEF3',
  'Performance Metrics': 'D9E2F3',
  'Content Metrics': 'E4DFEC',
  'Backlink Metrics': 'D9D2E9',
}

function applyContentAuditHeaderStyles(ws: XLSX.WorkSheet, columnCount: number) {
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const groupName = CONTENT_AUDIT_EXPORT_COLUMNS[columnIndex]?.group
    const fillColor = CONTENT_AUDIT_GROUP_COLORS[groupName] || 'E5E7EB'

    const groupAddress = XLSX.utils.encode_cell({ r: 0, c: columnIndex })
    if (ws[groupAddress]) {
      ws[groupAddress].s = {
        font: { bold: true, sz: 14, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: fillColor } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: '374151' } },
          bottom: { style: 'thin', color: { rgb: '374151' } },
          left: { style: 'thin', color: { rgb: '374151' } },
          right: { style: 'thin', color: { rgb: '374151' } },
        },
      }
    }

    const subHeaderAddress = XLSX.utils.encode_cell({ r: 1, c: columnIndex })
    if (ws[subHeaderAddress]) {
      ws[subHeaderAddress].s = {
        font: { bold: true, sz: 10, color: { rgb: '000000' } },
        fill: { fgColor: { rgb: fillColor } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          top: { style: 'thin', color: { rgb: '4B5563' } },
          bottom: { style: 'thin', color: { rgb: '4B5563' } },
          left: { style: 'thin', color: { rgb: '4B5563' } },
          right: { style: 'thin', color: { rgb: '4B5563' } },
        },
      }
    }
  }
}

const CONTENT_AUDIT_EXPORT_COLUMNS: ContentAuditExportColumn[] = [
  {
    group: 'Page Metrics',
    label: 'URL',
    value: (row) => firstDefined(row?.url, row?.fields?.url),
  },
  {
    group: 'Page Metrics',
    label: 'Page Category',
    value: (row) => getContentAuditValue(row, 'pageCategory', [['page_matrix', 'page_category']]),
  },
  {
    group: 'Page Metrics',
    label: 'Post Category Type',
    value: (row) => getContentAuditValue(row, 'postCategoryType', [['page_matrix', 'post_category_type']]),
  },
  {
    group: 'Page Metrics',
    label: 'Page Type (Hub/Spoke/Sub-Spoke)',
    value: (row) => getContentAuditValue(row, 'pageType', [['page_matrix', 'page_type']]),
  },
  {
    group: 'Page Metrics',
    label: 'Post Type',
    value: (row) => getContentAuditValue(row, 'postType', [['page_matrix', 'post_type']]),
  },
  {
    group: 'Page Metrics',
    label: 'Intent',
    value: (row) => getContentAuditValue(row, 'intent', [['page_matrix', 'intent']]),
  },
  {
    group: 'Page Metrics',
    label: 'Status Code',
    value: (row) => firstDefined(row?.statusCode, row?.status_code, row?.fields?.website_crawler?.status_code),
  },
  {
    group: 'Keyword Metrics',
    label: 'Volume (Global)',
    value: (row) => getContentAuditValue(row, 'volume_global', [['Keyword_analysis', 'volume_global']]),
  },
  {
    group: 'Keyword Metrics',
    label: 'Volume (US)',
    value: (row) => getContentAuditValue(row, 'volume_us', [['Keyword_analysis', 'volume_us']]),
  },
  {
    group: 'Keyword Metrics',
    label: 'KDs (US)',
    value: (row) => getContentAuditValue(row, 'kd_us', [['Keyword_analysis', 'kd_us']]),
  },
  {
    group: 'Keyword Metrics',
    label: 'CPC ($)',
    value: (row) => getContentAuditValue(row, 'cpc_usd', [['Keyword_analysis', 'cpc_usd']]),
  },
  {
    group: 'Keyword Metrics',
    label: 'Current Ranking',
    value: (row) => getContentAuditValue(row, 'currentRanking', [['performance_metrics', 'currentRanking'], ['page_matrix', 'currentRanking']]),
  },
  {
    group: 'Performance Metrics',
    label: '30 Days GA Traffic',
    value: (row) => getContentAuditValue(row, 'ga30DaysTraffic', [['performance_metrics', 'ga30DaysTraffic'], ['page_matrix', 'ga30DaysTraffic']]),
  },
  {
    group: 'Performance Metrics',
    label: 'Overall Keywords',
    value: (row) => getContentAuditValue(row, 'overallKeywords', [['performance_metrics', 'overallKeywords'], ['page_matrix', 'overallKeywords']]),
  },
  {
    group: 'Performance Metrics',
    label: '1st Page Keywords',
    value: (row) => getContentAuditValue(row, 'firstPageKeywords', [['performance_metrics', 'firstPageKeywords'], ['page_matrix', 'firstPageKeywords']]),
  },
  {
    group: 'Content Metrics',
    label: 'Current Word Count',
    value: (row) => getContentAuditValue(row, 'currentWordCount', [['content_matrix', 'currentWordCount'], ['page_matrix', 'currentWordCount']]),
  },
  {
    group: 'Content Metrics',
    label: 'SERP Intent Word Count',
    value: (row) => getContentAuditValue(row, 'serpIntentWordCount', [['content_matrix', 'serpIntentWordCount'], ['page_matrix', 'serpIntentWordCount']]),
  },
  {
    group: 'Content Metrics',
    label: 'Need to Add Word Counts',
    value: (row) => getContentAuditValue(row, 'needToAddWordCount', [['content_matrix', 'needToAddWordCount'], ['page_matrix', 'needToAddWordCount']]),
  },
  {
    group: 'Content Metrics',
    label: 'Published/Upgrade',
    value: (row) => formatPublishedUpgrade(row),
  },
  {
    group: 'Backlink Metrics',
    label: 'PR Score',
    value: (row) => getContentAuditValue(row, 'pr_score', [['backlink_metrics', 'pr_score']]),
  },
  {
    group: 'Backlink Metrics',
    label: 'Inlinks',
    value: (row) => firstDefined(row?.inlinks, row?.fields?.inlinks, row?.fields?.website_crawler?.inlinks),
  },
  {
    group: 'Backlink Metrics',
    label: 'Internal Outlinks',
    value: (row) => getContentAuditValue(row, 'internal_outlinks', [['backlink_metrics', 'internal_outlinks']]),
  },
  {
    group: 'Backlink Metrics',
    label: 'External Outlinks',
    value: (row) => getContentAuditValue(row, 'external_outlinks', [['backlink_metrics', 'external_outlinks']]),
  },
  {
    group: 'Backlink Metrics',
    label: 'Internal/External Ratio',
    value: (row) => getContentAuditValue(row, 'internal_external_ratio', [['backlink_metrics', 'internal_external_ratio']]),
  },
  {
    group: 'Backlink Metrics',
    label: 'Minimum Required Referring Domains',
    value: (row) => getContentAuditValue(row, 'min_required_ref_domains', [['backlink_metrics', 'min_required_ref_domains']]),
  },
  {
    group: 'Backlink Metrics',
    label: 'Current Referring Domains',
    value: (row) => getContentAuditValue(row, 'current_ref_domains', [['backlink_metrics', 'current_ref_domains']]),
  },
  {
    group: 'Backlink Metrics',
    label: 'Need to Acquire Referring Domains',
    value: (row) => getContentAuditValue(row, 'need_to_acquire_ref_domains', [['backlink_metrics', 'need_to_acquire_ref_domains']]),
  },
]

export function addContentAuditSheet(wb: XLSX.WorkBook, data: any[], sheetName = 'Content Audit') {
  const uniqueRows: any[] = []
  const seenUrls = new Set<string>()

  for (const row of data || []) {
    const url = String(firstDefined(row?.url, row?.fields?.url) || '').trim()
    if (!url || seenUrls.has(url)) continue
    seenUrls.add(url)
    uniqueRows.push(row)
  }

  const headerRow = CONTENT_AUDIT_EXPORT_COLUMNS.map((column) => column.group)
  const subHeaderRow = CONTENT_AUDIT_EXPORT_COLUMNS.map((column) => column.label)
  const dataRows = uniqueRows.map((row) =>
    CONTENT_AUDIT_EXPORT_COLUMNS.map((column) => normalizeCellValue(column.value(row))),
  )
  const ws = XLSX.utils.aoa_to_sheet([headerRow, subHeaderRow, ...dataRows])

  const merges: XLSX.Range[] = []
  let groupStart = 0
  for (let columnIndex = 1; columnIndex <= CONTENT_AUDIT_EXPORT_COLUMNS.length; columnIndex += 1) {
    const nextGroup = CONTENT_AUDIT_EXPORT_COLUMNS[columnIndex]?.group
    const currentGroup = CONTENT_AUDIT_EXPORT_COLUMNS[groupStart]?.group
    if (columnIndex === CONTENT_AUDIT_EXPORT_COLUMNS.length || nextGroup !== currentGroup) {
      if (columnIndex - groupStart > 1) {
        merges.push({
          s: { r: 0, c: groupStart },
          e: { r: 0, c: columnIndex - 1 },
        })
      }
      groupStart = columnIndex
    }
  }

  ws['!merges'] = merges
  ws['!rows'] = [{ hpt: 24 }, { hpt: 30 }]
  ws['!freeze'] = { xSplit: 0, ySplit: 2 }
  ws['!cols'] = CONTENT_AUDIT_EXPORT_COLUMNS.map((column, columnIndex) => {
    const maxDataLength = dataRows.reduce((maxLength, dataRow) => {
      const cellValue = String(dataRow[columnIndex] ?? '')
      return Math.max(maxLength, cellValue.length)
    }, 0)

    return {
      wch: Math.min(48, Math.max(14, column.group.length + 2, column.label.length + 2, maxDataLength + 2)),
    }
  })

  applyContentAuditHeaderStyles(ws, CONTENT_AUDIT_EXPORT_COLUMNS.length)
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
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
