/* ============================================================ install prompt

   The shop asked for this: every time someone opens Shop Yangu, offer to put
   it on their home screen or desktop. Three cases, because browsers differ:

   1. **Chrome, Edge, Samsung Internet on Android, Chrome on a desktop** fire
      `beforeinstallprompt`. We hold the event and show our own button; tapping
      it calls `prompt()`, which is the only way to raise the real install
      dialog. The event can fire late, so if the banner is already up we add the
      button to it.

   2. **Safari on iPhone and iPad** never fires that event and has no API for
      it. The only route is Share → Add to Home Screen, so we say exactly that,
      with the icons of the two taps.

   3. **Firefox on Android** has its own Add to Home Screen in the menu; we
      point at the menu and say no more.

   The banner shows once per page open, not once ever. It comes back on the
   next open even if it was dismissed — that is the request — but a dismissal
   is remembered for the length of that visit so it does not reappear when the
   shopper moves between screens (the app is a SPA: one page, many routes).

   If the app is already installed, nothing is shown: inside `display-mode:
   standalone` there is nothing left to install, and a prompt in the installed
   app would be noise.
   ========================================================================= */

(function installPrompt() {
  /* Already running as an installed app: no prompt, no listener, no banner. */
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: minimal-ui)').matches ||
    navigator.standalone === true;
  if (standalone) return;

  /* The dismissal lives for one page load, not for the whole visit: the shop
     asked for the offer on every open, and a reload is an open. Moving between
     screens is not — this is a single page — so the flag is per document. */
  const KEY = 'syk-install';
  const docId = String(Date.now()) + Math.random().toString(36).slice(2, 7);
  const seen = (() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || '{}');
      return saved.doc === docId ? saved : { doc: docId };
    } catch {
      return { doc: docId };
    }
  })();
  if (seen.dismissed) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    /* an iPad on iOS 13+ reports itself as a Mac; the touch points give it away */
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(navigator.userAgent);
  const isFirefox = /firefox|fxios/i.test(navigator.userAgent);

  /* The event Chrome hands over. Kept because it can only be used once and
     only after a user gesture. */
  let deferred = null;
  let banner = null;
  let button = null;

  const remember = (obj) => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ ...seen, ...obj, doc: docId }));
    } catch {
      /* private mode: forget it, the banner still works */
    }
  };

  const mark = (which) => icon(which, 'sm');

  function markup() {
    /* What to say, and what the button does, depends on the browser. */
    let body;
    let action;

    if (deferred) {
      body = '<b>The till, on your home screen.</b> One tap to open Shop Yangu — ' +
        'no browser, no typing the address.';
      action = '<button class="install__go" type="button" id="installGo">Install</button>';
    } else if (isIOS && !isFirefox) {
      body = '<b>Add Shop Yangu to your home screen.</b> Tap ' + mark('share') +
        ' Share at the bottom of Safari, then <b>Add to Home Screen</b>.';
      action = '<button class="install__go" type="button" id="installGo">Got it</button>';
    } else if (isAndroid) {
      body = '<b>Add Shop Yangu to your home screen.</b> Open the ' + mark('more-vertical') +
        ' menu in your browser and choose <b>Add to Home screen</b>.';
      action = '<button class="install__go" type="button" id="installGo">Got it</button>';
    } else {
      body = '<b>Install Shop Yangu.</b> In your browser’s ' + mark('more-vertical') +
        ' menu choose <b>Install</b> or <b>Create shortcut</b> — it then opens in its own window.';
      action = '<button class="install__go" type="button" id="installGo">Got it</button>';
    }

    return '<div class="install__mark" aria-hidden="true"><svg viewBox="0 0 512 512">' +
        '<use href="#i-logo"/></svg></div>' +
      '<div class="install__body">' + body + '</div>' +
      '<div class="install__act">' + action +
        '<button class="install__no" type="button" id="installNo">Not now</button>' +
      '</div>' +
      '<button class="install__x" type="button" id="installX" aria-label="Dismiss">' +
        icon('x', 'sm') + '</button>';
  }

  function paint() {
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'install';
      banner.setAttribute('role', 'dialog');
      banner.setAttribute('aria-label', 'Install Shop Yangu');
      document.body.appendChild(banner);
      /* let the first frame land before the transition, or it pops in */
      requestAnimationFrame(() => banner && banner.classList.add('install--in'));
    }
    banner.innerHTML = markup();
    bind();
  }

  function hide() {
    if (!banner) return;
    banner.classList.remove('install--in');
    const gone = banner;
    banner = null;
    setTimeout(() => gone.remove(), 220);
  }

  function bind() {
    const go = document.getElementById('installGo');
    const no = document.getElementById('installNo');
    const x = document.getElementById('installX');

    if (go) go.onclick = async () => {
      remember({ dismissed: true });
      if (deferred) {
        /* The one and only chance to use the browser's dialog. */
        deferred.prompt();
        const choice = await deferred.userChoice.catch(() => null);
        deferred = null;
        hide();
        if (choice && choice.outcome === 'accepted') {
          if (typeof toast === 'function') toast('Shop Yangu is installed', 'good');
        }
        return;
      }
      hide();
    };
    if (no) no.onclick = () => { remember({ dismissed: true }); hide(); };
    if (x) x.onclick = () => { remember({ dismissed: true }); hide(); };
  }

  function show() {
    if (banner) return;
    /* wait for the app to have painted its first screen, so the banner is not
       what the shop sees first */
    setTimeout(paint, 1100);
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event;
    /* if the banner is already up (it fired late), swap its text for a button */
    if (banner) paint();
    else show();
  });

  window.addEventListener('appinstalled', () => {
    remember({ dismissed: true });
    deferred = null;
    hide();
  });

  /* Fires on every open: a first visit, a reload, a tap on the icon. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show, { once: true });
  } else {
    show();
  }

  /* Registering the worker is what makes the app installable at all. It is
     deferred so it never competes with the first paint of the till. */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      /* The worker lives at the site root and must control every route, so its
         scope has to be the root. currentScript is null inside a load handler,
         so the root is taken from the manifest link — which the page always
         carries at the root — and that also keeps the app working when it is
         served from a sub-path such as /Shop-Yangu-Kenya/. */
      const manifest = document.querySelector('link[rel="manifest"]');
      const site = manifest ? new URL('.', manifest.href).pathname : '/';
      navigator.serviceWorker.register(site + 'sw.js', { scope: site })
        .catch(() => {
          /* a shop on http:// (not https) or a browser with workers off simply
             does not get offline support; the install prompt itself still
             works where the browser allows it */
        });
    }, { once: true });
  }
})();
