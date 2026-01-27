import { prisma, Prisma } from '../../config/prismaClient.js';
import { Page, Resource } from '../types.js';
import type { ContentFingerprint, NearDuplicateMetrics, SimilarityResult } from '../../helpers/module_A/duplicateDetection/types.js';

export class PageRepository {
    constructor() { }

    private safeInt(val: any): number | null {
        if (val === undefined || val === null) return null;
        if (typeof val === 'number') return Math.round(val);
        const parsed = parseFloat(val);
        return isNaN(parsed) ? null : Math.round(parsed);
    }

    async insertPage(data: Omit<Page, 'id'>): Promise<number> {
        const page = await prisma.page.create({
            data: {
                sessionId: data.sessionId,
                url: data.url,
                title: data.title,
                titleLength: data.titleLength || 0,
                titlePixelWidth: data.titlePixelWidth ?? null,
                description: data.description,
                descriptionLength: data.descriptionLength || 0,
                descriptionPixelWidth: data.descriptionPixelWidth ?? null,
                contentType: data.contentType,
                lastModified: data.lastModified ?? null,
                statusCode: data.statusCode,
                responseTime: data.responseTime,
                wordCount: data.wordCount || 0,
                sentenceCount: data.sentenceCount ?? null,
                averageWordsPerSentence: data.averageWordsPerSentence !== undefined && data.averageWordsPerSentence !== null 
                    ? data.averageWordsPerSentence 
                    : null,
                fleschReadingEase: data.fleschReadingEase !== undefined && data.fleschReadingEase !== null 
                    ? data.fleschReadingEase 
                    : null,
                readabilityLevel: data.readabilityLevel && data.readabilityLevel.trim().length > 0 
                    ? data.readabilityLevel.trim() 
                    : null,
                textToHtmlRatio: data.textToHtmlRatio !== undefined && data.textToHtmlRatio !== null 
                    ? data.textToHtmlRatio 
                    : null,
                crawlDepth: data.crawlDepth || 0,
                folderDepth: data.folderDepth || 0,
                sizeBytes: data.sizeBytes ?? null,
                timestamp: new Date(data.timestamp),
                success: data.success,
                errorMessage: data.errorMessage ?? null,
                indexable: data.indexable !== undefined ? data.indexable : true,
                indexabilityStatus: data.indexabilityStatus || 'indexable',
                metaKeywords: data.metaKeywords ?? null,
                metaKeywordsLength: data.metaKeywordsLength ?? null,
                metaRobots: data.metaRobots ?? null,
                xRobotsTag: data.xRobotsTag ?? null,
                metaRefresh: data.metaRefresh ?? null,
                canonicalUrl: data.canonicalUrl ?? null,
                relNext: data.relNext ?? null,
                relPrev: data.relPrev ?? null,
                httpRelNext: data.httpRelNext ?? null,
                httpRelPrev: data.httpRelPrev ?? null,
                amphtmlUrl: data.amphtmlUrl ?? null,
                mobileAlternateUrl: data.mobileAlternateUrl ?? null,
                transferredBytes: data.transferredBytes ? BigInt(data.transferredBytes) : null,
                totalTransferredBytes: data.totalTransferredBytes ? BigInt(data.totalTransferredBytes) : null,
                co2Mg: data.co2Mg ?? null,
                carbonRating: data.carbonRating ?? null,
                headingTags: data.headingTags ?? null,
                spellingErrors: data.spellingErrors || 0,
                grammarErrors: data.grammarErrors || 0,
                redirectUrl: data.redirectUrl ?? null,
                redirectType: data.redirectType ?? null,
                cookies: data.cookies ?? null,
                language: data.language ?? null,
                httpVersion: data.httpVersion ?? null,
                closestSemanticallySimilarAddress: data.closestSemanticallySimilarAddress ?? null,
                semanticSimilarityScore: data.semanticSimilarityScore ?? null,
                noSemanticallySimilar: data.noSemanticallySimilar || 0,
                semanticRelevanceScore: data.semanticRelevanceScore ?? null,
                urlEncodedAddress: data.urlEncodedAddress ?? null,
                contentHash: data.contentHash ?? null,
            },
        });
        return page.id;
    }

    async upsertContentFingerprint(fingerprint: ContentFingerprint): Promise<number> {
        const result = await prisma.contentFingerprint.upsert({
            where: {
                pageId_sessionId: {
                    pageId: fingerprint.pageId,
                    sessionId: fingerprint.sessionId,
                },
            },
            update: {
                url: fingerprint.url,
                contentHash: fingerprint.contentHash,
                simhash: fingerprint.simhash,
                wordCount: fingerprint.wordCount,
            },
            create: {
                pageId: fingerprint.pageId,
                sessionId: fingerprint.sessionId,
                url: fingerprint.url,
                contentHash: fingerprint.contentHash,
                simhash: fingerprint.simhash,
                wordCount: fingerprint.wordCount,
            },
        });
        return result.id;
    }

    async getContentFingerprintsBySession(sessionId: number): Promise<ContentFingerprint[]> {
        const fingerprints = await prisma.contentFingerprint.findMany({
            where: { sessionId },
            select: {
                pageId: true,
                sessionId: true,
                url: true,
                contentHash: true,
                simhash: true,
                wordCount: true,
            },
        });

        return fingerprints.map(f => ({
            url: f.url,
            pageId: f.pageId,
            sessionId: f.sessionId,
            contentHash: f.contentHash,
            simhash: f.simhash,
            wordCount: f.wordCount,
        }));
    }

    async clearSimilarityIndexForSession(sessionId: number): Promise<void> {
        await prisma.similarityIndex.deleteMany({
            where: { sessionId },
        });
    }

    async insertSimilarityResults(results: SimilarityResult[]): Promise<void> {
        if (results.length === 0) return;

        await prisma.$transaction(
            results.map(r =>
                prisma.similarityIndex.upsert({
                    where: {
                        sourcePageId_targetPageId_sessionId: {
                            sourcePageId: r.sourcePageId,
                            targetPageId: r.targetPageId,
                            sessionId: r.sessionId,
                        },
                    },
                    update: {
                        similarityScore: r.similarityScore,
                    },
                    create: {
                        sourcePageId: r.sourcePageId,
                        targetPageId: r.targetPageId,
                        sessionId: r.sessionId,
                        similarityScore: r.similarityScore,
                    },
                })
            )
        );
    }

    async updatePagesNearDuplicateMetrics(metrics: Map<number, NearDuplicateMetrics>): Promise<void> {
        if (metrics.size === 0) return;

        await prisma.$transaction(
            Array.from(metrics.entries()).map(([pageId, m]) =>
                prisma.page.update({
                    where: { id: pageId },
                    data: {
                        closestDuplicateUrl: m.closestMatch?.url ?? null,
                        closestDuplicateSimilarity: m.closestMatch?.similarity ?? null,
                        nearDuplicateCount: m.nearDuplicateCount ?? 0,
                    },
                })
            )
        );
    }

    async insertResource(data: Omit<Resource, 'id'>): Promise<number> {
        const resource = await prisma.resource.upsert({
            where: {
                sessionId_url: {
                    sessionId: data.sessionId,
                    url: data.url,
                },
            },
            update: {
                pageId: data.pageId ?? null,
                resourceType: data.resourceType,
                title: data.title,
                description: data.description,
                contentType: data.contentType,
                statusCode: data.statusCode ?? null,
                responseTime: data.responseTime ?? null,
                timestamp: new Date(data.timestamp),
            },
            create: {
                sessionId: data.sessionId,
                pageId: data.pageId ?? null,
                url: data.url,
                resourceType: data.resourceType,
                title: data.title,
                description: data.description,
                contentType: data.contentType,
                statusCode: data.statusCode ?? null,
                responseTime: data.responseTime ?? null,
                timestamp: new Date(data.timestamp),
            },
        });
        return resource.id;
    }

    async updatePageCarbon(pageId: number, data: { transferredBytes: number, totalTransferredBytes: number, co2Mg: number, carbonRating: string }): Promise<void> {
        await prisma.page.update({
            where: { id: pageId },
            data: {
                transferredBytes: BigInt(data.transferredBytes),
                totalTransferredBytes: BigInt(data.totalTransferredBytes),
                co2Mg: data.co2Mg,
                carbonRating: data.carbonRating,
            },
        });
    }

    async updatePagesSemanticAnalysis(semanticResults: Map<number, {
        closestSemanticallySimilarAddress: string | null;
        semanticSimilarityScore: number;
        noSemanticallySimilar: number;
        semanticRelevanceScore: number;
    }>): Promise<void> {
        if (semanticResults.size === 0) return;

        await prisma.$transaction(
            Array.from(semanticResults.entries()).map(([pageId, result]) =>
                prisma.page.update({
                    where: { id: pageId },
                    data: {
                        closestSemanticallySimilarAddress: result.closestSemanticallySimilarAddress ?? null,
                        semanticSimilarityScore: result.semanticSimilarityScore,
                        noSemanticallySimilar: result.noSemanticallySimilar ?? 0,
                        semanticRelevanceScore: result.semanticRelevanceScore,
                    },
                })
            )
        );
    }

