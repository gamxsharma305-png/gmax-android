package expo.modules.notenative

import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import java.util.concurrent.TimeUnit

/**
 * OkHttp-backed NewPipe downloader with a desktop Chrome User-Agent.
 * Missing / wrong UA is a common cause of googlevideo HTTP 403.
 */
class NoteNativeDownloader private constructor() : Downloader() {

  private val client: OkHttpClient = OkHttpClient.Builder()
    .readTimeout(30, TimeUnit.SECONDS)
    .connectTimeout(15, TimeUnit.SECONDS)
    .followRedirects(true)
    .followSslRedirects(true)
    .build()

  override fun execute(request: Request): Response {
    val httpMethod = request.httpMethod()
    val url = request.url()

    val builder = okhttp3.Request.Builder()
      .url(url)
      .header("User-Agent", USER_AGENT)
      .header("Accept-Language", "en-US,en;q=0.9")

    // Preserve NewPipe request headers (minus UA we force)
    for ((name, values) in request.headers()) {
      if (name.equals("User-Agent", ignoreCase = true)) continue
      for (value in values) {
        builder.addHeader(name, value)
      }
    }

    val bodyBytes = request.dataToSend()
    when (httpMethod.uppercase()) {
      "POST" -> {
        val body = (bodyBytes ?: ByteArray(0)).toRequestBody(null)
        builder.post(body)
      }
      "HEAD" -> builder.head()
      else -> builder.get()
    }

    val response = client.newCall(builder.build()).execute()
    val responseCode = response.code
    val responseMessage = response.message
    val responseHeaders = LinkedHashMap<String, List<String>>()
    for (name in response.headers.names()) {
      responseHeaders[name] = response.headers.values(name)
    }

    val responseBody = response.body?.string() ?: ""

    if (responseCode == 429) {
      throw ReCaptchaException("reCAPTCHA / rate limited", url)
    }

    return Response(
      responseCode,
      responseMessage,
      responseHeaders,
      responseBody,
      url
    )
  }

  companion object {
    const val USER_AGENT =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    @Volatile
    private var instance: NoteNativeDownloader? = null

    fun getInstance(): NoteNativeDownloader {
      return instance ?: synchronized(this) {
        instance ?: NoteNativeDownloader().also { instance = it }
      }
    }
  }
}
