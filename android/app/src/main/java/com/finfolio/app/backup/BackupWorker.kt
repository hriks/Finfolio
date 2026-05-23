package com.finfolio.app.backup

import android.content.Context
import android.content.Intent
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments

/**
 * Periodic backup worker.
 *
 * Scheduled in MainApplication.onCreate as a PeriodicWorkRequest (24h interval,
 * UNMETERED + battery-not-low constraints). Each fire spawns a Headless JS
 * task with name "BackupTask"; the JS side invokes BackupService.backupNow
 * with kind='auto'.
 *
 * Dispatches via HeadlessBackupTaskService — keeping backup routing separate
 * from the ingestion task host so each service's task name is unambiguous.
 */
class BackupWorker(ctx: Context, p: WorkerParameters) : CoroutineWorker(ctx, p) {
    override suspend fun doWork(): Result {
        val payload = Arguments.createMap()
        payload.putString("kind", "auto")
        val bundle = Arguments.toBundle(payload) ?: return Result.success()
        val intent = Intent(applicationContext, HeadlessBackupTaskService::class.java)
        intent.putExtras(bundle)
        try {
            applicationContext.startService(intent)
            HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
        } catch (e: IllegalStateException) {
            // App is under background-execution restrictions; let WorkManager
            // retry on the next periodic tick rather than burning this slot.
            return Result.retry()
        }
        return Result.success()
    }
}
