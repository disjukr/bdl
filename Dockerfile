FROM denoland/deno:debian-2.4.5 AS build
WORKDIR /src
COPY ./bdl-ts ./bdl-ts
COPY ./standards ./standards
ARG TARGETARCH
RUN case "$TARGETARCH" in \
      amd64)  T="x86_64-unknown-linux-gnu" ;; \
      arm64)  T="aarch64-unknown-linux-gnu" ;; \
      *) echo "unsupported arch: $TARGETARCH" ; exit 1 ;; \
    esac && \
    deno compile --target "$T" -o bdlc -A --unstable-raw-imports ./bdl-ts/cli/bdlc.ts

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /src/bdlc /usr/local/bin/bdlc
ENTRYPOINT ["bdlc"]
