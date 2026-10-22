var ParameterService = (function () {
  function sortParameters_(rows) {
    return rows.sort(function (a, b) {
      var sa = a.status === CONFIG.PARAMETER_STATUS.ACTIVE ? 0 : 1;
      var sb = b.status === CONFIG.PARAMETER_STATUS.ACTIVE ? 0 : 1;
      return sa - sb || TextUtil.localeComparePt(a.description, b.description);
    });
  }

  function packageUsage_(packageId) {
    var id = TextUtil.text(packageId);
    var records = AwardeeDAO.list().filter(function (r) { return r.packageId === id; })
      .concat(OccurrenceDAO.list().filter(function (r) { return r.packageId === id; }));
    var summary = { total: records.length, underReview: 0, published: 0, approved: 0 };
    records.forEach(function (r) {
      if (r.status === CONFIG.RECORD_STATUS.UNDER_REVIEW) summary.underReview++;
      else if (r.status === CONFIG.RECORD_STATUS.PUBLISHED) summary.published++;
      else if (r.status === CONFIG.RECORD_STATUS.APPROVED) summary.approved++;
    });
    summary.blocking = summary.underReview + summary.published;
    summary.canDeactivate = summary.blocking === 0;
    summary.immutable = summary.total > 0;
    return summary;
  }

  function packageView_(packages, rules) {
    return packages.map(function (pkg) {
      var item = CriteriaPackageModel.normalizePackage(pkg);
      item.rules = rules.filter(function (rule) { return rule.packageId === pkg.id; })
        .sort(function (a, b) { return Number(a.order) - Number(b.order); });
      item.usage = packageUsage_(item.id);
      return item;
    });
  }

  function getAdminContext(actor) {
    AuthorizationService.requireManageCruds(actor);
    var parameters = sortParameters_(ParameterDAO.list());
    var packages = CriteriaPackageDAO.listPackages().sort(function (a, b) {
      var statusA = a.status === CONFIG.PARAMETER_STATUS.ACTIVE ? 0 : 1;
      var statusB = b.status === CONFIG.PARAMETER_STATUS.ACTIVE ? 0 : 1;
      return statusA - statusB || TextUtil.localeComparePt(a.regime, b.regime) || TextUtil.localeComparePt(a.description, b.description);
    });
    var rules = CriteriaPackageDAO.listRules();
    return {
      actor: UserModel.publicIdentity(actor),
      parameters: parameters,
      packages: packageView_(packages, rules),
      fields: CriteriaCatalog.list(),
      parameterStatuses: [CONFIG.PARAMETER_STATUS.ACTIVE, CONFIG.PARAMETER_STATUS.INACTIVE],
      packageStatuses: [CONFIG.PARAMETER_STATUS.ACTIVE, CONFIG.PARAMETER_STATUS.INACTIVE],
      operators: ParameterModel.OPERATORS.slice(),
      comparisonTypes: [CONFIG.PARAMETER_COMPARISON_TYPES.VALUE, CONFIG.PARAMETER_COMPARISON_TYPES.FIELD],
      regimes: ['SEMESTRAL', 'CENID']
    };
  }

  function parameterLinkedPackages_(parameterId) {
    var id = TextUtil.text(parameterId);
    var rules = CriteriaPackageDAO.listRules({ bypassCache: true }).filter(function (r) { return r.parameterId === id; });
    var packageIds = {};
    rules.forEach(function (r) { packageIds[r.packageId] = true; });
    return CriteriaPackageDAO.listPackages({ bypassCache: true }).filter(function (p) { return packageIds[p.id]; });
  }

  function sameParameter_(a, b) {
    return a && b && a.description === b.description && a.operator === b.operator &&
      a.comparisonType === b.comparisonType && a.value === b.value && a.status === b.status;
  }

  function saveParameter(actor, payload) {
    AuthorizationService.requireManageCruds(actor);
    if (!payload || typeof payload !== 'object') throw new Error('Dados do parâmetro não informados.');
    return LockExecutor.withScriptLock(function () {
      var id = TextUtil.text(payload.id);
      var parameter = ParameterModel.validate({
        id: id, description: payload.description, operator: payload.operator,
        comparisonType: payload.comparisonType, value: payload.value, status: payload.status
      }, { requireId: Boolean(id) });
      var all = ParameterDAO.list({ bypassCache: true });
      var index = id ? all.findIndex(function (p) { return p.id === id; }) : -1;
      if (id && index < 0) throw new Error('O parâmetro selecionado não foi encontrado.');

      if (index >= 0) {
        var existing = all[index];
        var linkedPackages = parameterLinkedPackages_(id);
        var usedByHistoricalPackage = linkedPackages.some(function (pkg) { return packageUsage_(pkg.id).immutable; });
        if (usedByHistoricalPackage && !sameParameter_(existing, parameter)) {
          throw new Error('Este parâmetro integra um pacote já utilizado em apuração e tornou-se imutável. Crie um novo parâmetro para uma nova versão do pacote.');
        }
        if (parameter.status === CONFIG.PARAMETER_STATUS.INACTIVE && linkedPackages.some(function (pkg) { return pkg.status === CONFIG.PARAMETER_STATUS.ACTIVE; })) {
          throw new Error('Este parâmetro está vinculado a um pacote ATIVO e não pode ser inativado.');
        }
      }

      if (!id) parameter.id = Utilities.getUuid();
      if (index >= 0) all[index] = parameter; else all.push(parameter);
      ParameterDAO.replaceAll(sortParameters_(all));
      return getAdminContext(actor);
    });
  }

  function removeParameter(actor, parameterId) {
    AuthorizationService.requireManageCruds(actor);
    var id = TextUtil.text(parameterId);
    if (!id) throw new Error('Parâmetro inválido.');
    return LockExecutor.withScriptLock(function () {
      var rules = CriteriaPackageDAO.listRules({ bypassCache: true });
      if (rules.some(function (r) { return r.parameterId === id; })) {
        throw new Error('Este parâmetro é usado em um pacote e não pode ser excluído. Remova primeiro o vínculo em um pacote ainda não utilizado.');
      }
      var all = ParameterDAO.list({ bypassCache: true });
      if (!all.some(function (p) { return p.id === id; })) throw new Error('Parâmetro não encontrado.');
      ParameterDAO.replaceAll(all.filter(function (p) { return p.id !== id; }));
      return getAdminContext(actor);
    });
  }

  function validateRuleLink_(rule, pkg, parameterMap) {
    var field = CriteriaCatalog.requireField(rule.field, pkg.regime || '');
    var parameter = parameterMap[rule.parameterId];
    if (!parameter) throw new Error('Uma regra referencia um parâmetro inexistente.');
    if (parameter.status !== CONFIG.PARAMETER_STATUS.ACTIVE) throw new Error('Pacotes só podem usar parâmetros ATIVOS.');

    if (parameter.operator === CONFIG.PARAMETER_OPERATORS.IGNORE) {
      if (pkg.regime !== 'SEMESTRAL' || field.key !== 'DISCIPLINA') {
        throw new Error('O operador IGNORAR é exclusivo do campo Componente curricular em pacotes SEMESTRAIS.');
      }
      if (parameter.comparisonType !== CONFIG.PARAMETER_COMPARISON_TYPES.VALUE) {
        throw new Error('O parâmetro de componentes ignorados deve usar comparação por VALOR.');
      }
      return;
    }

    if (field.kind === 'COMPONENT') {
      throw new Error('O campo Componente curricular deve ser usado somente com um parâmetro IGNORAR.');
    }

    if (parameter.comparisonType === CONFIG.PARAMETER_COMPARISON_TYPES.FIELD) {
      if (!rule.comparisonField) throw new Error('Selecione o campo de comparação da regra.');
      CriteriaCatalog.requireField(rule.comparisonField, pkg.regime || '');
    }
  }

  function canonicalRules_(rules) {
    return (rules || []).slice().sort(function (a, b) { return Number(a.order) - Number(b.order); }).map(function (r) {
      return [Number(r.order), r.connector, r.field, r.parameterId, r.comparisonField || ''].join('|');
    }).join('\n');
  }

  function samePackageStructure_(existing, incoming, existingRules, incomingRules) {
    return existing.description === incoming.description && existing.regime === incoming.regime &&
      canonicalRules_(existingRules) === canonicalRules_(incomingRules);
  }

  function assertSingleActive_(packages, pkg) {
    if (pkg.status !== CONFIG.PARAMETER_STATUS.ACTIVE) return;
    var conflict = packages.find(function (p) {
      return p.id !== pkg.id && p.status === CONFIG.PARAMETER_STATUS.ACTIVE && p.regime === pkg.regime;
    });
    if (conflict) {
      throw new Error('Já existe um pacote ATIVO para ' + pkg.regime + ': "' + conflict.description + '". Inative-o antes de ativar outro pacote do mesmo tipo.');
    }
  }

  function savePackage(actor, payload) {
    AuthorizationService.requireManageCruds(actor);
    if (!payload || typeof payload !== 'object') throw new Error('Dados do pacote não informados.');
    return LockExecutor.withScriptLock(function () {
      var id = TextUtil.text(payload.id);
      var pkg = CriteriaPackageModel.validatePackage({
        id: id, description: payload.description, regime: payload.regime, status: payload.status
      }, { requireId: Boolean(id) });
      if (pkg.regime === DataImportModel.TYPES.ANNUAL) {
        throw new Error('O regime ANUAL usa estratégia de cálculo nativa e não utiliza pacote de parâmetros.');
      }
      var packages = CriteriaPackageDAO.listPackages({ bypassCache: true });
      var packageIndex = id ? packages.findIndex(function (p) { return p.id === id; }) : -1;
      if (id && packageIndex < 0) throw new Error('O pacote selecionado não foi encontrado.');
      if (!id) pkg.id = Utilities.getUuid();

      var parameters = ParameterDAO.list({ bypassCache: true });
      var parameterMap = {};
      parameters.forEach(function (p) { parameterMap[p.id] = p; });
      var incomingRules = Array.isArray(payload.rules) ? payload.rules : [];
      var normalizedRules = incomingRules.map(function (rule, index) {
        var normalized = CriteriaPackageModel.validateRule({
          id: TextUtil.text(rule.id) || Utilities.getUuid(), packageId: pkg.id, order: index + 1,
          connector: index === 0 ? 'E' : rule.connector, field: rule.field,
          parameterId: rule.parameterId, comparisonField: rule.comparisonField
        }, { requireId: true });
        validateRuleLink_(normalized, pkg, parameterMap);
        return normalized;
      });

      var allRules = CriteriaPackageDAO.listRules({ bypassCache: true });
      var existingRules = id ? allRules.filter(function (rule) { return rule.packageId === id; }) : [];
      if (packageIndex >= 0) {
        var existing = packages[packageIndex];
        var usage = packageUsage_(id);
        if (usage.immutable) {
          if (!samePackageStructure_(existing, pkg, existingRules, normalizedRules)) {
            throw new Error('Este pacote já foi utilizado em apuração e sua composição é imutável. Inative-o quando todas as apurações estiverem homologadas e crie um novo pacote.');
          }
          if (existing.status === CONFIG.PARAMETER_STATUS.INACTIVE && pkg.status === CONFIG.PARAMETER_STATUS.ACTIVE) {
            throw new Error('Um pacote histórico já utilizado e inativado não pode ser reativado. Crie uma nova versão.');
          }
          if (existing.status === CONFIG.PARAMETER_STATUS.ACTIVE && pkg.status === CONFIG.PARAMETER_STATUS.INACTIVE && !usage.canDeactivate) {
            throw new Error('Este pacote ainda está em uso por apuração EM APURAÇÃO ou PUBLICADA. Ele só pode ser inativado quando todos os registros vinculados estiverem HOMOLOGADOS.');
          }
        }
      }

      assertSingleActive_(packages, pkg);
      if (packageIndex >= 0) packages[packageIndex] = pkg; else packages.push(pkg);
      var mergedRules = allRules.filter(function (rule) { return rule.packageId !== pkg.id; }).concat(normalizedRules);
      CriteriaPackageDAO.replacePackages(packages);
      CriteriaPackageDAO.replaceRules(mergedRules);
      return getAdminContext(actor);
    });
  }

  function removePackage(actor, packageId) {
    AuthorizationService.requireManageCruds(actor);
    var id = TextUtil.text(packageId);
    if (!id) throw new Error('Pacote inválido.');
    return LockExecutor.withScriptLock(function () {
      var packages = CriteriaPackageDAO.listPackages({ bypassCache: true });
      var pkg = packages.find(function (p) { return p.id === id; }) || null;
      if (!pkg) throw new Error('Pacote não encontrado.');
      var usage = packageUsage_(id);
      if (usage.total > 0) throw new Error('Este pacote possui histórico de apuração e não pode ser excluído. Ele deve permanecer para auditoria.');
      CriteriaPackageDAO.replacePackages(packages.filter(function (p) { return p.id !== id; }));
      CriteriaPackageDAO.replaceRules(CriteriaPackageDAO.listRules({ bypassCache: true }).filter(function (r) { return r.packageId !== id; }));
      return getAdminContext(actor);
    });
  }

  function activePackages(regime) {
    var r = TextUtil.text(regime).toUpperCase();
    var parameters = ParameterDAO.list().filter(function (p) { return p.status === CONFIG.PARAMETER_STATUS.ACTIVE; });
    var packages = CriteriaPackageDAO.listPackages().filter(function (pkg) {
      return pkg.status === CONFIG.PARAMETER_STATUS.ACTIVE && pkg.regime === r;
    });
    var rules = CriteriaPackageDAO.listRules();
    return { parameters: parameters, packages: packageView_(packages, rules), fields: CriteriaCatalog.list(r) };
  }

  function splitListValue_(value) {
    var seen = {};
    return String(value || '').split(/[\n;|]+/).map(function (item) { return TextUtil.text(item); }).filter(function (item) {
      var key = item.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function runtimeConfig(packageData) {
    var data = packageData || {};
    var pkg = data.package || null;
    var parameters = data.parameters || [];
    if (!pkg) return { excludedComponents: [] };
    var paramMap = {};
    parameters.forEach(function (p) { paramMap[p.id] = p; });
    var excluded = [];
    (pkg.rules || []).forEach(function (rule) {
      var p = paramMap[rule.parameterId];
      if (!p || p.status !== CONFIG.PARAMETER_STATUS.ACTIVE) return;
      if (rule.field === 'DISCIPLINA' && p.operator === CONFIG.PARAMETER_OPERATORS.IGNORE) {
        excluded = excluded.concat(splitListValue_(p.value));
      }
    });
    return { excludedComponents: splitListValue_(excluded.join('\n')) };
  }

  return Object.freeze({
    getAdminContext: getAdminContext,
    saveParameter: saveParameter,
    removeParameter: removeParameter,
    savePackage: savePackage,
    removePackage: removePackage,
    activePackages: activePackages,
    packageUsage: packageUsage_,
    runtimeConfig: runtimeConfig
  });
})();
