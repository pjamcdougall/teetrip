/* TeeTrip public trip planner. Real data only: road-network drive times, published scorecards, published 2026 rates. Nothing is sent anywhere. */
(function(){
"use strict";
var $=function(s,r){return (r||document).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
var hm=function(m){return window.TT?TT.hm(m):String(m)};
var root=$("#pSteps");if(!root)return;
var RO=location.pathname.indexOf("/trip/")>=0;
var D,CM={},SMp={},S;
var KEY="teetrip-plan-v1";
var STORE=(function(){try{localStorage.setItem("tt-x","1");localStorage.removeItem("tt-x");return localStorage}catch(e){return null}})();
var KIND={coffee:"Coffee",food:"Quick food",gas:"Gas",grocery:"Groceries",liquor:"Liquor store",pharm:"Pharmacy"};
var ARRN={none:"Already on the Island",bridge:"the Confederation Bridge",ferry:"the ferry at Wood Islands",yyg:"Charlottetown airport"};
var MON=["January","February","March","April","May","June","July","August","September","October","November","December"],WD=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function defaults(){return {v:1,stay:"cav",arr:"none",start:"2027-07-08",days:3,players:4,names:"",allow:30,plan:[[],[],[]],stops:{},rest:{},sort:"drive",view:"all"}}
function save(){if(RO||!STORE)return;try{STORE.setItem(KEY,JSON.stringify(S))}catch(e){}}
function load(){var s=null;if(RO){var m=location.hash.match(/t=([^&]+)/);if(m)try{s=JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g,"+").replace(/_/g,"/")))))}catch(e){s=null}}
  else if(STORE){try{s=JSON.parse(STORE.getItem(KEY))}catch(e){s=null}}
  s=Object.assign(defaults(),s||{});fit(s);return s}
