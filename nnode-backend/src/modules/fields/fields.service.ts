import { FieldsRepository } from './fields.repository';

export interface SeoExtractResult {
  url: string;
  language: string | null;
  parent: string | null;
  keywords: string[];
  cached: boolean;
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
    };
  }
}
