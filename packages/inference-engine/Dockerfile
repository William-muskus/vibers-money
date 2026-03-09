# Vibers inference engine — OpenAI-compatible API (Rust)
# Build from repo root: docker build -f packages/inference-engine/Dockerfile -t vibers-inference .
# Default image uses CPU Candle; for GPU use a CUDA base image and --features candle,cuda (see README).
FROM rust:1-bookworm AS builder
WORKDIR /app
COPY packages/inference-engine/Cargo.toml ./
COPY packages/inference-engine/src ./src
RUN cargo build --release --features candle

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
RUN groupadd -r app && useradd -r -g app app
WORKDIR /app
COPY --from=builder /app/target/release/vibers-inference /app/vibers-inference
COPY packages/inference-engine/configs ./configs
RUN chown -R app:app /app
USER app
ENV PORT=8080
EXPOSE 8080
CMD ["/app/vibers-inference", "--port", "8080", "--config", "configs/roles.toml", "--log-json"]
