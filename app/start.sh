#!/bin/sh
cd "$(dirname "$0")"
if command -v node >/dev/null; then node server.js
else python3 -m http.server 3000; fi
