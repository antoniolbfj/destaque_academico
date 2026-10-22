/** DAO de premiados. Mantém a persistência física isolada da regra de negócio. */
var AwardeeDAO = (function () {
  function headers_() {
    var h = CONFIG.AWARDEE_HEADERS;
    return [
      h.ID, h.PRIZE_ID, h.PRIZE, h.REGIME, h.YEAR, h.SEMESTER, h.RA, h.NAME, h.COURSE, h.COURSE_PERIOD,
      h.CLASS_GROUP, h.LANGUAGE, h.AVERAGE, h.FREQUENCY, h.CLASSIFICATION_INDICATOR, h.CLASSIFICATION_VALUE,
      h.POSITION, h.JUSTIFICATION, h.STATUS, h.REGISTERED_AT, h.REGISTERED_BY_EMAIL,
      h.REGISTERED_BY_NAME, h.PUBLISHED_AT, h.PUBLISHED_BY_EMAIL, h.PUBLISHED_BY_NAME, h.APPROVED_AT,
      h.APPROVED_BY_EMAIL, h.APPROVED_BY_NAME, h.ORIGIN, h.PACKAGE_ID, h.ADMIN_REFERENCE
    ];
  }

  function toRow_(record) {
    var r = AwardeeModel.validate(record, { requireId: true });
    return [
      r.id, r.prizeId, r.prize, r.regime, r.year === null ? '' : r.year, r.semester === null ? '' : r.semester,
      r.ra, r.name, r.course, r.coursePeriod, r.classGroup, r.language,
      r.average === null ? '' : r.average, r.frequency === null ? '' : r.frequency,
      r.classificationIndicator, r.classificationValue === null ? '' : r.classificationValue,
      r.position === null ? '' : r.position, r.justification, r.status, r.registeredAt, r.registeredByEmail,
      r.registeredByName, r.publishedAt, r.publishedByEmail, r.publishedByName, r.approvedAt,
      r.approvedByEmail, r.approvedByName, r.origin, r.packageId, r.administrativeReference
    ];
  }

  function list(options) {
    var opts = options || {};
    if (!opts.bypassCache) {
      var cached = PerformanceCache.getJson(CONFIG.PERFORMANCE.AWARDEE_CACHE_KEY);
      if (cached && Array.isArray(cached)) return cached.map(AwardeeModel.normalize);
    }

    var table = SheetDAO.readTable(CONFIG.AWARDEES_SHEET_NAME, headers_().length);
    var map = SheetDAO.requireHeaders(table.headers, headers_(), CONFIG.AWARDEES_SHEET_NAME);
    var h = CONFIG.AWARDEE_HEADERS;
    var result = [];

    table.rows.forEach(function (row) {
      var id = TextUtil.text(row[map[h.ID]]);
      if (!id) return;
      result.push(AwardeeModel.normalize({
        id: id,
        prizeId: row[map[h.PRIZE_ID]], prize: row[map[h.PRIZE]], regime: row[map[h.REGIME]], year: row[map[h.YEAR]],
        semester: row[map[h.SEMESTER]], ra: row[map[h.RA]], name: row[map[h.NAME]], course: row[map[h.COURSE]],
        coursePeriod: row[map[h.COURSE_PERIOD]], classGroup: row[map[h.CLASS_GROUP]], language: row[map[h.LANGUAGE]],
        average: row[map[h.AVERAGE]], frequency: row[map[h.FREQUENCY]],
        classificationIndicator: row[map[h.CLASSIFICATION_INDICATOR]], classificationValue: row[map[h.CLASSIFICATION_VALUE]],
        position: row[map[h.POSITION]], justification: row[map[h.JUSTIFICATION]], status: row[map[h.STATUS]],
        registeredAt: row[map[h.REGISTERED_AT]], registeredByEmail: row[map[h.REGISTERED_BY_EMAIL]],
        registeredByName: row[map[h.REGISTERED_BY_NAME]], publishedAt: row[map[h.PUBLISHED_AT]],
        publishedByEmail: row[map[h.PUBLISHED_BY_EMAIL]], publishedByName: row[map[h.PUBLISHED_BY_NAME]],
        approvedAt: row[map[h.APPROVED_AT]], approvedByEmail: row[map[h.APPROVED_BY_EMAIL]],
        approvedByName: row[map[h.APPROVED_BY_NAME]], origin: row[map[h.ORIGIN]],
        packageId: row[map[h.PACKAGE_ID]], administrativeReference: row[map[h.ADMIN_REFERENCE]]
      }));
    });

    if (!opts.bypassCache) PerformanceCache.putJson(CONFIG.PERFORMANCE.AWARDEE_CACHE_KEY, result, CONFIG.PERFORMANCE.AWARDEE_CACHE_TTL_SECONDS);
    return result.map(AwardeeModel.normalize);
  }

  function findById(id, options) {
    var key = TextUtil.text(id);
    return list(options).find(function (record) { return record.id === key; }) || null;
  }

  function save(record) {
    var normalized = AwardeeModel.validate(record, { requireId: true });
    var rows = list({ bypassCache: true });
    var index = rows.findIndex(function (item) { return item.id === normalized.id; });
    if (index >= 0) SheetDAO.updateRowsByIndex(CONFIG.AWARDEES_SHEET_NAME, [{ index: index, row: toRow_(normalized) }], headers_().length);
    else SheetDAO.appendRows(CONFIG.AWARDEES_SHEET_NAME, [toRow_(normalized)]);
    invalidateCache();
    return normalized;
  }

  function appendMany(records) {
    var rows = (records || []).map(function (record) { return toRow_(record); });
    if (rows.length) SheetDAO.appendRows(CONFIG.AWARDEES_SHEET_NAME, rows);
    invalidateCache();
  }

  function replaceAll(records) {
    SheetDAO.replaceBody(CONFIG.AWARDEES_SHEET_NAME, (records || []).map(toRow_), headers_().length);
    invalidateCache();
  }

  function remove(id) {
    var key = TextUtil.text(id);
    var rows = list({ bypassCache: true });
    var filtered = rows.filter(function (item) { return item.id !== key; });
    if (filtered.length === rows.length) return false;
    SheetDAO.replaceBody(CONFIG.AWARDEES_SHEET_NAME, filtered.map(toRow_), headers_().length);
    invalidateCache();
    return true;
  }

  function countByPrizeId(prizeId) {
    var key = TextUtil.text(prizeId);
    if (!key) return 0;
    return list().reduce(function (total, record) { return total + (record.prizeId === key ? 1 : 0); }, 0);
  }

  function invalidateCache() { PerformanceCache.remove(CONFIG.PERFORMANCE.AWARDEE_CACHE_KEY); try { PublicAwardeeService.invalidateCache(); } catch (error) {} }

  return Object.freeze({
    list: list, findById: findById, save: save, appendMany: appendMany, replaceAll: replaceAll,
    remove: remove, countByPrizeId: countByPrizeId, invalidateCache: invalidateCache
  });
})();
