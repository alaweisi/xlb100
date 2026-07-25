#!/bin/sh
set -eu

if docker container inspect xlb-staging-edge >/dev/null 2>&1; then
  docker stop xlb-staging-edge >/dev/null
elif docker container inspect xlb-staging-proxy >/dev/null 2>&1; then
  docker stop xlb-staging-proxy >/dev/null
fi
