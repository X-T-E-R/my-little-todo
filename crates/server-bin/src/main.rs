use mlt_server::config::ServerConfig;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const GIT_HASH: &str = env!("GIT_HASH");

#[tokio::main]
async fn main() {
    let config = ServerConfig::load(None);

    println!("My Little Todo Server v{} ({})", VERSION, GIT_HASH);
    println!("  Port:      {}", config.port);
    println!("  DB:        {:?}", config.db_type);
    println!("  Auth:      {:?}", config.auth_mode);
    println!("  Data dir:  {}", config.data_dir);

    if let Err(e) = mlt_server::start(config, VERSION, GIT_HASH).await {
        eprintln!("Fatal error: {}", e);
        std::process::exit(1);
    }
}
