package club.playfit.tv

import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.webkit.WebSettings

/** Release builds keep platform TLS checks. Cleartext and unverified certificates are refused. */
object SslPolicy {
    val mixedContentMode: Int = WebSettings.MIXED_CONTENT_NEVER_ALLOW

    fun allowDevCertificate(handler: SslErrorHandler, @Suppress("UNUSED_PARAMETER") error: SslError? = null): Boolean {
        handler.cancel()
        return false
    }
}
