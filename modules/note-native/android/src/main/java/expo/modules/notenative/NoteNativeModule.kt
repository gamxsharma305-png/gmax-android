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
 * Offline: Musify-style full pipe with Range resume + 403 re-extract.
 */
class NoteNativeModule : Module() {

  private companion object {
    val initLock = Any()

    @Volatile
    var initialized = false

    const val DOWNLOAD_CONNECT_MS = 30_000
    const val DOWNLOAD_READ_MS = 300_000
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

      val candidates = audioDownloadCandidates(info.audioStreams)
      if (candidates.isEmpty()) {
        return failure("no_audio_stream", "No downloadable audio stream")
      }

      val outFile = File(destPath)
      outFile.parentFile?.mkdirs()

      var lastError: String? = null
      var workingInfo = info
      var workingCandidates = candidates

      fun successMap(stream: AudioStream, written: Long): Map<String, Any?> = mapOf(
        "ok" to true,
        "path" to outFile.absolutePath,
        "uri" to "file://${outFile.absolutePath}",
        "bytes" to written,
        "mimeType" to stream.format?.mimeType,
        "bitrate" to stream.averageBitrate,
        "durationSeconds" to workingInfo.duration,
        "title" to workingInfo.name,
        "uploader" to workingInfo.uploaderName,
        "delivery" to stream.deliveryMethod.name,
        "extractor" to "NewPipeExtractor/musify-pipe"
      )

      for (round in 0 until 2) {
        for (stream in workingCandidates) {
          val streamUrl = stream.content
          if (streamUrl.isNullOrBlank()) continue

          try {
            val written = streamToFile(streamUrl, outFile)
            val minExpected = minBytesFor(workingInfo.duration, stream.averageBitrate)

            if (written < minExpected) {
              lastError = "Incomplete: $written bytes (need >= $minExpected)"
              if (written < minExpected / 3) {
                try { outFile.delete() } catch (_: Exception) {}
              }
              continue
            }

            return successMap(stream, written)
          } catch (e: Exception) {
            lastError = e.message ?: e.javaClass.simpleName
            val msg = lastError ?: ""
            if (msg.contains("403") || msg.contains("401") || msg.contains("expired")) {
              try { outFile.delete() } catch (_: Exception) {}
              break
            }
          }
        }

        if (round == 0) {
          try {
            workingInfo = StreamInfo.getInfo(ServiceList.YouTube, watchUrl)
            workingCandidates = audioDownloadCandidates(workingInfo.audioStreams)
            if (workingCandidates.isEmpty()) break
          } catch (e: Exception) {
            lastError = e.message ?: lastError
            break
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

  private fun isAacFamily(stream: AudioStream): Boolean {
    val mime = stream.format?.mimeType?.lowercase() ?: ""
    val name = stream.format?.name?.lowercase() ?: ""
    return mime.contains("mp4") ||
      mime.contains("m4a") ||
      mime.contains("aac") ||
      name.contains("m4a") ||
      name.contains("mp4")
  }

  private fun isWebmFamily(stream: AudioStream): Boolean {
    val mime = stream.format?.mimeType?.lowercase() ?: ""
    return mime.contains("webm") || mime.contains("opus")
  }

  private fun audioDownloadCandidates(streams: List<AudioStream>?): List<AudioStream> {
    if (streams.isNullOrEmpty()) return emptyList()

    val usable =
      streams.filter {
        it.isUrl &&
          !it.content.isNullOrBlank() &&
          it.deliveryMethod != DeliveryMethod.HLS &&
          it.deliveryMethod != DeliveryMethod.TORRENT
      }

    fun rank(s: AudioStream): Int {
      var score = s.averageBitrate
      if (isAacFamily(s)) score += 100_000
      if (s.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP) score += 10_000
      if (isWebmFamily(s)) score -= 50_000
      return score
    }

    return usable.sortedByDescending { rank(it) }
  }

  private fun minBytesFor(durationSec: Long, bitrate: Int): Long {
    val dur = if (durationSec > 0) durationSec else 120L
    val fromBitrate =
      if (bitrate > 1000) {
        (dur * bitrate) / 8
      } else if (bitrate > 0) {
        dur * bitrate * 125L
      } else {
        0L
      }
    val floor = (dur * 6_000L).coerceAtLeast(80_000L)
    return maxOf(floor, (fromBitrate * 0.7).toLong())
  }

  @Throws(IOException::class)
  private fun streamToFile(streamUrl: String, outFile: File): Long {
    var currentUrl = streamUrl
    var redirects = 0
    val maxAttempts = 5
    var lastError: Exception? = null

    for (attempt in 0 until maxAttempts) {
      try {
        val existingSize = if (outFile.exists()) outFile.length() else 0L
        var written = existingSize

        val connection = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
          requestMethod = "GET"
          connectTimeout = DOWNLOAD_CONNECT_MS
          readTimeout = DOWNLOAD_READ_MS
          instanceFollowRedirects = false
          setRequestProperty("User-Agent", NoteNativeDownloader.USER_AGENT)
          setRequestProperty("Accept", "*/*")
          setRequestProperty("Accept-Encoding", "identity")
          setRequestProperty("Connection", "keep-alive")
          setRequestProperty("Referer", "https://www.youtube.com/")
          setRequestProperty("Origin", "https://www.youtube.com")
          if (existingSize > 0L) {
            setRequestProperty("Range", "bytes=$existingSize-")
          }
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
            if (redirects > 8) throw IOException("Too many redirects")
            connection.disconnect()
            continue
          }

          if (code == 416) {
            val len = outFile.length()
            if (len >= 30_000L) return len
            outFile.delete()
            throw IOException("HTTP 416 with tiny file: $len")
          }

          if (code == 403 || code == 401) {
            try { outFile.delete() } catch (_: Exception) {}
            throw IOException("HTTP $code — stream URL expired or blocked")
          }

          if (code != 200 && code != 206) {
            throw IOException("HTTP $code downloading audio")
          }

          val contentLength = connection.contentLengthLong
          val expectedTotal: Long = when {
            code == 206 -> {
              val cr = connection.getHeaderField("Content-Range")
              val total = cr?.substringAfter("/")?.toLongOrNull()
              total ?: (if (contentLength > 0) existingSize + contentLength else -1L)
            }
            contentLength > 0 -> contentLength
            else -> -1L
          }

          val append = code == 206 && existingSize > 0L
          if (code == 200 && existingSize > 0L) {
            outFile.delete()
            written = 0L
          }

          val input: InputStream = connection.inputStream
            ?: throw IOException("Empty response body")

          (if (append) FileOutputStream(outFile, true) else FileOutputStream(outFile)).use { fos ->
            val buf = ByteArray(BUFFER)
            while (true) {
              val n = input.read(buf)
              if (n < 0) break
              fos.write(buf, 0, n)
              written += n
            }
            fos.flush()
          }
          try { input.close() } catch (_: Exception) {}

          val finalSize = outFile.length()

          if (expectedTotal > 10_000L && finalSize < (expectedTotal * 0.96).toLong()) {
            throw IOException("Incomplete: $finalSize / $expectedTotal")
          }

          if (finalSize < 30_000L) {
            outFile.delete()
            throw IOException("File too small: $finalSize")
          }

          return finalSize
        } finally {
          try { connection.disconnect() } catch (_: Exception) {}
        }
      } catch (e: Exception) {
        lastError = e
        val msg = e.message ?: ""
        if (msg.contains("HTTP 403") || msg.contains("HTTP 401")) {
          throw e
        }
        if (attempt == maxAttempts - 1) throw e
        try {
          Thread.sleep(600L * (attempt + 1).toLong())
        } catch (_: InterruptedException) {
        }
      }
    }

    throw lastError ?: IOException("Download failed after retries")
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
