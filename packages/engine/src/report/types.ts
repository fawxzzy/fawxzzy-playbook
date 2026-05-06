export type ReportFailure = {
  id: string;
  message: string;
  evidence?: string;
  fix?: string;
};

export type ReportWarning = {
  id: string;
  message: string;
};

export type VerifyReport = {
  ok: boolean;
  summary: {
    failures: number;
    warnings: number;
    baseRef?: string;
    baseSha?: string;
    baselineRef?: string;
    phase?: string;
    ruleIds?: string[];
  };
  failures: ReportFailure[];
  warnings: ReportWarning[];
  findingState?: {
    artifactPath: string;
    baselineRef: string;
    summary: {
      total: number;
      new: number;
      existing: number;
      resolved: number;
      ignored: number;
    };
    findings: Array<{
      findingId: string;
      ruleId: string;
      normalizedLocation: string;
      evidenceHash: string;
      state: 'new' | 'existing' | 'ignored';
      firstSeenAt: string;
      lastSeenAt: string;
      evidenceRefs: string[];
    }>;
    resolved: Array<{
      findingId: string;
      ruleId: string;
      normalizedLocation: string;
      evidenceHash: string;
      state: 'resolved';
      firstSeenAt: string;
      lastSeenAt: string;
      evidenceRefs: string[];
    }>;
  };
};
