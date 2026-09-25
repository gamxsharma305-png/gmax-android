package expo.modules.notenative

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Lightweight native bridge. YouTube stream extraction runs in JS
 * (Invidious / Piped) so we do not depend on NewPipe / JitPack.
 */
class NoteNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NoteNative")

    Function("getPlatformInfo") {
      mapOf(
        "platform" to "android",
        "native" to true,
        "androidSdkInt" to Build.VERSION.SDK_INT
      )
    }

    AsyncFunction("resolveYouTubeStream") { _: String ->
      mapOf(
        "ok" to false,
        "reason" to "module_unavailable",
        "message" to "Native extractor disabled; use endpoint resolvers"
      )
    }
  }
}
