import sys
from http.server import HTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from api.optimize_shifts import handler


HOST = "127.0.0.1"
PORT = 8000


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), handler)
    print(f"Otimizador local disponível em http://{HOST}:{PORT}/api/optimize_shifts")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nA terminar o otimizador local...")
    finally:
        server.server_close()
