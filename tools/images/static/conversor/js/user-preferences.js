// ===== Exposição de config global usada pelo converter-batch.js
window.CT_PROCESS_URL = "{% url 'images:process' %}";
window.CT_LIMIT_BYTES = {{ UPLOAD_LIMIT_BYTES|default:524288000 }};  // Ex.: 500 MB (free hoje)
window.CT_LIMIT_FILES = {{ UPLOAD_LIMIT_FILES|default:300 }};        // Ex.: 300 arquivos (free hoje)
window.CT_UPGRADE_URL = "{{ UPGRADE_URL|default:'/premium' }}";

// ===== Modal Premium elegante (usado pelo converter-batch.js se existir)
(function ensurePremiumModal(){
window.CT = window.CT || {};

// injeta CSS uma só vez
if (!document.getElementById('ct-premium-style')){
    const css = `
    .ct-premium-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:1100;}
    .ct-premium{width:min(640px,92vw);background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.25);padding:22px 22px 18px;position:relative;}
    .ct-premium__close{position:absolute;right:10px;top:10px;border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;color:#666;}
    .ct-premium__head{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
    .ct-premium__plan{display:inline-flex;align-items:center;gap:6px;background:var(--grayscale-color-50,#f5f5f5);border:1px solid var(--grayscale-color-100,#e5e5e5);border-radius:999px;padding:6px 10px;font-size:12px;color:var(--text-color-2,#555);}
    .ct-premium__title{margin:0;font-size:20px;}
    .ct-premium__body{color:var(--text-color-2);margin-top:6px;}
    .ct-premium__actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;}
    .ct-btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--grayscale-color-100,#e5e5e5);border-radius:12px;padding:10px 14px;background:#fff;cursor:pointer;}
    .ct-btn--primary{background:var(--main-color,#6c4cff);border-color:var(--main-color,#6c4cff);color:#fff;}
    .ct-detail{font-size:13px;color:var(--text-color-3,#777);margin-top:6px;}
    `;
    const tag = document.createElement('style');
    tag.id = 'ct-premium-style';
    tag.textContent = css;
    document.head.appendChild(tag);
}

window.CT.showPremiumModal = function({ plan='free', title='Upgrade necessário', messageHtml='', upgradeUrl='/premium' }){
    const ov = document.createElement('div');
    ov.className = 'ct-premium-overlay';
    ov.innerHTML = `
    <div class="ct-premium" role="dialog" aria-modal="true" aria-label="${title}">
        <button class="ct-premium__close" aria-label="Fechar">×</button>
        <div class="ct-premium__head">
        <span class="ct-premium__plan" title="Plano atual">Plano atual: <strong>{{ user_plan|default:"Free" }}</strong></span>
        <h3 class="ct-premium__title">${title}</h3>
        </div>
        <div class="ct-premium__body">
        ${messageHtml}
        <p class="ct-detail">No plano Premium, você remove anúncios, aumenta limites (ex.: 1&nbsp;GB por conversão) e ganha priorização.</p>
        </div>
        <div class="ct-premium__actions">
        <a class="ct-btn ct-btn--primary" href="${upgradeUrl}">
            <i class="ph ph-crown" aria-hidden="true"></i>
            <span>Conheça o plano Premium</span>
        </a>
        <button class="ct-btn ct-cancel">Agora não</button>
        </div>
    </div>
    `;
    document.body.appendChild(ov);

    const close = () => ov.remove();
    ov.querySelector('.ct-premium__close').addEventListener('click', close);
    ov.querySelector('.ct-cancel').addEventListener('click', close);
    ov.addEventListener('click', (e)=>{ if (e.target === ov) close(); });
    document.addEventListener('keydown', function esc(e){ if (e.key === 'Escape'){ close(); document.removeEventListener('keydown', esc); }});
};
})();