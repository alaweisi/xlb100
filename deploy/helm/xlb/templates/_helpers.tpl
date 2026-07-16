{{- define "xlb.name" -}}
xlb
{{- end }}

{{- define "xlb.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "xlb.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "xlb.labels" -}}
app.kubernetes.io/name: {{ include "xlb.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
xlb.openai.com/environment: {{ .Values.global.environment }}
{{- with .Values.global.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{- define "xlb.componentLabels" -}}
{{ include "xlb.labels" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "xlb.selectorLabels" -}}
app.kubernetes.io/name: {{ include "xlb.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "xlb.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "xlb.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- required "serviceAccount.name is required when serviceAccount.create=false" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "xlb.image" -}}
{{- if .image.digest -}}
{{ printf "%s@%s" .image.repository .image.digest }}
{{- else -}}
{{ printf "%s:%s" .image.repository (.image.tag | default "latest") }}
{{- end -}}
{{- end }}

{{- define "xlb.backendImage" -}}
{{ include "xlb.image" (dict "image" .Values.backend.image) }}
{{- end }}

{{- define "xlb.jobsImage" -}}
{{- $repository := .Values.jobs.image.repository | default .Values.backend.image.repository -}}
{{- $tag := .Values.jobs.image.tag | default .Values.backend.image.tag -}}
{{- $digest := .Values.jobs.image.digest | default .Values.backend.image.digest -}}
{{ include "xlb.image" (dict "image" (dict "repository" $repository "tag" $tag "digest" $digest)) }}
{{- end }}

{{- define "xlb.runtimeVolumes" -}}
- name: runtime-secrets
  secret:
    secretName: {{ required "runtimeSecrets.existingSecret is required" .Values.runtimeSecrets.existingSecret }}
    defaultMode: 0440
    items:
      - { key: mysql_password, path: mysql_password }
      - { key: mysql_tls_ca, path: mysql_tls_ca }
      - { key: redis_password, path: redis_password }
      - { key: redis_tls_ca, path: redis_tls_ca }
      - { key: jwt_secret, path: jwt_secret }
      - { key: jwt_keys_json, path: jwt_keys_json }
      - { key: auth_phone_hash_secret, path: auth_phone_hash_secret }
      - { key: auth_otp_pepper, path: auth_otp_pepper }
      - { key: cos_secret_id, path: cos_secret_id }
      - { key: cos_secret_key, path: cos_secret_key }
- name: tmp
  emptyDir:
    sizeLimit: 128Mi
{{- end }}

{{- define "xlb.runtimeVolumeMounts" -}}
- name: runtime-secrets
  mountPath: /run/xlb-secrets
  readOnly: true
- name: tmp
  mountPath: /tmp
{{- end }}

{{- define "xlb.backendSecretEnv" -}}
- name: MYSQL_PASSWORD_FILE
  value: /run/xlb-secrets/mysql_password
{{- if .Values.config.mysql.tlsEnabled }}
- name: MYSQL_TLS_CA_FILE
  value: /run/xlb-secrets/mysql_tls_ca
{{- end }}
- name: REDIS_PASSWORD_FILE
  value: /run/xlb-secrets/redis_password
{{- if .Values.config.redis.tlsEnabled }}
- name: REDIS_TLS_CA_FILE
  value: /run/xlb-secrets/redis_tls_ca
{{- end }}
- name: JWT_SECRET_FILE
  value: /run/xlb-secrets/jwt_secret
- name: JWT_KEYS_JSON_FILE
  value: /run/xlb-secrets/jwt_keys_json
- name: AUTH_PHONE_HASH_SECRET_FILE
  value: /run/xlb-secrets/auth_phone_hash_secret
- name: AUTH_OTP_PEPPER_FILE
  value: /run/xlb-secrets/auth_otp_pepper
{{- if eq .Values.config.objectStorage.provider "cos" }}
- name: XLB_COS_SECRET_ID_FILE
  value: /run/xlb-secrets/cos_secret_id
- name: XLB_COS_SECRET_KEY_FILE
  value: /run/xlb-secrets/cos_secret_key
{{- end }}
{{- end }}
