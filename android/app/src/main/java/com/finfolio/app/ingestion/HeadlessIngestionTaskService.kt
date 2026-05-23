package com.finfolio.app.ingestion

import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

private const val TAG = "Finfolio.Headless"

class HeadlessIngestionTaskService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras
        if (extras == null) {
            Log.w(TAG, "no extras on intent")
            return null
        }
        val data = Arguments.fromBundle(extras)
        Log.i(TAG, "dispatching IngestionTask with keys=${data?.toHashMap()?.keys}")
        return HeadlessJsTaskConfig(
            "IngestionTask",
            data,
            30_000L,
            true,
        )
    }
}
