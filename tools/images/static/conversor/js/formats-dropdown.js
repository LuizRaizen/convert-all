document.querySelectorAll('.select-wrapper').forEach((wrap) => {
  const native = wrap.querySelector('select');
  const display = wrap.querySelector('.select-display');
  const valueEl = wrap.querySelector('.select-display__value');
  const menu = wrap.querySelector('.select-menu');

  // Lê configurações
  const maxVisible = parseInt(wrap.getAttribute('data-max-visible') || '6', 10);
  const optionH = parseFloat(getComputedStyle(wrap).getPropertyValue('--option-h')) || 44;

  // Seta max-height real (fallback cross-browser)
  menu.style.maxHeight = (maxVisible * optionH) + 'px';

  // Preenche o menu com base nas <option>
  menu.innerHTML = '';
  Array.from(native.options).forEach((opt, idx) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.dataset.value = opt.value;
    li.textContent = opt.textContent.trim();

    if (opt.selected) {
      li.setAttribute('aria-selected', 'true');
      valueEl.textContent = opt.textContent.trim();
    }

    // primeiro option "placeholder"
    if (idx === 0 && opt.value === '') {
      // deixa selecionável também, se quiser limpar
    }

    menu.appendChild(li);
  });

  // Valor inicial (placeholder se nada selecionado)
  if (!native.value) {
    valueEl.textContent = native.options[0]?.textContent?.trim() || 'Selecione...';
  }

  // Abre/fecha
  display.addEventListener('click', () => {
    const isOpen = wrap.classList.toggle('open');
    display.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) menu.focus({ preventScroll: true });
  });

  // Seleciona opção
  menu.addEventListener('click', (e) => {
    const li = e.target.closest('[role="option"]');
    if (!li) return;

    // visual
    menu.querySelectorAll('[aria-selected="true"]').forEach(n => n.removeAttribute('aria-selected'));
    li.setAttribute('aria-selected', 'true');
    valueEl.textContent = li.textContent.trim();

    // sincroniza com nativo
    native.value = li.dataset.value;
    native.dispatchEvent(new Event('change', { bubbles: true }));

    // fecha
    wrap.classList.remove('open');
    display.setAttribute('aria-expanded', 'false');
    display.focus();
  });

  // Fecha clicando fora
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) {
      wrap.classList.remove('open');
      display.setAttribute('aria-expanded', 'false');
    }
  });

  // Teclado básico: Esc fecha; Tab navega normalmente
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      wrap.classList.remove('open');
      display.setAttribute('aria-expanded', 'false');
      display.focus();
    }
  });
});