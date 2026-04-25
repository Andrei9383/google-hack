package expo.modules.auranative

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.objects.ObjectDetection
import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AuraNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AuraNative")

    AsyncFunction("detectObjectsAsync") { uri: String ->
      val context = requireContext()
      val detector = ObjectDetection.getClient(
        ObjectDetectorOptions.Builder()
          .setDetectorMode(ObjectDetectorOptions.SINGLE_IMAGE_MODE)
          .enableClassification()
          .enableMultipleObjects()
          .build()
      )
      val labeler = ImageLabeling.getClient(ImageLabelerOptions.DEFAULT_OPTIONS)

      try {
        val image = InputImage.fromFilePath(context, Uri.parse(uri))
        val imageLabels = Tasks.await(labeler.process(image))
          .filter { it.confidence >= 0.5f }
          .sortedByDescending { it.confidence }
          .map {
            mapOf(
              "text" to it.text,
              "confidence" to it.confidence.toDouble()
            )
          }
        val results = Tasks.await(detector.process(image))

        if (results.isEmpty() && imageLabels.isNotEmpty()) {
          val topLabel = imageLabels.first()
          listOf(
            mapOf(
              "label" to topLabel["text"],
              "confidence" to topLabel["confidence"],
              "alternativeLabels" to imageLabels,
              "boundingBox" to mapOf(
                "x" to 0.0,
                "y" to 0.0,
                "width" to image.width.toDouble(),
                "height" to image.height.toDouble()
              )
            )
          )
        } else {
          results.map { detectedObject ->
            val objectLabels = detectedObject.labels
              .sortedByDescending { it.confidence }
              .map {
                mapOf(
                  "text" to it.text,
                  "confidence" to it.confidence.toDouble()
                )
              }
            val topLabel = chooseDetailedLabel(objectLabels, imageLabels)

            mapOf(
              "label" to (topLabel?.get("text") ?: "object"),
              "confidence" to ((topLabel?.get("confidence") as? Double) ?: 0.66),
              "alternativeLabels" to mergeLabels(objectLabels, imageLabels),
              "boundingBox" to mapOf(
                "x" to detectedObject.boundingBox.left.toDouble(),
                "y" to detectedObject.boundingBox.top.toDouble(),
                "width" to detectedObject.boundingBox.width().toDouble(),
                "height" to detectedObject.boundingBox.height().toDouble()
              )
            )
          }
        }
      } finally {
        detector.close()
        labeler.close()
      }
    }

    AsyncFunction("startForegroundServiceAsync") { title: String, description: String ->
      AuraForegroundService.start(requireContext(), title, description)
    }

    AsyncFunction("stopForegroundServiceAsync") {
      AuraForegroundService.stop(requireContext())
    }
  }

  private fun chooseDetailedLabel(
    objectLabels: List<Map<String, Any>>,
    imageLabels: List<Map<String, Any>>
  ): Map<String, Any>? {
    val specificObjectLabel = objectLabels.firstOrNull {
      !isGenericLabel(it["text"] as? String)
    }

    if (specificObjectLabel != null) {
      return specificObjectLabel
    }

    return imageLabels.firstOrNull {
      !isGenericLabel(it["text"] as? String)
    } ?: objectLabels.firstOrNull()
  }

  private fun mergeLabels(
    objectLabels: List<Map<String, Any>>,
    imageLabels: List<Map<String, Any>>
  ): List<Map<String, Any>> {
    val seen = mutableSetOf<String>()

    return (objectLabels + imageLabels).filter {
      val normalized = normalizeLabel(it["text"] as? String)

      if (seen.contains(normalized)) {
        false
      } else {
        seen.add(normalized)
        true
      }
    }.take(5)
  }

  private fun isGenericLabel(label: String?): Boolean {
    return setOf("fashion good", "home good", "object", "unknown").contains(normalizeLabel(label))
  }

  private fun normalizeLabel(label: String?): String {
    return label?.trim()?.lowercase() ?: ""
  }

  private fun requireContext(): Context {
    return appContext.reactContext ?: throw IllegalStateException("React context unavailable.")
  }
}
