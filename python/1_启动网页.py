"""启动本机 CT 对比剂课堂演示网页。"""

import argparse
import json
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from ct_contrast.engine import evaluate, preview


WEB_ROOT = Path(__file__).resolve().parent / '2_网页'
PAGE = ('1_页面.html', 'text/html; charset=utf-8')
FILES = {
    '/': PAGE,
    '/index.html': PAGE,
    '/2_样式.css': ('2_样式.css', 'text/css; charset=utf-8'),
    '/3_交互.js': ('3_交互.js', 'text/javascript; charset=utf-8'),
}
API = {'/api/preview': preview, '/api/evaluate': evaluate}


class DemoHandler(BaseHTTPRequestHandler):
    def send_body(self, content, content_type, status=HTTPStatus.OK):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def send_json(self, value, status=HTTPStatus.OK):
        content = json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_body(content, 'application/json; charset=utf-8', status)

    def do_GET(self):
        route = unquote(urlsplit(self.path).path)
        resource = FILES.get(route)
        if resource is None:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        name, content_type = resource
        self.send_body((WEB_ROOT / name).read_bytes(), content_type)

    def do_POST(self):
        compute = API.get(urlsplit(self.path).path)
        if compute is None:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0:
                raise ValueError('请求内容为空')
            form = json.loads(self.rfile.read(length))
            if not isinstance(form, dict):
                raise ValueError('请求内容应为表单对象')
            result = compute(form)
        except (ValueError, TypeError, KeyError, OverflowError):
            self.send_json({'error': '表单数据无效，请核对后再试。'}, HTTPStatus.BAD_REQUEST)
            return
        self.send_json(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765, help='本地端口，默认 8765')
    parser.add_argument('--open-browser', action='store_true', help='启动后打开默认浏览器')
    options = parser.parse_args()
    with ThreadingHTTPServer(('127.0.0.1', options.port), DemoHandler) as server:
        url = f'http://127.0.0.1:{server.server_port}/'
        print(f'本地演示地址 {url}', flush=True)
        if options.open_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
