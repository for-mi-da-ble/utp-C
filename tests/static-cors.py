# Servidor estático con CORS abierto (como GitHub Pages) para probar el modo Apps Script: python3 tests/static-cors.py 8767
import sys, http.server, functools, os
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self): self.send_header('Access-Control-Allow-Origin', '*'); super().end_headers()
    def log_message(self, *a): pass
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1] if len(sys.argv) > 1 else 8767)), H).serve_forever()
