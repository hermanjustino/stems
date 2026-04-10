terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

data "google_project" "current" {
  project_id = var.project_id
}

variable "project_id" {
  type        = string
  description = "The GCP Project ID"
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "The GCP Region"
}

# 1. Enable Required Services
resource "google_project_service" "required_apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "pubsub.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com"
  ])
  service            = each.key
  disable_on_destroy = false
}

# 2. Storage Bucket for Stems
resource "google_storage_bucket" "stem_bucket" {
  name          = "${var.project_id}-demucs-stems"
  location      = var.region
  force_destroy = true

  uniform_bucket_level_access = true
  depends_on                  = [google_project_service.required_apis]
}

# 3. Secret Manager for YouTube Cookies
resource "google_secret_manager_secret" "ytdlp_cookies" {
  secret_id = "ytdlp-cookies"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "ytdlp_cookies_data" {
  secret      = google_secret_manager_secret.ytdlp_cookies.id
  secret_data = file("${path.module}/../demucs-backend/cookies.txt")
}

# 4. Pub/Sub Topic
resource "google_pubsub_topic" "demucs_jobs" {
  name       = "demucs-jobs"
  depends_on = [google_project_service.required_apis]
}

# 5. Frontend Web Service
resource "google_cloud_run_v2_service" "stemify_web" {
  name     = "stemify-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    containers {
      image = "us-east4-docker.pkg.dev/${var.project_id}/stemify-repo/stemify-web:latest"
      
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.stem_bucket.name
      }
      env {
        name  = "PUBSUB_TOPIC"
        value = google_pubsub_topic.demucs_jobs.id
      }
    }
  }

  depends_on = [google_project_service.required_apis]
}

# Allow public access to Frontend Web
resource "google_cloud_run_v2_service_iam_member" "web_public" {
  name     = google_cloud_run_v2_service.stemify_web.name
  location = google_cloud_run_v2_service.stemify_web.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# 6. GPU Worker Service
resource "google_cloud_run_v2_service" "stemify_worker" {
  provider = google-beta
  name         = "stemify-worker"
  location     = var.region
  ingress      = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    timeout = "3600s"
    max_instance_request_concurrency = 1
    
    containers {
      image = "us-east4-docker.pkg.dev/${var.project_id}/stemify-repo/stemify-worker:latest"
      
      resources {
        limits = {
          cpu              = "4"
          memory           = "8Gi"
        }
      }

      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.stem_bucket.name
      }

      volume_mounts {
        name       = "cookies-mount"
        mount_path = "/secrets"
      }
    }

    volumes {
      name = "cookies-mount"
      secret {
        secret = google_secret_manager_secret.ytdlp_cookies.secret_id
        items {
          version = "latest"
          path    = "cookies.txt"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
  }

  depends_on = [google_project_service.required_apis]
}

# Allow Pub/Sub to invoke the Worker
resource "google_cloud_run_v2_service_iam_member" "worker_invoker" {
  name     = google_cloud_run_v2_service.stemify_worker.name
  location = google_cloud_run_v2_service.stemify_worker.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# 7. Pub/Sub Push Subscription explicitly bound to the Worker Cloud Run URL
resource "google_pubsub_subscription" "demucs_worker_sub" {
  name  = "demucs-worker-sub"
  topic = google_pubsub_topic.demucs_jobs.name

  ack_deadline_seconds = 600

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.stemify_worker.uri}/process_pubsub"
    # Ensure PubSub uses OIDC to securely access the internal worker
    oidc_token {
      service_account_email = google_cloud_run_v2_service.stemify_worker.template[0].service_account
    }
  }

  depends_on = [google_cloud_run_v2_service.stemify_worker, google_cloud_run_v2_service_iam_member.worker_invoker]
}
