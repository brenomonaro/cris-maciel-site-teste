/* Página própria de cada imóvel: fotos em tela cheia e compartilhar. */
(function(){
  var dados = document.getElementById('fotos');
  var fotos = dados ? JSON.parse(dados.textContent) : [];
  var caixa = document.querySelector('.caixa'), img = caixa && caixa.querySelector('img'), cont = caixa && caixa.querySelector('[data-cont]');
  var i = 0, ultimoFoco = null;
  function mostra(n){
    if(!fotos.length) return;
    i = (n + fotos.length) % fotos.length;
    img.src = fotos[i]; img.alt = 'Foto ' + (i + 1) + ' de ' + fotos.length;
    cont.textContent = (i + 1) + ' / ' + fotos.length;
    var prox = new Image(); prox.src = fotos[(i + 1) % fotos.length];
  }
  function abre(n){ if(!caixa) return; ultimoFoco = document.activeElement; caixa.classList.add('aberta'); document.body.style.overflow = 'hidden'; mostra(n); caixa.querySelector('[data-fechar]').focus(); }
  function fecha(){ caixa.classList.remove('aberta'); document.body.style.overflow = ''; if(ultimoFoco) ultimoFoco.focus(); }
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-foto]'); if(b){ abre(+b.getAttribute('data-foto')); return; }
    if(e.target.closest('[data-fechar]')) fecha();
    var ir = e.target.closest('[data-ir]'); if(ir) mostra(i + (+ir.getAttribute('data-ir')));
    var c = e.target.closest('[data-compartilhar]');
    if(c){
      var dadosC = { title: document.title, url: location.href };
      if(navigator.share){ navigator.share(dadosC).catch(function(){}); }
      else if(navigator.clipboard){ navigator.clipboard.writeText(location.href).then(function(){ var t = c.querySelector('span'); var o = t.textContent; t.textContent = 'Link copiado'; setTimeout(function(){ t.textContent = o; }, 1800); }); }
    }
  });
  document.addEventListener('keydown', function(e){
    if(!caixa || !caixa.classList.contains('aberta')) return;
    if(e.key === 'Escape') fecha();
    if(e.key === 'ArrowRight') mostra(i + 1);
    if(e.key === 'ArrowLeft') mostra(i - 1);
  });
  var x0 = null;
  if(caixa){
    caixa.addEventListener('touchstart', function(e){ x0 = e.touches[0].clientX; }, {passive:true});
    caixa.addEventListener('touchend', function(e){ if(x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if(Math.abs(dx) > 40) mostra(i + (dx < 0 ? 1 : -1)); x0 = null; });
  }
  /* botão de WhatsApp fixo no celular: some enquanto o cartão de valor está na tela */
  var zap = document.querySelector('.zap'), acoes = document.querySelector('.valor .acoes');
  if(zap && acoes && 'IntersectionObserver' in window){ new IntersectionObserver(function(es){ zap.classList.toggle('some', es[0].isIntersecting); }).observe(acoes); }
  /* voltar: se veio do próprio site, volta; se chegou direto, vai para a lista */
  var v = document.querySelector('.voltar');
  if(v) v.addEventListener('click', function(e){ if(document.referrer && document.referrer.indexOf(location.host) >= 0 && history.length > 1){ e.preventDefault(); history.back(); } });
})();
