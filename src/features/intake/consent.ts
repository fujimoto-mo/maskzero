// The privacy notice candidates agree to on the entry page (docs/02 M3-5). Every stored consent
// records the version of the text that was shown, so bump the version whenever the wording changes.

const PRIVACY_TEXT_VERSION = "privacy.2026-11-02";
export const OTHER_JOBS_TEXT_VERSION = "other-jobs.2026-11-02";

export type ConsentParties = {
  /** The hiring company the candidate applies to. */
  company: string;
  /** The recruiting agency handling the application for that company, if any. */
  agency: string | null;
  retentionDays: number;
  /** The job's "a person confirms every rejection" setting (docs/02 M4-6). */
  humanReviewsRejections: boolean;
};

/** The stored version of the notice; the variant without the human-review promise differs. */
export const privacyTextVersion = (humanReviewsRejections: boolean) =>
  humanReviewsRejections ? PRIVACY_TEXT_VERSION : `${PRIVACY_TEXT_VERSION}.auto-rejection`;

export function privacyNotice({
  company,
  agency,
  retentionDays,
  humanReviewsRejections,
}: ConsentParties): string[] {
  const handler = agency ?? company;
  return [
    `ご入力いただいた情報と書類は、${company}の採用選考と、選考に関するご連絡のために使います。${
      agency
        ? `応募の受付と選考のご連絡は、採用支援会社の${agency}が${company}に代わって行います。`
        : ""
    }`,
    "提出された書類は、AI（米国のAnthropic社が提供するClaude）が読み取り、会社があらかじめ決めた選考の条件と照らし合わせます。そのため、書類の内容は米国にある同社のサーバーに送られます。米国の個人情報保護制度については、個人情報保護委員会が公表している情報をご確認ください。",
    humanReviewsRejections
      ? "AIの読み取り結果は選考の参考情報として使い、不採用は必ず担当者が確認したうえで決めます。"
      : "AIの読み取り結果は選考の参考情報として使います。",
    `不採用または辞退となった場合、提出された書類とご回答は${retentionDays}日後に自動で削除します。`,
    "本籍・家族構成・宗教・支持政党など、仕事に関係のない事柄は書かなくてかまいません。書類に書かれていても、選考には使いません。",
    `ご自身の情報の開示・訂正・削除をご希望の場合は、応募後に表示される個人ページのリンクを添えて、${handler}の採用担当までご連絡ください。`,
  ];
}

export function otherJobsNotice(agency: string): string {
  return `${agency}から、ほかの会社の求人のご案内を受け取る（任意）`;
}