    async updateCanonicalValidation(
        pageId: number,
        sessionId: number,
        canonicalUrl: string | null,
        validationStatus: string | null,
        validationMessage: string | null
    ): Promise<void> {
        await prisma.pageMetric.upsert({
            where: {
                pageId_sessionId: {
                    pageId,
                    sessionId,
                },
            },
            update: {
                canonicalUrl,
                canonicalValidationStatus: validationStatus,
                canonicalValidationMessage: validationMessage,
            },
            create: {
                pageId,
                sessionId,
                canonicalUrl,
                canonicalValidationStatus: validationStatus,
                canonicalValidationMessage: validationMessage,
            },
        });
    }

    async updateTableExtraction(
        pageId: number,
        sessionId: number,
        tableCount: number,
        tableData: string | null,
        hasTables: boolean
    ): Promise<void> {
        await prisma.pageMetric.upsert({
            where: {
                pageId_sessionId: {
                    pageId,
                    sessionId,
                },
            },
            update: {
                tableCount,
                tableData,
                hasTables,
            },
            create: {
                pageId,
                sessionId,
                tableCount,
                tableData,
                hasTables,
            },
        });
    }

    async updateFaqExtraction(
        pageId: number,
        sessionId: number,
        faqCount: number,
        faqData: string | null,
        hasFaqs: boolean,
        faqScore: number,
        faqDetectionMethod: string | null,
        faqSchemaPresent: boolean
    ): Promise<void> {
        await prisma.pageMetric.upsert({
            where: {
                pageId_sessionId: {
                    pageId,
                    sessionId,
                },
            },
            update: {
                faqCount,
                faqData,
                hasFaqs,
                faqScore,
                faqDetectionMethod,
                faqSchemaPresent,
            },
            create: {
                pageId,
                sessionId,
                faqCount,
                faqData,
                hasFaqs,
                faqScore,
                faqDetectionMethod,
                faqSchemaPresent,
            },
        });
    }

    async updateMixedContentDetection(
        pageId: number,
        sessionId: number,
        hasMixedContent: boolean,
        severity: string | null,
        mixedContentData: string | null,
        activeCount: number,
        passiveCount: number,
        totalCount: number
    ): Promise<void> {
        await prisma.pageMetric.upsert({
            where: {
                pageId_sessionId: {
                    pageId,
                    sessionId,
                },
            },
            update: {
                hasMixedContent,
                mixedContentSeverity: severity,
                mixedContentData,
                activeMixedContentCount: activeCount,
                passiveMixedContentCount: passiveCount,
                totalInsecureResources: totalCount,
            },
            create: {
                pageId,
                sessionId,
                hasMixedContent,
                mixedContentSeverity: severity,
                mixedContentData,
                activeMixedContentCount: activeCount,
                passiveMixedContentCount: passiveCount,
                totalInsecureResources: totalCount,
            },
        });
    }

    async updateWordCountAnalysis(
        pageId: number,
        sessionId: number,
        wordCountData: {
            totalWordCount: number;
            visibleWordCount: number;
            uniqueWordCount: number;
            textToHtmlRatio: number;
            sentenceCount: number;
            paragraphCount: number;
            averageSentenceLength: number;
            averageParagraphLength: number;
            keywordDensity: number | null;
            thinContent: boolean;
            thinContentReason: string | null;
            duplicateContent: boolean;
            duplicateWithUrls: string[];
            sectionWordCountMapping: Record<string, number>;
            sectionWordCountBreakdown: Record<string, number>;
            headingWordCountMapping: Record<string, number>;
        }
    ): Promise<void> {
        await prisma.wordcountAnalysis.upsert({
            where: {
                pageId_sessionId: {
                    pageId,
                    sessionId,
                },
            },
            update: {
                totalWordCount: wordCountData.totalWordCount,
                visibleWordCount: wordCountData.visibleWordCount,
                uniqueWordCount: wordCountData.uniqueWordCount,
                textToHtmlRatio: wordCountData.textToHtmlRatio,
                sentenceCount: wordCountData.sentenceCount,
                paragraphCount: wordCountData.paragraphCount,
                averageSentenceLength: wordCountData.averageSentenceLength,
                averageParagraphLength: wordCountData.averageParagraphLength,
                keywordDensity: wordCountData.keywordDensity ?? null,
                thinContent: wordCountData.thinContent,
                thinContentReason: wordCountData.thinContentReason,
                duplicateContent: wordCountData.duplicateContent,
                duplicateWithUrls: wordCountData.duplicateWithUrls.length > 0 
                    ? wordCountData.duplicateWithUrls as any 
                    : null,
                sectionWordCountMapping: Object.keys(wordCountData.sectionWordCountMapping).length > 0 
                    ? wordCountData.sectionWordCountMapping as any 
                    : null,
                sectionWordCountBreakdown: Object.keys(wordCountData.sectionWordCountBreakdown).length > 0 
                    ? wordCountData.sectionWordCountBreakdown as any 
                    : null,
                headingWordCountMapping: Object.keys(wordCountData.headingWordCountMapping).length > 0 
                    ? wordCountData.headingWordCountMapping as any 
                    : null,
            },
            create: {
                pageId,
                sessionId,
                totalWordCount: wordCountData.totalWordCount,
                visibleWordCount: wordCountData.visibleWordCount,
                uniqueWordCount: wordCountData.uniqueWordCount,
                textToHtmlRatio: wordCountData.textToHtmlRatio,
                sentenceCount: wordCountData.sentenceCount,
                paragraphCount: wordCountData.paragraphCount,
                averageSentenceLength: wordCountData.averageSentenceLength,
                averageParagraphLength: wordCountData.averageParagraphLength,
                keywordDensity: wordCountData.keywordDensity ?? null,
                thinContent: wordCountData.thinContent,
                thinContentReason: wordCountData.thinContentReason,
                duplicateContent: wordCountData.duplicateContent,
                duplicateWithUrls: wordCountData.duplicateWithUrls.length > 0 
                    ? wordCountData.duplicateWithUrls as any 
                    : null,
                sectionWordCountMapping: Object.keys(wordCountData.sectionWordCountMapping).length > 0 
                    ? wordCountData.sectionWordCountMapping as any 
                    : null,
                sectionWordCountBreakdown: Object.keys(wordCountData.sectionWordCountBreakdown).length > 0 
                    ? wordCountData.sectionWordCountBreakdown as any 
                    : null,
                headingWordCountMapping: Object.keys(wordCountData.headingWordCountMapping).length > 0 
                    ? wordCountData.headingWordCountMapping as any 
                    : null,
            },
        });
    }

    async getPageById(pageId: number): Promise<{ id: number; url: string; contentHash: string | null; sessionId: number } | null> {
        const page = await prisma.page.findUnique({
            where: { id: pageId },
            select: {
                id: true,
                url: true,
                contentHash: true,
                sessionId: true,
            },
        });

        if (!page) return null;

        return {
            id: page.id,
            url: page.url,
            contentHash: page.contentHash,
            sessionId: page.sessionId,
        };
    }

    async getPagesByContentHash(
        contentHash: string,
        sessionId: number,
        excludePageId?: number
    ): Promise<{ id: number; url: string }[]> {
        const pages = await prisma.page.findMany({
            where: {
                contentHash,
                sessionId,
                ...(excludePageId ? { id: { not: excludePageId } } : {}),
            },
            select: {
                id: true,
                url: true,
            },
        });

        return pages;
    }

    async updateSeoStructureData(
        pageId: number,
        sessionId: number,
        headerStructureData: string | null,
        headerStructureIssues: string | null,
        viewportPresent: boolean | null,
        viewportContent: string | null,
        viewportStatus: string | null,
        structuredDataPresent: boolean | null,
        structuredDataFormat: string | null,
        structuredDataTypes: string | null,
        structuredDataPriorityType: string | null
    ): Promise<void> {
        await prisma.pageMetric.upsert({
            where: {
                pageId_sessionId: {
                    pageId,
                    sessionId,
                },
            },
            update: {
                headerStructureData,
                headerStructureIssues,
                viewportPresent,
                viewportContent,
                viewportStatus,
                structuredDataPresent,
                structuredDataFormat,
                structuredDataTypes,
                structuredDataPriorityType,
            },
            create: {
                pageId,
                sessionId,
                headerStructureData,
                headerStructureIssues,
                viewportPresent,
                viewportContent,
                viewportStatus,
                structuredDataPresent,
                structuredDataFormat,
                structuredDataTypes,
                structuredDataPriorityType,
            },
        });
    }

    async updatePageSizeMeasurements(
        pageId: number,
        sessionId: number,
        pageSizeBytes: number,
        pageSizeStatus: string,
        htmlSizeBytes: number,
        htmlSizeStatus: string,
        totalResourceSizeBytes: number,
        resourceSizeBreakdown: string | null
    ): Promise<void> {
        await prisma.pageMetric.upsert({
            where: {
                pageId_sessionId: {
                    pageId,
                    sessionId,
                },
            },
            update: {
                pageSizeBytes,
                pageSizeStatus,
                htmlSizeBytes,
                htmlSizeStatus,
                totalResourceSizeBytes,
                resourceSizeBreakdown,
            },
            create: {
                pageId,
                sessionId,
                pageSizeBytes,
                pageSizeStatus,
                htmlSizeBytes,
                htmlSizeStatus,
                totalResourceSizeBytes,
                resourceSizeBreakdown,
            },
        });
    }

