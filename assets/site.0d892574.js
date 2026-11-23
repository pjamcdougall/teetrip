/* TeeTrip site: menu, copy buttons, one quiet reveal, the living Island hero and the home page's small planner. */
(function(){
  "use strict";
  var RM=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
  function hm(m){m=((Math.round(m)%1440)+1440)%1440;var h=Math.floor(m/60),mm=m%60,ap=h>=12?"pm":"am",h12=h%12||12;return h12+":"+(mm<10?"0":"")+mm+" "+ap}
  window.TT={hm:hm,toast:function(t){var e=document.createElement("div");e.className="toast";e.setAttribute("role","status");e.textContent=t;document.body.appendChild(e);setTimeout(function(){e.remove()},2600)}};

  var mb=$(".menu"),nav=$("#nav");
  if(mb&&nav){mb.addEventListener("click",function(){var o=nav.classList.toggle("open");mb.setAttribute("aria-expanded",o?"true":"false")});
    document.addEventListener("keydown",function(e){if(e.key==="Escape"&&nav.classList.contains("open")){nav.classList.remove("open");mb.setAttribute("aria-expanded","false");mb.focus()}})}

  document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-copy]");if(!b)return;var v=b.getAttribute("data-copy");
    (navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){TT.toast("Copied "+v)},function(){TT.toast(v)})});

  if("IntersectionObserver" in window&&!RM){var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add("in");io.unobserve(en.target)}})},{rootMargin:"0px 0px -8% 0px"});
    $$(".rv").forEach(function(el){io.observe(el)})}else $$(".rv").forEach(function(el){el.classList.add("in")});

  /* ---------- the living Island ---------- */
  var hdEl=$("#heroData");if(!hdEl)return;var HD=JSON.parse(hdEl.textContent);
  var stage=$("#stage"),svg=stage&&$("svg",stage),routesG=$("#hroutes"),ringsG=$("#rings");
  var NS="http://www.w3.org/2000/svg";
  function setStay(i,animate){var s=HD.stays[i];if(!svg)return;
    $$(".stay",svg).forEach(function(g){g.setAttribute("opacity",g.getAttribute("data-s")===s.id?"1":"0")});
    var within={};s.row.forEach(function(r){if(r[1]<=30)within[r[0]]=r[1]});
    $$(".pin",svg).forEach(function(p){var c=p.getAttribute("data-c");p.classList.remove("on");p.classList.add("dim");
      if(within[c]!=null){var d=animate?within[c]*45:0;setTimeout(function(){p.classList.remove("dim");p.classList.add("on")},d)}});
    routesG.innerHTML="";Object.keys(s.routes).forEach(function(cid,k){var p=document.createElementNS(NS,"path");p.setAttribute("d",s.routes[cid]);p.setAttribute("class","isl-route");routesG.appendChild(p);
      if(animate&&p.getTotalLength){var L=p.getTotalLength();p.style.strokeDasharray=L;p.style.strokeDashoffset=L;p.animate([{strokeDashoffset:L},{strokeDashoffset:0}],{duration:1200,delay:300+k*220,fill:"forwards",easing:"cubic-bezier(.3,.7,.2,1)"})}});
    $$(".ring",ringsG).forEach(function(c,k){c.setAttribute("cx",s.xy[0]);c.setAttribute("cy",s.xy[1]);
      if(animate&&c.animate){c.animate([{r:10,opacity:.75},{r:300,opacity:0}],{duration:2600,delay:k*520,easing:"ease-out",fill:"forwards"})}});
    var n=s.row.filter(function(r){return r[1]<=30}).length;
    var now=$("#heroNow");if(now)now.innerHTML="From <b>"+s.n+"</b>: "+n+" course"+(n===1?"":"s")+" within 30 minutes by road.";
    var chip=$("#chip1 span");if(chip)chip.textContent="Staying in "+s.n;
    var near=s.row[0],cn=HD.courses[near[0]];var tee=9*60,leave=tee-near[1]-30;
    var dc=$("#dcl");if(dc){$("#daycard h4").textContent="A morning from "+s.n;
      dc.innerHTML='<div class="ln"><b>'+hm(leave)+'</b><span>Leave '+s.n+'</span></div><div class="ln"><b>'+near[1]+' min</b><span>'+near[2]+' km by road to '+cn.n+'</span></div><div class="ln"><b>'+hm(tee-30)+'</b><span>Check in at the pro shop</span></div><div class="ln"><b>'+hm(tee)+'</b><span>Tee time aimed for</span></div>'}}
  var idx=0,timer=null,visible=true;
  setStay(0,!RM);
  if(!RM){var tick=function(){if(!visible||document.hidden)return;idx=(idx+1)%HD.stays.length;setStay(idx,true)};timer=setInterval(tick,6500);
    if("IntersectionObserver" in window){new IntersectionObserver(function(es){visible=es[0].isIntersecting},{}).observe(stage)}}

  /* ---------- the small planner ---------- */
  var mvS=$("#mvStay"),mvR=$("#mvReach"),mvD=$("#mvDay"),mvGo=$("#mvGo");if(!mvS)return;
  var cur="cav";
  function drawMv(){mvS.innerHTML=HD.allstays.map(function(s){return '<button type="button" aria-pressed="'+(s.id===cur)+'" data-s="'+s.id+'">'+s.n+'</button>'}).join("");
    var rows=HD.mat[cur]||[],html="",last="";
    rows.slice(0,8).forEach(function(r){var band=r[1]<=30?"Within 30 minutes":r[1]<=45?"Within 45 minutes":r[1]<=60?"Within an hour":"Over an hour";
      if(band!==last){html+='<li class="band">'+band+'</li>';last=band}html+='<li><b>'+HD.courses[r[0]].n+'</b><span>'+r[1]+' min · '+r[2]+' km</span></li>'});
    mvR.innerHTML=html;
    var n=rows[0],tee=9*60;var sn=HD.allstays.filter(function(s){return s.id===cur})[0].n;
    mvD.innerHTML='<li><b>'+hm(tee-n[1]-30)+'</b><i></i><span>Leave '+sn+'</span></li><li class="drive"><b>'+n[1]+' min</b><i></i><span>Drive to '+HD.courses[n[0]].n+'</span></li><li><b>'+hm(tee-30)+'</b><i></i><span>Check in</span></li><li class="tee"><b>'+hm(tee)+'</b><i></i><span>Tee time aimed for</span></li>';
    mvGo.href=R+"plan/index.html?stay="+cur}
  mvS.addEventListener("click",function(e){var b=e.target.closest("button[data-s]");if(!b)return;cur=b.getAttribute("data-s");drawMv();var nb=mvS.querySelector('[data-s="'+cur+'"]');nb&&nb.focus()});
  drawMv();
})();
