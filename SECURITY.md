# Security Policy

## Scope

3MF Color Customizer is a **100% client-side** web app. There is no backend,
no telemetry, and no network calls after the initial page load — every 3MF
file you open stays in your browser. That means most classical web-app threats
(server-side injection, credential theft, etc.) do not apply.

What *is* in scope:

- Parser vulnerabilities in `src/lib/parse3MF.ts` that could be triggered by a
  crafted `.3mf` file (e.g. zip bombs, XML entity expansion, unbounded
  recursion, memory exhaustion).
- XSS or HTML-injection via filenames or XML content rendered in the UI.
- Supply-chain issues in dependencies that would ship malicious code to users
  of the hosted demo.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, open a
[GitHub private security advisory](https://github.com/SamiSalah221/3mf-to-glb/security/advisories/new)
for this repository. Include:

1. A description of the issue and its impact.
2. Steps to reproduce (or a minimal `.3mf` repro file).
3. Your disclosure-timeline preferences.

I'll acknowledge receipt within 7 days and work with you on a fix and
coordinated disclosure.

## Supported versions

Only the latest `main` branch and most recent release are supported. Please
test against the live demo at
<https://samisalah221.github.io/3mf-to-glb/> before filing.
