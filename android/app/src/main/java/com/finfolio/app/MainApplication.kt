package com.finfolio.app

import android.app.Application
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.finfolio.app.backup.BackupWorker
import com.finfolio.app.ingestion.IngestionPackage
import java.util.concurrent.TimeUnit

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(IngestionPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    scheduleAutoBackup()
  }

  /**
   * Schedule a daily Drive backup. KEEP existing policy means the schedule
   * survives across app launches and is only replaced if we explicitly cancel.
   * Constraints (Wi-Fi + battery not low) match what most users expect for an
   * automatic cloud backup — never on cellular, never when nearly dead.
   *
   * If the user hasn't signed in to Drive yet, the JS-side BackupTask handler
   * fails silently (no Drive client available); next tick retries.
   */
  private fun scheduleAutoBackup() {
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.UNMETERED)
      .setRequiresBatteryNotLow(true)
      .build()
    val request = PeriodicWorkRequestBuilder<BackupWorker>(24, TimeUnit.HOURS)
      .setConstraints(constraints)
      .setInitialDelay(15, TimeUnit.MINUTES)
      .build()
    WorkManager.getInstance(applicationContext)
      .enqueueUniquePeriodicWork(
        "finfolio-auto-backup",
        ExistingPeriodicWorkPolicy.KEEP,
        request,
      )
  }
}
