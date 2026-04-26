package expo.modules.auranative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
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
  private val detector by lazy {
    ObjectDetection.getClient(
      ObjectDetectorOptions.Builder()
        .setDetectorMode(ObjectDetectorOptions.SINGLE_IMAGE_MODE)
        .enableClassification()
        .enableMultipleObjects()
        .build()
    )
  }

  private val labeler by lazy {
    ImageLabeling.getClient(ImageLabelerOptions.DEFAULT_OPTIONS)
  }

  override fun definition() = ModuleDefinition {
    Name("AuraNative")

    AsyncFunction("detectObjectsAsync") { uri: String ->
      val context = requireContext()
      val parsedUri = Uri.parse(uri)
      val image = InputImage.fromFilePath(context, parsedUri)
      val results = Tasks.await(detector.process(image))
      val relevantResults = results
        .filter { isNavigationSizedBox(it.boundingBox, image.width, image.height) }
        .sortedByDescending { boxAreaRatio(it.boundingBox, image.width, image.height) }
        .take(6)

      if (relevantResults.isEmpty()) {
        val imageLabels = runImageLabeling(image)

        imageLabels
          .filter { isActionableLabel(it["text"] as? String) }
          .take(3)
          .map { label ->
            mapOf(
              "label" to label["text"],
              "confidence" to label["confidence"],
              "alternativeLabels" to imageLabels,
              "boundingBox" to fullFrameBox(image)
            )
          }
      } else {
        val sourceBitmap = loadBitmap(context, parsedUri)

        relevantResults.map { detectedObject ->
          val objectLabels = detectedObject.labels
            .sortedByDescending { it.confidence }
            .map {
              mapOf(
                "text" to it.text,
                "confidence" to it.confidence.toDouble()
              )
            }
          val cropLabels = if (
            hasActionableLabel(objectLabels) ||
            !shouldRunCropLabeling(detectedObject.boundingBox, image.width, image.height)
          ) {
            emptyList()
          } else {
            runObjectLabeling(sourceBitmap, detectedObject.boundingBox)
          }
          val alternativeLabels = mergeLabels(objectLabels, cropLabels)
          val topLabel = chooseDetailedLabel(objectLabels, cropLabels)

          mapOf(
            "label" to (topLabel?.get("text") ?: "object"),
            "confidence" to ((topLabel?.get("confidence") as? Double) ?: 0.66),
            "alternativeLabels" to alternativeLabels,
            "boundingBox" to mapOf(
              "x" to detectedObject.boundingBox.left.toDouble(),
              "y" to detectedObject.boundingBox.top.toDouble(),
              "width" to detectedObject.boundingBox.width().toDouble(),
              "height" to detectedObject.boundingBox.height().toDouble()
            )
          )
        }
      }
    }

    AsyncFunction("startForegroundServiceAsync") { title: String, description: String ->
      AuraForegroundService.start(requireContext(), title, description)
    }

    AsyncFunction("stopForegroundServiceAsync") {
      AuraForegroundService.stop(requireContext())
    }
  }

  private fun hasActionableLabel(labels: List<Map<String, Any>>): Boolean {
    return labels.any { isActionableLabel(it["text"] as? String) }
  }

  private fun chooseDetailedLabel(
    objectLabels: List<Map<String, Any>>,
    imageLabels: List<Map<String, Any>>,
  ): Map<String, Any>? {
    val specificObjectLabel = objectLabels.firstOrNull {
      isActionableLabel(it["text"] as? String)
    }

    if (specificObjectLabel != null) {
      return specificObjectLabel
    }

    return imageLabels.firstOrNull {
      isActionableLabel(it["text"] as? String)
    } ?: objectLabels.firstOrNull()
  }

  private fun runObjectLabeling(
    sourceBitmap: Bitmap,
    boundingBox: Rect,
  ): List<Map<String, Any>> {
    val croppedBitmap = cropBitmap(sourceBitmap, boundingBox) ?: return emptyList()

    return runImageLabeling(InputImage.fromBitmap(croppedBitmap, 0))
  }

  private fun runImageLabeling(image: InputImage): List<Map<String, Any>> {
    return Tasks.await(labeler.process(image))
      .filter { it.confidence >= 0.5f }
      .sortedByDescending { it.confidence }
      .map {
        mapOf(
          "text" to it.text,
          "confidence" to it.confidence.toDouble()
        )
      }
      .let(::dedupeLabels)
  }

  private fun fullFrameBox(image: InputImage): Map<String, Double> {
    return mapOf(
      "x" to 0.0,
      "y" to 0.0,
      "width" to image.width.toDouble(),
      "height" to image.height.toDouble()
    )
  }

  private fun loadBitmap(context: Context, uri: Uri): Bitmap {
    context.contentResolver.openInputStream(uri).use { stream ->
      return BitmapFactory.decodeStream(stream)
        ?: throw IllegalStateException("Unable to decode source image.")
    }
  }

  private fun cropBitmap(sourceBitmap: Bitmap, boundingBox: Rect): Bitmap? {
    if (sourceBitmap.width <= 0 || sourceBitmap.height <= 0) {
      return null
    }

    val left = boundingBox.left.coerceIn(0, sourceBitmap.width - 1)
    val top = boundingBox.top.coerceIn(0, sourceBitmap.height - 1)
    val right = boundingBox.right.coerceIn(left + 1, sourceBitmap.width)
    val bottom = boundingBox.bottom.coerceIn(top + 1, sourceBitmap.height)
    val width = right - left
    val height = bottom - top

    if (width <= 0 || height <= 0) {
      return null
    }

    return Bitmap.createBitmap(sourceBitmap, left, top, width, height)
  }

  private fun shouldRunCropLabeling(box: Rect, frameWidth: Int, frameHeight: Int): Boolean {
    val areaRatio = boxAreaRatio(box, frameWidth, frameHeight)
    val bottomRatio = box.bottom.toDouble() / frameHeight.coerceAtLeast(1).toDouble()

    return areaRatio >= 0.055 || (bottomRatio >= 0.58 && areaRatio >= 0.025)
  }

  private fun isNavigationSizedBox(box: Rect, frameWidth: Int, frameHeight: Int): Boolean {
    val safeWidth = frameWidth.coerceAtLeast(1).toDouble()
    val safeHeight = frameHeight.coerceAtLeast(1).toDouble()
    val widthRatio = box.width().coerceAtLeast(0).toDouble() / safeWidth
    val heightRatio = box.height().coerceAtLeast(0).toDouble() / safeHeight
    val areaRatio = widthRatio * heightRatio
    val bottomRatio = box.bottom.toDouble() / safeHeight

    return areaRatio >= 0.035 ||
      (heightRatio >= 0.24 && widthRatio >= 0.07) ||
      (bottomRatio >= 0.58 && areaRatio >= 0.02)
  }

  private fun boxAreaRatio(box: Rect, frameWidth: Int, frameHeight: Int): Double {
    val safeWidth = frameWidth.coerceAtLeast(1).toDouble()
    val safeHeight = frameHeight.coerceAtLeast(1).toDouble()

    return (box.width().coerceAtLeast(0).toDouble() / safeWidth) *
      (box.height().coerceAtLeast(0).toDouble() / safeHeight)
  }

  private fun mergeLabels(
    objectLabels: List<Map<String, Any>>,
    imageLabels: List<Map<String, Any>>,
  ): List<Map<String, Any>> {
    return dedupeLabels(objectLabels + imageLabels)
  }

  private fun dedupeLabels(labels: List<Map<String, Any>>): List<Map<String, Any>> {
    val seen = mutableSetOf<String>()

    return labels.filter {
      val normalized = normalizeLabel(it["text"] as? String)

      if (seen.contains(normalized)) {
        false
      } else {
        seen.add(normalized)
        true
      }
    }.take(5)
  }

  private fun isActionableLabel(label: String?): Boolean {
    return !isGenericLabel(label) && !isSceneOnlyLabel(label)
  }

  private fun isGenericLabel(label: String?): Boolean {
    return setOf("fashion good", "home good", "object", "selfie", "unknown").contains(normalizeLabel(label))
  }

  private fun isSceneOnlyLabel(label: String?): Boolean {
    return setOf(
      "atmosphere",
      "ceiling",
      "cloud",
      "daytime",
      "floor",
      "horizon",
      "lighting",
      "room",
      "running",
      "sky",
      "sitting",
      "standing",
      "wall",
      "walking"
    ).contains(normalizeLabel(label))
  }

  private fun normalizeLabel(label: String?): String {
    return label?.trim()?.lowercase() ?: ""
  }

  private fun requireContext(): Context {
    return appContext.reactContext ?: throw IllegalStateException("React context unavailable.")
  }
}
