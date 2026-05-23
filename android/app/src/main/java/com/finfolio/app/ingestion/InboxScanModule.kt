package com.finfolio.app.ingestion

import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class InboxScanModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "InboxScanModule"

    @ReactMethod
    fun enqueue(sinceMs: Double, promise: Promise) {
        try {
            val data = Data.Builder()
                .putLong("sinceMs", sinceMs.toLong())
                .build()
            val work = OneTimeWorkRequestBuilder<InboxScanWorker>()
                .setInputData(data)
                .build()
            WorkManager.getInstance(reactApplicationContext)
                .enqueueUniqueWork("inbox-scan", ExistingWorkPolicy.REPLACE, work)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("INBOX_SCAN_ENQUEUE_FAILED", e)
        }
    }

    @ReactMethod
    fun cancel(promise: Promise) {
        try {
            WorkManager.getInstance(reactApplicationContext).cancelUniqueWork("inbox-scan")
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("INBOX_SCAN_CANCEL_FAILED", e)
        }
    }
}
