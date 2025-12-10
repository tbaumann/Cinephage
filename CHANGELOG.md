# Changelog

All notable changes to Cinephage will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Features currently in development

### Changed

- Improvements to existing functionality

### Fixed

- Bug fixes in progress

---

## [0.1.0] - 2025-XX-XX

Initial public preview release.

### Added

#### Core Features

- TMDB integration for movie and TV show discovery
- Multi-indexer search with 12+ built-in indexer definitions
- Smart quality scoring with four built-in profiles (Best, Efficient, Compact, Micro)
- qBittorrent integration for automated downloads
- Library management with automatic file organization
- Real-time filesystem watching for library updates

#### Indexer System

- Native Cardigann-compatible YAML indexer engine
- Built-in indexers: YTS, EZTV, 1337x, TorrentGalaxy, Nyaa, SubsPlease, Anidex, Solidtorrents, LimeTorrents, MagnetDL, BitSearch, BTDig, TheRARBG
- Torznab protocol support for Prowlarr/Jackett integration
- Per-host rate limiting
- Automatic health tracking with exponential backoff
- Cloudflare detection

#### Monitoring and Automation

- Missing content search task
- Quality upgrade monitoring
- New episode detection
- Cutoff unmet search
- Pending release cleanup
- Configurable task intervals
- Database persistence of task state

#### Subtitle Management

- Eight subtitle providers: OpenSubtitles, Podnapisi, Subscene, Addic7ed, SubDL, YIFY Subtitles, Gestdown, Subf2m
- 150+ language support with regional variants
- Language profile management
- Automatic subtitle search on import
- Provider priority ordering
- Download scoring and ranking

#### Streaming Integration

- .strm file generation for external media players
- Multiple streaming provider support
- AniList integration for anime metadata
- CORS proxy for cross-origin content

#### User Interface

- Modern SvelteKit 5 + Svelte 5 frontend
- TailwindCSS 4 + DaisyUI styling
- Responsive design
- Dark/light theme support
- Real-time download progress tracking

#### Developer Experience

- TypeScript throughout
- Drizzle ORM with SQLite
- ESLint + Prettier code quality
- Vitest testing framework
- Hot reload development server

### Technical Details

- Node.js 20+ required
- SQLite database (no external database needed)
- Environment-based configuration
- Systemd service file included
- Structured logging with rotation

---

## Version History

Future releases will be documented here following the same format.

### Versioning Scheme

- **Major** (X.0.0): Breaking changes, major feature overhauls
- **Minor** (0.X.0): New features, non-breaking enhancements
- **Patch** (0.0.X): Bug fixes, security updates, minor improvements

### Release Cadence

During the preview phase, releases may be frequent as features stabilize. After the 1.0 release, we will follow a more structured release schedule.
