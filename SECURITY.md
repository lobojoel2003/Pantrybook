# Security policy

Pantrybook stores personal information about families who rely on food assistance. We take
reports seriously and appreciate responsible disclosure.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| < 1.0   | No        |

Security fixes are released as patch versions. Run the latest release and enable automatic image
updates where you can.

## Reporting a vulnerability

Please **do not open a public issue**. Instead, use GitHub's private
[security advisory form](https://github.com/lobojoel2003/Pantrybook/security/advisories/new).

Include what you found, how to reproduce it, and the impact you expect. You will get an
acknowledgement within a few days. We will keep you updated, credit you in the release notes if you
wish, and publish an advisory once a fix is available.

## Hardening checklist for operators

- Serve Pantrybook over HTTPS (see the Caddy profile in `docker-compose.yml`).
- Give every volunteer their own account and turn accounts off when people leave.
- Keep regular backups somewhere private; they contain personal information.
- Keep the server and the Pantrybook image up to date.
