FROM docker.io/library/node:22.23.2-bookworm-slim AS dependencies

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /application

RUN npm install --global pnpm@10.33.2

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM docker.io/library/node:22.23.2-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /application

RUN groupadd --gid 10001 application \
    && useradd --uid 10001 --gid application --no-create-home application

COPY --from=build --chown=application:application /application/.next ./.next
COPY --from=build --chown=application:application /application/drizzle ./drizzle
COPY --from=build --chown=application:application /application/node_modules ./node_modules
COPY --from=build --chown=application:application /application/package.json ./package.json
COPY --from=build --chown=application:application /application/src ./src

USER application
EXPOSE 3000

CMD ["node", "src/server.ts"]
