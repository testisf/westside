fn main() {
    // Force rebuild when WESTSIDE_API_URL changes so option_env! picks up new values
    println!("cargo:rerun-if-env-changed=WESTSIDE_API_URL");
    tauri_build::build()
}
