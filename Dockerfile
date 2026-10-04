FROM rust:1.90-bookworm AS rust-builder
WORKDIR /src
COPY core/Cargo.toml core/Cargo.lock ./core/
COPY third_party/moviebox-tui/src/Cargo.toml third_party/moviebox-tui/src/Cargo.lock ./third_party/moviebox-tui/src/
COPY third_party/moviebox-tui/src/README.md third_party/moviebox-tui/src/LICENSE-MIT third_party/moviebox-tui/src/LICENSE-APACHE ./third_party/moviebox-tui/src/
COPY core/src ./core/src
COPY third_party/moviebox-tui/src/src ./third_party/moviebox-tui/src/src
RUN cargo build --release --manifest-path core/Cargo.toml

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY server/src ./server/src
COPY web ./web
COPY scripts/render-start.sh ./scripts/render-start.sh
COPY --from=rust-builder /src/core/target/release/free-core ./core/free-core
RUN chmod +x ./scripts/render-start.sh
EXPOSE 3000
CMD ["/app/scripts/render-start.sh"]
