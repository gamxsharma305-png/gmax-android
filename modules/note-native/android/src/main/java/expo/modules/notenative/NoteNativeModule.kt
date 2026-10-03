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
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Native YouTube audio via NewPipeExtractor.
 * resolveYouTubeStream → progressive HTTP URL for playback.
 * downloadYouTubeAudio → full byte stream to disk (Musify-style).
 */
class NoteNativeModule : Module() {

  private companion object {
    val initLock = Any()

    @Volatile
    var initialized = false

    const val DOWNLOAD_CONNECT_MS = 30_000
    const val DOWNLOAD_READ_MS = 180_000 // long songs
    const val BUFFER = 64 * 1024
  }

  override fun definition() = ModuleDefinition {
    Name("NoteNative")

    Function("getPlatformInfo") {
      return@Function mapOf(
        "platform" to "android",
        "native" to true,
        "androidSdkInt" to Build.VERSION.SDK_INT,
        "extractor" to "NewPipeExtractor"
      )
    }

    AsyncFunction("resolveYouTubeStream") { videoId: String ->
      resolveYouTubeStream(videoId)
    }

    /**
     * Resolve + download FULL progressive audio to destPath.
     * destPath is absolute filesystem path (no file://).
     */
    AsyncFunction("downloadYouTubeAudio") { videoId: String, destPath: String ->
      downloadYouTubeAudio(videoId, destPath)
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
    val id = videoId.trim()
    if (id.isBlank() || id.length < 6) {
      return failure("invalid_id", "No video id supplied")
    }

    return try {
      ensureInitialized()

      val url =
        if (id.startsWith("http")) id else "https://www.youtube.com/watch?v=$id"
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

  private fun downloadYouTubeAudio(videoId: String, destPath: String): Map<String, Any?> {
    val id = videoId.trim()
    if (id.isBlank() || id.length < 6) {
      return failure("invalid_id", "No video id supplied")
    }
    if (destPath.isBlank()) {
      return failure("invalid_id", "No destination path")
    }

    return try {
      ensureInitialized()

      val watchUrl =
        if (id.startsWith("http")) id else "https://www.youtube.com/watch?v=$id"
      val info = StreamInfo.getInfo(ServiceList.YouTube, watchUrl)

      when (info.streamType) {
        StreamType.LIVE_STREAM,
        StreamType.AUDIO_LIVE_STREAM ->
          return failure("live_stream", "Live streams cannot be downloaded")
        StreamType.NONE ->
          return failure("unsupported", "No playable stream")
        else -> Unit
      }

      val best = bestProgressiveAudio(info.audioStreams)
        ?: return failure("no_audio_stream", "No progressive audio stream")

      val streamUrl = best.content
      if (streamUrl.isNullOrBlank()) {
        return failure("no_audio_stream", "Empty stream URL")
      }

      val outFile = File(destPath)
      outFile.parentFile?.mkdirs()
      if (outFile.exists()) {
        outFile.delete()
      }

      val written = streamToFile(streamUrl, outFile)
      val minExpected =
        if (info.duration > 0) {
          // ~32 kbps floor for duration
          (info.duration * 4000L).coerceAtLeast(40_000L)
        } else {
          40_000L
        }

      if (written < minExpected) {
        outFile.delete()
        return failure(
          "network",
          "Incomplete download: $written bytes (expected >= $minExpected)"
        )
      }

      mapOf(
        "ok" to true,
        "path" to outFile.absolutePath,
        "uri" to "file://${outFile.absolutePath}",
        "bytes" to written,
        "mimeType" to best.format?.mimeType,
        "bitrate" to best.averageBitrate,
        "durationSeconds" to info.duration,
        "title" to info.name,
        "uploader" to info.uploaderName,
        "extractor" to "NewPipeExtractor/download"
      )
    } catch (e: Throwable) {
      try {
        File(destPath).delete()
      } catch (_: Exception) {
      }
      classify(e)
    }
  }

  /**
   * Pipe entire progressive body to disk until EOF.
   * Follows redirects; requires near-full Content-Length when present.
   */
  @Throws(IOException::class)
  private fun streamToFile(streamUrl: String, outFile: File): Long {
    var currentUrl = streamUrl
    var redirects = 0

    while (redirects < 8) {
      val connection = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = DOWNLOAD_CONNECT_MS
        readTimeout = DOWNLOAD_READ_MS
        instanceFollowRedirects = false // handle manually for googlevideo
        setRequestProperty("User-Agent", NoteNativeDownloader.USER_AGENT)
        setRequestProperty("Accept", "*/*")
        setRequestProperty("Accept-Encoding", "identity")
        setRequestProperty("Connection", "keep-alive")
      }

      try {
        val code = connection.responseCode
        if (code in 301..308) {
          val loc = connection.getHeaderField("Location")
            ?: throw IOException("Redirect without Location ($code)")
          currentUrl =
            if (loc.startsWith("http")) loc
            else URL(URL(currentUrl), loc).toString()
          redirects++
          connection.disconnect()
          continue
        }

        if (code !in 200..299) {
          throw IOException("HTTP $code downloading audio")
        }

        val expected = connection.contentLengthLong
        val input: InputStream = connection.inputStream
          ?: throw IOException("Empty response body")

        var written = 0L
        FileOutputStream(outFile).use { fos ->
          val buf = ByteArray(BUFFER)
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            fos.write(buf, 0, n)
            written += n
          }
          fos.flush()
        }
        input.close()

        if (expected > 10_000 && written < (expected * 0.98).toLong()) {
          outFile.delete()
          throw IOException("Incomplete body: $written / $expected bytes")
        }

        return written
      } finally {
        try {
          connection.disconnect()
        } catch (_: Exception) {
        }
      }
    }

    throw IOException("Too many redirects")
  }

  /** expo-audio needs progressive HTTP — not DASH/HLS. */
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
