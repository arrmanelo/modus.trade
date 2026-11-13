/* =====================================================================
   MODUS TRADE — LOGO INTRO
   Логотип собирается в центре белого экрана (3D-поворот, прорисовка
   колец, «взрыв» точек, проявление надписи), затем перелетает на
   место логотипа в шапке сайта.
   ===================================================================== */
(function(){
  var NAVY='#102B49', NAVY_DEEP='#081a2e', RED='#E31E24';
  var EXPO='cubic-bezier(.16,1,.3,1)', BACK='cubic-bezier(.34,1.56,.64,1)',
      INOUT='cubic-bezier(.72,0,.18,1)', OUT='cubic-bezier(.33,1,.68,1)';
  var uid=0;

  /* ---- Куда прилетает логотип ----
     На реальном сайте: вернуть getBoundingClientRect() картинки логотипа
     в шапке (только круглый знак). Здесь — позиция знака на скриншоте. */
  /* Куда прилетает знак: видимый логотип приложения (меню, верхняя полоса или экран входа) */
  function findMark(){
    var els=document.querySelectorAll('#app .brand-mark');
    for(var i=0;i<els.length;i++){ var r=els[i].getBoundingClientRect();
      if(r.width>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight) return els[i]; }
    return null;
  }
  function getTarget(){
    var m=findMark();
    if(!m) return {x:innerWidth/2-20,y:innerHeight/2-20,size:40};
    var r=m.getBoundingClientRect();
    return {x:r.left,y:r.top,size:r.width};
  }
  function realLogoEls(){ return [document.getElementById('app')]; }

  function ringSVG(color, front){
    var id='mtg'+(++uid);
    return '<svg class="mt-layer" viewBox="65 65 350 350" aria-hidden="true">'+
      '<defs><mask id="'+id+'" maskUnits="userSpaceOnUse" x="0" y="0" width="480" height="480">'+
      '<rect width="480" height="480" fill="#fff"/><rect class="mt-gap" x="0" y="206" width="480" height="68" fill="#000"/></mask></defs>'+
      '<g mask="url(#'+id+')" fill="none" stroke="'+color+'" stroke-width="62">'+
      '<path class="mt-arc" d="M96 240A144 144 0 0 1 384 240" stroke-dasharray="453 453" stroke-dashoffset="453"/>'+
      '<path class="mt-arc" d="M384 240A144 144 0 0 1 96 240" stroke-dasharray="453 453" stroke-dashoffset="453"/>'+
      '</g></svg>';
  }

  function build(){
    var old=document.getElementById('mt-intro'); if(old) old.remove();
    document.documentElement.classList.remove('mt-pending');
    var vw=innerWidth, vh=innerHeight;
    var s=Math.round(Math.max(96,Math.min(200,Math.min(vw,vh)*.24)));
    var gid='mtr'+(++uid);

    var depth='';
    for(var i=10;i>=1;i--) depth+=ringSVG(i>8?'#06121f':NAVY_DEEP).replace('class="mt-layer"','class="mt-layer mt-depth" style="transform:translateZ('+(-i*1.6)+'px)"');

    var root=document.createElement('div');
    root.id='mt-intro';
    root.setAttribute('aria-hidden','true');
    root.innerHTML=
      '<div id="mt-bg"></div>'+
      '<div id="mt-fly" style="--s:'+s+'px">'+
        '<div id="mt-lockup">'+
          '<div class="mt-mark">'+
            '<div class="mt-shock" id="mt-shock1"></div><div class="mt-shock" id="mt-shock2"></div>'+
            '<div class="mt-3d" id="mt-3d">'+
              '<div class="mt-ringwrap" id="mt-ringwrap">'+depth+ringSVG(NAVY,true)+'</div>'+
              '<svg class="mt-layer" id="mt-red" viewBox="65 65 350 350" aria-hidden="true">'+
                '<defs><radialGradient id="'+gid+'" cx="262" cy="212" r="110" gradientUnits="userSpaceOnUse">'+
                '<stop offset="0" stop-color="#FF6B5E"/><stop offset=".42" stop-color="'+RED+'"/><stop offset="1" stop-color="#8E0710"/></radialGradient></defs>'+
                '<circle cx="240" cy="240" r="65" fill="url(#'+gid+')"/>'+
                '<circle id="mt-flat" cx="240" cy="240" r="65" fill="'+RED+'" opacity="0"/>'+
              '</svg>'+
              '<svg class="mt-layer" id="mt-hl" viewBox="65 65 350 350" aria-hidden="true"><circle cx="262" cy="215" r="21" fill="#fff"/></svg>'+
            '</div>'+
          '</div>'+
          '<div class="mt-wordwrap" id="mt-wordwrap"><div class="mt-word">'+
            '<span class="mt-line">'+chars('Модус')+'</span><span class="mt-line">'+chars('Сигнал')+'</span>'+
          '</div><div class="mt-glint" id="mt-glint"></div></div>'+
        '</div>'+
      '</div>'+
      '<button class="mt-skip" id="mt-skip" type="button">Пропустить</button>';
    document.body.appendChild(root);
    function chars(w){return w.split('').map(function(c){return '<span class="mt-ch">'+c+'</span>';}).join('');}

    var $=function(id){return document.getElementById(id);};
    var fly=$('mt-fly'), lock=$('mt-lockup');
    // particles
    var mark=root.querySelector('.mt-mark');
    for(var p=0;p<18;p++){var d=document.createElement('div');d.className='mt-p';mark.appendChild(d);}
    // shock rings
    [['mt-shock1',2,NAVY],['mt-shock2',1.5,RED]].forEach(function(a){var e=$(a[0]);e.style.width=e.style.height=s+'px';e.style.margin=(-s/2)+'px';e.style.border=a[1]+'px solid '+a[2];});

    // layout
    var W=lock.getBoundingClientRect().width;
    var left=(vw-W)/2, top=(vh-s)/2, dx=(W-s)/2;
    fly.style.transform='translate('+left+'px,'+top+'px)';

    var anims=[];
    function A(el,kf,dur,delay,ease){ var a=el.animate(kf,{duration:dur,delay:delay,easing:ease||EXPO,fill:'both'}); anims.push(a); return a; }

    /* ---------- TIMELINE ---------- */
    // 1. сдвиг: знак в центре экрана, потом уезжает влево под надпись
    A(lock,[{transform:'translateX('+dx+'px)'},{transform:'translateX(0)'}],1000,1750,EXPO);

    // 2. ударные волны
    A($('mt-shock1'),[{transform:'scale(.15)',opacity:0},{transform:'scale(.2)',opacity:.5,offset:.08},{transform:'scale(2.6)',opacity:0}],1300,120,OUT);
    A($('mt-shock2'),[{transform:'scale(.6)',opacity:0},{transform:'scale(.7)',opacity:.6,offset:.1},{transform:'scale(3.4)',opacity:0}],1200,1330,OUT);

    // 3. 3D-разворот всего знака
    A($('mt-3d'),[{transform:'rotateY(-78deg) rotateX(22deg) scale(.82)'},{transform:'rotateY(0) rotateX(0) scale(1)'}],1700,250,EXPO);
    // небольшой «дыхательный» отскок на финише сборки
    A(mark,[{transform:'scale(1)'},{transform:'scale(1.045)',offset:.35},{transform:'scale(1)'}],700,1300,'ease-in-out');

    // 4. красная сфера
    A($('mt-red'),[{transform:'translateZ(90px) scale(0)'},{transform:'translateZ(90px) scale(1.12)',offset:.55},{transform:'translateZ(40px) scale(1)'}],800,150,'cubic-bezier(.2,.8,.3,1)');
    A($('mt-red'),[{transform:'translateZ(40px) scale(1)'},{transform:'translateZ(0) scale(1)'}],900,950,EXPO);
    A($('mt-flat'),[{opacity:0},{opacity:1}],700,1650,'ease-in-out');
    // блик
    A($('mt-hl'),[{transform:'translateZ(140px) scale(0)',opacity:0},{transform:'translateZ(140px) scale(0)',opacity:1,offset:.01},{transform:'translateZ(70px) scale(1.35)',offset:.5},{transform:'translateZ(0) scale(1)',opacity:1}],1000,720,'cubic-bezier(.25,.8,.3,1)');

    // 5. кольца прорисовываются, вращаясь
    A($('mt-ringwrap'),[{transform:'rotate(-240deg)'},{transform:'rotate(0deg)'}],1450,330,EXPO);
    root.querySelectorAll('.mt-arc').forEach(function(el){ A(el,[{strokeDashoffset:453},{strokeDashoffset:0}],1250,380,EXPO); });
    root.querySelectorAll('.mt-gap').forEach(function(el){ A(el,[{y:'226px',height:'28px'},{y:'206px',height:'68px'}],900,1100,EXPO); });

    // 6. разлёт точек (как точечный паттерн на сайте)
    root.querySelectorAll('.mt-p').forEach(function(el,i){
      var ang=(i/18)*Math.PI*2+ (i%2?0.17:-0.05), dist=s*(.78+((i*37)%10)/16), sz=Math.max(4,s*(.035+((i*13)%5)/140));
      el.style.width=el.style.height=sz+'px'; el.style.margin=(-sz/2)+'px';
      if(i%5===0) el.style.background=NAVY;
      var x=Math.cos(ang)*dist, y=Math.sin(ang)*dist;
      A(el,[{transform:'translate(0,0) scale(.4)',opacity:0},{transform:'translate('+x*.35+'px,'+y*.35+'px) scale(1)',opacity:1,offset:.15},{transform:'translate('+x+'px,'+y+'px) scale(0)',opacity:.9}],1100+((i*53)%300),1360,OUT);
    });

    // 7. надпись — буквы выезжают снизу
    root.querySelectorAll('.mt-ch').forEach(function(el,i){
      A(el,[{transform:'translateY(115%) rotate(6deg)'},{transform:'translateY(0) rotate(0)'}],850,1950+i*55,EXPO);
    });
    // 8. световой блик по надписи
    A($('mt-glint'),[{backgroundPosition:'120% 0',opacity:1},{backgroundPosition:'-20% 0',opacity:1}],900,2850,'ease-in-out');

    // 9. перелёт в шапку
    var T=getTarget(), k=T.size/s;
    A(fly,[{transform:'translate('+left+'px,'+top+'px) scale(1)'},{transform:'translate('+T.x+'px,'+T.y+'px) scale('+k+')'}],1050,3650,INOUT);
    A($('mt-bg'),[{opacity:1},{opacity:0}],700,4050,'ease-in-out');
    realLogoEls().forEach(function(el){ A(el,[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],900,3950,EXPO); });
    A($('mt-wordwrap'),[{opacity:1},{opacity:0}],380,4280,'ease-in');
    A(fly,[{opacity:1},{opacity:0}],260,4700,'linear');
    A($('mt-skip'),[{opacity:0},{opacity:1}],400,600,'ease-out');

    var done=false;
    function finish(){ if(done) return; done=true; root.remove(); realLogoEls().forEach(function(el){el.getAnimations().forEach(function(a){a.cancel();}); el.style.opacity=1;}); }
    var end=Promise.all(anims.map(function(a){return a.finished;}));
    end.then(finish,function(){});
    setTimeout(function(){root.style.pointerEvents='none';},4100);
    $('mt-skip').addEventListener('click',function(){ anims.forEach(function(a){a.finish();}); finish(); });

    // предпросмотр кадра: ?t=1500
    var t=new URLSearchParams(location.search).get('introT');
    if(t!==null){ document.getAnimations().forEach(function(a){a.pause();a.currentTime=+t;}); }
  }

  // Интро запускается при каждой загрузке и обновлении страницы (F5).
  // Не показывается только тем, у кого в системе включено «уменьшить движение» (можно форсировать ?intro=1).
  function wanted(){
    var q=new URLSearchParams(location.search);
    if(q.has('intro')||q.has('introT')) return true;
    return !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function play(){
    document.documentElement.classList.add('mt-pending');
    var t0=Date.now();
    (function wait(){
      // ждём, пока приложение отрисует логотип (не дольше 3 сек)
      if(findMark()||Date.now()-t0>3000){ requestAnimationFrame(function(){ requestAnimationFrame(build); }); }
      else setTimeout(wait,50);
    })();
  }
  window.MSIntro={ play: play };
  if(wanted()) play();
})();
