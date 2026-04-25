package com.google.aura.watch

import com.google.aura.watch.ble.BleConstants
import org.junit.Assert.assertEquals
import org.junit.Test

class BleConstantsTest {
    @Test
    fun watchUuidMatchesSpecification() {
        assertEquals(
            "2E6A0004-C4B2-4D6E-A591-7F8B2D3E1A00",
            BleConstants.WATCH_SERVICE_UUID.toString().uppercase(),
        )
        assertEquals(
            "2E6A0005-C4B2-4D6E-A591-7F8B2D3E1A00",
            BleConstants.WATCH_TRIGGER_CHARACTERISTIC_UUID.toString().uppercase(),
        )
    }
}