# NEAR Account Lookup

VS Code extension for fast account inspection directly in the editor.

## Features

- Detects NEAR named and implicit account IDs in code/text.
- Hover popup with:
  - account balance,
  - storage usage,
  - network indicator,
  - recent activity summary (last transactions).
- Explorer integration:
  - direct link in hover,
  - clickable account IDs in files.
- Network switching between `mainnet` and `testnet`.

## Usage

1. Open any file with an account ID (for example: `alice.near`).
2. Hover the account ID to see details.
3. Click the account ID or the hover explorer link to open NEAR Explorer.

## Configuration

- `nearAccountLookup.network`: `mainnet` or `testnet`.

## License

MIT
