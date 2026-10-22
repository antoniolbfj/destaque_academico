/** Centraliza verificações de vínculo antes de exclusões físicas. */
var ReferentialIntegrityService = (function () {
  function getPrizeUsage(prizeId) {
    var id = TextUtil.text(prizeId);
    if (!id) return { total: 0, sources: [] };
    var awardees = AwardeeDAO.countByPrizeId(id);
    return {
      total: awardees,
      sources: awardees ? [{ source: CONFIG.AWARDEES_SHEET_NAME, count: awardees }] : []
    };
  }

  return Object.freeze({ getPrizeUsage: getPrizeUsage });
})();
