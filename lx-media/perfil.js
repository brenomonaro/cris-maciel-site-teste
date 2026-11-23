/* ===================================================================
   O QUE A PESSOA PROCURA (recomendação, etapa 1)
   O site aprende com o que a pessoa abre, salva e filtra, e passa a
   mostrar primeiro os imóveis que combinam com isso: mesma finalidade,
   faixa de valor parecida, mesmos bairros e condomínios, mesmo tipo e
   número de dormitórios.

   Tudo fica só neste navegador (localStorage 'cm-perfil') e nada sai
   daqui. Só aprende se a pessoa aceitou os cookies (ou permitiu em
   Minha conta) e não desligou em Minha conta. Usado pela página do site (index) e pela página própria
   de cada imóvel (imovel/CODIGO/), que estão no mesmo endereço.

   Pesos: abrir um imóvel vale 1 (abrir de novo soma), salvar vale 3,
   filtro de bairro, tipo, dormitórios ou valor vale 1,5.
   O valor pesa mais que tudo: quem olha imóveis de R$ 1,6 milhão não
   vê primeiro uma chácara de R$ 7 milhões.
=================================================================== */
(function(){
  'use strict';
  var K='cm-perfil', MAX_EV=80, DIAS=90;

  function ler(){ try{ var p=JSON.parse(localStorage.getItem(K)||'null'); if(p&&p.v===1) return p; }catch(e){} return {v:1,ev:[],desligado:false}; }
  function grava(p){ try{ localStorage.setItem(K,JSON.stringify(p)); }catch(e){} }
  function consentiu(){ try{ return localStorage.getItem('cm-cookies')==='aceito'; }catch(e){ return false; } }
  function pode(){ var p=ler(); return (consentiu() || !!p.permitido) && !p.desligado; }
  function avisa(){ try{ document.dispatchEvent(new CustomEvent('cm-perfil')); }catch(e){} }

  /* guarda só o que serve para comparar imóveis, nunca nada da pessoa */
  function resumoImovel(i){
    return {cod:String(i.cod||''),fin:i.fin==='locacao'?'locacao':'venda',tipo:i.tipo||'',bairro:i.bairro||'',
      preco:+i.preco||0,dorm:+i.dorm||0,vagas:+i.vagas||0,area:+i.area||0};
  }
  function registra(tipo,dado){
    if(!pode() || !dado) return;
    var p=ler(), ev={t:Date.now(),e:tipo};
    if(tipo==='ver'||tipo==='salvar'){ if(!dado.cod) return; ev.i=resumoImovel(dado); }
    else if(tipo==='tirar'){ p.ev=p.ev.filter(function(x){ return !(x.e==='salvar' && x.i && x.i.cod===String(dado.cod)); }); grava(p); avisa(); return; }
    else if(tipo==='filtro'){ ev.f={fin:dado.fin||'',tipo:dado.tipo||'',bairro:dado.bairro||'',dorm:+dado.dorm||0,max:+dado.max||0}; if(!ev.f.tipo&&!ev.f.bairro&&!ev.f.dorm&&!ev.f.max) return; }
    else return;
    var limite=Date.now()-DIAS*864e5;
    p.ev=p.ev.filter(function(x){ return x.t>limite; });
    p.ev.push(ev); if(p.ev.length>MAX_EV) p.ev=p.ev.slice(-MAX_EV);
    grava(p); avisa();
  }

  /* ---------- o retrato ---------- */
  function soma(m,k,w){ if(k) m[k]=(m[k]||0)+w; }
  function mediana(ps){ /* ps: [[valor,peso]] */
    if(!ps.length) return 0; ps.sort(function(a,b){ return a[0]-b[0]; });
    var tot=ps.reduce(function(s,x){ return s+x[1]; },0), ac=0;
    for(var k=0;k<ps.length;k++){ ac+=ps[k][1]; if(ac>=tot/2) return ps[k][0]; }
    return ps[ps.length-1][0];
  }
  function topo(m){ var ks=Object.keys(m).sort(function(a,b){ return m[b]-m[a]; }); return ks; }
  function retrato(){
    if(!pode()) return null;
    var p=ler(); if(!p.ev.length) return null;
    var fin={}, tipo={}, bairro={}, precos={venda:[],locacao:[]}, dorms=[], maxes={venda:[],locacao:[]}, vistos={}, cods={};
    var agora=Date.now();
    p.ev.forEach(function(x){
      var rec=Math.max(.35,1-(agora-x.t)/(DIAS*864e5)); /* o recente pesa mais */
      if(x.i){
        var w=(x.e==='salvar'?3:1)*rec, i=x.i; cods[i.cod]=1;
        if(x.e==='ver') vistos[i.cod]=Math.max(vistos[i.cod]||0,x.t);
        soma(fin,i.fin,w); soma(tipo,i.tipo,w); soma(bairro,i.bairro,w);
        if(i.preco) precos[i.fin].push([i.preco,w]); if(i.dorm) dorms.push([i.dorm,w]);
      } else if(x.f){
        var f=x.f, w2=1.5*rec;
        soma(fin,f.fin,w2*.5); soma(tipo,f.tipo,w2); soma(bairro,f.bairro,w2);
        if(f.dorm) dorms.push([f.dorm,w2]); if(f.max&&f.fin) maxes[f.fin].push([f.max,w2]);
      }
    });
    var nImoveis=Object.keys(cods).length, temFiltro=p.ev.some(function(x){ return x.f; });
    if(nImoveis<2 && !(nImoveis===1 && p.ev.some(function(x){ return x.e==='salvar'; })) && !(nImoveis>=1 && temFiltro)) return null;
    var f1=topo(fin)[0]||'venda';
    function norm(m){ var t=0,k; for(k in m) t+=m[k]; var o={}; for(k in m) o[k]=m[k]/t; return o; }
    return {
      fin:f1, preco:mediana(precos[f1]), teto:mediana(maxes[f1]),
      tipos:norm(tipo), bairros:norm(bairro), dorm:Math.round(mediana(dorms)),
      vistos:vistos, n:nImoveis,
      tipoPrincipal:topo(tipo)[0]||'', bairrosPrincipais:topo(bairro).slice(0,2)
    };
  }

  /* ---------- quanto um imóvel combina (0 a 1; -1 se for outra finalidade) ---------- */
  function nota(i,r){
    r=r||retrato(); if(!r) return 0;
    if((i.fin==='locacao'?'locacao':'venda')!==r.fin) return -1;
    var s=0;
    if(r.preco && i.preco){ var d=Math.log(i.preco/r.preco); s+=.45*Math.exp(-(d*d)/(2*.28*.28)); }
    else s+=.1;
    if(r.teto && i.preco>r.teto*1.1) s-=.35;
    s+=.2*Math.min(1,(r.bairros[i.bairro]||0)*1.6);
    s+=.2*Math.min(1,(r.tipos[i.tipo]||0)*1.4);
    if(r.dorm && i.dorm) s+=.15*Math.max(0,1-Math.abs(i.dorm-r.dorm)/2);
    if(r.vistos[i.cod] && Date.now()-r.vistos[i.cod]<864e5) s-=.12; /* já viu hoje: dá a vez a outros */
    return s;
  }

  /* ---------- frase para a pessoa ver o que o site entendeu ---------- */
  function brl(n){ if(n>=1e6){ var m=Math.round(n/1e5)/10; return 'R$ '+m.toLocaleString('pt-BR')+(m<2?' milhão':' milhões'); } if(n>=1e4) return 'R$ '+Math.round(n/1e3)+' mil'; return 'R$ '+Math.round(n).toLocaleString('pt-BR'); }
  function plural(t){ if(!t) return 'imóveis'; var m={'Casa':'casas','Casa em condomínio':'casas em condomínio','Apartamento':'apartamentos','Sobrado':'sobrados','Terreno':'terrenos','Chácara':'chácaras','Cobertura':'coberturas','Sala':'salas','Galpão':'galpões'}; return m[t]||t.toLowerCase(); }
  function frase(r){
    r=r||retrato(); if(!r) return '';
    var t='Você tem olhado '+plural(r.tipoPrincipal)+(r.fin==='locacao'?' para alugar':' à venda');
    if(r.preco) t+=', perto de '+brl(r.preco)+(r.fin==='locacao'?' por mês':'');
    if(r.dorm) t+=', com '+r.dorm+(r.dorm===1?' dormitório':' dormitórios');
    var b=r.bairrosPrincipais.filter(Boolean);
    if(b.length) t+=', principalmente '+(b[0]==='Centro'?'no Centro':'no '+b[0])+(b[1]?(b[1]==='Centro'?' e no Centro':' e no '+b[1]):'');
    return t+'.';
  }

  function apaga(){ var p=ler(); p.ev=[]; grava(p); avisa(); }
  function desliga(sim){ var p=ler(); p.desligado=!!sim; if(sim) p.ev=[]; else p.permitido=true; grava(p); avisa(); }

  window.CMPerfil={registra:registra,retrato:retrato,nota:nota,frase:frase,apaga:apaga,desliga:desliga,
    ligado:function(){ return pode(); }, consentiu:consentiu, desligado:function(){ return ler().desligado; }};

  /* página própria do imóvel: registra a visita com os dados que a página traz */
  var el=document.getElementById('cm-imovel');
  if(el){ try{ var d=JSON.parse(el.textContent); setTimeout(function(){ registra('ver',d); },1500); }catch(e){} }
})();
