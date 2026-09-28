//! Loopback receiver for the desktop "Continue with Roblox" flow.
//!
//! The desktop app opens the system browser at our API, the API talks to
//! Roblox, then redirects the browser to `http://127.0.0.1:<port>/callback`
//! with either `?payload=<json>` (success) or `?error=<code>` (failure).
//! This module is the tiny one-shot HTTP server that catches that redirect.
//!
//! Kept separate from `main.rs` so it can be compiled and tested on its own
//! (see the tests at the bottom).

use serde::Deserialize;
use std::collections::HashMap;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::time::{timeout, Instant};

use crate::api::UserData;

/// What our API puts in `?payload=`. Accepts both camelCase and snake_case
/// key names, so the app keeps working whichever way the API spells them.
#[derive(Debug, Deserialize)]
pub struct CallbackPayload {
    pub user: UserData,
    #[serde(rename = "accessToken", alias = "access_token")]
    pub access_token: String,
    #[serde(default, rename = "refreshToken", alias = "refresh_token")]
    pub refresh_token: Option<String>,
}

/// Wait for the sign-in redirect. Returns the tokens on success, or an
/// error code (e.g. `ROBLOX_DENIED`, `ROBLOX_LOGIN_TIMEOUT`) on failure.
pub async fn wait_for_callback(
    listener: TcpListener,
    total: Duration,
) -> Result<CallbackPayload, String> {
    let deadline = Instant::now() + total;

    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("ROBLOX_LOGIN_TIMEOUT".to_string());
        }
        let mut socket = match timeout(remaining, listener.accept()).await {
            Ok(Ok((socket, _))) => socket,
            Ok(Err(e)) => return Err(format!("ROBLOX_LOGIN_LISTENER_ERROR: {e}")),
            Err(_) => return Err("ROBLOX_LOGIN_TIMEOUT".to_string()),
        };

        // Browsers sometimes open an empty "pre-connect" socket before the
        // real request, and ask for /favicon.ico afterwards. Anything that
        // isn't a real GET /callback is answered and ignored, and we keep
        // waiting rather than treating it as the result.
        let head = match timeout(Duration::from_secs(5), read_request_head(&mut socket)).await {
            Ok(Some(head)) => head,
            _ => continue,
        };
        let (path, query) = split_request_target(&head);
        if path != "/callback" {
            respond(&mut socket, 404, "Not found").await;
            continue;
        }

        return match interpret(&parse_query(query)) {
            Ok(payload) => {
                respond(&mut socket, 200, "Signed in. You can close this window and return to Westside.").await;
                Ok(payload)
            }
            Err(code) => {
                let msg = format!(
                    "Sign-in didn't complete ({}). Return to Westside and try again.",
                    html_escape(code.split(':').next().unwrap_or(""))
                );
                respond(&mut socket, 200, &msg).await;
                Err(code)
            }
        };
    }
}

fn interpret(params: &HashMap<String, String>) -> Result<CallbackPayload, String> {
    if let Some(err) = params.get("error") {
        return Err(err.to_uppercase());
    }
    let raw = params
        .get("payload")
        .ok_or_else(|| "ROBLOX_LOGIN_NO_PAYLOAD".to_string())?;
    serde_json::from_str(raw).map_err(|e| format!("ROBLOX_LOGIN_BAD_PAYLOAD: {e}"))
}

/// Read until the end of the HTTP headers. `None` means an empty connection.
async fn read_request_head(socket: &mut TcpStream) -> Option<String> {
    let mut buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        let n = socket.read(&mut chunk).await.ok()?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() > 64 * 1024 {
            break;
        }
    }
    if buf.is_empty() {
        return None;
    }
    Some(String::from_utf8_lossy(&buf).into_owned())
}

/// `GET /callback?x=1 HTTP/1.1` -> ("/callback", "x=1")
fn split_request_target(head: &str) -> (&str, &str) {
    let line = head.lines().next().unwrap_or("");
    let target = line.split_whitespace().nth(1).unwrap_or("");
    match target.split_once('?') {
        Some((path, query)) => (path, query),
        None => (target, ""),
    }
}