    async updateMetaDescriptionDetection(pageId: number, sessionId: number, metaDescription: string | null): Promise<void> {
        const { detectMissingMetaDescription, detectDuplicateMetaDescription, buildMetaDescriptionIndex } = await import('../../helpers/module_A/metaDescriptionDetection/metaDescriptionDetectionService.js');

        const allPages = await prisma.page.findMany({
            where: { sessionId },
            select: { url: true, description: true },
        });

        const currentPage = await prisma.page.findUnique({
            where: { id: pageId },
            select: { url: true },
        });

        if (!currentPage) return;

        const descriptionIndex = buildMetaDescriptionIndex(
            allPages.map(p => ({ url: p.url, metaDescription: p.description }))
        );

        const missingStatus = detectMissingMetaDescription(metaDescription);
        const duplicateResult = detectDuplicateMetaDescription(currentPage.url, metaDescription, descriptionIndex);
        const finalStatus = missingStatus === 'Missing' ? 'Missing' : duplicateResult.metaDescriptionStatus;

        await prisma.pageMetric.upsert({
            where: {
                pageId_sessionId: {
                    pageId,
                    sessionId,
                },
            },
            update: {
                metaDescriptionStatus: finalStatus,
                duplicateMetaDescriptionCount: duplicateResult.duplicateMetaDescriptionCount ?? null,
                duplicateMetaDescriptionWith: duplicateResult.duplicateWith && duplicateResult.duplicateWith.length > 0 
                    ? JSON.stringify(duplicateResult.duplicateWith) 
                    : null,
            },
            create: {
                pageId,
                sessionId,
                metaDescriptionStatus: finalStatus,
                duplicateMetaDescriptionCount: duplicateResult.duplicateMetaDescriptionCount ?? null,
                duplicateMetaDescriptionWith: duplicateResult.duplicateWith && duplicateResult.duplicateWith.length > 0 
                    ? JSON.stringify(duplicateResult.duplicateWith) 
                    : null,
            },
        });
    }

    async batchUpdateMetaDescriptionDetection(sessionId: number): Promise<void> {
        const { batchDetectMetaDescriptionIssues } = await import('../../helpers/module_A/metaDescriptionDetection/metaDescriptionDetectionService.js');

        const allPages = await prisma.page.findMany({
            where: { sessionId },
            select: { id: true, url: true, description: true },
        });

        if (allPages.length === 0) return;

        const pages = allPages.map(p => ({ url: p.url, metaDescription: p.description }));
        const results = batchDetectMetaDescriptionIssues(pages);

        const updates = allPages
            .map(page => {
                const result = results.get(page.url);
                if (!result) return null;

                return prisma.pageMetric.upsert({
                    where: {
                        pageId_sessionId: {
                            pageId: page.id,
                            sessionId,
                        },
                    },
                    update: {
                        metaDescriptionStatus: result.metaDescriptionStatus,
                        duplicateMetaDescriptionCount: result.duplicateMetaDescriptionCount ?? null,
                        duplicateMetaDescriptionWith: result.duplicateWith && result.duplicateWith.length > 0 
                            ? JSON.stringify(result.duplicateWith) 
                            : null,
                    },
                    create: {
                        pageId: page.id,
                        sessionId,
                        metaDescriptionStatus: result.metaDescriptionStatus,
                        duplicateMetaDescriptionCount: result.duplicateMetaDescriptionCount ?? null,
                        duplicateMetaDescriptionWith: result.duplicateWith && result.duplicateWith.length > 0 
                            ? JSON.stringify(result.duplicateWith) 
                            : null,
                    },
                });
            })
            .filter((update): update is NonNullable<typeof update> => update !== null);

        if (updates.length > 0) {
            await prisma.$transaction(updates);
        }
    }

    async updateTitleDetection(pageId: number, sessionId: number, title: string | null): Promise<void> {
        const { detectMissingTitle, detectDuplicateTitle, buildTitleIndex } = await import('../../helpers/module_A/titleDetection/titleDetectionService.js');

        const allPages = await prisma.page.findMany({
            where: { sessionId },
            select: { url: true, title: true },
        });

        const currentPage = await prisma.page.findUnique({
            where: { id: pageId },
            select: { url: true },
        });

        if (!currentPage) return;

        const titleIndex = buildTitleIndex(
            allPages.map(p => ({ url: p.url, title: p.title }))
        );

        const missingStatus = detectMissingTitle(title);
        const duplicateResult = detectDuplicateTitle(currentPage.url, title, titleIndex);
        const finalStatus = missingStatus === 'Missing' ? 'Missing' : duplicateResult.titleStatus;

        await prisma.pageMetric.upsert({
            where: {
                pageId_sessionId: {
                    pageId,
                    sessionId,
                },
            },
            update: {
                titleStatus: finalStatus,
                duplicateTitleCount: duplicateResult.duplicateTitleCount ?? null,
                duplicateWith: duplicateResult.duplicateWith && duplicateResult.duplicateWith.length > 0 
                    ? JSON.stringify(duplicateResult.duplicateWith) 
                    : null,
            },
            create: {
                pageId,
                sessionId,
                titleStatus: finalStatus,
                duplicateTitleCount: duplicateResult.duplicateTitleCount ?? null,
                duplicateWith: duplicateResult.duplicateWith && duplicateResult.duplicateWith.length > 0 
                    ? JSON.stringify(duplicateResult.duplicateWith) 
                    : null,
            },
        });
    }

    async batchUpdateTitleDetection(sessionId: number): Promise<void> {
        const { batchDetectTitleIssues } = await import('../../helpers/module_A/titleDetection/titleDetectionService.js');

        const allPages = await prisma.page.findMany({
            where: { sessionId },
            select: { id: true, url: true, title: true },
        });

        if (allPages.length === 0) return;

        const pages = allPages.map(p => ({ url: p.url, title: p.title }));
        const results = batchDetectTitleIssues(pages);

        const updates = allPages
            .map(page => {
                const result = results.get(page.url);
                if (!result) return null;

                return prisma.pageMetric.upsert({
                    where: {
                        pageId_sessionId: {
                            pageId: page.id,
                            sessionId,
                        },
                    },
                    update: {
                        titleStatus: result.titleStatus,
                        duplicateTitleCount: result.duplicateTitleCount ?? null,
                        duplicateWith: result.duplicateWith && result.duplicateWith.length > 0 
                            ? JSON.stringify(result.duplicateWith) 
                            : null,
                    },
                    create: {
                        pageId: page.id,
                        sessionId,
                        titleStatus: result.titleStatus,
                        duplicateTitleCount: result.duplicateTitleCount ?? null,
                        duplicateWith: result.duplicateWith && result.duplicateWith.length > 0 
                            ? JSON.stringify(result.duplicateWith) 
                            : null,
                    },
                });
            })
            .filter((update): update is NonNullable<typeof update> => update !== null);

        if (updates.length > 0) {
            await prisma.$transaction(updates);
        }
    }

    async batchUpdateAllDetections(sessionId: number): Promise<void> {
        const { batchDetectTitleIssues } = await import('../../helpers/module_A/titleDetection/titleDetectionService.js');
        const { batchDetectMetaDescriptionIssues } = await import('../../helpers/module_A/metaDescriptionDetection/metaDescriptionDetectionService.js');

        const allPages = await prisma.page.findMany({
            where: { sessionId },
            select: { id: true, url: true, title: true, description: true },
        });

        if (allPages.length === 0) return;

        const titlePages = allPages.map(p => ({ url: p.url, title: p.title }));
        const titleResults = batchDetectTitleIssues(titlePages);

        const descPages = allPages.map(p => ({ url: p.url, metaDescription: p.description }));
        const descResults = batchDetectMetaDescriptionIssues(descPages);

        const updates = allPages
            .map(page => {
                const titleResult = titleResults.get(page.url);
                const descResult = descResults.get(page.url);

                if (!titleResult && !descResult) return null;

                const updateData: any = {};
                const createData: any = {
                    pageId: page.id,
                    sessionId,
                };

                if (titleResult) {
                    updateData.titleStatus = titleResult.titleStatus;
                    updateData.duplicateTitleCount = titleResult.duplicateTitleCount ?? null;
                    updateData.duplicateWith = titleResult.duplicateWith && titleResult.duplicateWith.length > 0 
                        ? JSON.stringify(titleResult.duplicateWith) 
                        : null;
                    createData.titleStatus = titleResult.titleStatus;
                    createData.duplicateTitleCount = titleResult.duplicateTitleCount ?? null;
                    createData.duplicateWith = titleResult.duplicateWith && titleResult.duplicateWith.length > 0 
                        ? JSON.stringify(titleResult.duplicateWith) 
                        : null;
                } else {
                    createData.titleStatus = null;
                    createData.duplicateTitleCount = null;
                    createData.duplicateWith = null;
                }

                if (descResult) {
                    updateData.metaDescriptionStatus = descResult.metaDescriptionStatus;
                    updateData.duplicateMetaDescriptionCount = descResult.duplicateMetaDescriptionCount ?? null;
                    updateData.duplicateMetaDescriptionWith = descResult.duplicateWith && descResult.duplicateWith.length > 0 
                        ? JSON.stringify(descResult.duplicateWith) 
                        : null;
                    createData.metaDescriptionStatus = descResult.metaDescriptionStatus;
                    createData.duplicateMetaDescriptionCount = descResult.duplicateMetaDescriptionCount ?? null;
                    createData.duplicateMetaDescriptionWith = descResult.duplicateWith && descResult.duplicateWith.length > 0 
                        ? JSON.stringify(descResult.duplicateWith) 
                        : null;
                } else {
                    createData.metaDescriptionStatus = null;
                    createData.duplicateMetaDescriptionCount = null;
                    createData.duplicateMetaDescriptionWith = null;
                }

                return prisma.pageMetric.upsert({
                    where: {
                        pageId_sessionId: {
                            pageId: page.id,
                            sessionId,
                        },
                    },
                    update: updateData,
                    create: createData,
                });
            })
            .filter((update): update is NonNullable<typeof update> => update !== null);

        if (updates.length > 0) {
            await prisma.$transaction(updates);
        }
    }

