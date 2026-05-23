# Expense Manager — Plan 4: Notifications + OCR

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Add the notification-ingestion side (for Uber/Rapido/Swiggy notifications), and OCR receipt scanning. Manual expense entry doesn't need a new service — UI calls `ExpenseService.insert` directly (Plan 6).

**Architecture:**
- Notification side: Kotlin `NotificationListenerService` allowlisted to expense-relevant packages → Headless JS dispatch to the existing `IngestionPipeline.process` (Plan 2). New JS parser for per-package rules.
- OCR: thin JS wrapper around `@react-native-ml-kit/text-recognition`. Pure-text-to-draft logic is unit-tested in JS; native binding is type-only here.

---

## File structure

```
src/services/parser/
├── notification.ts                (per-package notif rules)
└── rules/notification-rules.ts    (rule table)

src/services/ocr/
├── index.ts                        (OcrService interface)
├── parse-receipt.ts                (text → draft pure JS)
└── mlkit.ts                        (RN binding; device-only)

android/app/src/main/java/com/expensemanager/ingestion/
└── ExpenseNotificationListener.kt

android/app/src/main/AndroidManifest.xml (modified)
```

---

## Task 1 — Notification parser rules

- [ ] `__tests__/services/parser-notification.test.ts`:
```typescript
import { parseNotification } from '../../src/services/parser/notification';

describe('parseNotification', () => {
  it('parses Uber ride completion', () => {
    const r = parseNotification({
      packageName: 'com.ubercab',
      title: 'Trip with Ramesh',
      text: 'Thanks for riding with Uber. ₹245.00 was charged.',
      ts: 1_700_000_000_000,
    });
    expect(r?.amountMinor).toBe(24500);
    expect(r?.merchantNorm).toBe('uber');
    expect(r?.confidence).toBeGreaterThan(0.85);
  });
  it('parses Rapido', () => {
    const r = parseNotification({
      packageName: 'com.rapido.passenger',
      title: 'Ride complete',
      text: 'You paid ₹75 to Rapido for your ride',
      ts: 0,
    });
    expect(r?.amountMinor).toBe(7500);
    expect(r?.merchantNorm).toBe('rapido');
  });
  it('parses Swiggy', () => {
    const r = parseNotification({
      packageName: 'in.swiggy.android',
      title: 'Order delivered',
      text: 'Your order of ₹399 has been delivered',
      ts: 0,
    });
    expect(r?.amountMinor).toBe(39900);
    expect(r?.merchantNorm).toBe('swiggy');
  });
  it('returns null for unknown packages', () => {
    expect(parseNotification({ packageName: 'com.example.app', title: 't', text: '₹100', ts: 0 })).toBeNull();
  });
  it('returns null when no amount in text', () => {
    expect(parseNotification({ packageName: 'com.ubercab', title: 't', text: 'hello', ts: 0 })).toBeNull();
  });
});
```

- [ ] `src/services/parser/rules/notification-rules.ts`:
```typescript
export interface NotificationRule {
  merchantNorm: string;
  match: (title: string, text: string) => number | null;
}

const AMOUNT_RE = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i;

const fromAmount = (t: string): number | null => {
  const m = t.match(AMOUNT_RE);
  if (!m) return null;
  return Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
};

const simple = (merchantNorm: string): NotificationRule => ({
  merchantNorm,
  match: (_t, text) => fromAmount(text),
});

export const NOTIFICATION_RULES: Record<string, NotificationRule> = {
  'com.ubercab':           simple('uber'),
  'com.rapido.passenger':  simple('rapido'),
  'com.olacabs.customer':  simple('ola'),
  'in.swiggy.android':     simple('swiggy'),
  'com.application.zomato': simple('zomato'),
};
```

