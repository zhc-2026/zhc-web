(function () {
  'use strict';
  var A = window.App;
  var boardMessages = [];
  var editMode = false;
  var pendingBoardImg = '';

  var MSG_PREVIEW_COUNT = 3;
  var msgExpanded = false;
  var mobileMQ = window.matchMedia('(max-width: 900px)');

  function updateMsgListUI() {
    var listEl = document.getElementById('msgList');
    var moreBtn = document.getElementById('msgMore');
    if (!listEl || !moreBtn) return;
    var total = boardMessages.length;
    var canCollapse = mobileMQ.matches && total > MSG_PREVIEW_COUNT;
    if (!canCollapse) {
      listEl.classList.remove('collapsed');
      moreBtn.classList.remove('show', 'expanded');
      msgExpanded = false; return;
    }
    moreBtn.classList.add('show');
    listEl.classList.toggle('collapsed', !msgExpanded);
    moreBtn.classList.toggle('expanded', msgExpanded);
    var label = moreBtn.querySelector('.msg-more-text');
    if (label) label.textContent = msgExpanded ? '收起留言' : '展开全部 ' + total + ' 条留言';
  }
  function bindMsgMore() {
    var moreBtn = document.getElementById('msgMore');
    if (!moreBtn) return;
    moreBtn.addEventListener('click', function () { msgExpanded = !msgExpanded; updateMsgListUI(); });
    var onMQ = function () { if (!mobileMQ.matches) msgExpanded = false; updateMsgListUI(); };
    if (mobileMQ.addEventListener) mobileMQ.addEventListener('change', onMQ);
    else if (mobileMQ.addListener) mobileMQ.addListener(onMQ);
  }

  function renderBoard() {
    var listEl = document.getElementById('msgList');
    if (!listEl) return;
    if (!boardMessages.length) {
      listEl.innerHTML = '<li class="empty">还没有留言，来写下第一条吧 ✍️</li>';
      updateMsgListUI(); return;
    }
    listEl.innerHTML = boardMessages.map(function (m, i) {
      var d = new Date(m.d);
      var dateStr = (d.getMonth() + 1) + '月' + d.getDate() + '日';
      var del = editMode ? '<button class="msg-del" data-del-board="' + i + '" title="删除">×</button>' : '';
      var gradeHtml = m.g ? '<span class="msg-grade">' + A.escapeHtml(m.g) + '</span>' : '';
      var imgHtml = m.img ? '<div class="msg-img" data-viewer="' + m.img + '"><img src="' + m.img + '" alt="" loading="lazy"></div>' : '';
      return '<li class="msg">' + del +
        '<div class="msg-head"><span class="msg-name"><b>' + A.escapeHtml(m.n) + '</b>' + gradeHtml + '</span><span>' + dateStr + '</span></div>' +
        '<p>' + A.escapeHtml(m.t) + '</p>' + imgHtml + '</li>';
    }).join('');
    updateMsgListUI();
  }
  function loadBoard() {
    return A.apiGet('/api/board').then(function (j) {
      boardMessages = (j && j.messages) || []; renderBoard();
    }).catch(function () { boardMessages = []; renderBoard(); });
  }

  function bindBoardForm() {
    var form = document.getElementById('boardForm');
    if (!form) return;
    var submitBtn = document.getElementById('boardSubmit');
    var imgInput = document.getElementById('imgInput');
    var imgPreview = document.getElementById('imgPreview');
    var imgPreviewImg = document.getElementById('imgPreviewImg');
    var imgPreviewDel = document.getElementById('imgPreviewDel');

    document.getElementById('imgPick').addEventListener('click', function (e) {
      if (e.target.closest('#imgPreviewDel')) return;
      imgInput.click();
    });
    var gradeInput = document.getElementById('grade');
    gradeInput.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 4);
    });
    gradeInput.addEventListener('paste', function (e) {
      var t = (e.clipboardData || window.clipboardData).getData('text') || '';
      var digits = t.replace(/\D/g, '').slice(0, 4);
      if (digits !== t) { e.preventDefault(); this.value = digits; }
    });

    imgInput.addEventListener('change', function () {
      var f = imgInput.files && imgInput.files[0];
      if (!f) return;
      A.compressImage(f, 800, 0.68).then(function (dataUrl) {
        pendingBoardImg = dataUrl;
        imgPreviewImg.src = dataUrl;
        imgPreview.classList.add('on');
        var kb = Math.round(dataUrl.length * 0.75 / 1024);
        A.toast('图片已压缩到约 ' + kb + ' KB');
      }).catch(function () { A.toast('图片处理失败'); });
    });
    imgPreviewDel.addEventListener('click', function (e) {
      e.stopPropagation();
      pendingBoardImg = ''; imgInput.value = ''; imgPreview.classList.remove('on');
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitBtn.disabled) return;
      var nick = document.getElementById('nick').value.trim();
      var grade = document.getElementById('grade').value.trim();
      var msg = document.getElementById('msg').value.trim();
      if (!grade) { gradeInput.focus(); A.toast('请填写入学年份 ✍️'); return; }
      if (!/^\d{4}$/.test(grade)) { gradeInput.focus(); A.toast('入学年份必须是 4 位数字，例如 2024'); return; }
      grade = grade + '级';
      if (!msg) { document.getElementById('msg').focus(); A.toast('写点什么再发布吧 ✍️'); return; }
      submitBtn.disabled = true; submitBtn.textContent = '发送中…';

      var imgUrl = '';
      var chain = Promise.resolve();
      if (pendingBoardImg) {
        chain = A.uploadImagePublic(pendingBoardImg, function (p) {
          submitBtn.textContent = '上传图片 ' + p + '%';
        }).then(function (j) { imgUrl = j.url; });
      }
      chain.then(function () {
        submitBtn.textContent = '提交中…';
        return A.apiPost('/api/board', { name: nick, grade: grade, text: msg, img: imgUrl });
      }).then(function (j) {
        boardMessages = j.messages || [];
        msgExpanded = false;
        renderBoard(); form.reset();
        pendingBoardImg = ''; imgPreview.classList.remove('on');
        A.toast(j.duplicate ? '已发布（重复提交已忽略）✨' : '留言已发布 ✨');
      }).catch(function (err) {
        A.handleAuthError(err);
        A.toast('发布失败：' + (err.message || '未知错误'));
      }).then(function () {
        submitBtn.disabled = false; submitBtn.textContent = '发布留言';
      });
    });
  }

  function bindBoardDelete() {
    var listEl = document.getElementById('msgList');
    if (!listEl) return;
    listEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-del-board]');
      if (!btn || !editMode) return;
      var idx = parseInt(btn.dataset.delBoard, 10);
      if (!confirm('确定删除这条留言吗？')) return;
      A.apiPost('/api/board/delete', { index: idx }, true).then(function (j) {
        boardMessages = j.messages || []; renderBoard(); A.toast('已删除', true);
      }).catch(function (err) { A.handleAuthError(err); A.toast('删除失败：' + err.message, true); });
    });
  }

  function bindAdmin() {
    var bar = document.getElementById('adminBar');
    if (!bar) return;
    var editBtn = document.getElementById('btnEdit');
    var fab = document.getElementById('adminFab');

    if (fab) fab.addEventListener('click', function (e) {
      e.stopPropagation();
      bar.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (!bar.classList.contains('open')) return;
      if (bar.contains(e.target)) return;
      bar.classList.remove('open');
    });
    if (editBtn) editBtn.addEventListener('click', function () {
      editMode = !editMode;
      document.body.classList.toggle('edit-mode', editMode);
      editBtn.innerHTML = editMode ? '✓ 退出编辑' : '✏️ 编辑';
      editBtn.classList.toggle('on', editMode);
      renderBoard();
      A.toast(editMode ? '编辑模式已开启，鼠标悬停留言可删除' : '已退出编辑模式', true);
    });
    var logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      if (editMode && editBtn) editBtn.click();
      A.logout(); A.toast('已退出管理员', true);
    });
    document.addEventListener('app:logout', function () {
      bar.classList.remove('on', 'open');
      if (editMode && editBtn) editBtn.click();
    });
    document.addEventListener('app:login', function () { bar.classList.add('on'); });
    if (A.isAdmin()) bar.classList.add('on');
  }

  function bootstrap() {
    loadBoard(); bindBoardForm(); bindBoardDelete(); bindMsgMore(); bindAdmin();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
})();