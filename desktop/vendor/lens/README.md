# Lens daemon — vendoring slot

The desktop app's `lens-client.js` looks here first for the on-device capture
daemon: `desktop/vendor/lens/lens.exe` (Windows) or `desktop/vendor/lens/lens`
(macOS/Linux). `electron-builder` ships this dir to `resources/lens/` (see
`desktop/package.json` → `build.extraResources`). When a binary is present,
`lensStatus()` reports `installed: true` and Settings → Capture turns on.

## Why it's empty right now

Lens is **Cadence**, a fork of screenpipe (`C:\Users\PC\lens`, a multi-crate
Rust workspace) — framed as an *internal team-capture experiment*. Its
consumer-Electron integration was **deferred (ADR 0013)**: the ~50 MB capture
binary caused onboarding + OS-permission (TCC) pain with no end-to-end value yet.
So the app intentionally degrades to "Lens engine not detected" until a binary
is dropped here. **Do not ship a built binary into the consumer app without
re-confirming ADR 0013** (size + permissions tradeoff).

## To enable it (when the team decides to ship Lens)

1. Install the Rust toolchain (`rustup`) + the MSVC build tools on Windows
   (or Xcode CLT on macOS).
2. Build the daemon from the lens repo:
   ```
   cd C:\Users\PC\lens\daemon
   cargo build --release --bin <daemon-bin>   # see crates/*/Cargo.toml for the bin name
   ```
3. Copy the built binary here, renamed to the expected name:
   ```
   copy target\release\<daemon-bin>.exe  C:\Users\PC\cloud\desktop\vendor\lens\lens.exe
   ```
4. Relaunch the desktop app — `lensStatus()` flips to installed; Settings →
   Capture + the Record-routine pill light up. The loopback API the client
   expects is documented in `lens-client.js`.

Until then, capture features show a clean "runs in the desktop app / engine not
detected" state — by design.
