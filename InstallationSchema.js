/**
 * Catálogo físico da base e criação/migração idempotente das tabelas.
 * O instalador usa este arquivo como fonte única de verdade para as 11 abas.
 */
var InstallationSchema = (function () {
  function prizeHeaders_() {
    var h = CONFIG.PRIZE_HEADERS;
    return [h.ID, h.DESCRIPTION, h.CATEGORY, h.STATUS];
  }

  function awardeeHeaders_() {
    var h = CONFIG.AWARDEE_HEADERS;
    return [
      h.ID, h.PRIZE_ID, h.PRIZE, h.REGIME, h.YEAR, h.SEMESTER, h.RA, h.NAME, h.COURSE, h.COURSE_PERIOD,
      h.CLASS_GROUP, h.LANGUAGE, h.AVERAGE, h.FREQUENCY, h.CLASSIFICATION_INDICATOR, h.CLASSIFICATION_VALUE,
      h.POSITION, h.JUSTIFICATION, h.STATUS, h.REGISTERED_AT, h.REGISTERED_BY_EMAIL, h.REGISTERED_BY_NAME,
      h.PUBLISHED_AT, h.PUBLISHED_BY_EMAIL, h.PUBLISHED_BY_NAME, h.APPROVED_AT, h.APPROVED_BY_EMAIL,
      h.APPROVED_BY_NAME, h.ORIGIN, h.PACKAGE_ID, h.ADMIN_REFERENCE
    ];
  }

  function occurrenceHeaders_() {
    var h = CONFIG.OCCURRENCE_HEADERS;
    return [
      h.ID, h.REGIME, h.YEAR, h.SEMESTER, h.RA, h.NAME, h.EFFECTIVE_FROM, h.EFFECTIVE_TO,
      h.JUSTIFICATION, h.STATUS, h.REGISTERED_AT, h.REGISTERED_BY_EMAIL, h.REGISTERED_BY_NAME,
      h.PUBLISHED_AT, h.PUBLISHED_BY_EMAIL, h.PUBLISHED_BY_NAME, h.APPROVED_AT,
      h.APPROVED_BY_EMAIL, h.APPROVED_BY_NAME, h.PACKAGE_ID
    ];
  }

  function parameterHeaders_() {
    var h = CONFIG.PARAMETER_HEADERS;
    return [h.ID, h.DESCRIPTION, h.OPERATOR, h.COMPARISON_TYPE, h.VALUE, h.STATUS];
  }

  function packageHeaders_() {
    var h = CONFIG.PARAMETER_PACKAGE_HEADERS;
    return [h.ID, h.DESCRIPTION, h.REGIME, h.STATUS];
  }

  function ruleHeaders_() {
    var h = CONFIG.PARAMETER_RULE_HEADERS;
    return [h.ID, h.PACKAGE_ID, h.ORDER, h.CONNECTOR, h.FIELD, h.PARAMETER_ID, h.COMPARISON_FIELD];
  }

  function userHeaders_() {
    var h = CONFIG.USER_HEADERS;
    return [h.NAME, h.PROFILE, h.EMAIL];
  }

  function definitions() {
    return [
      { name: CONFIG.MATRICES_SHEET_NAME, headers: ['CURSO', 'PERÍODO', 'NÚMERO DE DISCIPLINAS'], minRows: 1000 },
      { name: CONFIG.USERS_SHEET_NAME, headers: userHeaders_(), minRows: 1000 },
      { name: CONFIG.PRIZES_SHEET_NAME, headers: prizeHeaders_(), minRows: 1000 },
      { name: CONFIG.ANNUAL_SHEET_NAME, headers: DataImportModel.schema(DataImportModel.TYPES.ANNUAL).targetHeaders.slice(), minRows: 10000 },
      { name: CONFIG.SEMESTRAL_SHEET_NAME, headers: DataImportModel.schema(DataImportModel.TYPES.SEMESTRAL).targetHeaders.slice(), minRows: 30000 },
      { name: CONFIG.CENID_SHEET_NAME, headers: DataImportModel.schema(DataImportModel.TYPES.CENID).targetHeaders.slice(), minRows: 5000 },
      { name: CONFIG.AWARDEES_SHEET_NAME, headers: awardeeHeaders_(), minRows: 5000 },
      { name: CONFIG.OCCURRENCES_SHEET_NAME, headers: occurrenceHeaders_(), minRows: 5000 },
      { name: CONFIG.PARAMETERS_SHEET_NAME, headers: parameterHeaders_(), minRows: 1000 },
      { name: CONFIG.PARAMETER_PACKAGES_SHEET_NAME, headers: packageHeaders_(), minRows: 1000 },
      { name: CONFIG.PARAMETER_RULES_SHEET_NAME, headers: ruleHeaders_(), minRows: 5000 }
    ];
  }

  function normalizeHeader_(value) {
    return TextUtil.text(value);
  }

  function headerMap_(headers) {
    var map = {};
    (headers || []).forEach(function (value, index) {
      var key = normalizeHeader_(value);
      if (key && map[key] === undefined) map[key] = index;
    });
    return map;
  }

  function exactHeaders_(current, expected) {
    if ((current || []).length < expected.length) return false;
    for (var i = 0; i < expected.length; i++) {
      if (normalizeHeader_(current[i]) !== expected[i]) return false;
    }
    return true;
  }

  function ensureCapacity_(sheet, rows, columns) {
    if (rows > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
    if (columns > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  }

  function writeRows_(sheet, startRow, rows) {
    if (!rows || !rows.length) return;
    var batchSize = Math.max(1, Number(CONFIG.PERFORMANCE.WRITE_BATCH_ROWS) || 2000);
    var columns = rows[0].length;
    for (var offset = 0; offset < rows.length; offset += batchSize) {
      var chunk = rows.slice(offset, offset + batchSize);
      sheet.getRange(startRow + offset, 1, chunk.length, columns).setValues(chunk);
    }
  }

  function applyHeaderStyle_(sheet, columnCount) {
    var header = sheet.getRange(1, 1, 1, columnCount);
    header.setFontWeight('bold')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true)
      .setBackground('#227a46')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setRowHeight(1, 34);
  }

  function applyValidations_(sheetName, sheet) {
    function listRule(values) {
      return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build();
    }

    if (sheetName === CONFIG.PRIZES_SHEET_NAME) {
      sheet.getRange(2, 3, Math.max(1, sheet.getMaxRows() - 1), 1).setDataValidation(listRule([
        CONFIG.PRIZE_CATEGORIES.REGULAR,
        CONFIG.PRIZE_CATEGORIES.COMPLEMENTARY,
        CONFIG.PRIZE_CATEGORIES.EXTRAORDINARY
      ]));
      sheet.getRange(2, 4, Math.max(1, sheet.getMaxRows() - 1), 1).setDataValidation(listRule([
        CONFIG.PRIZE_STATUS.ACTIVE, CONFIG.PRIZE_STATUS.INACTIVE
      ]));
    }

    if (sheetName === CONFIG.USERS_SHEET_NAME) {
      sheet.getRange(2, 2, Math.max(1, sheet.getMaxRows() - 1), 1).setDataValidation(listRule([
        CONFIG.USER_PROFILES.SUPERUSER,
        CONFIG.USER_PROFILES.ADMIN,
        CONFIG.USER_PROFILES.CGAE_SUPERVISOR
      ]));
    }

    if (sheetName === CONFIG.PARAMETERS_SHEET_NAME) {
      sheet.getRange(2, 6, Math.max(1, sheet.getMaxRows() - 1), 1).setDataValidation(listRule([
        CONFIG.PARAMETER_STATUS.ACTIVE, CONFIG.PARAMETER_STATUS.INACTIVE
      ]));
    }

    if (sheetName === CONFIG.PARAMETER_PACKAGES_SHEET_NAME) {
      sheet.getRange(2, 3, Math.max(1, sheet.getMaxRows() - 1), 1).setDataValidation(listRule([
        DataImportModel.TYPES.SEMESTRAL, DataImportModel.TYPES.CENID
      ]));
      sheet.getRange(2, 4, Math.max(1, sheet.getMaxRows() - 1), 1).setDataValidation(listRule([
        CONFIG.PARAMETER_STATUS.ACTIVE, CONFIG.PARAMETER_STATUS.INACTIVE
      ]));
    }
  }

  function ensureSheet_(ss, definition) {
    var sheet = ss.getSheetByName(definition.name);
    var created = false;
    if (!sheet) {
      sheet = ss.insertSheet(definition.name);
      created = true;
    }

    var expected = definition.headers.slice();
    ensureCapacity_(sheet, Math.max(Number(definition.minRows) || 1000, 2), expected.length);

    var lastRow = Math.max(1, sheet.getLastRow());
    var lastColumn = Math.max(expected.length, sheet.getLastColumn(), 1);
    var currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0] || [];
    var migrated = false;
    var preservedRows = 0;

    if (!exactHeaders_(currentHeaders, expected)) {
      var oldMap = headerMap_(currentHeaders);
      var oldRows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues() : [];
      var migratedRows = [];
      oldRows.forEach(function (source) {
        var hasData = source.some(function (value) { return TextUtil.text(value) !== ''; });
        if (!hasData) return;
        migratedRows.push(expected.map(function (header) {
          return oldMap[header] === undefined ? '' : source[oldMap[header]];
        }));
      });
      preservedRows = migratedRows.length;
      sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
      writeRows_(sheet, 2, migratedRows);
      if (lastRow - 1 > migratedRows.length) {
        sheet.getRange(2 + migratedRows.length, 1, lastRow - 1 - migratedRows.length, lastColumn).clearContent();
      }
      migrated = !created || preservedRows > 0;
    }

    applyHeaderStyle_(sheet, expected.length);
    applyValidations_(definition.name, sheet);

    return {
      name: definition.name,
      created: created,
      migrated: migrated,
      preservedRows: preservedRows,
      columns: expected.length,
      minRows: definition.minRows
    };
  }

  function ensureAll(ss) {
    if (!ss) throw new Error('Planilha da instalação não informada.');
    var results = definitions().map(function (definition) { return ensureSheet_(ss, definition); });
    SpreadsheetApp.flush();

    // Pós-condição obrigatória: a etapa só pode ser considerada concluída se
    // todas as tabelas existirem fisicamente com os cabeçalhos esperados.
    var validation = validateAll(ss);
    if (!validation.ok) {
      throw new Error('A estrutura da base não ficou completa após a preparação. ' + validation.issues.join(' '));
    }

    SpreadsheetGateway.reset();
    return {
      results: results,
      created: results.filter(function (r) { return r.created; }).length,
      migrated: results.filter(function (r) { return r.migrated; }).length,
      total: results.length,
      validation: validation
    };
  }

  function validateAll(ss) {
    var issues = [];
    var definitionsList = definitions();
    definitionsList.forEach(function (definition) {
      var sheet = ss.getSheetByName(definition.name);
      if (!sheet) {
        issues.push('Aba ausente: ' + definition.name);
        return;
      }
      var headers = sheet.getRange(1, 1, 1, definition.headers.length).getValues()[0] || [];
      if (!exactHeaders_(headers, definition.headers)) issues.push('Cabeçalhos inválidos: ' + definition.name);
    });
    return { ok: issues.length === 0, issues: issues, total: definitionsList.length };
  }

  function managedNames() {
    return definitions().map(function (definition) { return definition.name; });
  }

  return Object.freeze({ definitions: definitions, ensureAll: ensureAll, validateAll: validateAll, managedNames: managedNames });
})();
