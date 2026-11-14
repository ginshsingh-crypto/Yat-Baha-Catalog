import AsyncStorage from "@react-native-async-storage/async-storage";
import { IS_PREVIEW } from "@/config/runtime";

/** Personal device notes are never part of a public Report or an API payload. */
export interface RecoveryRecord {
  version: 1;
  reportId: string;
  notes: string;
  evidenceChecked: boolean;
  meetingPlanned: boolean;
  returnedAt: number | null;
  updatedAt: number;
}
const PREFIX = IS_PREVIEW
  ? "yat-biha.preview.recovery.v1."
  : "yat-biha.local.recovery.v1.";
export const recoveryKey = (reportId: string) =>
  PREFIX + encodeURIComponent(reportId);
export const emptyRecovery = (reportId: string): RecoveryRecord => ({
  version: 1,
  reportId,
  notes: "",
  evidenceChecked: false,
  meetingPlanned: false,
  returnedAt: null,
  updatedAt: 0,
});
export function parseRecovery(
  raw: string | null,
  reportId: string,
): RecoveryRecord {
  if (raw === null) return emptyRecovery(reportId);
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object")
    throw new Error("صيغة قائمة التسليم غير صالحة.");
  const r = value as Partial<RecoveryRecord>;
  if (
    r.version !== 1 ||
    r.reportId !== reportId ||
    typeof r.notes !== "string" ||
    r.notes.length > 1600 ||
    typeof r.evidenceChecked !== "boolean" ||
    typeof r.meetingPlanned !== "boolean" ||
    (r.returnedAt !== null &&
      (typeof r.returnedAt !== "number" || !Number.isFinite(r.returnedAt))) ||
    typeof r.updatedAt !== "number" ||
    !Number.isFinite(r.updatedAt)
  ) {
    throw new Error("تعذّرت قراءة قائمة التسليم المحفوظة. لم نغيّر بياناتك.");
  }
  return r as RecoveryRecord;
}
export async function loadRecovery(reportId: string) {
  return parseRecovery(
    await AsyncStorage.getItem(recoveryKey(reportId)),
    reportId,
  );
}
export async function saveRecovery(record: RecoveryRecord) {
  // Validate before writing so malformed records cannot overwrite a good record.
  parseRecovery(JSON.stringify(record), record.reportId);
  await AsyncStorage.setItem(
    recoveryKey(record.reportId),
    JSON.stringify(record),
  );
}
export async function deleteRecovery(reportId: string) {
  await AsyncStorage.removeItem(recoveryKey(reportId));
}
