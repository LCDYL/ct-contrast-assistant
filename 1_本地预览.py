"""在 IDE 中运行，预览 GitHub Pages 网页。"""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8766, help='预览端口，默认 8766')
    parser.add_argument('--no-browser', action='store_true', help='仅启动预览服务')
    options = parser.parse_args()
    pages = Path(__file__).resolve().parent / 'docs'
    handler = partial(SimpleHTTPRequestHandler, directory=str(pages))
    with ThreadingHTTPServer(('127.0.0.1', options.port), handler) as server:
        address = f'http://127.0.0.1:{server.server_port}/'
        print(f'CT 网页预览 {address}', flush=True)
        if not options.no_browser:
            webbrowser.open(address)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
