FROM node:24-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @disjukr/bdl-runtime build && pnpm --filter bdl build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /src /app
ENTRYPOINT ["node", "/app/bdl-ts/dist/cli/bdlc.js"]
