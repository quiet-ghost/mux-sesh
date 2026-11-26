# Diagnostic capture boundary

DEV-308 replaces repeated raw-error formatting with `DiagnosticReport.capture` in
`src/util/errors.ts`. The React error boundary and fatal handler capture once. The error screen,
clipboard action, browser action, and fatal output consume the frozen report's strings.

## Capture policy

- Capture thrown strings and own data properties of native Errors: message/name, stack, and cause.
- Other values receive a type-only explanation. Object fields, serialization hooks, accessors,
  and proxy traps are not evaluated to produce diagnostic text.
- Runtime context contains only app/Bun versions, OS, architecture, terminal identification, and
  backend identification. It uses already-known runtime values; capture runs no diagnostic commands.
- Credential assignments, authorization/cookie headers, common token formats, JWTs, and private-key
  blocks are redacted. URL-bearing and private-path-bearing line tails are conservatively omitted.
  Plain application source paths retain an `‹app›/src/` prefix without the installation directory.
- Normalize compatibility characters, remove terminal control sequences and invisible format
  controls, and display Markdown delimiters as inert Unicode characters.
- Context precedes traces so oversized traces cannot consume the entire metadata budget.
- Unexpected capture failure produces a static report with omitted raw details and a blank issue URL.

## Limits

Text limits are UTF-16 code units; strings remain well formed after clipping.

| Value                           |                  Limit |
| ------------------------------- | ---------------------: |
| Input examined per text field   |                 16,384 |
| Summary                         |                    240 |
| Message per error               |                  1,024 |
| Primary stack                   |                  6,000 |
| Each cause stack                |                  2,000 |
| Causes beyond the primary error |                      3 |
| Each runtime context field      |                    200 |
| Captured diagnostic text        |                 12,000 |
| Encoded issue URL               | 6,000 ASCII characters |

Cause cycles and capture truncation are marked. URL truncation has its own flag; copying retains
the full bounded capture. Reports stay in memory until an explicit copy/open action.

Redaction is conservative and pattern-based; arbitrary free text still needs local review.
Opening a prefilled URL sends the shown diagnostics to GitHub and browser history before issue
submission.

## Review before sharing

DEV-339 makes `o` a local review step. The crash screen states that confirming sends the report
shown below to github.com through the browser, that the URL stays in browser history, and whether
the browser copy is shortened (`issueUrlTruncated`). Only `y`/Enter opens `report.issueUrl`;
`n`/Esc cancels with nothing sent, and Esc there does not quit. Sharing state is one discriminated
union (idle, confirming, cancelled, opening, opened, open-failed, report-copied).

Outcomes are reported as they are known. `writeClipboard` returns a tagged `ClipboardResult`: an
OSC 52 write is `sent-unconfirmed` because terminals never acknowledge it, so the screen says the
report was sent to the terminal clipboard and the terminal may not support it. `copied` is only
shown when an adapter can confirm a copy. A failed browser launch copies the issue URL and reports
that copy's actual result; without a clipboard it points to `c`, and a shortened URL always notes
that `c` copies the full local report.
