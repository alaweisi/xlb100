# TLS — Tencent Cloud Staging Standard HTTPS

This directory records the TLS boundary for the Docker Compose staging host.
It does not configure TKE, production ingress, DNS, or Tencent Cloud network
policy.

## Repository-owned listener path

The standard staging address is:

```text
https://123.207.198.136/
```

The repository-owned path is:

```text
public TCP 443
  -> deploy/compose/docker-compose.staging.yml edge-multiplexer :443
  -> infra/haproxy/cloud-staging-edge.cfg
  -> reverse-proxy :443
  -> infra/nginx/cloud-staging.conf
```

`STAGING_HTTPS_PORT` defaults to `443`. Do not set it to `80` for an Investor
Demo build. Port 80 remains available for the current plain-HTTP compatibility
path and the Certbot standalone challenge.

## Certificate and renewal contract

- Certificate name and SAN: `123.207.198.136`.
- Nginx reads `/etc/letsencrypt/live/123.207.198.136/fullchain.pem` and
  `privkey.pem` read-only.
- Certbot owns renewal on the staging VM.
- The enabled Certbot timer must remain active.
- The executable hooks under `deploy/staging/certbot-hooks` stop only the edge
  listener for the standalone challenge, restore it after the attempt, and
  reload Nginx after a successful renewal.

Install those hooks under the equivalent
`/etc/letsencrypt/renewal-hooks/{pre,deploy,post}` directories with mode `0755`.
Never copy a certificate private key into Git or an application image.

## Public verification

Run from a network outside Tencent Cloud:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/verify-staging-https-443.ps1
```

The verifier fails closed unless public TCP 443, certificate identity and
chain, remaining lifetime, and all six staging HTTP surfaces pass. A server
loopback PASS is useful listener evidence but is not public acceptance.

Tencent Cloud network policy is intentionally not changed by repository code.
If public verification reports `TCP_443_UNREACHABLE` while the VM is listening,
the only required cloud operation is:

```text
ALLOW IPv4 TCP 443 FROM 0.0.0.0/0
TO staging instance ins-7a8qh4gx (ap-shanghai, ap-shanghai-4)
```

Keep raw application, database, and cache ports closed. Removing exactly that
443 allow rule is the network rollback.
