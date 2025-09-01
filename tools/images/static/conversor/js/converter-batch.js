/* conversor/js/converter-batch.js (backend/Pillow + limites + modal via styles.css)
 * - Barra de progresso (0–80 conversão, 80–100 compactação)
 * - Conversão no servidor em /processar/
 * - Pré-checagem de limites (arquivos e bytes)
 * - Tratamento 413 e 400 (incl. TooManyFilesSent) com popup elegante
 */
(() => {
  'use strict';

  // ===== Seletores
  const form        = document.getElementById('convert-form');
  const inputFile   = document.getElementById('file-input');
  const formatSel   = document.querySelector('select#format');

  const gallery     = document.querySelector('.thumbs-carousel');
  const formatBox   = document.querySelector('.output-format');
  const convertBtn  = form ? form.querySelector('.btn-convert') : null;
  const fileWrapper = document.querySelector('.file-wrapper');

  if (!form || !inputFile || !formatSel || !fileWrapper) return;

  // ===== Config
  const PROCESS_URL = window.CT_PROCESS_URL || new URL('processar/', location.href).toString();
  const LIMIT_BYTES = Number(window.CT_LIMIT_BYTES || 0) || 0;  // 0 = ilimitado
  const LIMIT_FILES = Number(window.CT_LIMIT_FILES || 0) || 0;  // 0 = ilimitado
  const UPGRADE_URL = String(window.CT_UPGRADE_URL || '/premium');

  // ===== Popup (usa classes definidas em styles.css)
  function buildPopup({ title='Aviso', html='', showCta=false, ctaUrl=UPGRADE_URL } = {}){
    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'popup__overlay';
    overlay.setAttribute('data-popup-overlay','');

    // Popup
    const wrap = document.createElement('div');
    wrap.className = 'popup';
    wrap.setAttribute('role','dialog');
    wrap.setAttribute('aria-modal','true');

    const content = document.createElement('div');
    content.className = 'popup__content';

    const btnClose = document.createElement('button');
    btnClose.className = 'popup__close';
    btnClose.setAttribute('aria-label','Fechar');
    btnClose.textContent = '×';

    const h = document.createElement('h3');
    h.className = 'popup__title';
    h.textContent = title;

    const body = document.createElement('div');
    body.className = 'popup__desc';
    body.innerHTML = html;

    const actions = document.createElement('div');
    actions.className = 'popup__actions';

    if (showCta){
      const a = document.createElement('a');
      a.href = ctaUrl;
      a.className = 'btn-primary';
      a.innerHTML = `<i class="ph ph-crown" aria-hidden="true"></i> <span>Conheça o Premium</span>`;
      actions.appendChild(a);
    }

    const btnGhost = document.createElement('button');
    btnGhost.type = 'button';
    btnGhost.className = 'btn-ghost';
    btnGhost.textContent = 'Fechar';
    actions.appendChild(btnGhost);

    content.appendChild(btnClose);
    content.appendChild(h);
    content.appendChild(body);
    content.appendChild(actions);
    wrap.appendChild(content);

    // Eventos
    const close = () => { overlay.remove(); wrap.remove(); document.removeEventListener('keydown', onEsc, true); };
    const onEsc = (e) => { if (e.key === 'Escape') close(); };

    overlay.addEventListener('click', close);
    btnClose.addEventListener('click', close);
    btnGhost.addEventListener('click', close);
    document.addEventListener('keydown', onEsc, true);

    // Monta
    const frag = document.createDocumentFragment();
    frag.appendChild(overlay);
    frag.appendChild(wrap);
    document.body.appendChild(frag);

    // Foco
    setTimeout(() => actions.querySelector('a,button')?.focus?.(), 0);
  }

  const showPremiumLimitModal = ({title, html}) =>
    buildPopup({ title: title || 'Limite atingido', html: html || '', showCta: true, ctaUrl: UPGRADE_URL });

  const showErrorModal = (title, html) =>
    buildPopup({ title: title || 'Erro', html: html || '<p>Tente novamente mais tarde.</p>', showCta: false });

  // ===== Barra de progresso (usa classes conversion-progress do styles.css)
  function showProgressUI(){
    if (window.ConverteTudo?.clearThumbs) window.ConverteTudo.clearThumbs();
    [gallery, formatBox, convertBtn].forEach(el => el && (el.style.display = 'none'));

    const wrap = document.createElement('div');
    wrap.className = 'conversion-progress';
    wrap.innerHTML = `
      <div class="conversion-progress__label" id="ctFileLabel">Preparando…</div>
      <div class="conversion-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="conversion-progress__bar" style="width:0%"></div>
      </div>
    `;
    fileWrapper.appendChild(wrap);

    const track = wrap.querySelector('.conversion-progress__track');
    const bar   = wrap.querySelector('.conversion-progress__bar');
    const label = wrap.querySelector('#ctFileLabel');

    return {
      setFileName(name){ label.textContent = name; },
      setProgress(pct){
        const p = Math.max(0, Math.min(100, Math.round(pct)));
        track.setAttribute('aria-valuenow', String(p));
        bar.style.width = p + '%';
      },
      replaceWith(node){ wrap.replaceWith(node); },
      remove(){ wrap.remove(); },
      node: wrap
    };
  }

  function restoreUI(){ [gallery, formatBox, convertBtn].forEach(el => el && (el.style.display = '')); }

  function resetFormatDropdown(){
    const select = document.querySelector('select#format'); if (!select) return;
    select.value = ''; select.dispatchEvent(new Event('change', { bubbles:true }));
    const wrap = select.closest('.select-wrapper');
    if (wrap){
      const valueEl = wrap.querySelector('.select-display__value'); if (valueEl) valueEl.textContent='Selecione uma opção';
      const menu = wrap.querySelector('.select-menu'); if (menu){
        menu.querySelectorAll('[aria-selected="true"]').forEach(n => n.removeAttribute('aria-selected'));
        const liPlaceholder = Array.from(menu.querySelectorAll('[role="option"]')).find(li => (li.dataset.value||'')==='');
        if (liPlaceholder) liPlaceholder.setAttribute('aria-selected','true');
      }
    }
  }

  function showResultUI(zipBlob, zipName, converted, failed, niceFormat, progressUI){
    // usa caixa de resultado já estilizada no seu CSS base (.ct-result)
    const box = document.createElement('div');
    box.className = 'ct-result';
    const parts = [];
    parts.push(`<strong>${converted}</strong> imagem${converted>1?'s':''} convertida${converted>1?'s':''} para <strong>${niceFormat}</strong>`);
    if (failed>0) parts.push(`(<strong>${failed}</strong> salvas como PNG por limitação do ambiente)`);

    box.innerHTML = `
      <p class="ct-result__text">${parts.join(' ')}</p>
      <button type="button" class="btn-convert btn-download">
        <i class="ph ph-download-simple" aria-hidden="true"></i>
        <span>Baixar</span>
      </button>
    `;

    progressUI.replaceWith(box);

    const btn = box.querySelector('.btn-download');
    btn.addEventListener('click', () => {
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a'); a.href = url; a.download = zipName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 4000);
      if (window.ConverteTudo?.clearFiles) window.ConverteTudo.clearFiles();
      resetFormatDropdown(); box.remove(); restoreUI();
    }, { once:true });
  }

  // ===== CSRF helpers
  function getCookie(name){ const v=document.cookie.match('(^|;)\\s*'+name+'\\s*=\\s*([^;]+)'); return v ? v.pop() : ''; }
  function getCsrfToken(){ const input=form.querySelector('input[name="csrfmiddlewaretoken"]'); return (input&&input.value) || getCookie('csrftoken') || ''; }

  // ===== XHR helpers
  function bytesToHuman(b){
    if (b == null) return '';
    const u=['B','KB','MB','GB','TB']; let i=0, n=Number(b);
    while(n>=1024 && i<u.length-1){ n/=1024; i++; }
    return (Math.round(n*10)/10)+' '+u[i];
  }

  function parseMaybeJSON(xhr){
    try{
      const ct = (xhr.getResponseHeader('Content-Type')||'').split(';')[0].trim().toLowerCase();
      const txt = xhr.responseText || '';
      if (ct === 'application/json' || ct === 'application/problem+json' || (txt && txt.trim().startsWith('{'))) {
        return JSON.parse(txt);
      }
    }catch(e){}
    return null;
  }

  function postWithProgress(url, formData, onUploadProgress, onDone, onFail){
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    const csrf = getCsrfToken(); if (csrf) xhr.setRequestHeader('X-CSRFToken', csrf);

    if (xhr.upload && typeof onUploadProgress === 'function') {
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onUploadProgress(e.loaded, e.total); };
    }
    xhr.onload = () => {
      const status = xhr.status;
      const data = parseMaybeJSON(xhr);
      const raw  = xhr.responseText || '';
      const rawLower = raw.toLowerCase();

      // 413 -> limite de bytes (plano)
      if (status === 413) {
        const allowed = (data && +data.allowed_bytes) || LIMIT_BYTES;
        const total   = (data && +data.total_bytes)   || 0;
        showPremiumLimitModal({
          title: 'Limite de tamanho atingido',
          html: `<p>Você tentou enviar <strong>${bytesToHuman(total)}</strong>, mas o limite do plano atual é <strong>${bytesToHuman(allowed)}</strong>.</p><p>Faça upgrade para o <strong>Premium</strong> e envie até <strong>1&nbsp;GB</strong> por conversão.</p>`
        });
        onDone && onDone({ ok:false }, status);
        return;
      }

      // 400 -> TooManyFilesSent / erros de formulário / CSRF
      if (status === 400) {
        const looksTooMany = /toomanyfilessent|data_upload_max_number_files|number of files exceeded/.test(rawLower);
        if (looksTooMany) {
          showPremiumLimitModal({
            title: 'Muitos arquivos selecionados',
            html: `
              <p>O número de arquivos enviados excede o permitido no plano atual.</p>
              ${LIMIT_FILES ? `<p>Limite atual: <strong>${LIMIT_FILES} arquivo${LIMIT_FILES>1?'s':''}</strong> por conversão.</p>` : ''}
              <p>No <strong>Premium</strong> você poderá enviar muito mais de uma só vez.</p>
            `
          });
          onDone && onDone({ ok:false }, status);
          return;
        }

        if (data && data.errors) {
          const list = [];
          try {
            for (const [field, msgs] of Object.entries(data.errors)) {
              const items = Array.isArray(msgs) ? msgs : [msgs];
              list.push(`<li><strong>${String(field).replace(/_/g,' ')}:</strong> ${items.join(', ')}</li>`);
            }
          } catch {}
          showErrorModal('Não foi possível iniciar a conversão',
            list.length ? `<p>Corrija os itens abaixo e tente novamente:</p><ul>${list.join('')}</ul>`
                        : `<p>${(data.message || data.detail || 'Verifique os dados enviados.')}</p>`);
          onDone && onDone({ ok:false }, status);
          return;
        }

        const csrfLike = /csrf|forbidden|forgery/.test(rawLower);
        if (csrfLike) {
          showErrorModal('Sessão expirada', '<p>Seu token de segurança expirou. Atualize a página e tente novamente.</p>');
          onDone && onDone({ ok:false }, status);
          return;
        }

        showErrorModal('Não foi possível iniciar a conversão', '<p>O servidor recusou a solicitação (400). Tente reduzir a quantidade de arquivos ou o tamanho total.</p>');
        onDone && onDone({ ok:false }, status);
        return;
      }

      if (status >= 200 && status < 300 && data) { onDone(data, status); return; }
      onFail && onFail({ status, data, raw, error: new Error('Erro na conversão') });
    };
    xhr.onerror = () => onFail && onFail({ status:0, data:null, raw:'', error:new Error('Falha de rede ao enviar arquivos') });
    xhr.send(formData);
    return xhr;
  }

  function getBlobWithProgress(url, onDownloadProgress){
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'blob';
      xhr.onprogress = (e) => { if (e.lengthComputable && typeof onDownloadProgress === 'function') onDownloadProgress(e.loaded, e.total); };
      xhr.onload = () => { (xhr.status >= 200 && xhr.status < 300) ? resolve(xhr.response) : reject(new Error('Falha ao baixar ZIP')); };
      xhr.onerror = () => reject(new Error('Falha de rede ao baixar ZIP'));
      xhr.send();
    });
  }

  // ===== Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const fromBridge = (window.ConverteTudo && typeof window.ConverteTudo.getFiles === 'function') ? window.ConverteTudo.getFiles() : [];
    const files = fromBridge.length ? fromBridge : Array.from(inputFile.files || []);

    if (!files.length) { showErrorModal('Nenhum arquivo selecionado','<p>Selecione ao menos uma imagem para converter.</p>'); return; }
    const fmtRaw = (formatSel.value || '').trim();
    if (!fmtRaw) { showErrorModal('Formato de saída ausente','<p>Escolha o formato desejado antes de converter.</p>'); return; }

    if (LIMIT_FILES && files.length > LIMIT_FILES) {
      showPremiumLimitModal({
        title: 'Muitos arquivos selecionados',
        html: `<p>Você selecionou <strong>${files.length}</strong> arquivos, mas o limite do plano atual é <strong>${LIMIT_FILES}</strong>.</p><p>Faça upgrade para o <strong>Premium</strong> e envie muito mais de uma só vez.</p>`
      });
      return;
    }

    const totalBytes = files.reduce((a,f)=>a+(f.size||0),0);
    if (LIMIT_BYTES && totalBytes > LIMIT_BYTES) {
      showPremiumLimitModal({
        title: 'Limite de tamanho atingido',
        html: `<p>Você tentou enviar <strong>${bytesToHuman(totalBytes)}</strong>, mas o limite do plano atual é <strong>${bytesToHuman(LIMIT_BYTES)}</strong>.</p><p>No <strong>Premium</strong> você poderá enviar até <strong>1&nbsp;GB</strong> por conversão.</p>`
      });
      return;
    }

    const ui = showProgressUI();
    const niceFormat = fmtRaw.toUpperCase();

    const fd = new FormData();
    const csrf = getCsrfToken(); if (csrf) fd.append('csrfmiddlewaretoken', csrf);
    fd.append('out_ext', fmtRaw);
    files.forEach(f => fd.append('arquivos', f, f.name));

    let animTimer = null;
    const setProgressSafe = (p) => ui.setProgress(Math.max(0, Math.min(100, p)));

    postWithProgress(
      PROCESS_URL,
      fd,
      (loaded, total) => {
        const frac = total>0 ? (loaded/total) : (totalBytes ? loaded/totalBytes : 0);
        setProgressSafe(Math.round(frac*60)); ui.setFileName('Enviando arquivos…');
      },
      async (data, status) => {
        if (!data || data.ok === false) { ui.remove(); return; }

        let current = 60; ui.setFileName('Convertendo…');
        animTimer = setInterval(()=>{ current = Math.min(80, current+1); setProgressSafe(current); }, 150);

        try{
          if (!data || !data.ok || !data.zip_url) throw new Error('Resposta inválida do servidor');
          clearInterval(animTimer); animTimer=null; setProgressSafe(80); ui.setFileName('Compactando…');

          const blob = await getBlobWithProgress(
            data.zip_url,
            (loaded, total) => { if (total>0) setProgressSafe(Math.min(100, 80 + Math.round((loaded/total)*20))); }
          );
          setProgressSafe(100);

          const converted = Number(data.converted || 0);
          const failed    = Number(data.fallback_count || 0);
          const zipName   = data.zip_name || `imagens-${fmtRaw}-converte-tudo.zip`;
          showResultUI(blob, zipName, converted, failed, niceFormat, ui);
        }catch(err){
          if (animTimer){ clearInterval(animTimer); animTimer=null; }
          console.error(err); ui.setFileName('Ocorreu um erro na conversão/compactação.');
        }
      },
      ({ status, data, raw, error }) => {
        if (animTimer){ clearInterval(animTimer); animTimer=null; }
        console.error(error || raw || data);
        const msg = (data && (data.message || data.detail)) || '';
        showErrorModal('Não foi possível iniciar a conversão', `<p>${msg || 'Tente novamente. Se o problema persistir, reduza a quantidade de arquivos.'}</p>`);
      }
    );
  });
})();