const V={
  email:v=>CONFIG.emailError(v)==="",
  show(el,msg){
    el.classList.toggle("err",!!msg);
    const p=el.closest(".field");
    let m=p.querySelector(".err-msg");
    if(!m){
      m=document.createElement("span");
      m.className="err-msg";
      p.appendChild(m)
    }
    m.textContent=msg||""
  },
  form(form,rules){
    let ok=true;
    for(const[n,fn]of Object.entries(rules)){
      const el=form.elements[n],msg=fn(el.value.trim());
      V.show(el,msg);
      if(msg)ok=false
    }
    return ok
  }
};
