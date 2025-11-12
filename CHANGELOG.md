# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial TypeScript/OpenTUI conversion
- Full session management (create, switch, kill, rename)
- Project directory scanning
- Fuzzy search with scoring algorithm
- GitHub repository cloning
- Catppuccin color scheme
- Detail panel with full window information
- All keyboard shortcuts (j/k, arrows, 1-9, etc.)

### Changed
- Migrated from Go/Bubble Tea to TypeScript/OpenTUI
- Now requires Bun runtime
- React-based component architecture

### Technical
- Built with OpenTUI and React 19
- Uses Bun for package management and runtime
- TypeScript for type safety

## [0.1.0] - 2025-01-11

### Added
- Initial release of TypeScript version
- Port from Go version with feature parity
- npm package distribution

[Unreleased]: https://github.com/quiet-ghost/mux-sesh/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/quiet-ghost/mux-sesh/releases/tag/v0.1.0
