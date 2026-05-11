import axios from "axios";
import { getAccessToken } from "./auth";

const APEX_ENDPOINT = `${process.env.SF_INSTANCE_URL ?? ""}/services/apexrest/AgentProxy/`;

interface ApexRequest {
  userMessage: string;
  sfSessionId?: string;
  sequenceId: number;
  emailContext: {
    subject: string;
    from: string;
    bodyPreview: string;
  };
}

interface ApexResponse {
  reply: string;
  sfSessionId: string;
  sequenceId: number;
}

export interface ProxySession {
  sfSessionId: string;
  sequenceId: number;
}

export async function callApexProxy(
  req: ApexRequest
): Promise<ApexResponse> {
  const token = await getAccessToken();
  const endpoint = `${process.env.SF_INSTANCE_URL}/services/apexrest/AgentProxy/`;

  const res = await axios.post<ApexResponse>(endpoint, req, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 45000,
  });

  if (res.status !== 200) {
    throw new Error(`Apex proxy ${res.status}: ${JSON.stringify(res.data)}`);
  }

  return res.data;
}
