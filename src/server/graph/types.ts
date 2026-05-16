export interface GraphCollectionResponse<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

export interface GraphUserProfile {
  id: string;
  userPrincipalName?: string | null;
  mail?: string | null;
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  officeLocation?: string | null;
  mobilePhone?: string | null;
  accountEnabled?: boolean | null;
}

export interface GraphGroup {
  id: string;
  displayName?: string | null;
}

export interface GraphSyncResult {
  organizationId: string;
  tenantId: string;
  usersSeen: number;
  usersUpserted: number;
  managerLinksUpdated: number;
  failures: Array<{
    stage: string;
    subject?: string;
    message: string;
  }>;
}