- [ ] `src/services/parser/notification.ts`:
```typescript
import { NOTIFICATION_RULES } from './rules/notification-rules';
import type { ParserDraft } from './sms';

export interface NotificationEvent {
  packageName: string;
  title: string;
  text: string;
  ts: number;
}

export const parseNotification = (e: NotificationEvent): ParserDraft | null => {
  const rule = NOTIFICATION_RULES[e.packageName];
  if (!rule) return null;
  const amount = rule.match(e.title, e.text);
  if (!amount) return null;
  return {
    amountMinor: amount,
    merchantRaw: rule.merchantNorm,
    merchantNorm: rule.merchantNorm,
    occurredAt: e.ts,
    sourceRef: e.packageName,
    sourceMsg: `${e.title}\n${e.text}`,
    confidence: 0.9,
  };
};
```

- [ ] Tests pass — 5 passing.
- [ ] Commit: `feat(parser): notification parser`.

---

## Task 2 — Pipeline accepts notification source

The pipeline already accepts `source: 'notification'` via `preParsed`. Add a convenience path so callers can pass a raw notif and have the pipeline call `parseNotification` internally.

- [ ] Modify `src/services/ingestion-pipeline.ts`:

Add import:
```typescript
import { parseNotification } from './parser/notification';
```

Update the parse step inside `process`:
```typescript
draft = event.preParsed ?? (
  event.source === 'sms'
    ? parseSms({ sender: event.sourceRef, body: event.body, ts: event.ts })
    : event.source === 'notification'
      ? parseNotification({
          packageName: event.sourceRef ?? '',
          title: '',
          text: event.body,
          ts: event.ts,
        })
      : null
);
```

(Notification events arriving from native are flattened into `body`; the native side packs `title\ntext`.)

- [ ] Add test `__tests__/services/ingestion-pipeline.test.ts`:
```typescript
it('processes notification events end-to-end', () => {
  const { pipeline, db } = setup();
  const out = pipeline.process({
    source: 'notification',
    sourceRef: 'com.ubercab',
    body: '\nThanks for riding with Uber. ₹245 was charged.',
    ts: 1_700_000_000_000,
  });
  expect(out.outcome).toBe('inserted');
  const r = db.get<{ amount_minor: number; category_id: string }>('SELECT amount_minor, category_id FROM expenses');
  expect(r?.amount_minor).toBe(24500);
  expect(r?.category_id).toBe('cat-transport');
});
```

(The leading `\n` in body simulates the title section being empty since `body` is used as text.)

- [ ] Test passes (along with all prior).
- [ ] Commit: `feat(pipeline): accept notification source`.

---

## Task 3 — OCR receipt parser (pure JS)

- [ ] `__tests__/services/ocr-parse.test.ts`:
```typescript
import { parseReceiptText } from '../../src/services/ocr/parse-receipt';

describe('parseReceiptText', () => {
  it('extracts total, merchant, date from a typical receipt', () => {
    const text = `
      Coffee Day
      14-MAY-2026
      Latte           Rs.250.00
      Cookie          Rs.100.00
      Total           Rs.350.00
      Thank you
    `;
    const r = parseReceiptText(text);
    expect(r?.amountMinor).toBe(35000);
    expect(r?.merchantRaw?.toLowerCase()).toContain('coffee day');
    expect(r?.occurredAt).toBe(new Date('2026-05-14').getTime());
  });

  it('returns null when no total found', () => {
    expect(parseReceiptText('random text\nno money')).toBeNull();
  });

  it('falls back to first line as merchant when no obvious header', () => {
    const text = 'PIZZA HUT\nTotal Rs.499.00';
    const r = parseReceiptText(text);
    expect(r?.merchantRaw?.toUpperCase()).toBe('PIZZA HUT');
  });
});
```

