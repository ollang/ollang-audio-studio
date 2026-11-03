FROM node:24-trixie-slim@sha256:54f84b4cf8432b21aaffd5d3ce8d41e12cea0d10d33c09d2f3c9879d49d6b446 AS build
# Disable download retries while upgrading APT from the pinned base image.
RUN apt-get -o Acquire::Retries=0 update \
    && apt-get -o Acquire::Retries=0 install -y --no-install-recommends --only-upgrade apt libapt-pkg7.0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM build AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310 DATA_DIR=/data
# Package installation is a build-time operation. The server starts directly with
# Node, so the runtime does not ship npm's separate dependency tree.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    && mkdir -p /data && chown node:node /data
USER node
EXPOSE 4310
CMD ["node", "--import", "tsx", "server/index.ts"]
