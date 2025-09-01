// live-stats.js
(function(){
  const nf = new Intl.NumberFormat('pt-BR');

  function $(sel, root=document){ return root.querySelector(sel); }

  function updateUI(total, nowText){
    const elTotal = $('#convTotal');
    const elNow   = $('#convNow');
    if (elTotal) elTotal.textContent = nf.format(total);
    if (elNow)   elNow.textContent   = nowText || 'ao vivo';
  }

  function demoMode(root){
    const startAttr = root.getAttribute('data-start');
    let total = Math.max(0, parseInt(startAttr || '0', 10) || 0);
    let last  = Date.now();

    // Marca “exemplo”
    const note = $('#statsNote');
    if (note) note.textContent = '(exemplo)';

    updateUI(total, 'atualizando…');

    function tick(){
      // Incremento “humano”: 1–5 conversões a cada 3–8 s
      const inc = Math.floor(Math.random()*5)+1;
      total += inc;
      last = Date.now();
      updateUI(total, `+${inc} agora mesmo`);
      setTimeout(tick, (Math.random()*5000)+3000);
    }
    setTimeout(tick, 1200);

    // Integra com o conversor: quando a página terminar conversões, soma real
    document.addEventListener('conversions:completed', (e)=>{
      const n = Math.max(1, e?.detail?.count || 0);
      total += n;
      updateUI(total, `+${n} agora mesmo`);
    });
  }

  async function realMode(root){
    // Remove aviso “exemplo”
    const note = $('#statsNote'); if (note) note.remove();

    // 1) Tenta SSE (Server-Sent Events)
    const useSSE = !!window.EventSource;
    let fallbackPolling = false;

    if (useSSE){
      try{
        const es = new EventSource('/api/conversions/stream');
        es.addEventListener('message', (ev)=>{
          try{
            const data = JSON.parse(ev.data);
            updateUI(data.total ?? 0, data.delta ? `+${data.delta} agora` : 'ao vivo');
          }catch{}
        });
        es.addEventListener('error', ()=>{ es.close(); fallbackPolling = true; });
        // Se SSE não conectar em 3s, cai para polling
        setTimeout(()=>{ if (es.readyState !== 1){ try{es.close();}catch{}; fallbackPolling = true; } }, 3000);
      }catch{ fallbackPolling = true; }
    }else{
      fallbackPolling = true;
    }

    // 2) Polling a cada 10s
    if (fallbackPolling){
      async function poll(){
        try{
          const r = await fetch('/api/conversions/stats', { credentials:'same-origin' });
          const j = await r.json();
          updateUI(j.total ?? 0, 'ao vivo');
        }catch{}
        setTimeout(poll, 10000);
      }
      poll();
    }

    // Soma imediata após conversões locais concluídas
    document.addEventListener('conversions:completed', (e)=>{
      const n = Math.max(1, e?.detail?.count || 0);
      const current = parseInt(($('#convTotal')?.textContent || '0').replace(/[.\s]/g,''), 10) || 0;
      updateUI(current + n, `+${n} agora`);
    });
  }

  function init(){
    const root = document.getElementById('liveStats');
    if (!root) return;
    const mode = (root.getAttribute('data-mode') || 'demo').toLowerCase();
    if (mode === 'real') realMode(root);
    else demoMode(root);
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init, { once:true });
})();