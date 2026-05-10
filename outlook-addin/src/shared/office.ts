export interface EmailContext {
  subject: string;
  from: string;
  to: string;
  bodyPreview: string;
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

        resolve({
          subject: item.subject ?? "",
          from,
          to,
          bodyPreview: result.value.slice(0, 500).trim(),
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function openReplyWithBody(body: string): void {
  Office.context.mailbox.item?.displayReplyForm({ htmlBody: body });
}
