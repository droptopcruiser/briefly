import type { Rubric } from "./types";

/**
 * Seed rubrics shipped to new firms as a starting point (BYOR).
 * A firm would clone and edit these, or author their own. Deliberately spanning
 * three verticals to demonstrate the engine is vertical-agnostic.
 */
export const SEED_RUBRICS: Rubric[] = [
  {
    id: "immigration-spousal-visa",
    name: "Spousal Visa Application",
    vertical: "Immigration",
    description:
      "A client seeking a partner/spouse/marriage visa to join or remain with a partner in-country. Involves a relationship, a sponsor, and immigration status.",
    fields: [
      {
        key: "applicant_full_name",
        label: "Applicant full name",
        description: "Full legal name of the person applying for the visa.",
        required: true,
        type: "string",
      },
      {
        key: "applicant_nationality",
        label: "Applicant nationality",
        description: "Country of citizenship of the applicant.",
        required: true,
        type: "string",
      },
      {
        key: "sponsor_full_name",
        label: "Sponsor full name",
        description: "Full name of the partner/spouse sponsoring the application.",
        required: true,
        type: "string",
      },
      {
        key: "relationship_start_date",
        label: "Relationship start date",
        description: "When the relationship began (dating or cohabiting).",
        required: true,
        type: "date",
      },
      {
        key: "marriage_date",
        label: "Marriage/partnership date",
        description: "Date of marriage or civil partnership, if applicable.",
        required: false,
        type: "date",
      },
      {
        key: "current_immigration_status",
        label: "Current immigration status",
        description: "The applicant's current visa/status in the country.",
        required: true,
        type: "string",
      },
      {
        key: "current_location",
        label: "Applicant current location",
        description: "Country the applicant is currently in.",
        required: true,
        type: "string",
      },
    ],
    documents: [
      {
        key: "passport",
        label: "Applicant passport",
        description: "Copy of the applicant's current passport.",
        required: true,
      },
      {
        key: "marriage_certificate",
        label: "Marriage/partnership certificate",
        description: "Certificate evidencing the marriage or civil partnership.",
        required: false,
      },
      {
        key: "cohabitation_evidence",
        label: "Evidence of cohabitation",
        description: "Joint tenancy, bills, or correspondence showing shared address.",
        required: true,
      },
      {
        key: "sponsor_financials",
        label: "Sponsor financial evidence",
        description: "Payslips or bank statements meeting the income threshold.",
        required: true,
      },
    ],
  },
  {
    id: "bookkeeping-new-client",
    name: "New Bookkeeping Client Onboarding",
    vertical: "Bookkeeping",
    description:
      "A business owner or sole trader looking to hand over their bookkeeping — recording transactions, reconciling accounts, and preparing for their accountant or tax return.",
    fields: [
      {
        key: "business_name",
        label: "Business name",
        description: "Trading name of the business.",
        required: true,
        type: "string",
      },
      {
        key: "business_structure",
        label: "Business structure",
        description: "Sole trader, partnership, limited company, etc.",
        required: true,
        type: "enum",
        options: ["Sole trader", "Partnership", "Limited company", "Other"],
      },
      {
        key: "accounting_software",
        label: "Accounting software",
        description: "Software currently used, e.g. Xero, QuickBooks, spreadsheets.",
        required: true,
        type: "string",
      },
      {
        key: "financial_year_end",
        label: "Financial year end",
        description: "The business's accounting year-end date.",
        required: true,
        type: "date",
      },
      {
        key: "vat_registered",
        label: "VAT registered",
        description: "Whether the business is registered for VAT.",
        required: true,
        type: "boolean",
      },
      {
        key: "monthly_transaction_volume",
        label: "Monthly transaction volume",
        description: "Approximate number of transactions per month.",
        required: false,
        type: "number",
      },
    ],
    documents: [
      {
        key: "bank_statements",
        label: "Bank statements",
        description: "Recent business bank statements.",
        required: true,
      },
      {
        key: "prior_accounts",
        label: "Prior year accounts",
        description: "Last set of filed accounts or bookkeeping records.",
        required: false,
      },
      {
        key: "software_access",
        label: "Accounting software access",
        description: "Invite/login to existing accounting software.",
        required: true,
      },
    ],
  },
  {
    id: "legal-employment-dispute",
    name: "Employment Dispute Intake",
    vertical: "Legal",
    description:
      "An employee raising a workplace dispute — unfair dismissal, discrimination, unpaid wages, or a grievance against an employer.",
    fields: [
      {
        key: "client_full_name",
        label: "Client full name",
        description: "Full name of the employee bringing the matter.",
        required: true,
        type: "string",
      },
      {
        key: "employer_name",
        label: "Employer name",
        description: "Name of the employer the dispute is against.",
        required: true,
        type: "string",
      },
      {
        key: "job_title",
        label: "Job title",
        description: "The client's role at the employer.",
        required: true,
        type: "string",
      },
      {
        key: "employment_start_date",
        label: "Employment start date",
        description: "When the client started working for the employer.",
        required: true,
        type: "date",
      },
      {
        key: "dispute_type",
        label: "Dispute type",
        description: "Nature of the dispute.",
        required: true,
        type: "enum",
        options: [
          "Unfair dismissal",
          "Discrimination",
          "Unpaid wages",
          "Grievance",
          "Other",
        ],
      },
      {
        key: "key_incident_date",
        label: "Key incident date",
        description: "Date of the dismissal or the central incident.",
        required: true,
        type: "date",
      },
    ],
    documents: [
      {
        key: "employment_contract",
        label: "Employment contract",
        description: "The client's contract of employment.",
        required: true,
      },
      {
        key: "correspondence",
        label: "Relevant correspondence",
        description: "Emails or letters relating to the dispute.",
        required: true,
      },
      {
        key: "payslips",
        label: "Payslips",
        description: "Recent payslips, relevant to wage claims.",
        required: false,
      },
    ],
  },
];

export function getRubric(id: string): Rubric | undefined {
  return SEED_RUBRICS.find((r) => r.id === id);
}
