/* TeeTrip hole-by-hole layouts: opens a card for each hole from the map, the strip or the scorecard. */
(function(){
  var sec=document.getElementById('layout'),dataEl=document.getElementById('layData');
  if(!sec||!dataEl)return;
  var H=JSON.parse(dataEl.textContent),slug=sec.dataset.slug,base='../../assets/layouts/'+slug+'/';
  var dlg=sec.querySelector('dialog.hcard'),$=function(id){return document.getElementById(id)};
  var cur=0,opener=null;
  function idx(n){for(var i=0;i<H.length;i++)if(H[i].n===n)return i;return -1}
  function pad(n){return(n<10?'0':'')+n}
  function elev(h){
    var e=h.elev,box=$('hcE');box.innerHTML='';
    if(!e||e.length<4)return;
    var lo=Math.min.apply(0,e),hi=Math.max.apply(0,e),span=Math.max(hi-lo,3),W=400,Ht=46,p=[];
    for(var i=0;i<e.length;i++)p.push((i/(e.length-1)*W).toFixed(1)+' '+(Ht-6-(e[i]-lo)/span*(Ht-14)).toFixed(1));
    var d=e[e.length-1]-e[0],m=Math.abs(Math.round(d)),ft=Math.round(Math.abs(d)*3.281/5)*5;
    var say=m<2?'Tee and green sit at about the same height.':'The green sits about '+m+' m ('+ft+' ft) '+(d>0?'above':'below')+' the tee.';
    box.innerHTML='<svg viewBox="0 0 '+W+' '+Ht+'" preserveAspectRatio="none" aria-hidden="true"><path d="M0 '+Ht+'L'+p.join('L')+'L'+W+' '+Ht+'Z" fill="#DDEBC0"/><path d="M'+p.join('L')+'" fill="none" stroke="#2B5D45" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><b>Ground from tee (left) to green (right).</b> '+say+' Approximate, from federal open LiDAR, 2020.';
  }
  function show(i){
    cur=(i+H.length)%H.length;var h=H[cur];
    $('hcN').textContent=h.n;
    $('hcF').innerHTML=(h.par?'Par <b>'+h.par+'</b>':'Par not yet on file')+' &middot; '+(h.yards?'<b>'+h.yards.toLocaleString('en-CA')+'</b> yards':'Yardage not yet on file');
    var pic=$('hcP');
    if(h.drawn){pic.innerHTML='<img alt="Drawing of hole '+h.n+', tee at the bottom and green at the top" width="360" height="600" src="'+base+'hole-'+pad(h.n)+'.svg">';
      var nx=H[(cur+1)%H.length];if(nx.drawn){var im=new Image();im.src=base+'hole-'+pad(nx.n)+'.svg'}}
    else pic.innerHTML='<div class="soon"><b>Layout coming</b>The open map data for this hole did not line up closely enough with the scorecard, so we left it out rather than guess.</div>';
    $('hcD').textContent=h.drawn&&h.text?h.text:'';
    elev(h);
  }
  function open(n,from){var i=idx(n);if(i<0)return;opener=from||document.activeElement;show(i);if(!dlg.open)dlg.showModal();$('hcX').focus({preventScroll:true})}
  function close(){if(dlg.open)dlg.close()}
  dlg.addEventListener('close',function(){if(opener&&opener.focus)opener.focus({preventScroll:true})});
  dlg.addEventListener('click',function(e){if(e.target===dlg)close()});
  $('hcX').onclick=close;$('hcBack').onclick=function(){close();sec.scrollIntoView({behavior:'smooth',block:'start'})};
  $('hcPrev').onclick=function(){show(cur-1)};$('hcNext').onclick=function(){show(cur+1)};
  dlg.addEventListener('keydown',function(e){if(e.key==='ArrowRight'){e.preventDefault();show(cur+1)}else if(e.key==='ArrowLeft'){e.preventDefault();show(cur-1)}});
  var sx=null,sy=0;
  dlg.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
  dlg.addEventListener('touchend',function(e){if(sx===null)return;var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;sx=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)show(cur+(dx<0?1:-1))},{passive:true});
  sec.querySelectorAll('.laymap .hh,.layth').forEach(function(el){
    var n=+el.dataset.hole;
    el.addEventListener('click',function(){open(n,el)});
    if(el.classList.contains('hh'))el.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open(n,el)}});
  });
  document.querySelectorAll('.scard thead th').forEach(function(th){
    var t=th.textContent.trim();if(!/^\d+$/.test(t)||idx(+t)<0)return;
    th.innerHTML='<button type="button" aria-label="Open hole '+t+'">'+t+'</button>';
    th.firstChild.addEventListener('click',function(){open(+t,th.firstChild)});
  });
})();
