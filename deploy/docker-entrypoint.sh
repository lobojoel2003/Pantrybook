#!/bin/sh
# Make sure the data folder is writable, then drop root privileges.
# Hosts such as Fly.io and Render mount volumes owned by root.
set -e

DATA_DIR="${PANTRYBOOK_DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
	mkdir -p "$DATA_DIR"
	chown node:node "$DATA_DIR"
	find "$DATA_DIR" -maxdepth 1 -name 'pantrybook.db*' -exec chown node:node {} + 2>/dev/null || true
	exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
