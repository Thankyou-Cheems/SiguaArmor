#!/bin/sh
# Values in this template are sealed by build-unified-public-delta.mjs.
set -eu

ROOT=/opt/stacks/sigua-armor-public
RELEASE_ID=20260727-local-gate-e71ad92-3b127fe4
INCOMING="$ROOT/.incoming/$RELEASE_ID"
ARCHIVE="$INCOMING/unified-public-delta-3b127fe4.tar.gz"
DELTA="$INCOMING/delta"
CANDIDATE="$ROOT/release.candidate-$RELEASE_ID"
ROLLBACK="$ROOT/release.rollback-$RELEASE_ID"
FAILED="$ROOT/release.failed-$RELEASE_ID"
RECEIPT="$INCOMING/apply-receipt.json"
VERIFY_SCRIPT="$INCOMING/verify-candidate-receipt.mjs"
PUBLIC_PROBE="$INCOMING/preflight-public-probe.sh"
EXPECTED_ARCHIVE=8d95de16217ab2cd4801f706305219d5858c9b500f01a15c483d2f9e73272ee0
EXPECTED_BASE=5618e730daa43451eed46efeeacf15c35bf02378fb1897cf2bfe82c3a474c3c8
EXPECTED_TARGET=3b127fe4a9ed7df602115c7e54ccf6b5a3b8f5348648086e8971002d67f247b9
EXPECTED_ENTRIES=15344
EXPECTED_TOTAL_BYTES=1964695342
EXPECTED_COMMIT=e71ad9294876358503b2e2841dae3bf7065a9b33
PREFLIGHT_RUNTIME=sigua-international-candidate-3b127fe4
PREFLIGHT_ADMIN=sigua-content-admin-candidate-3b127fe4
PREFLIGHT_PUBLIC=sigua-public-candidate-3b127fe4
NODE_IMAGE=node:20.18.2-alpine3.21@sha256:2cd2a6f4cb37cf8a007d5f1e9aef090ade6b62974c7a274098c390599e8c72b4
CADDY_IMAGE=caddy:2@sha256:ec18ee54aab3315c22e25f3b2babda73ff8007d39b13b3bd1bfffa2f0444c7d9
SWAPPED=0

wait_healthy() {
  container=$1
  attempt=0
  while [ "$attempt" -lt 60 ]; do
    container_state=$(
      docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "$container" 2>/dev/null ||
        true
    )
    if [ "$container_state" = healthy ]; then
      return 0
    fi
    if \
      [ "$container_state" = unhealthy ] ||
      [ "$container_state" = exited ] ||
      [ "$container_state" = dead ]
    then
      docker logs --tail 120 "$container" >&2 || true
      return 1
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  docker logs --tail 120 "$container" >&2 || true
  return 1
}

wait_http() {
  container=$1
  port=$2
  attempt=0
  while [ "$attempt" -lt 45 ]; do
    if docker exec "$container" wget \
      -T 3 \
      -t 1 \
      -q \
      -O /dev/null \
      "http://127.0.0.1:${port}/healthz"
    then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  docker logs --tail 120 "$container" >&2 || true
  return 1
}

wait_public_health() {
  container=$1
  attempt=0
  while [ "$attempt" -lt 45 ]; do
    if docker exec -i "$container" sh -s -- health < "$PUBLIC_PROBE"; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  docker logs --tail 120 "$container" >&2 || true
  return 1
}

admin_unauthenticated_status() {
  admin_container=$1
  docker exec -i "$admin_container" sh -s -- admin-status < "$PUBLIC_PROBE"
}

wait_admin_unauthenticated() {
  admin_container=$1
  attempt=0
  observed_code=
  while [ "$attempt" -lt 45 ]; do
    observed_code=$(admin_unauthenticated_status "$admin_container")
    if [ "$observed_code" = 401 ]; then
      printf '%s\n' "$observed_code"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  printf 'admin route did not reach 401; last status=%s\n' "$observed_code" >&2
  return 1
}

cleanup_preflight() {
  docker rm -f \
    "$PREFLIGHT_PUBLIC" \
    "$PREFLIGHT_RUNTIME" \
    "$PREFLIGHT_ADMIN" \
    >/dev/null 2>&1 ||
    true
}

rollback_release() {
  set +e
  cd "$ROOT" || return
  docker compose stop sigua-public sigua-content-admin sigua-international >/dev/null 2>&1 || true
  if [ -d release ] && [ ! -e "$FAILED" ]; then
    mv release "$FAILED"
  fi
  if [ -d "$ROLLBACK" ]; then
    mv "$ROLLBACK" release
  fi
  docker compose up -d --no-deps --force-recreate sigua-international >/dev/null 2>&1 || true
  wait_healthy sigua-international || true
  docker compose up -d --no-deps --force-recreate sigua-content-admin >/dev/null 2>&1 || true
  wait_healthy sigua-content-admin || true
  docker compose up -d --no-deps --force-recreate sigua-public >/dev/null 2>&1 || true
  wait_healthy sigua-public || true
}

on_exit() {
  activation_exit_code=$?
  trap - EXIT HUP INT TERM
  cleanup_preflight
  if [ "$activation_exit_code" -ne 0 ]; then
    if [ "$SWAPPED" -eq 1 ]; then
      rollback_release
    elif [ -d "$CANDIDATE" ] && [ ! -e "$FAILED" ]; then
      mv "$CANDIDATE" "$FAILED"
    fi
  fi
  exit "$activation_exit_code"
}

trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

