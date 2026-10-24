plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

import org.jetbrains.kotlin.gradle.dsl.JvmTarget

val tvStartUrl = (findProperty("TV_START_URL") as String?)?.trim()?.ifEmpty { null } ?: "https://localhost:3000/tv"
require(tvStartUrl.startsWith("https://") || tvStartUrl.startsWith("http://")) {
    "TV_START_URL must start with http:// or https://"
}

android {
    namespace = "club.playfit.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "club.playfit.tv"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "TV_START_URL", "\"${tvStartUrl.replace("\\", "\\\\").replace("\"", "")}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            // Cleartext and self-signed certificates are debug source-set only.
        }
        release {
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
