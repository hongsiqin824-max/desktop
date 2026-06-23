#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
START_PORT=${START_PORT:-18180}
HOST=127.0.0.1

if ! command -v python3 >/dev/null 2>&1 &&
   ! command -v python >/dev/null 2>&1 &&
   ! command -v ruby >/dev/null 2>&1 &&
   ! command -v node >/dev/null 2>&1; then
  echo "Cannot start demo server."
  echo "Windows users can double-click windows-start-demo.bat."
  echo "macOS/Linux needs one available runtime: python3, python, ruby, or node."
  exit 1
fi

is_port_available() {
  port="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$HOST" "$port" <<'PY' >/dev/null 2>&1
import socket, sys
s = socket.socket()
try:
    s.bind((sys.argv[1], int(sys.argv[2])))
finally:
    s.close()
PY
    return $?
  fi
  if command -v python >/dev/null 2>&1; then
    python - "$HOST" "$port" <<'PY' >/dev/null 2>&1
import socket, sys
s = socket.socket()
try:
    s.bind((sys.argv[1], int(sys.argv[2])))
finally:
    s.close()
PY
    return $?
  fi
  if command -v ruby >/dev/null 2>&1; then
    ruby -rsocket -e "TCPServer.new('$HOST', $port).close" >/dev/null 2>&1
    return $?
  fi
  node -e "const net=require('net');const s=net.createServer();s.once('error',()=>process.exit(1));s.listen($port,'$HOST',()=>s.close(()=>process.exit(0)));" >/dev/null 2>&1
}

find_port() {
  port="$START_PORT"
  end=$((START_PORT + 99))
  while [ "$port" -le "$end" ]; do
    if is_port_available "$port"; then
      printf '%s\n' "$port"
      return 0
    fi
    port=$((port + 1))
  done
  return 1
}

open_browser() {
  url="$1"
  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  fi
}

PORT=$(find_port || true)
if [ -z "${PORT:-}" ]; then
  echo "No available localhost port found from $START_PORT to $((START_PORT + 99))."
  exit 1
fi

URL="http://localhost:$PORT/"
cd "$SCRIPT_DIR"

echo ""
echo "MZY JS SDK demo server is running."
echo "URL: $URL"
echo "Root: $SCRIPT_DIR"
echo "Press Ctrl+C to stop."
echo ""

open_browser "$URL"

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind "$HOST"
elif command -v python >/dev/null 2>&1; then
  PY_MAJOR=$(python -c 'import sys; print(sys.version_info[0])')
  if [ "$PY_MAJOR" = "3" ]; then
    exec python -m http.server "$PORT" --bind "$HOST"
  fi
  exec python -m SimpleHTTPServer "$PORT"
elif command -v ruby >/dev/null 2>&1; then
  exec ruby -run -e httpd . -p "$PORT" -b "$HOST"
else
  exec node -e "
const fs = require('fs');
const http = require('http');
const path = require('path');
const root = process.cwd();
const types = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm'
};
http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.resolve(root, '.' + urlPath);
  if (filePath === root || (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory())) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    res.writeHead(403, {'Content-Type': 'text/plain; charset=utf-8'});
    return res.end('403 Forbidden');
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'});
      return res.end('404 Not Found');
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    req.method === 'HEAD' ? res.end() : res.end(data);
  });
}).listen($PORT, '$HOST');
"
fi
