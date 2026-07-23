# Security and Privacy Controls

## Trust boundaries

Uploaded files, EPUB/DOCX package metadata, imported HTML, document text, and user prompts are untrusted. They are parsed as data only. The application does not execute macros, JavaScript, embedded commands, document instructions, or imported page resources.

## Upload controls

- Accept only PDF, DOCX, and EPUB extensions and independently sniff their signatures/package structure.
- Reject empty files, executables, encrypted ZIP containers, unsafe compression ratios, excessive archive entry counts, and configured size-limit violations.
- Store originals under random UUID object keys, never user filenames or paths.
- Parse in the worker with a configured timeout. Production should additionally run the stored object through a managed malware scanner or ClamAV quarantine job before processing; this repository does not claim an antivirus engine is bundled.
- DRM-protected EPUB content is refused. OCR and macros are not executed.

## URL import controls

- Allow only HTTP/HTTPS on standard ports without embedded credentials.
- Resolve and reject loopback, private, link-local, reserved, multicast, unspecified, and metadata-service targets.
- Repeat validation after each redirect, cap redirects, response bytes, and timeout, enforce an HTML content-type allowlist, and compare the connected peer address when the transport exposes it.
- Remove active/embedded elements and sanitize allowed markup. Imported scripts and external resources are never executed.

## Authorization and data isolation

All document, version, block, annotation, keyword, chunk, chat, citation, and
derived-image reads resolve ownership from an authenticated, hashed database
session. Passwords use Argon2id. Opaque session and CSRF tokens are stored only
as hashes; the session cookie is HttpOnly, SameSite=Lax, and Secure in
production. Unsafe authenticated requests require a matching CSRF cookie,
header, and server-side session hash. Database foreign keys cascade
user-owned rows on account deletion; the document service removes every
original object version before deleting metadata.

## AI controls

- Document content is labelled untrusted in the system instruction and is evidence, not authority.
- Direct prompt/secret/cross-user/tool-execution requests are refused.
- Answers require backend-validated citation labels or return a no-answer response.
- Question length, provider timeouts, context selection, and per-owner Redis rate limits bound resource use.
- API keys stay in environment variables. Logs contain identifiers, status, duration, model/token/cost metadata where available, but not full private document or prompt text.

## Privacy and retention

Delete removes the original object and database-owned derived pages, blocks, annotations, keywords, chunks/embeddings, sessions, messages, and citations through ownership checks and cascading foreign keys. Backups can retain deleted data until their configured retention expires; production policy must disclose that period. Never place real documents, prompts, API keys, or database dumps in CI artifacts or evaluation fixtures.

## Required production controls outside this repository

- External security review of authentication, migration, and tenant isolation.
- TLS, encrypted managed storage, secret manager, least-privilege service identities, and private service networking.
- Malware quarantine/scanning, WAF/ingress limits, dependency/container scanning, audit retention, and incident response ownership.
- Scheduled restore tests and deletion/retention verification.
