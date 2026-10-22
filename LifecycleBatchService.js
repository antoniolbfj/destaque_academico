/** Persistência dos lotes administrativos. O checkpoint nunca contém a lista de estudantes. */
var LifecycleBatchDAO = (function () {
  var JOB_KEY = 'TOPPLUS_LIFECYCLE_BATCH_V1';

  function getJob() {
    var raw = PropertiesService.getScriptProperties().getProperty(JOB_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function saveJob(job) {
    // Confirma as gravações antes de avançar o checkpoint. Uma repetição escreve
    // as mesmas faixas e os mesmos carimbos, sem duplicar registros.
    SpreadsheetApp.flush();
    PropertiesService.getScriptProperties().setProperty(JOB_KEY, JSON.stringify(job));
  }

  function describe(sheetName, requiredHeaders) {
    var sheet = SpreadsheetGateway.getSheet(sheetName, true);
    var width = Math.max(sheet.getLastColumn(), requiredHeaders.length);
    var headers = sheet.getRange(1, 1, 1, width).getValues()[0];
    SheetDAO.requireHeaders(headers, requiredHeaders, sheetName);
    return { sheetName: sheetName, width: width, rows: Math.max(0, sheet.getLastRow() - 1), headers: headers };
  }

  function readBlock(meta, offset, count) {
    var size = Math.min(count, Math.max(0, meta.rows - offset));
    return size ? SpreadsheetGateway.getSheet(meta.sheetName, true).getRange(offset + 2, 1, size, meta.width).getValues() : [];
  }

  function writeBlock(meta, offset, rows) {
    if (!rows.length) return;
    var sheet = SpreadsheetGateway.getSheet(meta.sheetName, true);
    var required = offset + rows.length + 1;
    if (required > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), required - sheet.getMaxRows());
    if (meta.width > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), meta.width - sheet.getMaxColumns());
    sheet.getRange(offset + 2, 1, rows.length, meta.width).setValues(rows);
  }

  function writeColumns(meta, offset, rows, columns) {
    var sheet = SpreadsheetGateway.getSheet(meta.sheetName, true);
    // O estado vai por último: uma falha entre colunas deixa o registro no
    // estado anterior e a repetição completa também os metadados de auditoria.
    columns.slice(1).concat([columns[0]]).forEach(function (index) {
      sheet.getRange(offset + 2, index + 1, rows.length, 1).setValues(rows.map(function (row) { return [row[index]]; }));
    });
  }

  function clearBlock(meta, offset, count) {
    if (count) SpreadsheetGateway.getSheet(meta.sheetName, true).getRange(offset + 2, 1, count, meta.width).clearContent();
  }

  function ensureStage(job) {
    var existing = SpreadsheetGateway.getSheet(job.stageName, false);
    if (existing) return;
    var sheet = SpreadsheetGateway.getSpreadsheet().insertSheet(job.stageName);
    if (job.data.width > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), job.data.width - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, job.data.width).setValues([job.data.headers]);
    sheet.hideSheet();
    SpreadsheetGateway.reset();
  }

  function removeStage(job) {
    var sheet = SpreadsheetGateway.getSheet(job.stageName, false);
    if (sheet) SpreadsheetGateway.getSpreadsheet().deleteSheet(sheet);
  }

  function assertWritable(sheetName) {
    var job = getJob();
    if (!job || job.done) return;
    if ([job.awardees.sheetName, job.occurrences.sheetName, job.data.sheetName].indexOf(sheetName) >= 0) {
      throw new Error('Há uma publicação ou homologação em lotes em andamento. Retome e conclua o processamento na Mesa de Apuração antes de alterar estes dados.');
    }
  }

  return Object.freeze({ getJob: getJob, saveJob: saveJob, describe: describe, readBlock: readBlock,
    writeBlock: writeBlock, writeColumns: writeColumns, clearBlock: clearBlock,
    ensureStage: ensureStage, removeStage: removeStage, assertWritable: assertWritable });
})();

