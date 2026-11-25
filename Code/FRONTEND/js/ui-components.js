const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const BADGE={
  Available:"ok",Confirmed:"ok",Approved:"ok",Resolved:"ok",Booked:"info","In use":"warn",Reserved:"warn",Pending:"warn",Claim_Pending:"warn",
  "Under Maintenance":"bad",Maintenance:"bad",Unverified:"bad",Rejected:"bad",Unclaimed:"info",Completed:"mut",Cancelled:"mut"
};
const STATUS_HELP={
  Confirmed:"Verified by a lab assistant.",
  Reserved:"Slot held. Waiting for a lab assistant to verify the student within the grace period after the start time.",
  Unverified:"Not verified within the grace period. The slot was released.",
  Completed:"Verified booking whose time has finished.",
  Cancelled:"Cancelled by the student. The slot was released.",
  Available:"No active bookings.",Booked:"Has at least one active booking.","In use":"A verified booking is in progress now.",
  "Under Maintenance":"Not bookable until an administrator returns it to service."
};
const badge=s=>`<span class="badge b-${BADGE[s]||"mut"}"${STATUS_HELP[s]?` title="${esc(STATUS_HELP[s])}"`:""}>${esc(String(s).replace("_"," "))}</span>`;

// Registered re-render functions + a 1-second ticker (grace countdowns) and a 20-second expiry sweep.
const LIVE={
  fns:[],started:false,
  add(fn){this.fns.push(fn)},
  rerender(){this.fns.forEach(fn=>{try{fn()}catch(e){}})},
  start(){
    if(this.started)return;this.started=true;
    let last=0;
    setInterval(async()=>{
      const now=Date.now();let expired=false;
      document.querySelectorAll(".grace[data-start]").forEach(el=>{
        const st=+el.dataset.start,until=+el.dataset.until;
        el.textContent=graceText(st,until,el.dataset.label,now);
        if(now>until)expired=true
      });
      if(expired||now-last>20000){
        last=now;
        try{
          const before=snapshot();
          await Store.sweepNow();                       // reloads the newest stored data, expiring finished bookings
          if(expired||snapshot()!==before)this.rerender()   // another tab may already have changed it, so compare too
        }catch(e){}
      }
    },1000)
  }
};
const graceText=(st,until,label,now=Date.now())=>now<st?"Grace period starts in "+fmtDur(st-now)+" (at "+label+")":now<=until?"Grace time left "+fmtClock(until-now):"Grace period over";
const fmtClock=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return pad(Math.floor(s/60))+":"+pad(s%60)};
const fmtDur=ms=>{
  const s=Math.max(0,Math.floor(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);
  return d?d+"d "+h+"h":h?h+"h "+pad(m)+"m":pad(m)+":"+pad(s%60)
};
function toast(msg,bad){
  let c=$(".toasts")||document.body.appendChild(Object.assign(document.createElement("div"),{
    className:"toasts"
  }));
  const t=document.createElement("div");
  t.className="toast"+(bad?" bad":"");
  t.setAttribute("role","status");
  t.textContent=msg;
  c.appendChild(t);
  setTimeout(()=>t.remove(),4000)
}
function confirmBox(title,text,onOk,label="Confirm"){
  const bg=document.createElement("div");
  bg.className="modal-bg";
  bg.innerHTML=`<div class="modal" role="dialog" aria-modal="true"><h2>${title}</h2><p>${text}</p><div class="row"><button class="btn ghost" data-x>Cancel</button><button class="btn teal" data-ok>${label}</button></div></div>`;
  document.body.appendChild(bg);
  bg.onclick=e=>{
    if(e.target==bg||e.target.dataset.x!==undefined)bg.remove();
    if(e.target.dataset.ok!==undefined){
      bg.remove();
      onOk()
    }
  };
  $("[data-ok]",bg).focus()
}
function dataTable(el,{
  cols,rows,size=5,filterKey,filterOpts=[],filters=[]
}){
  // filters: extra dropdowns [{key,label,opts}] besides the optional status filter (filterKey/filterOpts).
  const FL=[...(filterKey?[{key:filterKey,label:"Filter",opts:filterOpts}]:[]),...filters];
  let q="",fv=FL.map(()=>""),sk=null,d=1,pg=1;
  el.innerHTML=`<div class="toolbar"><input class="input" placeholder="Search…" aria-label="Search">${FL.map((x,i)=>`<select class="input" data-fi="${i}" aria-label="${esc(x.label)}"><option value="">${i?esc(x.label):"All"}</option>${x.opts.map(o=>`<option>${esc(o)}</option>`).join("")}</select>`).join("")}</div><div class="tbl-wrap"></div><div class="pager"></div>`;
  const wrap=$(".tbl-wrap",el),pager=$(".pager",el);
  function render(){
    let r=rows().filter(x=>(!q||JSON.stringify(Object.values(x)).toLowerCase().includes(q))&&FL.every((g,i)=>!fv[i]||x[g.key]==fv[i]));
    if(sk)r.sort((a,b)=>String(a[sk]).localeCompare(String(b[sk]),undefined,{
      numeric:true
    })*d);
    const pages=Math.max(1,Math.ceil(r.length/size));
    pg=Math.min(pg,pages);
    const v=r.slice((pg-1)*size,pg*size);
    wrap.innerHTML=v.length?`<table class="tbl"><thead><tr>${cols.map(c=>`<th data-k="${c.k||""}">${esc(c.l)}${sk==c.k?(d>0?" ▲":" ▼"):""}</th>`).join("")}</tr></thead><tbody>${v.map(x=>`<tr>${cols.map(c=>`<td>${c.f?c.f(x):esc(x[c.k])}</td>`).join("")}</tr>`).join("")}</tbody></table>`:`<div class="empty"><b>No results</b><p>Try a different search or filter.</p></div>`;
    pager.innerHTML=`<button class="btn ghost sm" ${pg<2?"disabled":""}>Previous</button><span class="muted">Page ${pg} of ${pages}</span><button class="btn ghost sm" ${pg>=pages?"disabled":""}>Next</button>`;
    const[b1,b2]=pager.querySelectorAll("button");
    b1.onclick=()=>{
      pg--;
      render()
    };
    b2.onclick=()=>{
      pg++;
      render()
    };
    wrap.querySelectorAll("th[data-k]").forEach(h=>h.onclick=()=>{
      if(!h.dataset.k)return;
      d=sk==h.dataset.k?-d:1;
      sk=h.dataset.k;
      render()
    })
  }
  $("input",el).oninput=e=>{
    q=e.target.value.toLowerCase();
    pg=1;
    render()
  };
  el.querySelectorAll("select[data-fi]").forEach(s=>s.onchange=e=>{
    fv[+s.dataset.fi]=e.target.value;
    pg=1;
    render()
  });
  render();
  return{
    render
  }
}
const bars=data=>data.map(x=>`<div class="bar"><span>${esc(x.lab)}${x.hrs!==undefined?`<br><small class="muted">${x.hrs} h booked of ${x.cap} h</small>`:""}</span><div><i style="width:${x.pct>0?Math.max(x.pct,3):0}%"></i></div><b>${x.pct}%</b></div>`).join("");
const stat=(n,l)=>`<div class="card stat"><b>${n}</b><span class="muted">${l}</span></div>`;
