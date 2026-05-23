package com.hriks.expensemanager.ingestion

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

data class IngestionEvent(
    val source: String,
    val sourceRef: String?,
    val body: String,
    val ts: Long,
)

fun List<IngestionEvent>.toReactPayload(): WritableMap {
    val arr: WritableArray = Arguments.createArray()
    for (e in this) {
        val m: WritableMap = Arguments.createMap()
        m.putString("source", e.source)
        m.putString("sourceRef", e.sourceRef)
        m.putString("body", e.body)
        m.putDouble("ts", e.ts.toDouble())
        arr.pushMap(m)
    }
    val out: WritableMap = Arguments.createMap()
    out.putArray("events", arr)
    return out
}
