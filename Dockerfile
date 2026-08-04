FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/cli/package.json apps/cli/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web-lab/package.json apps/web-lab/package.json
COPY packages/audio-engine/package.json packages/audio-engine/package.json
COPY packages/avatar-engine/package.json packages/avatar-engine/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/renderer-contract/package.json packages/renderer-contract/package.json
COPY packages/renderer-remotion/package.json packages/renderer-remotion/package.json
COPY packages/timeline-engine/package.json packages/timeline-engine/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV EDITUBER_HOST=0.0.0.0 \
  EDITUBER_PORT=4317 \
  EDITUBER_OUTPUT_ROOT=/data/outputs \
  EDITUBER_WEB_ROOT=/app/apps/web-lab/dist \
  NODE_ENV=production

VOLUME ["/data"]
EXPOSE 4317
CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