/** Uma requisição processa no máximo 300 linhas físicas de uma etapa. */
var LifecycleBatchService = (function () {
  var BATCH_SIZE = 300;
  var phases = ['AWARDEES', 'OCCURRENCES', 'PREPARE_CLEANUP', 'COPY_CLEANUP', 'CLEAR_CLEANUP', 'FINISH'];
  var labels = { AWARDEES: 'Atualizando premiados', OCCURRENCES: 'Atualizando ocorrências',
    PREPARE_CLEANUP: 'Preparando a limpeza da base temporária', COPY_CLEANUP: 'Preservando os demais conjuntos',
    CLEAR_CLEANUP: 'Limpando a base temporária', FINISH: 'Finalizando' };

  function phaseSize_(job) {
    if (job.phase === 'AWARDEES') return job.awardees.rows;
    if (job.phase === 'OCCURRENCES') return job.occurrences.rows;
    if (job.phase === 'PREPARE_CLEANUP') return job.data.rows;
    if (job.phase === 'COPY_CLEANUP') return job.keptRows;
    if (job.phase === 'CLEAR_CLEANUP') return job.data.rows - job.keptRows;
    return 0;
  }

  function progress_(job) {
    if (!job) return null;
    var size = phaseSize_(job);
    var totalWork = job.awardees.rows + job.occurrences.rows + (job.target === CONFIG.RECORD_STATUS.APPROVED ? 2 * job.data.rows : 0);
    return { jobId: job.id, context: job.context, workspaceContext: job.workspaceContext, nextStatus: job.target, done: job.done,
      phase: job.phase, phaseLabel: job.done ? 'Concluído' : labels[job.phase],
      processed: job.offset, total: size, batch: Math.min(Math.ceil(job.offset / BATCH_SIZE) + 1, Math.max(1, Math.ceil(size / BATCH_SIZE))),
      totalBatches: Math.max(1, Math.ceil(size / BATCH_SIZE)),
      percent: job.done ? 100 : Math.min(99, Math.floor(100 * job.workDone / Math.max(1, totalWork))),
      processedAwardees: job.processedAwardees, processedOccurrences: job.processedOccurrences,
      deletedRows: job.done ? job.deletedRows : 0,
      summary: { status: job.done ? job.target : 'PROCESSANDO', awardeeCount: job.awardeeCount,
        occurrenceCount: job.occurrenceCount, total: job.awardeeCount + job.occurrenceCount } };
  }

  function activeProgress(actor) {
    AuthorizationService.requireManageRecords(actor);
    var job = LifecycleBatchDAO.getJob();
    return job && !job.done ? progress_(job) : null;
  }

  function start(actor, payload, nextStatus) {
    AuthorizationService.requireManageRecords(actor);
    var context = PermanentRecordModel.normalizeContext({ regime: payload && (payload.regime || payload.dataType), year: payload && payload.year, semester: payload && payload.semester });
    var target = PermanentRecordModel.normalizeStatus(nextStatus);
    var expected = target === CONFIG.RECORD_STATUS.PUBLISHED ? CONFIG.RECORD_STATUS.UNDER_REVIEW :
      (target === CONFIG.RECORD_STATUS.APPROVED ? CONFIG.RECORD_STATUS.PUBLISHED : '');
    if (!expected) throw new Error('Transição de situação inválida.');
    return LockExecutor.withScriptLock(function () {
      var previous = LifecycleBatchDAO.getJob();
      if (previous && !previous.done) {
        if (PermanentRecordModel.contextKey(previous.context) !== PermanentRecordModel.contextKey(context) || previous.target !== target) {
          throw new Error('Conclua o processamento em lotes que já está em andamento antes de iniciar outro contexto.');
        }
        return progress_(previous);
      }
      var awardees = AwardeeDAO.list({ bypassCache: true }).filter(function (r) {
        return r.origin === CONFIG.AWARDEE_ORIGINS.APURATION && PermanentRecordModel.matchesContext(r, context);
      });
      var occurrences = OccurrenceDAO.list({ bypassCache: true }).filter(function (r) { return PermanentRecordModel.matchesContext(r, context); });
      var records = awardees.concat(occurrences);
      if (!records.length) throw new Error('Registre ao menos uma premiação ou ocorrência antes de avançar o resultado.');
      if (records.some(function (r) { return r.status !== expected && r.status !== target; })) {
        throw new Error('Existem registros com situação incompatível com esta transição.');
      }
      // Aceita o estado de destino para concluir uma operação antiga que gravou
      // os registros, mas falhou antes de limpar a base ou devolver a resposta.
      var id = Utilities.getUuid().replace(/-/g, '');
      var job = { id: id, context: context, target: target, expected: expected,
        workspaceContext: { dataType: context.regime, year: context.year, semester: context.semester,
          referenceDate: TextUtil.text(payload.referenceDate), packageId: TextUtil.text(payload.packageId) },
        actorEmail: actor.email, actorName: actor.name, timestamp: PermanentRecordModel.nowIso(),
        awardees: LifecycleBatchDAO.describe(CONFIG.AWARDEES_SHEET_NAME, Object.keys(CONFIG.AWARDEE_HEADERS).map(function (k) { return CONFIG.AWARDEE_HEADERS[k]; })),
        occurrences: LifecycleBatchDAO.describe(CONFIG.OCCURRENCES_SHEET_NAME, Object.keys(CONFIG.OCCURRENCE_HEADERS).map(function (k) { return CONFIG.OCCURRENCE_HEADERS[k]; })),
        data: LifecycleBatchDAO.describe(DataImportModel.schema(context.regime).sheetName, DataImportModel.schema(context.regime).targetHeaders),
        stageName: '__LIFECYCLE_' + id.substring(0, 20), phase: 'AWARDEES', offset: 0, workDone: 0,
        processedAwardees: 0, processedOccurrences: 0, awardeeCount: awardees.length, occurrenceCount: occurrences.length,
        keptRows: 0, deletedRows: 0, done: false };
      LifecycleBatchDAO.saveJob(job);
      return progress_(job);
    });
  }

  function matchesRow_(row, map, h, job, awardee) {
    return (!awardee || TextUtil.text(row[map[h.ORIGIN]]) === CONFIG.AWARDEE_ORIGINS.APURATION) &&
      TextUtil.text(row[map[h.ID]]) && TextUtil.text(row[map[h.REGIME]]) === job.context.regime &&
      Number(row[map[h.YEAR]]) === job.context.year &&
      (job.context.regime !== 'SEMESTRAL' || Number(row[map[h.SEMESTER]]) === job.context.semester);
  }

  function updateRecords_(job, awardee) {
    var meta = awardee ? job.awardees : job.occurrences;
    var h = awardee ? CONFIG.AWARDEE_HEADERS : CONFIG.OCCURRENCE_HEADERS;
    var map = SheetDAO.headerMap(meta.headers);
    var rows = LifecycleBatchDAO.readBlock(meta, job.offset, BATCH_SIZE);
    var published = job.target === CONFIG.RECORD_STATUS.PUBLISHED;
    var columns = [map[h.STATUS], map[published ? h.PUBLISHED_AT : h.APPROVED_AT],
      map[published ? h.PUBLISHED_BY_EMAIL : h.APPROVED_BY_EMAIL], map[published ? h.PUBLISHED_BY_NAME : h.APPROVED_BY_NAME]];
    var matched = 0;
    var changed = false;
    rows.forEach(function (row) {
      if (!matchesRow_(row, map, h, job, awardee)) return;
      matched++;
      var status = TextUtil.text(row[map[h.STATUS]]);
      if (status === job.target) return;
      if (status !== job.expected) throw new Error('A situação de um registro mudou durante o processamento.');
      row[columns[0]] = job.target;
      row[columns[1]] = job.timestamp;
      row[columns[2]] = job.actorEmail;
      row[columns[3]] = job.actorName;
      changed = true;
    });
    if (changed) {
      if (awardee) AwardeeDAO.invalidateCache(); else OccurrenceDAO.invalidateCache();
      LifecycleBatchDAO.writeColumns(meta, job.offset, rows, columns);
      // Em caso de falha do checkpoint, a faixa será repetida na próxima chamada.
      if (awardee) AwardeeDAO.invalidateCache(); else OccurrenceDAO.invalidateCache();
    }
    if (awardee) job.processedAwardees += matched; else job.processedOccurrences += matched;
    job.offset += rows.length;
    job.workDone += rows.length;
  }

  function cleanupBlock_(job) {
    var stage = { sheetName: job.stageName, width: job.data.width, rows: job.keptRows };
    var count;
    if (job.phase === 'PREPARE_CLEANUP') {
      LifecycleBatchDAO.ensureStage(job);
      var map = SheetDAO.headerMap(job.data.headers);
      var rows = LifecycleBatchDAO.readBlock(job.data, job.offset, BATCH_SIZE);
      var kept = rows.filter(function (row) {
        return Number(row[map.ANO]) !== job.context.year ||
          (job.context.regime === 'SEMESTRAL' && Number(row[map.SEMESTRE]) !== job.context.semester);
      });
      LifecycleBatchDAO.writeBlock(stage, job.keptRows, kept);
      job.keptRows += kept.length;
      job.deletedRows += rows.length - kept.length;
      count = rows.length;
    } else if (job.phase === 'COPY_CLEANUP') {
      var copy = LifecycleBatchDAO.readBlock(stage, job.offset, BATCH_SIZE);
      LifecycleBatchDAO.writeBlock(job.data, job.offset, copy);
      count = copy.length;
    } else {
      count = Math.min(BATCH_SIZE, job.data.rows - job.keptRows - job.offset);
      LifecycleBatchDAO.clearBlock(job.data, job.keptRows + job.offset, count);
    }
    job.offset += count;
    job.workDone += count;
  }

  function advance_(job) {
    while (job.phase !== 'FINISH' && job.offset >= phaseSize_(job)) {
      if (job.phase === 'OCCURRENCES' && (job.processedAwardees !== job.awardeeCount || job.processedOccurrences !== job.occurrenceCount)) {
        throw new Error('A quantidade de registros mudou durante o processamento. A base temporária foi preservada.');
      }
      job.phase = phases[phases.indexOf(job.phase) + 1];
      job.offset = 0;
      if (job.phase === 'PREPARE_CLEANUP' && job.target !== CONFIG.RECORD_STATUS.APPROVED) job.phase = 'FINISH';
    }
  }

  function process(actor, jobId) {
    AuthorizationService.requireManageRecords(actor);
    return LockExecutor.withScriptLock(function () {
      var job = LifecycleBatchDAO.getJob();
      if (!job || job.id !== TextUtil.text(jobId)) throw new Error('Processamento não encontrado. Atualize a Mesa de Apuração para consultar a operação atual.');
      if (job.done) return progress_(job);
      advance_(job);
      if (job.phase === 'AWARDEES' || job.phase === 'OCCURRENCES') updateRecords_(job, job.phase === 'AWARDEES');
      else if (job.phase !== 'FINISH') cleanupBlock_(job);
      advance_(job);
      if (job.phase === 'FINISH') {
        if (job.processedAwardees !== job.awardeeCount || job.processedOccurrences !== job.occurrenceCount) {
          throw new Error('A quantidade de registros mudou durante o processamento.');
        }
        if (job.target === CONFIG.RECORD_STATUS.APPROVED) LifecycleBatchDAO.removeStage(job);
        AwardeeDAO.invalidateCache();
        OccurrenceDAO.invalidateCache();
        job.done = true;
      }
      LifecycleBatchDAO.saveJob(job);
      return progress_(job);
    });
  }

  return Object.freeze({ start: start, process: process, activeProgress: activeProgress });
})();
