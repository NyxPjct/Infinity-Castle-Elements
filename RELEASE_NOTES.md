# Infinity Castle Elements — INSANITY 0.0.10

## Player Mastery Update

- More responsive movement: 110 ms of coyote time, faster direction changes, firmer ground braking, and buffered touch/keyboard jumps.
- Cooperative elemental combos: Earth + Air creates a moving, rising platform for four seconds; Light + Darkness creates a protective area for three seconds. Both powers must be active within 320 world pixels; combos have a shared 12-second cooldown and synchronize online.
- All ten guardians now have three ritual stages, changing projectile patterns, visible boss attack windups, and additional arena platforms. Completed stages are checkpoints for the current attempt; death resets the encounter.
- Automatic, Low, Medium, and High graphics settings adjust cosmetic effects while preserving gameplay rules.
- Connection diagnostics show versions, protocol, latency, room, and compatibility, with a reconnect action using the existing 30-second reservation. Reconnection preserves combo lifetimes/cooldowns and restores the completed boss-stage progress bar.
- An optional online daily leaderboard verifies completed runs by replaying their controls on the server. The server computes deaths and time, ranks fewer deaths first, and stores one best result per guest device identity per day. Local daily play remains available offline.
- New UI and canvas text is bundled in all 20 offline languages, with editorial corrections to core terminology. Independent native-speaker review remains pending.
- English README, fresh in-engine captures, and versioned Windows and Android downloads.

## Online compatibility and storage

Deploy the matching **0.0.10 server / protocol 4**. Older incompatible clients cannot join; offline Singleplayer remains available. Ranked sessions and multiplayer reconnect reservations live in memory and do not survive server restarts.

**Railway: attach a persistent volume at `/data` to retain leaderboard history across deployments.** The server reads `RAILWAY_VOLUME_MOUNT_PATH` automatically; `ICE_DATA_DIR` can select another persistent directory. Default unmounted container storage is not guaranteed across deploys. Use one replica and back up `daily-leaderboard.json`.

Daily challenges allow ten minutes of active simulation, including respawn delays, with a 30-minute online session lifetime. The leaderboard retains up to 200 entries per UTC day for 60 days and displays the top 100. Nicknames are public guest names, not verified accounts. Replay verification rejects fabricated scores and unfinished runs; it cannot identify automated or tool-assisted valid inputs.

## Validation

Audits cover all 1,000 levels; language coverage and placeholders; graphics and reduced motion; activities, audio, controls, and campaign isolation; real 2P/4P multiplayer and 30-second reconnect expiry; combo synchronization and boss stages; valid and invalid daily replays; ordered file storage; and Chromium flows including browser/server replay parity, diagnostics, saved graphics settings, offline play, and mobile touch input.
