export interface ModuleBAskAIResult {
  answer: string;
  question_type?: string;
  sources?: string[];
  data_available?: boolean;
  context_snapshot?: Record<string, unknown>;
}
