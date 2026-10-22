var SessionService = (function () {
  function key_(token) {
    return CONFIG.AUTH.SESSION_STORAGE_PREFIX + CryptoUtil.sha256Hex(token);
  }

  function create(email) {
    var token = CryptoUtil.sessionToken();
    PerformanceCache.putJson(key_(token), {
      email: TextUtil.normalizeEmail(email),
      issuedAt: Date.now()
    }, CONFIG.AUTH.SESSION_TTL_SECONDS);
    return token;
  }

  function remove(token) {
    var normalized = TextUtil.text(token);
    if (normalized) PerformanceCache.remove(key_(normalized));
  }

  function getUserOptional(token) {
    var normalized = TextUtil.text(token);
    if (!normalized) return null;
    var session = PerformanceCache.getJson(key_(normalized));
    if (!session || !session.email) return null;

    var user = UserService.findByEmail(session.email);
    if (!user) {
      remove(normalized);
      return null;
    }

    PerformanceCache.putJson(key_(normalized), {
      email: user.email,
      issuedAt: session.issuedAt || Date.now()
    }, CONFIG.AUTH.SESSION_TTL_SECONDS);
    return user;
  }

  function requireUser(token) {
    var user = getUserOptional(token);
    if (!user) throw new Error('Sua sessão expirou ou não foi autenticada. Faça login novamente.');
    return user;
  }

  return Object.freeze({ create: create, remove: remove, getUserOptional: getUserOptional, requireUser: requireUser });
})();
