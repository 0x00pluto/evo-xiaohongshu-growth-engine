// @ts-check
'use strict';

/**
 * @typedef {{
 *   postsDir?: string;
 *   latestDir?: string;
 *   promptsDir: string;
 *   userAlbumsDir?: string;
 *   userImageRefsDir?: string;
 *   userUploadRefsDir?: string;
 *   userArticleSamplesDir?: string;
 *   userReferenceDocsDir?: string;
 *   userXhsNotesDir?: string;
 *   userXhsNotesCacheDir?: string;
 *   userRiskDir?: string;
 *   userMaterialsDir?: string;
 *   fetchNoteByUrl?: typeof import('../../xhs-note/fetch').fetchNoteByUrl;
 *   checkBridge?: typeof import('../../xhs-note/fetch').checkBridge;
 *   env?: Record<string, string | undefined>;
 *   readEnv?: () => Record<string, string | undefined>;
 *   ctx?: unknown;
 *   requireEntitlement?: (ctx?: unknown) => Promise<unknown>;
 *   models?: unknown;
 *   fetch?: import('../../llm/client').FetchFn;
 *   now?: () => Date;
 *   complete?: CompleteFn;
 *   completeVision?: CompleteVisionFn;
 *   generateImage?: (args: {
 *     prompt: string;
 *     outputPath: string;
 *     references?: import('../../image/generate').ImageReference[];
 *     idempotencyKey?: string;
 *     model?: string;
 *   }) => Promise<string>;
 *   revealFile?: (absPath: string) => void;
 *   random?: () => number;
 * }} RunnerOptions
 */

/**
 * @typedef {(prompt: string | { system: string; user: string }, options?: { idempotencyKey?: string }) => Promise<string>} CompleteFn
 * @typedef {(input: { text: string; dataUrl: string }, options?: { idempotencyKey?: string }) => Promise<string>} CompleteVisionFn
 * @typedef {(args: {
 *   prompt: string;
 *   outputPath: string;
 *   references?: import('../../image/generate').ImageReference[];
 *   aspectRatio?: string;
 *   idempotencyKey?: string;
 *   model?: string;
 * }) => Promise<string>} GenerateImageFn
 */

/**
 * 一个 runner 实例的全部依赖与可变状态；各域共用同一个对象，改值一律写 `ctx.xxx = ...`。
 * @typedef {{
 *   options: RunnerOptions;
 *   postsDir: string;
 *   promptsDir: string;
 *   userAlbumsDir: string;
 *   userImageRefsDir: string;
 *   userUploadRefsDir: string;
 *   userArticleSamplesDir: string;
 *   userReferenceDocsDir: string;
 *   userXhsNotesDir: string;
 *   userXhsNotesCacheDir: string;
 *   userRiskDir: string;
 *   fetchNoteByUrl: typeof import('../../xhs-note/fetch').fetchNoteByUrl;
 *   checkBridgeFn: typeof import('../../xhs-note/fetch').checkBridge;
 *   readEnv: () => Record<string, string | undefined>;
 *   fetchImpl: import('../../llm/client').FetchFn | undefined;
 *   now: () => Date;
 *   complete: CompleteFn;
 *   completeVision: CompleteVisionFn;
 *   generateImage: GenerateImageFn;
 *   visionAttempts: Map<string, number>;
 *   revealFile: (absPath: string) => void;
 *   random: () => number;
 *   factoryPack: ReturnType<typeof import('../../risk/match').loadFactoryWords>;
 *   checkEntitlement: (ctx?: unknown) => Promise<unknown>;
 *   currentId: string;
 *   currentDir: string;
 *   store: import('../../draft/store').DraftStore | null;
 *   lock: string | null;
 *   riskAiBusy: boolean;
 *   riskAiSeq: number;
 * }} RunnerState
 */

/**
 * state 加上共用会话助手；各域 attach 都收这个。
 * @typedef {RunnerState & ReturnType<typeof import('./session').createSession>} RunnerCtx
 */

module.exports = {};
