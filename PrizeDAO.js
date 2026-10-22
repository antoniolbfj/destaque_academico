/** DAO de prêmios: única camada que conhece a estrutura física da aba correspondente. */
var PrizeDAO = (function () {
  function requiredHeaders_() {
    return [
      CONFIG.PRIZE_HEADERS.ID,
      CONFIG.PRIZE_HEADERS.DESCRIPTION,
      CONFIG.PRIZE_HEADERS.CATEGORY,
      CONFIG.PRIZE_HEADERS.STATUS
    ];
  }

  function list(options) {
    var opts = options || {};
    if (!opts.bypassCache) {
      var cached = PerformanceCache.getJson(CONFIG.PERFORMANCE.PRIZE_CACHE_KEY);
      if (cached && Array.isArray(cached)) return cached.map(PrizeModel.normalize);
    }

    var table = SheetDAO.readTable(CONFIG.PRIZES_SHEET_NAME, requiredHeaders_().length);
    var map = SheetDAO.requireHeaders(table.headers, requiredHeaders_(), CONFIG.PRIZES_SHEET_NAME);
    var seenIds = {};
    var rows = [];

    table.rows.forEach(function (row) {
      var prize = PrizeModel.normalize({
        id: row[map[CONFIG.PRIZE_HEADERS.ID]],
        description: row[map[CONFIG.PRIZE_HEADERS.DESCRIPTION]],
        category: row[map[CONFIG.PRIZE_HEADERS.CATEGORY]],
        status: row[map[CONFIG.PRIZE_HEADERS.STATUS]]
      });
      if (!prize.id && !prize.description && !prize.status) return;
      if (!prize.id || !prize.description || !PrizeModel.isAllowedStatus(prize.status) || !PrizeModel.isAllowedCategory(prize.category)) return;
      if (seenIds[prize.id]) return;
      seenIds[prize.id] = true;
      rows.push(prize);
    });

    PerformanceCache.putJson(CONFIG.PERFORMANCE.PRIZE_CACHE_KEY, rows, CONFIG.PERFORMANCE.PRIZE_CACHE_TTL_SECONDS);
    return rows.map(PrizeModel.normalize);
  }

  function replaceAll(prizes) {
    var rows = (prizes || []).map(function (prize) {
      var normalized = PrizeModel.validate(prize, { requireId: true });
      return [normalized.id, normalized.description, normalized.category, normalized.status];
    });
    SheetDAO.replaceBody(CONFIG.PRIZES_SHEET_NAME, rows, requiredHeaders_().length);
    invalidateCache();
  }

  function invalidateCache() {
    PerformanceCache.remove(CONFIG.PERFORMANCE.PRIZE_CACHE_KEY);
    try { PublicAwardeeService.invalidateCache(); } catch (error) {}
  }

  return Object.freeze({ list: list, replaceAll: replaceAll, invalidateCache: invalidateCache });
})();
