/** DAO de ocorrências/desclassificações. */
var OccurrenceDAO = (function () {
  function headers_() {
    var h = CONFIG.OCCURRENCE_HEADERS;
    return [
      h.ID, h.REGIME, h.YEAR, h.SEMESTER, h.RA, h.NAME, h.EFFECTIVE_FROM, h.EFFECTIVE_TO, h.JUSTIFICATION, h.STATUS,
      h.REGISTERED_AT, h.REGISTERED_BY_EMAIL, h.REGISTERED_BY_NAME, h.PUBLISHED_AT, h.PUBLISHED_BY_EMAIL,
      h.PUBLISHED_BY_NAME, h.APPROVED_AT, h.APPROVED_BY_EMAIL, h.APPROVED_BY_NAME, h.PACKAGE_ID
    ];
  }

  function toRow_(record) {
    var r = OccurrenceModel.validate(record, { requireId: true });
    return [
      r.id, r.regime, r.year, r.semester === null ? '' : r.semester, r.ra, r.name, r.effectiveFrom, r.effectiveTo, r.justification,
      r.status, r.registeredAt, r.registeredByEmail, r.registeredByName, r.publishedAt, r.publishedByEmail,
      r.publishedByName, r.approvedAt, r.approvedByEmail, r.approvedByName, r.packageId
    ];
  }

  function list(options) {
    var opts = options || {};
    if (!opts.bypassCache) {
      var cached = PerformanceCache.getJson(CONFIG.PERFORMANCE.OCCURRENCE_CACHE_KEY);
      if (cached && Array.isArray(cached)) return cached.map(OccurrenceModel.normalize);
    }

    var table = SheetDAO.readTable(CONFIG.OCCURRENCES_SHEET_NAME, headers_().length);
    var map = SheetDAO.requireHeaders(table.headers, headers_(), CONFIG.OCCURRENCES_SHEET_NAME);
    var h = CONFIG.OCCURRENCE_HEADERS;
    var result = [];

    table.rows.forEach(function (row) {
      var id = TextUtil.text(row[map[h.ID]]);
      if (!id) return;
      result.push(OccurrenceModel.normalize({
        id: id, regime: row[map[h.REGIME]], year: row[map[h.YEAR]], semester: row[map[h.SEMESTER]],
        ra: row[map[h.RA]], name: row[map[h.NAME]], effectiveFrom: row[map[h.EFFECTIVE_FROM]],
        effectiveTo: row[map[h.EFFECTIVE_TO]], justification: row[map[h.JUSTIFICATION]], status: row[map[h.STATUS]], registeredAt: row[map[h.REGISTERED_AT]],
        registeredByEmail: row[map[h.REGISTERED_BY_EMAIL]], registeredByName: row[map[h.REGISTERED_BY_NAME]],
        publishedAt: row[map[h.PUBLISHED_AT]], publishedByEmail: row[map[h.PUBLISHED_BY_EMAIL]],
        publishedByName: row[map[h.PUBLISHED_BY_NAME]], approvedAt: row[map[h.APPROVED_AT]],
        approvedByEmail: row[map[h.APPROVED_BY_EMAIL]], approvedByName: row[map[h.APPROVED_BY_NAME]],
        packageId: row[map[h.PACKAGE_ID]]
      }));
    });

    if (!opts.bypassCache) PerformanceCache.putJson(CONFIG.PERFORMANCE.OCCURRENCE_CACHE_KEY, result, CONFIG.PERFORMANCE.OCCURRENCE_CACHE_TTL_SECONDS);
    return result.map(OccurrenceModel.normalize);
  }

  function findById(id, options) {
    var key = TextUtil.text(id);
    return list(options).find(function (record) { return record.id === key; }) || null;
  }

  function save(record) {
    var normalized = OccurrenceModel.validate(record, { requireId: true });
    var rows = list({ bypassCache: true });
    var index = rows.findIndex(function (item) { return item.id === normalized.id; });
    if (index >= 0) SheetDAO.updateRowsByIndex(CONFIG.OCCURRENCES_SHEET_NAME, [{ index: index, row: toRow_(normalized) }], headers_().length);
    else SheetDAO.appendRows(CONFIG.OCCURRENCES_SHEET_NAME, [toRow_(normalized)]);
    invalidateCache();
    return normalized;
  }

  function appendMany(records) {
    var rows = (records || []).map(function (record) { return toRow_(record); });
    if (rows.length) SheetDAO.appendRows(CONFIG.OCCURRENCES_SHEET_NAME, rows);
    invalidateCache();
  }

  function replaceAll(records) {
    SheetDAO.replaceBody(CONFIG.OCCURRENCES_SHEET_NAME, (records || []).map(toRow_), headers_().length);
    invalidateCache();
  }

  function remove(id) {
    var key = TextUtil.text(id);
    var rows = list({ bypassCache: true });
    var filtered = rows.filter(function (item) { return item.id !== key; });
    if (filtered.length === rows.length) return false;
    SheetDAO.replaceBody(CONFIG.OCCURRENCES_SHEET_NAME, filtered.map(toRow_), headers_().length);
    invalidateCache();
    return true;
  }

  function invalidateCache() {
    PerformanceCache.remove(CONFIG.PERFORMANCE.OCCURRENCE_CACHE_KEY);
  }

  return Object.freeze({
    list: list, findById: findById, save: save, appendMany: appendMany, replaceAll: replaceAll,
    remove: remove, invalidateCache: invalidateCache
  });
})();
