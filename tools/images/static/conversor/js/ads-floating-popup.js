/**
 * ads-floating-popup.js
 * Popup de anúncio flutuante (canto inferior direito).
 * - Aparece SEMPRE a cada carregamento da página (sem persistência).
 * - Usa classes padronizadas (.ad-popup, .ad-slot.ad-square).
 * - Acessível: papel "complementary", botão fecha com foco.
 */
(function () {
  const POPUP_ID = 'ad-popup';
  const VISIBLE_CLASS = 'is-visible';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  ready(function () {
    // Evita duplicar se o script for incluído mais de uma vez.
    if (document.getElementById(POPUP_ID)) return;

    const popup = document.createElement('aside');
    popup.id = POPUP_ID;
    popup.className = 'ad-popup';
    popup.setAttribute('role', 'complementary');
    popup.setAttribute('aria-label', 'Publicidade flutuante');

    popup.innerHTML = `
      <div class="ad-popup__inner">
        <button class="ad-popup__close" aria-label="Fechar anúncio" title="Fechar">×</button>
        <div class="ad-slot ad-square" aria-label="Publicidade">
          <div class="ad-inline-text">Espaço publicitário 300×300</div>
        </div>
      </div>
    `;

    // Fecha pelo X
    popup.addEventListener('click', (e) => {
      const btn = e.target.closest('.ad-popup__close');
      if (btn) popup.remove();
    });

    // Insere no body
    document.body.appendChild(popup);

    // Exibe (CSS tem .ad-popup.is-visible)
    requestAnimationFrame(() => {
      popup.classList.add(VISIBLE_CLASS);
      // Acessibilidade: foco no botão ao abrir (não rola a página)
      const closeBtn = popup.querySelector('.ad-popup__close');
      if (closeBtn) try { closeBtn.focus({ preventScroll: true }); } catch {}
    });
  });
})();