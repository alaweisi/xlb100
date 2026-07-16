# TKE environment values

These files override `deploy/helm/xlb/values.yaml`.

- `values-local.yaml`: local Kubernetes only; mutable local tags are allowed.
- `values-staging.yaml`: production-like TKE shape with non-deployable placeholders.
- `values-production.yaml`: production shape with non-deployable placeholders.

The staging and production files are deliberately safe to commit but unsafe to
apply. The N4 deployment tool must reject:

- `placeholder` or `example.invalid`;
- the all-zero SHA-256 digest;
- missing runtime Secret or TLS Secret references;
- a kube context that does not exactly match the approved environment.

Never put passwords, certificate private keys, Tencent Cloud credentials,
kubeconfig contents, or real Secret values in these files.
