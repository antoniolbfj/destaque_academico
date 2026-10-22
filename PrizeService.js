var PrizeService = (function () {
  function sort_(rows) {
    rows.sort(function (a, b) {
      var activeA = a.status === CONFIG.PRIZE_STATUS.ACTIVE ? 0 : 1;
      var activeB = b.status === CONFIG.PRIZE_STATUS.ACTIVE ? 0 : 1;
      return activeA - activeB || TextUtil.localeComparePt(a.category, b.category) ||
        TextUtil.localeComparePt(a.description, b.description) || TextUtil.localeComparePt(a.id, b.id);
    });
    return rows;
  }

  function getAdminContext(actor) {
    AuthorizationService.requireManageCruds(actor);
    var prizes = sort_(PrizeDAO.list());
    return {
      actor: UserModel.publicIdentity(actor),
      prizes: prizes,
      statuses: [CONFIG.PRIZE_STATUS.ACTIVE, CONFIG.PRIZE_STATUS.INACTIVE],
      categories: PrizeModel.categories()
    };
  }

  function save(actor, payload) {
    AuthorizationService.requireManageCruds(actor);
    if (!payload || typeof payload !== 'object') throw new Error('Dados do prêmio não informados.');

    return LockExecutor.withScriptLock(function () {
      var incomingId = TextUtil.text(payload.id);
      var prize = PrizeModel.validate({
        id: incomingId,
        description: payload.description,
        category: payload.category,
        status: payload.status
      }, { requireId: Boolean(incomingId) });

      var prizes = PrizeDAO.list({ bypassCache: true });
      var targetIndex = incomingId ? prizes.findIndex(function (item) { return item.id === incomingId; }) : -1;

      if (incomingId && targetIndex < 0) {
        throw new Error('O prêmio selecionado não foi encontrado. Atualize a lista e tente novamente.');
      }

      if (targetIndex >= 0) {
        var existing = prizes[targetIndex];
        var usage = ReferentialIntegrityService.getPrizeUsage(incomingId);
        if (usage && Number(usage.total) > 0 && existing.category !== prize.category) {
          throw new Error('A categoria de um prêmio já utilizado não pode ser alterada. Crie um novo prêmio com a categoria correta.');
        }
      }

      if (!incomingId) prize.id = Utilities.getUuid();
      if (targetIndex >= 0) prizes[targetIndex] = prize;
      else prizes.push(prize);

      PrizeDAO.replaceAll(sort_(prizes));
      return getAdminContext(actor);
    });
  }

  function remove(actor, prizeId) {
    AuthorizationService.requireManageCruds(actor);
    var id = TextUtil.text(prizeId);
    if (!id) throw new Error('Prêmio inválido.');

    return LockExecutor.withScriptLock(function () {
      var prizes = PrizeDAO.list({ bypassCache: true });
      var target = prizes.find(function (item) { return item.id === id; }) || null;
      if (!target) throw new Error('O prêmio selecionado não foi encontrado.');

      var usage = ReferentialIntegrityService.getPrizeUsage(id);
      if (usage && Number(usage.total) > 0) {
        throw new Error('Este prêmio possui vínculo com outros cadastros e não pode ser excluído. Altere a situação para INATIVA.');
      }

      PrizeDAO.replaceAll(prizes.filter(function (item) { return item.id !== id; }));
      return getAdminContext(actor);
    });
  }

  return Object.freeze({ getAdminContext: getAdminContext, save: save, remove: remove });
})();
