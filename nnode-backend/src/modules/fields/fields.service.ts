import { FieldsRepository } from './fields.repository';

export interface SeoExtractResult {
  url: string;
  language: string | null;
  parent: string | null;
  keywords: any[];
  cached: boolean;
  metric_help?: Record<string, { meaning: string; improve: string }>;
}

export class FieldsService {
  private fieldsRepository: FieldsRepository;

  constructor() {
    this.fieldsRepository = new FieldsRepository();
  }

  async getSeoExtract(url: string, jobId: string): Promise<SeoExtractResult | null> {
    let doc = await this.fieldsRepository.findByJobIdAndUrl(jobId, url);

    // Try the alternate trailing-slash form
    if (!doc) {
      const altUrl = url.endsWith('/') ? url.slice(0, -1) : url + '/';
      doc = await this.fieldsRepository.findByJobIdAndUrl(jobId, altUrl);
    }

    if (!doc) return null;

    const keywordAnalysis = doc.Keyword_analysis;
    if (!keywordAnalysis || !Array.isArray(keywordAnalysis.keywords)) {
      return null;
    }

    return {
      url: doc.url,
      language: keywordAnalysis.language ?? doc.language ?? null,
      parent: keywordAnalysis.parent ?? null,
      keywords: keywordAnalysis.keywords ?? [],
      cached: true,
      metric_help: keywordAnalysis.metric_help ?? {
        score: {
          meaning: 'Priority score for the keyword. Higher generally means it is more valuable to target.',
          improve: 'Align content tightly to the keyword, strengthen internal linking to the page, and add supporting subtopics to raise relevance and usefulness.',
        },
        relevance_score: {
          meaning: 'How strongly the keyword aligns with the selected URL’s topic and intent (0–100).',
          improve: 'Use the keyword in H1/H2s naturally, add a focused section that answers the query, and reinforce with related entities and internal links.',
        },
        diversity_score: {
          meaning: 'How varied the prompt/intent space is around the keyword (0–100). Higher means broader/more mixed intents.',
          improve: 'Add intent-specific sections (FAQ, comparisons, pricing, examples) and clarify the page’s main angle to cover diverse intents without confusion.',
        },
        prompt_count: {
          meaning: 'How many prompts/queries were associated with this keyword.',
          improve: 'Expand coverage with FAQ and long-tail variations, and add internal links from related pages to strengthen the cluster.',
        },
        difficulty_score: {
          meaning: 'How hard it is to win the keyword/prompt given competition and content strength signals (0–100). Higher means harder.',
          improve: 'Target narrower sub-queries, improve topical depth, strengthen authority signals, and add structured data and references.',
        },
        ai_generation_feasibility: {
          meaning: 'How likely models can confidently generate answers from this page for the keyword (0–100). Higher means easier.',
          improve: 'Add explicit facts, definitions, step-by-steps and tables; use clear headings and schema so models can extract reliable snippets.',
        },
        complexity_level: {
          meaning: 'Complexity of the keyword based on length and diversity. High usually means broader or more nuanced intent.',
          improve: 'Break the topic into clear sections, add scannable summaries, and use tables/checklists to reduce ambiguity.',
        },
      },
    };
  }
}
