var PrizeModel = (function () {
  function normalizeCategory_(value) {
    var category = TextUtil.text(value).toUpperCase();
    if (!category) return CONFIG.PRIZE_CATEGORIES.REGULAR;
    return category;
  }

  function categories() {
    return [
      CONFIG.PRIZE_CATEGORIES.REGULAR,
      CONFIG.PRIZE_CATEGORIES.COMPLEMENTARY,
      CONFIG.PRIZE_CATEGORIES.EXTRAORDINARY
    ];
  }

  function normalize(data) {
    var source = data || {};
    return {
      id: TextUtil.text(source.id),
      description: TextUtil.text(source.description),
      category: normalizeCategory_(source.category),
      status: TextUtil.text(source.status).toUpperCase()
    };
  }

  function isAllowedStatus(status) {
    return [CONFIG.PRIZE_STATUS.ACTIVE, CONFIG.PRIZE_STATUS.INACTIVE]
      .indexOf(TextUtil.text(status).toUpperCase()) >= 0;
  }

  function isAllowedCategory(category) {
    return categories().indexOf(normalizeCategory_(category)) >= 0;
  }

  function validate(prize, options) {
    var opts = options || {};
    var normalized = normalize(prize);
    if (opts.requireId && !normalized.id) throw new Error('Prêmio inválido: ID não informado.');
    if (!normalized.description) throw new Error('Informe a descrição do prêmio.');
    if (!isAllowedCategory(normalized.category)) throw new Error('Categoria do prêmio inválida.');
    if (!isAllowedStatus(normalized.status)) throw new Error('Situação do prêmio inválida.');
    return normalized;
  }

  return Object.freeze({
    normalize: normalize,
    validate: validate,
    isAllowedStatus: isAllowedStatus,
    isAllowedCategory: isAllowedCategory,
    categories: categories
  });
})();
