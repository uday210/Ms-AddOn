export interface EmailContext {
  subject: string;
  from: string;
  to: string;
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
