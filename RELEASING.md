# Preparing a GitHub release

The current candidate is **0.3.4**. These commands build and check files locally;
they do not commit, push, pull or publish a GitHub release.

## Prepare the source repository

Run `npm run release:source` to produce a source folder under `release/source/`.
It contains a hash-verified allowlist of source, tests, assets and public docs.
It excludes Git metadata, `.env`, credentials, local snapshots, exports,
dependencies and generated build material. Use that folder's contents as the
starting point for a **separate project-only repository**. Do not reuse an
enclosing home-directory repository or its history.

After you create your intended repository, inspect it with read-only commands:

```powershell
git rev-parse --show-toplevel
git status --short
git ls-files
git ls-files --cached --ignored --exclude-standard
npm run security:check
```

The top-level path must be the Allowance repository. The tracked-file listing
must contain only intended project files; the last Git listing must be empty.
Review your Git author name/email too: future commits can disclose those values
even when source files are clean. Use your chosen public identity or GitHub's
private commit email. No Git configuration is changed by these scripts.

Scan the source and history with a separately installed, checksum-verified
[Gitleaks release](https://github.com/gitleaks/gitleaks/releases):

```powershell
gitleaks dir . --redact --report-format json --report-path release/security/gitleaks-source.json
gitleaks git . --log-opts="--all" --redact --report-format json --report-path release/security/gitleaks-history.json
```

Run the Git scan only inside the intended repository. A clean working tree does
not establish that older commits are clean. Enable GitHub push protection and
private vulnerability reporting when configuring the repository; GitHub's
[secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)
also checks repository history. No scanner guarantees detection of arbitrary
personal information. Review any images or documents you add after the audit.

## Validate and build

Use Windows x64 with Node.js 22.17 or newer:

```powershell
npm ci
Copy-Item .env.example .env
npm test
npm run test:ui
npm run test:security
npm run security:check
npm audit
npm run dist
```

The `.env` is optional, blank by default, local to the development launcher and
excluded from every release package. No service API keys are needed. All
renderer environment injection is disabled. Never store signing secrets in
frontend code, package metadata or an update URL.

`npm run dist` produces an NSIS installer and a portable executable in `release/`
with publishing explicitly disabled. It is suitable for local validation.
To produce a signed release, supply `CSC_LINK` and `CSC_KEY_PASSWORD` from your
secure environment/secret store and run `npm run dist:signed`. Keep the
certificate outside the project. That command requires a signature and fails
if signing cannot be completed. Verify the signature with
`Get-AuthenticodeSignature` before sharing the binary.

The manual **Release candidate checks** GitHub Actions workflow runs only when
you dispatch it. It uses read-only repository permissions and immutable action
revisions, validates the source and builds **unsigned test artifacts**. It never
creates a release. The workflow does not replace a full-history secret scan or
your signing setup. Only the two named executable outputs are uploaded.

## Optional updates

The default build has no update feed. Decide the public GitHub repository and
signing identity before enabling updates. A generic feed needs the installer,
its blockmap and `latest.yml` at one public HTTPS location. You can set matching
Electron Builder `extraMetadata.allowanceUpdateUrl` and `publish` options in a
local packaging command/configuration. The URL is public build metadata, never
a place for a token. Runtime `ALLOWANCE_UPDATE_URL` can override it; credential
URLs, HTTP, local IP addresses, query strings and fragments are rejected.

Checks run at startup and every six hours only in a packaged app with a valid
feed. Downloads are automatic; installation requires the user to select the
restart/install action. Ordinary app exit does not install a downloaded update.
A configured production feed and `npm run dist:signed` must ship together.
Validate a signed upgrade from the previous version before enabling the feed.

## Files to publish manually

Use the audited source folder for your source repository. For a binary release,
select the verified, signed installer/portable executable and a SHA-256 checksum
file. Include update metadata only when an update feed has been configured and
tested. Never upload the entire `release/` directory: it also contains local
build configuration, debug logs, unpacked files, test screenshots and audit
reports. Keep `.env`, certificates, settings backups and personal usage exports
private. Re-run checks if you change any source or add files after this review.

## Local review artifacts

Versioned candidate directories keep one current build and its previous
comparison build. Older generated installers can be archived outside the
project after the current build is verified. Keep source backups outside the
public repository until version control is established. The local design
review contains machine-specific paths and is excluded; the public
[implementation log](DESIGN_REVIEW_IMPLEMENTATION.md) records changes and
remaining manual release checks without local identities.
