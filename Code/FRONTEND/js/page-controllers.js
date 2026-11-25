// Page-specific scripts for each CampusPulse screen.
// Role checks here are frontend-only (UI hints + action guards). A real backend must enforce them.
const PAGES={};
const head=(t,s,x="")=>`<div class="page-head"><div><h1>${t}</h1><p class="muted">${s}</p></div>${x}</div>`;
const sel=(id,l,opts)=>`<div class="field"><label>${l}</label><select class="input" name="${id}">${opts}</select></div>`;
const inp=(id,l,t="text",x="")=>`<div class="field"><label>${l}</label><input class="input" name="${id}" type="${t}" ${x}></div>`;
const params=new URLSearchParams(location.search);
const can=(...roles)=>roles.includes(getRole());
const CS_LABS=()=>[...new Set(DATA.resources.map(r=>r.lab))];
const DEPTS=()=>[...new Set(DATA.resources.map(r=>r.dept))];
const resOpts=()=>DEPTS().map(dep=>{
  const rs=DATA.resources.filter(r=>r.dept===dep&&!r.maintenance);
  return rs.length?`<optgroup label="${esc(dep)}">${rs.map(r=>`<option value="${r.id}">${esc(r.name)} (${esc(r.lab)})</option>`).join("")}</optgroup>`:""
}).join("");
const mineB=()=>DATA.bookings.filter(b=>String(b.userId)===String(CURRENT_USER.id));
const flat=b=>{
  const p=person(b.userId,b.snap);
  return{...b,status:bookingState(b),resource:resName(b.res),time:b.start+"–"+b.end,student:p.name,rollNo:p.rollNo,department:p.department,email:p.email}
};
const isActiveRow=b=>ACTIVE.includes(b.status);
const graceCell=b=>{
  if(b.status==="Confirmed")return`<span class="muted">Verified${b.verifiedAt?" at "+hhmm(b.verifiedAt):""}</span>`;
  if(b.status==="Reserved"){
    const until=Math.min(b.graceEndTs,b.endTs);
    return`<span class="grace" data-start="${b.startTs}" data-until="${until}" data-label="${esc(b.start)}">${esc(graceText(b.startTs,until,b.start))}</span>`
  }
  if(b.status==="Unverified")return'<span class="muted">Slot released</span>';
  return""
};
const bookingCols=x=>[{
  k:"resource",l:"Resource"
},{
  k:"date",l:"Date"
},{
  k:"time",l:"Time"
},{
  k:"status",l:"Status",f:b=>badge(b.status)
},{
  k:"",l:"Grace time",f:graceCell
},...(x||[])];
const staffCols=()=>[{
  k:"student",l:"Student name"
},{
  k:"rollNo",l:"Roll number"
},{
  k:"department",l:"Department"
},{
  k:"email",l:"Student email"
}];
const legend=()=>`<div class="alert info legend"><b>Booking status guide</b><br>${badge("Reserved")} Slot is held and waiting for a lab assistant to verify the student. The ${CONFIG.GRACE_MINUTES}-minute grace period starts at the booking's start time.<br>${badge("Confirmed")} Verified by a lab assistant.<br>${badge("Unverified")} Not verified before the grace period ended. The slot was released.<br>${badge("Completed")} ${badge("Cancelled")} Finished bookings.</div>`;
const BOOKING_FILTERS=["Reserved","Confirmed","Unverified","Completed","Cancelled"];
const sortNewest=(a,b)=>b.startTs-a.startTs;
const failToast=()=>toast("Could not save to this browser's storage. Check that storage is enabled and not full.",true);
function showMsg(el, text, type) {
  const box = $("#msg", el);
  box.innerHTML = '<div class="alert ' + type + '"></div>';
  box.firstChild.textContent = text;
}
// Plain-text lines describing a resource's active booked slots (staff also see who booked).
const slotStrs=r=>activeSlots(r.id).map(b=>{
  const p=person(b.userId,b.snap),own=CURRENT_USER&&String(b.userId)===String(CURRENT_USER.id);
  return b.date+" "+b.start+"–"+b.end+" ("+bookingState(b)+")"+(can("assistant","admin")?" · "+p.name+" · "+p.rollNo:own?" · yours":"")
});