async fn respond(socket: &mut TcpStream, status: u16, message: &str) {
    let reason = if status == 200 { "OK" } else { "Not Found" };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Westside</title></head>\
         <body style=\"font-family:sans-serif;padding:2rem\">{}</body></html>",
        html_escape(message)
    );
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = socket.write_all(response.as_bytes()).await;
    let _ = socket.shutdown().await;
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn parse_query(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter(|s| !s.is_empty())
        .map(|pair| {
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            (percent_decode(k), percent_decode(v))
        })
        .collect()
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3])
                    .ok()
                    .and_then(|h| u8::from_str_radix(h, 16).ok());
                match hex {
                    Some(byte) => {
                        out.push(byte);
                        i += 3;
                    }
                    None => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Exactly what the deployed API sends today (snake_case keys).
    fn api_payload_snake() -> String {
        r#"{"user":{"id":"u-1","email":null,"username":"player_7f2a9c","emailVerified":true,"status":"active","mfaEnabled":false,"robloxUsername":"CoolBuilder2026"},"access_token":"AAA.BBB.CCC","access_token_expires_at":"2026-09-27T00:00:00.000Z","refresh_token":"refresh-xyz"}"#.to_string()
    }

    fn encode(s: &str) -> String {
        s.bytes()
            .map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
                _ => format!("%{:02X}", b),
            })
            .collect()
    }

    async fn send(port: u16, raw: &str) -> String {
        let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        s.write_all(raw.as_bytes()).await.unwrap();
        let mut out = String::new();
        let _ = s.read_to_string(&mut out).await;
        out
    }

    #[tokio::test]
    async fn accepts_the_payload_the_api_really_sends() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let task = tokio::spawn(wait_for_callback(listener, Duration::from_secs(10)));

        let req = format!(
            "GET /callback?payload={} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n\r\n",
            encode(&api_payload_snake())
        );
        let response = send(port, &req).await;
        assert!(response.contains("200 OK") && response.contains("close this window"));

        let got = task.await.unwrap().expect("login should succeed");
        assert_eq!(got.access_token, "AAA.BBB.CCC");
        assert_eq!(got.refresh_token.as_deref(), Some("refresh-xyz"));
        assert_eq!(got.user.roblox_username.as_deref(), Some("CoolBuilder2026"));
        assert_eq!(got.user.email, None);
    }

    #[tokio::test]
    async fn accepts_camel_case_keys_too() {
        let json = r#"{"user":{"id":"u","email":"a@b.co","username":"x","emailVerified":true,"status":"active","mfaEnabled":false},"accessToken":"T","refreshToken":"R"}"#;
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let task = tokio::spawn(wait_for_callback(listener, Duration::from_secs(10)));
        send(port, &format!("GET /callback?payload={} HTTP/1.1\r\n\r\n", encode(json))).await;
        assert_eq!(task.await.unwrap().unwrap().access_token, "T");
    }

    #[tokio::test]
    async fn ignores_empty_preconnect_and_favicon_then_succeeds() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let task = tokio::spawn(wait_for_callback(listener, Duration::from_secs(20)));

        // 1. browser pre-connect: opens a socket and sends nothing, then closes
        drop(TcpStream::connect(("127.0.0.1", port)).await.unwrap());
        // 2. a stray favicon request
        let fav = send(port, "GET /favicon.ico HTTP/1.1\r\n\r\n").await;
        assert!(fav.contains("404"));
        // 3. the real callback
        send(port, &format!("GET /callback?payload={} HTTP/1.1\r\n\r\n", encode(&api_payload_snake()))).await;

        assert_eq!(task.await.unwrap().unwrap().access_token, "AAA.BBB.CCC");
    }

    #[tokio::test]
    async fn handles_a_request_delivered_in_pieces() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let task = tokio::spawn(wait_for_callback(listener, Duration::from_secs(10)));

        let full = format!("GET /callback?payload={} HTTP/1.1\r\nHost: x\r\n\r\n", encode(&api_payload_snake()));
        let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        for piece in full.as_bytes().chunks(40) {
            s.write_all(piece).await.unwrap();
            s.flush().await.unwrap();
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        let mut sink = String::new();
        let _ = s.read_to_string(&mut sink).await;
        assert_eq!(task.await.unwrap().unwrap().access_token, "AAA.BBB.CCC");
    }

    #[tokio::test]
    async fn reports_denied_and_tells_the_browser() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let task = tokio::spawn(wait_for_callback(listener, Duration::from_secs(10)));
        let resp = send(port, "GET /callback?error=roblox_denied HTTP/1.1\r\n\r\n").await;
        assert!(resp.contains("didn't complete") && resp.contains("ROBLOX_DENIED"));
        assert_eq!(task.await.unwrap().unwrap_err(), "ROBLOX_DENIED");
    }

    #[tokio::test]
    async fn bad_payload_is_an_error_not_a_login() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let task = tokio::spawn(wait_for_callback(listener, Duration::from_secs(10)));
        send(port, "GET /callback?payload=%7B%22nope%22%3A1%7D HTTP/1.1\r\n\r\n").await;
        assert!(task.await.unwrap().unwrap_err().starts_with("ROBLOX_LOGIN_BAD_PAYLOAD"));
    }

    #[tokio::test]
    async fn times_out_when_nothing_arrives() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let err = wait_for_callback(listener, Duration::from_millis(300)).await.unwrap_err();
        assert_eq!(err, "ROBLOX_LOGIN_TIMEOUT");
    }

    #[test]
    fn percent_decode_edge_cases() {
        assert_eq!(percent_decode("a%20b+c"), "a b c");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
        assert_eq!(percent_decode("%7B%22k%22%3A1%7D"), "{\"k\":1}");
        assert_eq!(percent_decode("%C3%A9"), "é");
        assert_eq!(percent_decode("%aé"), "%aé"); // must not panic on non-ASCII
    }
}
