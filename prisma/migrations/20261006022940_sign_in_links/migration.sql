-- CreateTable
CREATE TABLE "SignInLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignInLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignInLink_tokenHash_key" ON "SignInLink"("tokenHash");

-- CreateIndex
CREATE INDEX "SignInLink_userId_idx" ON "SignInLink"("userId");

-- AddForeignKey
ALTER TABLE "SignInLink" ADD CONSTRAINT "SignInLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
