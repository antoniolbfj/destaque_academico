/**
 * Serviço da vitrine pública de premiados.
 * Somente campos explicitamente permitidos podem sair pelo endpoint público.
 */
var PublicAwardeeService = (function () {
  function props_() { return PropertiesService.getScriptProperties(); }
  function cfg_() { return CONFIG.PUBLIC_PORTAL || {}; }

  function fieldDefinitions_() {
    return [
      { key: 'nome', label: 'Nome', source: 'name', type: 'text', filterable: 'search' },
      { key: 'curso', label: 'Curso', source: 'course', type: 'text', filterable: 'course' },
      { key: 'periodo', label: 'Período', source: 'coursePeriod', type: 'text' },
      { key: 'turma', label: 'Turma', source: 'classGroup', type: 'text' },
      { key: 'premio', label: 'Prêmio', source: 'prize', type: 'text', filterable: 'prize' },
      { key: 'categoria', label: 'Categoria', source: '__category', type: 'text', filterable: 'category' },
      { key: 'regime', label: 'Regime', source: 'regime', type: 'text', filterable: 'regime' },
      { key: 'ano', label: 'Ano', source: 'year', type: 'number', filterable: 'year' },
      { key: 'semestre', label: 'Semestre', source: 'semester', type: 'text' },
      { key: 'idioma', label: 'Idioma', source: 'language', type: 'text' },
      { key: 'media', label: 'Média apurada', source: 'average', type: 'number' },
      { key: 'frequencia', label: 'Frequência', source: 'frequency', type: 'number' },
      { key: 'posicao', label: 'Posição', source: 'position', type: 'number' },
      { key: 'situacao', label: 'Situação', source: 'status', type: 'text', filterable: 'status' }
    ];
  }

  function fieldMap_() {
    var map = {};
    fieldDefinitions_().forEach(function (field) { map[field.key] = field; });
    return map;
  }

  function defaultConfiguration_() {
    return {
      enabled: true,
      title: cfg_().DEFAULT_TITLE || 'Premiados — Destaque Acadêmico',
      subtitle: cfg_().DEFAULT_SUBTITLE || 'Conheça os estudantes reconhecidos pelo Destaque Acadêmico.',
      fields: (cfg_().DEFAULT_FIELDS || ['nome','curso','periodo','turma','premio','categoria','ano','regime']).slice(),
      updatedAt: '',
      updatedBy: ''
    };
  }

  function normalizeText_(value, max) {
    var text = TextUtil.text(value);
    return max && text.length > max ? text.slice(0, max) : text;
  }

  function sanitizeFields_(fields) {
    var allowed = fieldMap_();
    var seen = {};
    var result = [];
    (Array.isArray(fields) ? fields : []).forEach(function (key) {
      var normalized = TextUtil.text(key);
      if (!allowed[normalized] || seen[normalized]) return;
      seen[normalized] = true;
      result.push(normalized);
    });
    if (!result.length) result = defaultConfiguration_().fields.filter(function (key) { return Boolean(allowed[key]); });
    return result;
  }

  function normalizeConfiguration_(input) {
    var base = defaultConfiguration_();
    var source = input && typeof input === 'object' ? input : {};
    return {
      enabled: source.enabled === undefined ? base.enabled : Boolean(source.enabled),
      title: normalizeText_(source.title || base.title, 120),
      subtitle: normalizeText_(source.subtitle || base.subtitle, 300),
      fields: sanitizeFields_(source.fields || base.fields),
      updatedAt: normalizeText_(source.updatedAt, 80),
      updatedBy: normalizeText_(source.updatedBy, 180)
    };
  }

  function readConfiguration_() {
    var raw = props_().getProperty(cfg_().CONFIG_PROPERTY || 'TOPPLUS_PUBLIC_AWARDEE_CONFIG_V1');
    if (!raw) return defaultConfiguration_();
    try { return normalizeConfiguration_(JSON.parse(raw)); }
    catch (error) { return defaultConfiguration_(); }
  }

  function writeConfiguration_(configuration) {
    var normalized = normalizeConfiguration_(configuration);
    props_().setProperty(cfg_().CONFIG_PROPERTY || 'TOPPLUS_PUBLIC_AWARDEE_CONFIG_V1', JSON.stringify(normalized));
    PerformanceCache.remove(cfg_().CACHE_KEY || 'TOPPLUS_PUBLIC_AWARDEE_PORTAL_V1');
    return normalized;
  }

  function ensureDefaultConfiguration() {
    var key = cfg_().CONFIG_PROPERTY || 'TOPPLUS_PUBLIC_AWARDEE_CONFIG_V1';
    var existing = props_().getProperty(key);
    if (existing) {
      try {
        var current = normalizeConfiguration_(JSON.parse(existing));
        return { created: false, repaired: false, configuration: current };
      } catch (error) {
        var repaired = writeConfiguration_(defaultConfiguration_());
        return { created: false, repaired: true, configuration: repaired };
      }
    }
    var configuration = writeConfiguration_(defaultConfiguration_());
    return { created: true, repaired: false, configuration: configuration };
  }

  function validateConfiguration() {
    var configuration = readConfiguration_();
    var allowed = fieldMap_();
    var issues = [];
    if (!configuration.title) issues.push('O título da página pública não está configurado.');
    if (!configuration.fields.length) issues.push('A página pública não possui campos configurados.');
    configuration.fields.forEach(function (key) {
      if (!allowed[key]) issues.push('Campo público inválido: ' + key + '.');
    });
    return { ok: issues.length === 0, issues: issues, configuration: configuration, fieldCount: configuration.fields.length };
  }

  function publishedRecords_() {
    var prizeMap = {};
    PrizeDAO.list().forEach(function (prize) { prizeMap[prize.id] = prize; });
    return AwardeeDAO.list().filter(function (record) {
      return record.status === CONFIG.RECORD_STATUS.PUBLISHED || record.status === CONFIG.RECORD_STATUS.APPROVED;
    }).map(function (record) {
      var prize = prizeMap[record.prizeId] || null;
      var row = { __category: prize ? prize.category : '' };
      fieldDefinitions_().forEach(function (field) {
        if (field.source === '__category') return;
        row[field.source] = record[field.source];
      });
      return row;
    });
  }

  function distinct_(rows, source) {
    var values = {};
    rows.forEach(function (row) {
      var value = row[source];
      if (value === null || value === undefined || TextUtil.text(value) === '') return;
      values[String(value)] = value;
    });
    return Object.keys(values).map(function (key) { return values[key]; }).sort(function (a, b) {
      if (typeof a === 'number' && typeof b === 'number') return b - a;
      return TextUtil.localeComparePt(a, b);
    });
  }

  function normalizeFilters_(filters) {
    var f = filters && typeof filters === 'object' ? filters : {};
    return {
      search: normalizeText_(f.search, 120).toLocaleLowerCase('pt-BR'),
      year: normalizeText_(f.year, 10),
      course: normalizeText_(f.course, 220),
      prize: normalizeText_(f.prize, 220),
      category: normalizeText_(f.category, 80),
      regime: normalizeText_(f.regime, 80),
      status: normalizeText_(f.status, 80)
    };
  }

  function matches_(row, filters, selected) {
    if (filters.search && selected.nome && String(row.name || '').toLocaleLowerCase('pt-BR').indexOf(filters.search) < 0) return false;
    if (filters.year && selected.ano && String(row.year || '') !== filters.year) return false;
    if (filters.course && selected.curso && String(row.course || '') !== filters.course) return false;
    if (filters.prize && selected.premio && String(row.prize || '') !== filters.prize) return false;
    if (filters.category && selected.categoria && String(row.__category || '') !== filters.category) return false;
    if (filters.regime && selected.regime && String(row.regime || '') !== filters.regime) return false;
    if (filters.status && selected.situacao && String(row.status || '') !== filters.status) return false;
    return true;
  }

  function project_(row, fields) {
    var map = fieldMap_();
    var projected = {};
    fields.forEach(function (key) {
      var def = map[key];
      if (!def) return;
      projected[key] = def.source === '__category' ? row.__category : row[def.source];
    });
    return projected;
  }

  function portalPayload_(filters) {
    var configuration = readConfiguration_();
    var map = fieldMap_();
    var fields = configuration.fields.map(function (key) { return map[key]; }).filter(Boolean);
    if (!configuration.enabled) {
      return { enabled: false, title: configuration.title, subtitle: configuration.subtitle, fields: fields, filters: [], records: [], total: 0 };
    }

    var rows = publishedRecords_();
    var selected = {};
    configuration.fields.forEach(function (key) { selected[key] = true; });
    var normalizedFilters = normalizeFilters_(filters);
    var visible = rows.filter(function (row) { return matches_(row, normalizedFilters, selected); });
    visible.sort(function (a, b) {
      return Number(b.year || 0) - Number(a.year || 0) || TextUtil.localeComparePt(a.name, b.name) || TextUtil.localeComparePt(a.prize, b.prize);
    });

    var filterDefs = [];
    fields.forEach(function (field) {
      if (!field.filterable || field.filterable === 'search') return;
      var source = field.source === '__category' ? '__category' : field.source;
      filterDefs.push({ key: field.filterable, label: field.label, values: distinct_(rows, source) });
    });
    if (selected.nome) filterDefs.unshift({ key: 'search', label: 'Pesquisar por nome', values: [] });

    return {
      enabled: true,
      title: configuration.title,
      subtitle: configuration.subtitle,
      fields: fields,
      filters: filterDefs,
      records: visible.map(function (row) { return project_(row, configuration.fields); }),
      total: visible.length
    };
  }

  function getPublicPortal(filters) {
    // O cache só é usado quando não há filtros; evita leituras desnecessárias sem
    // misturar resultados de diferentes consultas.
    var normalized = normalizeFilters_(filters);
    var hasFilters = Object.keys(normalized).some(function (key) { return Boolean(normalized[key]); });
    if (!hasFilters) {
      var cached = PerformanceCache.getJson(cfg_().CACHE_KEY || 'TOPPLUS_PUBLIC_AWARDEE_PORTAL_V1');
      if (cached) return cached;
      var payload = portalPayload_({});
      PerformanceCache.putJson(cfg_().CACHE_KEY || 'TOPPLUS_PUBLIC_AWARDEE_PORTAL_V1', payload, cfg_().CACHE_TTL_SECONDS || 60);
      return payload;
    }
    return portalPayload_(normalized);
  }

  function getAdminWorkspace(actor) {
    AuthorizationService.requireManagePublicPortal(actor);
    var configuration = readConfiguration_();
    var prizeMap = {};
    PrizeDAO.list().forEach(function (prize) { prizeMap[prize.id] = prize; });
    var preview = AwardeeDAO.list().filter(function (record) {
      return record.status === CONFIG.RECORD_STATUS.PUBLISHED || record.status === CONFIG.RECORD_STATUS.APPROVED;
    }).slice().sort(function (a, b) {
      return Number(b.year || 0) - Number(a.year || 0) || TextUtil.localeComparePt(a.name, b.name);
    }).slice(0, 8).map(function (record) {
      var row = {};
      fieldDefinitions_().forEach(function (field) {
        row[field.key] = field.source === '__category' ? ((prizeMap[record.prizeId] || {}).category || '') : record[field.source];
      });
      return row;
    });
    return {
      actor: UserModel.publicIdentity(actor),
      configuration: configuration,
      fields: fieldDefinitions_(),
      previewRecords: preview,
      publicStatuses: [CONFIG.RECORD_STATUS.PUBLISHED, CONFIG.RECORD_STATUS.APPROVED]
    };
  }

  function saveConfiguration(actor, payload) {
    AuthorizationService.requireManagePublicPortal(actor);
    return LockExecutor.withScriptLock(function () {
      var incoming = normalizeConfiguration_(payload || {});
      incoming.updatedAt = PermanentRecordModel.nowIso();
      incoming.updatedBy = actor.email || actor.name || '';
      var saved = writeConfiguration_(incoming);
      return getAdminWorkspace(actor);
    });
  }

  function invalidateCache() {
    PerformanceCache.remove(cfg_().CACHE_KEY || 'TOPPLUS_PUBLIC_AWARDEE_PORTAL_V1');
  }

  return Object.freeze({
    getPublicPortal: getPublicPortal,
    getAdminWorkspace: getAdminWorkspace,
    saveConfiguration: saveConfiguration,
    ensureDefaultConfiguration: ensureDefaultConfiguration,
    validateConfiguration: validateConfiguration,
    invalidateCache: invalidateCache,
    fieldDefinitions: function () { return fieldDefinitions_().map(function (x) { var copy={}; Object.keys(x).forEach(function(k){copy[k]=x[k];}); return copy; }); }
  });
})();
