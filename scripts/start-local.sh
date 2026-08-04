#!/usr/bin/env sh
set -eu

command -v node >/dev/null 2>&1 || { echo "Node.js 22 o posterior es obligatorio." >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "FFmpeg es obligatorio y debe estar disponible en PATH." >&2; exit 1; }

corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build:web
exec corepack pnpm start:server
