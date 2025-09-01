FROM denoland/deno:debian-2.4.5 AS build
WORKDIR /src
COPY ./bdl-ts ./bdl-ts
COPY ./standards ./standards
RUN deno compile -o bdlc -A --unstable-raw-imports ./bdl-ts/src/cli/bdlc.ts

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /src/bdlc /usr/local/bin/bdlc
ENTRYPOINT ["bdlc"]
