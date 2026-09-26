package expo.modules.notenative

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.exceptions.ContentNotAvailableException
import org.schabi.newpipe.extractor.exceptions.ExtractionException
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.StreamInfo

/**
 * Native YouTube audio extractor via NewPipeExtractor.
 * Returns audio URL + User-Agent so expo-audio can play in foreground and background.
 */
class NoteNativeModule : Module() {

  companion object {
    @Volatile
    private var initialized = false

    private fun ensureInit() {
      if (initialized) return
      synchronized(this) {
        if (initialized) return
        NewPipe.init(NoteNativeDownloader.getInstance(), Localization.DEFAULT)
        initialized = true
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NoteNative")

    Function("getPlatformInfo") {
      mapOf(
        "platform" to "android",
        "native" to true,
        "androidSdkInt" to Build.VERSION.SDK_INT,
        "extractor" to "NewPipeExtractor"
      )
    }

    AsyncFunction("resolveYouTubeStream") { videoId: String ->
      withContext(Dispatchers.IO) {
        resolve(videoId)
      }
    }
  }

  private fun resolve(videoId: String): Map<String, Any?> {
    val id = videoId.trim()
    if (id.isEmpty() || id.length < 6) {
      return fail("invalid_id", "Invalid YouTube video id")
    }

    return try {
      ensureInit()

      val watchUrl =
        if (id.startsWith("http")) id else "https://www.youtube.com/watch?v=$id"
      val info = StreamInfo.getInfo(ServiceList.YouTube, watchUrl)

      val audioStreams: List<AudioStream> = info.audioStreams ?: emptyList()
      if (audioStreams.isEmpty()) {
        return fail("no_audio_stream", "No audio stream found for this video")
      }

      val best = audioStreams.maxWithOrNull(
        compareBy<AudioStream> { stream ->
          val name = stream.format?.name?.lowercase() ?: ""
          when {
            "m4a" in name || "mp4" in name -> 2
            "webm" in name -> 1
            else -> 0
          }
        }.thenBy { it.averageBitrate }
      ) ?: audioStreams.maxByOrNull { it.averageBitrate }

      val streamUrl = best?.url
      if (streamUrl.isNullOrBlank()) {
        return fail("no_audio_stream", "Audio stream URL empty")
      }

      val formatName = best?.format?.name?.lowercase() ?: ""
      val mime = when {
        "webm" in formatName -> "audio/webm"
        else -> "audio/mp4"
      }

      mapOf(
        "ok" to true,
        "url" to streamUrl,
        "mimeType" to mime,
        "bitrate" to (best?.averageBitrate ?: 0),
        "durationSeconds" to info.duration.toDouble(),
        "title" to (info.name ?: ""),
        "uploader" to (info.uploaderName ?: ""),
        "streamType" to "audio",
        "extractor" to "NewPipeExtractor",
        "userAgent" to NoteNativeDownloader.USER_AGENT
      )
    } catch (e: ContentNotAvailableException) {
      fail("unavailable", e.message ?: "Content not available")
    } catch (e: ExtractionException) {
      val msg = e.message ?: "Extraction failed"
      val reason = when {
        msg.contains("private", true) -> "private_content"
        msg.contains("age", true) -> "age_restricted"
        msg.contains("geo", true) || msg.contains("country", true) -> "geo_restricted"
        msg.contains("login", true) || msg.contains("sign in", true) -> "sign_in_required"
        msg.contains("live", true) -> "live_stream"
        else -> "extraction_failed"
      }
      fail(reason, msg, e.javaClass.simpleName)
    } catch (e: java.net.UnknownHostException) {
      fail("network", e.message ?: "Network error")
    } catch (e: java.io.IOException) {
      fail("network", e.message ?: "IO error")
    } catch (e: Exception) {
      fail("unknown", e.message ?: e.javaClass.simpleName, e.javaClass.simpleName)
    }
  }

  private fun fail(
    reason: String,
    message: String,
    exception: String? = null
  ): Map<String, Any?> {
    val map = mutableMapOf<String, Any?>(
      "ok" to false,
      "reason" to reason,
      "message" to message
    )
    if (exception != null) map["exception"] = exception
    return map
  }
}
