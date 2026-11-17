(function () {
  const POLL_INTERVAL_MS = 10000;
  const POLL_MAX_MS = 120000;
  const POLL_GRACE_MS = 5000;

  /**
   * @param {number} now
   * @param {number} startedAt
   * @param {{ intervalMs?: number; maxMs?: number; graceMs?: number }} [opts]
   * @returns {{
   *   intervalMs: number;
   *   elapsedMs: number;
   *   inGrace: boolean;
   *   shouldStopWaiting: boolean;
   * }}
   */
  function timing(now, startedAt, opts) {
    const bag = opts && typeof opts === 'object' ? opts : {};
    const intervalMs = Number.isFinite(Number(bag.intervalMs)) ? Number(bag.intervalMs) : POLL_INTERVAL_MS;
    const maxMs = Number.isFinite(Number(bag.maxMs)) ? Number(bag.maxMs) : POLL_MAX_MS;
    const graceMs = Number.isFinite(Number(bag.graceMs)) ? Number(bag.graceMs) : POLL_GRACE_MS;
    const start = Number(startedAt);
    const t = Number(now);
    const elapsedMs = Number.isFinite(start) && Number.isFinite(t) ? Math.max(0, t - start) : 0;
    return {
      intervalMs,
      elapsedMs,
      inGrace: elapsedMs >= maxMs && elapsedMs < maxMs + graceMs,
      shouldStopWaiting: elapsedMs >= maxMs + graceMs,
    };
  }

  window.riskAiPollWait = {
    POLL_INTERVAL_MS,
    POLL_MAX_MS,
    POLL_GRACE_MS,
    timing,
  };
}());
