var AuthorizationService = (function () {
  function isSuperuser(user) {
    if (!user || user.profile !== CONFIG.USER_PROFILES.SUPERUSER) return false;
    var ownerEmail = SpreadsheetGateway.getOwnerEmail();
    return ownerEmail ? TextUtil.normalizeEmail(user.email) === ownerEmail : true;
  }

  function permissionsFor(user) {
    var canManageCruds = Boolean(isSuperuser(user) || (user && user.profile === CONFIG.USER_PROFILES.ADMIN));
    return { canManageUsers: canManageCruds, canManageCruds: canManageCruds, canManageData: canManageCruds, canManageRecords: canManageCruds, canManagePublicPortal: canManageCruds };
  }

  function requireManageUsers(user) {
    if (!permissionsFor(user).canManageUsers) {
      throw new Error('Seu perfil não possui permissão para administrar usuários.');
    }
    return user;
  }

  function requireManageCruds(user) {
    if (!permissionsFor(user).canManageCruds) {
      throw new Error('Seu perfil não possui permissão para administrar cadastros.');
    }
    return user;
  }

  function requireManageData(user) {
    if (!permissionsFor(user).canManageData) {
      throw new Error('Seu perfil não possui permissão para gerenciar dados acadêmicos.');
    }
    return user;
  }


  function requireManageRecords(user) {
    if (!permissionsFor(user).canManageRecords) {
      throw new Error('Seu perfil não possui permissão para administrar premiações e ocorrências.');
    }
    return user;
  }

  function requireManagePublicPortal(user) {
    if (!permissionsFor(user).canManagePublicPortal) {
      throw new Error('Seu perfil não possui permissão para configurar a página pública de premiados.');
    }
    return user;
  }

  return Object.freeze({
    isSuperuser: isSuperuser,
    permissionsFor: permissionsFor,
    requireManageUsers: requireManageUsers,
    requireManageCruds: requireManageCruds,
    requireManageData: requireManageData,
    requireManageRecords: requireManageRecords,
    requireManagePublicPortal: requireManagePublicPortal
  });
})();
