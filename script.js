(function(){
  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  function speak(text){
    try{
      if(!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(text);
      u.rate=0.95; u.pitch=1.0;
      window.speechSynthesis.speak(u);
    }catch(e){}
  }
  window.__speak=speak;
  function renderPressGrid(container,items){
    if(!container||!Array.isArray(items)) return;
    container.innerHTML='';
    items.forEach(({icon,text})=>{
      const b=document.createElement('button');
      b.className='press'; b.type='button';
      const icn=document.createElement('div'); icn.className='icon'; icn.textContent=icon||'🔘';
      const lbl=document.createElement('div'); lbl.className='text'; lbl.textContent=text||'';
      b.append(icn,lbl); b.addEventListener('click',()=>speak(text||''));
      container.appendChild(b);
    });
  }
  window.__renderPressGrid=renderPressGrid;
  function attachBack(sel,href){
    const el=qs(sel); if(!el) return;
    el.addEventListener('click',(e)=>{e.preventDefault(); location.href=href||'../index.html';});
  }
  window.__attachBack=attachBack;
  window.goBack=()=>{ if(history.length>1) history.back(); else location.href='../index.html'; };
})();