
export type PromptType = 'hint' | 'debug';

export interface GetHintPromptRequest {
  problemName: string;
  platform: string;
  contestName: string;
  problemStatement?: string;
}

export interface GetDebugPromptRequest {
  problemName: string;
  platform: string;
  contestName: string;
  userCode: string;
}

/** Shape returned by both GET /prompts/hint and POST /prompts/debug. */
export interface FilledPromptResponse {
  type: PromptType;
  version: number;
  filledText: string;
}
