package com.finfolio.app.ingestion

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments

private const val CHANNEL_ID = "expense-manager.txn"

class PermissionStatusModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PermissionStatusModule"

    @ReactMethod
    fun getStatus(promise: Promise) {
        try {
            val ctx = reactApplicationContext
            val pm = ctx.packageManager
            val pkg = ctx.packageName

            val readSms = pm.checkPermission(
                android.Manifest.permission.READ_SMS, pkg,
            ) == PackageManager.PERMISSION_GRANTED
            val receiveSms = pm.checkPermission(
                android.Manifest.permission.RECEIVE_SMS, pkg,
            ) == PackageManager.PERMISSION_GRANTED
            val postNotifications = pm.checkPermission(
                android.Manifest.permission.POST_NOTIFICATIONS, pkg,
            ) == PackageManager.PERMISSION_GRANTED

            val enabledListeners =
                NotificationManagerCompat.getEnabledListenerPackages(ctx)
            val notificationListener = enabledListeners.contains(pkg)

            val powerManager = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            val batteryExempt = powerManager.isIgnoringBatteryOptimizations(pkg)

            val out: WritableMap = Arguments.createMap().apply {
                putBoolean("sms", readSms && receiveSms)
                putBoolean("postNotifications", postNotifications)
                putBoolean("notificationListener", notificationListener)
                putBoolean("batteryExempt", batteryExempt)
            }
            promise.resolve(out)
        } catch (e: Throwable) {
            promise.reject("PERM_STATUS_FAILED", e)
        }
    }

    @ReactMethod
    fun openNotificationListenerSettings(promise: Promise) {
        try {
            val intent = android.content.Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            val act = reactApplicationContext.currentActivity
            if (act != null) {
                act.startActivity(intent)
            } else {
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
            }
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("OPEN_NL_FAILED", e.message ?: e.toString(), e)
        }
    }

    @ReactMethod
    fun consumeLaunchExpenseId(promise: Promise) {
        try {
            val ctx = reactApplicationContext
            val act = ctx.currentActivity
            val intent = act?.intent
            val id = intent?.getStringExtra("expenseId")
            // Clear so we don't re-fire it on every JS reload.
            intent?.removeExtra("expenseId")
            promise.resolve(id)
        } catch (e: Throwable) {
            promise.reject("LAUNCH_ID_FAILED", e)
        }
    }

    @ReactMethod
    fun postTransactionNotification(title: String, body: String, expenseId: String, promise: Promise) {
        try {
            val ctx = reactApplicationContext
            ensureChannel(ctx)
            // Launch MainActivity with the expenseId as an extra so JS can route
            // to ExpenseDetail when the notification is tapped.
            val launchIntent = Intent(ctx, com.finfolio.app.MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                action = Intent.ACTION_MAIN
                addCategory(Intent.CATEGORY_LAUNCHER)
                putExtra("expenseId", expenseId)
            }
            val nid = expenseId.hashCode() and 0x7FFFFFFF
            val pi = PendingIntent.getActivity(
                ctx,
                nid,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val notification = NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_info_details)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(pi)
                .build()
            NotificationManagerCompat.from(ctx).notify(nid, notification)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("POST_NOTIF_FAILED", e)
        }
    }

    private fun ensureChannel(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            val ch = NotificationChannel(
                CHANNEL_ID,
                "Transactions",
                NotificationManager.IMPORTANCE_DEFAULT,
            )
            ch.description = "Auto-imported expense alerts"
            nm.createNotificationChannel(ch)
        }
    }

    @ReactMethod
    fun openBatteryOptimizationSettings(promise: Promise) {
        val ctx = reactApplicationContext
        val act = ctx.currentActivity
        // Try the direct "request exemption" dialog first.
        try {
            val direct = android.content.Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            )
            direct.data = android.net.Uri.parse("package:${ctx.packageName}")
            if (act != null) {
                act.startActivity(direct)
            } else {
                direct.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(direct)
            }
            promise.resolve(true)
            return
        } catch (_: Throwable) {
            // Fall through to the list view.
        }
        // Fallback: open the full battery-optimization list so the user picks the app.
        try {
            val list = android.content.Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            if (act != null) {
                act.startActivity(list)
            } else {
                list.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(list)
            }
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.reject("OPEN_BATTERY_FAILED", e.message ?: e.toString(), e)
        }
    }
}
