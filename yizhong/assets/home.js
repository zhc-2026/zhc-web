(function () {
  'use strict';
  var A = window.App;
  var siteData = { texts: {}, images: {}, blocks: [], announcement: {} };
  var reviewList = [];
  var reviewIdx = 0;
  var reviewTimer = null;
  var editMode = false;
  var currentGalleryKey = '';

  function getImageArray(key) {
    var val = siteData.images[key];
    if (!val) return [];
    if (Array.isArray(val)) return val.slice();
    if (typeof val === 'string') return [val];
    return [];
  }
  function setImageArray(key, arr) {
    if (!arr || !arr.length) delete siteData.images[key];
    else siteData.images[key] = arr;
  }

  function applyTexts() {
    document.querySelectorAll('[data-edit-key]').forEach(function (el) {
      var k = el.dataset.editKey;
      if (k === 'hero-title') return;
      if (siteData.texts[k] !== undefined) el.innerHTML = siteData.texts[k];
    });
  }
  function setSceneImage(host, url, idx) {
    idx = idx || 0;
    var img = host.querySelector('.scene-photo');
    if (!img) {
      img = document.createElement('img');
      img.className = 'scene-photo';
      img.alt = ''; img.loading = 'lazy';
      host.appendChild(img);
    }
    img.onload = function () { img.classList.add('ready'); };
    img.onerror = function () { img.classList.remove('ready'); };
    img.src = url;
    host.classList.add('has-photo');
    host.dataset.currentIdx = String(idx);
  }
  function renderSceneIndicators(host, count, activeIdx) {
    var box = host.querySelector('.scene-indicators');
    if (!box) {
      box = document.createElement('div');
      box.className = 'scene-indicators';
      host.appendChild(box);
    }
    if (count <= 1) { box.innerHTML = ''; box.style.display = 'none'; return; }
    box.style.display = '';
    var html = '';
    for (var i = 0; i < count; i++) html += '<i class="' + (i === activeIdx ? 'on' : '') + '" data-idx="' + i + '"></i>';
    box.innerHTML = html;
  }
  function renderSceneCount(host, count) {
    var el = host.querySelector('.scene-count');
    if (!el) { el = document.createElement('span'); el.className = 'scene-count'; host.appendChild(el); }
    if (count <= 1) { el.textContent = ''; el.style.display = 'none'; }
    else { el.textContent = count + ' 张'; el.style.display = ''; }
  }
  function applyImages() {
    document.querySelectorAll('[data-img-key]').forEach(function (host) {
      var arr = getImageArray(host.dataset.imgKey);
      if (arr.length) {
        setSceneImage(host, arr[0], 0);
        renderSceneIndicators(host, arr.length, 0);
        renderSceneCount(host, arr.length);
      } else {
        var img = host.querySelector('.scene-photo'); if (img) img.remove();
        var ind = host.querySelector('.scene-indicators'); if (ind) ind.remove();
        var cnt = host.querySelector('.scene-count'); if (cnt) cnt.remove();
        host.classList.remove('has-photo');
      }
    });
  }

  function renderHeroTitle() {
    var ht = document.getElementById('heroTitle');
    var txt = siteData.texts['hero-title'] || '阳谷县第一中学';
    ht.textContent = '';
    if (editMode) { ht.textContent = txt; return; }
    txt.split('').forEach(function (c, i) {
      var s = document.createElement('span');
      s.textContent = c;
      s.style.setProperty('--d', (0.25 + i * 0.055).toFixed(2) + 's');
      ht.appendChild(s);
    });
  }

  function renderBlocks() {
    var zone = document.getElementById('customZone');
    var grid = document.getElementById('customGrid');
    var blocks = siteData.blocks || [];
    if (!blocks.length) { zone.style.display = 'none'; grid.innerHTML = ''; return; }
    zone.style.display = 'block';
    grid.innerHTML = blocks.map(function (b) {
      var imgHtml = b.img ? '<div class="custom-card-img"><img src="' + b.img + '" alt="" loading="lazy"></div>' : '';
      var delHtml = editMode ? '<button class="custom-del" data-del="' + b.id + '">删除</button>' : '';
      return '<article class="custom-card card" data-block-id="' + b.id + '">' + delHtml + imgHtml +
        '<div class="custom-card-body"><h3>' + A.escapeHtml(b.title || '未命名') + '</h3><p>' + A.escapeHtml(b.body || '') + '</p></div></article>';
    }).join('');
  }

  function renderAnnouncement() {
    var wrap = document.getElementById('announceWrap');
    var textEl = document.getElementById('announceText');
    var ann = siteData.announcement || {};
    var txt = (ann.text || '').trim();
    var closed = sessionStorage.getItem(A.NOTICE_CLOSE_KEY) === '1';
    if (!txt || closed) { wrap.classList.remove('on'); return; }
    textEl.textContent = txt;
    wrap.classList.add('on');
  }

  function renderReviews() {
    var track = document.getElementById('track');
    var dots = document.getElementById('dots');
    if (!track || !dots) return;
    if (!reviewList.length) {
      track.innerHTML = '<div class="slide"><p class="quote">还没有评价，来写下第一条吧 ✍️</p></div>';
      dots.innerHTML = ''; return;
    }
    track.innerHTML = reviewList.map(function (r, i) {
      var del = editMode ? '<button class="review-del" data-review-del="' + i + '" type="button">删除</button>' : '';
      var qAttr = editMode ? ' contenteditable="true" spellcheck="false"' : '';
      var wAttr = editMode ? ' contenteditable="true" spellcheck="false"' : '';
      return '<div class="slide" data-review-id="' + A.escapeHtml(r.id || '') + '">' + del +
        '<p class="quote"' + qAttr + ' data-review-field="q">' + A.escapeHtml(r.q || '') + '</p>' +
        '<p class="who"' + wAttr + ' data-review-field="w">' + A.escapeHtml(r.w || '') + '</p></div>';
    }).join('');
    dots.innerHTML = '';
    reviewList.forEach(function (_, i) {
      var b = document.createElement('button');
      b.setAttribute('aria-label', '第 ' + (i + 1) + ' 条');
      b.addEventListener('click', function () { goReview(i); restartReview(); });
      dots.appendChild(b);
    });
    if (reviewIdx >= reviewList.length) reviewIdx = 0;
    goReview(reviewIdx);
  }
  function goReview(i) {
    var track = document.getElementById('track');
    var dots = document.getElementById('dots');
    if (!track || !dots || !reviewList.length) return;
    reviewIdx = (i + reviewList.length) % reviewList.length;
    track.style.transform = 'translateX(-' + (reviewIdx * 100) + '%)';
    Array.prototype.forEach.call(dots.children, function (d, k) { d.classList.toggle('on', k === reviewIdx); });
  }
  function playReview() { stopReview(); reviewTimer = setInterval(function () { goReview(reviewIdx + 1); }, 5200); }
  function stopReview() { clearInterval(reviewTimer); }
  function restartReview() { stopReview(); playReview(); }
  function bindCarousel() {
    var carousel = document.getElementById('carousel');
    if (!carousel) return;
    carousel.addEventListener('mouseenter', stopReview);
    carousel.addEventListener('mouseleave', playReview);
  }
  function loadReviews() {
    return A.apiGet('/api/reviews').then(function (j) {
      reviewList = (j && Array.isArray(j.reviews)) ? j.reviews : [];
      renderReviews(); playReview();
    }).catch(function () { reviewList = []; renderReviews(); });
  }

  function bindReviewForm() {
    var toggleBtn = document.getElementById('reviewToggle');
    var form = document.getElementById('reviewForm');
    var quoteEl = document.getElementById('reviewQuote');
    var whoEl = document.getElementById('reviewWho');
    var cancelBtn = document.getElementById('reviewCancel');
    var submitBtn = document.getElementById('reviewSubmit');
    if (!toggleBtn || !form) return;
    toggleBtn.addEventListener('click', function () {
      form.classList.toggle('on');
      if (form.classList.contains('on')) { toggleBtn.style.display = 'none'; setTimeout(function () { quoteEl.focus(); }, 60); }
    });
    cancelBtn.addEventListener('click', function () {
      form.classList.remove('on'); toggleBtn.style.display = ''; form.reset();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitBtn.disabled) return;
      var q = quoteEl.value.trim(); var w = whoEl.value.trim();
      if (!q) { quoteEl.focus(); A.toast('写点内容再发布吧 ✍️'); return; }
      if (!w) { whoEl.focus(); A.toast('请填写署名 ✍️'); return; }
      submitBtn.disabled = true; submitBtn.textContent = '发布中…';
      A.apiPost('/api/reviews', { q: q, w: w }).then(function (j) {
        reviewList = (j && Array.isArray(j.reviews)) ? j.reviews : reviewList;
        reviewIdx = 0; renderReviews(); playReview();
        form.classList.remove('on'); toggleBtn.style.display = ''; form.reset();
        A.toast(j.duplicate ? '已发布（重复提交已忽略）✨' : '评价已发布 ✨');
      }).catch(function (err) { A.toast('发布失败：' + (err.message || '未知错误')); })
      .then(function () { submitBtn.disabled = false; submitBtn.textContent = '发布评价'; });
    });
  }

  document.addEventListener('click', function (e) {
    var del = e.target.closest('[data-review-del]');
    if (!del || !editMode || !A.isAdmin()) return;
    var idx = parseInt(del.dataset.reviewDel, 10);
    var r = reviewList[idx];
    if (!r) return;
    if (!confirm('确定删除这条评价吗？')) return;
    A.apiPost('/api/reviews/delete', { id: r.id }, true).then(function (j) {
      reviewList = (j && Array.isArray(j.reviews)) ? j.reviews : [];
      if (reviewIdx >= reviewList.length) reviewIdx = 0;
      renderReviews(); A.toast('已删除', true);
    }).catch(function (err) { A.handleAuthError(err); A.toast('删除失败：' + (err.message || '未知错误'), true); });
  });

  function collectReviewsFromDOM() {
    if (!editMode) return null;
    var slides = document.querySelectorAll('#track .slide');
    if (!slides.length) return null;
    var out = [];
    slides.forEach(function (sl) {
      var qEl = sl.querySelector('[data-review-field="q"]');
      var wEl = sl.querySelector('[data-review-field="w"]');
      var id = sl.dataset.reviewId || ('r' + Math.random().toString(36).slice(2, 10));
      var q = qEl ? qEl.textContent.trim() : '';
      var w = wEl ? wEl.textContent.trim() : '';
      if (q) out.push({ id: id, q: q, w: w, d: Date.now() });
    });
    return out;
  }

  function setEditMode(on) {
    editMode = on;
    document.body.classList.toggle('edit-mode', on);
    document.querySelectorAll('[data-edit-key]').forEach(function (el) {
      if (el.dataset.editKey === 'hero-title') return;
      if (on) { el.setAttribute('contenteditable', 'true'); el.spellcheck = false; }
      else { el.removeAttribute('contenteditable'); }
    });
    var ht = document.getElementById('heroTitle');
    if (on) {
      ht.textContent = siteData.texts['hero-title'] || '阳谷县第一中学';
      ht.setAttribute('contenteditable', 'true'); ht.spellcheck = false;
    } else { ht.removeAttribute('contenteditable'); renderHeroTitle(); }
    renderBlocks(); renderReviews();
    var btn = document.getElementById('btnEdit');
    btn.innerHTML = on ? '✓ 退出编辑' : '✏️ 编辑';
    btn.classList.toggle('on', on);
    A.toast(on ? '编辑模式已开启，点击文字即可修改' : '已退出编辑模式', true);
  }

  function collectTexts() {
    document.querySelectorAll('[data-edit-key]').forEach(function (el) {
      var k = el.dataset.editKey;
      if (k === 'hero-title' || el.dataset.plain === 'true') siteData.texts[k] = el.textContent.trim();
      else siteData.texts[k] = el.innerHTML.trim();
    });
  }
  function saveAll() {
    collectTexts();
    var rv = collectReviewsFromDOM();
    var p = A.apiPost('/api/site', siteData, true);
    if (rv) p = p.then(function () {
      return A.apiPost('/api/reviews/save', { reviews: rv }, true).then(function (j) {
        reviewList = (j && Array.isArray(j.reviews)) ? j.reviews : reviewList; renderReviews();
      });
    });
    p.then(function () { A.toast('已保存 ✓', true); })
     .catch(function (e) { A.handleAuthError(e); A.toast('保存失败：' + e.message, true); });
  }
  function saveAllSilent() {
    collectTexts();
    var rv = collectReviewsFromDOM();
    var p = A.apiPost('/api/site', siteData, true);
    if (rv) p = p.then(function () {
      return A.apiPost('/api/reviews/save', { reviews: rv }, true).then(function (j) {
        reviewList = (j && Array.isArray(j.reviews)) ? j.reviews : reviewList; renderReviews();
      });
    });
    return p.catch(function (e) { A.handleAuthError(e); throw e; });
  }

  function bindAdmin() {
    var adminBar = document.getElementById('adminBar');
    var addPanel = document.getElementById('addPanel');
    var noticePanel = document.getElementById('noticePanel');
    if (!adminBar) return;

    function showAdminBar(show) {
      adminBar.classList.toggle('on', show);
      if (!show) { addPanel.classList.remove('on'); noticePanel.classList.remove('on'); }
    }

    document.getElementById('btnEdit').addEventListener('click', function () { setEditMode(!editMode); });
    document.getElementById('btnSave').addEventListener('click', saveAll);

    document.getElementById('btnNotice').addEventListener('click', function () {
      addPanel.classList.remove('on');
      noticePanel.classList.toggle('on');
      if (noticePanel.classList.contains('on')) {
        document.getElementById('noticeText').value = (siteData.announcement && siteData.announcement.text) || '';
        document.getElementById('noticeText').focus();
      }
    });
    document.getElementById('noticeCancel').addEventListener('click', function () { noticePanel.classList.remove('on'); });
    document.getElementById('noticeSave').addEventListener('click', function () {
      var txt = document.getElementById('noticeText').value.trim();
      siteData.announcement = { text: txt, updated: Date.now() };
      saveAllSilent().then(function () {
        sessionStorage.removeItem(A.NOTICE_CLOSE_KEY);
        renderAnnouncement(); noticePanel.classList.remove('on');
        A.toast('公告已更新 ✓', true);
      }).catch(function (e) { A.toast('保存失败：' + e.message, true); });
    });
    document.getElementById('announceClose').addEventListener('click', function () {
      sessionStorage.setItem(A.NOTICE_CLOSE_KEY, '1');
      document.getElementById('announceWrap').classList.remove('on');
    });

    document.getElementById('btnAdd').addEventListener('click', function () {
      noticePanel.classList.remove('on');
      addPanel.classList.toggle('on');
      if (addPanel.classList.contains('on')) document.getElementById('addTitle').focus();
    });
    document.getElementById('addCancel').addEventListener('click', function () {
      addPanel.classList.remove('on');
      document.getElementById('addTitle').value = '';
      document.getElementById('addBody').value = '';
      document.getElementById('addImg').value = '';
    });
    document.getElementById('addOk').addEventListener('click', function () {
      var title = document.getElementById('addTitle').value.trim();
      var body  = document.getElementById('addBody').value.trim();
      var file  = document.getElementById('addImg').files[0];
      if (!title && !body) { A.toast('至少写个标题或正文吧', true); return; }
      var proceed = function (imgUrl) {
        siteData.blocks.push({
          id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6),
          title: title || '未命名', body: body, img: imgUrl || ''
        });
        saveAllSilent().then(function () {
          renderBlocks();
          addPanel.classList.remove('on');
          document.getElementById('addTitle').value = '';
          document.getElementById('addBody').value = '';
          document.getElementById('addImg').value = '';
          document.getElementById('customZone').scrollIntoView({ behavior: 'smooth', block: 'start' });
          A.toast('卡片已添加 ✓', true);
        }).catch(function (e) { A.toast('保存失败：' + e.message, true); });
      };
      if (file) {
        A.compressImage(file, 1280, 0.78).then(A.uploadImage).then(proceed)
          .catch(function () { A.toast('图片上传失败，仅保存文字', true); proceed(''); });
      } else { proceed(''); }
    });

    document.getElementById('customGrid').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-del]');
      if (!btn || !editMode) return;
      var id = btn.dataset.del;
      if (!confirm('确定删除这张卡片吗？')) return;
      siteData.blocks = siteData.blocks.filter(function (b) { return b.id !== id; });
      saveAllSilent().then(renderBlocks).catch(function (e) { A.toast('删除失败：' + e.message, true); });
    });

    var adminFab = document.getElementById('adminFab');
    if (adminFab) adminFab.addEventListener('click', function (e) {
      e.stopPropagation();
      adminBar.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (!adminBar.classList.contains('open')) return;
      if (adminBar.contains(e.target)) return;
      adminBar.classList.remove('open');
    });

    document.getElementById('btnExport').addEventListener('click', function () {
      collectTexts();
      var blob = new Blob([JSON.stringify(siteData, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '阳谷一中-备份-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click(); URL.revokeObjectURL(a.href);
      A.toast('备份已下载', true);
    });
    document.getElementById('btnImport').addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/json,.json';
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            var d = JSON.parse(e.target.result);
            if (!d || typeof d !== 'object') throw new Error('bad');
            siteData = {
              texts: d.texts || {},
              images: d.images || {},
              blocks: Array.isArray(d.blocks) ? d.blocks : [],
              announcement: d.announcement || {}
            };
            return saveAllSilent().then(function () { location.reload(); });
          } catch (err) { A.toast('备份文件格式不正确', true); }
        };
        reader.readAsText(f);
      };
      input.click();
    });
    document.getElementById('btnReset').addEventListener('click', function () {
      if (!confirm('确定恢复初始状态吗？所有修改都会被清除。')) return;
      A.apiPost('/api/site/reset', {}, true).then(function () { location.reload(); })
        .catch(function (e) { A.handleAuthError(e); A.toast('操作失败：' + e.message, true); });
    });
    document.getElementById('btnLogout').addEventListener('click', function () {
      if (editMode) setEditMode(false);
      A.logout(); A.toast('已退出管理员', true);
    });

    document.addEventListener('app:logout', function () {
      showAdminBar(false);
      if (editMode) setEditMode(false);
    });
    document.addEventListener('app:login', function () { showAdminBar(true); });

    if (A.isAdmin()) showAdminBar(true);
  }

  function bindGallery() {
    var galleryModal = document.getElementById('galleryModal');
    var galleryGrid = document.getElementById('galleryGrid');
    var galleryTitle = document.getElementById('galleryTitle');
    var galleryInput = document.getElementById('galleryInput');
    if (!galleryModal) return;

    function openGallery(key, title) {
      currentGalleryKey = key;
      galleryTitle.textContent = '编辑图片 · ' + (title || '');
      renderGallery(); galleryModal.classList.add('on');
    }
    function closeGallery() {
      galleryModal.classList.remove('on');
      currentGalleryKey = '';
      saveAllSilent().then(function () { applyImages(); }).catch(function () {});
    }
    function renderGallery() {
      var arr = getImageArray(currentGalleryKey);
      if (!arr.length) { galleryGrid.innerHTML = '<div class="gallery-empty">还没有图片，点击下方按钮添加</div>'; return; }
      galleryGrid.innerHTML = arr.map(function (url, i) {
        return '<div class="gallery-item">' +
          '<img src="' + url + '" alt="" data-viewer="' + url + '">' +
          '<span class="num">' + (i + 1) + '</span>' +
          '<button data-gallery-del="' + i + '" title="删除">×</button></div>';
      }).join('');
    }

    document.querySelectorAll('[data-img-key]').forEach(function (host) {
      host.addEventListener('click', function (e) {
        if (!editMode || !A.isAdmin()) return;
        if (e.target.closest('.scene-indicators')) return;
        var fig = host.closest('.scene');
        var capEl = fig ? fig.querySelector('figcaption b') : null;
        var title = capEl ? capEl.textContent.trim() : '';
        openGallery(host.dataset.imgKey, title);
      });
    });
    galleryGrid.addEventListener('click', function (e) {
      var del = e.target.closest('[data-gallery-del]');
      if (del) {
        var idx = parseInt(del.dataset.galleryDel, 10);
        var arr = getImageArray(currentGalleryKey);
        arr.splice(idx, 1);
        setImageArray(currentGalleryKey, arr);
        renderGallery();
        A.toast('已删除，关闭后保存', true);
      }
    });
    document.getElementById('galleryUploadBtn').addEventListener('click', function () { galleryInput.click(); });
    galleryInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(galleryInput.files || []);
      if (!files.length) return;
      A.toast('正在压缩上传 ' + files.length + ' 张图片…', true);
      var arr = getImageArray(currentGalleryKey);
      var chain = Promise.resolve();
      files.forEach(function (f) {
        chain = chain.then(function () {
          return A.compressImage(f, 1280, 0.78).then(A.uploadImage).then(function (url) { arr.push(url); });
        });
      });
      chain.then(function () {
        setImageArray(currentGalleryKey, arr);
        renderGallery();
        return saveAllSilent().then(function () {
          applyImages(); A.toast('已上传 ' + files.length + ' 张，保存成功 ✓', true);
        });
      }).catch(function (e) { A.toast('保存失败：' + (e.message || '部分图片上传失败'), true); })
        .then(function () { galleryInput.value = ''; });
    });
    document.getElementById('galleryClose').addEventListener('click', closeGallery);
    galleryModal.addEventListener('click', function (e) { if (e.target === galleryModal) closeGallery(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') galleryModal.classList.remove('on');
    });

    document.querySelectorAll('.scene').forEach(function (fig) {
      var host = fig.querySelector('[data-img-key]');
      if (!host) return;
      fig.addEventListener('click', function (e) {
        var dot = e.target.closest('.scene-indicators i');
        if (!dot) return;
        var idx = parseInt(dot.dataset.idx, 10);
        var arr = getImageArray(host.dataset.imgKey);
        if (idx >= 0 && idx < arr.length) {
          setSceneImage(host, arr[idx], idx);
          renderSceneIndicators(host, arr.length, idx);
        }
      });
    });
  }

  function bindScores() {
    var scoreData = {
      '2025': [['统招录取线', 416.6], ['县最低控制线', 324.6]],
      '2024': [['统招录取线', 427.1], ['县最低控制线', 421.5]],
      '2023': [['统招录取线', 621.4]]
    };
    var MAX_SCORE = 700;
    var barsBox = document.getElementById('scoreBars');
    if (!barsBox) return;
    function renderScores(year) {
      var rows = scoreData[year] || [];
      barsBox.innerHTML = rows.map(function (r) {
        var pct = Math.min(100, (r[1] / MAX_SCORE * 100)).toFixed(1);
        return '<div class="bar-row"><span class="bar-label">' + r[0] + '</span><div class="bar-track"><div class="bar-fill" data-w="' + pct + '"></div></div><span class="bar-val">' + r[1] + '</span></div>';
      }).join('');
      requestAnimationFrame(function () {
        barsBox.querySelectorAll('.bar-fill').forEach(function (el, i) {
          setTimeout(function () { el.style.width = el.dataset.w + '%'; }, i * 120);
        });
      });
    }
    document.getElementById('scoreTabs').addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      this.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderScores(btn.dataset.year);
    });
    var scoresIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { renderScores('2025'); scoresIO.disconnect(); }
      });
    }, { threshold: 0.2 });
    scoresIO.observe(document.getElementById('scores'));
  }

  function initFx() {
    var cv = document.getElementById('fx');
    if (!cv) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var ctx = cv.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, pts = [];
    var mouse = { x: -9999, y: -9999 };
    function init() {
      var n = Math.min(60, Math.max(24, Math.round(W / 24)));
      pts = [];
      for (var i = 0; i < n; i++) pts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.34, vy: (Math.random() - 0.5) * 0.34, r: Math.random() * 1.7 + 0.9 });
    }
    function resize() {
      var r = cv.getBoundingClientRect();
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); init();
    }
    function step() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i]; p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
      }
      for (var a = 0; a < pts.length; a++) {
        var pa = pts[a];
        for (var b = a + 1; b < pts.length; b++) {
          var pb = pts[b]; var dx = pa.x - pb.x, dy = pa.y - pb.y; var d2 = dx * dx + dy * dy;
          if (d2 < 17000) {
            var o = (1 - Math.sqrt(d2) / 130) * 0.3;
            ctx.strokeStyle = 'rgba(37,99,235,' + o.toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
          }
        }
        var mx = pa.x - mouse.x, my = pa.y - mouse.y; var md2 = mx * mx + my * my;
        if (md2 < 22000) {
          var mo = (1 - Math.sqrt(md2) / 148) * 0.42;
          ctx.strokeStyle = 'rgba(6,182,212,' + mo.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }
      for (var k = 0; k < pts.length; k++) {
        ctx.beginPath(); ctx.fillStyle = 'rgba(37,99,235,.48)';
        ctx.arc(pts[k].x, pts[k].y, pts[k].r, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(step);
    }
    cv.addEventListener('mousemove', function (e) {
      var r = cv.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    cv.addEventListener('mouseleave', function () { mouse.x = -9999; mouse.y = -9999; });
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(resize, 180); });
    resize(); requestAnimationFrame(step);
  }

  function bindBless() {
    var btn = document.getElementById('blessBtn');
    if (!btn) return;
    var blessings = [
      '愿你合上笔盖的那一刻，有战士收刀入鞘的骄傲。✨',
      '所有的努力都不会白费，只是还没到兑现的时候。🌱',
      '稳住，你比想象中更接近终点。🚀',
      '慢慢来，比较快。今天的每一道题都算数。📘',
      '星光不问赶路人，时光不负有心人。🌙',
      '考场上别慌，你会的比你以为的多。💪',
      '三年很长，长到能改变一个人；三天很短，短到只需全力以赴。⏳'
    ];
    btn.addEventListener('click', function () { A.toast(blessings[Math.floor(Math.random() * blessings.length)]); });
  }

  function initReveal() {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { revealIO.observe(el); });

    function runCount(el) {
      var target = parseFloat(el.dataset.target) || 0;
      var suffix = el.dataset.suffix || '';
      var dec = parseInt(el.dataset.decimals || '0', 10);
      var dur = 1500, t0 = performance.now();
      function tick(t) {
        var p = Math.min(1, (t - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        var v = target * e;
        el.textContent = (dec > 0 ? v.toFixed(dec) : Math.round(v)) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
    var countIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { runCount(e.target); countIO.unobserve(e.target); }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('.count').forEach(function (el) { countIO.observe(el); });

    var links = Array.prototype.slice.call(document.querySelectorAll('.links a'));
    var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));
    if (sections.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            var id = '#' + e.target.id;
            links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === id); });
          }
        });
      }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
      sections.forEach(function (s) { io.observe(s); });
    }
  }

  function initTilt() {
    document.querySelectorAll('.tilt').forEach(function (el) {
      el.addEventListener('mousemove', function (ev) {
        var r = el.getBoundingClientRect();
        var px = (ev.clientX - r.left) / r.width;
        var py = (ev.clientY - r.top) / r.height;
        el.style.setProperty('--rx', ((0.5 - py) * 9).toFixed(2) + 'deg');
        el.style.setProperty('--ry', ((px - 0.5) * 11).toFixed(2) + 'deg');
        el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });
      el.addEventListener('mouseleave', function () {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });
  }

  function bootstrap() {
    A.apiGet('/api/site').catch(function () { return { texts: {}, images: {}, blocks: [], announcement: {} }; })
      .then(function (s) {
        s = s || {};
        siteData = {
          texts: s.texts || {}, images: s.images || {},
          blocks: Array.isArray(s.blocks) ? s.blocks : [],
          announcement: s.announcement || {}
        };
        applyTexts(); applyImages(); renderHeroTitle(); renderBlocks();
        renderAnnouncement(); loadReviews();
      });
    bindAdmin(); bindGallery(); bindReviewForm(); bindCarousel();
    bindScores(); bindBless(); initFx(); initTilt(); initReveal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
})();