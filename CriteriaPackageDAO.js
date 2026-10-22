var CriteriaPackageDAO = (function () {
  function packageHeaders_() {
    var h = CONFIG.PARAMETER_PACKAGE_HEADERS;
    return [h.ID, h.DESCRIPTION, h.REGIME, h.STATUS];
  }
  function ruleHeaders_() {
    var h = CONFIG.PARAMETER_RULE_HEADERS;
    return [h.ID, h.PACKAGE_ID, h.ORDER, h.CONNECTOR, h.FIELD, h.PARAMETER_ID, h.COMPARISON_FIELD];
  }

  function listPackages(options) {
    var opts = options || {};
    if (!opts.bypassCache) {
      var cached = PerformanceCache.getJson(CONFIG.PERFORMANCE.PARAMETER_PACKAGE_CACHE_KEY);
      if (cached && Array.isArray(cached)) return cached.map(CriteriaPackageModel.normalizePackage);
    }
    var table = SheetDAO.readTable(CONFIG.PARAMETER_PACKAGES_SHEET_NAME, packageHeaders_().length);
    var map = SheetDAO.requireHeaders(table.headers, packageHeaders_(), CONFIG.PARAMETER_PACKAGES_SHEET_NAME);
    var h = CONFIG.PARAMETER_PACKAGE_HEADERS;
    var rows = [];
    table.rows.forEach(function (row) {
      if (!TextUtil.text(row[map[h.ID]])) return;
      try {
        rows.push(CriteriaPackageModel.validatePackage({
          id: row[map[h.ID]], description: row[map[h.DESCRIPTION]], regime: row[map[h.REGIME]], status: row[map[h.STATUS]]
        }, { requireId: true }));
      } catch (error) {
        console.warn('Pacote ignorado por inconsistência: ' + error.message);
      }
    });
    PerformanceCache.putJson(CONFIG.PERFORMANCE.PARAMETER_PACKAGE_CACHE_KEY, rows, CONFIG.PERFORMANCE.PARAMETER_PACKAGE_CACHE_TTL_SECONDS);
    return rows.map(CriteriaPackageModel.normalizePackage);
  }

  function listRules(options) {
    var opts = options || {};
    if (!opts.bypassCache) {
      var cached = PerformanceCache.getJson(CONFIG.PERFORMANCE.PARAMETER_RULE_CACHE_KEY);
      if (cached && Array.isArray(cached)) return cached.map(CriteriaPackageModel.normalizeRule);
    }
    var table = SheetDAO.readTable(CONFIG.PARAMETER_RULES_SHEET_NAME, ruleHeaders_().length);
    var map = SheetDAO.requireHeaders(table.headers, ruleHeaders_(), CONFIG.PARAMETER_RULES_SHEET_NAME);
    var h = CONFIG.PARAMETER_RULE_HEADERS;
    var rows = [];
    table.rows.forEach(function (row) {
      if (!TextUtil.text(row[map[h.ID]])) return;
      try {
        rows.push(CriteriaPackageModel.validateRule({
          id: row[map[h.ID]], packageId: row[map[h.PACKAGE_ID]], order: row[map[h.ORDER]],
          connector: row[map[h.CONNECTOR]], field: row[map[h.FIELD]], parameterId: row[map[h.PARAMETER_ID]],
          comparisonField: row[map[h.COMPARISON_FIELD]]
        }, { requireId: true }));
      } catch (error) {
        console.warn('Regra ignorada por inconsistência: ' + error.message);
      }
    });
    PerformanceCache.putJson(CONFIG.PERFORMANCE.PARAMETER_RULE_CACHE_KEY, rows, CONFIG.PERFORMANCE.PARAMETER_RULE_CACHE_TTL_SECONDS);
    return rows.map(CriteriaPackageModel.normalizeRule);
  }

  function replacePackages(packages) {
    var rows = (packages || []).map(function (item) {
      var p = CriteriaPackageModel.validatePackage(item, { requireId: true });
      return [p.id, p.description, p.regime, p.status];
    });
    SheetDAO.replaceBody(CONFIG.PARAMETER_PACKAGES_SHEET_NAME, rows, packageHeaders_().length);
    invalidatePackageCache();
  }

  function replaceRules(rules) {
    var rows = (rules || []).map(function (item) {
      var r = CriteriaPackageModel.validateRule(item, { requireId: true });
      return [r.id, r.packageId, r.order, r.connector, r.field, r.parameterId, r.comparisonField];
    });
    SheetDAO.replaceBody(CONFIG.PARAMETER_RULES_SHEET_NAME, rows, ruleHeaders_().length);
    invalidateRuleCache();
  }

  function invalidatePackageCache() { PerformanceCache.remove(CONFIG.PERFORMANCE.PARAMETER_PACKAGE_CACHE_KEY); }
  function invalidateRuleCache() { PerformanceCache.remove(CONFIG.PERFORMANCE.PARAMETER_RULE_CACHE_KEY); }

  return Object.freeze({
    listPackages: listPackages, listRules: listRules,
    replacePackages: replacePackages, replaceRules: replaceRules,
    invalidatePackageCache: invalidatePackageCache, invalidateRuleCache: invalidateRuleCache
  });
})();