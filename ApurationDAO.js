var ApurationDAO = (function () {
  function readMatrixRows() {
    var table = SheetDAO.readTable(CONFIG.MATRICES_SHEET_NAME, 3);
    SheetDAO.requireHeaders(table.headers, ['CURSO', 'PERÍODO', 'NÚMERO DE DISCIPLINAS'], CONFIG.MATRICES_SHEET_NAME);
    return table.rows;
  }

  function rowsInContext(type, rows, context) {
    var idx = DataImportModel.targetIndexMap(type);
    return (rows || []).filter(function (row) {
      if (Number(row[idx.ANO]) !== Number(context.year)) return false;
      if (type === DataImportModel.TYPES.SEMESTRAL) return Number(row[idx.SEMESTRE]) === Number(context.semester);
      return true;
    });
  }

  function readContext(context) {
    var rows = DataImportDAO.readTarget(context.dataType);
    return rowsInContext(context.dataType, rows, context);
  }

  function listDataSets() {
    var types = [DataImportModel.TYPES.ANNUAL, DataImportModel.TYPES.SEMESTRAL, DataImportModel.TYPES.CENID];
    var all = [];
    types.forEach(function (type) {
      var rows = DataImportDAO.readTarget(type);
      var idx = DataImportModel.targetIndexMap(type);
      var map = {};
      rows.forEach(function (row) {
        var year = Number(row[idx.ANO]);
        if (!Number.isInteger(year)) return;
        var semester = type === DataImportModel.TYPES.SEMESTRAL ? Number(row[idx.SEMESTRE]) : null;
        if (type === DataImportModel.TYPES.SEMESTRAL && semester !== 1 && semester !== 2) return;
        var key = type + '|' + year + '|' + (semester || '');
        if (!map[key]) map[key] = { key: key, dataType: type, year: year, semester: semester, rowCount: 0, ras: {} };
        map[key].rowCount++;
        var ra = DataImportModel.normalizeRa(row[idx.RA]);
        if (ra) map[key].ras[ra] = true;
      });
      Object.keys(map).forEach(function (key) {
        var d = map[key];
        d.raCount = Object.keys(d.ras).length;
        delete d.ras;
        d.label = type === DataImportModel.TYPES.SEMESTRAL
          ? type + ' — ' + d.year + '/' + d.semester
          : type + ' — ' + d.year;
        all.push(d);
      });
    });
    var order = { ANUAL: 1, SEMESTRAL: 2, CENID: 3 };
    all.sort(function (a, b) {
      return Number(b.year) - Number(a.year) || order[a.dataType] - order[b.dataType] || Number(a.semester || 0) - Number(b.semester || 0);
    });
    return all;
  }

  function studentDetails(context, ra) {
    var rows = readContext(context);
    var idx = DataImportModel.targetIndexMap(context.dataType);
    var key = DataImportModel.normalizeRa(ra);
    return rows.filter(function (row) { return DataImportModel.normalizeRa(row[idx.RA]) === key; });
  }

  return Object.freeze({
    readMatrixRows: readMatrixRows,
    readContext: readContext,
    listDataSets: listDataSets,
    studentDetails: studentDetails,
    rowsInContext: rowsInContext
  });
})();