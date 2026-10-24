package club.playfit.tv

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var status: LinearLayout
    private lateinit var progress: ProgressBar
    private lateinit var statusTitle: TextView
    private lateinit var statusDetail: TextView
    private lateinit var retry: Button
    private var pageFailed = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        webView = findViewById(R.id.web)
        status = findViewById(R.id.status)
        progress = findViewById(R.id.progress)
        statusTitle = findViewById(R.id.status_title)
        statusDetail = findViewById(R.id.status_detail)
        retry = findViewById(R.id.retry)

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.setBackgroundColor(getColor(R.color.charcoal))
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = SslPolicy.mixedContentMode
            userAgentString = "$userAgentString PlayFitTV"
        }
        webView.webViewClient = PlayClient()
        retry.setOnClickListener { webView.loadUrl(BuildConfig.TV_START_URL) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!goBackInSession()) finish()
            }
        })

        showLoading()
        webView.loadUrl(BuildConfig.TV_START_URL)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
            if (goBackInSession()) return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun goBackInSession(): Boolean {
        if (pageFailed) return false
        val path = webView.url?.let { Uri.parse(it).path }.orEmpty()
        if (path == "/tv/play" || path.startsWith("/tv/play/")) {
            webView.loadUrl(homeUrl(BuildConfig.TV_START_URL))
            return true
        }
        if (webView.canGoBack()) {
            webView.goBack()
            return true
        }
        return false
    }

    private fun showLoading() {
        pageFailed = false
        status.visibility = View.VISIBLE
        progress.visibility = View.VISIBLE
        retry.visibility = View.GONE
        statusTitle.setText(R.string.loading_title)
        statusDetail.setText(R.string.loading_detail)
    }

    private fun showError(detail: String) {
        pageFailed = true
        status.visibility = View.VISIBLE
        progress.visibility = View.GONE
        retry.visibility = View.VISIBLE
        statusTitle.setText(R.string.error_title)
        statusDetail.text = detail.ifBlank { getString(R.string.error_detail) }
        retry.requestFocus()
    }

    private fun showWeb() {
        pageFailed = false
        status.visibility = View.GONE
        webView.requestFocus()
    }

    private inner class PlayClient : WebViewClient() {
        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            showLoading()
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            if (!pageFailed) showWeb()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            showError(error.description?.toString() ?: getString(R.string.error_detail))
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
            if (!SslPolicy.allowDevCertificate(handler)) {
                showError(getString(R.string.ssl_release))
            }
        }
    }

    companion object {
        fun homeUrl(start: String): String {
            val uri = Uri.parse(start)
            return uri.buildUpon().path("/tv").clearQuery().fragment(null).build().toString()
        }
    }
}