function authPage(el, reg) {
  el.innerHTML = `<div class="auth-card"><img class="logo" src="assets/logo.jpg" alt="CampusPulse"><h1>${reg ? "Create your account" : "Sign in"}</h1><div id="msg"></div><form novalidate>${reg ? inp("name", "Full name") : ""}${inp("email", "University email", "email")}${inp("rollNo", reg ? "Roll number (students)" : "Roll number (students)", "text", 'placeholder="e.g. CS-810" autocomplete="off"')}${reg ? sel("department", "Department (students)", '<option value="">Select department</option>' + CONFIG.DEPARTMENTS.map(d => `<option>${esc(d)}</option>`).join("")) : ""}${sel("role", reg ? "Register as" : "Sign in as", Object.entries(ROLE_LABEL).filter(([k]) => !reg || k != "admin").map(([k, v]) => `<option value="${k}">${v}</option>`).join(""))}<div class="field pw"><label>Password</label><input class="input" name="pw" type="password" autocomplete="${reg ? "new-password" : "current-password"}"><button type="button">Show</button></div><button class="btn block">${reg ? "Register" : "Sign in"}</button></form><p class="muted" style="margin-top:14px"><a href="index.html">&larr; Back to welcome page</a><br>${reg ? 'Have an account? <a href="sign-in.html">Sign in</a>' : 'New here? <a href="register.html">Register</a>'}</p></div>`;
  const f = $("form", el), tb = $(".pw button", el), go = $(".btn.block", el);
  f.email.closest(".field").insertAdjacentHTML("beforeend", '<small class="muted" id="hint"></small>');
  const hint = () => {
    const r = f.role.value;
    $("#hint", el).textContent = "Permitted for " + ROLE_LABEL[r] + ": " + CONFIG.EMAIL_DOMAINS[r].map(d => "@" + d).join(", ");
    [f.rollNo, f.department].filter(Boolean).forEach(x => { x.closest(".field").style.display = r === "student" ? "" : "none"; });
  };
  f.role.onchange = hint; hint();
  tb.onclick = () => { f.pw.type = f.pw.type == "password" ? "text" : "password"; tb.textContent = f.pw.type == "password" ? "Show" : "Hide"; };
  f.onsubmit = async e => {
    e.preventDefault();
    $("#msg", el).innerHTML = "";
    const rules = { email: v => reg ? CONFIG.emailError(v, f.role.value) : CONFIG.loginEmailError(v), pw: v => v.length >= 8 ? "" : "Use at least 8 characters." };
    if (reg) rules.name = v => v.length >= 2 ? "" : "Enter your full name.";
    if (reg && f.role.value === "student") { rules.rollNo = v => CONFIG.rollError(v); rules.department = v => v ? "" : "Select your department."; }
    else if (!reg && f.role.value === "student") rules.rollNo = v => v ? CONFIG.rollError(v) : "";   // optional at sign-in; required by the account only if it has none saved
    else { V.show(f.rollNo, ""); if (f.department) V.show(f.department, ""); }
    if (!V.form(f, rules)) return;
    go.disabled = true;
    try {
      const body = { email: f.email.value.trim(), password: f.pw.value, role: f.role.value };
      if (reg) {
        body.name = f.name.value.trim();
        if (body.role === "student") { body.rollNo = f.rollNo.value.trim(); body.department = f.department.value; }
        const r = await api.post("/register", body);
        showMsg(el, r.message, "ok");
        f.reset(); hint();
        setTimeout(() => location.href = "sign-in.html", 1500);
      } else {
        if (body.role === "student") body.rollNo = f.rollNo.value.trim();
        const r = await api.post("/login", body);
        location.href = HOME[r.user.role] + ".html";
      }
    } catch (err) {
      for (const [k, m] of Object.entries(err.fields || {})) if (f[k === "password" ? "pw" : k]) V.show(f[k === "password" ? "pw" : k], m);
      showMsg(el, err.message, "bad");
      go.disabled = false;
    }
  };
}
PAGES["sign-in"]=el=>authPage(el,false);
PAGES["register"]=el=>authPage(el,true);

