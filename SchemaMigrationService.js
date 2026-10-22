/**
 * Migrações defensivas de esquema e carga inicial de configurações do sistema.
 * Preserva os dados existentes por nome de cabeçalho e nunca depende da posição física anterior.
 */
var SchemaMigrationService = (function () {
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

  function samePrefix_(current, expected) {
    if (current.length < expected.length) return false;
    for (var i = 0; i < expected.length; i++) {
      if (TextUtil.text(current[i]) !== expected[i]) return false;
    }
    return true;
  }

  function mapHeaders_(headers) {
    var map = {};
    (headers || []).forEach(function (header, index) {
      var key = TextUtil.text(header);
      if (key && map[key] === undefined) map[key] = index;
    });
    return map;
  }

  function writeRows_(sheet, startRow, rows) {
    if (!rows.length) return;
    var batchSize = Math.max(1, Number(CONFIG.PERFORMANCE.WRITE_BATCH_ROWS) || 2000);
    var columns = rows[0].length;
    for (var offset = 0; offset < rows.length; offset += batchSize) {
      var chunk = rows.slice(offset, offset + batchSize);
      sheet.getRange(startRow + offset, 1, chunk.length, columns).setValues(chunk);
    }
  }

  function ensureCapacity_(sheet, rows, columns) {
    if (rows > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
    if (columns > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
  }

  function migrateSheet_(sheetName, expectedHeaders) {
    var sheet = SpreadsheetGateway.getSheet(sheetName, true);
    var lastRow = Math.max(1, sheet.getLastRow());
    var lastColumn = Math.max(1, sheet.getLastColumn());
    var matrix = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
    var currentHeaders = matrix[0] || [];

    if (samePrefix_(currentHeaders, expectedHeaders)) {
      return { sheet: sheetName, changed: false };
    }

    var oldMap = mapHeaders_(currentHeaders);
    var migratedRows = [];
    for (var r = 1; r < matrix.length; r++) {
      var source = matrix[r];
      var hasData = source.some(function (value) { return TextUtil.text(value) !== ''; });
      if (!hasData) continue;
      migratedRows.push(expectedHeaders.map(function (header) {
        return oldMap[header] === undefined ? '' : source[oldMap[header]];
      }));
    }

    ensureCapacity_(sheet, 1 + migratedRows.length, expectedHeaders.length);
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    writeRows_(sheet, 2, migratedRows);

    var oldBodyRows = Math.max(0, sheet.getLastRow() - 1);
    if (oldBodyRows > migratedRows.length) {
      sheet.getRange(2 + migratedRows.length, 1, oldBodyRows - migratedRows.length, Math.max(lastColumn, expectedHeaders.length)).clearContent();
    }

    return {
      sheet: sheetName,
      changed: true,
      preservedRows: migratedRows.length,
      previousHeaders: currentHeaders.map(TextUtil.text),
      expectedHeaders: expectedHeaders.slice()
    };
  }

  function ensurePrizeCategories_() {
    var table = SheetDAO.readTable(CONFIG.PRIZES_SHEET_NAME, prizeHeaders_().length);
    var map = SheetDAO.requireHeaders(table.headers, prizeHeaders_(), CONFIG.PRIZES_SHEET_NAME);
    var idIndex = map[CONFIG.PRIZE_HEADERS.ID];
    var categoryIndex = map[CONFIG.PRIZE_HEADERS.CATEGORY];
    var missing = table.rows.some(function (row) {
      return TextUtil.text(row[idIndex]) && !TextUtil.text(row[categoryIndex]);
    });
    if (!missing) return { sheet: CONFIG.PRIZES_SHEET_NAME, categoryBackfill: false };
    // PrizeModel normaliza categoria vazia de versões anteriores para REGULAR.
    var records = PrizeDAO.list({ bypassCache: true });
    PrizeDAO.replaceAll(records);
    return { sheet: CONFIG.PRIZES_SHEET_NAME, categoryBackfill: true, preservedRows: records.length };
  }

  function ensureAwardeeOrigins_() {
    var table = SheetDAO.readTable(CONFIG.AWARDEES_SHEET_NAME, awardeeHeaders_().length);
    var map = SheetDAO.requireHeaders(table.headers, awardeeHeaders_(), CONFIG.AWARDEES_SHEET_NAME);
    var idIndex = map[CONFIG.AWARDEE_HEADERS.ID];
    var originIndex = map[CONFIG.AWARDEE_HEADERS.ORIGIN];
    var missing = table.rows.some(function (row) {
      return TextUtil.text(row[idIndex]) && !TextUtil.text(row[originIndex]);
    });
    if (!missing) return { sheet: CONFIG.AWARDEES_SHEET_NAME, originBackfill: false };
    var records = AwardeeDAO.list({ bypassCache: true });
    AwardeeDAO.replaceAll(records);
    return { sheet: CONFIG.AWARDEES_SHEET_NAME, originBackfill: true, preservedRows: records.length };
  }

  function findParameter_(parameters, predicate) {
    for (var i = 0; i < parameters.length; i++) if (predicate(parameters[i])) return parameters[i];
    return null;
  }

  function seedDefaultSemestralPackage_() {
    var defaults = CONFIG.DEFAULT_SEMESTRAL_PACKAGE;
    var parameters = ParameterDAO.list({ bypassCache: true });
    var changedParameters = false;

    function ensureParameter(id, description, operator, comparisonType, value, matcher) {
      var found = findParameter_(parameters, function (p) { return p.id === id; }) ||
        findParameter_(parameters, matcher || function () { return false; });
      if (found) return found;
      var created = ParameterModel.validate({
        id: id,
        description: description,
        operator: operator,
        comparisonType: comparisonType,
        value: value,
        status: CONFIG.PARAMETER_STATUS.ACTIVE
      }, { requireId: true });
      parameters.push(created);
      changedParameters = true;
      return created;
    }

    var geField = ensureParameter(
      defaults.PARAM_GE_FIELD_ID,
      'Maior ou igual a outro campo/indicador',
      '>=', CONFIG.PARAMETER_COMPARISON_TYPES.FIELD, '',
      function (p) { return p.operator === '>=' && p.comparisonType === CONFIG.PARAMETER_COMPARISON_TYPES.FIELD; }
    );
    var zero = ensureParameter(
      defaults.PARAM_ZERO_ID,
      'Igual a zero',
      '=', CONFIG.PARAMETER_COMPARISON_TYPES.VALUE, '0',
      function (p) { return p.operator === '=' && p.comparisonType === CONFIG.PARAMETER_COMPARISON_TYPES.VALUE && String(p.value) === '0'; }
    );
    var enrolled = ensureParameter(
      defaults.PARAM_ENROLLED_ID,
      'Movimento atual = Matriculado',
      '=', CONFIG.PARAMETER_COMPARISON_TYPES.VALUE, 'Matriculado',
      function (p) { return p.operator === '=' && p.comparisonType === CONFIG.PARAMETER_COMPARISON_TYPES.VALUE && TextUtil.text(p.value).toUpperCase() === 'MATRICULADO'; }
    );
    var ignored = ensureParameter(
      defaults.PARAM_IGNORED_COMPONENTS_ID,
      'Componentes curriculares desconsiderados',
      CONFIG.PARAMETER_OPERATORS.IGNORE,
      CONFIG.PARAMETER_COMPARISON_TYPES.VALUE,
      defaults.IGNORED_COMPONENTS.join('\n'),
      function (p) { return p.operator === CONFIG.PARAMETER_OPERATORS.IGNORE; }
    );

    if (changedParameters) ParameterDAO.replaceAll(parameters);

    var packages = CriteriaPackageDAO.listPackages({ bypassCache: true });
    var rules = CriteriaPackageDAO.listRules({ bypassCache: true });
    var existingDefault = packages.find(function (p) { return p.id === defaults.PACKAGE_ID; }) || null;
    if (existingDefault) {
      var defaultWasUsed = AwardeeDAO.list({ bypassCache: true }).some(function (r) { return r.packageId === existingDefault.id; }) ||
        OccurrenceDAO.list({ bypassCache: true }).some(function (r) { return r.packageId === existingDefault.id; });
      var existingRules = rules.filter(function (r) { return r.packageId === existingDefault.id; });
      var alreadyStandard = existingRules.some(function (r) { return r.field === 'DISCIPLINA' && r.parameterId === ignored.id; }) &&
        existingRules.some(function (r) { return r.field === 'MOVIMENTO_ATUAL' && r.parameterId === enrolled.id; }) &&
        existingRules.some(function (r) { return r.field === 'DISCIPLINAS_CURSADAS_PERIODO'; }) &&
        existingRules.some(function (r) { return r.field === 'NUMERO_REPROVACOES'; });
      if (defaultWasUsed || alreadyStandard) {
        return {
          seeded: false,
          packageId: existingDefault.id,
          reason: defaultWasUsed
            ? 'Pacote padrão já utilizado; configuração histórica preservada.'
            : 'Pacote padrão já configurado; nenhuma sobrescrita automática foi feita.'
        };
      }
    }
    var legacyExample = packages.find(function (p) {
      return p.regime === 'SEMESTRAL' && TextUtil.text(p.description).toUpperCase() === 'CRITÉRIOS SEMESTRAIS — EXEMPLO INICIAL'.toUpperCase();
    }) || null;
    var legacyHistory = AwardeeDAO.list({ bypassCache: true }).some(function (r) { return r.regime === 'SEMESTRAL' && !r.packageId; }) ||
      OccurrenceDAO.list({ bypassCache: true }).some(function (r) { return r.regime === 'SEMESTRAL' && !r.packageId; });

    var target = existingDefault;
    if (!target && legacyExample && !legacyHistory) target = legacyExample;
    if (!target && packages.some(function (p) { return p.regime === 'SEMESTRAL'; })) {
      return { seeded: false, reason: 'Pacote semestral já existente; configuração preservada.' };
    }
    if (!target) {
      target = { id: defaults.PACKAGE_ID, description: defaults.DESCRIPTION, regime: 'SEMESTRAL', status: CONFIG.PARAMETER_STATUS.ACTIVE };
      packages.push(target);
    } else {
      target.description = defaults.DESCRIPTION;
      target.regime = 'SEMESTRAL';
      target.status = CONFIG.PARAMETER_STATUS.ACTIVE;
    }

    var otherActive = packages.find(function (p) {
      return p.id !== target.id && p.regime === 'SEMESTRAL' && p.status === CONFIG.PARAMETER_STATUS.ACTIVE;
    });
    if (otherActive) {
      return { seeded: false, reason: 'Outro pacote semestral ativo já existe; nenhuma substituição automática foi feita.' };
    }

    var defaultRules = [
      { id: 'SYS_RULE_SEM_IGNORE', packageId: target.id, order: 1, connector: 'E', field: 'DISCIPLINA', parameterId: ignored.id, comparisonField: '' },
      { id: 'SYS_RULE_SEM_ENROLLED', packageId: target.id, order: 2, connector: 'E', field: 'MOVIMENTO_ATUAL', parameterId: enrolled.id, comparisonField: '' },
      { id: 'SYS_RULE_SEM_50P1', packageId: target.id, order: 3, connector: 'E', field: 'DISCIPLINAS_CURSADAS_PERIODO', parameterId: geField.id, comparisonField: 'MINIMO_50_MAIS_1' },
      { id: 'SYS_RULE_SEM_ZERO_FAILURES', packageId: target.id, order: 4, connector: 'E', field: 'NUMERO_REPROVACOES', parameterId: zero.id, comparisonField: '' }
    ].map(function (r) { return CriteriaPackageModel.validateRule(r, { requireId: true }); });

    CriteriaPackageDAO.replacePackages(packages);
    CriteriaPackageDAO.replaceRules(rules.filter(function (r) { return r.packageId !== target.id; }).concat(defaultRules));
    return { seeded: true, packageId: target.id, description: target.description, ruleCount: defaultRules.length };
  }

  function ensureCurrentUnlocked() {
    var result = [
      migrateSheet_(CONFIG.PRIZES_SHEET_NAME, prizeHeaders_()),
      migrateSheet_(CONFIG.AWARDEES_SHEET_NAME, awardeeHeaders_()),
      migrateSheet_(CONFIG.OCCURRENCES_SHEET_NAME, occurrenceHeaders_())
    ];
    PrizeDAO.invalidateCache();
    AwardeeDAO.invalidateCache();
    OccurrenceDAO.invalidateCache();
    ParameterDAO.invalidateCache();
    CriteriaPackageDAO.invalidatePackageCache();
    CriteriaPackageDAO.invalidateRuleCache();
    result.push(ensurePrizeCategories_());
    result.push(ensureAwardeeOrigins_());
    result.push(seedDefaultSemestralPackage_());
    result.push(PublicAwardeeService.ensureDefaultConfiguration());
    return result;
  }

  function ensureCurrent() {
    return LockExecutor.withScriptLock(ensureCurrentUnlocked);
  }

  return Object.freeze({
    ensureCurrent: ensureCurrent,
    ensureCurrentUnlocked: ensureCurrentUnlocked,
    ensureDefaultSemestralPackageUnlocked: seedDefaultSemestralPackage_
  });
})();
