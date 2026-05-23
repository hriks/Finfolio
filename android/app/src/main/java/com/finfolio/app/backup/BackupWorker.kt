package com.finfolio.app.backup

import android.content.Context
import android.content.Intent
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.finfolio.app.ingestion.HeadlessIngestionTaskService

/**
 * Periodic backup worker.
 *
 * Spawns a Headless JS task with name "BackupTask"; the JS side
 * invokes BackupService.backupNow({ kind: 'auto' }).
 *
 * For Plan 5 we re-use the existing HeadlessIngestionTaskService host
 * since it already wires the React context; the JS-side AppRegistry
 * task name routes to BackupTask. Full prod wiring (passphrase + signed-in
 * user + photos dir) lands in Plan 6 with the Settings screen.
 */
class BackupWorker(ctx: Context, p: WorkerParameters) : CoroutineWorker(ctx, p) {
    override suspend fun doWork(): Result {
        val payload = Arguments.createMap()
        payload.putString("kind", "auto")
        val bundle = Arguments.toBundle(payload) ?: return Result.success()
        val intent = Intent(applicationContext, HeadlessIngestionTaskService::class.java)
        intent.putExtras(bundle)
        try {
            applicationContext.startService(intent)
            HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
        } catch (e: IllegalStateException) {
            // App in background restrictions; will retry on next periodic tick
            return Result.retry()
        }
        return Result.success()
    }
}
