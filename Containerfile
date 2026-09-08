# Pin the official multi-platform base; keep build/runtime on the same musl ABI.
FROM docker.io/library/node:22.23.2-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS node_base

RUN apk upgrade --no-cache

FROM node_base AS dependencies

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /application

RUN npm install --global pnpm@10.33.2

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node_base AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /application

# BusyBox account/file utilities expose short flags rather than GNU long options.
RUN addgroup -g 10001 application \
    && adduser -u 10001 -G application -D -H application \
    && rm -rf /usr/local/lib/node_modules /opt/yarn* \
        /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=build --chown=application:application /application/.next ./.next
COPY --from=build --chown=application:application /application/drizzle ./drizzle
COPY --from=build --chown=application:application /application/node_modules ./node_modules
COPY --from=build --chown=application:application /application/package.json ./package.json
COPY --from=build --chown=application:application /application/next.config.ts ./next.config.ts
COPY --from=build --chown=application:application /application/src ./src

USER application
EXPOSE 3000

CMD ["node", "src/container.ts"]
