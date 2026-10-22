var ParameterDAO = (function () {
  function headers_() {
    var h = CONFIG.PARAMETER_HEADERS;
    return [h.ID, h.DESCRIPTION, h.OPERATOR, h.COMPARISON_TYPE, h.VALUE, h.STATUS];
  }

  function list(options) {
    var opts = options || {};
    if (!opts.bypassCache) {
      var cached = PerformanceCache.getJson(CONFIG.PERFORMANCE.PARAMETER_CACHE_KEY);
      if (cached && Array.isArray(cached)) return cached.map(ParameterModel.normalize);
    }
    var table = SheetDAO.readTable(CONFIG.PARAMETERS_SHEET_NAME, headers_().length);
    var map = SheetDAO.requireHeaders(table.headers, headers_(), CONFIG.PARAMETERS_SHEET_NAME);
    var h = CONFIG.PARAMETER_HEADERS;
    var rows = [];
    table.rows.forEach(function (row) {
      var id = TextUtil.text(row[map[h.ID]]);
      if (!id) return;
      try {
        rows.push(ParameterModel.validate({
          id: id,
          description: row[map[h.DESCRIPTION]],
          operator: row[map[h.OPERATOR]],
          comparisonType: row[map[h.COMPARISON_TYPE]],
          value: row[map[h.VALUE]],
          status: row[map[h.STATUS]]
        }, { requireId: true }));
      } catch (error) {
        console.warn('Parâmetro ignorado por inconsistência: ' + error.message);
      }
    });
    PerformanceCache.putJson(CONFIG.PERFORMANCE.PARAMETER_CACHE_KEY, rows, CONFIG.PERFORMANCE.PARAMETER_CACHE_TTL_SECONDS);
    return rows.map(ParameterModel.normalize);
  }

  function literalCellValue_(value) {
    // Range.setValue/setValues interpreta strings iniciadas por '=' como fórmula.
    // Parâmetros são dados, nunca fórmulas. Prefixar apóstrofo força texto
    // literal no Google Sheets; getValues() devolve o conteúdo sem o marcador.
    if (typeof value === 'string' && value.charAt(0) === '=') return "'" + value;
    return value;
  }

  function replaceAll(parameters) {
    var rows = (parameters || []).map(function (item) {
      var p = ParameterModel.validate(item, { requireId: true });
      return [p.id, p.description, p.operator, p.comparisonType, p.value, p.status].map(literalCellValue_);
    });
    SheetDAO.replaceBody(CONFIG.PARAMETERS_SHEET_NAME, rows, headers_().length);
    invalidateCache();
  }

  function invalidateCache() {
    PerformanceCache.remove(CONFIG.PERFORMANCE.PARAMETER_CACHE_KEY);
  }

  return Object.freeze({ list: list, replaceAll: replaceAll, invalidateCache: invalidateCache });
})();