    async getPages(sessionId?: number, limit: number = 1000, offset: number = 0): Promise<Page[]> {
        // Complex query with joins - use $queryRaw for now
        if (!sessionId) {
            const result = await prisma.$queryRaw<any[]>`
                SELECT p.*, 
                    pm.title_status, pm.duplicate_title_count, pm.duplicate_with,
                    pm.meta_description_status, pm.duplicate_meta_description_count, pm.duplicate_meta_description_with,
                    pm.canonical_validation_status, pm.canonical_validation_message,
                    pm.table_count, pm.table_data, pm.has_tables,
                    pm.faq_count, pm.faq_data, pm.has_faqs, pm.faq_score, pm.faq_detection_method, pm.faq_schema_present,
                    pm.has_mixed_content, pm.mixed_content_severity, pm.mixed_content_data,
                    pm.active_mixed_content_count, pm.passive_mixed_content_count, pm.total_insecure_resources,
                    pm.header_structure_data, pm.header_structure_issues,
                    pm.viewport_present, pm.viewport_content, pm.viewport_status,
                    pm.structured_data_present, pm.structured_data_format, pm.structured_data_types, pm.structured_data_priority_type,
                    pm.page_size_bytes, pm.page_size_status, pm.html_size_bytes, pm.html_size_status, 
                    pm.total_resource_size_bytes, pm.resource_size_breakdown,
                    wc.total_word_count, wc.visible_word_count, wc.unique_word_count, wc.text_to_html_ratio,
                    wc.sentence_count, wc.paragraph_count,
                    wc.average_sentence_length, wc.average_paragraph_length, wc.keyword_density,
                    wc.thin_content, wc.thin_content_reason,
                    wc.duplicate_content, wc.duplicate_with_urls,
                    wc.section_word_count_mapping, wc.section_word_count_breakdown, wc.heading_word_count_mapping
                FROM pages p
                LEFT JOIN page_metrics pm ON p.id = pm.page_id AND p.session_id = pm.session_id
                LEFT JOIN wordcount_analysis wc ON p.id = wc.page_id AND p.session_id = wc.session_id
                ORDER BY p.timestamp DESC 
                LIMIT ${limit} OFFSET ${offset}
            `;
            return result.map((row: any) => this.mapPage(row));
        }

        // With sessionId - complex query with CTEs and multiple joins
        const result = await prisma.$queryRaw<any[]>`
            WITH total_unique_inlinks AS (
                SELECT SUM(unique_count) as total
                FROM (
                    SELECT COUNT(DISTINCT source_page_id) as unique_count
                    FROM links
                    WHERE session_id = ${sessionId}
                    GROUP BY target_page_id
                ) sub
            )
            SELECT 
                p.*,
                COALESCE(unique_in_links.count, 0) as "uniqueInlinks",
                COALESCE(unique_js_in_links.count, 0) as "uniqueJsInlinks",
                COALESCE(unique_out_links.count, 0) as "uniqueOutlinks",
                COALESCE(unique_js_out_links.count, 0) as "uniqueJsOutlinks",
                COALESCE(unique_external_out_links.count, 0) as "uniqueExternalOutlinks",
                COALESCE(unique_external_js_out_links.count, 0) as "uniqueExternalJsOutlinks",
                CASE 
                    WHEN total_unique_inlinks.total > 0 AND unique_in_links.count > 0 
                    THEN ROUND((unique_in_links.count::numeric / total_unique_inlinks.total::numeric * 100), 2)
                    ELSE 0 
                END as "percentOfTotal",
                pm.title_status,
                pm.duplicate_title_count,
                pm.duplicate_with,
                pm.meta_description_status,
                pm.duplicate_meta_description_count,
                pm.duplicate_meta_description_with,
                pm.canonical_validation_status,
                pm.canonical_validation_message,
                pm.table_count,
                pm.table_data,
                pm.has_tables,
                pm.faq_count,
                pm.faq_data,
                pm.has_faqs,
                pm.faq_score,
                pm.faq_detection_method,
                pm.faq_schema_present,
                pm.has_mixed_content,
                pm.mixed_content_severity,
                pm.mixed_content_data,
                pm.active_mixed_content_count,
                pm.passive_mixed_content_count,
                pm.total_insecure_resources,
                pm.header_structure_data,
                pm.header_structure_issues,
                pm.viewport_present,
                pm.viewport_content,
                pm.viewport_status,
                pm.structured_data_present,
                pm.structured_data_format,
                pm.structured_data_types,
                pm.structured_data_priority_type,
                pm.page_size_bytes,
                pm.page_size_status,
                pm.html_size_bytes,
                pm.html_size_status,
                pm.total_resource_size_bytes,
                pm.resource_size_breakdown,
                wc.total_word_count, wc.visible_word_count, wc.unique_word_count, wc.text_to_html_ratio,
                wc.sentence_count, wc.paragraph_count,
                wc.average_sentence_length, wc.average_paragraph_length, wc.keyword_density,
                wc.thin_content, wc.thin_content_reason,
                wc.duplicate_content, wc.duplicate_with_urls,
                wc.section_word_count_mapping, wc.section_word_count_breakdown, wc.heading_word_count_mapping
            FROM pages p
            CROSS JOIN total_unique_inlinks
            LEFT JOIN page_metrics pm ON p.id = pm.page_id AND p.session_id = pm.session_id
            LEFT JOIN wordcount_analysis wc ON p.id = wc.page_id AND p.session_id = wc.session_id
            LEFT JOIN (
                SELECT target_page_id, COUNT(DISTINCT source_page_id) as count
                FROM links
                WHERE session_id = ${sessionId}
                GROUP BY target_page_id
            ) unique_in_links ON p.id = unique_in_links.target_page_id
            LEFT JOIN (
                SELECT target_page_id, COUNT(DISTINCT source_page_id) as count
                FROM links
                WHERE session_id = ${sessionId} AND is_js_rendered = TRUE
                GROUP BY target_page_id
            ) unique_js_in_links ON p.id = unique_js_in_links.target_page_id
            LEFT JOIN (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = ${sessionId}
                GROUP BY source_page_id
            ) unique_out_links ON p.id = unique_out_links.source_page_id
            LEFT JOIN (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = ${sessionId} AND is_js_rendered = TRUE
                GROUP BY source_page_id
            ) unique_js_out_links ON p.id = unique_js_out_links.source_page_id
            LEFT JOIN (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = ${sessionId} AND is_internal = FALSE
                GROUP BY source_page_id
            ) unique_external_out_links ON p.id = unique_external_out_links.source_page_id
            LEFT JOIN (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = ${sessionId} AND is_internal = FALSE AND is_js_rendered = TRUE
                GROUP BY source_page_id
            ) unique_external_js_out_links ON p.id = unique_external_js_out_links.source_page_id
            WHERE p.session_id = ${sessionId}
            ORDER BY p.timestamp DESC 
            LIMIT ${limit} OFFSET ${offset}
        `;

        return result.map((row: any) => ({
            ...this.mapPage(row),
            uniqueInlinks: parseInt(row.uniqueInlinks) || 0,
            uniqueJsInlinks: parseInt(row.uniqueJsInlinks) || 0,
            percentOfTotal: parseFloat(row.percentOfTotal) || 0,
            uniqueOutlinks: parseInt(row.uniqueOutlinks) || 0,
            uniqueJsOutlinks: parseInt(row.uniqueJsOutlinks) || 0,
            uniqueExternalOutlinks: parseInt(row.uniqueExternalOutlinks) || 0,
            uniqueExternalJsOutlinks: parseInt(row.uniqueExternalJsOutlinks) || 0,
        }));
    }

