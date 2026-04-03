import { env } from '../../config/env';
import { logger } from '../../shared/logger/logger';
import { ProjectService } from '../project/project.service';

type ConversationTurn = { role: 'user' | 'assistant'; content: string };

export class ModuleDService {
  private projectService: ProjectService;

  constructor() {
    this.projectService = new ProjectService();
  }

  async askModuleDAI(
    userId: string,
    payload: {
      project_id: string;
      question: string;
      job_id?: string;
      conversation_history?: ConversationTurn[];
    },
  ): Promise<Record<string, unknown>> {
    await this.projectService.verifyOwnership(payload.project_id, userId);

    const endpoint = `${env.NPY_BACKEND_URL}/module-d/ask-ai`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module D Ask AI failed: ${res.status} - ${detail}`);
      throw new Error(detail || 'Ask AI request failed');
    }

    return raw;
  }

  async getSuggestedQuestions(
    userId: string,
    payload: { project_id: string },
  ): Promise<Record<string, unknown>> {
    await this.projectService.verifyOwnership(payload.project_id, userId);

    const endpoint = `${env.NPY_BACKEND_URL}/module-d/ask-ai/suggested-questions`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module D suggested questions failed: ${res.status} - ${detail}`);
      throw new Error(detail || 'Suggested questions request failed');
    }

    return raw;
  }
}
