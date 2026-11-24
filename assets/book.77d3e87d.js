/* TeeTrip: book a tee time. Sends the golfer to the course's own booking. Nothing is sent anywhere. */
(function(){
"use strict";
var $=function(s,r){return (r||document).querySelector(s)};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
var hm=function(m){return window.TT?TT.hm(m):String(m)};
var root=$("#bkList");if(!root)return;
var D,CM={},SM={},KEY="teetrip-book-v1",STORE=(function(){try{localStorage.setItem("tt-x","1");localStorage.removeItem("tt-x");return localStorage}catch(e){return null}})();
var MON=["January","February","March","April","May","June","July","August","September","October","November","December"],WD=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
var WHEN={am:["Morning",8*60+30],mid:["Around noon",12*60],pm:["Afternoon",14*60+30],tw:["Twilight",16*60+30]};
var S={near:"chtown",date:"2027-05-22",n:2,when:"am",holes:""};
function load(){var s=null;if(STORE){try{s=JSON.parse(STORE.getItem(KEY))}catch(e){}if(!s){try{var p=JSON.parse(STORE.getItem("teetrip-plan-v1"));if(p&&p.stay)s={near:p.stay}}catch(e){}}}Object.assign(S,s||{});if(!SM[S.near])S.near="chtown";S.n=Math.max(1,Math.min(4,+S.n||2));if(!WHEN[S.when])S.when="am"}
function save(){if(STORE)try{STORE.setItem(KEY,JSON.stringify(S))}catch(e){}}
function mm(a,b){return D.M[a+"|"+b]||D.M[b+"|"+a]||null}
function dt(){var p=S.date.split("-").map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2],12))}
function dlabel(d){return WD[d.getUTCDay()]+", "+MON[d.getUTCMonth()]+" "+d.getUTCDate()}
function fee(c,d){var f=D.fees[c.id];if(!f)return null;if(f.periods){var md=("0"+(d.getUTCMonth()+1)).slice(-2)+"-"+("0"+d.getUTCDate()).slice(-2);for(var i=0;i<f.periods.length;i++){var p=f.periods[i];if(md>=p[0]&&md<=p[1])return {lo:p[2],hi:p[2],f:f}}return {lo:null,f:f}}return {lo:f.rows[0][1],hi:f.rows[0][2],f:f}}
function controls(){return '<div class="flds bkf"><label class="fld">Closest to<select data-k="near">'+D.stays.map(function(s){return '<option value="'+s.id+'"'+(s.id===S.near?' selected':'')+'>'+esc(s.n)+'</option>'}).join("")+'</select></label>'+
  '<label class="fld">Day<input type="date" data-k="date" value="'+esc(S.date)+'" min="2027-05-15" max="2027-10-31"></label>'+
  '<label class="fld">Golfers<select data-k="n">'+[1,2,3,4].map(function(n){return '<option'+(n===S.n?' selected':'')+'>'+n+'</option>'}).join("")+'</select></label>'+
  '<label class="fld">Time of day<select data-k="when">'+Object.keys(WHEN).map(function(k){return '<option value="'+k+'"'+(k===S.when?' selected':'')+'>'+WHEN[k][0]+'</option>'}).join("")+'</select></label>'+
  '<label class="fld">Holes<select data-k="holes"><option value="">9 or 18</option><option value="18"'+(S.holes==="18"?' selected':'')+'>18 holes</option><option value="9"'+(S.holes==="9"?' selected':'')+'>9 holes</option></select></label></div>'}
