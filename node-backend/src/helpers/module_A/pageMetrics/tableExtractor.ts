import type { CheerioAPI } from 'cheerio';
import type { TableData, TableInfo } from './types.js';

/**
 * Extract all HTML tables from a page
 * Detects <table> elements and extracts structured data
 */
export function extractTables($: CheerioAPI): TableData {
    const tables: TableInfo[] = [];
    
    // Find all table elements
    $('table').each((index: number, element: Element) => {
        const tableInfo = extractTableInfo(element, index, $);
        
        // Only include tables with meaningful content
        if (tableInfo.rowCount > 0 && tableInfo.columnCount > 0) {
            tables.push(tableInfo);
        }
    });
    
    return {
        tables,
        tableCount: tables.length,
        hasTables: tables.length > 0
    };
}

/**
 * Extract detailed information from a single table
 */
function extractTableInfo(tableElement: Element, index: number, $: CheerioAPI): TableInfo {
    const $table = $(tableElement);
    const rows: string[][] = [];
    const headers: string[] = [];
    
    // Extract header row(s) - look for <thead> or first <tr> with <th> elements
    const $thead = $table.find('thead');
    if ($thead.length > 0) {
        // Extract headers from thead
        $thead.find('tr').first().find('th, td').each((_: number, cell: Element) => {
            const headerText = $(cell).text().trim();
            if (headerText) {
                headers.push(headerText);
            }
        });
    } else {
        // Check first row for headers
        const $firstRow = $table.find('tr').first();
        const $firstRowCells = $firstRow.find('th, td');
        
        // If first row has <th> elements, treat as headers
        if ($firstRow.find('th').length > 0) {
            $firstRowCells.each((_: number, cell: Element) => {
                const headerText = $(cell).text().trim();
                if (headerText) {
                    headers.push(headerText);
                }
            });
        }
    }
    
    // Extract all data rows
    const $tbody = $table.find('tbody');
    const $rowsToProcess = $tbody.length > 0 ? $tbody.find('tr') : $table.find('tr');
    
    // If we found headers in thead or first row, skip the first row if it was used for headers
    const startIndex = ($thead.length > 0 || ($table.find('tr').first().find('th').length > 0)) ? 0 : 0;
    
    $rowsToProcess.each((rowIndex: number, rowElement: Element) => {
        // Skip header row if it was already processed
        if (rowIndex === 0 && headers.length > 0 && !$thead.length) {
            const $firstRow = $(rowElement);
            if ($firstRow.find('th').length > 0) {
                return; // Skip this row as it was used for headers
            }
        }
        
        const row: string[] = [];
        $(rowElement).find('td, th').each((_: number, cell: Element) => {
            const cellText = $(cell).text().trim();
            row.push(cellText);
        });
        
        // Only add non-empty rows
        if (row.length > 0 && row.some(cell => cell.length > 0)) {
            rows.push(row);
        }
    });
    
    // Calculate metrics
    const rowCount = rows.length;
    const columnCount = Math.max(
        headers.length,
        rows.length > 0 ? Math.max(...rows.map(row => row.length)) : 0
    );
    
    // Extract table attributes for context
    const caption = $table.find('caption').text().trim();
    const id = $table.attr('id') || undefined;
    const className = $table.attr('class') || undefined;
    
    // Determine if table has meaningful structure
    const hasHeaders = headers.length > 0;
    const hasData = rows.length > 0;
    const isStructured = hasHeaders && hasData && columnCount > 1;
    
    // Convert to JSON format for storage
    const tableJson = {
        headers: headers.length > 0 ? headers : undefined,
        rows: rows,
        caption: caption || undefined,
        id: id,
        className: className
    };
    
    return {
        index,
        rowCount,
        columnCount,
        hasHeaders,
        hasData,
        isStructured,
        headers: headers.length > 0 ? headers : undefined,
        data: rows.length > 0 ? rows : undefined,
        caption: caption || undefined,
        id: id,
        className: className,
        json: JSON.stringify(tableJson)
    };
}

/**
 * Validate if a table has meaningful content
 * Filters out tables that are likely used for layout purposes
 */
export function isMeaningfulTable(tableInfo: TableInfo): boolean {
    // Must have at least 2 rows and 2 columns
    if (tableInfo.rowCount < 2 || tableInfo.columnCount < 2) {
        return false;
    }
    
    // Must have some non-empty cells
    if (!tableInfo.hasData) {
        return false;
    }
    
    // Check if table has structure (headers or multiple columns)
    if (!tableInfo.isStructured && tableInfo.columnCount < 2) {
        return false;
    }
    
    return true;
}

/**
 * Get table statistics summary
 */
export function getTableStats(tableData: TableData): {
    totalTables: number;
    structuredTables: number;
    totalRows: number;
    totalColumns: number;
    averageRowsPerTable: number;
    averageColumnsPerTable: number;
    tablesWithHeaders: number;
} {
    const meaningfulTables = tableData.tables.filter(isMeaningfulTable);
    const structuredTables = meaningfulTables.filter(t => t.isStructured);
    const tablesWithHeaders = meaningfulTables.filter(t => t.hasHeaders);
    
    const totalRows = meaningfulTables.reduce((sum, t) => sum + t.rowCount, 0);
    const totalColumns = meaningfulTables.reduce((sum, t) => sum + t.columnCount, 0);
    
    const averageRowsPerTable = meaningfulTables.length > 0 
        ? Math.round((totalRows / meaningfulTables.length) * 100) / 100 
        : 0;
    
    const averageColumnsPerTable = meaningfulTables.length > 0
        ? Math.round((totalColumns / meaningfulTables.length) * 100) / 100
        : 0;
    
    return {
        totalTables: meaningfulTables.length,
        structuredTables: structuredTables.length,
        totalRows,
        totalColumns,
        averageRowsPerTable,
        averageColumnsPerTable,
        tablesWithHeaders: tablesWithHeaders.length
    };
}
