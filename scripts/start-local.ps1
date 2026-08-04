$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22 o posterior es obligatorio."
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "FFmpeg es obligatorio y debe estar disponible en PATH."
}

corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build:web
corepack pnpm start:server
