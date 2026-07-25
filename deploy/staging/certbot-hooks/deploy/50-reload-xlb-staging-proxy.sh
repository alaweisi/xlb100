#!/bin/sh
set -eu

if docker container inspect xlb-staging-proxy >/dev/null 2>&1; then
  docker start xlb-staging-proxy >/dev/null
  docker exec xlb-staging-proxy nginx -s reload >/dev/null 2>&1
fi
if docker container inspect xlb-staging-edge >/dev/null 2>&1; then
  docker restart xlb-staging-edge >/dev/null
fi
