const shareBtn = document.getElementById('shareBtn');
const qrBtn = document.getElementById('qrBtn');
const qrDialog = document.getElementById('qrDialog');
const closeQr = document.getElementById('closeQr');
const toast = document.getElementById('toast');
const installBtn = document.getElementById('installBtn');
let deferredPrompt = null;

function showToast(message){
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

shareBtn.addEventListener('click', async () => {
  const data = {
    title: 'Michael Kincaid | Kincaid Design Solutions',
    text: 'Michael Kincaid — Founder | Owner, Kincaid Design Solutions',
    url: 'https://kdscad.com/michael'
  };
  try {
    if (navigator.share) {
      await navigator.share(data);
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(data.url);
      showToast('Card link copied');
    } else {
      window.prompt('Copy this link:', data.url);
    }
  } catch (err) {
    if (err.name !== 'AbortError') showToast('Share canceled');
  }
});

qrBtn.addEventListener('click', () => qrDialog.showModal());
closeQr.addEventListener('click', () => qrDialog.close());
qrDialog.addEventListener('click', (e) => {
  const box = qrDialog.getBoundingClientRect();
  const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
  if (outside) qrDialog.close();
});

document.getElementById('year').textContent = new Date().getFullYear();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) {
    showToast('On iPhone: Share → Add to Home Screen');
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

// iOS does not fire beforeinstallprompt; show a small optional install helper.
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.navigator.standalone === true;
if (isIOS && !isStandalone) {
  installBtn.hidden = false;
  installBtn.textContent = 'Add to iPhone Home Screen';
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