PAGES["student-dashboard"]=el=>{
  const stats=()=>`<div class="grid g4">${stat(mineB().filter(b=>isActive(b)).length,"My bookings")}${stat(DATA.claims.filter(c=>String(c.userId)===String(CURRENT_USER.id)&&c.status=="Pending").length,"Open claims")}${stat(DATA.resources.filter(r=>r.status=="Available").length,"Resources available")}${stat(DATA.items.filter(i=>i.status=="Unclaimed").length,"Unclaimed items")}</div>`;
  el.innerHTML=head("Student dashboard","Your bookings and claims at a glance. ",'<a class="btn teal" href="book-resource.html">Book a resource</a>')+`<div id="st">${stats()}</div><div class="alert warn" style="margin:16px 0"><b>${CONFIG.GRACE_MINUTES}-minute grace period:</b> a reservation that is not verified by a lab assistant within ${CONFIG.GRACE_MINUTES} minutes of its start time is released. The countdown starts at the booking's start time and is shown in the Grace time column.</div><div class="card"><h2>Upcoming bookings</h2><div id="t"></div></div>`;
  const t=dataTable($("#t"),{
    cols:bookingCols(),rows:()=>mineB().map(flat).filter(isActiveRow).sort((a,b)=>a.startTs-b.startTs),size:4
  });
  LIVE.add(()=>{$("#st").innerHTML=stats();t.render()})
};
PAGES["lab-resources"]=el=>{
  const role=getRole();
  el.innerHTML=head("Lab resources","Browse equipment and workstations by department and laboratory. ")+`<div class="card" id="t"></div>`;
  const t=dataTable($("#t"),{
    cols:[{
      k:"name",l:"Resource"
    },{
      k:"dept",l:"Department"
    },{
      k:"lab",l:"Laboratory"
    },{
      k:"desc",l:"Description"
    },{
      k:"status",l:"Status",f:r=>badge(r.status)
    },{
      k:"slots",l:"Booked slots",f:r=>r.slotList.length?r.slotList.map(esc).join("<br>"):'<span class="muted">None</span>'
    },{
      l:"",f:r=>role=="student"?(r.status=="Under Maintenance"?"":`<a class="btn sm teal" href="book-resource.html?res=${r.id}">Book</a>`)
        :role=="admin"?`<button class="btn sm ${r.maintenance?"teal":"ghost"}" data-m="${r.maintenance?0:1}" data-id="${r.id}">${r.maintenance?"Return to service":"Set under maintenance"}</button>`:""
    }],
    rows:()=>[...DATA.resources].sort((a,b)=>a.dept.localeCompare(b.dept)||a.name.localeCompare(b.name)).map(r=>{const l=slotStrs(r);return{...r,name:resName(r.id),slotList:l,slots:l.join("; ")}}),
    filterKey:"status",filterOpts:["Available","Booked","In use","Under Maintenance"],
    filters:[{key:"dept",label:"All departments",opts:DEPTS()}],size:10
  });
  LIVE.add(()=>t.render());
  $("#t").addEventListener("click",e=>{
    const b=e.target.closest("[data-m]");
    if(!b)return;
    if(!can("admin"))return toast("Only administrators can change maintenance status.",true);
    const r=DATA.resources.find(x=>x.id==b.dataset.id),flag=b.dataset.m=="1",n=activeSlots(r.id).length;
    confirmBox(flag?"Set under maintenance?":"Return to service?",
      flag?esc(r.name)+" will no longer be bookable."+(n?" It has "+n+" active booking(s); they are kept and not cancelled automatically.":""):esc(r.name)+" will become bookable again.",
      async()=>{
        try{
          const res=await Store.setMaintenance(r.id,flag,CURRENT_USER);
          if(!res.ok)return toast(res.message,true);
          t.render();toast(r.name+(flag?" is now under maintenance.":" is back in service."))
        }catch(err){failToast()}
      },flag?"Set under maintenance":"Return to service")
  })
};
PAGES["book-resource"]=el=>{
  const t0=new Date();t0.setMinutes(0,0,0);t0.setHours(t0.getHours()+1);
  const t1=new Date(t0.getTime()+3600000);
  const d0=t0.getFullYear()+"-"+pad(t0.getMonth()+1)+"-"+pad(t0.getDate());
  const startDef=pad(t0.getHours())+":00",endDef=t1.getDate()!==t0.getDate()?"23:59":pad(t1.getHours())+":00";
  el.innerHTML=head("Book a resource","Choose a resource and time slot. ")+`<div class="card" style="max-width:560px"><div id="res"></div><form novalidate>${sel("res","Resource",resOpts())}<div id="slots"></div>${inp("date","Date","date",`value="${d0}" min="${todayStr()}"`)}<div class="grid g2">${inp("start","Start","time",`value="${startDef}"`)}${inp("end","End","time",`value="${endDef}"`)}</div><button class="btn teal">Check and request booking</button></form></div>`;
  const f=$("form",el),btn=$(".btn.teal",f);
  if(params.get("res")){
    const pr=DATA.resources.find(r=>r.id==params.get("res"));
    if(pr&&pr.maintenance)$("#res").innerHTML=`<div class="alert bad">${esc(pr.name)} is under maintenance and cannot be booked right now.</div>`;
    else if(pr)f.res.value=pr.id
  }
  if(!f.res.value){f.querySelectorAll("input,button").forEach(x=>x.disabled=true);$("#res").innerHTML='<div class="alert bad">No resources are available for booking right now.</div>'}
  const drawSlots=()=>{
    const r=DATA.resources.find(x=>x.id==f.res.value);
    if(!r){$("#slots").innerHTML="";return}
    const l=slotStrs(r);
    $("#slots").innerHTML=`<div class="alert info" style="font-size:13px"><b>Current status:</b> ${badge(r.status)}<br>${l.length?"<b>Already booked:</b><br>"+l.map(esc).join("<br>"):"No active bookings. Any time slot is free."}</div>`
  };
  f.res.onchange=drawSlots;drawSlots();LIVE.add(drawSlots);
  f.onsubmit=async e=>{
    e.preventDefault();
    const out=$("#res");out.innerHTML="";
    if(!V.form(f,{
      date:v=>v?"":"Choose a date.",start:v=>v?"":"Choose a start time.",end:v=>!v?"Choose an end time.":v>f.start.value?"":"End time must be after start time."
    }))return;
    if(!can("student"))return toast("Only students can book resources.",true);
    btn.disabled=true;
    try{
      const r=await Store.book({res:f.res.value,date:f.date.value,start:f.start.value,end:f.end.value},CURRENT_USER);
      if(!r.ok){
        out.innerHTML=`<div class="alert bad"><b>Booking not made.</b> ${esc(r.message)}</div>`;
        if(r.field&&f[r.field]&&r.field!=="res")V.show(f[r.field],r.message);
        return
      }
      const nb=r.booking;
      out.innerHTML=`<div class="alert ok"><b>Booking requested.</b> ${esc(resName(nb.res))} on ${esc(nb.date)}, ${esc(nb.start)}–${esc(nb.end)}. Status: Reserved. A lab assistant must verify you within ${CONFIG.GRACE_MINUTES} minutes of the start time (${esc(nb.start)}), or the slot is released. <a href="my-bookings.html">View my bookings</a></div>`;
      toast("Booking requested.")
    }catch(err){failToast()}
    finally{btn.disabled=false;drawSlots()}
  }
};
PAGES["my-bookings"]=el=>{
  el.innerHTML=head("My bookings","Your reservations. ")+legend()+`<div class="card" id="t"></div>`;
  const t=dataTable($("#t"),{
    cols:bookingCols([{
      l:"",f:b=>isActiveRow(b)?`<button class="btn sm ghost" data-id="${b.id}">Cancel</button>`:""
    }]),rows:()=>mineB().map(flat).sort(sortNewest),filterKey:"status",filterOpts:BOOKING_FILTERS
  });
  LIVE.add(()=>t.render());
  $("#t").addEventListener("click",e=>{
    const id=e.target.closest("[data-id]")?.dataset.id;
    if(id)confirmBox("Cancel booking?","The slot will be released for other users.",async()=>{
      try{
        const r=await Store.cancel(id,CURRENT_USER);
        if(!r.ok)toast(r.message,true);else toast("Booking cancelled.");
        t.render()
      }catch(err){failToast()}
    },"Cancel booking")
  })
};
PAGES["lost-and-found"]=el=>{
  el.innerHTML=head("Lost & Found","Search items reported anywhere on campus. ",getRole()=="student"?'<a class="btn teal" href="report-item.html">Report an item</a>':"")+`<div class="card" id="t"></div>`;
  const places=[...new Set([...CS_LABS(),...DATA.items.map(i=>i.found_at).filter(Boolean)])].sort((a,b)=>a.localeCompare(b));
  dataTable($("#t"),{
    cols:[{
      k:"title",l:"Item"
    },{
      k:"kind",l:"Type"
    },{
      k:"cat",l:"Category"
    },{
      k:"found_at",l:"Location"
    },{
      k:"date",l:"Date"
    },{
      k:"status",l:"Status",f:i=>badge(i.status)
    },{
      l:"",f:i=>`<a class="btn sm ghost" href="item-details-and-claim.html?id=${i.id}">View</a>`
    }],rows:()=>DATA.items,filterKey:"status",filterOpts:["Unclaimed","Claim_Pending","Resolved"],
    filters:[{key:"found_at",label:"All locations",opts:places}]
  })
};
PAGES["report-item"]=el=>{
  el.innerHTML=head("Report a lost or found item","Fill in the details. ")+`<div class="card" style="max-width:560px"><form novalidate>${sel("kind","Report type",'<option value="Found">Found item</option><option value="Lost">Lost item</option>')}${inp("title","Item name")}${sel("cat","Category",ITEM_CATS.map(c=>`<option>${esc(c)}</option>`).join(""))}${sel("loc","Location",`<optgroup label="Computer Science labs">${CS_LABS().map(l=>`<option>${esc(l)}</option>`).join("")}</optgroup><optgroup label="Other campus locations">${CAMPUS_PLACES.map(l=>`<option>${esc(l)}</option>`).join("")}</optgroup><option value="__other">Other (type below)…</option>`)}<div class="field" id="otherloc" style="display:none"><input class="input" name="found_at" type="text" autocomplete="off" placeholder="Type the location, e.g. Hostel Block C"></div><div class="field"><label>Description</label><textarea class="input" name="desc" rows="4"></textarea></div><button class="btn teal">Submit report</button></form></div>`;
  const f=$("form",el);
  f.loc.onchange=()=>{$("#otherloc",el).style.display=f.loc.value==="__other"?"":"none"};
  f.onsubmit=async e=>{
    e.preventDefault();
    const other=f.loc.value==="__other";
    if(!V.form(f,{
      title:v=>v?"":"Enter the item name.",found_at:v=>!other||v.length>=2?"":"Enter a location.",desc:v=>v.length>=10?"":"Describe the item (10+ characters)."
    }))return;
    try{
      const r=await Store.addItem({kind:f.kind.value,title:f.title.value.trim(),cat:f.cat.value,found_at:other?f.found_at.value:f.loc.value,desc:f.desc.value.trim()},CURRENT_USER);
      if(!r.ok)return toast(r.message,true);
      f.reset();f.loc.onchange();toast("Report submitted. It now appears in Lost & Found.")
    }catch(err){failToast()}
  }
};
PAGES["item-details-and-claim"]=el=>{
  const it=DATA.items.find(i=>i.id==params.get("id")),stu=getRole()=="student";
  if(!it){el.innerHTML=head("Item not found","This item does not exist or was removed. ")+'<p><a class="btn teal" href="lost-and-found.html">Back to Lost &amp; Found</a></p>';return}
  el.innerHTML=head(esc(it.title),"Item details ")+`<div class="grid g2"><div class="card"><dl class="detail"><dt>Status</dt><dd>${badge(it.status)}</dd><dt>Type</dt><dd>${esc(it.kind)} item</dd><dt>Description</dt><dd>${esc(it.desc)}</dd><dt>Category</dt><dd>${esc(it.cat)}</dd><dt>${it.kind=="Lost"?"Lost at":"Found at"}</dt><dd>${esc(it.found_at)}</dd><dt>Date</dt><dd>${esc(it.date)}</dd></dl></div><div class="card"><h2>Submit a claim</h2>${it.status=="Resolved"?'<div class="empty">This item is Resolved and cannot be claimed.</div>':!stu?'<div class="empty">Only students can submit claims.</div>':`<form novalidate><div class="field"><label>Proof of ownership</label><textarea class="input" name="proof" rows="4" placeholder="Describe unique marks, contents, or details only the owner would know."></textarea></div><button class="btn teal">Submit claim</button></form>`}</div></div>`;
  const f=$("form",el);
  if(f)f.onsubmit=async e=>{
    e.preventDefault();
    if(!V.form(f,{
      proof:v=>v.length>=15?"":"A proof description is required (15+ characters)."
    }))return;
    try{
      const r=await Store.addClaim(it.id,f.proof.value.trim(),CURRENT_USER);
      if(!r.ok)return toast(r.message,true);
      location.href="my-claims.html"
    }catch(err){failToast()}
  }
};
PAGES["my-claims"]=el=>{
  el.innerHTML=head("My claims","Track your claim decisions. ")+`<div class="card" id="t"></div>`;
  dataTable($("#t"),{
    cols:[{
      k:"item",l:"Item"
    },{
      k:"user",l:"Claimant"
    },{
      k:"proof",l:"Proof submitted"
    },{
      k:"status",l:"Status",f:c=>badge(c.status)
    }],rows:()=>DATA.claims.filter(c=>String(c.userId)===String(CURRENT_USER.id)).map(c=>({
      ...c,item:itemTitle(c.item),user:person(c.userId,c.snap).name
    })),filterKey:"status",filterOpts:["Pending","Approved","Rejected"]
  })
};
PAGES["assistant-dashboard"]=el=>{
  const stats=()=>`<div class="grid g3">${stat(DATA.bookings.filter(b=>bookingState(b)=="Reserved").length,"Awaiting verification")}${stat(DATA.resources.filter(r=>r.status=="In use").length,"Resources in use")}${stat(DATA.resources.filter(r=>r.maintenance).length,"In maintenance")}</div>`;
  el.innerHTML=head("Lab assistant dashboard","Verify arrivals within the "+CONFIG.GRACE_MINUTES+"-minute grace period. ")+`<div id="st">${stats()}</div><div class="card" style="margin-top:16px"><h2>Reservations to verify</h2><div id="t"></div></div>`;
  const t=dataTable($("#t"),{
    cols:[...staffCols().slice(0,2),...bookingCols([{
      l:"",f:b=>b.status=="Reserved"?`<button class="btn sm teal" data-id="${b.id}">Verify</button>`:""
    }])],rows:()=>DATA.bookings.map(flat).filter(b=>b.status=="Reserved").sort((a,b)=>a.startTs-b.startTs),size:4
  });
  LIVE.add(()=>{$("#st").innerHTML=stats();t.render()});
  $("#t").addEventListener("click",async e=>{
    const id=e.target.closest("[data-id]")?.dataset.id;
    if(!id)return;
    try{
      const r=await Store.verify(id,CURRENT_USER);
      if(!r.ok)toast(r.message,true);else toast("Reservation verified.");
      LIVE.rerender()
    }catch(err){failToast()}
  })
};
PAGES["booking-resource-overview"]=el=>{
  const assistant=getRole()=="assistant";
  el.innerHTML=head("Booking and resource overview","All bookings across laboratories and the student who made each one. ")+legend()+`<div class="card" id="t"></div>`;
  const t=dataTable($("#t"),{
    cols:[...staffCols(),...bookingCols(assistant?[{
      l:"",f:b=>b.status=="Reserved"?`<button class="btn sm teal" data-id="${b.id}">Verify</button>`:""
    }]:[])],rows:()=>DATA.bookings.map(flat).sort(sortNewest),filterKey:"status",filterOpts:BOOKING_FILTERS
  });
  LIVE.add(()=>t.render());
  $("#t").addEventListener("click",async e=>{
    const id=e.target.closest("[data-id]")?.dataset.id;
    if(!id)return;
    if(!assistant)return toast("Only lab assistants can verify bookings.",true);
    try{
      const r=await Store.verify(id,CURRENT_USER);
      if(!r.ok)toast(r.message,true);else toast("Reservation verified.");
      t.render()
    }catch(err){failToast()}
  })
};
PAGES["admin-dashboard"]=el=>{
  el.innerHTML=head("Administrator dashboard","System summary. ")+`<div class="grid g4">${stat(DATA.claims.filter(c=>c.status=="Pending").length,"Pending claims")}${stat(DATA.items.length,"Reported items")}${stat(DATA.bookings.length,"Bookings")}<div id="uc">${stat("…","Registered users")}</div></div><div class="grid g2" style="margin-top:16px"><div class="card"><h2>Lab utilization</h2><div id="ub">${bars(utilization())}</div></div><div class="card"><h2>Claims awaiting review</h2><p class="muted">${DATA.claims.filter(c=>c.status=="Pending").length} claims need a decision.</p><p><a class="btn teal" href="claim-management.html">Review claims</a></p></div></div>`;
  LIVE.add(()=>{$("#ub").innerHTML=bars(utilization())});
  api.get("/users").then(d=>{const b=$("#uc b");if(b)b.textContent=d.users.length}).catch(()=>{})   // runs after the markup exists
};
PAGES["claim-management"]=el=>{
  el.innerHTML=head("Claim management","Approve or reject claims. ")+`<div class="card" id="t"></div>`;
  const t=dataTable($("#t"),{
    cols:[{
      k:"item",l:"Item"
    },{
      k:"user",l:"Claimant"
    },{
      k:"rollNo",l:"Roll number"
    },{
      k:"department",l:"Department"
    },{
      k:"proof",l:"Proof"
    },{
      k:"status",l:"Status",f:c=>badge(c.status)
    },{
      l:"Decision",f:c=>c.status!="Pending"?"":`<button class="btn sm teal" data-a="Approved" data-id="${c.id}">Approve</button> <button class="btn sm bad" data-a="Rejected" data-id="${c.id}">Reject</button>`
    }],rows:()=>DATA.claims.map(c=>{const q=person(c.userId,c.snap);return{
      ...c,item:itemTitle(c.item),user:q.name,rollNo:q.rollNo,department:q.department
    }}),filterKey:"status",filterOpts:["Pending","Approved","Rejected"]
  });
  LIVE.add(()=>t.render());
  $("#t").addEventListener("click",e=>{
    const b=e.target.closest("[data-a]");
    if(!b)return;
    const{a,id}=b.dataset;
    if(!can("admin"))return toast("Only administrators can decide claims.",true);
    confirmBox(a+" claim?","The claimant will see this decision in My claims.",async()=>{
      try{
        const r=await Store.decideClaim(id,a,CURRENT_USER);
        if(!r.ok)toast(r.message,true);else toast("Claim "+a.toLowerCase()+".");
        t.render()
      }catch(err){failToast()}
    },a)
  })
};
PAGES["lab-utilization-analytics"]=el=>{
  el.innerHTML=head("Laboratory utilization","Share of available hours booked this month. ")+`<div class="card" style="max-width:760px"><div id="ub">${bars(utilization())}</div><p class="muted" style="margin-top:12px;font-size:13px">Calculated from saved bookings: booked hours this month ÷ (resources in the lab × 8 hours × weekdays in the month). Cancelled and unverified (released) bookings are not counted.</p></div>`;
  LIVE.add(()=>{$("#ub").innerHTML=bars(utilization())})
};
PAGES["user-role-overview"] = async el => {
  el.innerHTML = head("Users and roles", "Registered accounts. Role changes are not available in this UI.") + `<div class="card" id="t"><div class="empty">Loading…</div></div>`;
  try {
    const { users } = await api.get("/users");
    dataTable($("#t"), { cols: [{ k: "name", l: "Name" }, { k: "email", l: "Email" }, { k: "rollNo", l: "Roll number", f: u => esc(u.rollNo || "—") }, { k: "department", l: "Department", f: u => esc(u.department || "—") }, { k: "roleLabel", l: "Role", f: u => `<span class="badge b-info">${esc(u.roleLabel)}</span>` }], rows: () => users.map(u => ({ ...u, roleLabel: ROLE_LABEL[u.role] })), filterKey: "roleLabel", filterOpts: Object.values(ROLE_LABEL) });
  } catch (err) {
    $("#t").innerHTML = '<div class="alert bad"></div>';
    $("#t .alert").textContent = err.message;
  }
};
PAGES["profile"] = el => {
  const u = CURRENT_USER, stu = u.role === "student";
  el.innerHTML = head(ROLE_LABEL[u.role] + " profile", "Update your name and the email you use to sign in.") + `<div class="card" style="max-width:520px"><div id="msg"></div><dl class="detail"><dt>Role (fixed by your account)</dt><dd id="p-role"></dd>${stu ? '<dt>Roll number</dt><dd id="p-roll"></dd><dt>Department</dt><dd id="p-dept"></dd>' : ""}${u.createdAt ? "<dt>Account created</dt><dd id=\"p-since\"></dd>" : ""}</dl><form novalidate>${inp("name", "Full name")}${inp("email", "Email (used to sign in)", "email")}<button class="btn teal">Save changes</button></form></div>`;
  const f = $("form", el);
  const fill = () => {
    $("#p-role", el).textContent = ROLE_LABEL[u.role];
    if (stu) {
      $("#p-roll", el).textContent = CURRENT_USER.rollNo || "Not set";
      $("#p-dept", el).textContent = CURRENT_USER.department || "Not set";
    }
    if ($("#p-since", el)) $("#p-since", el).textContent = new Date(u.createdAt).toLocaleDateString();
  };
  fill();
  f.name.value = u.name;
  f.email.value = u.email;
  if (stu && !u.rollNo) showMsg(el, "Your roll number is not saved yet. Sign out and sign in again, entering your roll number on the sign-in page.", "warn");
  f.onsubmit = async e => {
    e.preventDefault();
    $("#msg", el).innerHTML = "";
    const rules = { name: v => v.length >= 2 ? "" : "Enter your name.", email: v => CONFIG.emailError(v, getRole()) };
    if (!V.form(f, rules)) return;
    try {
      const body = { name: f.name.value.trim(), email: f.email.value.trim() };
      const r = await api.put("/me", body);
      CURRENT_USER = r.user;
      DIR[String(CURRENT_USER.id)] = { name: CURRENT_USER.name, email: CURRENT_USER.email, rollNo: CURRENT_USER.rollNo, department: CURRENT_USER.department };
      f.name.value = CURRENT_USER.name; f.email.value = CURRENT_USER.email;
      fill(); renderIdentity();
      showMsg(el, "Profile saved.", "ok");
    } catch (err) {
      if (err.status === 401) return location.href = "sign-in.html";
      for (const [k, m] of Object.entries(err.fields || {})) if (f[k]) V.show(f[k], m);
      showMsg(el, err.message, "bad");
    }
  };
};
