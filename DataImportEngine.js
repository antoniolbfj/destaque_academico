/**
 * Motor puro de composição dos conjuntos importados.
 * Processa arrays em memória; não conhece SpreadsheetApp nem interface.
 */
var DataImportEngine = (function () {
  function inContext_(type, row, context) {
    var idx = DataImportModel.targetIndexMap(type);
    if (Number(row[idx.ANO]) !== Number(context.year)) return false;
    if (type === DataImportModel.TYPES.SEMESTRAL) {
      return Number(row[idx.SEMESTRE]) === Number(context.semester);
    }
    return true;
  }

  function makeTargetRow_(type, sourceRow, context) {
    var definition = DataImportModel.schema(type);
    var sourceIdx = DataImportModel.sourceIndexMap(type);
    var targetIdx = DataImportModel.targetIndexMap(type);
    var target = new Array(definition.targetHeaders.length).fill('');

    target[targetIdx.ANO] = Number(context.year);
    if (type === DataImportModel.TYPES.SEMESTRAL) target[targetIdx.SEMESTRE] = Number(context.semester);

    definition.sourceHeaders.forEach(function (header) {
      if (targetIdx[header] !== undefined) target[targetIdx[header]] = sourceRow[sourceIdx[header]];
    });

    return target;
  }

  function rowsForNew(type, sourceRows, context) {
    return (sourceRows || []).map(function (row) { return makeTargetRow_(type, row, context); });
  }

  function isBlank_(value) {
    return value === null || value === undefined || String(value).trim() === '';
  }

  function normalizedText_(value) {
    return TextUtil.text(value).toUpperCase();
  }

  function disciplineIndex_(indexMap) {
    if (indexMap.DISCIPLINA !== undefined) return indexMap.DISCIPLINA;
    if (indexMap.Disciplina !== undefined) return indexMap.Disciplina;
    return -1;
  }

  /**
   * O RA localiza o vínculo acadêmico. Como um RA possui várias linhas de disciplina,
   * a disciplina é usada somente para identificar a linha correta dentro do grupo do RA.
   */
  function rowMatchKey_(row, indexMap) {
    var ra = DataImportModel.normalizeRa(row[indexMap.RA]);
    var subjectIndex = disciplineIndex_(indexMap);
    var subject = subjectIndex >= 0 ? normalizedText_(row[subjectIndex]) : '';
    if (!ra || !subject) return '';
    return ra + '\u241f' + subject;
  }

  function valuesEqual_(a, b) {
    if (a === b) return true;
    if (isBlank_(a) && isBlank_(b)) return true;
    if (typeof a === 'number' && typeof b === 'number') return Number(a) === Number(b);
    return String(a) === String(b);
  }

  /**
   * Merge conservador: vazio recebido nunca apaga valor já existente.
   * Isso permite reimportações incrementais (especialmente no ANUAL) sem perder dados anteriores.
   */
  function mergeTargetRow_(existingRow, incomingRow, definition) {
    var changedCells = 0;
    var merged = existingRow.slice();

    for (var i = 0; i < definition.targetHeaders.length; i++) {
      var header = definition.targetHeaders[i];
      if (header === 'ANO' || header === 'SEMESTRE') continue;
      var incoming = incomingRow[i];
      if (isBlank_(incoming)) continue;
      if (!valuesEqual_(merged[i], incoming)) {
        merged[i] = incoming;
        changedCells++;
      }
    }

    return { row: merged, changedCells: changedCells };
  }

  function applySmartUpdate(type, existingRows, sourceRows, context) {
    var definition = DataImportModel.schema(type);
    var targetIdx = DataImportModel.targetIndexMap(type);
    var sourceIdx = DataImportModel.sourceIndexMap(type);
    var existing = (existingRows || []).map(function (row) { return row.slice(); });
    var exactQueues = {};
    var raQueues = {};

    existing.forEach(function (row, index) {
      if (!inContext_(type, row, context)) return;
      var ra = DataImportModel.normalizeRa(row[targetIdx.RA]);
      if (!ra) return;
      if (!raQueues[ra]) raQueues[ra] = [];
      raQueues[ra].push(index);

      var key = rowMatchKey_(row, targetIdx);
      if (key) {
        if (!exactQueues[key]) exactQueues[key] = [];
        exactQueues[key].push(index);
      }
    });

    var usedExisting = {};
    var updatedRows = 0;
    var unchangedRows = 0;
    var insertedRows = 0;
    var changedCells = 0;
    var matchedRa = {};
    var updatedEntries = [];
    var insertedTargetRows = [];

    (sourceRows || []).forEach(function (sourceRow) {
      var incoming = makeTargetRow_(type, sourceRow, context);
      var ra = DataImportModel.normalizeRa(sourceRow[sourceIdx.RA]);
      var sourceSubjectIndex = disciplineIndex_(sourceIdx);
      var subject = sourceSubjectIndex >= 0 ? normalizedText_(sourceRow[sourceSubjectIndex]) : '';
      var key = ra && subject ? ra + '\u241f' + subject : '';
      var existingIndex = -1;

      if (key && exactQueues[key]) {
        while (exactQueues[key].length && usedExisting[exactQueues[key][0]]) exactQueues[key].shift();
        if (exactQueues[key].length) existingIndex = exactQueues[key].shift();
      }

      // Quando não há disciplina utilizável, só atualiza por RA se houver uma única linha inequívoca ainda livre.
      if (existingIndex < 0 && ra && (!subject || !key)) {
        var candidates = (raQueues[ra] || []).filter(function (index) { return !usedExisting[index]; });
        if (candidates.length === 1) existingIndex = candidates[0];
      }

      if (existingIndex >= 0) {
        usedExisting[existingIndex] = true;
        matchedRa[ra] = true;
        var merged = mergeTargetRow_(existing[existingIndex], incoming, definition);
        existing[existingIndex] = merged.row;
        if (merged.changedCells > 0) {
          updatedRows++;
          changedCells += merged.changedCells;
          updatedEntries.push({ index: existingIndex, row: merged.row.slice() });
        } else {
          unchangedRows++;
        }
      } else {
        existing.push(incoming);
        insertedTargetRows.push(incoming.slice());
        insertedRows++;
      }
    });

    return {
      rows: existing,
      insertedRows: insertedRows,
      updatedRows: updatedRows,
      unchangedRows: unchangedRows,
      changedCells: changedCells,
      matchedRaCount: Object.keys(matchedRa).length,
      updatedEntries: updatedEntries,
      insertedTargetRows: insertedTargetRows,
      removedRows: 0
    };
  }


  function distinctRaSet_(rows, indexMap) {
    var result = {};
    (rows || []).forEach(function (row) {
      var ra = DataImportModel.normalizeRa(row[indexMap.RA]);
      if (ra) result[ra] = true;
    });
    return result;
  }

  /**
   * Diagnóstico sem escrita. A intenção escolhida pelo usuário é confrontada com o
   * contexto real já existente no conjunto. O RA é a chave acadêmica de comparação;
   * a disciplina é usada apenas para estimar linhas alteradas/novas dentro de cada RA.
   */
  function diagnoseImport(type, existingRows, sourceRows, context) {
    var targetIdx = DataImportModel.targetIndexMap(type);
    var sourceIdx = DataImportModel.sourceIndexMap(type);
    var contextRows = (existingRows || []).filter(function (row) { return inContext_(type, row, context); });
    var existingRas = distinctRaSet_(contextRows, targetIdx);
    var sourceRas = distinctRaSet_(sourceRows || [], sourceIdx);
    var sourceRaKeys = Object.keys(sourceRas);
    var existingRaKeys = Object.keys(existingRas);
    var overlappingRaCount = 0;
    var newRaCount = 0;

    sourceRaKeys.forEach(function (ra) {
      if (existingRas[ra]) overlappingRaCount++;
      else newRaCount++;
    });

    var preview = applySmartUpdate(type, existingRows || [], sourceRows || [], context);
    var diagnosisType;
    if (!(sourceRows || []).length || sourceRaKeys.length === 0) {
      diagnosisType = 'INDETERMINADO';
    } else if (contextRows.length === 0) {
      diagnosisType = 'NOVO';
    } else if (overlappingRaCount === 0) {
      diagnosisType = 'EXPANSAO';
    } else if (newRaCount > 0 || preview.insertedRows > 0) {
      diagnosisType = 'ATUALIZACAO_EXPANSAO';
    } else {
      diagnosisType = 'ATUALIZACAO';
    }

    var recommendedOperation = diagnosisType === 'NOVO'
      ? DataImportModel.OPERATIONS.NEW
      : (diagnosisType === 'INDETERMINADO' ? context.operation : DataImportModel.OPERATIONS.UPDATE);

    var labels = {
      NOVO: 'NOVO CONJUNTO',
      ATUALIZACAO: 'ATUALIZAÇÃO',
      EXPANSAO: 'EXPANSÃO',
      ATUALIZACAO_EXPANSAO: 'ATUALIZAÇÃO + EXPANSÃO',
      INDETERMINADO: 'CONTEXTO INDETERMINADO'
    };

    return {
      diagnosisType: diagnosisType,
      diagnosisLabel: labels[diagnosisType],
      selectedOperation: context.operation,
      recommendedOperation: recommendedOperation,
      operationMismatch: context.operation !== recommendedOperation,
      sourceRowCount: (sourceRows || []).length,
      sourceRaCount: sourceRaKeys.length,
      existingRowCount: contextRows.length,
      existingRaCount: existingRaKeys.length,
      overlappingRaCount: overlappingRaCount,
      newRaCount: newRaCount,
      similarityPercent: sourceRaKeys.length ? Math.round((overlappingRaCount / sourceRaKeys.length) * 1000) / 10 : 0,
      preview: {
        insertedRows: preview.insertedRows,
        updatedRows: preview.updatedRows,
        unchangedRows: preview.unchangedRows,
        changedCells: preview.changedCells,
        removedRows: 0
      }
    };
  }

  function deleteContext(type, existingRows, context) {
    var deletedRows = 0;
    var rows = (existingRows || []).filter(function (row) {
      if (inContext_(type, row, context)) {
        deletedRows++;
        return false;
      }
      return true;
    });
    return { rows: rows, deletedRows: deletedRows };
  }

  function countContext(type, rows, context) {
    var idx = DataImportModel.targetIndexMap(type);
    var count = 0;
    var ras = {};
    (rows || []).forEach(function (row) {
      if (!inContext_(type, row, context)) return;
      count++;
      var ra = DataImportModel.normalizeRa(row[idx.RA]);
      if (ra) ras[ra] = true;
    });
    return { rowCount: count, raCount: Object.keys(ras).length };
  }

  function summarizeByYear(type, rows, year) {
    var definition = DataImportModel.schema(type);
    var idx = DataImportModel.targetIndexMap(type);
    var groups = {};

    (rows || []).forEach(function (row) {
      if (Number(row[idx.ANO]) !== Number(year)) return;
      var semester = definition.requiresSemester ? Number(row[idx.SEMESTRE]) : null;
      if (definition.requiresSemester && semester !== 1 && semester !== 2) return;
      var key = definition.requiresSemester ? String(semester) : 'YEAR';
      if (!groups[key]) groups[key] = { rowCount: 0, ras: {} };
      groups[key].rowCount++;
      var ra = DataImportModel.normalizeRa(row[idx.RA]);
      if (ra) groups[key].ras[ra] = true;
    });

    return Object.keys(groups).map(function (key) {
      return {
        dataType: type,
        year: Number(year),
        semester: definition.requiresSemester ? Number(key) : null,
        rowCount: groups[key].rowCount,
        raCount: Object.keys(groups[key].ras).length
      };
    });
  }

  return Object.freeze({
    rowsForNew: rowsForNew,
    applySmartUpdate: applySmartUpdate,
    diagnoseImport: diagnoseImport,
    deleteContext: deleteContext,
    countContext: countContext,
    summarizeByYear: summarizeByYear
  });
})();
