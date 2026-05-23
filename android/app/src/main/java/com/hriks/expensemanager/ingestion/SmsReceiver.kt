package com.hriks.expensemanager.ingestion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Telephony
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

private const val TAG = "ExpenseManager.SMS"

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "onReceive action=${intent.action}")
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            Log.i(TAG, "ignored: not SMS_RECEIVED_ACTION")
            return
        }
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages == null || messages.isEmpty()) {
            Log.w(TAG, "no messages in intent")
            return
        }
        Log.i(TAG, "received ${messages.size} part(s)")

        val grouped = messages.groupBy { it.originatingAddress to it.timestampMillis }
        val events = grouped.map { (key, parts) ->
            val (sender, ts) = key
            val body = parts.joinToString(separator = "") { it.displayMessageBody ?: "" }
            Log.i(TAG, "event sender=$sender ts=$ts bodyLen=${body.length}")
            IngestionEvent("sms", sender, body, ts)
        }
        if (events.isEmpty()) {
            Log.w(TAG, "no events after grouping")
            return
        }

        val payload: Bundle? = ReactArgs.toBundle(events.toReactPayload())
        if (payload == null) {
            Log.e(TAG, "failed to build payload bundle")
            return
        }

        try {
            val svc = Intent(context.applicationContext, HeadlessIngestionTaskService::class.java)
            svc.putExtras(payload)
            context.applicationContext.startService(svc)
            HeadlessJsTaskService.acquireWakeLockNow(context.applicationContext)
            Log.i(TAG, "dispatched ${events.size} event(s) to headless JS")
        } catch (e: Throwable) {
            Log.e(TAG, "dispatch failed", e)
        }
    }
}

private object ReactArgs {
    fun toBundle(map: com.facebook.react.bridge.WritableMap): Bundle? =
        com.facebook.react.bridge.Arguments.toBundle(map)
}
