package club.playfit.tv

import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.webkit.WebSettings

/**
 * Debug builds accept the local dev certificate and cleartext so a LAN WebView can open the dev server.
 * This trusts certificates the device has not verified. Do not ship a debug build.
 */
object SslPolicy {
    val mixedContentMode: Int = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

    fun allowDevCertificate(handler: SslErrorHandler, @Suppress("UNUSED_PARAMETER") error: SslError? = null): Boolean {
        handler.proceed()
        return true
    }
}
