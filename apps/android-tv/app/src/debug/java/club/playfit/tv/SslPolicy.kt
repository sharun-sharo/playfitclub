package club.playfit.tv

import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.webkit.WebSettings

/** Debug builds keep platform TLS checks. The shell opens the public site. */
object SslPolicy {
    val mixedContentMode: Int = WebSettings.MIXED_CONTENT_NEVER_ALLOW

    fun allowDevCertificate(handler: SslErrorHandler, @Suppress("UNUSED_PARAMETER") error: SslError? = null): Boolean {
        handler.cancel()
        return false
    }
}
