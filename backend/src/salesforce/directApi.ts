import axios from "axios";
import { getAccessToken } from "./auth";

export interface SFProject {
  Id: string;
  Name: string;
  Status__c?: string;
  End_Date__c?: string;
  Account__r?: { Name: string };
  Description__c?: string;
}

// ── Salesforce REST helpers ───────────────────────────────────────────────────

export async function soqlQuery<T>(query: string): Promise<T[]> {
  const token = await getAccessToken();
  const res = await axios.get(`${process.env.SF_INSTANCE_URL}/services/data/v63.0/query`, {
    params: { q: query },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  return (res.data as { records: T[] }).records;
}

export async function sfUpdate(sobject: string, id: string, fields: Record<string, unknown>): Promise<void> {
  const token = await getAccessToken();
  await axios.patch(
    `${process.env.SF_INSTANCE_URL}/services/data/v63.0/sobjects/${sobject}/${id}`,
    fields,
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 }
  );
}

export async function sfCreate(sobject: string, fields: Record<string, unknown>): Promise<string> {
  const token = await getAccessToken();
  const res = await axios.post(
    `${process.env.SF_INSTANCE_URL}/services/data/v63.0/sobjects/${sobject}`,
    fields,
    { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 }
  );
  return (res.data as { id: string }).id;
}

export async function sfAttachFile(
  projectId: string,
  filename: string,
  base64Content: string
): Promise<string> {
  const token = await getAccessToken();
  try {
    const res = await axios.post(
      `${process.env.SF_INSTANCE_URL}/services/data/v63.0/sobjects/ContentVersion`,
      {
        Title: filename,
        PathOnClient: filename,
        VersionData: base64Content,
        FirstPublishLocationId: projectId,
      },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 30000 }
    );
    return (res.data as { id: string }).id;
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "response" in err) {
      const r = (err as { response: { status: number; data: unknown } }).response;
      throw new Error(`Salesforce error ${r.status}: ${JSON.stringify(r.data)}`);
    }
    throw err;
  }
}

export async function findProjects(name: string): Promise<SFProject[]> {
  const safe = name.replace(/'/g, "\\'").slice(0, 80);
  return soqlQuery<SFProject>(
    `SELECT Id, Name, Status__c, End_Date__c, Account__r.Name, Description__c
     FROM Project__c WHERE Name LIKE '%${safe}%' LIMIT 5`
  );
}
