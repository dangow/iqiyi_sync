// 隔離環境：只負責在頁面(main.js)與背景(background.js)之間傳話
(() => {
  let port = null;
  const toMain = (m) => window.postMessage({ src: 'wsync', dir: 'main', m }, '*');
  function open() {
    port = chrome.runtime.connect({ name: 'sync' });
    port.onMessage.addListener(toMain);
    port.onDisconnect.addListener(() => {
      port = null;
      toMain({ type: 'status', text: '背景中斷，請重新整理頁面', ok: false });
    });
  }
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.src !== 'wsync' || d.dir !== 'bg') return;
    if (d.start) { if (!port) open(); return; }
    if (port && d.m) port.postMessage(d.m);
  });
})();
