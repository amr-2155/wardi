"use client";

import type { ReactNode } from "react";
import { LocaleContext, useLocaleState } from "@/lib/locale";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const value = useLocaleState();
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}