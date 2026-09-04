/**
 * Dataset status mapping — derives an honest UI status from the loader
 * result plus connectivity, WITHOUT touching the IndexedDB + SHA-256
 * integrity gate in `./store` (which must keep refusing hash-mismatched
 * text unconditionally).
 *
 * - `verified` / `hash-mismatch` pass through untouched.
 * - `error` + offline browser → `offline` ("connect to load", not "broken").
 * - `error` + online browser → `error` (genuine failure).
 *
 * The pure `resolveDatasetUiStatus` is unit-tested; `loadDatasetWithStatus`
 * is a thin wrapper with injectable loader/online-check for tests.
 */

import { loadDataset, type LoadedDataset } from "./store";
import { isOnline } from "../net/connectivity";

export type DatasetUiStatus = "verified" | "hash-mismatch" | "error" | "offline";

export interface DatasetUiResult {
  dataset: LoadedDataset["dataset"];
  status: DatasetUiStatus;
}

export function resolveDatasetUiStatus(
  loaderStatus: LoadedDataset["status"],
  online: boolean
): DatasetUiStatus {
  if (loaderStatus === "error" && !online) {
    return "offline";
  }
  return loaderStatus;
}

export async function loadDatasetWithStatus(
  loader: () => Promise<LoadedDataset> = loadDataset,
  online: boolean = isOnline()
): Promise<DatasetUiResult> {
  const result = await loader();
  return {
    dataset: result.dataset,
    status: resolveDatasetUiStatus(result.status, online),
  };
}
