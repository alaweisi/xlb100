export type RawInjectResponse = {
  statusCode: number;
  body: string;
  json: () => unknown;
};

export function assertResponseJson<T>(
  response: RawInjectResponse,
  path: string,
  expectedStatuses: readonly number[],
): T {
  if (!expectedStatuses.includes(response.statusCode)) {
    throw new Error(`${path} returned status ${response.statusCode} (body: ${response.body})`);
  }
  try {
    return response.json() as T;
  } catch (error) {
    throw new Error(
      `${path} returned invalid JSON body while status ${response.statusCode}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

