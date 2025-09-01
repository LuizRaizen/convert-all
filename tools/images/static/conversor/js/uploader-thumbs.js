/* conversor/js/uploader-thumbs.js
 * Upload por botão e drag&drop, miniaturas e card “+N” na 6ª posição.
 * Verificação incremental de limites com ACEITAÇÃO PARCIAL do lote.
 * Sempre notifica quando houver recusas: quantidade, bytes, tipo não suportado, duplicados.
 *
 * Bridge global:
 *   - ConverteTudo.getFiles()      -> File[]
 *   - ConverteTudo.getTotalBytes() -> number
 *   - ConverteTudo.clearThumbs()   -> limpa apenas as miniaturas (UI)
 *   - ConverteTudo.clearFiles()    -> descarta tudo (arquivos + UI + input)
 *   - ConverteTudo.count           -> total atual
 * Eventos:
 *   - 'ct:files-changed' { count, totalBytes }
 *   - 'ct:limit-hit'     { reason:'files'|'bytes'|'both', limitFiles, limitBytes, currentCount, currentBytes, rejectedByFiles, rejectedByBytes }
 *   - 'ct:rejections'    { rejectedByFiles, rejectedByBytes, rejectedByType, rejectedByDup }
 */
(() => {
  'use strict';

  // Elementos essenciais
  const dropZone  = document.querySelector('.file-upload-card');
  const btnUpload = document.getElementById('btn-upload');
  const inputFile = document.getElementById('file-input');
  const filesInfo = document.getElementById('files-info');
  const track     = document.getElementById('thumbsTrack');
  if (!dropZone || !btnUpload || !inputFile || !track) return;

  // Limites do plano vindos do template
  const LIMIT_FILES = Number(window.CT_LIMIT_FILES || 0) || 0; // 0 = ilimitado
  const LIMIT_BYTES = Number(window.CT_LIMIT_BYTES || 0) || 0; // 0 = ilimitado
  const UPGRADE_URL = String(window.CT_UPGRADE_URL || '/premium');

  // Integração com modal premium central
  const HAS_PREMIUMFN = !!(window.CT && typeof window.CT.showPremiumModal === 'function');

  // Config
  const MAX_VISIBLE = 6; // exatamente 6 slots; se total > 6, o 6º é “+N”
  const ACCEPT_EXT = new Set(['png','jpg','jpeg','webp','tif','tiff','gif','bmp','ico','heic','heif']);

  // Estado
  /** @type {File[]} */
  const files = [];
  /** @type {Map<string,string>} key -> objectURL */
  const urlMap = new Map();
  /** Tamanho acumulado dos arquivos aceitos */
  let totalBytes = 0;

  // ===== Utils / UI
  const extOf = (name) => (name.split('.').pop() || '').toLowerCase();
  const isImage = (f) => (f.type && f.type.startsWith('image/')) || ACCEPT_EXT.has(extOf(f.name));
  const uniqueKey = (f) => [f.name, f.size, f.lastModified].join('::');

  function bytesToHuman(b){
    const u=['B','KB','MB','GB','TB']; let i=0, n=Number(b||0);
    while(n>=1024 && i<u.length-1){ n/=1024; i++; }
    const fixed=(n>=10||i===0)?0:1; return `${n.toFixed(fixed)} ${u[i]}`;
  }

  function updateFilesInfo(){
    if (!filesInfo) return;
    const total = files.length;
    filesInfo.textContent = total ? `${total} arquivo${total>1?'s':''} • ${bytesToHuman(totalBytes)}` : '';
  }

  // ===== Modais (premium e informativo)
  function showPremiumModal({ title, html, reason, rejectedByFiles=0, rejectedByBytes=0 }){
    try {
      window.dispatchEvent(new CustomEvent('ct:limit-hit', {
        detail: {
          reason,
          limitFiles: LIMIT_FILES,
          limitBytes: LIMIT_BYTES,
          currentCount: files.length,
          currentBytes: totalBytes,
          rejectedByFiles,
          rejectedByBytes
        }
      }));
    } catch {}

    if (HAS_PREMIUMFN) {
      window.CT.showPremiumModal({
        title: title || 'Limite atingido',
        messageHtml: html || '',
        upgradeUrl: UPGRADE_URL,
        plan: 'free'
      });
    } else {
      // Fallback simples (caixa na área do uploader)
      const box = document.createElement('div');
      box.className = 'ct-result';
      box.innerHTML = `
        <p class="ct-result__text">${html || 'Limite atingido.'}</p>
        <a class="btn-convert btn-download" href="${UPGRADE_URL}">
          <i class="ph ph-crown" aria-hidden="true"></i>
          <span>Conheça o plano Premium</span>
        </a>
      `;
      (dropZone.closest('.file-wrapper') || document.body).appendChild(box);
    }
  }

  function showInfoModal({ title, html }){
    if (HAS_PREMIUMFN) {
      // Reutiliza o modal premium como modal genérico
      window.CT.showPremiumModal({
        title: title || 'Aviso',
        messageHtml: html || '',
        upgradeUrl: UPGRADE_URL,
        plan: 'free'
      });
    } else {
      const box = document.createElement('div');
      box.className = 'ct-result';
      box.innerHTML = `<p class="ct-result__text"><strong>${title || 'Aviso'}</strong><br>${html || ''}</p>`;
      (dropZone.closest('.file-wrapper') || document.body).appendChild(box);
    }
  }

  // ===== Bridge global
  function updateBridge(){
    window.ConverteTudo = window.ConverteTudo || {};
    window.ConverteTudo.getFiles      = () => files.slice();
    window.ConverteTudo.getTotalBytes = () => totalBytes;
    window.ConverteTudo.clearThumbs   = clearThumbsOnly;
    window.ConverteTudo.clearFiles    = clearAll;
    window.ConverteTudo.count         = files.length;
    try {
      window.dispatchEvent(new CustomEvent('ct:files-changed', { detail: { count: files.length, totalBytes } }));
    } catch {}
  }

  // ===== Limpeza (thumbs e total)
  function clearThumbsOnly(){
    track.innerHTML = '';
  }
  function clearAll(){
    files.splice(0, files.length);
    for (const url of urlMap.values()) { try { URL.revokeObjectURL(url); } catch{} }
    urlMap.clear();
    totalBytes = 0;
    try {
      if (window.DataTransfer) inputFile.files = new DataTransfer().files;
    } catch {}
    inputFile.value = '';
    track.innerHTML = '';
    updateFilesInfo();
    updateBridge();
  }

  // ===== Thumbs
  function createThumbCard(file, key){
    const url = urlMap.get(key);
    const card = document.createElement('div');
    card.className = 'thumb-card';

    const img = document.createElement('img');
    img.src = url;
    img.alt = file.name;

    const dims = document.createElement('div');
    dims.className = 'thumb-dims';
    dims.textContent = '…';

    const probe = new Image();
    probe.onload = () => { dims.textContent = `${probe.naturalWidth}×${probe.naturalHeight}`; };
    probe.src = url;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'thumb-remove';
    removeBtn.setAttribute('aria-label', `Remover ${file.name}`);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      const i = files.indexOf(file);
      if (i > -1){
        files.splice(i,1);
        totalBytes = Math.max(0, totalBytes - (file.size || 0));
        try{ URL.revokeObjectURL(urlMap.get(key)); }catch{}
        urlMap.delete(key);
        syncInputFiles();
        renderThumbs();
        updateFilesInfo();
        updateBridge();
      }
    });

    card.appendChild(img);
    card.appendChild(dims);
    card.appendChild(removeBtn);
    return card;
  }

  function createMoreCard(extraCount){
    const card = document.createElement('div');
    card.className = 'thumb-card thumb-card--more';
    card.setAttribute('aria-label', `${extraCount} imagens a mais`);
    const label = document.createElement('div');
    label.className = 'thumb-more-label';
    label.textContent = `+${extraCount}`;
    card.appendChild(label);
    return card;
  }

  function renderThumbs(){
    updateFilesInfo();
    track.innerHTML = '';
    const total = files.length;
    if (total === 0) return;

    if (total > MAX_VISIBLE){
      const real = MAX_VISIBLE - 1; // 5 reais + 1 “+N”
      for (let i=0; i<real; i++){
        const f = files[i];
        track.appendChild(createThumbCard(f, uniqueKey(f)));
      }
      track.appendChild(createMoreCard(total - (MAX_VISIBLE - 1)));
    } else {
      for (let i=0; i<total; i++){
        const f = files[i];
        track.appendChild(createThumbCard(f, uniqueKey(f)));
      }
    }
  }

  // ===== Input sync
  function syncInputFiles(){
    let ok = false;
    try{
      if (window.DataTransfer) {
        const dt = new DataTransfer();
        files.forEach(f => dt.items.add(f));
        inputFile.files = dt.files;
        ok = true;
      }
    }catch(e){}
    updateBridge();
    return ok;
  }

  // ===== Entrada de arquivos (ACEITAÇÃO PARCIAL por capacidade)
  function addFiles(fileList){
    const arr = Array.from(fileList || []);
    if (!arr.length) return;

    // Capacidade restante antes de começar a aceitar este lote
    let remainFiles = LIMIT_FILES ? Math.max(0, LIMIT_FILES - files.length) : Infinity;
    let remainBytes = LIMIT_BYTES ? Math.max(0, LIMIT_BYTES - totalBytes)   : Infinity;

    let added = 0;
    let addedBytes = 0;
    let rejectedByFiles = 0;
    let rejectedByBytes = 0;
    let rejectedByType  = 0;
    let rejectedByDup   = 0;

    // Tente aceitar o máximo que couber deste lote
    for (const f of arr){
      const key = uniqueKey(f);

      // Tipo suportado?
      if (!isImage(f)) { rejectedByType++; continue; }

      // Duplicado exato?
      if (urlMap.has(key)) { rejectedByDup++; continue; }

      // Sem slots?
      if (remainFiles <= 0) { rejectedByFiles++; continue; }

      const size = Number(f.size || 0);
      // Sem bytes?
      if (remainBytes < size) { rejectedByBytes++; continue; }

      // Aceita
      files.push(f);
      urlMap.set(key, URL.createObjectURL(f));
      added++;
      addedBytes += size;

      // Atualiza capacidade
      if (remainFiles !== Infinity) remainFiles -= 1;
      if (remainBytes !== Infinity) remainBytes -= size;
    }

    if (added){
      totalBytes += addedBytes;
      syncInputFiles();
      renderThumbs();
      updateFilesInfo();
    }

    // Notificação: QUALQUER limitação gera feedback
    const anyRejected =
      (rejectedByFiles + rejectedByBytes + rejectedByType + rejectedByDup) > 0;

    // Se houve recusas, dispare evento e popup detalhado
    if (anyRejected) {
      try {
        window.dispatchEvent(new CustomEvent('ct:rejections', {
          detail: { rejectedByFiles, rejectedByBytes, rejectedByType, rejectedByDup }
        }));
      } catch {}

      const parts = [];

      // Cabeçalho
      if (added > 0) {
        parts.push(`<p>Adicionamos <strong>${added}</strong> de <strong>${arr.length}</strong> arquivo${arr.length>1?'s':''}.</p>`);
      } else {
        parts.push(`<p><strong>Nenhum</strong> arquivo pôde ser adicionado deste lote.</p>`);
      }

      // Motivos
      if (rejectedByFiles > 0) {
        parts.push(`<p><strong>${rejectedByFiles}</strong> arquivo${rejectedByFiles>1?'s':''} recusado${rejectedByFiles>1?'s':''} por limite de <strong>quantidade</strong>. Limite atual: <strong>${LIMIT_FILES || 'ilimitado'}</strong>.</p>`);
      }
      if (rejectedByBytes > 0) {
        parts.push(`<p><strong>${rejectedByBytes}</strong> arquivo${rejectedByBytes>1?'s':''} recusado${rejectedByBytes>1?'s':''} por limite de <strong>tamanho total</strong>. Limite atual: <strong>${LIMIT_BYTES?bytesToHuman(LIMIT_BYTES):'ilimitado'}</strong>. Selecionados: <strong>${bytesToHuman(totalBytes)}</strong>.</p>`);
      }
      if (rejectedByDup > 0) {
        parts.push(`<p><strong>${rejectedByDup}</strong> arquivo${rejectedByDup>1?'s':''} já estava${rejectedByDup>1?'m':''} na lista (duplicado${rejectedByDup>1?'s':''}).</p>`);
      }
      if (rejectedByType > 0) {
        parts.push(`<p><strong>${rejectedByType}</strong> arquivo${rejectedByType>1?'s':''} com tipo/extensão <strong>não suportado</strong>.</p>`);
      }

      // Se foi limitação de plano, abre modal com CTA Premium; caso contrário, modal informativo
      if (rejectedByFiles > 0 || rejectedByBytes > 0) {
        const reason = (rejectedByFiles > 0 && rejectedByBytes > 0) ? 'both' : (rejectedByFiles > 0 ? 'files' : 'bytes');
        parts.push(`<p>No <strong>Premium</strong> você poderá enviar muito mais arquivos e até <strong>1&nbsp;GB</strong> por conversão.</p>`);
        showPremiumModal({
          title: 'Alguns arquivos foram recusados',
          html: parts.join(''),
          reason,
          rejectedByFiles,
          rejectedByBytes
        });
      } else {
        showInfoModal({
          title: 'Alguns arquivos foram recusados',
          html: parts.join('')
        });
      }
    }
  }

  // Botão/upload direto
  btnUpload.addEventListener('click', () => { inputFile.value = ''; inputFile.click(); });
  inputFile.addEventListener('change', (e) => { addFiles(e.target.files); });

  // Evita abrir o arquivo se soltar fora
  ['dragover','drop'].forEach(evt => {
    document.addEventListener(evt, (e)=>e.preventDefault());
  });

  // Drag & drop na zona
  const highlight = (e)=>{ e.preventDefault(); e.stopPropagation(); dropZone.classList.add('is-dragover'); };
  const unhighlight = (e)=>{ e && e.preventDefault(); dropZone.classList.remove('is-dragover'); };

  ['dragenter','dragover'].forEach(evt => dropZone.addEventListener(evt, highlight, false));
  ['dragleave','dragend'].forEach(evt => dropZone.addEventListener(evt, unhighlight, false));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    unhighlight();
    const dt = e.dataTransfer;
    if (dt?.files?.length) addFiles(dt.files);
  });

  // Inicializa bridge
  updateBridge();

  // Limpeza ao sair
  window.addEventListener('beforeunload', () => {
    for (const url of urlMap.values()){ try{ URL.revokeObjectURL(url); }catch{} }
    urlMap.clear();
  });
})();