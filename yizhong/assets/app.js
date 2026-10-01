window.App = (function () {
  'use strict';
  var TOKEN_KEY = 'ygyz_admin_token';
  var NOTICE_CLOSE_KEY = 'ygyz_notice_closed';
  var adminToken = sessionStorage.getItem(TOKEN_KEY) || '';
  var isAdmin = !!adminToken;

  function apiGet(path) {
    return fetch(path, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function apiPost(path, body, needAuth) {
    var headers = { 'Content-Type': 'application/json' };
    if (needAuth) headers['X-Admin-Token'] = adminToken;
    return fetch(path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
          return j;
        });
      });
  }
  function handleAuthError(e) {
    if (e && e.status === 401) {
      adminToken = ''; isAdmin = false;
      sessionStorage.removeItem(TOKEN_KEY);
      document.dispatchEvent(new CustomEvent('app:logout'));
    }
  }

  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function toast(text, adminStyle) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.toggle('admin', !!adminStyle);
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function compressImage(file, maxW, quality) {
    maxW = maxW || 1280; quality = quality || 0.78;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          if (h > maxW) { w = Math.round(w * maxW / h); h = maxW; }
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          try { resolve(cv.toDataURL('image/jpeg', quality)); }
          catch (err) { reject(err); }
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function uploadImage(dataUrl) {
    return apiPost('/api/upload', { data: dataUrl }, true).then(function (j) { return j.url; });
  }
  function uploadImagePublic(dataUrl, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload/public', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 90000;
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100));
      };
      xhr.onload = function () {
        try {
          var j = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) resolve(j);
          else { var err = new Error(j.error || ('HTTP ' + xhr.status)); err.status = xhr.status; reject(err); }
        } catch (e) { reject(e); }
      };
      xhr.onerror = function () { reject(new Error('网络中断，请稍后重试')); };
      xhr.ontimeout = function () { reject(new Error('上传超时，请检查网络')); };
      xhr.send(JSON.stringify({ data: dataUrl }));
    });
  }

  var loginModal = document.getElementById('loginModal');
  var pwdInput = document.getElementById('pwd');
  function openLogin() {
    if (!loginModal) return;
    loginModal.classList.add('on'); pwdInput.value = '';
    setTimeout(function () { pwdInput.focus(); }, 60);
  }
  function closeLogin() { if (loginModal) loginModal.classList.remove('on'); }

  function bindLogin() {
    var entry = document.getElementById('adminEntry');
    if (entry) entry.addEventListener('click', function () {
      if (isAdmin) { document.dispatchEvent(new CustomEvent('app:login', { detail: { restored: true } })); return; }
      openLogin();
    });
    var cancel = document.getElementById('loginCancel');
    var ok = document.getElementById('loginOk');
    if (cancel) cancel.addEventListener('click', closeLogin);
    if (ok) ok.addEventListener('click', function () {
      apiPost('/api/login', { password: pwdInput.value })
        .then(function (j) {
          adminToken = j.token; isAdmin = true;
          sessionStorage.setItem(TOKEN_KEY, adminToken);
          closeLogin();
          document.dispatchEvent(new CustomEvent('app:login'));
          toast('登录成功', true);
        })
        .catch(function (e) { toast(e.message || '登录失败', true); pwdInput.select(); });
    });
    if (pwdInput) pwdInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && ok) ok.click();
    });
    if (loginModal) loginModal.addEventListener('click', function (e) {
      if (e.target === loginModal) closeLogin();
    });
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        if (isAdmin) document.dispatchEvent(new CustomEvent('app:login', { detail: { restored: true } }));
        else openLogin();
      }
      if (e.key === 'Escape') closeLogin();
    });
  }

  function logout() {
    adminToken = ''; isAdmin = false;
    sessionStorage.removeItem(TOKEN_KEY);
    document.dispatchEvent(new CustomEvent('app:logout'));
  }

  function initProgress() {
    var nav = document.getElementById('nav');
    var bar = document.getElementById('bar');
    if (!bar) return;
    function onScroll() {
      var st = window.scrollY || document.documentElement.scrollTop;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (max > 0 ? (st / max) * 100 : 0) + '%';
      if (nav) nav.classList.toggle('scrolled', st > 12);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  function initMenu() {
    var btn = document.getElementById('menuBtn');
    var links = document.getElementById('links');
    if (!btn || !links) return;
    btn.addEventListener('click', function () { document.body.classList.toggle('menu-open'); });
    links.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') document.body.classList.remove('menu-open');
    });
  }
  function initViewer() {
    var viewer = document.getElementById('viewer');
    var img = document.getElementById('viewerImg');
    if (!viewer || !img) return;
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-viewer]');
      if (!t) return;
      e.stopPropagation();
      img.src = t.dataset.viewer;
      viewer.classList.add('on');
    });
    viewer.addEventListener('click', function () { viewer.classList.remove('on'); });
  }

  window.addEventListener('load', function () {
    var loader = document.getElementById('loader');
    if (loader) setTimeout(function () { loader.classList.add('hide'); }, 380);
  });

  function initHeartbeat() {
    var SID_KEY = 'ygyz_sid';
    var sid = sessionStorage.getItem(SID_KEY);
    if (!sid) {
      sid = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(SID_KEY, sid);
    }
    var countEl = document.getElementById('onlineCount');
    function beat() {
      fetch('/api/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: sid }),
        cache: 'no-store'
      })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok && countEl) countEl.textContent = j.count; })
        .catch(function () {});
    }
    beat();
    setInterval(beat, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) beat(); });
    window.addEventListener('focus', beat);
    window.addEventListener('pageshow', beat);
  }

  function bindDocModal() {
    var docModal = document.getElementById('docModal');
    var entry = document.getElementById('docEntry');
    var closeBtn = document.getElementById('docClose');
    if (!docModal || !entry) return;
    entry.addEventListener('click', function () { docModal.classList.add('on'); });
    if (closeBtn) closeBtn.addEventListener('click', function () { docModal.classList.remove('on'); });
    docModal.addEventListener('click', function (e) { if (e.target === docModal) docModal.classList.remove('on'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') docModal.classList.remove('on');
    });
  }

  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -30px 0px' });
    els.forEach(function (el) { io.observe(el); });
    // 兜底：1 秒后还没露出来的，强制显示（防止某些浏览器/特殊环境下不触发）
    setTimeout(function () {
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in');
      });
    }, 1000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindLogin();
    initProgress();
    initMenu();
    initViewer();
    initHeartbeat();
    bindDocModal();
    initReveal();
  });
  
  return {
    apiGet: apiGet,
    apiPost: apiPost,
    handleAuthError: handleAuthError,
    toast: toast,
    escapeHtml: escapeHtml,
    compressImage: compressImage,
    uploadImage: uploadImage,
    uploadImagePublic: uploadImagePublic,
    logout: logout,
    openLogin: openLogin,
    getToken: function () { return adminToken; },
    isAdmin: function () { return isAdmin; },
    TOKEN_KEY: TOKEN_KEY,
    NOTICE_CLOSE_KEY: NOTICE_CLOSE_KEY
  };
})();