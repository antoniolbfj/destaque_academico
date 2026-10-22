/**
 * Modelo estrutural do módulo de gerenciamento/importação de dados acadêmicos.
 * Não contém critérios acadêmicos de classificação; apenas descreve os formatos físicos de importação.
 */
var DataImportModel = (function () {
  var OPERATIONS = Object.freeze({
    NEW: 'NOVO',
    UPDATE: 'ATUALIZAR',
    DELETE: 'EXCLUIR'
  });

  var TYPES = Object.freeze({
    ANNUAL: 'ANUAL',
    SEMESTRAL: 'SEMESTRAL',
    CENID: 'CENID'
  });

  var SCHEMAS = {};

  SCHEMAS[TYPES.ANNUAL] = Object.freeze({
    type: TYPES.ANNUAL,
    label: 'Anual',
    sheetName: CONFIG.ANNUAL_SHEET_NAME,
    requiresSemester: false,
    sourceHeaders: Object.freeze([
      'RA', 'NOME COMPLETO', 'CURSO', 'PERÍODO', 'TURMA', 'DISCIPLINA',
      'FREQUÊNCIA GLOBAL (%)', 'SOMATÓRIO 1º TRIMESTRE', 'SOMATÓRIO 2º TRIMESTRE',
      'SOMATÓRIO 3º TRIMESTRE', 'SOMATÓRIO RECUPERAÇÃO FINAL'
    ]),
    targetHeaders: Object.freeze([
      'ANO', 'RA', 'NOME COMPLETO', 'CURSO', 'PERÍODO', 'TURMA', 'DISCIPLINA',
      'FREQUÊNCIA GLOBAL (%)', 'SOMATÓRIO 1º TRIMESTRE', 'SOMATÓRIO 2º TRIMESTRE',
      'SOMATÓRIO 3º TRIMESTRE', 'SOMATÓRIO RECUPERAÇÃO FINAL'
    ]),
    requiredFields: Object.freeze(['RA', 'NOME COMPLETO', 'CURSO', 'PERÍODO', 'TURMA', 'DISCIPLINA']),
    numericSourceFields: Object.freeze([
      'PERÍODO', 'FREQUÊNCIA GLOBAL (%)', 'SOMATÓRIO 1º TRIMESTRE',
      'SOMATÓRIO 2º TRIMESTRE', 'SOMATÓRIO 3º TRIMESTRE', 'SOMATÓRIO RECUPERAÇÃO FINAL'
    ])
  });

  SCHEMAS[TYPES.SEMESTRAL] = Object.freeze({
    type: TYPES.SEMESTRAL,
    label: 'Semestral',
    sheetName: CONFIG.SEMESTRAL_SHEET_NAME,
    requiresSemester: true,
    sourceHeaders: Object.freeze([
      'RA', 'Nome', 'Sexo', 'Data nascimento', 'Processo Seletivo/Vestibular',
      'Grupo de Concorrência', 'Curso', 'Campus', 'Data da matrícula',
      'Data da última matricula', 'Movimento atual', 'Período', 'Disciplina',
      'Período letivo (Ano/Semestre)', 'Situação', 'Total da nota', 'Conceito final', 'Resultado'
    ]),
    targetHeaders: Object.freeze([
      'ANO', 'SEMESTRE', 'RA', 'Nome', 'Sexo', 'Data nascimento', 'Processo Seletivo/Vestibular',
      'Grupo de Concorrência', 'Curso', 'Campus', 'Data da matrícula', 'Data da última matricula',
      'Movimento atual', 'Período', 'Disciplina', 'Período letivo (Ano/Semestre)',
      'Situação', 'Total da nota', 'Conceito final', 'Resultado'
    ]),
    requiredFields: Object.freeze(['RA', 'Nome', 'Curso', 'Período', 'Disciplina']),
    numericSourceFields: Object.freeze(['Período', 'Total da nota'])
  });

  SCHEMAS[TYPES.CENID] = Object.freeze({
    type: TYPES.CENID,
    label: 'CENID',
    sheetName: CONFIG.CENID_SHEET_NAME,
    requiresSemester: false,
    sourceHeaders: Object.freeze([
      'RA', 'Nome', 'Sexo', 'Data nascimento', 'Processo Seletivo/Vestibular',
      'Grupo de Concorrência', 'Curso', 'Campus', 'Data da matrícula',
      'Data da última matricula', 'Movimento atual', 'Período', 'Disciplina',
      'Período letivo (Ano/Semestre)', 'Situação', 'Total da nota', 'Conceito final', 'Resultado'
    ]),
    targetHeaders: Object.freeze([
      'ANO', 'RA', 'Nome', 'Sexo', 'Data nascimento', 'Processo Seletivo/Vestibular',
      'Grupo de Concorrência', 'Curso', 'Campus', 'Data da matrícula', 'Data da última matricula',
      'Movimento atual', 'Período', 'Disciplina', 'Período letivo (Ano/Semestre)',
      'Situação', 'Total da nota', 'Conceito final', 'Resultado'
    ]),
    requiredFields: Object.freeze(['RA', 'Nome', 'Curso', 'Período', 'Disciplina']),
    numericSourceFields: Object.freeze(['Período', 'Total da nota'])
  });

  function schema(type) {
    var key = TextUtil.text(type).toUpperCase();
    var value = SCHEMAS[key];
    if (!value) throw new Error('Tipo de conjunto de dados inválido.');
    return value;
  }

  function normalizeOperation(operation) {
    var value = TextUtil.text(operation).toUpperCase();
    if ([OPERATIONS.NEW, OPERATIONS.UPDATE, OPERATIONS.DELETE].indexOf(value) < 0) {
      throw new Error('Operação de dados inválida.');
    }
    return value;
  }

  function normalizeYear(value) {
    var year = Number(value);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      throw new Error('Informe um ano válido para o conjunto de dados.');
    }
    return year;
  }

  function normalizeContext(payload) {
    var source = payload || {};
    var type = TextUtil.text(source.dataType).toUpperCase();
    var operation = normalizeOperation(source.operation);
    var definition = schema(type);
    var year = normalizeYear(source.year);
    var semester = source.semester === '' || source.semester === null || source.semester === undefined ? null : Number(source.semester);

    if (definition.requiresSemester && (semester !== 1 && semester !== 2)) {
      throw new Error('Informe o semestre (1 ou 2).');
    }

    return {
      operation: operation,
      dataType: type,
      year: year,
      semester: definition.requiresSemester ? semester : null
    };
  }

  function normalizeHeaderKey(value) {
    return String(value === null || value === undefined ? '' : value)
      .trim()
      .replace(/\s+/g, ' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  function indexByHeader(headers) {
    var map = {};
    (headers || []).forEach(function (header, index) {
      var key = normalizeHeaderKey(header);
      if (key && map[key] === undefined) map[key] = index;
    });
    return map;
  }

  function targetIndexMap(type) {
    var definition = schema(type);
    var map = {};
    definition.targetHeaders.forEach(function (header, index) { map[header] = index; });
    return map;
  }

  function sourceIndexMap(type) {
    var definition = schema(type);
    var map = {};
    definition.sourceHeaders.forEach(function (header, index) { map[header] = index; });
    return map;
  }

  function normalizeRa(value) {
    return TextUtil.text(value).toUpperCase();
  }

  function coerceNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : '';
    var raw = TextUtil.text(value);
    if (!raw) return '';

    var normalized = raw.replace(/\s/g, '');
    if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(normalized)) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if (/^-?\d+,\d+$/.test(normalized)) {
      normalized = normalized.replace(',', '.');
    } else if (/^-?\d{1,3}(,\d{3})*\.\d+$/.test(normalized)) {
      normalized = normalized.replace(/,/g, '');
    }

    var parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : raw;
  }

  function literalValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') return value;
    return value.charAt(0) === '=' ? "'" + value : value;
  }

  function normalizeSourceRows(type, rows) {
    var definition = schema(type);
    var numeric = {};
    definition.numericSourceFields.forEach(function (field) { numeric[field] = true; });
    return (rows || []).map(function (row) {
      var normalized = new Array(definition.sourceHeaders.length).fill('');
      for (var i = 0; i < definition.sourceHeaders.length; i++) {
        var value = Array.isArray(row) && i < row.length ? row[i] : '';
        normalized[i] = numeric[definition.sourceHeaders[i]] ? coerceNumber(value) : literalValue(value);
      }
      return normalized;
    });
  }

  function publicSchema(definition) {
    return {
      type: definition.type,
      label: definition.label,
      requiresSemester: Boolean(definition.requiresSemester),
      sourceHeaders: definition.sourceHeaders.slice(),
      requiredFields: definition.requiredFields.slice()
    };
  }

  function publicSchemas() {
    return [TYPES.ANNUAL, TYPES.SEMESTRAL, TYPES.CENID].map(function (type) {
      return publicSchema(schema(type));
    });
  }

  return Object.freeze({
    OPERATIONS: OPERATIONS,
    TYPES: TYPES,
    schema: schema,
    normalizeOperation: normalizeOperation,
    normalizeYear: normalizeYear,
    normalizeContext: normalizeContext,
    normalizeHeaderKey: normalizeHeaderKey,
    indexByHeader: indexByHeader,
    targetIndexMap: targetIndexMap,
    sourceIndexMap: sourceIndexMap,
    normalizeRa: normalizeRa,
    coerceNumber: coerceNumber,
    normalizeSourceRows: normalizeSourceRows,
    publicSchemas: publicSchemas
  });
})();
