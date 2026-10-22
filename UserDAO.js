/** DAO de usuários: única camada que conhece a estrutura física da aba USUÁRIOS. */
var UserDAO = (function () {
  function requiredHeaders_() {
    return [CONFIG.USER_HEADERS.NAME, CONFIG.USER_HEADERS.PROFILE, CONFIG.USER_HEADERS.EMAIL];
  }

  function list(options) {
    var opts = options || {};
    if (!opts.bypassCache) {
      var cached = PerformanceCache.getJson(CONFIG.PERFORMANCE.USER_CACHE_KEY);
      if (cached && Array.isArray(cached)) return cached.map(UserModel.normalize);
    }

    var table = SheetDAO.readTable(CONFIG.USERS_SHEET_NAME, 3);
    var map = SheetDAO.requireHeaders(table.headers, requiredHeaders_(), 'USUÁRIOS');
    var ownerEmail = SpreadsheetGateway.getOwnerEmail();
    var seen = {};
    var users = [];

    table.rows.forEach(function (row) {
      var user = UserModel.normalize({
        name: row[map[CONFIG.USER_HEADERS.NAME]],
        profile: row[map[CONFIG.USER_HEADERS.PROFILE]],
        email: row[map[CONFIG.USER_HEADERS.EMAIL]],
        isOwner: false
      });

      if (!user.name && !user.profile && !user.email) return;
      if (!user.name || !TextUtil.isValidEmail(user.email) || !UserModel.isAllowedProfile(user.profile)) return;
      if (user.profile === CONFIG.USER_PROFILES.SUPERUSER && ownerEmail && user.email !== ownerEmail) return;
      if (seen[user.email]) return;

      user.isOwner = Boolean(ownerEmail && user.email === ownerEmail);
      if (user.isOwner) user.profile = CONFIG.USER_PROFILES.SUPERUSER;
      seen[user.email] = true;
      users.push(user);
    });

    PerformanceCache.putJson(CONFIG.PERFORMANCE.USER_CACHE_KEY, users, CONFIG.PERFORMANCE.USER_CACHE_TTL_SECONDS);
    return users.map(UserModel.normalize);
  }

  function replaceAll(users) {
    var rows = (users || []).map(function (user) {
      var normalized = UserModel.validate(user);
      return [normalized.name, normalized.profile, normalized.email];
    });
    SheetDAO.replaceBody(CONFIG.USERS_SHEET_NAME, rows, 3);
    invalidateCache();
  }

  function invalidateCache() {
    PerformanceCache.remove(CONFIG.PERFORMANCE.USER_CACHE_KEY);
  }

  return Object.freeze({ list: list, replaceAll: replaceAll, invalidateCache: invalidateCache });
})();
