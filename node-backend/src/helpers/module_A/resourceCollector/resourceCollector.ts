import type { CheerioAPI } from 'cheerio';
import type { ResourceData, CollectedResources, ResourceCollectionOptions } from './types.js';

/**
 * Collect CSS files from a page
 */
export function collectCssFiles(
    $: CheerioAPI,
    baseUrl: string,
    sessionId: number,
    pageId: number,
    emittedCss: Set<string>
): ResourceData[] {
    const cssResources: ResourceData[] = [];
    const cssLinks = $('link[rel="stylesheet"][href]').map((_i: number, el: Element) => $(el).attr('href')).get();
    
    for (const href of cssLinks) {
        if (!href) continue;
        
        let absolute: string;
        try {
            absolute = new URL(href, baseUrl).toString();
        } catch {
            continue;
        }
        
        if (emittedCss.has(absolute)) continue;
        emittedCss.add(absolute);
        
        cssResources.push({
            sessionId,
            pageId,
            url: absolute,
            resourceType: 'css',
            title: '',
            description: 'CSS file',
            contentType: 'text/css',
            statusCode: null,
            responseTime: null,
            timestamp: new Date().toISOString()
        });
    }
    
    return cssResources;
}

/**
 * Collect JavaScript files from a page
 */
export function collectJsFiles(
    $: CheerioAPI,
    baseUrl: string,
    sessionId: number,
    pageId: number,
    emittedJs: Set<string>
): ResourceData[] {
    const jsResources: ResourceData[] = [];
    const jsLinks = $('script[src]').map((_i: number, el: Element) => $(el).attr('src')).get();
    
    for (const src of jsLinks) {
        if (!src) continue;
        
        let absolute: string;
        try {
            absolute = new URL(src, baseUrl).toString();
        } catch {
            continue;
        }
        
        if (emittedJs.has(absolute)) continue;
        emittedJs.add(absolute);
        
        jsResources.push({
            sessionId,
            pageId,
            url: absolute,
            resourceType: 'js',
            title: '',
            description: 'JavaScript file',
            contentType: 'application/javascript',
            statusCode: null,
            responseTime: null,
            timestamp: new Date().toISOString()
        });
    }
    
    return jsResources;
}

/**
 * Collect images from a page
 */
export function collectImages(
    $: CheerioAPI,
    baseUrl: string,
    sessionId: number,
    pageId: number,
    emittedImg: Set<string>
): ResourceData[] {
    const imageResources: ResourceData[] = [];
    const imgElems = $('img[src]').map((_i: number, el: Element) => ({
        src: $(el).attr('src'),
        alt: $(el).attr('alt')
    })).get();
    
    for (const { src, alt } of imgElems) {
        if (!src) continue;
        
        let absolute: string;
        try {
            absolute = new URL(src, baseUrl).toString();
        } catch {
            continue;
        }
        
        if (emittedImg.has(absolute)) continue;
        emittedImg.add(absolute);
        
        imageResources.push({
            sessionId,
            pageId,
            url: absolute,
            resourceType: 'image',
            title: alt || '',
            description: 'Image',
            contentType: 'image/*',
            statusCode: null,
            responseTime: null,
            timestamp: new Date().toISOString()
        });
    }
    
    return imageResources;
}

/**
 * Collect external links from a page
 */
export function collectExternalLinks(
    $: CheerioAPI,
    baseUrl: string,
    sessionId: number,
    pageId: number,
    allowedHost: string,
    allowSubdomains: boolean,
    emittedExternal: Set<string>,
    isValidHttpLink: (href: string) => boolean,
    isSameSite: (url: string, host: string, allowSubdomains: boolean) => boolean
): ResourceData[] {
    const externalResources: ResourceData[] = [];
    const links = $('a[href]').map((_i: number, el: any) => $(el).attr('href')).get();
    
    for (const href of links) {
        if (!href) continue;
        
        let absolute: string;
        try {
            absolute = new URL(href, baseUrl).toString();
        } catch {
            continue;
        }
        
        // Only track real HTTP/HTTPS links
        if (!isValidHttpLink(absolute)) continue;
        
        if (!isSameSite(absolute, allowedHost, allowSubdomains)) {
            if (emittedExternal.has(absolute)) continue;
            emittedExternal.add(absolute);
            
            externalResources.push({
                sessionId,
                pageId,
                url: absolute,
                resourceType: 'external',
                title: '',
                description: 'External link',
                contentType: 'text/html',
                statusCode: null,
                responseTime: null,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    return externalResources;
}

/**
 * Collect all resources from a page
 */
export function collectPageResources(
    $: CheerioAPI,
    options: ResourceCollectionOptions,
    isValidHttpLink: (href: string) => boolean,
    isSameSite: (url: string, host: string, allowSubdomains: boolean) => boolean
): CollectedResources {
    const {
        sessionId,
        pageId,
        baseUrl,
        allowedHost,
        allowSubdomains,
        emittedCss,
        emittedJs,
        emittedImg,
        emittedExternal
    } = options;
    
    return {
        css: collectCssFiles($, baseUrl, sessionId, pageId, emittedCss),
        js: collectJsFiles($, baseUrl, sessionId, pageId, emittedJs),
        images: collectImages($, baseUrl, sessionId, pageId, emittedImg),
        external: collectExternalLinks(
            $,
            baseUrl,
            sessionId,
            pageId,
            allowedHost,
            allowSubdomains,
            emittedExternal,
            isValidHttpLink,
            isSameSite
        )
    };
}
