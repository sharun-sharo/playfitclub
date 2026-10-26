plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.net.URI

val tvStartUrl = (findProperty("TV_START_URL") as String?)?.trim()?.ifEmpty { null } ?: "https://playfitclub.com"
require(tvStartUrl.startsWith("https://")) {
    "TV_START_URL must be an https URL"
}
val tvHost = runCatching { URI(tvStartUrl).host?.lowercase() }.getOrNull().orEmpty()
require(
    tvHost.isNotEmpty() &&
        tvHost != "localhost" &&
        tvHost != "127.0.0.1" &&
        tvHost != "::1" &&
        tvHost != "0.0.0.0",
) {
    "TV_START_URL must not point at localhost"
}

val releaseStoreFile = System.getenv("PLAYFIT_TV_STORE_FILE")?.trim().orEmpty()
val releaseStorePassword = System.getenv("PLAYFIT_TV_STORE_PASSWORD").orEmpty()
val releaseKeyAlias = System.getenv("PLAYFIT_TV_KEY_ALIAS").orEmpty()
val releaseKeyPassword = System.getenv("PLAYFIT_TV_KEY_PASSWORD").orEmpty()
if (releaseStoreFile.isNotEmpty()) {
    require(releaseStorePassword.isNotEmpty() && releaseKeyAlias.isNotEmpty() && releaseKeyPassword.isNotEmpty()) {
        "Set PLAYFIT_TV_STORE_PASSWORD, PLAYFIT_TV_KEY_ALIAS, and PLAYFIT_TV_KEY_PASSWORD with PLAYFIT_TV_STORE_FILE"
    }
}

android {
    namespace = "club.playfit.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "club.playfit.tv"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "TV_START_URL", "\"${tvStartUrl.replace("\\", "\\\\").replace("\"", "")}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        if (releaseStoreFile.isNotEmpty()) {
            create("release") {
                storeFile = file(releaseStoreFile)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
        }
        release {
            if (releaseStoreFile.isNotEmpty()) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
}