function fit(s){s.days=Math.max(1,Math.min(7,+s.days||1));while(s.plan.length<s.days)s.plan.push([]);s.plan.length=s.days;s.players=Math.max(1,Math.min(40,+s.players||1))}
function enc(s){var c={v:1,stay:s.stay,arr:s.arr,start:s.start,days:s.days,players:s.players,allow:s.allow,plan:s.plan,stops:s.stops,rest:s.rest};return btoa(unescape(encodeURIComponent(JSON.stringify(c)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}

function mm(a,b){return D.M[a+"|"+b]||D.M[b+"|"+a]||null}
function leg(a,b){return D.legs[a+"|"+b]||D.legs[b+"|"+a]||""}
function dateOf(i){var p=S.start.split("-").map(Number);var d=new Date(Date.UTC(p[0],p[1]-1,p[2]+i,12));return d}
function dlabel(d){return WD[d.getUTCDay()]+", "+MON[d.getUTCMonth()]+" "+d.getUTCDate()}
function sun(d,lat,lon){ /* NOAA sunrise/sunset, minutes after local midnight (Atlantic time) */
  var y=d.getUTCFullYear(),mo=d.getUTCMonth()+1,da=d.getUTCDate();var N=Math.floor(275*mo/9)-Math.floor((mo+9)/12)*(1+Math.floor((y-4*Math.floor(y/4)+2)/3))+da-30;
  var rad=Math.PI/180;function calc(rise){var lh=lon/15,t=N+((rise?6:18)-lh)/24,M=.9856*t-3.289,L=M+1.916*Math.sin(M*rad)+.020*Math.sin(2*M*rad)+282.634;L=(L+360)%360;
    var RA=Math.atan(.91764*Math.tan(L*rad))/rad;RA=(RA+360)%360;RA=RA+(Math.floor(L/90)*90-Math.floor(RA/90)*90);RA/=15;var sd=.39782*Math.sin(L*rad),cd=Math.cos(Math.asin(sd));
    var ch=(Math.cos(90.833*rad)-sd*Math.sin(lat*rad))/(cd*Math.cos(lat*rad));if(ch>1||ch<-1)return null;var Hh=rise?360-Math.acos(ch)/rad:Math.acos(ch)/rad;Hh/=15;var T=Hh+RA-.06571*t-6.622;var UT=((T-lh)%24+24)%24;
    var dst=(mo>3&&mo<11)||(mo===3&&da>=14)||(mo===11&&da<7);return Math.round((UT+(dst?-3:-4))*60+1440)%1440}
  return {rise:calc(true),set:calc(false)}}
function dur(c){return c.h===9?135:270}
function fee(c,d){var f=D.fees[c.id];if(!f)return null;if(f.periods){var md=("0"+(d.getUTCMonth()+1)).slice(-2)+"-"+("0"+d.getUTCDate()).slice(-2);
    for(var i=0;i<f.periods.length;i++){var p=f.periods[i];if(md>=p[0]&&md<=p[1])return {lo:p[2],hi:p[2],f:f,note:"prime-time rate for that date"}}return {lo:null,hi:null,f:f,note:"no published rate for that date"}}
  return {lo:f.rows[0][1],hi:f.rows[0][2],f:f,note:"standard rate range"}}

/* ---------- render ---------- */
function render(){fit(S);save();var h="";
  if(RO)h+='<div class="pstep" style="background:var(--tint);border-color:#DDEBC0"><p style="font-weight:600;color:var(--pine)">You\'re looking at a shared trip.</p><p class="small" style="margin-top:6px">Make it yours to change the stay, the days or the courses. It will save on this device.</p><div class="row" style="margin-top:12px"><button class="btn flag sm" data-a="mine">Make it mine</button><a class="btn ghost sm" href=R+"plan/index.html">Start a new plan</a></div></div>';
  h+=stepStay()+stepWhen()+stepCourses()+stepDays()+stepCost();root.innerHTML=h;drawMap();if(RO)$$("input,select,button:not([data-a=mine]):not([data-a=copylink]):not([data-a=print]):not([data-a=book]):not([data-a=view])",root).forEach(function(e){e.disabled=true})}
function opt(name,val,items){return '<div class="opt" role="group">'+items.map(function(it){return '<button type="button" data-a="set" data-k="'+name+'" data-v="'+it[0]+'" aria-pressed="'+(String(val)===String(it[0]))+'">'+esc(it[1])+(it[2]?'<small>'+esc(it[2])+'</small>':"")+'</button>'}).join("")+'</div>'}
function stepStay(){var near=D.courses.map(function(c){var m=mm("c:"+c.id,"s:"+S.stay);return m?m[0]:999}).filter(function(m){return m<=30}).length;
  var pk=D.pkg.filter(function(p){return ({"Mill River Resort":"west","Rodd Brudenell River Resort":"brud","Rodd Crowbush Golf & Beach Resort":"stpeters"})[p.host]===S.stay});
  return '<section class="pstep noprint-step"><h2><span class="n">1</span>Where you\'re staying</h2>'+opt("stay",S.stay,D.stays.map(function(s){var n=D.courses.filter(function(c){var m=mm("c:"+c.id,"s:"+s.id);return m&&m[0]<=30}).length;return [s.id,s.n,n+" course"+(n===1?"":"s")+" within 30 min"]}))+
   '<p class="small" style="margin-top:12px">'+near+' courses are within 30 minutes of '+esc(SMp[S.stay].n)+' by road.</p>'+
   (pk.length?'<p class="small" style="margin-top:8px">Stay and play packages listed by resorts here: '+pk.map(function(p){return esc(p.host)+', '+esc(p.n)}).join("; ")+'. Booked with the resort. <a href=R+"courses/'+D.courses.filter(function(c){return c.id===pk[0].courses[0]})[0].slug+'/index.html">Details</a></p>':"")+
   '<h3 style="font-size:18px;margin:18px 0 10px">Arriving on day one</h3>'+opt("arr",S.arr,[["none","Already here"],["bridge","By the bridge"],["ferry","By the ferry"],["yyg","By air"]])+'</section>'}
function stepWhen(){var t=S.players>16?'<p class="warn">Are you hosting a tournament? The planner is built for groups of up to 16. For a tournament, email <a href="mailto:hello@teetrip.ca?subject=Tournament">hello@teetrip.ca</a> and we\'ll point you the right way.</p>':"";
  return '<section class="pstep"><h2><span class="n">2</span>When, and who\'s coming</h2><div class="flds"><label class="fld">First day<input type="date" data-k="start" value="'+esc(S.start)+'" min="2027-05-15" max="2027-10-31"></label>'+
   '<label class="fld">Days<select data-k="days">'+[1,2,3,4,5,6,7].map(function(n){return '<option'+(n===S.days?' selected':'')+'>'+n+'</option>'}).join("")+'</select></label>'+
   '<label class="fld">Golfers<input type="number" data-k="players" min="1" max="40" value="'+S.players+'"></label></div>'+t+
   '<div class="flds" style="margin-top:12px;grid-template-columns:1fr 2fr"><label class="fld">Check in before each round<select data-k="allow">'+[15,20,30,45].map(function(n){return '<option value="'+n+'"'+(n===S.allow?' selected':'')+'>'+n+' minutes</option>'}).join("")+'</select></label>'+
   '<label class="fld">Names (optional, stay on this device)<input type="text" data-k="names" value="'+esc(S.names)+'" placeholder="Pat, Sam, Lee, Jo"></label></div>'+
   '<p class="small" style="margin-top:10px">Island courses generally open in May and close in October. Confirm dates with the course.</p></section>'}
function stepCourses(){var rows=D.courses.map(function(c){var m=mm("c:"+c.id,"s:"+S.stay)||[999,0];return {c:c,m:m[0],km:m[1]}});
  if(S.sort==="az")rows.sort(function(a,b){return a.c.n.replace("The Links at ","").localeCompare(b.c.n.replace("The Links at ",""))});else rows.sort(function(a,b){return a.m-b.m});
  var last="",h="";rows.forEach(function(r){if(S.sort!=="az"){var b=r.m<=30?"Within 30 minutes":r.m<=45?"Within 45 minutes":r.m<=60?"Within an hour":"Over an hour";if(b!==last){h+='<li class="band">'+b+'</li>';last=b}}
    var inp=S.plan.some(function(d){return d.some(function(x){return x.c===r.c.id})});
    h+='<li><span class="nm"><a href=R+"courses/'+r.c.slug+'/index.html">'+esc(r.c.n)+'</a><span class="sub">'+esc(r.c.town)+', '+r.c.h+' holes'+(inp?' · in your plan':'')+'</span></span><span class="dr">'+r.m+' min<br><span class="muted">'+r.km+' km</span></span>'+
      '<select class="addsel" data-a="add" data-c="'+r.c.id+'" aria-label="Add '+esc(r.c.n)+' to a day"><option value="">Add</option>'+S.plan.map(function(_,i){return '<option value="'+i+'">Day '+(i+1)+'</option>'}).join("")+'</select></li>'});
  return '<section class="pstep noprint-step"><h2><span class="n">3</span>Courses, by the drive</h2><div class="row" style="justify-content:space-between;margin-bottom:6px"><p class="small">From '+esc(SMp[S.stay].n)+'. No course is ranked or featured.</p><div class="seg" role="group" aria-label="Order"><button type="button" data-a="set" data-k="sort" data-v="drive" aria-pressed="'+(S.sort!=="az")+'">By drive</button><button type="button" data-a="set" data-k="sort" data-v="az" aria-pressed="'+(S.sort==="az")+'">A to Z</button></div></div><ul class="clistp">'+h+'</ul></section>'}
function dayPlan(i){var d=dateOf(i),day=S.plan[i],out=[];var from=(i===0&&S.arr!=="none")?"a:"+S.arr:"s:"+S.stay;var fromN=(i===0&&S.arr!=="none")?ARRN[S.arr]:SMp[S.stay].n;
  var prevEnd=null,prevC=null;
  day.forEach(function(r,k){var c=CM[r.c];var a=k===0?from:"c:"+prevC.id;var m=mm(a,"c:"+c.id)||[0,0];var st=k===0?(S.stops[i]||[]):[];var extra=st.reduce(function(s,x){return s+x.extra+5},0);
    var tee=r.t;var leave=tee-S.allow-m[0]-extra;var end=tee+dur(c);var sn=sun(d,c.ll[1],c.ll[0]);var warn=[];
    if(k>0){var arrive=prevEnd+m[0];if(arrive+S.allow>tee)warn.push("Not enough time between rounds: finishing the first around "+hm(prevEnd)+" and driving "+m[0]+" minutes puts you there at "+hm(arrive)+", "+(arrive+S.allow>tee?"after":"before")+" check-in for "+hm(tee)+".")}
    if(sn.set!=null&&end>sn.set)warn.push("A round starting at "+hm(tee)+" may not finish before sunset at "+hm(sn.set)+".");
    if(sn.rise!=null&&tee<sn.rise)warn.push("That's before sunrise ("+hm(sn.rise)+").");
    out.push({r:r,c:c,k:k,from:a,fromN:k===0?fromN:prevC.n.replace("The Links at ",""),m:m,leave:leave,tee:tee,end:end,warn:warn,stops:st,extra:extra,sun:sn});prevEnd=end;prevC=c});
  return out}
function teeOpts(v){var h="";for(var t=6*60;t<=18*60;t+=10)h+='<option value="'+t+'"'+(t===v?' selected':'')+'>'+hm(t)+'</option>';return h}
function stepDays(){var h="";for(var i=0;i<S.days;i++){var d=dateOf(i),P=dayPlan(i);var sn=sun(d,46.4,-63.2);
  h+='<div class="pday"><h3>Day '+(i+1)+'<small>'+dlabel(d)+(sn.set!=null?' · sunset about '+hm(sn.set):'')+'</small></h3>';
  if(!P.length){if(S.rest[i]){var nd=D.nearDrive[S.stay],dr=D.drives.filter(function(x){return x.k===nd[0]})[0];
      h+='<p class="okn">Rest day. Nearest scenic drive: <b>'+esc(dr.n)+'</b>, a '+dr.km+' km route ('+esc(dr.sub)+'), starting about '+nd[1]+' km from '+esc(SMp[S.stay].n)+'.</p><button class="linkbtn" data-a="rest" data-d="'+i+'">Not a rest day</button>'}
    else h+='<p class="small" style="margin-top:8px">No round yet. Add a course from step 3, or <button class="linkbtn" data-a="rest" data-d="'+i+'">make it a rest day</button>.</p>'}
  P.forEach(function(p){h+='<div class="rnd"><div class="top"><b>'+esc(p.c.n)+'</b><span class="row" style="gap:8px"><label class="sr" for="t'+i+p.k+'">Tee time</label><select id="t'+i+p.k+'" data-a="tee" data-d="'+i+'" data-i="'+p.k+'">'+teeOpts(p.tee)+'</select>'+
    '<button class="btn sm ghost" data-a="book" data-d="'+i+'" data-i="'+p.k+'">Book with the course</button><button class="linkbtn del" data-a="del" data-d="'+i+'" data-i="'+p.k+'" aria-label="Remove '+esc(p.c.n)+' from day '+(i+1)+'">Remove</button></span></div>'+
    '<ul class="tl"><li><b>'+hm(p.leave)+'</b><i></i><span>Leave '+esc(p.fromN)+'</span></li>'+
    p.stops.map(function(s){return '<li class="drive"><b>+'+(s.extra+5)+' min</b><i></i><span>Stop: '+esc(s.n)+(s.t?', '+esc(s.t):'')+'</span></li>'}).join("")+
    '<li class="drive"><b>'+p.m[0]+' min</b><i></i><span>'+p.m[1]+' km by road</span></li><li><b>'+hm(p.tee-S.allow)+'</b><i></i><span>Check in at the pro shop</span></li><li class="tee"><b>'+hm(p.tee)+'</b><i></i><span>Tee time aimed for, '+p.c.h+' holes</span></li><li><b>'+hm(p.end)+'</b><i></i><span>Finish, about</span></li></ul>'+
    p.warn.map(function(w){return '<span class="warn">'+esc(w)+'</span>'}).join("")+(p.k===0&&p.from.indexOf("s:")===0?stopsUI(i,p):"")+'</div>'});
  h+='</div>'}
  return '<section class="pstep"><h2><span class="n">4</span>Your days</h2><p class="small">Times are what you\'re aiming for. The course confirms the tee time when you book with them.</p>'+h+'</section>'}
function stopsUI(i,p){var key=S.stay+">"+p.c.id,st=D.stops[key]||{},have=S.stops[i]||[];var ks=Object.keys(KIND).filter(function(k){return st[k]&&st[k].length});if(!ks.length)return "";
  return '<div class="stops" role="group" aria-label="Stops on the way">'+ks.map(function(k){var q=st[k][0];var on=have.some(function(x){return x.n===q.n});return '<button type="button" data-a="stop" data-d="'+i+'" data-k="'+k+'" aria-pressed="'+on+'">'+KIND[k]+': '+esc(q.n)+' <span class="muted">+'+(q.extra+5)+' min</span></button>'}).join("")+'</div><p class="src" style="margin-top:6px">Stops close to the road you\'ll take. Extra minutes are an estimate. No opening hours on file.</p>'}
function stepCost(){var lines="",lo=0,hi=0,n=0,other=[],g=S.players;
  for(var i=0;i<S.days;i++)S.plan[i].forEach(function(r){var c=CM[r.c],d=dateOf(i),f=fee(c,d);
    if(f&&f.lo!=null){lo+=f.lo*g;hi+=f.hi*g;n++;lines+='<div><span>Day '+(i+1)+', '+esc(c.n)+'<br><span class="src">$'+f.lo+(f.hi!==f.lo?' to $'+f.hi:'')+' per golfer, '+f.note+(f.f.hst?', plus HST':'')+'. '+esc(f.f.src)+', read '+D.read+'.</span></span><b>$'+(f.lo*g).toLocaleString()+(f.hi!==f.lo?' to $'+(f.hi*g).toLocaleString():'')+'</b></div>'}
    else{other.push(c.n);lines+='<div><span>Day '+(i+1)+', '+esc(c.n)+'</span><b class="muted" style="font-weight:500">Rate from the course</b></div>'}});
  var link=new URL(R+"trip/index.html",location.href).href+"#t="+enc(S);
  var tot=n?'<div style="border-bottom:2px solid var(--pine)"><span><b style="color:var(--ink)">For the group, '+g+' golfer'+(g===1?'':'s')+'</b><br><span class="src">From the '+n+' round'+(n===1?'':'s')+' with published 2026 rates'+(other.length?', plus '+other.length+' round'+(other.length===1?'':'s')+' priced by the course':'')+'. 2027 rates aren\'t published yet.</span></span><b>$'+lo.toLocaleString()+(hi!==lo?' to $'+hi.toLocaleString():'')+'</b></div>':'';
  return '<section class="pstep"><h2><span class="n">5</span>What it costs, and sharing it</h2>'+(lines?'<div class="totals">'+lines+tot+'<div><span>What TeeTrip adds to the price</span><b>$0</b></div></div>':'<p class="small">Add a course to see what the rounds cost.</p>')+
   '<p class="small" style="margin-top:12px">You pay each course directly, at the course\'s price. Rooms are booked with your hotel or host; TeeTrip sells no rooms.</p>'+
   '<h3 style="font-size:19px;margin:22px 0 10px">Share this trip</h3><div class="share"><div><label class="fld">Link to this plan<input type="text" readonly value="'+esc(link)+'" id="shareLink"></label><div class="row" style="margin-top:10px"><button class="btn sm" data-a="copylink">Copy link</button><button class="btn ghost sm" data-a="print">Print</button>'+(RO?'':'<button class="linkbtn del" data-a="reset" style="margin-left:6px">'+(S._confirm?'Tap again to clear the plan':'Start over')+'</button>')+'</div>'+
   '<p class="src" style="margin-top:10px">'+(RO?'This plan came from a link.':'Saved on this device. Use the share link to keep a copy or open it on your phone.')+' The link holds the whole plan; nothing is stored on our side.</p></div><div class="qr" id="qr" aria-label="QR code for the link to this plan"></div></div></section>'}

function drawMap(){var pins=$("#pPins"),rt=$("#pRoutes");if(!pins)return;var NS="http://www.w3.org/2000/svg";
  var inPlan={};S.plan.forEach(function(d){d.forEach(function(r){inPlan[r.c]=1})});
  var h="";var legs=[];var days=S.view==="all"?S.plan.map(function(_,i){return i}):[+S.view];
  days.forEach(function(i){dayPlan(i).forEach(function(p){legs.push([p.from,"c:"+p.c.id,i])})});
  var cols=["#E9CB5E","#D2A33A","#3F7A55","#7FB3D5","#B85C38","#6B5BA8","#C9A24A"];
  rt.innerHTML=legs.map(function(l){var d=leg(l[0],l[1]);return d?'<path d="'+d+'" fill="none" stroke="'+cols[l[2]%7]+'" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>':""}).join("");
  D.courses.forEach(function(c){var on=inPlan[c.id];h+='<g class="pin'+(on?" on":" dim")+'"><circle class="halo" cx="'+c.xy[0]+'" cy="'+c.xy[1]+'" r="'+(on?15:0)+'"/><circle class="dot" cx="'+c.xy[0]+'" cy="'+c.xy[1]+'" r="'+(on?7:5)+'"><title>'+esc(c.n)+'</title></circle></g>'});
  var s=SMp[S.stay];h+='<rect x="'+(s.xy[0]-8)+'" y="'+(s.xy[1]-8)+'" width="16" height="16" rx="4" fill="#fff" stroke="#2B5D45" stroke-width="3"><title>'+esc(s.n)+'</title></rect>';
  if(S.arr!=="none"){var a=D.arr[S.arr];h+='<circle cx="'+a.xy[0]+'" cy="'+a.xy[1]+'" r="8" fill="#2B5D45" stroke="#fff" stroke-width="2.5"><title>'+esc(a.n)+'</title></circle>'}
  pins.innerHTML=h;
  var tabs=$("#pMapTabs");if(tabs)tabs.innerHTML='<div class="seg">'+['all'].concat(S.plan.map(function(_,i){return String(i)})).map(function(v){return '<button type="button" data-a="view" data-v="'+v+'" aria-pressed="'+(String(S.view)===v)+'">'+(v==="all"?"Whole trip":"Day "+(+v+1))+'</button>'}).join("")+'</div>';
  var q=$("#qr");if(q&&window.qrcode){try{var qr=qrcode(0,"M");qr.addData($("#shareLink").value);qr.make();q.innerHTML=qr.createSvgTag({cellSize:3,margin:0,scalable:true})}catch(e){q.innerHTML='<p class="src">The link is too long for a QR code. Use Copy link.</p>'}}}

/* ---------- events ---------- */
function addCourse(cid,di){var day=S.plan[di];var prev=day[day.length-1];var t;
  if(prev){var pc=CM[prev.c],m=mm("c:"+prev.c,"c:"+cid)||[30];t=prev.t+dur(pc)+m[0]+S.allow+15;t=Math.ceil(t/10)*10}
  else{var fr=(di===0&&S.arr!=="none")?"a:"+S.arr:"s:"+S.stay;t=di===0&&S.arr!=="none"?13*60+30:9*60}
  day.push({c:cid,t:Math.min(t,18*60)});delete S.rest[di]}
root.addEventListener("click",function(e){var b=e.target.closest("[data-a]");if(!b||b.tagName==="SELECT")return;var a=b.getAttribute("data-a");
  if(a==="set"){var k=b.getAttribute("data-k"),v=b.getAttribute("data-v");S[k]=v;render();var nb=root.querySelector('[data-a=set][data-k="'+k+'"][data-v="'+v+'"]');nb&&nb.focus();return}
  if(a==="del"){S.plan[+b.dataset.d].splice(+b.dataset.i,1);if(+b.dataset.i===0)delete S.stops[b.dataset.d];render();return}
  if(a==="rest"){var d=b.dataset.d;if(S.rest[d])delete S.rest[d];else S.rest[d]=1;render();return}
  if(a==="stop"){var di=b.dataset.d,kind=b.dataset.k,p=dayPlan(+di)[0];var q=(D.stops[S.stay+">"+p.c.id]||{})[kind][0];var l=S.stops[di]=S.stops[di]||[];var ix=l.findIndex(function(x){return x.n===q.n});
    if(ix>=0)l.splice(ix,1);else if(l.length<2)l.push({n:q.n,t:q.t,extra:q.extra,kind:kind});else TT.toast("Two stops a day at most");render();return}
  if(a==="book"){book(+b.dataset.d,+b.dataset.i);return}
  if(a==="copylink"){var v2=$("#shareLink").value;(navigator.clipboard?navigator.clipboard.writeText(v2):Promise.reject()).then(function(){TT.toast("Link copied")},function(){$("#shareLink").select();TT.toast("Select the link and copy it")});return}
  if(a==="print"){window.print();return}
  if(a==="reset"){if(!S._confirm){S._confirm=1;render();setTimeout(function(){if(S._confirm){delete S._confirm;render()}},4000);return}S=defaults();render();TT.toast("Plan cleared");return}
  if(a==="mine"){var m2=Object.assign({},S);if(STORE)try{STORE.setItem(KEY,JSON.stringify(m2))}catch(x){}location.href=R+"plan/index.html";return}});
document.addEventListener("click",function(e){var b=e.target.closest("[data-a=view]");if(!b)return;S.view=b.dataset.v;save();drawMap()});
root.addEventListener("change",function(e){var t=e.target;
  if(t.matches("[data-a=add]")&&t.value!==""){addCourse(t.dataset.c,+t.value);var cn=CM[t.dataset.c].n;render();TT.toast(cn+" added to day "+(+t.value+1));return}
  if(t.matches("[data-a=tee]")){S.plan[+t.dataset.d][+t.dataset.i].t=+t.value;render();var n=$("#t"+t.dataset.d+t.dataset.i);n&&n.focus();return}
  var k=t.getAttribute("data-k");if(!k)return;if(k==="days"||k==="players"||k==="allow")S[k]=+t.value;else if(k==="start"){if(/^\d{4}-\d{2}-\d{2}$/.test(t.value))S.start=t.value}else S[k]=t.value;
  render();var nn=root.querySelector('[data-k="'+k+'"]');nn&&nn.focus()});

function book(di,i){var p=dayPlan(di)[i],c=p.c,d=dateOf(di);var g=S.players;var search=c.book.indexOf("google.")>0;
  var txt=c.n+": "+dlabel(d)+", around "+hm(p.tee)+", "+g+" golfer"+(g===1?"":"s")+".";
  var dlg=$("#bkDlg");$("#bkIn").innerHTML='<h2>Book with '+esc(c.n)+'</h2><p class="small">TeeTrip doesn\'t take bookings. The course does, at the course\'s price. Here\'s what to ask for:</p><dl><dt>Day</dt><dd>'+dlabel(d)+'</dd><dt>Time</dt><dd>Around '+hm(p.tee)+'</dd><dt>Golfers</dt><dd>'+g+'</dd><dt>Holes</dt><dd>'+c.h+'</dd></dl>'+
    '<div class="row"><a class="btn flag" href="'+esc(c.book)+'" target="_blank" rel="noopener">'+(search?"Find the course's booking page":"Open the course's website")+'</a><button class="btn ghost" id="bkCopy">Copy these details</button></div>'+
    '<p class="src" style="margin-top:12px">'+(search?"We don't have a confirmed booking link for this course yet, so this opens a web search for it.":"This opens the course's own website.")+' When the course confirms a time, change the tee time here to match.</p><div class="row" style="margin-top:14px"><button class="linkbtn" id="bkClose">Close</button></div>';
  $("#bkCopy").onclick=function(){(navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(function(){TT.toast("Copied")},function(){TT.toast(txt)})};$("#bkClose").onclick=function(){dlg.close()};
  if(dlg.showModal)dlg.showModal();else dlg.setAttribute("open","")}

/* ---------- start ---------- */
fetch(R+"assets/plan-data.27ec6bbe.json").then(function(r){return r.json()}).then(function(d){D=d;d.courses.forEach(function(c){CM[c.id]=c});d.stays.forEach(function(s){SMp[s.id]=s});
  S=load();var q=new URLSearchParams(location.search);if(!RO){if(q.get("stay")&&SMp[q.get("stay")])S.stay=q.get("stay");
    if(q.get("add")&&CM[q.get("add")]){var cid=q.get("add");if(!S.plan.some(function(x){return x.some(function(r){return r.c===cid})})){var di=S.plan.findIndex(function(x){return !x.length});if(di<0)di=0;addCourse(cid,di);setTimeout(function(){TT.toast(CM[cid].n+" added to day "+(di+1))},300)}}
    if(q.toString())history.replaceState(null,"",location.pathname)}
  if(RO&&!/t=/.test(location.hash)){root.innerHTML='<div class="pstep"><h2>This link doesn\'t hold a trip.</h2><p class="small">It may have been cut short when it was copied. <a href=R+"plan/index.html">Start a plan</a>.</p></div>';return}
  render()}).catch(function(){root.innerHTML='<div class="pstep"><h2>The planner couldn\'t load its data.</h2><p class="small">Check your connection and reload the page. The <a href=R+"courses/index.html">course pages</a> still work.</p></div>'});
})();
