var AwardeeWorkspaceService = (function () {
  function activePrizes_() {
    return PrizeDAO.list().filter(function (p) {
      return p.status === CONFIG.PRIZE_STATUS.ACTIVE && p.category === CONFIG.PRIZE_CATEGORIES.COMPLEMENTARY;
    });
  }

  function isSourceRecord_(record) {
    if (record.origin === CONFIG.AWARDEE_ORIGINS.AWARDEES) return record.status === CONFIG.RECORD_STATUS.PUBLISHED;
    if (record.origin === CONFIG.AWARDEE_ORIGINS.MANUAL) {
      return record.status === CONFIG.RECORD_STATUS.PUBLISHED || record.status === CONFIG.RECORD_STATUS.APPROVED;
    }
    return record.status === CONFIG.RECORD_STATUS.APPROVED;
  }

  function isDraftAdditional_(record) {
    return record.origin === CONFIG.AWARDEE_ORIGINS.AWARDEES && record.status === CONFIG.RECORD_STATUS.UNDER_REVIEW;
  }

  function sortRecords_(rows) {
    return rows.sort(function (a, b) {
      return Number(b.year || 0) - Number(a.year || 0) ||
        String(b.publishedAt || b.approvedAt || b.registeredAt || '').localeCompare(String(a.publishedAt || a.approvedAt || a.registeredAt || '')) ||
        TextUtil.localeComparePt(a.name, b.name);
    });
  }

  function publicRecord_(r) {
    return {
      id: r.id, prizeId: r.prizeId, prize: r.prize, regime: r.regime, year: r.year, semester: r.semester,
      ra: r.ra, name: r.name, course: r.course, coursePeriod: r.coursePeriod, classGroup: r.classGroup,
      language: r.language, average: r.average, frequency: r.frequency,
      classificationIndicator: r.classificationIndicator, classificationValue: r.classificationValue,
      position: r.position, justification: r.justification, status: r.status, origin: r.origin,
      registeredAt: r.registeredAt, publishedAt: r.publishedAt, approvedAt: r.approvedAt,
      isAdditional: r.origin === CONFIG.AWARDEE_ORIGINS.AWARDEES,
      isManual: r.origin === CONFIG.AWARDEE_ORIGINS.MANUAL
    };
  }

  function getWorkspace(actor) {
    AuthorizationService.requireManageRecords(actor);
    var all = AwardeeDAO.list();
    var source = sortRecords_(all.filter(isSourceRecord_)).map(publicRecord_);
    var drafts = sortRecords_(all.filter(isDraftAdditional_)).map(publicRecord_);
    var publishedAdditional = all.filter(function (r) {
      return r.origin === CONFIG.AWARDEE_ORIGINS.AWARDEES && r.status === CONFIG.RECORD_STATUS.PUBLISHED;
    });
    return {
      actor: UserModel.publicIdentity(actor),
      records: source,
      drafts: drafts,
      prizes: activePrizes_(),
      lifecycle: {
        status: drafts.length ? CONFIG.RECORD_STATUS.UNDER_REVIEW :
          (publishedAdditional.length ? CONFIG.RECORD_STATUS.PUBLISHED : CONFIG.RECORD_STATUS.UNDER_REVIEW),
        draftCount: drafts.length,
        publishedAdditionalCount: publishedAdditional.length,
        latestPublishedAt: publishedAdditional.reduce(function (latest, r) {
          return String(r.publishedAt || '') > String(latest || '') ? r.publishedAt : latest;
        }, '')
      }
    };
  }

  function awardYear_() {
    return Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy'));
  }

  function saveBatch(actor, payload) {
    AuthorizationService.requireManageRecords(actor);
    var items = payload && Array.isArray(payload.awardees) ? payload.awardees : [];
    if (!items.length) throw new Error('Nenhuma premiação complementar foi informada.');

    return LockExecutor.withScriptLock(function () {
      var all = AwardeeDAO.list({ bypassCache: true });
      var source = all.filter(isSourceRecord_);
      var sourceByRa = {};
      source.forEach(function (r) { (sourceByRa[r.ra] || (sourceByRa[r.ra] = [])).push(r); });
      var prizes = {};
      activePrizes_().forEach(function (p) { prizes[p.id] = p; });
      var draftKeys = {};
      all.filter(isDraftAdditional_).forEach(function (r) { draftKeys[r.ra + '|' + r.prizeId] = true; });
      var now = PermanentRecordModel.nowIso();
      var year = awardYear_();
      var created = [];

      items.forEach(function (item) {
        var ra = TextUtil.text(item.ra).toUpperCase();
        var baseRows = sourceByRa[ra] || [];
        if (!ra || !baseRows.length) throw new Error('O estudante informado não faz parte do histórico de premiados publicado/homologado.');
        var prize = prizes[TextUtil.text(item.prizeId)];
        if (!prize) throw new Error('A tela Premiados só pode conceder prêmios COMPLEMENTARES ativos.');
        var key = ra + '|' + prize.id;
        if (draftKeys[key]) throw new Error('Já existe uma premiação complementar EM APURAÇÃO para ' + TextUtil.text(item.name || baseRows[0].name) + ' com o prêmio "' + prize.description + '".');

        var record = AwardeeModel.validate({
          id: Utilities.getUuid(), prizeId: prize.id, prize: prize.description,
          origin: CONFIG.AWARDEE_ORIGINS.AWARDEES,
          regime: '', year: year, semester: null,
          ra: ra, name: item.name || baseRows[0].name, course: item.course || baseRows[0].course,
          coursePeriod: item.coursePeriod, classGroup: item.classGroup, language: item.language,
          average: null, frequency: null,
          classificationIndicator: item.classificationIndicator,
          classificationValue: item.classificationValue,
          position: item.position, justification: item.justification,
          status: CONFIG.RECORD_STATUS.UNDER_REVIEW,
          registeredAt: now, registeredByEmail: actor.email, registeredByName: actor.name,
          publishedAt: '', publishedByEmail: '', publishedByName: '',
          approvedAt: '', approvedByEmail: '', approvedByName: '', packageId: '', administrativeReference: ''
        }, { requireId: true });
        created.push(record);
        draftKeys[key] = true;
      });

      AwardeeDAO.appendMany(created);
      return getWorkspace(actor);
    });
  }

  function removeDraft(actor, recordId) {
    AuthorizationService.requireManageRecords(actor);
    var id = TextUtil.text(recordId);
    if (!id) throw new Error('Premiação complementar inválida.');
    return LockExecutor.withScriptLock(function () {
      var record = AwardeeDAO.findById(id, { bypassCache: true });
      if (!record) throw new Error('A premiação complementar não foi encontrada.');
      if (!isDraftAdditional_(record)) throw new Error('Somente prêmios complementares EM APURAÇÃO podem ser retirados desta mesa.');
      AwardeeDAO.remove(id);
      return getWorkspace(actor);
    });
  }

  function publish(actor) {
    AuthorizationService.requireManageRecords(actor);
    return LockExecutor.withScriptLock(function () {
      var all = AwardeeDAO.list({ bypassCache: true });
      var drafts = all.filter(isDraftAdditional_);
      if (!drafts.length) throw new Error('Não há prêmios complementares EM APURAÇÃO para publicar.');
      var now = PermanentRecordModel.nowIso();
      drafts.forEach(function (record) {
        record.status = CONFIG.RECORD_STATUS.PUBLISHED;
        record.publishedAt = now;
        record.publishedByEmail = actor.email;
        record.publishedByName = actor.name;
      });
      AwardeeDAO.replaceAll(all);
      return getWorkspace(actor);
    });
  }

  return Object.freeze({ getWorkspace: getWorkspace, saveBatch: saveBatch, removeDraft: removeDraft, publish: publish });
})();
