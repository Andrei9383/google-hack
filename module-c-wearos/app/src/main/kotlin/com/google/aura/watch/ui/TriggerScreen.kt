package com.google.aura.watch.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun TriggerScreen(
    isConnected: Boolean,
    onTrigger: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .padding(18.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                text = "AURA WATCH",
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )

            Text(
                text = if (isConnected) "Phone connected" else "Waiting for phone",
                color = if (isConnected) Color(0xFFB7FFD8) else Color(0xFFFFC8C0),
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
            )

            Button(
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFF2FD08C),
                    contentColor = Color(0xFF04140D),
                ),
                modifier = Modifier.size(120.dp),
                onClick = onTrigger,
                shape = CircleShape,
            ) {
                Text(
                    text = "SPEAK\nOBJECTS",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Black,
                    textAlign = TextAlign.Center,
                )
            }

            Box(
                modifier = Modifier
                    .size(12.dp)
                    .background(
                        color = if (isConnected) Color(0xFF2FD08C) else Color(0xFFF26B5E),
                        shape = CircleShape,
                    ),
            )

            Text(
                text = "Press the button or shake your wrist to have the phone describe what it sees.",
                color = Color(0xFFD8E7EE),
                fontSize = 11.sp,
                textAlign = TextAlign.Center,
            )
        }
    }
}