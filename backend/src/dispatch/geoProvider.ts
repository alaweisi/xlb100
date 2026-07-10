import type { CityCode, GeoPoint, GeoProviderEnvelope } from "@xlb/types";

const centers: Record<string, GeoPoint> = {
  hangzhou: { latitude: 30.2741, longitude: 120.1551 },
  shanghai: { latitude: 31.2304, longitude: 121.4737 },
};

export interface GeoProvider {
  readonly kind: "local_mock";
  geocode(cityCode: CityCode, address: string): Promise<GeoPoint>;
  route(origin: GeoPoint, destination: GeoPoint): Promise<GeoProviderEnvelope>;
}

export class LocalMockGeoProvider implements GeoProvider {
  readonly kind = "local_mock" as const;
  async geocode(cityCode: CityCode, _address: string): Promise<GeoPoint> {
    const center = centers[cityCode] ?? { latitude: 30, longitude: 120 };
    return { ...center };
  }
  async route(origin: GeoPoint, destination: GeoPoint): Promise<GeoProviderEnvelope> {
    const rad = (value: number) => value * Math.PI / 180;
    const dLat = rad(destination.latitude - origin.latitude);
    const dLng = rad(destination.longitude - origin.longitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(origin.latitude)) * Math.cos(rad(destination.latitude)) * Math.sin(dLng / 2) ** 2;
    const distanceKm = Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
    return { provider: "local_mock", providerStatus: "calculated_mock", externalProviderExecuted: false,
      distanceKm, etaMinutes: Math.max(1, Math.ceil(distanceKm / 25 * 60)), calculatedAt: new Date().toISOString(), algorithm: "haversine_local_v1" };
  }
}

export const geoProvider: GeoProvider = new LocalMockGeoProvider();
