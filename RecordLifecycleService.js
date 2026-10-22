var RecordLifecycleService = (function () {
  function contextFromPayload_(payload) {
    var source = payload || {};
    return PermanentRecordModel.normalizeContext({
      regime: source.regime || source.dataType,
      year: source.year,
      semester: source.semester
    });
  }

  function isApurationAward_(record) {
    return record && record.origin === CONFIG.AWARDEE_ORIGINS.APURATION;
  }

  function recordsForContext_(context) {
    return {
      awardees: AwardeeDAO.list().filter(function (r) {
        return isApurationAward_(r) && PermanentRecordModel.matchesContext(r, context);
      }),
      occurrences: OccurrenceDAO.list().filter(function (r) { return PermanentRecordModel.matchesContext(r, context); })
    };
  }

  function statusSummary(context) {
    var records = recordsForContext_(context);
    var statuses = {};
    records.awardees.concat(records.occurrences).forEach(function (r) { statuses[r.status] = true; });
    var keys = Object.keys(statuses);
    var status = keys.length === 0 ? CONFIG.RECORD_STATUS.UNDER_REVIEW : (keys.length === 1 ? keys[0] : 'MISTO');
    return {
      status: status,
      awardeeCount: records.awardees.length,
      occurrenceCount: records.occurrences.length,
      total: records.awardees.length + records.occurrences.length
    };
  }

  function assertImportAllowed(context) {
    var permanentContext = contextFromPayload_(context);
    var summary = statusSummary(permanentContext);
    if (summary.status === CONFIG.RECORD_STATUS.PUBLISHED || summary.status === CONFIG.RECORD_STATUS.APPROVED || summary.status === 'MISTO') {
      throw new Error('Este contexto possui registros publicados ou homologados. Exclua os registros permanentes correspondentes antes de importar ou atualizar novamente os dados.');
    }
    return summary;
  }

  function assertManualDataDeletionAllowed(context) {
    var permanentContext = contextFromPayload_(context);
    var summary = statusSummary(permanentContext);
    if (summary.total > 0) {
      throw new Error('Há premiações ou ocorrências registradas para este conjunto. A base temporária só pode ser descartada pela homologação ou após a reversão dos registros.');
    }
    return summary;
  }

  function isoDate_(value) {
    return PermanentRecordModel.normalizeDateOnly(value);
  }

  function occurrenceActive_(record, referenceDate) {
    var ref = isoDate_(referenceDate);
    return record.effectiveFrom <= ref && (!record.effectiveTo || record.effectiveTo >= ref);
  }

  function packageIdFor_(context, payload) {
    if (context.regime === DataImportModel.TYPES.ANNUAL) return '';
    var active = ParameterService.activePackages(context.regime);
    var packages = active.packages || [];
    var requested = TextUtil.text(payload && payload.packageId);

    if (context.regime === DataImportModel.TYPES.SEMESTRAL) {
      if (packages.length !== 1) {
        throw new Error(packages.length ? 'Existe mais de um pacote SEMESTRAL ativo. Regularize os pacotes antes de salvar a apuração.' : 'Não existe pacote SEMESTRAL ativo.');
      }
      if (requested && requested !== packages[0].id) throw new Error('O pacote SEMESTRAL informado não está ativo.');
      return packages[0].id;
    }

    if (!requested) return packages.length === 1 ? packages[0].id : '';
    if (!packages.some(function (p) { return p.id === requested; })) throw new Error('O pacote de parâmetros informado não está ativo.');
    return requested;
  }

  function saveBatch(actor, payload) {
    AuthorizationService.requireManageRecords(actor);
    if (!payload || typeof payload !== 'object') throw new Error('Lote de decisões não informado.');
    var context = contextFromPayload_(payload);
    var referenceDate = payload.referenceDate ? isoDate_(payload.referenceDate) : isoDate_(new Date());
    var packageId = packageIdFor_(context, payload);

    return LockExecutor.withScriptLock(function () {
      var summary = statusSummary(context);
      if (summary.status !== CONFIG.RECORD_STATUS.UNDER_REVIEW) {
        throw new Error('Somente resultados EM APURAÇÃO podem receber novas decisões.');
      }

      var existingAwardees = AwardeeDAO.list({ bypassCache: true });
      var existingOccurrences = OccurrenceDAO.list({ bypassCache: true });
      var contextAwardees = existingAwardees.filter(function (r) {
        return isApurationAward_(r) && PermanentRecordModel.matchesContext(r, context);
      });
      var contextOccurrences = existingOccurrences.filter(function (r) { return PermanentRecordModel.matchesContext(r, context); });
      var coursePeriods = context.regime === DataImportModel.TYPES.SEMESTRAL
        ? ApurationEngine.semestralCoursePeriodMap(ApurationDAO.readContext({ dataType: context.regime, year: context.year, semester: context.semester })) : {};
      var prizeMap = {};
      PrizeDAO.list().forEach(function (p) { prizeMap[p.id] = p; });

      var awardKeys = {};
      contextAwardees.forEach(function (r) { awardKeys[r.ra + '|' + r.prizeId] = true; });
      var newAwardees = [];
      var newOccurrences = [];
      var now = PermanentRecordModel.nowIso();

      var incomingOccurrencesByRa = {};
      (payload.occurrences || []).forEach(function (item) {
        var record = OccurrenceModel.validate({
          id: Utilities.getUuid(), regime: context.regime, year: context.year, semester: context.semester,
          ra: item.ra, name: item.name, effectiveFrom: item.effectiveFrom, effectiveTo: item.effectiveTo,
          justification: item.justification, status: CONFIG.RECORD_STATUS.UNDER_REVIEW,
          registeredAt: now, registeredByEmail: actor.email, registeredByName: actor.name,
          publishedAt: '', publishedByEmail: '', publishedByName: '',
          approvedAt: '', approvedByEmail: '', approvedByName: '', packageId: packageId
        }, { requireId: true });
        newOccurrences.push(record);
        if (!incomingOccurrencesByRa[record.ra]) incomingOccurrencesByRa[record.ra] = [];
        incomingOccurrencesByRa[record.ra].push(record);
      });

      (payload.awardees || []).forEach(function (item) {
        var prize = prizeMap[TextUtil.text(item.prizeId)];
        if (!prize || prize.status !== CONFIG.PRIZE_STATUS.ACTIVE || prize.category !== CONFIG.PRIZE_CATEGORIES.REGULAR) {
          throw new Error('A Mesa de Apuração só pode conceder prêmios REGULARES ativos.');
        }
        var ra = TextUtil.text(item.ra).toUpperCase();
        var key = ra + '|' + prize.id;
        if (awardKeys[key]) throw new Error('O estudante ' + TextUtil.text(item.name) + ' já possui o prêmio "' + prize.description + '" neste contexto.');

        var activeOccurrence = contextOccurrences.concat(incomingOccurrencesByRa[ra] || []).some(function (occ) {
          return occurrenceActive_(occ, referenceDate);
        });
        if (activeOccurrence) {
          throw new Error('O estudante ' + TextUtil.text(item.name) + ' possui ocorrência vigente na data de referência e não pode ser premiado enquanto esse registro estiver ativo.');
        }

        var record = AwardeeModel.validate({
          id: Utilities.getUuid(), prizeId: prize.id, prize: prize.description, origin: CONFIG.AWARDEE_ORIGINS.APURATION,
          regime: context.regime, year: context.year, semester: context.semester,
          ra: ra, name: item.name, course: item.course,
          coursePeriod: context.regime === DataImportModel.TYPES.SEMESTRAL ? coursePeriods[ra] : item.coursePeriod,
          classGroup: item.classGroup, language: item.language, average: item.average, frequency: item.frequency,
          classificationIndicator: item.classificationIndicator, classificationValue: item.classificationValue,
          position: item.position, justification: item.justification,
          status: CONFIG.RECORD_STATUS.UNDER_REVIEW, registeredAt: now,
          registeredByEmail: actor.email, registeredByName: actor.name,
          publishedAt: '', publishedByEmail: '', publishedByName: '',
          approvedAt: '', approvedByEmail: '', approvedByName: '',
          packageId: packageId, administrativeReference: ''
        }, { requireId: true });
        newAwardees.push(record);
        awardKeys[key] = true;
      });

      newOccurrences.forEach(function (occ) {
        if (occurrenceActive_(occ, referenceDate) && contextAwardees.some(function (award) { return award.ra === occ.ra; })) {
          throw new Error('O estudante ' + occ.name + ' já possui premiação registrada e a ocorrência está vigente na data de referência. Reverta a premiação ou ajuste a vigência da ocorrência.');
        }
      });

      AwardeeDAO.appendMany(newAwardees);
      OccurrenceDAO.appendMany(newOccurrences);

      return {
        savedAwardees: newAwardees.length,
        savedOccurrences: newOccurrences.length,
        packageId: packageId,
        summary: statusSummary(context)
      };
    });
  }

  function reopenAfterPublishedReversal(context) {
    var normalized = contextFromPayload_(context);
    var allAwardees = AwardeeDAO.list({ bypassCache: true });
    var allOccurrences = OccurrenceDAO.list({ bypassCache: true });
    var changed = false;
    function reopenAward(record) {
      if (!isApurationAward_(record) || !PermanentRecordModel.matchesContext(record, normalized)) return;
      if (record.status !== CONFIG.RECORD_STATUS.PUBLISHED) return;
      record.status = CONFIG.RECORD_STATUS.UNDER_REVIEW;
      record.publishedAt = '';
      record.publishedByEmail = '';
      record.publishedByName = '';
      changed = true;
    }
    function reopenOccurrence(record) {
      if (!PermanentRecordModel.matchesContext(record, normalized)) return;
      if (record.status !== CONFIG.RECORD_STATUS.PUBLISHED) return;
      record.status = CONFIG.RECORD_STATUS.UNDER_REVIEW;
      record.publishedAt = '';
      record.publishedByEmail = '';
      record.publishedByName = '';
      changed = true;
    }
    allAwardees.forEach(reopenAward);
    allOccurrences.forEach(reopenOccurrence);
    if (changed) {
      AwardeeDAO.replaceAll(allAwardees);
      OccurrenceDAO.replaceAll(allOccurrences);
    }
    return changed;
  }

  function transition(actor, payload, nextStatus) {
    return LifecycleBatchService.start(actor, payload, nextStatus);
  }

  return Object.freeze({
    statusSummary: statusSummary,
    assertImportAllowed: assertImportAllowed,
    assertManualDataDeletionAllowed: assertManualDataDeletionAllowed,
    occurrenceActive: occurrenceActive_,
    saveBatch: saveBatch,
    reopenAfterPublishedReversal: reopenAfterPublishedReversal,
    transition: transition
  });
})();
