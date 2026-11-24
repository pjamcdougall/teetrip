/* The TeeTrip map: roads and the 18 courses on the street-level map engine where the browser can run it, the drawn Island map otherwise. */
(function(){
"use strict";
var $=function(s){return document.querySelector(s)};
var R=window.R||"../";
var data=JSON.parse($("#mapData").textContent),sel=$("#mStay"),list=$("#mList"),map=null,M=null,pins={},card=null,cardId=null,cardFrom=null;
var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})};
var byId={};data.courses.forEach(function(c){byId[c.id]=c});
var st=document.createElement("style");st.textContent="/*MLCSS*/"+"/*TTCSS*/";document.head.appendChild(st);
var ISLAND=[[-64.45,45.93],[-61.95,47.08]];
/* Where each pin is drawn. Two courses can share one spot on file (Brudenell River and Dundarave share a clubhouse), and at far zooms
   neighbours would cover each other, so pins that would overlap are nudged apart on screen, never more than 30 pixels. */
var pos={},posZ=-1;data.courses.forEach(function(c){pos[c.id]=c.ll});
function spread(z){var k=512*Math.pow(2,z),D=z<9.5?17:24,LIM=z<9.5?16:30,P=data.courses.map(function(c){var s=Math.sin(c.ll[1]*Math.PI/180);return {c:c,x:(c.ll[0]+180)/360*k,y:(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*k}});
  P.forEach(function(p){p.x0=p.x;p.y0=p.y});
  for(var it=0;it<40;it++){var moved=false;for(var i=0;i<P.length;i++)for(var j=i+1;j<P.length;j++){var a=P[i],b=P[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>=D)continue;if(d<0.01){dx=1;dy=0;d=1}var m=(D-Math.min(d,D))/2+0.01;a.x-=dx/d*m;a.y-=dy/d*m;b.x+=dx/d*m;b.y+=dy/d*m;moved=true}
    P.forEach(function(p){var ex=p.x-p.x0,ey=p.y-p.y0,e=Math.hypot(ex,ey);if(e>LIM){p.x=p.x0+ex/e*LIM;p.y=p.y0+ey/e*LIM}});if(!moved)break}
  P.forEach(function(p){var yy=Math.PI*(1-2*p.y/k);pos[p.c.id]=[p.x/k*360-180,Math.atan(Math.sinh(yy))*180/Math.PI]});posZ=z}
function pinData(){return {type:"FeatureCollection",features:data.courses.map(function(c){return {type:"Feature",properties:{id:c.id,n:c.n},geometry:{type:"Point",coordinates:pos[c.id]}}})}}
function place(){if(!map||Math.abs(map.getZoom()-posZ)<0.04)return;spread(map.getZoom());map.getSource("courses").setData(pinData());data.courses.forEach(function(c){if(pins[c.id])pins[c.id].setLngLat(pos[c.id])});if(cardId&&card)card.setLngLat(pos[cardId])}
function stay(){return data.stays.filter(function(x){return x.id===sel.value})[0]}
function reach(c){return (data.mat[sel.value]||{})[c.id]||null}
function ordered(){return data.courses.slice().sort(function(a,b){return ((reach(a)||[999])[0])-((reach(b)||[999])[0])})}
function drawList(moved){
  var rows=ordered();
  list.innerHTML=rows.map(function(c){var r=reach(c);return '<li><b><a href="'+R+'courses/'+c.slug+'/index.html" data-fly="'+c.id+'">'+esc(c.n)+'</a></b><span>'+(r?r[0]+' min · '+r[1]+' km':'')+'</span></li>'}).join("");
  try{localStorage.setItem("teetrip-map-stay",sel.value)}catch(e){}
  if(!map)return;
  /* keyboard order of the pins follows the list */
  rows.forEach(function(c){var p=pins[c.id];if(p){var el=p.getElement();el.parentNode.appendChild(el)}});
  if(cardId)fillCard(cardId);
  if(moved){var s=stay();map.easeTo({center:s.ll,zoom:Math.max(map.getZoom(),9.2),duration:800})}
}
try{var saved=localStorage.getItem("teetrip-map-stay");if(saved&&data.mat[saved])sel.value=saved}catch(e){}
sel.addEventListener("change",function(){drawList(true)});drawList(false);
list.addEventListener("click",function(e){var a=e.target.closest("[data-fly]");if(!a||!map)return;e.preventDefault();var c=byId[a.dataset.fly];
  map.flyTo({center:c.ll,zoom:Math.max(map.getZoom(),12.6),duration:1300,essential:false});openCard(c.id,a,false);
  if(window.matchMedia("(max-width:900px)").matches)$("#smap").scrollIntoView({behavior:"smooth",block:"center"})});

/* ---- the card ---- */
function cardHtml(c){var r=reach(c),s=stay(),facts=[];
  if(c.h)facts.push('<span class="num">'+c.h+'</span> holes');if(c.par)facts.push('par <span class="num">'+c.par+'</span>');
  return '<div class="ttcard" role="dialog" aria-label="'+esc(c.n)+'"><button type="button" class="x" aria-label="Close">&times;</button><h3>'+esc(c.n)+'</h3><p>'+esc(c.town)+(facts.length?' · '+facts.join(', '):'')+'</p>'+
    (r?'<p class="drive"><span class="num">'+r[0]+'</span> min from '+esc(s.n)+'<small><span class="num">'+r[1]+'</span> km by road, an estimate</small></p>':'')+
    '<div class="acts"><a href="'+R+'courses/'+c.slug+'/index.html">See the course</a><a class="go" href="'+R+'book/index.html?course='+encodeURIComponent(c.id)+'">Book a tee time</a></div></div>'}
function fillCard(id){if(!card)return;var d=document.createElement("div");d.innerHTML=cardHtml(byId[id]);var n=d.firstChild;n.querySelector(".x").addEventListener("click",function(){closeCard(true)});card.setDOMContent(n)}
function openCard(id,from,focus){var c=byId[id];if(!map||!c)return;
  if(!card)card=new M.Popup({offset:17,closeButton:false,closeOnClick:false,maxWidth:"290px",focusAfterOpen:false});
  cardId=id;cardFrom=from||null;fillCard(id);card.setLngLat(pos[id]).addTo(map);
  if(map.getLayer("pin-sel")){map.setFilter("pin-sel",["==",["get","id"],id]);map.setFilter("pin-labels",["!=",["get","id"],id])}
  /* keep the whole card on the map */
  var p=map.project(pos[id]),cv=map.getCanvas(),w=cv.clientWidth,h=cv.clientHeight,dx=0,dy=0;
  if(p.x<160)dx=p.x-160;else if(p.x>w-160)dx=p.x-(w-160);if(p.y<230&&p.y>h-230){}else if(p.y<230&&h>480)dy=p.y-230;
  if((dx||dy)&&!map.isMoving())map.panBy([dx,dy],{duration:350});
  if(focus)setTimeout(function(){var a=card.getElement()&&card.getElement().querySelector(".acts a");if(a)a.focus({preventScroll:true})},60)}
function closeCard(back){if(!card||!cardId)return;card.remove();cardId=null;if(map.getLayer("pin-sel")){map.setFilter("pin-sel",["==",["get","id"],""]);map.setFilter("pin-labels",null)}
  if(back&&cardFrom&&cardFrom.focus)cardFrom.focus({preventScroll:true});cardFrom=null}
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&cardId){e.preventDefault();closeCard(true)}});

