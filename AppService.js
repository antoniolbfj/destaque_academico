var AppService = (function () {
  function getContext(user) {
    return {
      authenticated: true,
      user: UserModel.publicIdentity(user),
      permissions: AuthorizationService.permissionsFor(user),
      app: {
        name: CONFIG.APP_NAME,
        institution: CONFIG.INSTITUTION_NAME,
        mode: CONFIG.APP_MODE_LABEL,
        version: CONFIG.BUILD_VERSION || ''
      }
    };
  }

  return Object.freeze({ getContext: getContext });
})();
