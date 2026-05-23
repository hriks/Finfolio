package com.finfolio.app.ingestion

import android.content.Context
import android.net.Uri
import android.os.Bundle
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService
import kotlinx.coroutines.delay

private const val BATCH_SIZE = 200

class InboxScanWorker(
    appContext: Context,
    workerParams: WorkerParameters,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val sinceMs = inputData.getLong("sinceMs", 0L)
        val ctx = applicationContext

        val cursor = ctx.contentResolver.query(
            Uri.parse("content://sms/inbox"),
            arrayOf("_id", "address", "body", "date"),
            "date >= ?",
            arrayOf(sinceMs.toString()),
            "date ASC",
        ) ?: return Result.success()

        cursor.use { c ->
            val idIdx = c.getColumnIndex("_id")
            val addrIdx = c.getColumnIndex("address")
            val bodyIdx = c.getColumnIndex("body")
            val dateIdx = c.getColumnIndex("date")

            val batch = ArrayList<IngestionEvent>(BATCH_SIZE)
            while (c.moveToNext()) {
                if (isStopped) return Result.success()
                batch.add(
                    IngestionEvent(
                        source = "sms",
                        sourceRef = c.getString(addrIdx),
                        body = c.getString(bodyIdx) ?: "",
                        ts = c.getLong(dateIdx),
                    ),
                )
                if (batch.size >= BATCH_SIZE) {
                    flushBatch(ctx, batch)
                    batch.clear()
                    delay(50)
                }
            }
            if (batch.isNotEmpty()) flushBatch(ctx, batch)
        }
        return Result.success()
    }

    private fun flushBatch(ctx: Context, batch: List<IngestionEvent>) {
        val payload: Bundle = com.facebook.react.bridge.Arguments.toBundle(batch.toReactPayload()) ?: return
        val svc = android.content.Intent(ctx, HeadlessIngestionTaskService::class.java)
        svc.putExtras(payload)
        ctx.startService(svc)
        HeadlessJsTaskService.acquireWakeLockNow(ctx)
    }
}
