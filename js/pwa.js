let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const installBtns = document.querySelectorAll('#btn-install-pwa');
  installBtns.forEach(btn => {
    btn.style.display = 'inline-flex';
    btn.addEventListener('click', async () => {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
      btn.style.display = 'none';
    });
  });
});

window.addEventListener('appinstalled', () => {
  const installBtns = document.querySelectorAll('#btn-install-pwa');
  installBtns.forEach(btn => btn.style.display = 'none');
  deferredPrompt = null;
  console.log('PWA was installed');
});
