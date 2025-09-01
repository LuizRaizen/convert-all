(function(){
  const root = document.documentElement; // <html>
  const btn = document.querySelector('[data-settings-btn]');
  const menuWrap = document.querySelector('[data-settings]');
  const menu = document.getElementById('settings-menu');
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const metaTheme = document.querySelector('meta[name="theme-color"]');

  // ====== Tema: carregar preferido ======
  const LS_KEY = 'ct_theme';
  const stored = localStorage.getItem(LS_KEY);

  function applyTheme(mode){ // 'dark' | 'light'
    if(mode === 'dark'){
      root.setAttribute('data-theme', 'dark');
      themeToggle && (themeToggle.checked = true);
      metaTheme && metaTheme.setAttribute('content', '#0c0f14');
    }else{
      root.setAttribute('data-theme', 'light');
      themeToggle && (themeToggle.checked = false);
      metaTheme && metaTheme.setAttribute('content', '#006eff');
    }
  }

  if(stored === 'dark' || stored === 'light'){
    applyTheme(stored);
  }else{
    // Sem preferência salva: respeita o sistema (se for dark, aplica; senão, light)
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  // Toggle
  themeToggle && themeToggle.addEventListener('change', (e)=>{
    const mode = e.target.checked ? 'dark' : 'light';
    localStorage.setItem(LS_KEY, mode);
    applyTheme(mode);
  });

  // ====== Menu de Configurações (abrir/fechar, acessibilidade) ======
  function openMenu(){
    menuWrap.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    // foco gerenciável se quiser: menu.focus();
  }
  function closeMenu(){
    menuWrap.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  }
  btn && btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if(menuWrap.classList.contains('is-open')) closeMenu(); else openMenu();
  });

  // Fecha ao clicar fora
  document.addEventListener('click', (e)=>{
    if(!menuWrap.contains(e.target)) closeMenu();
  });

  // Fecha com ESC
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') closeMenu();
  });

  // ====== Idioma (opcional: manter na mesma rota com query param) ======
  // Se você usar Django i18n, substitua esses links por um POST no set_language.
  document.querySelectorAll('.lang-list a').forEach(a=>{
    a.addEventListener('click', ()=>{
      // Pode salvar preferência local (opcional)
      localStorage.setItem('ct_lang', a.dataset.lang);
    });
  });
})();