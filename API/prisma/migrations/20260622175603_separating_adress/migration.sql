/*
  Warnings:

  - You are about to drop the column `addressEncrypted` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "addressEncrypted",
ADD COLUMN     "addressCityEncrypted" TEXT,
ADD COLUMN     "addressNumberEncrypted" TEXT,
ADD COLUMN     "addressStateEncrypted" TEXT,
ADD COLUMN     "addressStreetEncrypted" TEXT,
ADD COLUMN     "addressZipCodeEncrypted" TEXT;
