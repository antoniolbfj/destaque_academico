/** Controller do CRUD de prêmios. */
function getPrizeAdminContext(authToken) {
  var actor = SessionService.requireUser(authToken);
  return PrizeService.getAdminContext(actor);
}

function savePrize(authToken, payload) {
  var actor = SessionService.requireUser(authToken);
  return PrizeService.save(actor, payload);
}

function deletePrize(authToken, prizeId) {
  var actor = SessionService.requireUser(authToken);
  return PrizeService.remove(actor, prizeId);
}
