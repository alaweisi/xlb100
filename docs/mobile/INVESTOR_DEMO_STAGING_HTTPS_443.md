# Investor Demo Staging HTTPS 443 Handoff

Date: 2026-07-28

Status: **HOLD — the VM-side standard HTTPS listener, certificate, and renewal
path pass, but Tencent Cloud drops public TCP 443 before it reaches the VM.**

This is staging-only evidence for Investor Demo item 9. It does not authorize
or modify production, TKE, an app store, or APK distribution.

## Target and ownership

| Field | Value |
| --- | --- |
| Public IPv4 | `123.207.198.136` |
| Standard target | `https://123.207.198.136/` |
| Tencent instance | `ins-7a8qh4gx` |
| Region / zone | `ap-shanghai` / `ap-shanghai-4` |
| VPC / subnet | `vpc-a6hpmy14` / `subnet-atyuevz1` |
| VM | `VM-0-11-ubuntu` |
| Construction baseline | `6f32d4b78e1bcba509fbc7c5eaa38a4e9a6f2b47` |
| TKE touched | No |

## Layer-by-layer evidence

### Server listener: PASS

- `ss -ltnp` reports Docker listeners on `0.0.0.0:443` and `[::]:443`.
- `xlb-staging-edge` publishes host `80` and `443`.
- HAProxy has a dedicated `bind :443` frontend and sends it to Nginx TLS
  port 443.
- From the VM, `curl --resolve
  123.207.198.136:443:127.0.0.1 https://123.207.198.136/health` validates the
  public IP identity and returns HTTP 200.
- TLS 1.2 and TLS 1.3 handshakes both pass on the local standard listener.

### VM firewall: PASS

- UFW is inactive.
- nftables input and forward base policies are `accept`.
- `iptables` INPUT policy is `ACCEPT`.
- `DOCKER-USER` returns without a deny.
- The Tencent host protection chain contains source-specific rejects only; it
  has no destination-port 443 reject.

### Tencent Cloud ingress: HOLD

From one fixed external source, a simultaneous client probe and VM packet
capture produced:

- public port 80: SYN arrived on `eth0`, was DNATed to the edge container, and
  `/health` returned HTTP 200;
- public port 443: the client timed out and **no 443 packet arrived on any VM
  interface**.

This control comparison rules out the application, HAProxy, Nginx, Docker port
mapping, and VM firewall. The remaining drop is the Tencent Cloud ingress rule
attached to the staging instance.

## Certificate, chain, SAN, and renewal

| Check | Result |
| --- | --- |
| Issuer | Let’s Encrypt `YE2` |
| Leaf SHA-256 | `E25BBAF4721AA5BE62133333815C4152364B72FBC5E355BCC50D0B05520CAB96` |
| SAN | critical `IP Address:123.207.198.136` |
| Valid from | `2026-07-25 20:14:04 UTC` |
| Valid until | `2026-08-01 12:14:03 UTC` |
| Served chain | leaf → `YE2` → `Root YE` → `ISRG Root X2` |
| Certbot | snap Certbot `5.7.0` |
| Renewal scheduler | `snap.certbot.renew.timer`, enabled and active |
| Latest scheduled run observed | `2026-07-28 02:42:05 CST`, success |
| Manual renewal simulation | `2026-07-28 18:33:02 CST`, success |
| Renewal hooks | pre/deploy/post files present, executable, and staging-edge scoped |

The Let’s Encrypt IP certificate is intentionally short-lived. Automatic
renewal is therefore a hard availability dependency; do not disable the timer,
remove the hooks, or close public port 80 while the standalone challenge is in
use.

## The one remaining cloud operation

Add exactly this inbound allow rule to the Tencent Cloud network policy
attached to `ins-7a8qh4gx`:

```text
Direction: inbound
IP version: IPv4
Protocol: TCP
Source: 0.0.0.0/0
Destination port: 443
Action: ALLOW
Target: ins-7a8qh4gx
Priority: above any catch-all deny
```

Do not open `3000`, `3307`, `4173`–`4177`, or `6380`. Do not modify TKE.
The rollback is to remove only this TCP 443 allow rule.

No usable Tencent Cloud API credential, instance CAM role, `tccli` profile, or
Terraform credential was available in this construction unit. The SSH key can
configure the VM but cannot change the upstream Tencent Cloud ingress rule.

## Required close-out verification

After the rule is active, run from outside Tencent Cloud:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/verify-staging-https-443.ps1
```

The output must report `status: PASS` for the certificate and:

- `/health`
- `/customer/`
- `/worker/`
- `/admin/`
- `/oa/`
- `/dashboard/`

Only then may Investor Demo build origins use exactly
`https://123.207.198.136` without `:80`, and only then may item 9 move from HOLD
to PASS.

## External change and rollback log

No persistent VM configuration was changed: the required HAProxy, Nginx,
Docker port mapping, certificate files, executable hooks, and enabled renewal
timer were already present.

`certbot renew --cert-name 123.207.198.136 --dry-run` completed successfully.
Certbot logged `all simulated renewals succeeded` and `no renewal failures`.
The staging-only pre/post hooks briefly stopped and restored
`xlb-staging-edge`; the dry-run correctly skipped the deploy hook because it
did not replace the live certificate. Afterward both edge containers were
running, and local HTTP 80 plus certificate-valid HTTPS 443 `/health` probes
returned HTTP 200. No application code was deployed and TKE was not touched.
