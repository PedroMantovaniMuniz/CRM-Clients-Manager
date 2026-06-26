/*
  Warnings:

  - You are about to alter the column `title` on the `contract_templates` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(120)`.
  - You are about to alter the column `description` on the `contract_templates` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `cnpjCpf` on the `contracts` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - You are about to alter the column `description` on the `steps` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(500)`.
  - You are about to alter the column `password` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.

*/
-- AlterTable
ALTER TABLE "contract_templates" ALTER COLUMN "title" SET DATA TYPE VARCHAR(120),
ALTER COLUMN "description" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "contracts" ALTER COLUMN "cnpjCpf" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "steps" ALTER COLUMN "description" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password" SET DATA TYPE VARCHAR(255);

-- CreateIndex
CREATE INDEX "contract_templates_freelancerId_idx" ON "contract_templates"("freelancerId");

-- CreateIndex
CREATE INDEX "contract_templates_freelancerId_updatedAt_idx" ON "contract_templates"("freelancerId", "updatedAt");

-- CreateIndex
CREATE INDEX "contract_templates_freelancerId_title_idx" ON "contract_templates"("freelancerId", "title");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "contracts_cancellationRequestedBy_idx" ON "contracts"("cancellationRequestedBy");

-- CreateIndex
CREATE INDEX "contracts_clientId_createdAt_idx" ON "contracts"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "contracts_freelancerId_createdAt_idx" ON "contracts"("freelancerId", "createdAt");

-- CreateIndex
CREATE INDEX "contracts_clientId_status_createdAt_idx" ON "contracts"("clientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "contracts_freelancerId_status_createdAt_idx" ON "contracts"("freelancerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "freelancer_clients_freelancerId_createdAt_idx" ON "freelancer_clients"("freelancerId", "createdAt");

-- CreateIndex
CREATE INDEX "freelancer_clients_clientId_createdAt_idx" ON "freelancer_clients"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "steps_contractId_deliveryDate_idx" ON "steps"("contractId", "deliveryDate");

-- CreateIndex
CREATE INDEX "steps_contractId_status_idx" ON "steps"("contractId", "status");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE INDEX "users_role_name_lastName_idx" ON "users"("role", "name", "lastName");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_cancellationRequestedBy_fkey" FOREIGN KEY ("cancellationRequestedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
