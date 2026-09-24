package expo.modules.notenative

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.exceptions.AccountTerminatedException
import org.schabi.newpipe.extractor.exceptions.AgeRestrictedContentException
import org.schabi.newpipe.extractor.exceptions.ContentNotAvailableException
import org.schabi.newpipe.extractor.exceptions.ContentNotSupportedException
import org.schabi.newpipe.extractor.exceptions.ExtractionException
import org.schabi.newpipe.extractor.exceptions.GeographicRestrictionException
import org.schabi.newpipe.extractor.exceptions.PaidContentException
import org.schabi.newpipe.extractor.exceptions.PrivateContentException
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.exceptions.SignInConfirmNotBotException
import org.schabi.newpipe.extractor.exceptions.YoutubeMusicPremiumContentException
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamType
import java.io.IOException

class NoteNativeModule : Module() {

  private companion object {
    val initLock = Any()

    @Volatile
    var initialized = false
  }

  override fun definition() = ModuleDefinition {
    Name("NoteNative")

    Function("getPlatformInfo") {
      return@Function mapOf(
        "platform" to "android",
        "native" to true,
        "androidSdkInt" to Build.VERSION.SDK_INT
      )
    }

    AsyncFunction("resolveYouTubeStream") { videoId: String ->
      resolveYouTubeStream(videoId)
    }
  }

  private fun ensureInitialized() {
    if (initialized) return
    synchronized(initLock) {
      if (initialized) return
      NewPipe.init(
        NoteNativeDownloader(),
        Localization("en", "US"),
        ContentCountry("US")
      )
      initialized = true
    }
  }

  private fun resolveYouTubeStream(videoId: String): Map<String, Any?> {
    if (videoId.isBlank()) {
      return failure("invalid_id", "No video id supplied")
    }

    return try {
      ensureInitialized()

      val url = "https://www.youtube.com/watch?v=$videoId"
      val info = StreamInfo.getInfo(ServiceList.YouTube, url)

      when (info.streamType) {
        StreamType.LIVE_STREAM,
        StreamType.AUDIO_LIVE_STREAM ->
          return failure("live_stream", "Live streams are not supported yet")
        StreamType.NONE ->
          return failure("unsupported", "No playable stream for this item")
        else -> Unit
      }

      val best = bestProgressiveAudio(info.audioStreams)
        ?: return failure(
          "no_audio_stream",
          "No progressive audio stream available for this track"
        )

      mapOf(
        "ok" to true,
        "url" to best.content,
        "mimeType" to best.format?.mimeType,
        "bitrate" to best.averageBitrate,
        "durationSeconds" to info.duration,
        "title" to info.name,
        "uploader" to info.uploaderName,
        "streamType" to info.streamType.name,
        "extractor" to "NewPipeExtractor/v0.26.5",
        "userAgent" to NoteNativeDownloader.USER_AGENT
      )
    } catch (e: Throwable) {
      classify(e)
    }
  }

  private fun bestProgressiveAudio(streams: List<AudioStream>?): AudioStream? =
    streams
      ?.filter { it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP }
      ?.filter { it.isUrl && !it.content.isNullOrBlank() }
      ?.maxByOrNull { it.averageBitrate }

  private fun classify(e: Throwable): Map<String, Any?> {
    val message = e.message ?: e.javaClass.simpleName

    val reason = when (e) {
      is GeographicRestrictionException -> "geo_restricted"
      is AgeRestrictedContentException -> "age_restricted"
      is PaidContentException,
      is YoutubeMusicPremiumContentException -> "paid_content"
      is PrivateContentException -> "private_content"
      is AccountTerminatedException -> "unavailable"
      is SignInConfirmNotBotException -> "sign_in_required"
      is ReCaptchaException -> "rate_limited"
      is ContentNotSupportedException -> "unsupported"
      is ContentNotAvailableException -> "unavailable"
      is ExtractionException -> "extraction_failed"
      is IOException -> "network"
      else -> "unknown"
    }

    return failure(reason, message, e.javaClass.name)
  }

  private fun failure(reason: String, message: String, exception: String? = null) =
    mapOf(
      "ok" to false,
      "reason" to reason,
      "message" to message,
      "exception" to exception
    )
}
