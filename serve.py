#!/usr/bin/env python3
"""Local dev server that disables caching so module edits always show on reload."""
import http.server, socketserver, os

PORT = 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"serving taxestimator (no-cache) at http://127.0.0.1:{PORT}/")
    httpd.serve_forever()
