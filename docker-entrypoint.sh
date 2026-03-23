#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/app/data}"

# When running as root (default), fix data dir ownership and drop to mlt user
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown mlt:mlt "$DATA_DIR"
  exec gosu mlt "$@"
fi

exec "$@"
