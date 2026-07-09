export interface ApiClientOptions {
  baseUrl: string;
  headers?: Record<string, string> | ((path: string, method: string) => Record<string, string>);
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, headers = {} } = options;

  function resolveHeaders(path: string, method: string): Record<string, string> {
    return typeof headers === "function" ? headers(path, method) : headers;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...resolveHeaders(path, method),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API ${method} ${path} failed: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  };
}
