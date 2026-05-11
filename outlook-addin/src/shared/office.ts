export interface EmailContext {
  subject: string;
  from: string;
  to: string;
  cc?: string;
  bodyPreview: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  id: string;
  name: string;
  size: number;
  contentType: string;
}

export function getEmailContext(): Promise<EmailContext> {
  return new Promise((resolve, reject) => {
    try {
      const item = Office.context.mailbox.item;
      if (!item) {
        reject(new Error("No email item in context"));
        return;
      }

      item.body.getAsync(Office.CoercionType.Text, { asyncContext: {} }, (result) => {
        if (result.status === Office.AsyncResultStatus.Failed) {
          reject(new Error(result.error.message));
          return;
        }

        const from =
          item.from?.emailAddress ??
          item.from?.displayName ??
          "Unknown sender";

        const toRecipients = item.to ?? [];
        const to = toRecipients
          .map((r: Office.EmailAddressDetails) => r.emailAddress)
          .join(", ");

        const ccRecipients = item.cc ?? [];
        const cc = ccRecipients
          .map((r: Office.EmailAddressDetails) => r.emailAddress)
          .join(", ");

        const attachments: EmailAttachment[] = (item.attachments ?? [])
          .filter((a: Office.AttachmentDetails) => !a.isInline)
          .map((a: Office.AttachmentDetails) => ({
            id: a.id,
            name: a.name,
            size: a.size,
            contentType: a.contentType ?? "application/octet-stream",
          }));

        resolve({
          subject: item.subject ?? "",
          from,
          to,
          cc: cc || undefined,
          bodyPreview: result.value.slice(0, 500).trim(),
          attachments,
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function getAttachmentContent(attachmentId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    Office.context.mailbox.item?.getAttachmentContentAsync(
      attachmentId,
      (result: Office.AsyncResult<Office.AttachmentContent>) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) {
          resolve(result.value.content); // base64 string
        } else {
          reject(new Error(result.error?.message ?? "Failed to read attachment"));
        }
      }
    );
  });
}

export function openReplyWithBody(body: string): void {
  Office.context.mailbox.item?.displayReplyForm({ htmlBody: body });
}

export interface MeetingFormOptions {
  subject: string;
  requiredAttendees: string[];
  optionalAttendees?: string[];
  startDate: string;   // YYYY-MM-DD
  startTime: string;   // HH:MM (24h)
  durationMinutes: number;
  agenda: string;
}

export function openMeetingForm(opts: MeetingFormOptions): void {
  const [year, month, day] = opts.startDate.split("-").map(Number);
  const [hour, minute] = opts.startTime.split(":").map(Number);
  const start = new Date(year, month - 1, day, hour, minute);
  const end = new Date(start.getTime() + opts.durationMinutes * 60_000);

  Office.context.mailbox.displayNewAppointmentForm({
    subject: opts.subject,
    requiredAttendees: opts.requiredAttendees,
    optionalAttendees: opts.optionalAttendees ?? [],
    start,
    end,
    body: opts.agenda,
  });
}
