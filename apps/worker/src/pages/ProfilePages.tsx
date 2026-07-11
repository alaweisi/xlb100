import type { WorkerLocation } from "@xlb/types";
import { Button, Card, FormField, Input, StatusTag } from "@xlb/ui";
import { helperText, mutedBoxStyle, workerPanelStyle } from "./pageShared";

type QueryParams = { cityCode: string };

export function WorkerLocationPage({ location, busy, error, latitude, longitude, radius, sharing,
  onLatitudeChange, onLongitudeChange, onRadiusChange, onSharingChange, onSave, onReload,
}: {
  location: WorkerLocation | null; busy: boolean; error: string | null;
  latitude: string; longitude: string; radius: string; sharing: boolean;
  onLatitudeChange: (value: string) => void; onLongitudeChange: (value: string) => void;
  onRadiusChange: (value: string) => void; onSharingChange: (value: boolean) => void;
  onSave: () => void; onReload: () => void;
}) {
  return <Card title="Location & Availability" actions={<StatusTag tone="success">Private exact</StatusTag>} style={workerPanelStyle}>
    <div style={{ display: "grid", gap: 10 }}>
      {location && <div style={mutedBoxStyle}>
        <strong>{location.freshness}</strong>
        <span style={helperText}>{location.latitude}, {location.longitude} · expires {location.expiresAt}</span>
      </div>}
      <FormField label="Latitude"><Input type="number" value={latitude} onChange={event => onLatitudeChange(event.target.value)} /></FormField>
      <FormField label="Longitude"><Input type="number" value={longitude} onChange={event => onLongitudeChange(event.target.value)} /></FormField>
      <FormField label="Service radius (km)"><Input type="number" value={radius} onChange={event => onRadiusChange(event.target.value)} /></FormField>
      <label style={{ alignItems: "center", display: "flex", gap: 8, fontSize: 14 }}><input type="checkbox" checked={sharing} onChange={event => onSharingChange(event.target.checked)} /> Available for LBS-lite matching</label>
      <div style={{ display: "flex", gap: 8 }}><Button variant="primary" disabled={busy || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))} onClick={onSave}>Report current location</Button><Button disabled={busy} onClick={onReload}>Refresh</Button></div>
      <p style={helperText}>Exact coordinates are returned only to this authenticated worker. Admin sees distance, ETA and freshness.</p>
      {error && <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>}
    </div>
  </Card>;
}

export function CertificationPage({
  cityCode,
  workerId,
  certType,
  certName,
  submitting,
  error,
  notice,
  onCertTypeChange,
  onCertNameChange,
  onSubmit,
}: QueryParams & {
  workerId: string;
  certType: string;
  certName: string;
  submitting: boolean;
  error: string | null;
  notice: string | null;
  onCertTypeChange: (value: string) => void;
  onCertNameChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Card title="Certification Apply" actions={<StatusTag tone={notice ? "success" : "warning"}>Real API</StatusTag>} style={workerPanelStyle}>
      <div style={mutedBoxStyle}>
        <p style={helperText}>
          Submitting uses POST /api/worker/certifications for {workerId} in {cityCode}.
        </p>
        <FormField label="certType">
          <Input value={certType} onChange={(event) => onCertTypeChange(event.target.value)} />
        </FormField>
        <FormField label="certName">
          <Input value={certName} onChange={(event) => onCertNameChange(event.target.value)} />
        </FormField>
        <Button
          disabled={submitting || !certType.trim() || !certName.trim()}
          onClick={onSubmit}
          variant="primary"
        >
          {submitting ? "Submitting" : "Submit certification"}
        </Button>
        {error && <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>}
        {notice && <p style={helperText}>{notice}</p>}
        <p style={helperText}>
          Certification status/profile read APIs are not available yet, so this page does not invent a local approved state.
        </p>
      </div>
    </Card>
  );
}