function render(){save();var d=dt(),rows=D.courses.filter(function(c){return !S.holes||String(c.h)===S.holes}).map(function(c){var m=mm("c:"+c.id,"s:"+S.near)||[999,0];return {c:c,m:m[0],km:m[1]}}).sort(function(a,b){return a.m-b.m});
  var last="",h="";rows.forEach(function(r){var b=r.m<=30?"Within 30 minutes of "+SM[S.near].n:r.m<=60?"Within an hour":"Over an hour";if(b!==last){h+='<li class="band">'+esc(b)+'</li>';last=b}
    var f=fee(r.c,d),price=f&&f.lo!=null?'$'+f.lo+(f.hi!==f.lo?' to $'+f.hi:'')+'<br><span class="muted">2026 rate</span>':'<span class="muted">Rate from<br>the course</span>';
    h+='<li><span class="nm"><a href="'+R+'courses/'+r.c.slug+'/index.html">'+esc(r.c.n)+'</a><span class="sub">'+esc(r.c.town)+', '+r.c.h+' holes · '+r.m+' min, '+r.km+' km</span></span><span class="dr">'+price+'</span><button type="button" class="btn sm flag" data-c="'+r.c.id+'">Book with the course</button></li>'});
  $("#bkCtl").innerHTML=controls();root.innerHTML=h||'<li class="band">No courses match. Try 9 or 18.</li>';
  $("#bkSum").textContent=dlabel(d)+", "+WHEN[S.when][0].toLowerCase()+", "+S.n+" golfer"+(S.n===1?"":"s")+". Published rates are per golfer, read "+D.read+"; 2027 rates are not out yet."}
function book(c){var d=dt(),g=S.n,t=WHEN[S.when],search=c.book.indexOf("google.")>0;var txt=c.n+": "+dlabel(d)+", "+t[0].toLowerCase()+" (around "+hm(t[1])+"), "+g+" golfer"+(g===1?"":"s")+".";
  var dlg=$("#bkDlg");$("#bkIn").innerHTML='<h2>Book with '+esc(c.n)+'</h2><p class="small">TeeTrip does not take bookings yet. The course does, at the course’s price. Here is what to ask for:</p><dl><dt>Day</dt><dd>'+dlabel(d)+'</dd><dt>Time</dt><dd>'+t[0]+', around '+hm(t[1])+'</dd><dt>Golfers</dt><dd>'+g+'</dd><dt>Holes</dt><dd>'+c.h+'</dd></dl>'+
    '<div class="row"><a class="btn flag" href="'+esc(c.book)+'" target="_blank" rel="noopener">'+(search?"Find the course’s booking page":"Open the course’s website")+'</a><button class="btn ghost" id="bkCopy">Copy these details</button></div>'+
    '<p class="src" style="margin-top:12px">'+(search?"We do not have a confirmed booking link for this course yet, so this opens a web search for it.":"This opens the course’s own website.")+' You can also phone the pro shop.</p><div class="row" style="margin-top:14px"><button class="linkbtn" id="bkClose">Close</button></div>';
  $("#bkCopy").onclick=function(){(navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(function(){TT.toast("Copied")},function(){TT.toast(txt)})};$("#bkClose").onclick=function(){dlg.close()};
  if(dlg.showModal)dlg.showModal();else dlg.setAttribute("open","")}
root.addEventListener("click",function(e){var b=e.target.closest("button[data-c]");if(b)book(CM[b.getAttribute("data-c")])});
$("#bkCtl").addEventListener("change",function(e){var k=e.target.getAttribute("data-k");if(!k)return;if(k==="n")S.n=+e.target.value;else if(k==="date"){if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))S.date=e.target.value}else S[k]=e.target.value;render();var n=$('#bkCtl [data-k="'+k+'"]');n&&n.focus()});
fetch(R+"assets/plan-data.27ec6bbe.json").then(function(r){return r.json()}).then(function(d){D=d;d.courses.forEach(function(c){CM[c.id]=c});d.stays.forEach(function(s){SM[s.id]=s});var q=new URLSearchParams(location.search);load();if(q.get("near")&&SM[q.get("near")])S.near=q.get("near");render();
  if(q.get("course")&&CM[q.get("course")])book(CM[q.get("course")])}).catch(function(){root.innerHTML='<li class="band">The course list could not load. Check your connection and reload the page.</li>'});
})();
