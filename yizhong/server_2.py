#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""阳谷县第一中学 · 校园印象（非官方）—— 后端服务器"""

import http.server, json, os, re, base64, secrets, mimetypes, threading, time
from datetime import datetime
from urllib.parse import urlparse

HOST = '0.0.0.0'
PORT = int(os.environ.get('PORT', 8000))
ADMIN_PASSWORD = 'yzyb2026'          # ← 改这里换密码

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
UPLOAD_DIR = os.path.join(DATA_DIR, 'uploads')
SITE_FILE = os.path.join(DATA_DIR, 'site.json')
BOARD_FILE = os.path.join(DATA_DIR, 'board.json')
REVIEWS_FILE = os.path.join(DATA_DIR, 'reviews.json')
TOKENS = set()
PUBLIC_UPLOAD_LIMIT = {}
PUBLIC_REVIEW_LIMIT = {}
ONLINE = {}
ONLINE_TTL = 60
LOCK = threading.Lock()
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 显式补上常见前端资源的 MIME 类型，避免个别系统识别错
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/json', '.json')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('image/webp', '.webp')

EMPTY_SITE = {'texts': {}, 'images': {}, 'blocks': [], 'announcement': {}}
EMPTY_BOARD = {'messages': []}
EMPTY_REVIEWS = {'reviews': []}

DEFAULT_REVIEWS = [
    {'id': 'r1', 'q': '食堂的糖醋里脊，大概是我对高中最具体的记忆。每次排队都要祈祷别卖完。', 'w': '高三（2）班 · 李同学', 'd': 0},
    {'id': 'r2', 'q': '晚自习下课后的操场特别安静，适合一个人走两圈，把想不明白的事慢慢想明白。', 'w': '2023 届 · 王同学', 'd': 0},
    {'id': 'r3', 'q': '图书楼三楼靠窗那个位置是我的宝藏座位，阳光刚刚好，翻书的声音刚刚好。', 'w': '高二（7）班 · 张同学', 'd': 0},
    {'id': 'r4', 'q': '老师会陪你到最后一节晚自习，也会在你考砸的时候说一句“没关系，还有下次”。', 'w': '2024 届 · 赵同学', 'd': 0},
    {'id': 'r5', 'q': '学校在育英街，附近有条小吃街，晚自习前买个煎饼果子，就是一天里最踏实的时刻。', 'w': '高一（1）班 · 刘同学', 'd': 0},
]

