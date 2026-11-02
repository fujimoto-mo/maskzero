// Emails to candidates. Plain text: Japanese carrier mail handles it best.

export function portalLinkEmail(v: {
  name: string;
  company: string;
  jobTitle: string;
  portalUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `【${v.company}】ご応募の受付と個人ページのご案内`,
    text: [
      `${v.name} 様`,
      "",
      `${v.company}「${v.jobTitle}」へのご応募を受け付けました。`,
      "選考の状況の確認や、書類の追加・差し替えは、次のページから行えます。",
      v.portalUrl,
      "",
      "このページはあなた専用です。ほかの人には教えないでください。",
      "お心当たりのない場合は、このメールを破棄してください。",
    ].join("\n"),
  };
}
