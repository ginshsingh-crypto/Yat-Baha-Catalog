import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, ScrollView, TextInput, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReports } from "@/context/ReportsContext";
import { useColors } from "@/hooks/useColors";
import {
  Button,
  Empty,
  ErrorBox,
  F,
  haptic,
  Press,
  ROW,
  T,
} from "@/components/ui";
import {
  emptyRecovery,
  loadRecovery,
  RecoveryRecord,
  saveRecovery,
} from "@/utils/recovery";

export default function RecoveryWorkspace() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getReport, updateReport, loading } = useReports();
  const report = getReport(id);
  const allowed = !!report?.local && !!report?.isOwner && !report?.demo;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [record, setRecord] = useState<RecoveryRecord>(() => emptyRecovery(id));
  const current = useRef(record);
  const savedAt = useRef(0);
  const alive = useRef(true);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "dirty" | "error">(
    "saved",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  const persist = useCallback((next: RecoveryRecord): Promise<void> => {
    if (alive.current) setStatus("saving");
    const operation = queue.current
      .catch(() => undefined)
      .then(() => saveRecovery(next))
      .then(() => {
        savedAt.current = next.updatedAt;
        if (alive.current) {
          setStatus(
            current.current.updatedAt === next.updatedAt ? "saved" : "dirty",
          );
          setError("");
        }
      })
      .catch((e: Error) => {
        if (alive.current) {
          setStatus("error");
          setError(
            "لم تُحفظ القائمة على جهازك. جرّب الحفظ مجدداً قبل المغادرة.",
          );
        }
        throw e;
      });
    queue.current = operation.catch(() => undefined);
    return operation;
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setReady(false);
    loadRecovery(id)
      .then((stored) => {
        if (cancelled) return;
        current.current = stored;
        savedAt.current = stored.updatedAt;
        setRecord(stored);
        setReady(true);
        setStatus("saved");
        setError("");
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "تعذّرت قراءة القائمة.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, allowed, retry]);

  useEffect(() => {
    if (!ready || record.updatedAt === savedAt.current) return;
    const timer = setTimeout(() => {
      void persist(record).catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [record, ready, persist]);

  useEffect(() => {
    alive.current = true;
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active" && current.current.updatedAt > savedAt.current)
        void persist(current.current).catch(() => undefined);
    });
    return () => {
      alive.current = false;
      listener.remove();
      if (current.current.updatedAt > savedAt.current)
        void persist(current.current).catch(() => undefined);
    };
  }, [persist]);

  const update = (patch: Partial<RecoveryRecord>) => {
    const next = {
      ...current.current,
      ...patch,
      updatedAt: Math.max(Date.now(), current.current.updatedAt + 1),
    };
    current.current = next;
    setRecord(next);
    setStatus("dirty");
    return next;
  };
  const back = async () => {
    try {
      if (ready && current.current.updatedAt > savedAt.current)
        await persist(current.current);
      router.replace(`/report/${id}`);
    } catch {
      /* The visible save error keeps the user on this screen. */
    }
  };
  const returned = report?.status === "returned";
  const completed =
    Number(record.evidenceChecked) +
    Number(record.meetingPlanned) +
    Number(returned);

  if (!allowed)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          padding: 24,
          justifyContent: "center",
        }}
      >
        <Stack.Screen options={{ headerShown: false }} />
        {loading ? (
          <T center>جارٍ فتح البلاغ…</T>
        ) : (
          <Empty
            icon="lock"
            title="قائمة شخصية لبلاغاتك المحلية"
            body="هذه القائمة متاحة لبلاغ أنشأته على هذا الجهاز. طلبات الملكية للبلاغات المشتركة لها مسارها الخاص."
            action={
              <Button
                label="العودة للرئيسية"
                onPress={() => router.replace("/")}
              />
            }
          />
        )}
      </View>
    );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        padding: 22,
        paddingTop: Platform.OS === "web" ? 22 : insets.top + 12,
        paddingBottom: insets.bottom + 40,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          flexDirection: ROW,
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Press
          accessibilityLabel="حفظ والعودة إلى البلاغ"
          onPress={() => void back()}
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: c.card,
            alignItems: "center",
            justifyContent: "center",
            borderColor: c.border,
            borderWidth: 1,
          }}
        >
          <Feather name="arrow-right" size={21} color={c.foreground} />
          <T size={9}>رجوع</T>
        </Press>
        <View style={{ flex: 1 }}>
          <T w="bold" size={20}>
            مسار العودة
          </T>
          <T size={12} color={c.mutedForeground}>
            قائمتك الشخصية · على هذا الجهاز
          </T>
        </View>
        <Feather name="shield" size={25} color={c.turquoise} />
      </View>

      <View
        style={{
          backgroundColor: c.primary,
          borderRadius: 28,
          padding: 22,
          gap: 9,
        }}
      >
        <T size={12} color="#9ADBD7">
          كل خطوة واضحة. وكل تفصيل في مكانه.
        </T>
        <T w="bold" size={24} color="white">
          {report!.title}
        </T>
        <T size={13} color="#DCE4EB">
          قارن التفاصيل الخاصة، رتّب التسليم، ثم دوّن النتيجة بنفسك.
        </T>
        <View style={{ flexDirection: ROW, gap: 6, marginTop: 8 }}>
          {[record.evidenceChecked, record.meetingPlanned, returned].map(
            (done, index) => (
              <View
                key={index}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: done ? "#8CE0CE" : "#FFFFFF24",
                }}
              />
            ),
          )}
        </View>
        <T size={12} color="#DCE4EB">
          {completed.toLocaleString("ar-SA")} من ٣ خطوات
        </T>
      </View>

      <View
        style={{
          flexDirection: ROW,
          gap: 10,
          paddingVertical: 18,
          alignItems: "flex-start",
        }}
      >
        <Feather name="eye-off" size={19} color={c.mutedForeground} />
        <T size={12} color={c.mutedForeground} style={{ flex: 1 }}>
          ملاحظاتك لا تُنشر في البلاغ ولا تُرسل إلى أي شخص. تخزينها محلي وليس
          خزنة مشفّرة؛ تجنّب أرقام الهوية والبطاقات وأرقام الاتصال.
        </T>
      </View>
      {error ? (
        <ErrorBox
          message={error}
          onRetry={
            ready
              ? () => {
                  void persist(current.current).catch(() => undefined);
                }
              : () => setRetry((n) => n + 1)
          }
        />
      ) : null}
      {!ready ? (
        <T center style={{ marginTop: 20 }}>
          {error ? "لم تُفتح القائمة بعد." : "جارٍ فتح قائمتك…"}
        </T>
      ) : (
        <>
          <Step
            number="١"
            title="قارن علامة لا تظهر للآخرين"
            body="اطلب وصفاً يعرفه صاحب الغرض، مثل محتوى غير منشور أو علامة داخلية. تشابه الصورة وحده لا يثبت الملكية."
            checked={record.evidenceChecked}
            onToggle={() => {
              haptic.tap();
              update({ evidenceChecked: !record.evidenceChecked });
            }}
            testID="recovery-evidence"
          >
            <T size={12} w="semibold" color={c.mutedForeground}>
              ملاحظاتي الخاصة (اختياري)
            </T>
            <TextInput
              testID="recovery-notes"
              accessibilityLabel="ملاحظات التسليم الخاصة على هذا الجهاز"
              multiline
              value={record.notes}
              onChangeText={(notes) => update({ notes })}
              maxLength={1600}
              placeholder="مثال: وصف العلامة داخل الجيب…"
              placeholderTextColor={c.mutedForeground}
              style={{
                backgroundColor: c.background,
                minHeight: 116,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: c.border,
                padding: 14,
                color: c.foreground,
                fontFamily: F.regular,
                fontSize: 14,
                lineHeight: 23,
                writingDirection: "rtl",
                textAlign: "right",
                textAlignVertical: "top",
              }}
            />
            <T size={11} color={c.mutedForeground}>
              {record.notes.length.toLocaleString("ar-SA")} / ١٦٠٠
            </T>
          </Step>
          <Step
            number="٢"
            title="رتّب تسليماً آمناً"
            body="اختر مكاناً عاماً أو نقطة أمن معلومة. لا تدفع رسوماً لاستعادة غرضك، ولا تشارك موقع منزلك أو رموز الدخول."
            checked={record.meetingPlanned}
            onToggle={() => {
              haptic.tap();
              update({ meetingPlanned: !record.meetingPlanned });
            }}
            testID="recovery-meeting"
          />
          <View
            style={{
              backgroundColor: returned ? c.successSoft : c.card,
              borderColor: returned ? c.success : c.border,
              borderWidth: 1,
              borderRadius: 24,
              padding: 20,
              gap: 12,
              marginTop: 14,
            }}
          >
            <View style={{ flexDirection: ROW, alignItems: "center", gap: 12 }}>
              <View
                style={{
                  backgroundColor: returned ? c.success : c.secondary,
                  height: 34,
                  width: 34,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {returned ? (
                  <Feather name="check" color="white" size={18} />
                ) : (
                  <T w="bold">٣</T>
                )}
              </View>
              <T w="bold" size={18} style={{ flex: 1 }}>
                {returned ? "دوّنت أن الغرض عاد" : "أكّد النتيجة بعد التسليم"}
              </T>
            </View>
            <T size={13} color={c.mutedForeground}>
              {returned
                ? "حالة البلاغ مُعاد. هذا تسجيل يدوي منك، ولا يمثّل تحققاً آلياً من الهوية أو الملكية."
                : "اضغط فقط بعد حدوث التسليم فعلاً. لن نراسل أي طرف أو نتحقق من هويته بالنيابة عنك."}
            </T>
            {!returned ? (
              <Button
                testID="recovery-complete"
                label="تم التسليم فعلاً · أغلق البلاغ"
                icon="check-circle"
                disabled={!record.evidenceChecked || !record.meetingPlanned}
                loading={busy}
                onPress={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await persist(current.current);
                    await updateReport(report!.id, { status: "returned" });
                    const next = update({ returnedAt: Date.now() });
                    await persist(next);
                    haptic.success();
                  } catch (e: unknown) {
                    setError(
                      e instanceof Error ? e.message : "تعذّر إغلاق البلاغ.",
                    );
                    haptic.error();
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : (
              <Button
                label="عرض البلاغ"
                variant="soft"
                icon="arrow-right"
                onPress={() => void back()}
              />
            )}
            {!returned &&
            (!record.evidenceChecked || !record.meetingPlanned) ? (
              <T size={11} color={c.mutedForeground}>
                أكمل التحقق الشخصي وترتيب التسليم أولاً.
              </T>
            ) : null}
          </View>
          <View
            style={{
              flexDirection: ROW,
              alignItems: "center",
              gap: 7,
              justifyContent: "center",
              marginTop: 22,
            }}
          >
            <Feather
              name={
                status === "saved"
                  ? "check-circle"
                  : status === "error"
                    ? "alert-circle"
                    : "clock"
              }
              size={14}
              color={status === "error" ? c.destructive : c.mutedForeground}
            />
            <T
              size={12}
              color={status === "error" ? c.destructive : c.mutedForeground}
            >
              {status === "saved"
                ? "محفوظة على هذا الجهاز"
                : status === "error"
                  ? "لم يُحفظ آخر تعديل"
                  : "جارٍ حفظ التعديلات…"}
            </T>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Step({
  number,
  title,
  body,
  checked,
  onToggle,
  children,
  testID,
}: {
  number: string;
  title: string;
  body: string;
  checked: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  testID: string;
}) {
  const c = useColors();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderColor: checked ? c.turquoise : c.border,
        borderWidth: 1,
        borderRadius: 24,
        padding: 20,
        gap: 12,
        marginTop: 14,
      }}
    >
      <View style={{ flexDirection: ROW, alignItems: "center", gap: 12 }}>
        <View
          style={{
            backgroundColor: checked ? c.turquoiseSoft : c.secondary,
            height: 34,
            width: 34,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <T w="bold" color={checked ? c.turquoise : c.foreground}>
            {number}
          </T>
        </View>
        <T w="bold" size={18} style={{ flex: 1 }}>
          {title}
        </T>
      </View>
      <T size={13} color={c.mutedForeground}>
        {body}
      </T>
      {children}
      <Press
        accessibilityRole="checkbox"
        accessibilityLabel={title}
        accessibilityState={{ checked }}
        testID={testID}
        onPress={onToggle}
        style={{
          flexDirection: ROW,
          alignItems: "center",
          gap: 10,
          minHeight: 48,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 14,
          backgroundColor: checked ? c.turquoiseSoft : c.background,
        }}
      >
        <Feather
          name={checked ? "check-square" : "square"}
          size={21}
          color={checked ? c.turquoise : c.mutedForeground}
        />
        <T w="semibold" size={13} style={{ flex: 1 }}>
          {checked
            ? "أكملت هذه الخطوة بنفسي · اضغط للتراجع"
            : "أكملت هذه الخطوة بنفسي"}
        </T>
      </Press>
    </View>
  );
}
