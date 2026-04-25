package com.google.aura.watch.ui

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class TriggerUiState(
    val isConnected: Boolean = false,
)

class TriggerViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(TriggerUiState())
    val uiState: StateFlow<TriggerUiState> = _uiState.asStateFlow()

    fun setConnected(connected: Boolean) {
        _uiState.value = _uiState.value.copy(isConnected = connected)
    }
}