- [ ] `src/services/ocr/parse-receipt.ts`:
```typescript
const TOTAL_RE = /(?:total|grand\s*total|amount\s*due|net\s*total)[\s:]*?(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d+)?)/i;
const ANY_AMOUNT_RE = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)/i;
const DATE_RE = /(\d{1,2})[-/](\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-/](\d{2,4})/i;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const parseDate = (m: RegExpMatchArray): number | null => {
  const day = parseInt(m[1], 10);
  const monthStr = m[2].toLowerCase();
  const monthIdx = MONTHS[monthStr.slice(0, 3)] ?? (parseInt(m[2], 10) - 1);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  if (Number.isNaN(day) || Number.isNaN(year) || monthIdx < 0 || monthIdx > 11) return null;
  return new Date(Date.UTC(year, monthIdx, day)).getTime();
};

export interface ReceiptDraft {
  amountMinor: number;
  merchantRaw: string | null;
  occurredAt: number | null;
}

export const parseReceiptText = (raw: string): ReceiptDraft | null => {
  const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean);
  let amountMinor: number | null = null;

  for (const line of lines) {
    const m = line.match(TOTAL_RE) ?? null;
    if (m) {
      amountMinor = Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
      break;
    }
  }
  if (amountMinor === null) {
    let max = 0;
    for (const line of lines) {
      const m = line.match(ANY_AMOUNT_RE);
      if (m) {
        const v = Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
        if (v > max) max = v;
      }
    }
    if (max > 0) amountMinor = max;
  }
  if (amountMinor === null) return null;

  let occurredAt: number | null = null;
  for (const line of lines) {
    const dm = line.match(DATE_RE);
    if (dm) {
      occurredAt = parseDate(dm);
      if (occurredAt) break;
    }
  }

  let merchantRaw: string | null = null;
  if (lines.length > 0) {
    const candidates = lines.slice(0, 5).filter((l) => !ANY_AMOUNT_RE.test(l) && !DATE_RE.test(l));
    if (candidates.length > 0) merchantRaw = candidates[0];
  }

  return { amountMinor, merchantRaw, occurredAt };
};
```

- [ ] Tests pass — 3 passing.
- [ ] Commit: `feat(ocr): receipt text parser`.

---

## Task 4 — OcrService + ML Kit binding (type-only)

- [ ] Install:
```bash
npm install @react-native-ml-kit/text-recognition
```

- [ ] `src/services/ocr/index.ts`:
```typescript
import type { ReceiptDraft } from './parse-receipt';

export interface OcrSource {
  uri: string;
}

export interface OcrService {
  scan(source: OcrSource): Promise<ReceiptDraft | null>;
}
```

- [ ] `src/services/ocr/mlkit.ts`:
```typescript
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { parseReceiptText } from './parse-receipt';
import type { OcrService, OcrSource } from './index';

export const createMlKitOcr = (): OcrService => ({
  async scan(source: OcrSource) {
    const result = await TextRecognition.recognize(source.uri);
    return parseReceiptText(result.text);
  },
});
```

- [ ] Typecheck passes.
- [ ] Commit: `feat(ocr): ML Kit binding`.

---

## Task 5 — Native NotificationListenerService

- [ ] Modify `android/app/src/main/AndroidManifest.xml`. Inside `<application>`, add:

```xml
<service
    android:name=".ingestion.ExpenseNotificationListener"
    android:exported="false"
    android:label="@string/app_name"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService"/>
    </intent-filter>
</service>
```

- [ ] Create `android/app/src/main/java/com/expensemanager/ingestion/ExpenseNotificationListener.kt`:

```kotlin
package com.expensemanager.ingestion

import android.app.Notification
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.HeadlessJsTaskService

private val PACKAGE_ALLOWLIST = setOf(
    "com.ubercab",
    "com.rapido.passenger",
    "com.olacabs.customer",
    "in.swiggy.android",
    "com.application.zomato",
)

class ExpenseNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        if (!PACKAGE_ALLOWLIST.contains(sbn.packageName)) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        if (title.isEmpty() && text.isEmpty()) return

        val event = IngestionEvent(
            source = "notification",
            sourceRef = sbn.packageName,
            body = "$title\n$text",
            ts = sbn.postTime,
        )
        val payload: Bundle = com.facebook.react.bridge.Arguments.toBundle(listOf(event).toReactPayload()) ?: return

        val svc = android.content.Intent(applicationContext, HeadlessIngestionTaskService::class.java)
        svc.putExtras(payload)
        applicationContext.startService(svc)
        HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
    }
}
```

- [ ] Commit: `feat(android): ExpenseNotificationListener`.

---

## Task 6 — Full sweep

- [ ] `npm test -- --coverage` — expect all passing.
- [ ] `npm run format && npm run lint && npm run typecheck` — all clean.
- [ ] Commit any drift as `chore: format pass`.
