package com.finfolio.app.backup

import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

private const val TAG = "Finfolio.BackupHost"

/**
 * Headless host for the JS-side BackupTask handler (see ingestion-task.ts).
 *
 * Dispatches "BackupTask" with the bundle extras forwarded from BackupWorker
 * (currently just `kind=auto`). Lives in its own service so dispatch routing
 * isn't conflated with IngestionTask.
 */
class HeadlessBackupTaskService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras
        val data = if (extras != null) Arguments.fromBundle(extras) else Arguments.createMap()
        Log.i(TAG, "dispatching BackupTask")
        // Generous timeout: encryption + Drive upload can take ~30-90s on slow
        // links. WorkManager will keep the wakelock until the task resolves.
        return HeadlessJsTaskConfig(
            "BackupTask",
            data,
            120_000L,
            true,
        )
    }
}
