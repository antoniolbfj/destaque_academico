var AwardeeService = (function () {
  function sort_(rows) {
    return rows.sort(function (a, b) {
      return Number(b.year) - Number(a.year) || TextUtil.localeComparePt(a.regime, b.regime) ||
        Number(b.semester || 0) - Number(a.semester || 0) || TextUtil.localeComparePt(a.name, b.name);
    });
  }

  function prizeById_(prizeId) {
    var id = TextUtil.text(prizeId);
    var prize = PrizeDAO.list().find(function (item) { return item.id === id; }) || null;
    if (!prize) throw new Error('O prêmio informado não foi encontrado.');
    return prize;
  }

  function getAdminContext(actor, filters) {
    AuthorizationService.requireManageRecords(actor);
    var records = AwardeeDAO.list().filter(function (record) { return PermanentRecordModel.matchesFilters(record, filters); });
    return {
      actor: UserModel.publicIdentity(actor),
      records: sort_(records),
      prizes: PrizeDAO.list(),
      statuses: [CONFIG.RECORD_STATUS.UNDER_REVIEW, CONFIG.RECORD_STATUS.PUBLISHED, CONFIG.RECORD_STATUS.APPROVED]
    };
  }

  function save(actor, payload) {
    AuthorizationService.requireManageRecords(actor);
    if (!payload || typeof payload !== 'object') throw new Error('Dados da premiação não informados.');

    return LockExecutor.withScriptLock(function () {
      var incomingId = TextUtil.text(payload.id);
      var existing = incomingId ? AwardeeDAO.findById(incomingId, { bypassCache: true }) : null;
      if (incomingId && !existing) throw new Error('A premiação selecionada não foi encontrada.');
      if (existing && existing.status !== CONFIG.RECORD_STATUS.UNDER_REVIEW) {
        throw new Error('Somente premiações EM APURAÇÃO podem ser alteradas. Para reverter outro estado, exclua o registro.');
      }

      var prize = prizeById_(payload.prizeId);
      var now = PermanentRecordModel.nowIso();
      var record = AwardeeModel.validate({
        id: incomingId || Utilities.getUuid(),
        prizeId: prize.id,
        origin: existing ? existing.origin : (payload.origin || CONFIG.AWARDEE_ORIGINS.APURATION),
        prize: prize.description,
        regime: payload.regime,
        year: payload.year,
        semester: payload.semester,
        ra: payload.ra,
        name: payload.name,
        course: payload.course,
        coursePeriod: payload.coursePeriod,
        classGroup: payload.classGroup,
        language: payload.language,
        average: payload.average,
        frequency: payload.frequency,
        classificationIndicator: payload.classificationIndicator,
        classificationValue: payload.classificationValue,
        position: payload.position,
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
        approvedByName: existing ? existing.approvedByName : '',
        packageId: existing ? existing.packageId : TextUtil.text(payload.packageId),
        administrativeReference: existing ? existing.administrativeReference : TextUtil.text(payload.administrativeReference)
      }, { requireId: true });

      AwardeeDAO.save(record);
      return getAdminContext(actor, payload.filters || {});
    });
  }

  function remove(actor, recordId, filters) {
    AuthorizationService.requireManageRecords(actor);
    var id = TextUtil.text(recordId);
    if (!id) throw new Error('Premiação inválida.');
    return LockExecutor.withScriptLock(function () {
      var existing = AwardeeDAO.findById(id, { bypassCache: true });
      if (!existing) throw new Error('A premiação selecionada não foi encontrada.');
      AwardeeDAO.remove(id);
      if (existing.status === CONFIG.RECORD_STATUS.PUBLISHED) RecordLifecycleService.reopenAfterPublishedReversal(existing);
      return getAdminContext(actor, filters || {});
    });
  }

  return Object.freeze({ getAdminContext: getAdminContext, save: save, remove: remove });
})();
