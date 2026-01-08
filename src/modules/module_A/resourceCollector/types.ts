/**
 * Resource data for database insertion
 */
export interface ResourceData {
    sessionId: number;
    pageId: number;
    url: string;
    resourceType: 'css' | 'js' | 'image' | 'external';
    title: string;
    description: string;
    contentType: string;
    statusCode: number | null;
    responseTime: number | null;
    timestamp: string;
}

/**
 * Collected resources from a page
 */
export interface CollectedResources {
    css: ResourceData[];
    js: ResourceData[];
    images: ResourceData[];
    external: ResourceData[];
}

/**
 * Resource collection options
 */
export interface ResourceCollectionOptions {
    sessionId: number;
    pageId: number;
    baseUrl: string;
    allowedHost: string;
    allowSubdomains: boolean;
    emittedCss: Set<string>;
    emittedJs: Set<string>;
    emittedImg: Set<string>;
    emittedExternal: Set<string>;
}
