package com.finfolio.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        // SmsReceiver is registered statically in the manifest, so no work needed here.
        // This receiver exists so Android knows our app wants to run after boot
        // (manifest-registered SMS receivers don't need explicit re-arming).
    }
}
