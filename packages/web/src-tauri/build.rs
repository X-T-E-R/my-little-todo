use std::{
    env,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

fn main() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=../../../crates/server");
    println!("cargo:rerun-if-changed=../../../crates/server-bin");
    println!("cargo:rerun-if-env-changed=PROFILE");
    println!("cargo:rerun-if-env-changed=TARGET");
    println!("cargo:rerun-if-env-changed=HOST");
    println!("cargo:rerun-if-env-changed=CARGO");

    if let Err(error) = prepare_embedded_host_sidecar() {
        panic!("failed to prepare embedded host sidecar: {}", error);
    }

    tauri_build::build()
}

fn prepare_embedded_host_sidecar() -> Result<(), String> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").map_err(|e| e.to_string())?);
    let workspace_root = manifest_dir
        .join("..")
        .join("..")
        .join("..")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let profile = env::var("PROFILE").map_err(|e| e.to_string())?;
    let target = env::var("TARGET").map_err(|e| e.to_string())?;
    let host = env::var("HOST").unwrap_or_default();
    println!("cargo:rustc-env=MLT_TAURI_TARGET={}", target);
    let sidecar_target_dir = manifest_dir.join("target").join("embedded-host-sidecar");
    let binaries_dir = manifest_dir.join("binaries");
    fs::create_dir_all(&binaries_dir).map_err(|e| e.to_string())?;
    let destination = binaries_dir.join(format!(
        "mlt-server-{}{}",
        target,
        executable_suffix()
    ));

    if profile != "release" {
        if destination.exists() {
            return Ok(());
        }
        if let Some(source) = resolve_dev_sidecar_binary(&workspace_root, &manifest_dir) {
            fs::copy(&source, &destination).map_err(|e| e.to_string())?;
            return Ok(());
        }
        println!(
            "cargo:warning=embedded host sidecar not prepared for debug profile; build mlt-server-bin manually before starting the desktop host"
        );
        return Ok(());
    }

    let cargo = env::var("CARGO").unwrap_or_else(|_| "cargo".to_string());
    let mut command = Command::new(cargo);
    command.arg("build").arg("-p").arg("mlt-server-bin");
    command.arg("--release");
    if !target.is_empty() && target != host {
        command.arg("--target").arg(&target);
    }
    command.arg("--target-dir").arg(&sidecar_target_dir);
    command.current_dir(&workspace_root);

    let status = command.status().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("sidecar build exited with status {}", status));
    }

    let source = resolve_sidecar_binary(&sidecar_target_dir, &profile, &target)
        .ok_or_else(|| "built sidecar binary was not found".to_string())?;
    fs::copy(&source, &destination).map_err(|e| e.to_string())?;
    Ok(())
}

fn resolve_sidecar_binary(target_dir: &Path, profile: &str, target: &str) -> Option<PathBuf> {
    let candidates = [
        target_dir
            .join(profile)
            .join(format!("mlt-server{}", executable_suffix())),
        target_dir
            .join(target)
            .join(profile)
            .join(format!("mlt-server{}", executable_suffix())),
    ];
    candidates.into_iter().find(|candidate| candidate.exists())
}

fn resolve_dev_sidecar_binary(workspace_root: &Path, manifest_dir: &Path) -> Option<PathBuf> {
    let candidates = [
        workspace_root
            .join("target")
            .join("debug")
            .join(format!("mlt-server{}", executable_suffix())),
        workspace_root
            .join("target")
            .join("release")
            .join(format!("mlt-server{}", executable_suffix())),
        manifest_dir
            .join("target")
            .join("debug")
            .join(format!("mlt-server{}", executable_suffix())),
        manifest_dir
            .join("target")
            .join("release")
            .join(format!("mlt-server{}", executable_suffix())),
    ];
    candidates.into_iter().find(|candidate| candidate.exists())
}

fn executable_suffix() -> &'static str {
    if cfg!(windows) {
        ".exe"
    } else {
        ""
    }
}
