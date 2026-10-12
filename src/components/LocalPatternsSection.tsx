"use client";

import { useSyncExternalStore } from "react";
import { AdaptiveLearnerSection } from "@/components/AdaptiveLearnerSection";
import {
  getLocalAttemptsSnapshot,
  getLocalLearnerAnalytics,
  parseLocalAttempts,
  subscribeToLocalAttempts,
} from "@/lib/learner-patterns";

export function LocalPatternsSection() {
  const snapshot = useSyncExternalStore(subscribeToLocalAttempts, getLocalAttemptsSnapshot, () => "");
  const attempts = parseLocalAttempts(snapshot);
  return <AdaptiveLearnerSection data={getLocalLearnerAnalytics(attempts)} scopeLabel="this browser" />;
}