cd "$ROOT"
test "$(sha256sum release/release-manifest.json | awk '{print $1}')" = "$EXPECTED_BASE"
test -f "$ARCHIVE"
test "$(sha256sum "$ARCHIVE" | awk '{print $1}')" = "$EXPECTED_ARCHIVE"
test -f "$VERIFY_SCRIPT"
test -f "$PUBLIC_PROBE"
for path in "$DELTA" "$CANDIDATE" "$ROLLBACK" "$FAILED" "$RECEIPT"; do
  test ! -e "$path"
done
docker compose config -q
docker exec sigua-public caddy validate --config /etc/caddy/Caddyfile >/dev/null

mkdir "$DELTA"
tar -xzf "$ARCHIVE" -C "$DELTA"
test "$(sha256sum "$DELTA/release-manifest.json" | awk '{print $1}')" = "$EXPECTED_TARGET"

node "$DELTA/apply-unified-public-delta.mjs" \
  --current-root "$ROOT/release" \
  --delta-root "$DELTA" \
  --candidate-root "$CANDIDATE" \
  --receipt "$RECEIPT"
node "$VERIFY_SCRIPT" \
  "$RECEIPT" \
  "$CANDIDATE/release-manifest.json" \
  "$EXPECTED_BASE" \
  "$EXPECTED_TARGET" \
  "$EXPECTED_ENTRIES" \
  "$EXPECTED_TOTAL_BYTES" \
  "$EXPECTED_COMMIT"

docker run -d \
  --name "$PREFLIGHT_RUNTIME" \
  --network homelab_web \
  --read-only \
  --tmpfs /tmp \
  --user 1000:1000 \
  --env NODE_ENV=production \
  --env SIGUA_INTERNATIONAL_LISTEN_HOST=0.0.0.0 \
  --env SIGUA_INTERNATIONAL_PORT=8082 \
  --volume "$CANDIDATE/international-runtime:/app:ro" \
  --workdir /app \
  "$NODE_IMAGE" \
  node /app/server.mjs >/dev/null
wait_http "$PREFLIGHT_RUNTIME" 8082

docker run -d \
  --name "$PREFLIGHT_ADMIN" \
  --network homelab_web \
  --read-only \
  --tmpfs /tmp \
  --user 1000:1000 \
  --env-file "$ROOT/.env" \
  --env NODE_ENV=production \
  --env SIGUA_PUBLIC_ORIGIN=__SIGUA_ARMOR_ORIGIN__ \
  --env SIGUA_CONTENT_ROOT=/srv/content \
  --env SIGUA_CONTENT_ADMIN_LISTEN_HOST=0.0.0.0 \
  --env SIGUA_CONTENT_ADMIN_PORT=8083 \
  --env SIGUA_CONTENT_ADMIN_SESSION_TTL_SECONDS=900 \
  --volume "$CANDIDATE/content-admin:/app:ro" \
  --volume "$ROOT/data/content:/srv/content" \
  --workdir /app \
  "$NODE_IMAGE" \
  node /app/server.mjs >/dev/null
wait_http "$PREFLIGHT_ADMIN" 8083

docker run -d \
  --name "$PREFLIGHT_PUBLIC" \
  --network homelab_web \
  --add-host __SIGUA_ARMOR_HOST__:127.0.0.1 \
  --read-only \
  --tmpfs /config \
  --tmpfs /data \
  --tmpfs /tmp \
  --env-file "$ROOT/.env" \
  --env "SIGUA_CONTENT_ADMIN_UPSTREAM=$PREFLIGHT_ADMIN:8083" \
  --env "SIGUA_INTERNATIONAL_UPSTREAM=$PREFLIGHT_RUNTIME:8082" \
  --env SIGUA_ANALYTICS_UPSTREAM=sigua-analytics:8081 \
  --volume "$CANDIDATE:/srv/public:ro" \
  --volume "$ROOT/data/content:/srv/content:ro" \
  --volume "$ROOT/Caddyfile:/etc/caddy/Caddyfile:ro" \
  "$CADDY_IMAGE" \
  caddy run --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
wait_public_health "$PREFLIGHT_PUBLIC"
candidate_admin_status=$(wait_admin_unauthenticated "$PREFLIGHT_PUBLIC")
test "$candidate_admin_status" = 401
cleanup_preflight

mv release "$ROLLBACK"
mv "$CANDIDATE" release
SWAPPED=1

./prepare-host.sh
docker compose up -d --remove-orphans
docker compose up -d --no-deps --force-recreate sigua-international
wait_healthy sigua-international
docker compose up -d --no-deps --force-recreate sigua-content-admin
wait_healthy sigua-content-admin
docker compose up -d --no-deps --force-recreate sigua-public
wait_healthy sigua-public
wait_healthy sigua-analytics

test "$(sha256sum release/release-manifest.json | awk '{print $1}')" = "$EXPECTED_TARGET"
docker exec -i sigua-public sh -s -- health < "$PUBLIC_PROBE"
admin_status=$(wait_admin_unauthenticated sigua-public)
test "$admin_status" = 401

SWAPPED=0
printf 'ACTIVATION_STATUS=success\n'
printf 'TARGET_MANIFEST=%s\n' "$EXPECTED_TARGET"
printf 'ROLLBACK_PATH=%s\n' "$ROLLBACK"
printf 'CANDIDATE_ADMIN_STATUS=%s\n' "$candidate_admin_status"
printf 'ADMIN_UNAUTHENTICATED_STATUS=%s\n' "$admin_status"
