var OccurrenceService = (function () {
  function sort_(rows) {
    return rows.sort(function (a, b) {
      return Number(b.year) - Number(a.year) || TextUtil.localeComparePt(a.regime, b.regime) ||
        Number(b.semester || 0) - Number(a.semester || 0) || TextUtil.localeComparePt(a.name, b.name) ||
        TextUtil.localeComparePt(a.effectiveFrom, b.effectiveFrom);
    });
  }

  function getAdminContext(actor, filters) {
    AuthorizationService.requireManageRecords(actor);
    var records = OccurrenceDAO.list().filter(function (record) { return PermanentRecordModel.matchesFilters(record, filters); });
    return {
      actor: UserModel.publicIdentity(actor),
      records: sort_(records),
      statuses: [CONFIG.RECORD_STATUS.UNDER_REVIEW, CONFIG.RECORD_STATUS.PUBLISHED, CONFIG.RECORD_STATUS.APPROVED]
    };
  }

  function save(actor, payload) {
    AuthorizationService.requireManageRecords(actor);
    if (!payload || typeof payload !== 'object') throw new Error('Dados da ocorrência não informados.');

    return LockExecutor.withScriptLock(function () {
      var incomingId = TextUtil.text(payload.id);
      var existing = incomingId ? OccurrenceDAO.findById(incomingId, { bypassCache: true }) : null;
      if (incomingId && !existing) throw new Error('A ocorrência selecionada não foi encontrada.');
      if (existing && existing.status !== CONFIG.RECORD_STATUS.UNDER_REVIEW) {
        throw new Error('Somente ocorrências EM APURAÇÃO podem ser alteradas. Para reverter outro estado, exclua o registro.');
      }

      var now = PermanentRecordModel.nowIso();
      var record = OccurrenceModel.validate({
        id: incomingId || Utilities.getUuid(),
        regime: payload.regime,
        year: payload.year,
        semester: payload.semester,
        ra: payload.ra,
        name: payload.name,
        effectiveFrom: payload.effectiveFrom,
        effectiveTo: payload.effectiveTo,
        justification: payload.justification,
        status: existing ? existing.status : CONFIG.RECORD_STATUS.UNDER_REVIEW,
        registeredAt: existing ? existing.registeredAt : now,
        registeredByEmail: existing ? existing.registeredByEmail : actor.email,
        registeredByName: existing ? existing.registeredByName : actor.name,
        publishedAt: existing ? existing.publishedAt : '',
        publishedByEmail: existing ? existing.publishedByEmail : '',
        publishedByName: existing ? existing.publishedByName : '',
        approvedAt: existing ? existing.approvedAt : '',
        approvedByEmail: existing ? existing.approvedByEmail : '',
        approvedByName: existing ? existing.approvedByName : ''
      }, { requireId: true });

      OccurrenceDAO.save(record);
      return getAdminContext(actor, payload.filters || {});
    });
  }

  function remove(actor, recordId, filters) {
    AuthorizationService.requireManageRecords(actor);
    var id = TextUtil.text(recordId);
    if (!id) throw new Error('Ocorrência inválida.');
    return LockExecutor.withScriptLock(function () {
      var existing = OccurrenceDAO.findById(id, { bypassCache: true });
      if (!existing) throw new Error('A ocorrência selecionada não foi encontrada.');
      OccurrenceDAO.remove(id);
      if (existing.status === CONFIG.RECORD_STATUS.PUBLISHED) RecordLifecycleService.reopenAfterPublishedReversal(existing);
      return getAdminContext(actor, filters || {});
    });
  }

  return Object.freeze({ getAdminContext: getAdminContext, save: save, remove: remove });
})();
