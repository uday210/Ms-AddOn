let cached: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const res = await fetch(`${process.env.SF_INSTANCE_URL}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SF_CLIENT_ID!,
      client_secret: process.env.SF_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) throw new Error(`SF auth failed ${res.status}: ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in?: number };
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 7200) - 60) * 1000,
  };

  console.log("[auth] token refreshed");
  return cached.token;
}

export function clearToken() {
  cached = null;
}
