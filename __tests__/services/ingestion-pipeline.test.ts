import { makeSeededDb } from '../helpers/test-db';
import { fixedClock } from '../helpers/fixed-clock';
import { createIngestionPipeline } from '../../src/services/ingestion-pipeline';

const setup = () => {
  const db = makeSeededDb();
  const clock = fixedClock(1_700_000_000_000);
  const pipeline = createIngestionPipeline({ db, clock });
  return { db, clock, pipeline };
};

describe('IngestionPipeline.process', () => {
  it('drops promotional SMS', () => {
    const { pipeline, db } = setup();
    const out = pipeline.process({
      source: 'sms',
      sourceRef: 'AD-OFFER-P',
      body: 'Buy now Rs.100 off',
      ts: 0,
    });
    expect(out.outcome).toBe('dropped_promo');
    const count = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM expenses')?.c;
    expect(count).toBe(0);
  });

  it('inserts a parsed SMS with bundled categorization', () => {
    const { pipeline, db } = setup();
    const out = pipeline.process({
      source: 'sms',
      sourceRef: 'VK-HDFCBK-T',
      body: 'Rs.250.00 debited from a/c **1234 on 14-05-26 to SWIGGY. Avl Bal: Rs.10,000',
      ts: 1_700_000_000_000,
    });
    expect(out.outcome).toBe('inserted');
    const row = db.get<{
      amount_minor: number;
      category_id: string;
      status: string;
      verified_by: number;
    }>('SELECT amount_minor, category_id, status, verified_by FROM expenses LIMIT 1');
    expect(row?.amount_minor).toBe(25000);
    expect(row?.category_id).toBe('cat-food');
    expect(row?.status).toBe('active');
    expect(row?.verified_by).toBe(1);
  });

  it('puts low-confidence parses into pending_review', () => {
    const { pipeline, db } = setup();
    const out = pipeline.process({
      source: 'sms',
      sourceRef: 'XX-WEIRD-T',
      body: 'Your card was charged Rs.99.00 at QUANTUM WIDGETS on 01-01-26',
      ts: 0,
    });
    expect(out.outcome).toBe('inserted');
    const r = db.get<{ status: string }>('SELECT status FROM expenses');
    expect(r?.status).toBe('pending_review');
  });

  it('idempotent: replaying same body returns dropped_dup', () => {
    const { pipeline } = setup();
    const ev = {
      source: 'sms' as const,
      sourceRef: 'VK-HDFCBK-T',
      body: 'Rs.250.00 debited from a/c **1234 to SWIGGY. Avl Bal: Rs.10,000',
      ts: 0,
    };
    expect(pipeline.process(ev).outcome).toBe('inserted');
    expect(pipeline.process(ev).outcome).toBe('dropped_dup');
  });

  it('merges incoming when same dedup key already exists', () => {
    const { pipeline, db } = setup();
    pipeline.process({
      source: 'sms',
      sourceRef: 'VK-HDFCBK-T',
      body: 'Rs.250.00 debited from a/c **1234 to RAPIDO. Avl Bal: Rs.10,000',
      ts: 1_700_000_000_000,
    });
    // simulate a notification draft for the same txn within window (same 2-min bucket)
    const out = pipeline.process({
      source: 'notification',
      sourceRef: 'com.rapido.passenger',
      body: 'Paid Rs.250 to RAPIDO for ride',
      ts: 1_700_000_030_000, // 30s later — same 2-min bucket
      preParsed: {
        amountMinor: 25000,
        merchantRaw: 'Rapido',
        merchantNorm: 'rapido',
        occurredAt: 1_700_000_030_000,
        sourceRef: 'com.rapido.passenger',
        sourceMsg: 'Paid Rs.250 to RAPIDO for ride',
        confidence: 0.9,
      },
    });
    expect(out.outcome).toBe('merged');
    const r = db.get<{ verified_by: number; source: string }>(
      'SELECT verified_by, source FROM expenses',
    );
    expect(r?.verified_by).toBe(2);
    expect(r?.source).toBe('merged');
  });

  it('processes notification events end-to-end', () => {
    const { pipeline, db } = setup();
    const out = pipeline.process({
      source: 'notification',
      sourceRef: 'com.ubercab',
      body: '\nThanks for riding with Uber. ₹245 was charged.',
      ts: 1_700_000_000_000,
    });
    expect(out.outcome).toBe('inserted');
    const r = db.get<{ amount_minor: number; category_id: string }>(
      'SELECT amount_minor, category_id FROM expenses',
    );
    expect(r?.amount_minor).toBe(24500);
    expect(r?.category_id).toBe('cat-transport');
  });

  it('persists the raw body on the audit row for every recorded outcome', () => {
    const { pipeline, db } = setup();
    const bodyFor = (ref: string): string | null =>
      db.get<{ body: string | null }>('SELECT body FROM ingestion_log WHERE source_ref = ?', [ref])
        ?.body ?? null;

    // inserted
    const insertedBody = 'Rs.250.00 debited from a/c **1234 on 14-05-26 to SWIGGY. Avl Bal: Rs.10,000';
    pipeline.process({ source: 'sms', sourceRef: 'VK-HDFCBK-T', body: insertedBody, ts: 1_700_000_000_000 });
    expect(bodyFor('VK-HDFCBK-T')).toBe(insertedBody);

    // dropped_promo
    const promoBody = 'Buy now Rs.100 off';
    pipeline.process({ source: 'sms', sourceRef: 'AD-OFFER-P', body: promoBody, ts: 0 });
    expect(bodyFor('AD-OFFER-P')).toBe(promoBody);

    // dropped_no_parse
    const noParseBody = 'Welcome to HDFC Bank net banking';
    pipeline.process({ source: 'sms', sourceRef: 'VK-NOPARSE-T', body: noParseBody, ts: 0 });
    expect(bodyFor('VK-NOPARSE-T')).toBe(noParseBody);

    // merged — notification for the same txn within the dedup window
    const mergedBody = 'Paid Rs.250 to SWIGGY for food';
    const merged = pipeline.process({
      source: 'notification',
      sourceRef: 'in.swiggy.android',
      body: mergedBody,
      ts: 1_700_000_030_000,
      preParsed: {
        amountMinor: 25000,
        merchantRaw: 'Swiggy',
        merchantNorm: 'swiggy',
        occurredAt: 1_700_000_030_000,
        sourceRef: 'in.swiggy.android',
        sourceMsg: mergedBody,
        confidence: 0.9,
      },
    });
    expect(merged.outcome).toBe('merged');
    expect(bodyFor('in.swiggy.android')).toBe(mergedBody);

    // dropped_error — a throwing preParsed accessor blows up inside the parse block
    const errorBody = 'this body triggers an error';
    const out = pipeline.process({
      source: 'sms',
      sourceRef: 'VK-ERROR-T',
      body: errorBody,
      ts: 0,
      get preParsed(): never {
        throw new Error('boom');
      },
    });
    expect(out.outcome).toBe('dropped_error');
    expect(bodyFor('VK-ERROR-T')).toBe(errorBody);
  });

  it('drops no-parse messages with audit row', () => {
    const { pipeline, db } = setup();
    const out = pipeline.process({
      source: 'sms',
      sourceRef: 'VK-HDFCBK-T',
      body: 'Welcome to HDFC Bank net banking',
      ts: 0,
    });
    expect(out.outcome).toBe('dropped_no_parse');
    const lg = db.get<{ outcome: string }>('SELECT outcome FROM ingestion_log');
    expect(lg?.outcome).toBe('dropped_no_parse');
  });
});
