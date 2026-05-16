import "server-only";

import type { GraphCollectionResponse, GraphGroup, GraphUserProfile } from "./types";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const TOKEN_URL_TEMPLATE = "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token";
const TOKEN_SKEW_MS = 60_000;

let appTokenCache: { accessToken: string; expiresAt: number } | null = null;

export class GraphClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "GraphClientError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
  }

  return Math.min(500 * 2 ** attempt, 8_000);
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function getGraphAppAccessToken(): Promise<string> {
  if (appTokenCache && appTokenCache.expiresAt - TOKEN_SKEW_MS > Date.now()) {
    return appTokenCache.accessToken;
  }

  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new GraphClientError("Graph app-only credentials are not configured", 500);
  }

  const tokenUrl = TOKEN_URL_TEMPLATE.replace("{tenantId}", encodeURIComponent(tenantId));
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default"
    })
  });

  if (!response.ok) {
    throw new GraphClientError(await parseErrorMessage(response), response.status);
  }

  const token = (await response.json()) as { access_token: string; expires_in?: number };
  appTokenCache = {
    accessToken: token.access_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000
  };

  return token.access_token;
}

export async function graphFetch<T>(
  pathOrUrl: string,
  accessToken: string,
  init: RequestInit = {},
  maxRetries = 3
): Promise<T> {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH_BASE_URL}${pathOrUrl}`;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        ...(init.headers ?? {})
      }
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
      await sleep(getRetryDelay(response, attempt));
      continue;
    }

    throw new GraphClientError(await parseErrorMessage(response), response.status, getRetryDelay(response, attempt));
  }

  throw new GraphClientError("Microsoft Graph request failed after retry exhaustion", 503);
}

export async function graphFetchCollection<T>(path: string, accessToken: string): Promise<T[]> {
  const records: T[] = [];
  let nextPathOrUrl: string | undefined = path;

  while (nextPathOrUrl) {
    const page: GraphCollectionResponse<T> = await graphFetch<GraphCollectionResponse<T>>(nextPathOrUrl, accessToken);
    records.push(...(page.value ?? []));
    nextPathOrUrl = page["@odata.nextLink"];
  }

  return records;
}

export async function getDelegatedUserGroupIds(accessToken: string): Promise<string[]> {
  const groups = await graphFetchCollection<GraphGroup>(
    "/me/memberOf/microsoft.graph.group?$select=id,displayName",
    accessToken
  );

  return groups.map((group) => group.id).filter(Boolean);
}

export async function getDelegatedDirectReportCount(accessToken: string): Promise<number> {
  const page = await graphFetch<GraphCollectionResponse<GraphUserProfile>>(
    "/me/directReports/microsoft.graph.user?$select=id&$top=1",
    accessToken
  );

  return page.value?.length ?? 0;
}

export async function getTenantUsers(accessToken: string): Promise<GraphUserProfile[]> {
  return graphFetchCollection<GraphUserProfile>(
    "/users?$select=id,userPrincipalName,mail,displayName,givenName,surname,jobTitle,department,officeLocation,mobilePhone,accountEnabled",
    accessToken
  );
}

export async function getUserManager(userId: string, accessToken: string): Promise<GraphUserProfile | null> {
  try {
    return await graphFetch<GraphUserProfile>(
      `/users/${encodeURIComponent(userId)}/manager/microsoft.graph.user?$select=id,userPrincipalName,mail,displayName`,
      accessToken
    );
  } catch (error) {
    if (error instanceof GraphClientError && error.status === 404) return null;
    throw error;
  }
}

export async function getDirectReports(userId: string, accessToken: string): Promise<GraphUserProfile[]> {
  return graphFetchCollection<GraphUserProfile>(
    `/users/${encodeURIComponent(userId)}/directReports/microsoft.graph.user?$select=id,userPrincipalName,mail,displayName,accountEnabled`,
    accessToken
  );
}