function ok(){try{if(/[?&#]nogl=1/.test(location.href))return false;var c=document.createElement("canvas");return !!(window.WebGLRenderingContext&&(c.getContext("webgl2")||c.getContext("webgl")))&&typeof Worker!=="undefined"&&typeof DecompressionStream!=="undefined"}catch(e){return false}}
if(!ok())return;
var KIT=new URL(R+"assets/mapkit/",location.href).href;
function add(src){return new Promise(function(r,j){var s=document.createElement("script");s.src=src;s.onload=r;s.onerror=j;document.head.appendChild(s)})}

/* small pictures the map needs, drawn here so nothing is fetched for them */
function dot(px){var k=2,s=px*k,c=document.createElement("canvas");c.width=c.height=s;var x=c.getContext("2d"),m=s/2;
  x.beginPath();x.arc(m,m+1.5*k,m-4*k,0,7);x.fillStyle="rgba(10,46,35,.28)";x.filter="blur("+(1.6*k)+"px)";x.fill();x.filter="none";
  x.beginPath();x.arc(m,m,m-3.5*k,0,7);x.fillStyle="#fff";x.fill();x.lineWidth=1*k;x.strokeStyle="#22493A";x.stroke();
  x.beginPath();x.arc(m,m,m-7*k,0,7);x.fillStyle="#D2A33A";x.fill();
  return {img:x.getImageData(0,0,s,s),opt:{pixelRatio:k}}}
function shield(fill,edge){var k=2,w=16*k,h=12*k,c=document.createElement("canvas");c.width=w;c.height=h;var x=c.getContext("2d"),r=3*k,o=.5*k;
  x.beginPath();x.moveTo(o+r,o);x.arcTo(w-o,o,w-o,h-o,r);x.arcTo(w-o,h-o,o,h-o,r);x.arcTo(o,h-o,o,o,r);x.arcTo(o,o,w-o,o,r);x.closePath();x.fillStyle=fill;x.fill();x.lineWidth=1*k;x.strokeStyle=edge;x.stroke();
  return {img:x.getImageData(0,0,w,h),opt:{pixelRatio:k,stretchX:[[4*k,12*k]],stretchY:[[4*k,8*k]],content:[3*k,2*k,13*k,10*k]}}}

function start(){
  Promise.all([add(KIT+"maplibre-gl.js"),add(KIT+"style.js")]).then(function(){
    M=window.maplibregl;
    var host=$("#smapGl"),got=0,dead=false,touched=false,bail=function(){if(dead)return;dead=true;if(map){try{map.remove()}catch(e){}map=null}host.hidden=true;$("#smapFb").hidden=false};
    var tw=new Worker(KIT+"tilework.js"),cbs=new Map(),tid=0;tw.onerror=bail;
    tw.onmessage=function(e){var m=e.data;if(m.type==="ready"&&m.err){bail();return}if(m.type==="tile"){if(m.data&&m.data.byteLength)got++;var cb=cbs.get(m.id);if(cb){cbs.delete(m.id);cb(m.data)}}};
    tw.postMessage({type:"init",base:KIT});
    M.addProtocol("tt",function(p,abort){return new Promise(function(res,rej){var m=p.url.match(/tt:\/\/base\/(\d+)\/(\d+)\/(\d+)/);if(!m){res({data:new ArrayBuffer(0)});return}var id=++tid;cbs.set(id,function(d){res({data:d||new ArrayBuffer(0)})});
      if(abort&&abort.signal)abort.signal.addEventListener("abort",function(){cbs.delete(id);rej(new DOMException("Abort","AbortError"))});tw.postMessage({type:"tile",id:id,z:+m[1],x:+m[2],y:+m[3]})})});
    var coarse=window.matchMedia("(pointer:coarse)").matches,pad=function(){return host.clientWidth<520?18:44};
    host.hidden=false;
    map=new M.Map({container:host,style:TTMapStyle.build({base:KIT}),bounds:ISLAND,fitBoundsOptions:{padding:pad()},maxBounds:[[-66.1,44.7],[-60.5,48.2]],minZoom:6.2,maxZoom:17.5,
      attributionControl:false,dragRotate:false,pitchWithRotate:false,touchPitch:false,cooperativeGestures:coarse,locale:{"CooperativeGesturesHandler.MobileHelpText":"Use two fingers to move the map","CooperativeGesturesHandler.WindowsHelpText":"Use Ctrl + scroll to zoom the map","CooperativeGesturesHandler.MacHelpText":"Use ⌘ + scroll to zoom the map","NavigationControl.ZoomIn":"Zoom in","NavigationControl.ZoomOut":"Zoom out"}});
    map.touchZoomRotate.disableRotation();map.keyboard.disableRotation();
    map.getCanvas().setAttribute("aria-label","Road map of Prince Edward Island with the 18 golf courses. Arrow keys move the map, plus and minus zoom.");
    map.addControl(new M.NavigationControl({showCompass:false}),"top-left");
    var whole={onAdd:function(){var d=document.createElement("div");d.className="maplibregl-ctrl maplibregl-ctrl-group";var b=document.createElement("button");b.type="button";b.className="ttwhole";b.textContent="Whole Island";
      b.addEventListener("click",function(){closeCard(false);touched=false;fit(900)});d.appendChild(b);this.el=d;return d},onRemove:function(){this.el.remove()}};
    map.addControl(whole,"top-left");
    map.addControl(new M.ScaleControl({maxWidth:110,unit:"metric"}),"bottom-left");
    map.addControl(new M.AttributionControl({compact:false,customAttribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>'}),"bottom-right");
    map.on("styleimagemissing",function(e){if(!map.hasImage(e.id))map.addImage(e.id,{width:2,height:2,data:new Uint8Array(16)})});
    map.on("error",function(){});
    /* the whole Island stays in view through screen turns and resizes until the map is moved by anyone */
    var fitting=false,fit=function(ms){fitting=true;map.fitBounds(ISLAND,{padding:pad(),duration:ms});if(!ms)fitting=false};
    map.on("movestart",function(){if(!fitting)touched=true});map.on("moveend",function(){fitting=false});
    map.on("resize",function(){if(!touched&&!cardId)fit(0)});
    var wd=setTimeout(function(){if(!got)bail()},12000);
    map.on("load",function(){clearTimeout(wd);$("#smapFb").hidden=true;
      var a=shield("#FFFFFF","#55615A"),b=shield("#3D4A44","#3D4A44"),d=dot(30);
      map.addImage("shield",a.img,a.opt);map.addImage("shield-hwy",b.img,b.opt);map.addImage("tt-pin",d.img,d.opt);
      spread(map.getZoom());map.addSource("courses",{type:"geojson",data:pinData()});map.on("zoom",place);
      map.addLayer({id:"pin-sel",type:"circle",source:"courses",filter:["==",["get","id"],""],paint:{"circle-radius":17,"circle-color":"rgba(210,163,58,.28)","circle-stroke-color":"#D2A33A","circle-stroke-width":2}});
      /* names sit under the pins in the stack so every pin is placed first: a name moves or waits, a pin never does */
      map.addLayer({id:"pin-labels",type:"symbol",source:"courses",minzoom:host.clientWidth<560?8.4:0,layout:{"text-field":["get","n"],"text-font":["NotoSans-Medium"],"text-size":["interpolate",["linear"],["zoom"],7,11,12,13.5],"text-variable-anchor":["left","right","top","bottom","top-left","bottom-left","top-right","bottom-right"],"text-radial-offset":1.5,"text-justify":"auto","text-max-width":8,"text-padding":2},
        paint:{"text-color":"#22493A","text-halo-color":"rgba(255,255,255,.95)","text-halo-width":1.8}});
      map.addLayer({id:"pins",type:"symbol",source:"courses",layout:{"icon-image":"tt-pin","icon-allow-overlap":true,"icon-ignore-placement":false,"icon-padding":1,"icon-size":["interpolate",["linear"],["zoom"],6.5,0.62,8,0.78,10,1]}});
      data.courses.forEach(function(c){var el=document.createElement("button");el.type="button";el.className="ttpin-a";el.setAttribute("aria-label",c.n+", "+c.town+". Open course card");
        el.addEventListener("focus",function(){var p=map.project(c.ll),cv=map.getCanvas();if(p.x<30||p.y<30||p.x>cv.clientWidth-30||p.y>cv.clientHeight-30)map.easeTo({center:c.ll,duration:500})});
        el.addEventListener("click",function(e){e.stopPropagation();openCard(c.id,el,true)});
        pins[c.id]=new M.Marker({element:el}).setLngLat(pos[c.id]).addTo(map);el.setAttribute("aria-label",c.n+", "+c.town+". Open course card")});
      /* a near miss still opens the nearest pin */
      function near(pt,touch){var best=null,bd=1e9;data.courses.forEach(function(c){var p=map.project(pos[c.id]),d=Math.hypot(p.x-pt.x,p.y-pt.y);if(d<bd){bd=d;best=c}});return bd<=11+(touch?18:11)?best:null}
      map.on("click",function(e){var oe=e.originalEvent||{},touch=oe.pointerType?oe.pointerType!=="mouse":coarse,c=near(e.point,touch);if(c)openCard(c.id,pins[c.id].getElement(),false);else closeCard(false)});
      map.on("mousemove",function(e){map.getCanvas().style.cursor=near(e.point,false)?"pointer":""});
      drawList(false);window.TTMap=map;$("#smap").setAttribute("data-map","ready")})}).catch(function(){});}
if("IntersectionObserver" in window){var io=new IntersectionObserver(function(es){if(es[0].isIntersecting){io.disconnect();start()}});io.observe($("#smap"))}else start();
})();
