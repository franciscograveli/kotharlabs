/* Medição de visitas sem cookies (Umami, hospedado por nós). Envia só: caminho da página (sem query nem hash),
   domínio de origem e cliques em [data-evento]. Sem IP, sem cookies, sem localStorage. Respeita DNT e GPC. */
(function () {
  var n = navigator, w = window, s = document.currentScript, id = s && s.getAttribute('data-site');
  if (!id || n.doNotTrack == '1' || w.doNotTrack == '1' || n.msDoNotTrack == '1' || n.globalPrivacyControl) return;
  function enviar(extra) {
    var o = '';
    try { o = new URL(document.referrer).origin; if (o.indexOf('//' + location.hostname) > 0) o = ''; } catch (e) {}
    var p = { website: id, hostname: location.hostname, url: location.pathname, referrer: o };
    for (var k in extra) p[k] = extra[k];
    fetch('/medir', {
      method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'event', payload: p })
    }).catch(function () {});
  }
  enviar({});
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-evento]');
    if (el) enviar({ name: el.getAttribute('data-evento'), data: { onde: el.getAttribute('data-onde') || '' } });
  });
})();
