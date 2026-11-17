// @ts-check
'use strict';

/** @type {typeof import('../../risk/match')} */
const riskMatch = require('../../risk/match');
/** @type {typeof import('../../risk/store')} */
const riskStore = require('../../risk/store');
/** @type {typeof import('../../risk/review')} */
const riskReview = require('../../risk/review');
/** @type {typeof import('../../prompts/parse')} */
const parseModule = require('../../prompts/parse');
/** @type {typeof import('../model-error')} */
const modelErrorModule = require('../model-error');
/** @type {typeof import('../../draft/store')} */
const storeModule = require('../../draft/store');

/** @type {typeof import('./constants')} */
const constantsModule = require('./constants');

const { parseJsonObject } = parseModule;
const {
  formatModelError,
  isIdempotencyConflict,
  isReplayableErrorMessage,
  isReplayableModelError,
} = modelErrorModule;
const { emptyRisk, emptyRiskAi } = storeModule;
const { BUSY_MESSAGE } = constantsModule;

/**
 * 风险词：词包选择、本地查词、AI 查词（独立执行位，不占成稿锁）。
 * @param {import('./context').RunnerCtx} ctx
 */
function attachRisk(ctx) {
  const {
    checkEntitlement,
    complete,
    factoryPack,
    isSilencedEntitlement,
    options,
    userRiskDir,
  } = ctx;

  /**
   * @returns {{
   *   ok: true;
   *   libraries: { id: string; name: string; enabled: boolean; empty?: boolean }[];
   *   selection: import('../../risk/store').RiskSelection;
   *   personalWords: import('../../risk/store').PersonalRiskWord[];
   * }}
   */
  function getRiskSetup() {
    const selection = riskStore.readSelection(userRiskDir);
    const personalWords = riskStore.readPersonalWords(userRiskDir);
    const personalEmpty = personalWords.length === 0;
    /** @type {{ id: string; name: string; enabled: boolean; empty?: boolean }[]} */
    const libraries = factoryPack.libraries.map((item) => ({
      id: item.id,
      name: item.name,
      enabled: Boolean(selection[/** @type {keyof import('../../risk/store').RiskSelection} */ (item.id)]),
    }));
    libraries.push({
      id: 'personal',
      name: riskMatch.LIBRARY_LABELS.personal,
      enabled: selection.personal && !personalEmpty,
      empty: personalEmpty,
    });
    return {
      ok: true,
      libraries,
      selection,
      personalWords,
    };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function setRiskSelection(payload) {
    riskStore.writeSelection(userRiskDir, payload.selection || payload);
    return getRiskSetup();
  }

  /**
   * @param {Record<string, unknown>} payload
   * @returns {import('../../risk/match').RiskField[]}
   */
  function parseRiskFields(payload) {
    /** @type {import('../../risk/match').RiskField[]} */
    const fields = [];
    if (!Array.isArray(payload.fields)) return fields;
    for (const item of payload.fields) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const row = /** @type {Record<string, unknown>} */ (item);
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      if (!id) continue;
      fields.push({ id, text: typeof row.text === 'string' ? row.text : '' });
    }
    return fields;
  }

  /**
   * AI 只跟正文；可兼容旧版带 selection 的指纹。
   * @param {import('../../risk/match').RiskField[]} fields
   * @returns {string}
   */
  function riskTextFingerprint(fields) {
    return JSON.stringify({ fields: Array.isArray(fields) ? fields : [] });
  }

  /**
   * @param {string} stored
   * @param {string} textFp
   * @returns {boolean}
   */
  function riskAiFingerprintMatches(stored, textFp) {
    const have = String(stored || '');
    const want = String(textFp || '');
    if (!have || !want) return false;
    if (have === want) return true;
    try {
      const parsed = JSON.parse(have);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
      if (!Object.prototype.hasOwnProperty.call(parsed, 'fields')) return false;
      return riskTextFingerprint(
        /** @type {{ fields?: import('../../risk/match').RiskField[] }} */ (parsed).fields || [],
      ) === want;
    } catch {
      return false;
    }
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function checkRisk(payload) {
    const personalWords = riskStore.readPersonalWords(userRiskDir);
    const selection = riskStore.readSelection(userRiskDir);
    const requested = Array.isArray(payload.libraryIds)
      ? payload.libraryIds.map((id) => String(id || '').trim()).filter(Boolean)
      : riskStore.selectedLibraryIds(selection, personalWords.length === 0);
    const fields = parseRiskFields(payload);
    const result = riskMatch.checkRiskText({
      fields,
      libraryIds: requested,
      factoryWords: factoryPack.words,
      personalWords: riskStore.toMatchWords(personalWords),
      libraries: [
        ...factoryPack.libraries,
        { id: 'personal', name: riskMatch.LIBRARY_LABELS.personal },
      ],
    });
    return { ok: true, ...result };
  }

  /**
   * 本机查词结果写入当前篇草稿；不占成稿 job.running。
   * @param {Record<string, unknown>} payload
   */
  function saveRiskCheck(payload) {
    if (!ctx.store) return { ok: false, message: '没有这一篇' };
    const checked = checkRisk(payload);
    if (!checked.ok) return checked;
    const fields = parseRiskFields(payload);
    // 词库结果键：正文 + 勾选（客户端传入）；缺省时用 fields + libraryIds
    const fingerprint = typeof payload.fingerprint === 'string'
      ? payload.fingerprint
      : JSON.stringify({
        fields,
        libraryIds: Array.isArray(payload.libraryIds) ? payload.libraryIds : [],
      });
    const textFp = riskTextFingerprint(fields);
    const state = ctx.store.read();
    const risk = state.risk && typeof state.risk === 'object' ? state.risk : emptyRisk();
    risk.check = {
      fingerprint,
      status: String(checked.status || ''),
      message: typeof checked.message === 'string' ? checked.message : '',
      libraries: Array.isArray(checked.libraries) ? checked.libraries.map((item) => String(item)) : [],
      cannotCount: Number(checked.cannotCount) || 0,
      rewriteCount: Number(checked.rewriteCount) || 0,
      hits: Array.isArray(checked.hits) ? checked.hits.slice() : [],
      checkedAt: Date.now(),
    };
    // 只按正文决定是否作废 AI；改词库勾选不算正文变了。进行中 / 可重放 error 保留
    const ai = risk.ai;
    const preserveAi = Boolean(
      ai
      && (ai.status === 'running'
        || (ai.status === 'error' && String(ai.idempotencyKey || '').trim())),
    );
    if (
      ai
      && ai.fingerprint
      && !riskAiFingerprintMatches(String(ai.fingerprint), textFp)
      && !preserveAi
    ) {
      risk.ai = {
        ...emptyRiskAi(),
        id: ai.id,
        status: 'idle',
        fingerprint: '',
      };
    }
    state.risk = risk;
    ctx.store.write(state);
    const { ok: _checkedOk, ...checkBody } = checked;
    return {
      ...checkBody,
      ok: true,
      fingerprint,
      risk: state.risk,
      id: ctx.currentId,
    };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function addPersonalRiskWords(payload) {
    if (!userRiskDir) return { ok: false, message: '缺少个人违禁词库目录' };
    const lines = Array.isArray(payload.words)
      ? payload.words
      : (typeof payload.text === 'string' ? payload.text.split(/\r?\n/) : payload.lines);
    const saved = riskStore.addPersonalWords(userRiskDir, lines);
    if (!saved.ok) return saved;
    const setup = getRiskSetup();
    return {
      ...setup,
      words: saved.words,
      added: saved.added,
      rejected: saved.rejected,
    };
  }

  /**
   * @param {Record<string, unknown>} payload
   */
  function deletePersonalRiskWord(payload) {
    if (!userRiskDir) return { ok: false, message: '缺少个人违禁词库目录' };
    const text = typeof payload.text === 'string' ? payload.text : payload.word;
    const saved = riskStore.deletePersonalWord(userRiskDir, text);
    if (!saved.ok) return saved;
    const setup = getRiskSetup();
    return {
      ...setup,
      words: saved.words,
      removed: saved.removed,
    };
  }

  /**
   * 读取当前篇 risk 块；无篇时返回空。
   */
  function readRiskState() {
    if (!ctx.store) return emptyRisk();
    const state = ctx.store.read();
    return state.risk && typeof state.risk === 'object' ? state.risk : emptyRisk();
  }

  /**
   * @param {import('../../draft/store').RiskState} risk
   */
  function writeRiskState(risk) {
    if (!ctx.store) return;
    const state = ctx.store.read();
    state.risk = risk;
    ctx.store.write(state);
  }

  const RISK_AI_REPLAY_HINT = '请再点一次取回（不会重复扣费）';

  const RISK_AI_CONFLICT_WAIT_MS = 5000;

  const RISK_AI_CONFLICT_MAX_TRIES = 24;

  /**
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * 同 key 冲突时隔约 5s 再取，最多约 2 分钟。
   * @param {string | { system: string; user: string }} messages
   * @param {{ idempotencyKey: string }} options
   * @param {unknown} first
   * @returns {Promise<string>}
   */
  async function waitOutRiskAiConflict(messages, options, first) {
    let last = first;
    for (let i = 0; i < RISK_AI_CONFLICT_MAX_TRIES; i += 1) {
      await sleep(RISK_AI_CONFLICT_WAIT_MS);
      try {
        return await complete(messages, options);
      } catch (err) {
        last = err;
        if (!isReplayableModelError(err)) throw err;
        if (!isIdempotencyConflict(err)) throw err;
      }
    }
    throw last;
  }

  /**
   * 网关抖一下 / 同 key 冲突：用同一把 Idempotency-Key 再取（对齐听力大师）。
   * @param {string | { system: string; user: string }} messages
   * @param {string} idempotencyKey
   * @returns {Promise<string>}
   */
  async function completeWithRiskReplay(messages, idempotencyKey) {
    const options = { idempotencyKey };
    try {
      return await complete(messages, options);
    } catch (err) {
      if (!isReplayableModelError(err)) throw err;
      if (isIdempotencyConflict(err)) {
        return waitOutRiskAiConflict(messages, options, err);
      }
      try {
        return await complete(messages, options);
      } catch (again) {
        if (isIdempotencyConflict(again)) {
          return waitOutRiskAiConflict(messages, options, again);
        }
        throw again;
      }
    }
  }

  /**
   * @param {string} fingerprint
   * @returns {{ resume: boolean; id: string; idempotencyKey: string }}
   */
  function riskAiResumeTarget(fingerprint) {
    const risk = readRiskState();
    const ai = risk.ai || emptyRiskAi();
    const key = typeof ai.idempotencyKey === 'string' ? ai.idempotencyKey.trim() : '';
    const id = typeof ai.id === 'string' ? ai.id.trim() : '';
    const sameFp = typeof ai.fingerprint === 'string'
      && riskAiFingerprintMatches(ai.fingerprint, fingerprint);
    if (!sameFp || !key || !id) {
      return { resume: false, id: '', idempotencyKey: '' };
    }
    if (ai.status === 'running') {
      return { resume: true, id, idempotencyKey: key };
    }
    if (ai.status === 'error' && isReplayableErrorMessage(ai.error)) {
      return { resume: true, id, idempotencyKey: key };
    }
    return { resume: false, id: '', idempotencyKey: '' };
  }

  /**
   * @param {{
   *   seq: number;
   *   riskAiId: string;
   *   idempotencyKey: string;
   *   fingerprint: string;
   *   fields: import('../../risk/match').RiskField[];
   *   hits: import('../../risk/match').RiskHit[];
   * }} job
   */
  function startRiskAiJob(job) {
    const { seq, riskAiId, idempotencyKey, fingerprint, fields, hits } = job;
    ctx.riskAiBusy = true;
    void (async () => {
      try {
        const messages = riskReview.buildReviewMessages(fields, hits);
        const text = await completeWithRiskReplay(messages, idempotencyKey);
        if (seq !== ctx.riskAiSeq) return;
        /** @type {unknown} */
        let parsed = text;
        try {
          parsed = parseJsonObject(text);
        } catch {
          // 非 JSON 时交给 parseReviewSuggestions
        }
        const suggestions = riskReview.parseReviewSuggestions(parsed, fields);
        if (!ctx.store) return;
        const next = readRiskState();
        if (next.ai.id !== riskAiId) return;
        next.ai = {
          id: riskAiId,
          status: 'done',
          error: '',
          fingerprint,
          suggestions,
          idempotencyKey: '',
        };
        writeRiskState(next);
      } catch (err) {
        if (seq !== ctx.riskAiSeq || !ctx.store) return;
        const next = readRiskState();
        if (next.ai.id !== riskAiId) return;
        const base = isSilencedEntitlement(err)
          ? ''
          : formatModelError(err, '没有完成');
        const keepKey = isReplayableModelError(err);
        next.ai = {
          id: riskAiId,
          status: 'error',
          error: keepKey && base && !base.includes(RISK_AI_REPLAY_HINT)
            ? `${base}。${RISK_AI_REPLAY_HINT}`
            : base,
          fingerprint,
          suggestions: [],
          idempotencyKey: keepKey ? idempotencyKey : '',
        };
        writeRiskState(next);
      } finally {
        if (seq === ctx.riskAiSeq) ctx.riskAiBusy = false;
      }
    })();
  }

  /**
   * 买断通过后立刻 accepted，后台写 risk.ai；不占 job.running。
   * @param {Record<string, unknown>} payload
   */
  async function reviewRiskWithAi(payload) {
    if (ctx.lock) return { ok: false, message: BUSY_MESSAGE };

    const fields = parseRiskFields(payload);
    /** @type {import('../../risk/match').RiskHit[]} */
    const hits = Array.isArray(payload.hits)
      ? /** @type {import('../../risk/match').RiskHit[]} */ (payload.hits)
      : [];
    // AI 只存正文指纹；旧草稿里带 selection 的指纹靠 riskAiFingerprintMatches 认
    const fingerprint = riskTextFingerprint(fields);

    if (ctx.riskAiBusy) {
      const risk = readRiskState();
      return {
        ok: true,
        accepted: true,
        running: true,
        riskAiId: risk.ai.id,
        risk,
        message: '正在用 AI 看危险词，请等这一轮结束',
      };
    }

    try {
      await checkEntitlement(options.ctx);
    } catch (err) {
      if (isSilencedEntitlement(err)) return { ok: false, silenced: true };
      return { ok: false, message: err instanceof Error ? err.message : '没有完成' };
    }

    const resume = ctx.store ? riskAiResumeTarget(fingerprint) : { resume: false, id: '', idempotencyKey: '' };
    const seq = ctx.riskAiSeq + 1;
    ctx.riskAiSeq = seq;
    const riskAiId = resume.resume
      ? resume.id
      : `risk-ai-${ctx.currentId || 'paste'}-${seq}-${Date.now().toString(36)}`;
    const idempotencyKey = resume.resume
      ? resume.idempotencyKey
      : `risk-review:${riskAiId}`;

    // 粘贴查词页可能没有当前篇：同步等模型，无草稿可取回。
    if (!ctx.store) {
      ctx.riskAiBusy = true;
      try {
        const messages = riskReview.buildReviewMessages(fields, hits);
        const text = await completeWithRiskReplay(messages, idempotencyKey);
        if (seq !== ctx.riskAiSeq) {
          return { ok: false, message: '这一轮 AI 结果已过期' };
        }
        /** @type {unknown} */
        let parsed = text;
        try {
          parsed = parseJsonObject(text);
        } catch {
          // 非 JSON 时交给 parseReviewSuggestions
        }
        const suggestions = riskReview.parseReviewSuggestions(parsed, fields);
        return {
          ok: true,
          accepted: false,
          riskAiId,
          suggestions,
          fingerprint,
        };
      } catch (err) {
        if (isSilencedEntitlement(err)) return { ok: false, silenced: true };
        const base = formatModelError(err, '没有完成');
        const message = isReplayableModelError(err) && !base.includes(RISK_AI_REPLAY_HINT)
          ? `${base}。${RISK_AI_REPLAY_HINT}`
          : base;
        return { ok: false, message, replayable: isReplayableModelError(err) };
      } finally {
        if (seq === ctx.riskAiSeq) ctx.riskAiBusy = false;
      }
    }

    const risk = readRiskState();
    risk.ai = {
      id: riskAiId,
      status: 'running',
      error: '',
      fingerprint,
      suggestions: [],
      idempotencyKey,
    };
    writeRiskState(risk);
    startRiskAiJob({
      seq,
      riskAiId,
      idempotencyKey,
      fingerprint,
      fields,
      hits,
    });

    return {
      ok: true,
      accepted: true,
      riskAiId,
      risk: readRiskState(),
      id: ctx.currentId,
      resumed: Boolean(resume.resume),
    };
  }

  return {
    addPersonalRiskWords,
    checkRisk,
    deletePersonalRiskWord,
    getRiskSetup,
    reviewRiskWithAi,
    saveRiskCheck,
    setRiskSelection,
  };
}

module.exports = { attachRisk };
