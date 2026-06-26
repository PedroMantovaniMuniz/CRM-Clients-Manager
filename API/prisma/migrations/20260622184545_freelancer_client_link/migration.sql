-- AlterTable
ALTER TABLE "users" ADD COLUMN     "registeredByFreelancerId" TEXT;

-- CreateTable
CREATE TABLE "freelancer_clients" (
    "id" TEXT NOT NULL,
    "freelancerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freelancer_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "freelancer_clients_clientId_idx" ON "freelancer_clients"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "freelancer_clients_freelancerId_clientId_key" ON "freelancer_clients"("freelancerId", "clientId");

-- CreateIndex
CREATE INDEX "contracts_clientId_idx" ON "contracts"("clientId");

-- CreateIndex
CREATE INDEX "contracts_freelancerId_idx" ON "contracts"("freelancerId");

-- CreateIndex
CREATE INDEX "users_registeredByFreelancerId_idx" ON "users"("registeredByFreelancerId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_registeredByFreelancerId_fkey" FOREIGN KEY ("registeredByFreelancerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freelancer_clients" ADD CONSTRAINT "freelancer_clients_freelancerId_fkey" FOREIGN KEY ("freelancerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freelancer_clients" ADD CONSTRAINT "freelancer_clients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
