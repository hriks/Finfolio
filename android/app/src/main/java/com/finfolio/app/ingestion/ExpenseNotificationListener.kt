package com.finfolio.app.ingestion

import android.app.Notification
import android.content.Intent
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
        val payload: Bundle = com.facebook.react.bridge.Arguments.toBundle(
            listOf(event).toReactPayload(),
        ) ?: return

        val svc = Intent(applicationContext, HeadlessIngestionTaskService::class.java)
        svc.putExtras(payload)
        applicationContext.startService(svc)
        HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
    }
}
