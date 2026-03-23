use mlt_server::config::ServerConfig;

#[tokio::main]
async fn main() {
    let config = ServerConfig::load(None);

    println!("My Little Todo Server v0.1.0");
    println!("  Port:      {}", config.port);
    println!("  DB:        {:?}", config.db_type);
    println!("  Auth:      {:?}", config.auth_mode);
    println!("  Data dir:  {}", config.data_dir);

    if let Err(e) = mlt_server::start(config).await {
        eprintln!("Fatal error: {}", e);
        std::process::exit(1);
    }
}