    async getResources(sessionId?: number, resourceType?: string, limit: number = 1000, offset: number = 0): Promise<Resource[]> {
        const where: any = {};
        if (sessionId) {
            where.sessionId = sessionId;
        }
        if (resourceType) {
            where.resourceType = resourceType;
        }

        const resources = await prisma.resource.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: limit,
            skip: offset,
        });

        return resources.map((r: any) => this.mapResource(r));
    }

    async insertLinks(links: any[]): Promise<void> {
        if (links.length === 0) return;

        await prisma.$transaction(
            links.map(link =>
                prisma.link.create({
                    data: {
                        sessionId: link.sessionId,
                        sourcePageId: link.sourcePageId,
                        sourceUrl: link.sourceUrl,
                        targetUrl: link.targetUrl,
                        targetPageId: link.targetPageId || null,
                        isInternal: link.isInternal,
                        anchorText: link.anchorText || null,
                        xpath: link.xpath || null,
                        position: link.position || null,
                        rel: link.rel || null,
                        nofollow: link.nofollow || false,
                        isJsRendered: link.isJsRendered || false,
                    },
                })
            )
        );
    }

    async updatePageExternalOutlinks(pageId: number, sessionId: number): Promise<void> {
        // Use raw query for complex UPDATE with subqueries
        await prisma.$executeRaw`
            UPDATE pages 
            SET 
                unique_external_outlinks = (
                    SELECT COUNT(DISTINCT target_url)
                    FROM links
                    WHERE source_page_id = ${pageId} 
                      AND session_id = ${sessionId} 
                      AND is_internal = FALSE
                      AND (is_js_rendered IS NULL OR is_js_rendered = FALSE)
                ),
                unique_external_js_outlinks = (
                    SELECT COUNT(DISTINCT target_url)
                    FROM links
                    WHERE source_page_id = ${pageId} 
                      AND session_id = ${sessionId} 
                      AND is_internal = FALSE
                      AND is_js_rendered = TRUE
                )
            WHERE id = ${pageId}
        `;
    }

    async updateAllPagesExternalOutlinks(sessionId: number): Promise<void> {
        await prisma.$executeRaw`
            UPDATE pages p
            SET 
                unique_external_outlinks = COALESCE(external_links.count, 0),
                unique_external_js_outlinks = COALESCE(external_js_links.count, 0)
            FROM (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = ${sessionId} 
                  AND is_internal = FALSE
                  AND (is_js_rendered IS NULL OR is_js_rendered = FALSE)
                GROUP BY source_page_id
            ) external_links
            FULL OUTER JOIN (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = ${sessionId} 
                  AND is_internal = FALSE
                  AND is_js_rendered = TRUE
                GROUP BY source_page_id
            ) external_js_links ON external_links.source_page_id = external_js_links.source_page_id
            WHERE p.id = COALESCE(external_links.source_page_id, external_js_links.source_page_id)
              AND p.session_id = ${sessionId}
        `;
    }

    async getPageCount(sessionId?: number): Promise<number> {
        const where = sessionId ? { sessionId } : {};
        return await prisma.page.count({ where });
    }

    async getResourceCount(sessionId?: number): Promise<number> {
        const where = sessionId ? { sessionId } : {};
        return await prisma.resource.count({ where });
    }

    async getResourceTypeStats(sessionId?: number): Promise<any[]> {
        const where = sessionId ? { sessionId } : {};
        const stats = await prisma.resource.groupBy({
            by: ['resourceType'],
            where,
            _count: {
                id: true,
            },
        });

        return stats.map((stat: any) => ({
            type: stat.resourceType,
            count: stat._count.id,
        }));
    }

    async getLinkAnalysis(sessionId?: number): Promise<any[]> {
        // Complex query with subqueries - use $queryRaw
        const result = await prisma.$queryRaw<any[]>`
            SELECT 
                p.id, 
                p.url, 
                p.title,
                (SELECT COUNT(*) FROM links l WHERE l.target_page_id = p.id ${sessionId ? Prisma.sql`AND l.session_id = ${sessionId}` : Prisma.empty}) as inlinks,
                (SELECT COUNT(*) FROM links l WHERE l.source_page_id = p.id ${sessionId ? Prisma.sql`AND l.session_id = ${sessionId}` : Prisma.empty}) as outlinks
            FROM pages p
            ${sessionId ? Prisma.sql`WHERE p.session_id = ${sessionId}` : Prisma.empty}
            ORDER BY inlinks DESC
        `;
        return result;
    }

    async getAllLinksForSession(sessionId: number): Promise<any[]> {
        const links = await prisma.link.findMany({
            where: { sessionId },
            include: {
                sourcePage: {
                    select: {
                        url: true,
                        title: true,
                    },
                },
                targetPage: {
                    select: {
                        url: true,
                        title: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return links.map(link => ({
            ...link,
            source_url: link.sourcePage?.url || link.sourceUrl,
            source_title: link.sourcePage?.title,
            target_url: link.targetPage?.url || link.targetUrl,
            target_title: link.targetPage?.title,
        }));
    }

    async getLinksByPage(pageId: number, type: 'in' | 'out' | 'all' = 'out', limit: number = 100): Promise<any[]> {
        let where: any = {};
        let include: any = {
            sourcePage: {
                select: {
                    url: true,
                    title: true,
                },
            },
            targetPage: {
                select: {
                    url: true,
                    title: true,
                },
            },
        };

        if (type === 'out') {
            where.sourcePageId = pageId;
        } else if (type === 'in') {
            where.targetPageId = pageId;
        } else {
            where.OR = [
                { sourcePageId: pageId },
                { targetPageId: pageId },
            ];
        }

        const links = await prisma.link.findMany({
            where,
            include,
            take: limit,
        });

        return links.map((link: any) => ({
            id: link.id,
            sessionId: link.sessionId,
            sourcePageId: link.sourcePageId,
            sourceUrl: link.sourcePage?.url || link.sourceUrl,
            targetUrl: link.targetPage?.url || link.targetUrl,
            targetPageId: link.targetPageId,
            isInternal: link.isInternal,
            anchorText: link.anchorText,
            xpath: link.xpath,
            position: link.position,
            rel: link.rel,
            nofollow: link.nofollow,
            createdAt: link.createdAt,
            targetTitle: link.targetPage?.title,
            sourceTitle: link.sourcePage?.title,
        }));
    }

    async getLinkStats(sessionId: number): Promise<any> {
        const [total, internal, external, nofollow, positionStats] = await Promise.all([
            prisma.link.count({ where: { sessionId } }),
            prisma.link.count({ where: { sessionId, isInternal: true } }),
            prisma.link.count({ where: { sessionId, isInternal: false } }),
            prisma.link.count({ where: { sessionId, nofollow: true } }),
            prisma.link.groupBy({
                by: ['position'],
                where: {
                    sessionId,
                    position: { not: null },
                },
                _count: {
                    id: true,
                },
            }),
        ]);

        const linksByPosition: Record<string, number> = {};
        positionStats.forEach((stat: any) => {
            if (stat.position) {
                linksByPosition[stat.position] = stat._count.id;
            }
        });

        return {
            totalLinks: total,
            internalLinks: internal,
            externalLinks: external,
            nofollowLinks: nofollow,
            linksByPosition,
        };
    }

    async getPageLinkStats(sessionId: number): Promise<any[]> {
        // Complex query with CTEs - use $queryRaw
        const result = await prisma.$queryRaw<any[]>`
            WITH total_unique_inlinks AS (
                SELECT SUM(unique_count) as total
                FROM (
                    SELECT COUNT(DISTINCT source_page_id) as unique_count
                    FROM links
                    WHERE session_id = ${sessionId}
                    GROUP BY target_page_id
                ) sub
            )
            SELECT 
                p.id as "pageId", 
                p.url, 
                p.title,
                COALESCE(out_links.count, 0) as "outlinksCount",
                COALESCE(unique_out_links.count, 0) as "uniqueOutlinksCount",
                COALESCE(in_links.count, 0) as "inlinksCount",
                COALESCE(unique_in_links.count, 0) as "uniqueInlinksCount",
                COALESCE(unique_js_in_links.count, 0) as "uniqueJsInlinksCount",
                CASE 
                    WHEN total_unique_inlinks.total > 0 AND unique_in_links.count > 0 
                    THEN ROUND((unique_in_links.count::numeric / total_unique_inlinks.total::numeric * 100), 2)
                    ELSE 0 
                END as "percentOfTotal"
            FROM pages p
            CROSS JOIN total_unique_inlinks
            LEFT JOIN (
                SELECT source_page_id, COUNT(*) as count
                FROM links
                WHERE session_id = ${sessionId}
                GROUP BY source_page_id
            ) out_links ON p.id = out_links.source_page_id
            LEFT JOIN (
                SELECT source_page_id, COUNT(DISTINCT target_url) as count
                FROM links
                WHERE session_id = ${sessionId}
                GROUP BY source_page_id
            ) unique_out_links ON p.id = unique_out_links.source_page_id
            LEFT JOIN (
                SELECT target_page_id, COUNT(*) as count
                FROM links
                WHERE session_id = ${sessionId}
                GROUP BY target_page_id
            ) in_links ON p.id = in_links.target_page_id
            LEFT JOIN (
                SELECT target_page_id, COUNT(DISTINCT source_page_id) as count
                FROM links
                WHERE session_id = ${sessionId}
                GROUP BY target_page_id
            ) unique_in_links ON p.id = unique_in_links.target_page_id
            LEFT JOIN (
                SELECT target_page_id, COUNT(DISTINCT source_page_id) as count
                FROM links
                WHERE session_id = ${sessionId} AND is_js_rendered = TRUE
                GROUP BY target_page_id
            ) unique_js_in_links ON p.id = unique_js_in_links.target_page_id
            WHERE p.session_id = ${sessionId}
            ORDER BY "inlinksCount" DESC
            LIMIT 100
        `;

        return result.map((row: any) => ({
            ...row,
            outlinksCount: parseInt(row.outlinksCount) || 0,
            uniqueOutlinksCount: parseInt(row.uniqueOutlinksCount) || 0,
            inlinksCount: parseInt(row.inlinksCount) || 0,
            uniqueInlinksCount: parseInt(row.uniqueInlinksCount) || 0,
            uniqueJsInlinksCount: parseInt(row.uniqueJsInlinksCount) || 0,
            percentOfTotal: parseFloat(row.percentOfTotal) || 0,
        }));
    }

    async getLinkRelationships(sessionId: number, limit: number = 50): Promise<any[]> {
        // Complex query with aggregation - use $queryRaw
        const result = await prisma.$queryRaw<any[]>`
            SELECT 
                l.source_page_id as "sourcePageId",
                sp.url as "sourceUrl",
                sp.title as "sourceTitle",
                l.target_page_id as "targetPageId",
                tp.url as "targetUrl",
                tp.title as "targetTitle",
                COUNT(*) as "linkCount",
                ARRAY_AGG(DISTINCT l.anchor_text) as "anchorTexts"
            FROM links l
            JOIN pages sp ON l.source_page_id = sp.id
            JOIN pages tp ON l.target_page_id = tp.id
            WHERE l.session_id = ${sessionId}
            GROUP BY l.source_page_id, sp.url, sp.title, l.target_page_id, tp.url, tp.title
            ORDER BY "linkCount" DESC
            LIMIT ${limit}
        `;
        return result;
    }

    async getUniqueInlinks(pageId: number, limit: number = 100): Promise<any[]> {
        const result = await prisma.$queryRaw<any[]>`
            SELECT DISTINCT
                l.source_page_id as "sourcePageId",
                p.url as "sourceUrl",
                p.title as "sourceTitle",
                COUNT(*) as "linkCount",
                ARRAY_AGG(DISTINCT l.anchor_text) FILTER (WHERE l.anchor_text IS NOT NULL) as "anchorTexts"
            FROM links l
            JOIN pages p ON l.source_page_id = p.id
            WHERE l.target_page_id = ${pageId}
            GROUP BY l.source_page_id, p.url, p.title
            ORDER BY "linkCount" DESC
            LIMIT ${limit}
        `;
        return result;
    }

    async getUniqueJsInlinks(pageId: number, limit: number = 100): Promise<any[]> {
        const result = await prisma.$queryRaw<any[]>`
            SELECT DISTINCT
                l.source_page_id as "sourcePageId",
                p.url as "sourceUrl",
                p.title as "sourceTitle",
                COUNT(*) as "linkCount",
                ARRAY_AGG(DISTINCT l.anchor_text) FILTER (WHERE l.anchor_text IS NOT NULL) as "anchorTexts"
            FROM links l
            JOIN pages p ON l.source_page_id = p.id
            WHERE l.target_page_id = ${pageId} AND l.is_js_rendered = TRUE
            GROUP BY l.source_page_id, p.url, p.title
            ORDER BY "linkCount" DESC
            LIMIT ${limit}
        `;
        return result;
    }

    async getSeoData(url: string): Promise<any | null> {
        const cache = await prisma.seoCache.findUnique({
            where: { url },
        });

        if (!cache) return null;

        const isExpired = new Date() > cache.expiresAt;

        return {
            url: cache.url,
            parentText: cache.parentText,
            keywords: JSON.parse(cache.keywords || '[]'),
            language: cache.language,
            createdAt: cache.createdAt,
            updatedAt: cache.updatedAt,
            expiresAt: cache.expiresAt,
            isExpired,
        };
    }

    async saveSeoData(data: { url: string, parentText?: string, keywords: any[], language?: string, expiresAt: string }): Promise<void> {
        await prisma.seoCache.upsert({
            where: { url: data.url },
            update: {
                parentText: data.parentText || null,
                keywords: JSON.stringify(data.keywords),
                language: data.language || null,
                expiresAt: new Date(data.expiresAt),
            },
            create: {
                url: data.url,
                parentText: data.parentText || null,
                keywords: JSON.stringify(data.keywords),
                language: data.language || null,
                expiresAt: new Date(data.expiresAt),
            },
        });
    }

    async insertSitemapDiscovery(data: { sessionId: number, sitemapUrl: string, discoveredUrls: number, lastModified: string, success: boolean, errorMessage?: string }): Promise<number> {
        const discovery = await prisma.sitemapDiscovery.create({
            data: {
                sessionId: data.sessionId,
                sitemapUrl: data.sitemapUrl,
                discoveredUrls: data.discoveredUrls,
                lastModified: data.lastModified,
                success: data.success,
                errorMessage: data.errorMessage || null,
            },
        });
        return discovery.id;
    }

    async insertSitemapUrl(data: { sessionId: number, url: string, lastModified?: string, changeFrequency?: string, priority?: string }): Promise<void> {
        await prisma.sitemapUrl.createMany({
            data: [{
                sessionId: data.sessionId,
                url: data.url,
                lastModified: data.lastModified || null,
                changeFrequency: data.changeFrequency || null,
                priority: data.priority || null,
            }],
            skipDuplicates: true,
        });
    }

    async getSitemapUrls(sessionId: number): Promise<any[]> {
        const urls = await prisma.sitemapUrl.findMany({
            where: { sessionId },
        });
        return urls;
    }

    async getSitemapDiscoveries(sessionId: number): Promise<any[]> {
        const discoveries = await prisma.sitemapDiscovery.findMany({
            where: { sessionId },
        });
        return discoveries;
    }

    async getUncrawledSitemapUrls(sessionId: number): Promise<any[]> {
        const urls = await prisma.sitemapUrl.findMany({
            where: {
                sessionId,
                crawled: false,
            },
            select: {
                url: true,
            },
        });
        return urls.map(u => ({ url: u.url }));
    }

    async markSitemapUrlAsCrawled(sessionId: number, url: string): Promise<void> {
        await prisma.sitemapUrl.updateMany({
            where: {
                sessionId,
                url,
            },
            data: {
                crawled: true,
            },
        });
    }

    async resolveTargetPageIds(sessionId: number): Promise<number> {
        // Complex UPDATE with JOIN - use $executeRaw
        const result = await prisma.$executeRaw`
            UPDATE links l
            SET target_page_id = p.id
            FROM pages p
            WHERE l.session_id = ${sessionId} 
            AND p.session_id = ${sessionId}
            AND l.target_url = p.url
            AND l.target_page_id IS NULL
        `;
        return Number(result);
    }

    async updatePageLinkScore(pageId: number, linkScore: number): Promise<void> {
        await prisma.page.update({
            where: { id: pageId },
            data: {
                linkScore: linkScore,
            },
        });
    }

    async updatePageLinkScores(scores: Map<number, number>): Promise<void> {
        if (scores.size === 0) return;

        await prisma.$transaction(
            Array.from(scores.entries()).map(([pageId, score]) =>
                prisma.page.update({
                    where: { id: pageId },
                    data: {
                        linkScore: score,
                    },
                })
            )
        );
    }

    async getPageLinkData(sessionId: number): Promise<any[]> {
        // Complex query with JSON aggregation - use $queryRaw
        const result = await prisma.$queryRaw<any[]>`
            SELECT 
                p.id as "pageId",
                p.url,
                p.crawl_depth as "crawlDepth",
                p.link_score as "currentLinkScore",
                COALESCE(
                    json_agg(
                        json_build_object(
                            'sourcePageId', l.source_page_id,
                            'targetPageId', l.target_page_id,
                            'position', l.position,
                            'sourcePageScore', sp.link_score,
                            'sourceCrawlDepth', sp.crawl_depth
                        )
                    ) FILTER (WHERE l.id IS NOT NULL),
                    '[]'
                ) as "inlinks"
            FROM pages p
            LEFT JOIN links l ON l.target_page_id = p.id AND l.session_id = ${sessionId} AND l.is_internal = TRUE
            LEFT JOIN pages sp ON l.source_page_id = sp.id
            WHERE p.session_id = ${sessionId}
            GROUP BY p.id, p.url, p.crawl_depth, p.link_score
        `;
        return result.map((row: any) => ({
            pageId: row.pageId,
            url: row.url,
            crawlDepth: row.crawlDepth || 0,
            currentLinkScore: row.currentLinkScore,
            inlinks: typeof row.inlinks === 'string' ? JSON.parse(row.inlinks) : row.inlinks,
        }));
    }

    async getLinkScoreStats(sessionId: number): Promise<any> {
        const result = await prisma.$queryRaw<any[]>`
            SELECT 
                COUNT(*) FILTER (WHERE link_score >= 80) as "excellentCount",
                COUNT(*) FILTER (WHERE link_score >= 60 AND link_score < 80) as "goodCount",
                COUNT(*) FILTER (WHERE link_score >= 40 AND link_score < 60) as "fairCount",
                COUNT(*) FILTER (WHERE link_score >= 20 AND link_score < 40) as "weakCount",
                COUNT(*) FILTER (WHERE link_score < 20 AND link_score IS NOT NULL) as "veryWeakCount",
                COUNT(*) FILTER (WHERE link_score IS NULL) as "notCalculatedCount",
                ROUND(AVG(link_score)::numeric, 2) as "averageLinkScore",
                MAX(link_score) as "maxLinkScore",
                MIN(link_score) as "minLinkScore"
            FROM pages
            WHERE session_id = ${sessionId}
        `;
        return result[0];
    }

    async getPagesWithLinkScores(sessionId: number, limit: number, offset: number, sortField: string = 'link_score', sortOrder: string = 'DESC'): Promise<any[]> {
        const validSortFields = ['link_score', 'url', 'title', 'crawl_depth'];
        const dbSortField = validSortFields.includes(sortField) ? sortField : 'link_score';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Dynamic sorting requires raw query
        const result = await prisma.$queryRaw<any[]>`
            SELECT 
                id as "pageId",
                url,
                title,
                crawl_depth as "crawlDepth",
                link_score as "linkScore",
                (SELECT COUNT(*) FROM links WHERE target_page_id = pages.id AND is_internal = TRUE) as "inlinkCount"
            FROM pages
            WHERE session_id = ${sessionId} AND link_score IS NOT NULL
            ORDER BY ${Prisma.raw(dbSortField)} ${Prisma.raw(order)} NULLS LAST
            LIMIT ${limit} OFFSET ${offset}
        `;
        return result;
    }

    async countPagesWithLinkScores(sessionId: number): Promise<number> {
        return await prisma.page.count({
            where: {
                sessionId,
                linkScore: { not: null },
            },
        });
    }

    async getLinkScoreDistribution(sessionId: number): Promise<any[]> {
        const result = await prisma.$queryRaw<any[]>`
            SELECT 
                CASE 
                    WHEN link_score >= 80 THEN 'Excellent (80-100)'
                    WHEN link_score >= 60 THEN 'Good (60-79)'
                    WHEN link_score >= 40 THEN 'Fair (40-59)'
                    WHEN link_score >= 20 THEN 'Weak (20-39)'
                    ELSE 'Very Weak (0-19)'
                END as category,
                COUNT(*) as count
            FROM pages
            WHERE session_id = ${sessionId} AND link_score IS NOT NULL
            GROUP BY category
            ORDER BY MIN(link_score) DESC
        `;
        return result;
    }

    async getPageWithLinkScore(pageId: number): Promise<any | null> {
        const page = await prisma.page.findUnique({
            where: { id: pageId },
            select: {
                id: true,
                sessionId: true,
                url: true,
                title: true,
                crawlDepth: true,
                linkScore: true,
            },
        });

        if (!page) return null;

        return {
            pageId: page.id,
            sessionId: page.sessionId,
            url: page.url,
            title: page.title,
            crawlDepth: page.crawlDepth,
            linkScore: page.linkScore,
        };
    }

    async getTopPagesByLinkScore(sessionId: number, limit: number): Promise<any[]> {
        const result = await prisma.$queryRaw<any[]>`
            SELECT 
                id as "pageId",
                url,
                title,
                crawl_depth as "crawlDepth",
                link_score as "linkScore",
                (SELECT COUNT(*) FROM links WHERE target_page_id = pages.id AND is_internal = TRUE) as "inlinkCount"
            FROM pages
            WHERE session_id = ${sessionId} AND link_score IS NOT NULL
            ORDER BY link_score DESC
            LIMIT ${limit}
        `;
        return result;
    }

    async getBottomPagesByLinkScore(sessionId: number, limit: number): Promise<any[]> {
        const result = await prisma.$queryRaw<any[]>`
            SELECT 
                id as "pageId",
                url,
                title,
                crawl_depth as "crawlDepth",
                link_score as "linkScore",
                (SELECT COUNT(*) FROM links WHERE target_page_id = pages.id AND is_internal = TRUE) as "inlinkCount"
            FROM pages
            WHERE session_id = ${sessionId} AND link_score IS NOT NULL
            ORDER BY link_score ASC
            LIMIT ${limit}
        `;
        return result;
    }

    async getPagesWithContent(sessionId: number): Promise<any[]> {
        // Note: raw_html_content and html_content columns don't exist in schema
        // This method may need adjustment based on actual schema
        const pages = await prisma.page.findMany({
            where: {
                sessionId,
                success: true,
            },
            select: {
                id: true,
                url: true,
                title: true,
            },
            orderBy: { timestamp: 'asc' },
        });

        return pages.map(p => ({
            id: p.id,
            url: p.url,
            title: p.title,
            html_content: '', // Column doesn't exist in schema
        }));
    }

    async getAllPagesForSession(sessionId: number): Promise<any[]> {
        const pages = await prisma.page.findMany({
            where: {
                sessionId,
                success: true,
            },
            select: {
                id: true,
                url: true,
                title: true,
                description: true,
                wordCount: true,
                crawlDepth: true,
            },
            orderBy: [
                { crawlDepth: 'asc' },
                { timestamp: 'asc' },
            ],
        });

        return pages;
    }

    private mapPage(row: any): Page {
        return {
            id: row.id,
            sessionId: row.session_id || row.sessionId,
            url: row.url,
            title: row.title,
            titleLength: row.title_length || row.titleLength || 0,
            titlePixelWidth: row.title_pixel_width || row.titlePixelWidth,
            description: row.description,
            descriptionLength: row.description_length || row.descriptionLength || 0,
            descriptionPixelWidth: row.description_pixel_width || row.descriptionPixelWidth,
            contentType: row.content_type || row.contentType,
            lastModified: row.last_modified || row.lastModified,
            statusCode: row.status_code || row.statusCode,
            responseTime: row.response_time || row.responseTime,
            wordCount: row.word_count || row.wordCount || 0,
            averageWordsPerSentence: row.average_words_per_sentence || row.averageWordsPerSentence 
                ? parseFloat(row.average_words_per_sentence?.toString() || row.averageWordsPerSentence?.toString() || '0') 
                : undefined,
            fleschReadingEase: row.flesch_reading_ease_score || row.fleschReadingEase 
                ? parseFloat(row.flesch_reading_ease_score?.toString() || row.fleschReadingEase?.toString() || '0') 
                : undefined,
            readabilityLevel: row.readability_level || row.readabilityLevel,
            crawlDepth: row.crawl_depth !== undefined && row.crawl_depth !== null 
                ? parseInt(row.crawl_depth.toString()) 
                : row.crawlDepth,
            folderDepth: row.folder_depth !== undefined && row.folder_depth !== null 
                ? parseInt(row.folder_depth.toString()) 
                : row.folderDepth,
            sizeBytes: row.size_bytes || row.sizeBytes,
            timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
            success: row.success,
            errorMessage: row.error_message || row.errorMessage,
            indexable: row.indexable,
            indexabilityStatus: row.indexability_status || row.indexabilityStatus,
            metaKeywords: row.meta_keywords || row.metaKeywords,
            metaKeywordsLength: row.meta_keywords_length || row.metaKeywordsLength,
            metaRobots: row.meta_robots || row.metaRobots,
            xRobotsTag: row.x_robots_tag || row.xRobotsTag,
            metaRefresh: row.meta_refresh || row.metaRefresh,
            canonicalUrl: row.canonical_url || row.canonicalUrl,
            relNext: row.rel_next || row.relNext,
            relPrev: row.rel_prev || row.relPrev,
            httpRelNext: row.http_rel_next || row.httpRelNext,
            httpRelPrev: row.http_rel_prev || row.httpRelPrev,
            amphtmlUrl: row.amphtml_url || row.amphtmlUrl,
            mobileAlternateUrl: row.mobile_alternate_url || row.mobileAlternateUrl,
            transferredBytes: row.transferred_bytes ? parseInt(row.transferred_bytes.toString()) : row.transferredBytes,
            totalTransferredBytes: row.total_transferred_bytes ? parseInt(row.total_transferred_bytes.toString()) : row.totalTransferredBytes,
            co2Mg: row.co2_mg ? parseFloat(row.co2_mg.toString()) : row.co2Mg,
            carbonRating: row.carbon_rating || row.carbonRating,
            headingTags: row.heading_tags || row.headingTags,
            linkScore: row.link_score ? parseFloat(row.link_score.toString()) : row.linkScore,
            closestDuplicateUrl: row.closest_duplicate_url || row.closestDuplicateUrl,
            closestDuplicateSimilarity: row.closest_duplicate_similarity !== null && row.closest_duplicate_similarity !== undefined
                ? parseFloat(row.closest_duplicate_similarity.toString())
                : row.closestDuplicateSimilarity,
            nearDuplicateCount: row.near_duplicate_count !== null && row.near_duplicate_count !== undefined
                ? parseInt(row.near_duplicate_count.toString())
                : row.nearDuplicateCount,
            spellingErrors: row.spelling_errors !== null && row.spelling_errors !== undefined
                ? parseInt(row.spelling_errors.toString())
                : row.spellingErrors,
            grammarErrors: row.grammar_errors !== null && row.grammar_errors !== undefined
                ? parseInt(row.grammar_errors.toString())
                : row.grammarErrors,
            redirectUrl: row.redirect_url || row.redirectUrl,
            redirectType: row.redirect_type || row.redirectType,
            cookies: row.cookies,
            language: row.language,
            httpVersion: row.http_version || row.httpVersion,
            closestSemanticallySimilarAddress: row.closest_semantically_similar_address || row.closestSemanticallySimilarAddress,
            semanticSimilarityScore: row.semantic_similarity_score !== null && row.semantic_similarity_score !== undefined
                ? parseFloat(row.semantic_similarity_score.toString())
                : row.semanticSimilarityScore,
            noSemanticallySimilar: row.no_semantically_similar !== null && row.no_semantically_similar !== undefined
                ? parseInt(row.no_semantically_similar.toString())
                : row.noSemanticallySimilar,
            semanticRelevanceScore: row.semantic_relevance_score !== null && row.semantic_relevance_score !== undefined
                ? parseFloat(row.semantic_relevance_score.toString())
                : row.semanticRelevanceScore,
            urlEncodedAddress: row.url_encoded_address || row.urlEncodedAddress,
            contentHash: row.content_hash || row.contentHash,
            titleStatus: row.title_status || row.titleStatus,
            duplicateTitleCount: row.duplicate_title_count !== null && row.duplicate_title_count !== undefined
                ? parseInt(row.duplicate_title_count.toString())
                : row.duplicateTitleCount,
            duplicateWith: row.duplicate_with 
                ? (typeof row.duplicate_with === 'string' ? JSON.parse(row.duplicate_with) : row.duplicate_with) 
                : row.duplicateWith,
            metaDescriptionStatus: row.meta_description_status || row.metaDescriptionStatus,
            duplicateMetaDescriptionCount: row.duplicate_meta_description_count !== null && row.duplicate_meta_description_count !== undefined
                ? parseInt(row.duplicate_meta_description_count.toString())
                : row.duplicateMetaDescriptionCount,
            duplicateMetaDescriptionWith: row.duplicate_meta_description_with 
                ? (typeof row.duplicate_meta_description_with === 'string' ? JSON.parse(row.duplicate_meta_description_with) : row.duplicate_meta_description_with) 
                : row.duplicateMetaDescriptionWith,
            canonicalValidationStatus: row.canonical_validation_status || row.canonicalValidationStatus,
            canonicalValidationMessage: row.canonical_validation_message || row.canonicalValidationMessage,
            tableCount: row.table_count !== null && row.table_count !== undefined
                ? parseInt(row.table_count.toString())
                : row.tableCount,
            tableData: row.table_data || row.tableData,
            hasTables: row.has_tables !== null && row.has_tables !== undefined
                ? Boolean(row.has_tables)
                : row.hasTables,
            faqCount: row.faq_count !== null && row.faq_count !== undefined
                ? parseInt(row.faq_count.toString())
                : row.faqCount,
            faqData: row.faq_data || row.faqData,
            hasFaqs: row.has_faqs !== null && row.has_faqs !== undefined
                ? Boolean(row.has_faqs)
                : row.hasFaqs,
            faqScore: row.faq_score !== null && row.faq_score !== undefined
                ? parseInt(row.faq_score.toString())
                : row.faqScore,
            faqDetectionMethod: row.faq_detection_method || row.faqDetectionMethod,
            faqSchemaPresent: row.faq_schema_present !== null && row.faq_schema_present !== undefined
                ? Boolean(row.faq_schema_present)
                : row.faqSchemaPresent,
            hasMixedContent: row.has_mixed_content !== null && row.has_mixed_content !== undefined
                ? Boolean(row.has_mixed_content)
                : row.hasMixedContent,
            mixedContentSeverity: row.mixed_content_severity || row.mixedContentSeverity,
            mixedContentData: row.mixed_content_data || row.mixedContentData,
            activeMixedContentCount: row.active_mixed_content_count !== null && row.active_mixed_content_count !== undefined
                ? parseInt(row.active_mixed_content_count.toString())
                : row.activeMixedContentCount,
            passiveMixedContentCount: row.passive_mixed_content_count !== null && row.passive_mixed_content_count !== undefined
                ? parseInt(row.passive_mixed_content_count.toString())
                : row.passiveMixedContentCount,
            totalInsecureResources: row.total_insecure_resources !== null && row.total_insecure_resources !== undefined
                ? parseInt(row.total_insecure_resources.toString())
                : row.totalInsecureResources,
            headerStructureData: row.header_structure_data || row.headerStructureData,
            headerStructureIssues: row.header_structure_issues || row.headerStructureIssues,
            viewportPresent: row.viewport_present !== null && row.viewport_present !== undefined
                ? Boolean(row.viewport_present)
                : row.viewportPresent,
            viewportContent: row.viewport_content || row.viewportContent,
            viewportStatus: row.viewport_status || row.viewportStatus,
            structuredDataPresent: row.structured_data_present !== null && row.structured_data_present !== undefined
                ? Boolean(row.structured_data_present)
                : row.structuredDataPresent,
            structuredDataFormat: row.structured_data_format || row.structuredDataFormat,
            structuredDataTypes: row.structured_data_types || row.structuredDataTypes,
            structuredDataPriorityType: row.structured_data_priority_type || row.structuredDataPriorityType,
            pageSizeBytes: row.page_size_bytes !== null && row.page_size_bytes !== undefined
                ? parseInt(row.page_size_bytes.toString())
                : row.pageSizeBytes,
            pageSizeStatus: row.page_size_status || row.pageSizeStatus,
            totalWordCount: row.total_word_count !== null && row.total_word_count !== undefined 
                ? parseInt(row.total_word_count.toString()) 
                : row.totalWordCount,
            visibleWordCount: row.visible_word_count !== null && row.visible_word_count !== undefined 
                ? parseInt(row.visible_word_count.toString()) 
                : row.visibleWordCount,
            uniqueWordCount: row.unique_word_count !== null && row.unique_word_count !== undefined 
                ? parseInt(row.unique_word_count.toString()) 
                : row.uniqueWordCount,
            textToHtmlRatio: row.text_to_html_ratio !== null && row.text_to_html_ratio !== undefined 
                ? parseFloat(row.text_to_html_ratio.toString()) 
                : row.textToHtmlRatio,
            sentenceCount: row.sentence_count !== null && row.sentence_count !== undefined 
                ? parseInt(row.sentence_count.toString()) 
                : row.sentenceCount,
            paragraphCount: row.paragraph_count !== null && row.paragraph_count !== undefined 
                ? parseInt(row.paragraph_count.toString()) 
                : row.paragraphCount,
            averageSentenceLength: row.average_sentence_length !== null && row.average_sentence_length !== undefined 
                ? parseFloat(row.average_sentence_length.toString()) 
                : row.averageSentenceLength,
            averageParagraphLength: row.average_paragraph_length !== null && row.average_paragraph_length !== undefined 
                ? parseFloat(row.average_paragraph_length.toString()) 
                : row.averageParagraphLength,
            keywordDensity: row.keyword_density !== null && row.keyword_density !== undefined 
                ? parseFloat(row.keyword_density.toString()) 
                : row.keywordDensity,
            thinContent: row.thin_content !== null && row.thin_content !== undefined 
                ? Boolean(row.thin_content) 
                : row.thinContent,
            thinContentReason: row.thin_content_reason || row.thinContentReason,
            duplicateContent: row.duplicate_content !== null && row.duplicate_content !== undefined 
                ? Boolean(row.duplicate_content) 
                : row.duplicateContent,
            duplicateWithUrls: row.duplicate_with_urls 
                ? (typeof row.duplicate_with_urls === 'string' ? JSON.parse(row.duplicate_with_urls) : row.duplicate_with_urls) 
                : row.duplicateWithUrls,
            sectionWordCountMapping: row.section_word_count_mapping 
                ? (typeof row.section_word_count_mapping === 'string' ? JSON.parse(row.section_word_count_mapping) : row.section_word_count_mapping) 
                : row.sectionWordCountMapping,
            sectionWordCountBreakdown: row.section_word_count_breakdown 
                ? (typeof row.section_word_count_breakdown === 'string' ? JSON.parse(row.section_word_count_breakdown) : row.section_word_count_breakdown) 
                : row.sectionWordCountBreakdown,
            headingWordCountMapping: row.heading_word_count_mapping 
                ? (typeof row.heading_word_count_mapping === 'string' ? JSON.parse(row.heading_word_count_mapping) : row.heading_word_count_mapping) 
                : row.headingWordCountMapping,
            htmlSizeBytes: row.html_size_bytes !== null && row.html_size_bytes !== undefined
                ? parseInt(row.html_size_bytes.toString())
                : row.htmlSizeBytes,
            htmlSizeStatus: row.html_size_status || row.htmlSizeStatus,
            totalResourceSizeBytes: row.total_resource_size_bytes !== null && row.total_resource_size_bytes !== undefined
                ? parseInt(row.total_resource_size_bytes.toString())
                : row.totalResourceSizeBytes,
            resourceSizeBreakdown: row.resource_size_breakdown || row.resourceSizeBreakdown,
        };
    }

    private mapResource(row: any): Resource {
        return {
            id: row.id,
            sessionId: row.session_id || row.sessionId,
            pageId: row.page_id || row.pageId,
            url: row.url,
            resourceType: row.resource_type || row.resourceType,
            title: row.title,
            description: row.description,
            contentType: row.content_type || row.contentType,
            statusCode: row.status_code || row.statusCode,
            responseTime: row.response_time || row.responseTime,
            timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
        };
    }
}