def read_json(path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default

def write_json(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

def clean_online():
    now = time.time()
    with LOCK:
        expired = [k for k, v in ONLINE.items() if now - v > ONLINE_TTL]
        for k in expired: del ONLINE[k]
        return len(ONLINE)

# 页面别名：/board 也能打开 board.html；/home 或 /index 也能打开首页
PAGE_ALIASES = {
    '/board': '/board.html',
    '/home': '/index.html',
    '/index': '/index.html',
}

class Handler(http.server.BaseHTTPRequestHandler):
    server_version = 'YGX1/2.5'

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def fail(self, msg, status=400):
        self.send_json({'ok': False, 'error': msg}, status)

    def read_body(self, max_size=20 * 1024 * 1024):
        length = int(self.headers.get('Content-Length') or 0)
        if length > max_size: raise ValueError('请求体过大')
        return self.rfile.read(length) if length else b''

    def read_json_body(self):
        raw = self.read_body()
        if not raw: return {}
        try: return json.loads(raw.decode('utf-8'))
        except Exception: raise ValueError('JSON 格式不正确')

    def check_token(self):
        token = self.headers.get('X-Admin-Token', '')
        with LOCK: return bool(token) and token in TOKENS

    def log_message(self, fmt, *args):
        msg = fmt % args
        if '400' in msg or 'Bad request' in msg: return
        if '/api/heartbeat' in msg or '/api/online' in msg: return
        # 静态资源请求不再刷屏：css / js / 图片 / 字体
        if re.search(r'"(GET|HEAD) /(assets/|data/uploads/)', msg): return
        if re.search(r'\.(css|js|mjs|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)(\?|")', msg): return
        print('[%s] %s' % (datetime.now().strftime('%H:%M:%S'), msg))

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/site': self.send_json(read_json(SITE_FILE, EMPTY_SITE)); return
        if path == '/api/board': self.send_json(read_json(BOARD_FILE, EMPTY_BOARD)); return
        if path == '/api/reviews':
            data = read_json(REVIEWS_FILE, None)
            if data is None:
                data = {'reviews': DEFAULT_REVIEWS[:]}
                with LOCK: write_json(REVIEWS_FILE, data)
            self.send_json(data); return
        if path == '/api/ping': self.send_json({'ok': True, 'time': datetime.now().isoformat()}); return
        if path == '/api/online': self.send_json({'ok': True, 'count': clean_online()}); return
        if path == '/': path = '/index.html'
        # 页面别名（/board → /board.html）
        if path in PAGE_ALIASES: path = PAGE_ALIASES[path]
        self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            if path == '/api/login': self.handle_login()
            elif path == '/api/site': self.handle_save_site()
            elif path == '/api/site/reset': self.handle_reset_site()
            elif path == '/api/board': self.handle_post_board()
            elif path == '/api/board/delete': self.handle_delete_board()
            elif path == '/api/reviews': self.handle_post_review()
            elif path == '/api/reviews/save': self.handle_save_reviews()
            elif path == '/api/reviews/delete': self.handle_delete_review()
            elif path == '/api/upload': self.handle_upload()
            elif path == '/api/upload/public': self.handle_upload_public()
            elif path == '/api/heartbeat': self.handle_heartbeat()
            else: self.fail('未知接口', 404)
        except ValueError as e: self.fail(str(e), 400)
        except Exception as e: self.fail('服务器错误：%s' % e, 500)

    def handle_login(self):
        data = self.read_json_body()
        if str(data.get('password', '')) != ADMIN_PASSWORD:
            self.send_json({'ok': False, 'error': '密码不正确'}, 401); return
        token = secrets.token_urlsafe(32)
        with LOCK:
            if len(TOKENS) > 50: TOKENS.clear()
            TOKENS.add(token)
        self.send_json({'ok': True, 'token': token})

    def handle_heartbeat(self):
        data = self.read_json_body()
        sid = str(data.get('sid', '')).strip()[:64]
        if not sid: self.fail('缺少 sid'); return
        with LOCK: ONLINE[sid] = time.time()
        self.send_json({'ok': True, 'count': clean_online()})

    def handle_save_site(self):
        if not self.check_token():
            self.fail('未登录或登录已过期', 401); return
        data = self.read_json_body()
        if not isinstance(data, dict): self.fail('数据格式不正确'); return
        site = {
            'texts': data.get('texts') if isinstance(data.get('texts'), dict) else {},
            'images': data.get('images') if isinstance(data.get('images'), dict) else {},
            'blocks': data.get('blocks') if isinstance(data.get('blocks'), list) else [],
            'announcement': data.get('announcement') if isinstance(data.get('announcement'), dict) else {},
        }
        with LOCK: write_json(SITE_FILE, site)
        self.send_json({'ok': True})

    def handle_reset_site(self):
        if not self.check_token():
            self.fail('未登录或登录已过期', 401); return
        with LOCK: write_json(SITE_FILE, EMPTY_SITE)
        self.send_json({'ok': True})

    def handle_post_board(self):
        data = self.read_json_body()
        name = str(data.get('name', '')).strip()[:14] or '匿名同学'
        text = str(data.get('text', '')).strip()[:200]
        grade = str(data.get('grade', '')).strip()[:12]
        img = str(data.get('img', '')).strip()[:300]
        if not text: self.fail('留言内容不能为空'); return
        if not grade: self.fail('请填写入学年份（年级）'); return
        board = read_json(BOARD_FILE, EMPTY_BOARD)
        msgs = board.get('messages') if isinstance(board.get('messages'), list) else []
        now = int(datetime.now().timestamp() * 1000)
        if msgs:
            last = msgs[0]
            if (last.get('t') == text and last.get('n') == name
                and last.get('g') == grade and now - last.get('d', 0) < 5000):
                self.send_json({'ok': True, 'messages': msgs, 'duplicate': True}); return
        msgs.insert(0, {'n': name, 't': text, 'd': now, 'g': grade, 'img': img})
        board['messages'] = msgs[:200]
        with LOCK: write_json(BOARD_FILE, board)
        self.send_json({'ok': True, 'messages': board['messages']})

    def handle_delete_board(self):
        if not self.check_token():
            self.fail('未登录或登录已过期', 401); return
        data = self.read_json_body()
        board = read_json(BOARD_FILE, EMPTY_BOARD)
        msgs = board.get('messages') if isinstance(board.get('messages'), list) else []
        try: idx = int(data.get('index'))
        except (TypeError, ValueError): self.fail('参数不正确'); return
        if 0 <= idx < len(msgs):
            msgs.pop(idx)
            board['messages'] = msgs
            with LOCK: write_json(BOARD_FILE, board)
            self.send_json({'ok': True, 'messages': msgs})
        else: self.fail('找不到这条留言', 404)

    def handle_post_review(self):
        """访客提交评价，公开，无需登录，但有频率限制"""
        ip = self.client_address[0]
        now = time.time()
        with LOCK:
            times = [t for t in PUBLIC_REVIEW_LIMIT.get(ip, []) if now - t < 120]
            if len(times) >= 3:
                self.fail('提交过于频繁，请稍后再试', 429); return
            times.append(now)
            PUBLIC_REVIEW_LIMIT[ip] = times

        data = self.read_json_body()
        q = str(data.get('q', '')).strip()[:200]
        w = str(data.get('w', '')).strip()[:30]
        if not q: self.fail('评价内容不能为空'); return
        if not w: self.fail('请填写署名'); return

        rv = read_json(REVIEWS_FILE, EMPTY_REVIEWS)
        reviews = rv.get('reviews') if isinstance(rv.get('reviews'), list) else []
        for r in reviews[:3]:
            if r.get('q') == q and r.get('w') == w and now * 1000 - r.get('d', 0) < 5000:
                self.send_json({'ok': True, 'reviews': reviews, 'duplicate': True}); return
        reviews.insert(0, {
            'id': 'r' + secrets.token_hex(6),
            'q': q, 'w': w,
            'd': int(now * 1000)
        })
        rv['reviews'] = reviews[:100]
        with LOCK: write_json(REVIEWS_FILE, rv)
        self.send_json({'ok': True, 'reviews': rv['reviews']})

    def handle_save_reviews(self):
        """管理员全量保存（编辑模式改动后）"""
        if not self.check_token():
            self.fail('未登录或登录已过期', 401); return
        data = self.read_json_body()
        reviews = data.get('reviews') if isinstance(data.get('reviews'), list) else []
        clean = []
        for r in reviews[:100]:
            if not isinstance(r, dict): continue
            q = str(r.get('q', '')).strip()[:200]
            w = str(r.get('w', '')).strip()[:30]
            if not q: continue
            clean.append({
                'id': str(r.get('id') or ('r' + secrets.token_hex(6))),
                'q': q, 'w': w,
                'd': int(r.get('d') or 0)
            })
        with LOCK: write_json(REVIEWS_FILE, {'reviews': clean})
        self.send_json({'ok': True, 'reviews': clean})

    def handle_delete_review(self):
        if not self.check_token():
            self.fail('未登录或登录已过期', 401); return
        data = self.read_json_body()
        rid = str(data.get('id', '')).strip()
        if not rid: self.fail('缺少 id'); return
        rv = read_json(REVIEWS_FILE, EMPTY_REVIEWS)
        reviews = rv.get('reviews') if isinstance(rv.get('reviews'), list) else []
        rv['reviews'] = [r for r in reviews if r.get('id') != rid]
        with LOCK: write_json(REVIEWS_FILE, rv)
        self.send_json({'ok': True, 'reviews': rv['reviews']})

    def handle_upload(self):
        if not self.check_token():
            self.fail('未登录或登录已过期', 401); return
        data = self.read_json_body()
        data_url = str(data.get('data', ''))
        m = re.match(r'^data:image/(png|jpe?g|gif|webp);base64,(.+)$', data_url, re.I | re.S)
        if not m: self.fail('只支持 PNG / JPG / GIF / WebP'); return
        ext = m.group(1).lower()
        if ext == 'jpeg': ext = 'jpg'
        try: raw = base64.b64decode(m.group(2))
        except Exception: self.fail('图片数据损坏'); return
        if len(raw) > 8 * 1024 * 1024: self.fail('图片超过 8MB'); return
        name = '%s-%s.%s' % (datetime.now().strftime('%Y%m%d%H%M%S'), secrets.token_hex(4), ext)
        with open(os.path.join(UPLOAD_DIR, name), 'wb') as f: f.write(raw)
        self.send_json({'ok': True, 'url': '/data/uploads/' + name})

    def handle_upload_public(self):
        ip = self.client_address[0]
        now = time.time()
        with LOCK:
            times = [t for t in PUBLIC_UPLOAD_LIMIT.get(ip, []) if now - t < 60]
            if len(times) >= 5:
                self.fail('上传过于频繁，请稍后再试', 429); return
            times.append(now)
            PUBLIC_UPLOAD_LIMIT[ip] = times
        data = self.read_json_body()
        data_url = str(data.get('data', ''))
        m = re.match(r'^data:image/(png|jpe?g|gif|webp);base64,(.+)$', data_url, re.I | re.S)
        if not m: self.fail('只支持 PNG / JPG / GIF / WebP'); return
        ext = m.group(1).lower()
        if ext == 'jpeg': ext = 'jpg'
        try: raw = base64.b64decode(m.group(2))
        except Exception: self.fail('图片数据损坏'); return
        if len(raw) > 4 * 1024 * 1024: self.fail('图片超过 4MB'); return
        name = '%s-%s.%s' % (datetime.now().strftime('%Y%m%d%H%M%S'), secrets.token_hex(4), ext)
        with open(os.path.join(UPLOAD_DIR, name), 'wb') as f: f.write(raw)
        self.send_json({'ok': True, 'url': '/data/uploads/' + name})

    def serve_static(self, path):
        rel = path.lstrip('/')
        # 保护 data/ 目录下的 json，只开放 data/uploads/ 里的图片
        if rel.startswith('data/') and not rel.startswith('data/uploads/'):
            self.fail('禁止访问', 403); return
        full = os.path.normpath(os.path.join(BASE_DIR, rel))
        if not full.startswith(BASE_DIR): self.fail('非法路径', 403); return
        if os.path.isdir(full): full = os.path.join(full, 'index.html')
        if not os.path.isfile(full): self.fail('文件不存在', 404); return
        ctype, _ = mimetypes.guess_type(full)
        if not ctype: ctype = 'application/octet-stream'
        if ctype.startswith('text/') or ctype in ('application/javascript', 'application/json'):
            ctype += '; charset=utf-8'
        try:
            with open(full, 'rb') as f: body = f.read()
        except OSError: self.fail('读取文件失败', 500); return
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        # 缓存策略：
        #   - uploads 下的图片：长缓存（1 天）
        #   - 其他所有 html / css / js / 图片：不缓存，避免改了看不到最新
        if full.startswith(UPLOAD_DIR):
            self.send_header('Cache-Control', 'public, max-age=86400')
        else:
            self.send_header('Cache-Control', 'no-cache, must-revalidate')
        self.end_headers()
        self.wfile.write(body)

class ThreadingServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(SITE_FILE): write_json(SITE_FILE, EMPTY_SITE)
    if not os.path.exists(BOARD_FILE): write_json(BOARD_FILE, EMPTY_BOARD)
    if not os.path.exists(REVIEWS_FILE): write_json(REVIEWS_FILE, {'reviews': DEFAULT_REVIEWS[:]})
    with ThreadingServer((HOST, PORT), Handler) as httpd:
        print('=' * 56)
        print('  阳谷县第一中学 · 校园印象（非官方）')
        print('=' * 56)
        print('  首页：  http://127.0.0.1:%d/' % PORT)
        print('  留言板：http://127.0.0.1:%d/board.html' % PORT)
        print('  局域网：http://<你的IP>:%d' % PORT)
        print('  数据目录：%s' % DATA_DIR)
        print('  按 Ctrl+C 停止')
        print('=' * 56)
        try: httpd.serve_forever()
        except KeyboardInterrupt: print('\n已停止。')

if __name__ == '__main__':
    main()