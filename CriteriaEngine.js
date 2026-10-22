var CriteriaEngine = (function () {
  function fieldType_(key) {
    var field = CriteriaCatalog.find(key);
    return field ? field.type : 'TEXT';
  }

  function normalizeValue_(value, type) {
    if (type === 'NUMBER') {
      if (value === '' || value === null || value === undefined) return null;
      var n = Number(String(value).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    return TextUtil.text(value).toUpperCase();
  }

  function compare_(left, operator, right, type) {
    var a = normalizeValue_(left, type);
    var b = normalizeValue_(right, type);
    if (type === 'NUMBER' && (a === null || b === null)) return false;
    if (operator === '=') return a === b;
    if (operator === '!=') return a !== b;
    if (operator === '>=') return a >= b;
    if (operator === '<=') return a <= b;
    if (operator === '>') return a > b;
    if (operator === '<') return a < b;
    if (operator === 'CONTÉM') return String(a).indexOf(String(b)) >= 0;
    if (operator === 'NÃO CONTÉM') return String(a).indexOf(String(b)) < 0;
    return false;
  }

  function isRuntimeConfigurationRule_(rule, parameter) {
    var field = CriteriaCatalog.find(rule && rule.field);
    return Boolean(parameter && parameter.operator === CONFIG.PARAMETER_OPERATORS.IGNORE) || Boolean(field && field.kind === 'COMPONENT');
  }

  function evaluate(values, rules, parameters) {
    var paramMap = {};
    (parameters || []).forEach(function (p) { paramMap[p.id] = p; });
    var ordered = (rules || []).slice().sort(function (a, b) { return Number(a.order) - Number(b.order); });
    var eligibleRules = ordered.filter(function (rule) {
      return !isRuntimeConfigurationRule_(rule, paramMap[rule.parameterId]);
    });
    var result = null;
    var passed = 0;
    var details = [];

    eligibleRules.forEach(function (rule) {
      var parameter = paramMap[rule.parameterId];
      var field = CriteriaCatalog.find(rule.field);
      var left = values ? values[rule.field] : null;
      if (!parameter || parameter.status !== CONFIG.PARAMETER_STATUS.ACTIVE) {
        details.push({ passed: false, ignored: true, ruleId: rule.id, field: rule.field,
          fieldLabel: field ? field.label : rule.field, left: left, connector: rule.connector,
          reason: 'Parâmetro inativo ou inexistente.' });
        return;
      }
      var right = parameter.comparisonType === CONFIG.PARAMETER_COMPARISON_TYPES.FIELD
        ? (values ? values[rule.comparisonField] : null)
        : parameter.value;
      var ok = compare_(left, parameter.operator, right, fieldType_(rule.field));
      if (ok) passed++;
      details.push({
        passed: ok, ignored: false, ruleId: rule.id, field: rule.field,
        fieldLabel: field ? field.label : rule.field, operator: parameter.operator,
        comparisonType: parameter.comparisonType, left: left, right: right, comparisonField: rule.comparisonField,
        comparisonFieldLabel: (CriteriaCatalog.find(rule.comparisonField) || {}).label || rule.comparisonField,
        connector: rule.connector
      });
      if (result === null) result = ok;
      else result = rule.connector === 'OU' ? (result || ok) : (result && ok);
    });

    return {
      active: eligibleRules.length > 0,
      passed: eligibleRules.length ? Boolean(result) : false,
      passedCount: passed,
      ruleCount: eligibleRules.length,
      details: details
    };
  }

  return Object.freeze({ evaluate: evaluate });
})();
