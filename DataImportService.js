var DataImportService = (function () {
  function getAdminContext(actor, yearValue) {
    AuthorizationService.requireManageData(actor);
    var context = {
      actor: UserModel.publicIdentity(actor),
      operations: [
        { value: DataImportModel.OPERATIONS.NEW, label: 'Novo' },
        { value: DataImportModel.OPERATIONS.UPDATE, label: 'Atualizar' },
        { value: DataImportModel.OPERATIONS.DELETE, label: 'Excluir' }
      ],
      schemas: DataImportModel.publicSchemas(),
      defaultHeaderRow: 1,
      maxChunkRows: Math.max(100, Number(CONFIG.PERFORMANCE.IMPORT_UPLOAD_CHUNK_ROWS) || 1000)
    };

    // Reutiliza o RPC já existente para a consulta sob demanda dos conjuntos do ano.
    // Isso evita depender de uma nova função global no deployment do Web App.
    if (yearValue !== '' && yearValue !== null && yearValue !== undefined) {
      context.availableDataSets = listDataSetsByYear(actor, yearValue);
    }

    return context;
  }

  function getDataSetStatus(actor, payload) {
    AuthorizationService.requireManageData(actor);
    var context = DataImportModel.normalizeContext(payload);
    var rows = DataImportDAO.readTarget(context.dataType);
    var summary = DataImportEngine.countContext(context.dataType, rows, context);
    return {
      context: context,
      rowCount: summary.rowCount,
      raCount: summary.raCount
    };
  }

  function listDataSetsByYear(actor, yearValue) {
    AuthorizationService.requireManageData(actor);
    var year = DataImportModel.normalizeYear(yearValue);
    var types = [DataImportModel.TYPES.ANNUAL, DataImportModel.TYPES.SEMESTRAL, DataImportModel.TYPES.CENID];
    var result = [];

    types.forEach(function (type) {
      var rows = DataImportDAO.readTarget(type);
      result = result.concat(DataImportEngine.summarizeByYear(type, rows, year));
    });

    var order = {};
    order[DataImportModel.TYPES.ANNUAL] = 1;
    order[DataImportModel.TYPES.SEMESTRAL] = 2;
    order[DataImportModel.TYPES.CENID] = 3;
    result.sort(function (a, b) {
      var typeDiff = order[a.dataType] - order[b.dataType];
      if (typeDiff) return typeDiff;
      return Number(a.semester || 0) - Number(b.semester || 0);
    });

    return result.map(function (item) {
      var label = item.dataType === DataImportModel.TYPES.SEMESTRAL
        ? 'SEMESTRAL — ' + item.year + '/' + item.semester
        : item.dataType + ' — ' + item.year;
      return {
        key: item.dataType + '|' + item.year + '|' + (item.semester || ''),
        label: label,
        dataType: item.dataType,
        year: item.year,
        semester: item.semester,
        rowCount: item.rowCount,
        raCount: item.raCount
      };
    });
  }

  function begin(actor, payload) {
    AuthorizationService.requireManageData(actor);
    var context = DataImportModel.normalizeContext(payload);
    if (context.operation === DataImportModel.OPERATIONS.DELETE) {
      throw new Error('A operação EXCLUIR não utiliza arquivos de importação.');
    }
    RecordLifecycleService.assertImportAllowed(context);

    return LockExecutor.withScriptLock(function () {
      var job = DataImportDAO.createStage(actor.email, context);
      return { jobId: job.id, maxChunkRows: Math.max(100, Number(CONFIG.PERFORMANCE.IMPORT_UPLOAD_CHUNK_ROWS) || 1000) };
    });
  }

  function requireOwnedJob_(actor, jobId) {
    var id = TextUtil.text(jobId);
    if (!id) throw new Error('Importação temporária inválida.');
    var job = DataImportDAO.getJob(id);
    if (!job) throw new Error('A sessão temporária de importação expirou ou não foi encontrada.');
    if (TextUtil.normalizeEmail(job.actorEmail) !== TextUtil.normalizeEmail(actor.email)) {
      throw new Error('A importação temporária pertence a outro usuário.');
    }
    return job;
  }

  function appendChunk(actor, jobId, rows) {
    AuthorizationService.requireManageData(actor);
    var job = requireOwnedJob_(actor, jobId);
    if (!Array.isArray(rows) || !rows.length) return { acceptedRows: 0 };

    var maxRows = Math.max(100, Number(CONFIG.PERFORMANCE.IMPORT_UPLOAD_CHUNK_ROWS) || 1000);
    if (rows.length > maxRows) throw new Error('O bloco enviado excede o limite de ' + maxRows + ' linhas.');
    var normalized = DataImportModel.normalizeSourceRows(job.context.dataType, rows);

    LockExecutor.withScriptLock(function () {
      DataImportDAO.appendStage(job, normalized);
    });
    return { acceptedRows: normalized.length };
  }

  function preview(actor, jobId) {
    AuthorizationService.requireManageData(actor);
    var job = requireOwnedJob_(actor, jobId);
    var sourceRows = DataImportDAO.readStage(job);
    var existing = DataImportDAO.readTarget(job.context.dataType);
    return DataImportEngine.diagnoseImport(job.context.dataType, existing, sourceRows, job.context);
  }

  function commit(actor, jobId, executionOperation) {
    AuthorizationService.requireManageData(actor);
    var job = requireOwnedJob_(actor, jobId);
    var requestedOperation = job.context.operation;
    var operation = executionOperation === '' || executionOperation === null || executionOperation === undefined
      ? requestedOperation
      : DataImportModel.normalizeOperation(executionOperation);
    if (operation === DataImportModel.OPERATIONS.DELETE) {
      throw new Error('A exclusão não pode ser executada a partir de uma importação temporária.');
    }

    return LockExecutor.withScriptLock(function () {
      try {
        RecordLifecycleService.assertImportAllowed(job.context);
        var type = job.context.dataType;
        var sourceRows = DataImportDAO.readStage(job);
        var existingForDiagnosis = DataImportDAO.readTarget(type);
        var diagnosisContext = {
          operation: operation,
          dataType: job.context.dataType,
          year: job.context.year,
          semester: job.context.semester
        };
        var diagnosis = DataImportEngine.diagnoseImport(type, existingForDiagnosis, sourceRows, diagnosisContext);
        var result;

        if (operation === DataImportModel.OPERATIONS.NEW) {
          var newRows = DataImportEngine.rowsForNew(type, sourceRows, job.context);
          DataImportDAO.appendTarget(type, newRows);
          result = {
            operation: operation,
            requestedOperation: requestedOperation,
            executedOperation: operation,
            diagnosis: diagnosis,
            dataType: type,
            receivedRows: sourceRows.length,
            insertedRows: newRows.length,
            updatedRows: 0,
            unchangedRows: 0,
            changedCells: 0,
            removedRows: 0
          };
        } else if (operation === DataImportModel.OPERATIONS.UPDATE) {
          var merged = DataImportEngine.applySmartUpdate(type, existingForDiagnosis, sourceRows, job.context);
          DataImportDAO.updateTargetRows(type, merged.updatedEntries);
          DataImportDAO.appendTarget(type, merged.insertedTargetRows);
          result = {
            operation: operation,
            requestedOperation: requestedOperation,
            executedOperation: operation,
            diagnosis: diagnosis,
            dataType: type,
            receivedRows: sourceRows.length,
            insertedRows: merged.insertedRows,
            updatedRows: merged.updatedRows,
            unchangedRows: merged.unchangedRows,
            changedCells: merged.changedCells,
            matchedRaCount: merged.matchedRaCount,
            removedRows: 0
          };
        } else {
          throw new Error('Operação de importação inválida.');
        }

        return result;
      } finally {
        DataImportDAO.destroyStage(job);
      }
    });
  }

  function cancel(actor, jobId) {
    AuthorizationService.requireManageData(actor);
    var job = requireOwnedJob_(actor, jobId);
    return LockExecutor.withScriptLock(function () {
      DataImportDAO.destroyStage(job);
      return { cancelled: true };
    });
  }

  function removeDataSet(actor, payload) {
    AuthorizationService.requireManageData(actor);
    var context = DataImportModel.normalizeContext(payload);
    if (context.operation !== DataImportModel.OPERATIONS.DELETE) {
      throw new Error('Operação de exclusão inválida.');
    }

    return LockExecutor.withScriptLock(function () {
      RecordLifecycleService.assertManualDataDeletionAllowed(context);
      var existing = DataImportDAO.readTarget(context.dataType);
      var result = DataImportEngine.deleteContext(context.dataType, existing, context);
      DataImportDAO.replaceTarget(context.dataType, result.rows);
      return {
        operation: context.operation,
        dataType: context.dataType,
        year: context.year,
        semester: context.semester,
        deletedRows: result.deletedRows
      };
    });
  }

  return Object.freeze({
    getAdminContext: getAdminContext,
    getDataSetStatus: getDataSetStatus,
    listDataSetsByYear: listDataSetsByYear,
    begin: begin,
    appendChunk: appendChunk,
    preview: preview,
    commit: commit,
    cancel: cancel,
    removeDataSet: removeDataSet
  });
})();
