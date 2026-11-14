import React from 'react';
import { router } from 'expo-router';
import { TabScreen } from '@/components/Screen';
import { Button, Empty } from '@/components/ui';

export function PreviewNotice() {
  return (
    <TabScreen title="نسخة المعاينة">
      <Empty
        icon="smartphone"
        title="جرّب التطبيق على جهازك"
        body="يمكنك إنشاء البلاغات وتعديلها وإضافة الصور والبحث وحفظ العناصر وتتبع إعادتها. تُحفظ التجربة على هذا الجهاز. تسجيل الحسابات والتواصل بين المستخدمين متاحان عند تشغيل الخدمة المشتركة."
        action={<Button label="إنشاء بلاغ تجريبي" onPress={() => router.replace('/report/new')} />}
      />
    </TabScreen>
  );
}
