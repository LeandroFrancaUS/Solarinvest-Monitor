-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "PlantStatus" AS ENUM ('GREEN', 'YELLOW', 'RED', 'GREY');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'PAUSED_AUTH_ERROR', 'DISABLED_BY_OPERATOR', 'PENDING_DOCS');

-- CreateEnum
CREATE TYPE "Brand" AS ENUM ('HUAWEI', 'SOLIS', 'GOODWE', 'DELE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('OFFLINE', 'LOW_GEN', 'FAULT', 'STRING', 'VOLTAGE', 'API_ERROR');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "AlertState" AS ENUM ('NEW', 'ACKED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PollJobType" AS ENUM ('POLL', 'ALARMS', 'DAILY');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('SUCCESS', 'ERROR');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('WEB', 'IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('WEBPUSH', 'FCM', 'APNS');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "external_reference" TEXT,
    "brand" "Brand" NOT NULL,
    "status" "PlantStatus" NOT NULL DEFAULT 'GREY',
    "integration_status" "IntegrationStatus" NOT NULL DEFAULT 'PENDING_DOCS',
    "uf" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL,
    "installed_capacity_w" DOUBLE PRECISION,
    "installed_capacity_verified" BOOLEAN NOT NULL DEFAULT false,
    "alerts_silenced_until" TIMESTAMP(3),
    "owner_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_credentials" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "brand" "Brand" NOT NULL,
    "encrypted_data" TEXT NOT NULL,
    "key_version" TEXT NOT NULL DEFAULT '1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_snapshots" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "today_energy_kwh" DOUBLE PRECISION NOT NULL,
    "current_power_w" DOUBLE PRECISION,
    "grid_injection_power_w" DOUBLE PRECISION,
    "total_energy_kwh" DOUBLE PRECISION,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "source_sampled_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "state" "AlertState" NOT NULL DEFAULT 'NEW',
    "vendor_alarm_code" TEXT,
    "device_sn" TEXT,
    "message" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "cleared_at" TIMESTAMP(3),
    "last_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_logs" (
    "id" TEXT NOT NULL,
    "plant_id" TEXT NOT NULL,
    "job_type" "PollJobType" NOT NULL,
    "status" "PollStatus" NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "adapter_error_type" TEXT,
    "http_status" INTEGER,
    "safe_summary_json" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_registrations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "provider" "PushProvider" NOT NULL,
    "push_token_encrypted" TEXT NOT NULL,
    "device_info" TEXT,
    "user_agent" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "plants_status_idx" ON "plants"("status");

-- CreateIndex
CREATE INDEX "plants_brand_idx" ON "plants"("brand");

-- CreateIndex
CREATE INDEX "plants_integration_status_idx" ON "plants"("integration_status");

-- CreateIndex
CREATE INDEX "plants_owner_customer_id_idx" ON "plants"("owner_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_credentials_plant_id_brand_key" ON "integration_credentials"("plant_id", "brand");

-- CreateIndex
CREATE INDEX "metric_snapshots_date_idx" ON "metric_snapshots"("date");

-- CreateIndex
CREATE INDEX "metric_snapshots_plant_id_date_idx" ON "metric_snapshots"("plant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_snapshots_plant_id_date_key" ON "metric_snapshots"("plant_id", "date");

-- CreateIndex
CREATE INDEX "alerts_plant_id_state_idx" ON "alerts"("plant_id", "state");

-- CreateIndex
CREATE INDEX "alerts_plant_id_type_vendor_alarm_code_device_sn_state_idx" ON "alerts"("plant_id", "type", "vendor_alarm_code", "device_sn", "state");

-- CreateIndex
CREATE INDEX "poll_logs_plant_id_created_at_idx" ON "poll_logs"("plant_id", "created_at");

-- CreateIndex
CREATE INDEX "poll_logs_job_type_status_created_at_idx" ON "poll_logs"("job_type", "status", "created_at");

-- CreateIndex
CREATE INDEX "device_registrations_user_id_enabled_idx" ON "device_registrations"("user_id", "enabled");

-- CreateIndex
CREATE INDEX "device_registrations_platform_provider_idx" ON "device_registrations"("platform", "provider");

-- AddForeignKey
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_logs" ADD CONSTRAINT "poll_logs_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
