//! Vibers inference engine — OpenAI-compatible API (GET /v1/models, POST /v1/chat/completions).
//! CLI: --config, --port, --log-json. PORT env overrides --port when set.
use anyhow::Result;
use clap::Parser;
use std::path::Path;
use std::net::SocketAddr;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[derive(Parser, Debug)]
#[command(name = "vibers-inference")]
struct Args {
    /// Path to roles config (e.g. configs/roles.toml)
    #[arg(long, default_value = "configs/roles.toml")]
    config: String,

    /// Port to bind (overridden by PORT env when set)
    #[arg(long, short, default_value = "8080")]
    port: u16,

    /// Emit one JSON object per log line (for LOG_JSON=1 compatibility)
    #[arg(long)]
    log_json: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    if args.log_json {
        tracing_subscriber::registry()
            .with(EnvFilter::from_default_env().add_directive(tracing::Level::INFO.into()))
            .with(tracing_subscriber::fmt::layer().json().flatten_event(true))
            .init();
    } else {
        tracing_subscriber::registry()
            .with(EnvFilter::from_default_env().add_directive(tracing::Level::INFO.into()))
            .with(tracing_subscriber::fmt::layer())
            .init();
    }

    let port = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(args.port);
    let roles_config = vibers_inference::config::load_roles_config(Path::new(&args.config));
    let app = vibers_inference::server::app(roles_config);
    let addr: SocketAddr = ([0, 0, 0, 0], port).into();
    tracing::info!(%addr, "listening");
    axum::serve(tokio::net::TcpListener::bind(addr).await?, app).await?;
    Ok(())
}
