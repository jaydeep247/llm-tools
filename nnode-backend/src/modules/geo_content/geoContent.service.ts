import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { logger } from '../../shared/logger/logger';
import { GeoContentRepository } from './geoContent.repository';
import type { GenerateGeoContentParams, GeoContentDetail } from './geoContent.types';

// ─── System Prompt ────────────────────────────────────────────────────────────

const GEO_SYSTEM_PROMPT = `You are an expert content strategist and SEO writer specializing in GEO (Generative Engine Optimization) — the practice of writing content specifically designed to be cited, quoted, or summarized by AI language models such as ChatGPT, Perplexity, Google Gemini, and Claude.

Your goal is to produce a long-form, authoritative article that:
1. Directly and clearly answers the user's content brief
2. Uses factual, structured, citation-worthy language that AI systems prefer to quote
3. Leads with the most important answer (inverted pyramid structure)
4. Uses clear H2/H3 subheadings so AI can extract section-level answers
5. Defines terms, provides statistics contexts, and gives concrete examples
6. Naturally integrates the target search keywords (if provided) with proper semantic density — not keyword stuffing
7. If a Target Prompt is provided, specifically structure sections to answer that prompt in a way an AI would cite verbatim
8. If Listicle mode is ON, format the article as a numbered list article (e.g. "11 Best Practices for X")

Output the article as valid HTML only. No markdown. No preamble or explanation outside the HTML. Start directly with <h1>. Use these HTML elements only: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>. Do not include <html>, <head>, <body>, or any wrapper tags.

The article must be minimum 1200 words. Authoritative, expert tone. Avoid fluff. Every paragraph must add value.`;

// ─── Prompt Builder ───────────────────────────────────────────────────────────

function buildUserPrompt({
  brief,
  title,
  keywords,
  targetPrompt,
  listicle,
}: GenerateGeoContentParams): string {
  let prompt = `Write a GEO-optimized article based on the following:\n\n`;
  prompt += `CONTENT BRIEF:\n${brief}\n\n`;

  if (title) {
    prompt += `USE THIS TITLE:\n${title}\n\n`;
  } else {
    prompt += `Generate a compelling, SEO-friendly title for the article.\n\n`;
  }

  if (keywords?.length) {
    prompt += `TARGET SEARCH KEYWORDS (integrate naturally):\n${keywords.join(', ')}\n\n`;
  }

  if (targetPrompt) {
    prompt += `TARGET AI PROMPT (the article must clearly answer this so AI models cite it):\n"${targetPrompt}"\n\n`;
  }

  if (listicle) {
    prompt += `FORMAT: Write this as a listicle with numbered sections (e.g. "7 Ways to..." or "11 Best Practices for...").\n\n`;
  }

  prompt += `Return only valid HTML content. No markdown, no explanation text outside the HTML.`;
  return prompt;
}

// ─── Word Count Helper ────────────────────────────────────────────────────────

function countWords(html: string): number {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean).length;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class GeoContentService {
  private repo = new GeoContentRepository();

  /**
   * Generate a GEO-optimized article via Claude Sonnet and persist it.
   */
  async generate(
    userId: string,
    params: GenerateGeoContentParams,
  ): Promise<GeoContentDetail> {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not configured. Set it in the .env file to enable GEO content generation.',
      );
    }

    logger.info(`[GEO_CONTENT] Generating content for userId=${userId}`);

    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 4096,
      temperature: 0.1,
      system: GEO_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(params) }],
    });

    const htmlContent = (message.content[0] as { type: string; text: string }).text;

    // Extract title from the <h1> tag Claude generated
    const titleMatch = htmlContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
    const extractedTitle = titleMatch
      ? titleMatch[1].replace(/<[^>]+>/g, '').trim()
      : 'Untitled Article';

    const finalTitle = params.title || extractedTitle;
    const wordCount = countWords(htmlContent);

    logger.info(
      `[GEO_CONTENT] Generated ${wordCount} words for userId=${userId}, title="${finalTitle}"`,
    );

    // TODO: deduct 1 credit from brand.credits once the credit system is implemented

    const doc = await this.repo.create({
      userId,
      brandId: params.brandId ?? null,
      title: finalTitle,
      htmlContent,
      brief: params.brief,
      keywords: params.keywords ?? [],
      targetPrompt: params.targetPrompt ?? null,
      listicle: params.listicle ?? false,
      wordCount,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'draft',
      linkedinUrl: null,
      wordpressUrl: null,
    });

    return doc;
  }

  /**
   * List all GEO content for a user with pagination.
   */
  async list(userId: string, page: number = 1, limit: number = 20) {
    return this.repo.list(userId, page, limit);
  }

  /**
   * Fetch a single GEO content document.
   */
  async getById(id: string, userId: string) {
    return this.repo.findById(id, userId);
  }

  /**
   * Update the title of a piece of content.
   */
  async updateTitle(id: string, userId: string, title: string): Promise<boolean> {
    return this.repo.updateTitle(id, userId, title);
  }

  /**
   * Fetch the user's saved brand prompts from the Python backend.
   * These are shown in the "Target Prompt" dropdown on the creation form.
   *
   * NOTE: This proxies to the Python npy-backend. The `jobId` is expected
   * to be supplied as a query param by the frontend.
   */
  async getBrandPrompts(jobId: string): Promise<string[]> {
    const baseUrl = env.NPY_BACKEND_URL;
    const endpoint = `${baseUrl}/brand-onboarding/data/${encodeURIComponent(jobId)}`;

    const res = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return [];
    if (!res.ok) return [];

    const data = (await res.json()) as {
      prompts_selected?: string[];
    };

    return data.prompts_selected ?? [];
  }
}
