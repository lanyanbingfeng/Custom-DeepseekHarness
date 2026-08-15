/* DeepSeek Harness Demo · 简化交互 */
(function () {
  const composer = document.getElementById('composer');
  const sendBtn = document.getElementById('sendBtn');
  const chatInner = document.querySelector('.chat-inner');

  // textarea 自动调整
  function autoResize() {
    composer.style.height = 'auto';
    composer.style.height = Math.min(140, composer.scrollHeight) + 'px';
    sendBtn.disabled = composer.value.trim().length === 0;
  }
  composer.addEventListener('input', autoResize);
  autoResize();

  function send() {
    const text = composer.value.trim();
    if (!text) return;
    // DSH 真实界面：发送后下面会自动新增消息流（这里只是演示）
    composer.value = '';
    autoResize();
  }
  sendBtn.addEventListener('click', send);
  composer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // 折叠行：tool-row 和 think-row 可点击展开
  chatInner.addEventListener('click', (e) => {
    const row = e.target.closest('.tool-row, .think-row');
    if (!row) return;
    row.dataset.open = row.dataset.open === '1' ? '0' : '1';
  });

  // 配色切换器（浮动按钮 + 面板）
  const picker = document.getElementById('themePicker');
  const toggle = document.getElementById('themeToggle');
  const swatches = picker.querySelectorAll('.swatch');

  function applyTheme(name) {
    document.documentElement.setAttribute('data-theme', name === 'default' ? '' : name);
    swatches.forEach(s => {
      s.classList.toggle('active', s.dataset.themeName === name);
    });
  }
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    picker.classList.toggle('open');
  });
  document.addEventListener('click', () => picker.classList.remove('open'));
  swatches.forEach(s => {
    s.addEventListener('click', (e) => {
      e.stopPropagation();
      applyTheme(s.dataset.themeName);
      picker.classList.remove('open');
    });
  });
  applyTheme('default');

  // 视图标签切换
  document.querySelectorAll('.view-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.view-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // 会话列表切换
  document.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
})();
