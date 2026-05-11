import axios from "axios";
import { getAccessToken } from "./auth";

export interface ProxySession {
  sfSessionId: string;
  sequenceId: number;
}

interface ApexRequest {
  userMessage: string;
  sfSessionId?: string;
  sequenceId: number;
  emailContext: {
    subject: string;
    from: string;
    bodyPreview: string;
  };
  accessToken: string; // passed so Apex can use it for api.salesforce.com callout
}

interface ApexResponse {
  reply: string;
  sfSessionId: string;
  sequenceId: number;
  error?: string;
}

export async function callApexProxy(req: Omit<ApexRequest, "accessToken">): Promise<ApexResponse> {
  const token = await getAccessToken();

  const res = await axios.post<ApexResponse>(
    `${process.env.SF_INSTANCE_URL}/services/apexrest/AgentProxy/`,
    { ...req, accessToken: token },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 45000,
      validateStatus: () => true,
    }
  );

  if (res.status !== 200) {
    const msg = (res.data as ApexResponse)?.error ?? JSON.stringify(res.data);
    throw new Error(`Apex proxy ${res.status}: ${msg}`);
  }

  if ((res.data as ApexResponse).error) {
    throw new Error(`Apex proxy error: ${(res.data as ApexResponse).error}`);
  }

  return res.data as ApexResponse;
}
