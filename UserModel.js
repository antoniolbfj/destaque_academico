var UserModel = (function () {
  function normalize(data) {
    var source = data || {};
    return {
      name: TextUtil.text(source.name),
      profile: TextUtil.text(source.profile),
      email: TextUtil.normalizeEmail(source.email),
      isOwner: Boolean(source.isOwner)
    };
  }

  function isAllowedProfile(profile) {
    return [
      CONFIG.USER_PROFILES.SUPERUSER,
      CONFIG.USER_PROFILES.ADMIN,
      CONFIG.USER_PROFILES.CGAE_SUPERVISOR
    ].indexOf(profile) >= 0;
  }

  function validate(user) {
    var normalized = normalize(user);
    if (!normalized.name) throw new Error('Informe o nome do usuário.');
    if (!TextUtil.isValidEmail(normalized.email)) throw new Error('Informe um e-mail válido.');
    if (!isAllowedProfile(normalized.profile)) throw new Error('Perfil de usuário inválido.');
    return normalized;
  }

  function publicIdentity(user) {
    return user ? { name: user.name, profile: user.profile, email: user.email } : null;
  }

  return Object.freeze({
    normalize: normalize,
    validate: validate,
    isAllowedProfile: isAllowedProfile,
    publicIdentity: publicIdentity
  });
})();
