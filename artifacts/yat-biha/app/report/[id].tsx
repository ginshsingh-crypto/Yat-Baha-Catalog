import React, { useMemo, useState } from "react";
import { IS_PREVIEW } from "@/config/runtime";
import { Alert, Modal, Platform, ScrollView, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { categoryOf, Report, useReports } from "@/context/ReportsContext";
import {
  Button,
  DemoTag,
  Empty,
  ErrorBox,
  haptic,
  Press,
  ROW,
  T,
  Thumb,
  TypeBadge,
  relDate,
} from "@/components/ui";
import { CommunityActions } from "@/components/CommunityActions";
import { matchLabel, rankMatches } from "@/utils/matching";

export default function ReportDetails() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    getReport,
    all,
    saved,
    toggleSaved,
    updateReport,
    deleteReport,
    loading,
    publishLocal,
  } = useReports();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comparing, setComparing] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const r = getReport(id);
  const matches = useMemo(() => (r ? rankMatches(r, all) : []), [r, all]);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!r)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Stack.Screen options={{ headerShown: false }} />
        {loading ? (
          <T center>جارٍ فتح البلاغ…</T>
        ) : (
          <Empty
            icon="file-minus"
            title="البلاغ غير موجود"
            body="قد يكون حُذف، أو حُفظ على جهاز آخر فقط."
            action={
              <Button
                label="العودة للرئيسية"
                variant="soft"
                onPress={() => router.replace("/")}
              />
            }
          />
        )}
      </View>
    );

  const cat = categoryOf(r.category);
  const isSaved = saved.includes(r.id);
  const own = !!r.isOwner;
  const lost = r.type === "lost";
  const localOwner = own && !!r.local && !r.demo;
  const run = async (fn: () => Promise<void>, ok?: () => void) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      haptic.success();
      ok?.();
    } catch (e) {
      haptic.error();
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggleStatus = () =>
    run(() =>
      updateReport(r.id, { status: r.status === "open" ? "returned" : "open" }),
    );
  const confirmDelete = () => {
    haptic.warn();
    const go = async () => {
      setBusy(true);
      try {
        // Local deletion commits the report index before cleaning private notes.
        await deleteReport(r.id);
        haptic.success();
        router.replace("/mine");
      } catch (e) {
        const message = (e as Error).message;
        haptic.error();
        if (Platform.OS === "web") window.alert(message);
        else Alert.alert("تنبيه", message);
        if (!getReport(r.id)) router.replace("/mine");
        else setErr(message);
      } finally {
        setBusy(false);
      }
    };
    const message = r.local
      ? "حذف البلاغ وملاحظات التسليم الخاصة به من هذا الجهاز نهائياً؟"
      : "حذف البلاغ المشترك وصورته وطلباته ورسائله نهائياً للجميع؟";
    if (Platform.OS === "web") {
      if (window.confirm(message)) void go();
    } else
      Alert.alert("حذف البلاغ؟", message, [
        { text: "إلغاء", style: "cancel" },
        { text: "حذف", style: "destructive", onPress: () => void go() },
      ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        padding: 22,
        paddingTop: Platform.OS === "web" ? 22 : insets.top + 12,
        paddingBottom: insets.bottom + 44,
      }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          flexDirection: ROW,
          alignItems: "center",
          gap: 12,
          marginBottom: 22,
        }}
      >
        <Press
          accessibilityLabel="العودة"
          onPress={back}
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: c.card,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Feather name="arrow-right" size={20} color={c.primary} />
          <T size={9}>رجوع</T>
        </Press>
        <View style={{ flex: 1 }}>
          <T w="bold" size={18}>
            {lost ? "بلاغ فقدان" : "بلاغ عثور"}
          </T>
          <T size={11} color={c.mutedForeground}>
            {r.demo
              ? "مثال توضيحي"
              : r.local
                ? "على هذا الجهاز فقط"
                : "بلاغ المجتمع"}
          </T>
        </View>
        <Press
          accessibilityLabel={
            isSaved ? "إزالة البلاغ من المحفوظات" : "حفظ البلاغ"
          }
          accessibilityState={{ selected: isSaved }}
          testID="detail-save"
          onPress={() => {
            void toggleSaved(r.id).catch((e: Error) => setErr(e.message));
          }}
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: isSaved ? c.orangeSoft : c.card,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: isSaved ? c.orange : c.border,
          }}
        >
          <Feather
            name="bookmark"
            size={20}
            color={isSaved ? c.accentForeground : c.primary}
          />
          <T size={9}>{isSaved ? "محفوظ" : "حفظ"}</T>
        </Press>
        <Press
          accessibilityLabel="الرئيسية"
          onPress={() => router.replace("/")}
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            backgroundColor: c.card,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: c.border,
          }}
        >
          <Feather name="home" size={19} color={c.primary} />
          <T size={9}>الرئيسية</T>
        </Press>
      </View>

      {r.photoUri ? (
        <Press
          accessibilityLabel="عرض صورة الغرض بالحجم الكامل"
          testID="detail-photo"
          onPress={() => setPhotoOpen(true)}
          style={{
            borderRadius: 28,
            overflow: "hidden",
            backgroundColor: c.secondary,
          }}
        >
          <Image
            source={{ uri: r.photoUri }}
            accessibilityLabel={`صورة ${r.title}`}
            style={{ width: "100%", aspectRatio: 4 / 3 }}
            contentFit="cover"
            transition={200}
          />
          <View
            style={{
              position: "absolute",
              bottom: 14,
              left: 14,
              flexDirection: ROW,
              alignItems: "center",
              gap: 6,
              backgroundColor: "#FFFFFFEF",
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Feather name="maximize-2" size={14} color={c.primary} />
            <T size={11}>عرض الصورة</T>
          </View>
        </Press>
      ) : (
        <View
          style={{
            backgroundColor: lost ? c.magentaSoft : c.turquoiseSoft,
            borderRadius: 28,
            minHeight: 184,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <View
            style={{
              position: "absolute",
              height: 260,
              width: 260,
              borderWidth: 1,
              borderColor: lost ? "#9C1F5E20" : "#087F8C20",
              borderRadius: 130,
            }}
          />
          <View
            style={{
              position: "absolute",
              height: 205,
              width: 205,
              borderWidth: 1,
              borderColor: lost ? "#9C1F5E20" : "#087F8C20",
              borderRadius: 110,
            }}
          />
          <Thumb report={r} size={100} />
          <T size={10} color={c.mutedForeground} style={{ marginTop: 2 }}>
            رسم توضيحي للفئة · لا توجد صورة للغرض
          </T>
        </View>
      )}

      <View
        style={{
          flexDirection: ROW,
          gap: 8,
          marginTop: 20,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <TypeBadge type={r.type} />
        {r.demo ? <DemoTag /> : null}
        {r.status === "returned" ? (
          <View
            style={{
              flexDirection: ROW,
              alignItems: "center",
              gap: 5,
              backgroundColor: c.successSoft,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
            }}
          >
            <Feather name="check-circle" size={13} color={c.success} />
            <T size={12} w="semibold" color={c.success}>
              مُعاد · تأكيد يدوي
            </T>
          </View>
        ) : null}
      </View>
      <T w="bold" size={28} style={{ lineHeight: 43, marginTop: 8 }}>
        {r.title}
      </T>
      <View
        style={{
          flexDirection: ROW,
          alignItems: "center",
          gap: 5,
          marginTop: 4,
        }}
      >
        <Feather name="map-pin" size={14} color={c.turquoise} />
        <T size={14} color={c.mutedForeground}>
          {r.city} · {relDate(r.date)}
        </T>
      </View>

      <View
        style={{ flexDirection: ROW, flexWrap: "wrap", gap: 12, marginTop: 20 }}
      >
        <Fact
          icon={cat.icon as keyof typeof Feather.glyphMap}
          label="الفئة"
          value={cat.label}
        />
        <Fact
          icon="calendar"
          label={lost ? "تاريخ الفقدان" : "تاريخ العثور"}
          value={r.date}
        />
      </View>
      <View
        style={{
          backgroundColor: c.card,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: c.border,
          padding: 20,
          marginTop: 12,
          gap: 15,
        }}
      >
        <View style={{ flexDirection: ROW, alignItems: "flex-start", gap: 12 }}>
          <Feather name="map-pin" size={20} color={c.turquoise} />
          <View style={{ flex: 1 }}>
            <T size={11} color={c.mutedForeground}>
              المكان كما ورد في البلاغ
            </T>
            <T w="semibold" size={15}>
              {r.place}
            </T>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: c.border }} />
        <View>
          <T w="bold" size={15} style={{ marginBottom: 5 }}>
            تفاصيل تساعدك على المقارنة
          </T>
          <T size={14} color={c.mutedForeground}>
            {r.description}
          </T>
        </View>
      </View>

      {r.demo ? (
        <View
          style={{
            backgroundColor: c.orangeSoft,
            borderRadius: 16,
            padding: 14,
            marginTop: 14,
            flexDirection: ROW,
            gap: 8,
          }}
        >
          <Feather name="info" size={16} color="#815317" />
          <T size={12} color="#815317" style={{ flex: 1 }}>
            بيانات خيالية لتجربة الواجهة. هذا الغرض غير معروض للاستلام أو
            التواصل.
          </T>
        </View>
      ) : null}
      {localOwner ? (
        <View
          style={{
            backgroundColor: c.card,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: 24,
            padding: 20,
            gap: 12,
            marginTop: 18,
          }}
        >
          <View style={{ flexDirection: ROW, gap: 10, alignItems: "center" }}>
            <Feather name="shield" size={21} color={c.turquoise} />
            <T size={18} w="bold" style={{ flex: 1 }}>
              من المقارنة إلى العودة
            </T>
          </View>
          <T size={13} color={c.mutedForeground}>
            احفظ علاماتك الخاصة، راجع خطوات التسليم، ثم دوّن عودة الغرض. هذه
            القائمة لك وعلى هذا الجهاز فقط.
          </T>
          <Button
            testID="open-recovery"
            label={
              r.status === "returned"
                ? "راجع قائمة التسليم"
                : "افتح مسار العودة"
            }
            icon="arrow-left"
            onPress={() => router.push(`/recovery/${r.id}`)}
          />
        </View>
      ) : null}
      {r.local && publishLocal ? (
        <View style={{ marginTop: 18, gap: 10 }}>
          <T size={13}>
            نشر نسخة يجعل البلاغ وصورته مرئيين للجميع، ولا ينشر ملاحظات التسليم
            أو يحذف الأصل المحلي.
          </T>
          <Button
            label="نشر نسخة للمجتمع"
            loading={busy}
            onPress={() =>
              run(async () => {
                const published = await publishLocal(r.id);
                router.replace(`/report/${published.id}`);
              })
            }
          />
        </View>
      ) : null}
      <CommunityActions report={r} />
      {err ? (
        <View style={{ marginTop: 16 }}>
          <ErrorBox message={err} />
        </View>
      ) : null}

      {own ? (
        <View style={{ gap: 10, marginTop: 18 }}>
          <View style={{ flexDirection: ROW, gap: 10 }}>
            <Button
              label="تعديل البلاغ"
              icon="edit-2"
              variant="ghost"
              onPress={() => router.push(`/report/edit/${r.id}`)}
              style={{ flex: 1 }}
              testID="edit"
            />
            <Button
              label="حذف"
              icon="trash-2"
              variant="ghost"
              onPress={confirmDelete}
              disabled={busy}
              style={{ minWidth: 100 }}
              testID="delete"
            />
          </View>
          <Button
            testID="toggle-status"
            label={
              r.status === "open"
                ? "سجّل عودة الغرض يدوياً"
                : "إعادة فتح البلاغ"
            }
            icon={r.status === "open" ? "check-circle" : "rotate-ccw"}
            variant="soft"
            onPress={toggleStatus}
            loading={busy}
          />
          <T size={11} color={c.mutedForeground} center>
            التسجيل اليدوي للحالة لا يثبت الملكية أو حدوث التسليم.
          </T>
        </View>
      ) : null}

      <View style={{ marginTop: 32, marginBottom: 14, gap: 8 }}>
        <View style={{ flexDirection: ROW, gap: 10, alignItems: "center" }}>
          <View
            style={{
              backgroundColor: c.turquoiseSoft,
              borderRadius: 12,
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="git-merge" size={18} color={c.turquoise} />
          </View>
          <T w="bold" size={22} style={{ flex: 1 }}>
            تستحق نظرة أقرب
          </T>
          <T size={13} color={c.mutedForeground}>
            {matches.length.toLocaleString("ar-SA")}
          </T>
        </View>
        <T size={13} color={c.mutedForeground}>
          ترتيب تقريبي بحسب الكلمات واللون والمكان والتاريخ. نوضح أوجه التشابه
          والاختلاف؛ لا نحلّل الصور هنا ولا نؤكد الملكية.
        </T>
      </View>
      {matches.length === 0 ? (
        <Empty
          icon="search"
          title={
            r.status === "returned"
              ? "أُغلق البلاغ"
              : "لا بلاغات مناسبة للمقارنة الآن"
          }
          body={
            r.status === "returned"
              ? "تتوقف اقتراحات المطابقة للبلاغات المعادة. يمكنك إعادة فتح بلاغك عند الحاجة."
              : IS_PREVIEW
                ? "جرّب بلاغي فقدان وعثور من الفئة والمدينة نفسيهما. الأمثلة التوضيحية تُقارن مع بعضها فقط."
                : "قد يصل بلاغ مناسب لاحقاً. الأمثلة والبلاغات المحلية والمشتركة تُقارن في مجموعات منفصلة."
          }
        />
      ) : (
        matches.slice(0, 6).map((match) => (
          <View
            key={match.report.id}
            style={{
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 24,
              padding: 17,
              marginBottom: 14,
              gap: 12,
            }}
          >
            <Press
              onPress={() => router.push(`/report/${match.report.id}`)}
              style={{ flexDirection: ROW, gap: 12, alignItems: "center" }}
            >
              <Thumb report={match.report} size={68} />
              <View style={{ flex: 1, gap: 4 }}>
                <T
                  size={11}
                  w="semibold"
                  color={match.conflicts.length ? "#8B5A16" : c.turquoise}
                >
                  {matchLabel(match.score, match.conflicts)}
                </T>
                <T w="bold" size={16}>
                  {match.report.title}
                </T>
                <T size={12} color={c.mutedForeground}>
                  {match.report.city} · {relDate(match.report.date)}
                </T>
              </View>
              <Feather
                name="arrow-up-left"
                size={18}
                color={c.mutedForeground}
              />
            </Press>
            <View style={{ flexDirection: ROW, flexWrap: "wrap", gap: 6 }}>
              {match.reasons.slice(0, 4).map((reason) => (
                <View
                  key={reason}
                  style={{
                    backgroundColor: c.secondary,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <T size={11} color={c.secondaryForeground}>
                    {reason}
                  </T>
                </View>
              ))}
            </View>
            {match.conflicts.map((conflict) => (
              <View
                key={conflict}
                style={{ flexDirection: ROW, alignItems: "flex-start", gap: 6 }}
              >
                <Feather name="alert-circle" size={14} color="#8B5A16" />
                <T size={12} color="#8B5A16" style={{ flex: 1 }}>
                  {conflict}
                </T>
              </View>
            ))}
            <Press
              accessibilityLabel={`مقارنة ${match.report.title}`}
              accessibilityState={{ expanded: comparing === match.report.id }}
              testID={`compare-${match.report.id}`}
              onPress={() =>
                setComparing(
                  comparing === match.report.id ? null : match.report.id,
                )
              }
              style={{
                minHeight: 44,
                flexDirection: ROW,
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
                backgroundColor: c.background,
                borderRadius: 13,
              }}
            >
              <Feather
                name={comparing === match.report.id ? "chevron-up" : "columns"}
                size={16}
                color={c.primary}
              />
              <T size={13} w="semibold">
                {comparing === match.report.id
                  ? "إغلاق المقارنة"
                  : "قارن التفاصيل جنباً إلى جنب"}
              </T>
            </Press>
            {comparing === match.report.id ? (
              <Comparison source={r} candidate={match.report} />
            ) : null}
          </View>
        ))
      )}
      {matches.length > 6 ? (
        <T size={12} color={c.mutedForeground}>
          تُعرض أقرب ٦ اقتراحات. استخدم البحث لاستكشاف بقية البلاغات.
        </T>
      ) : null}

      <View
        style={{
          borderRadius: 22,
          backgroundColor: c.primary,
          padding: 20,
          gap: 8,
          marginTop: 12,
        }}
      >
        <View style={{ flexDirection: ROW, alignItems: "center", gap: 9 }}>
          <Feather name="eye-off" size={19} color="#9ADBD7" />
          <T w="bold" size={16} color="white">
            العلامة الأهم تبقى بينكما
          </T>
        </View>
        <T size={13} color="#DCE4EB">
          اطلب وصف تفصيل لم يُنشر في البلاغ. تشابه اللون أو الصورة لا يكفي
          لإثبات الملكية. رتّب التسليم في مكان عام أو لدى جهة مخوّلة.
        </T>
      </View>

      <Modal
        visible={photoOpen}
        animationType="fade"
        onRequestClose={() => setPhotoOpen(false)}
        transparent
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#101828F5",
            justifyContent: "center",
            padding: 20,
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 20,
          }}
        >
          <View
            style={{
              flexDirection: ROW,
              alignItems: "center",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <T color="white" w="bold" size={18} style={{ flex: 1 }}>
              {r.title}
            </T>
            <Press
              accessibilityLabel="إغلاق الصورة"
              onPress={() => setPhotoOpen(false)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                backgroundColor: "#FFFFFF20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="x" size={24} color="white" />
              <T size={9} color="white">
                إغلاق
              </T>
            </Press>
          </View>
          {r.photoUri ? (
            <Image
              source={{ uri: r.photoUri }}
              accessibilityLabel={`صورة ${r.title}`}
              style={{ width: "100%", flex: 1 }}
              contentFit="contain"
            />
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: "44%",
        backgroundColor: c.card,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 20,
        padding: 16,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: ROW, alignItems: "center", gap: 7 }}>
        <Feather name={icon} size={15} color={c.turquoise} />
        <T size={11} color={c.mutedForeground}>
          {label}
        </T>
      </View>
      <T w="semibold" size={15}>
        {value}
      </T>
    </View>
  );
}
function Comparison({
  source,
  candidate,
}: {
  source: Report;
  candidate: Report;
}) {
  const c = useColors();
  const fields = [
    { label: "الوصف المختصر", a: source.title, b: candidate.title },
    { label: "المكان", a: source.place, b: candidate.place },
    { label: "التاريخ", a: source.date, b: candidate.date },
    { label: "التفاصيل", a: source.description, b: candidate.description },
  ];
  return (
    <View
      style={{
        borderTopColor: c.border,
        borderTopWidth: 1,
        paddingTop: 14,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: ROW, gap: 12 }}>
        <T w="bold" size={12} style={{ flex: 1 }}>
          هذا البلاغ
        </T>
        <T w="bold" size={12} color={c.turquoise} style={{ flex: 1 }}>
          البلاغ المقترح
        </T>
      </View>
      {fields.map((field) => (
        <View key={field.label} style={{ gap: 4 }}>
          <T size={10} color={c.mutedForeground}>
            {field.label}
          </T>
          <View style={{ flexDirection: ROW, gap: 12 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: c.background,
                borderRadius: 12,
                padding: 10,
              }}
            >
              <T size={12}>{field.a}</T>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: c.turquoiseSoft,
                borderRadius: 12,
                padding: 10,
              }}
            >
              <T size={12}>{field.b}</T>
            </View>
          </View>
        </View>
      ))}
      <T size={11} color={c.mutedForeground}>
        قارن بنفسك قبل اتخاذ أي خطوة. ترتيب الاقتراح ليس نسبة احتمال ولا إثبات
        ملكية.
      </T>
    </View>
  );
}
