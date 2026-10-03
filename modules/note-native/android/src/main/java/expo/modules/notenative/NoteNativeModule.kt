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
 * Native YouTube via NewPipeExtractor.
 *
 * Online play: progressive HTTP only (expo-audio).
 * Offline download (Musify pattern):
 *   getManifest → audioOnly.withHighestBitrate() → pipe full stream to .m4a
 * Adaptive audio-only is OK offline — local m4a plays fine.
 */
class NoteNativeModule : Module() {

  private companion object {
    val initLock = Any()

    @Volatile
    var initialized = false

    const val DOWNLOAD_CONNECT_MS = 30_000
    const val DOWNLOAD_READ_MS = 300_000 // up to 5 min for long tracks
    const val BUFFER = 128 * 1024
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

      // Streaming playback still needs progressive HTTP for expo-audio
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

  /**
   * Musify offline flow:
   * streamsClient.getManifest → audioOnly highest bitrate → pipe to file.
   * Tries progressive first, then adaptive audio-only (itag 140-style m4a).
   */
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

      val candidates = audioDownloadCandidates(info.audioStreams)
      if (candidates.isEmpty()) {
        return failure("no_audio_stream", "No downloadable audio stream")
      }

      val outFile = File(destPath)
      outFile.parentFile?.mkdirs()

      var lastError: String? = null

      for (stream in candidates) {
        val streamUrl = stream.content
        if (streamUrl.isNullOrBlank()) continue

        try {
          if (outFile.exists()) outFile.delete()

          val written = streamToFile(streamUrl, outFile)
          val minExpected = minBytesFor(info.duration, stream.averageBitrate)

          if (written < minExpected) {
            outFile.delete()
            lastError = "Incomplete: $written bytes (need >= $minExpected)"
            continue
          }

          // Success — same as Musify saving tracks/<ytid>.m4a
          return mapOf(
            "ok" to true,
            "path" to outFile.absolutePath,
            "uri" to "file://${outFile.absolutePath}",
            "bytes" to written,
            "mimeType" to stream.format?.mimeType,
            "bitrate" to stream.averageBitrate,
            "durationSeconds" to info.duration,
            "title" to info.name,
            "uploader" to info.uploaderName,
            "delivery" to stream.deliveryMethod.name,
            "extractor" to "NewPipeExtractor/musify-pipe"
          )
        } catch (e: Exception) {
          lastError = e.message ?: e.javaClass.simpleName
          try {
            outFile.delete()
          } catch (_: Exception) {
          }
        }
      }

      failure("network", lastError ?: "All audio streams failed to download fully")
    } catch (e: Throwable) {
      try {
        File(destPath).delete()
      } catch (_: Exception) {
      }
      classify(e)
    }
  }

  /**
   * Ordered like Musify audioOnly.sortByBitrate / withHighestBitrate:
   * 1) Progressive HTTP (highest bitrate first)
   * 2) Any other audio URL (adaptive m4a etc.), highest bitrate first
   * Skip HLS (segmented — not a single file).
   */
  private fun audioDownloadCandidates(streams: List<AudioStream>?): List<AudioStream> {
    if (streams.isNullOrEmpty()) return emptyList()

    val usable =
      streams.filter {
        it.isUrl &&
          !it.content.isNullOrBlank() &&
          it.deliveryMethod != DeliveryMethod.HLS &&
          it.deliveryMethod != DeliveryMethod.TORRENT
      }

    val progressive =
      usable
        .filter { it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP }
        .sortedByDescending { it.averageBitrate }

    val adaptive =
      usable
        .filter { it.deliveryMethod != DeliveryMethod.PROGRESSIVE_HTTP }
        .sortedByDescending { it.averageBitrate }

    // Prefer progressive for simpler files; then adaptive audio-only (Musify default)
    return progressive + adaptive
  }

  private fun minBytesFor(durationSec: Long, bitrate: Int): Long {
    // bitrate is often averageBitrate in bps or kbps depending on extractor — use soft floor
    val dur = if (durationSec > 0) durationSec else 120L
    val fromBitrate =
      if (bitrate > 1000) {
        // assume bits/sec
        (dur * bitrate) / 8
      } else if (bitrate > 0) {
        // assume kbps
        dur * bitrate * 125L
      } else {
        0L
      }
    // ~48 kbps floor × duration, at least 80 KB
    val floor = (dur * 6_000L).coerceAtLeast(80_000L)
    return maxOf(floor, (fromBitrate * 0.7).toLong())
  }

  /**
   * Full body pipe until EOF — Musify's stream.pipe(fileStream).
   */
  @Throws(IOException::class)
  private fun streamToFile(streamUrl: String, outFile: File): Long {
    var currentUrl = streamUrl
    var redirects = 0

    while (redirects < 10) {
      val connection = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = DOWNLOAD_CONNECT_MS
        readTimeout = DOWNLOAD_READ_MS
        instanceFollowRedirects = false
        setRequestProperty("User-Agent", NoteNativeDownloader.USER_AGENT)
        setRequestProperty("Accept", "*/*")
        setRequestProperty("Accept-Encoding", "identity")
        setRequestProperty("Connection", "keep-alive")
        // Some googlevideo nodes need a referer
        setRequestProperty("Referer", "https://www.youtube.com/")
        setRequestProperty("Origin", "https://www.youtube.com")
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

        if (code == 403 || code == 401) {
          throw IOException("HTTP $code — stream URL expired or blocked")
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
        try {
          input.close()
        } catch (_: Exception) {
        }

        // Musify completes when pipe finishes; also verify Content-Length if present
        if (expected > 10_000L && written < (expected * 0.97).toLong()) {
          outFile.delete()
          throw IOException("Incomplete body: $written / $expected bytes")
        }

        if (written < 20_000L) {
          outFile.delete()
          throw IOException("File too small: $written bytes")
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
