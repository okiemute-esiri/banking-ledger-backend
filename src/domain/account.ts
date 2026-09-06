export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  createdAt: string;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency: string;
}

export function naturalDebit(accountType: AccountType): boolean {
  return accountType === "ASSET" || accountType === "EXPENSE";
}
