#!/bin/sh
# Probe candidate public routes before an atomic release swap.
set -eu

mode=${1:?probe mode is required}
public_host=__SIGUA_ARMOR_HOST__

case "$mode" in
  health)
    wget \
      -T 3 \
      -t 1 \
      -q \
      --header="X-Sigua-Origin-Auth: ${SIGUA_ORIGIN_AUTH_SECRET}" \
      -O /dev/null \
      "http://${public_host}:8080/healthz"
    ;;
  admin-status)
    output=$(
      wget \
        -T 5 \
        -t 1 \
        -S \
        --header="X-Sigua-Origin-Auth: ${SIGUA_ORIGIN_AUTH_SECRET}" \
        -O /dev/null \
        "http://${public_host}:8080/__admin/content/session" 2>&1 ||
        true
    )
    printf '%s\n' "$output" |
      awk '$1 ~ /^HTTP\/1\.[01]$/ { code=$2 } END { print code }'
    ;;
  *)
    printf 'unsupported probe mode: %s\n' "$mode" >&2
    exit 2
    ;;
esac
