/** Controller do CRUD de usuários. */
function getUserAdminContext(authToken) {
  var actor = SessionService.requireUser(authToken);
  return UserService.getAdminContext(actor);
}

function saveUser(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return UserService.save(actor, payload);
}

function deleteUser(authToken, email) {
  var actor = SessionService.requireUser(authToken);
  return UserService.remove(actor, email);
}
